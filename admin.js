(() => {
  'use strict';
  const SUPABASE_URL = 'https://cvaocseqrgjstyakncnt.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_YzKP1wT4fhO-e260P7Px8A_1xc3b-Tr';
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const $ = id => document.getElementById(id);
  const MEDIA_URL = 'https://audio.altigames.com.br';
  const WORKER_URL = 'https://altigames-media-api.julia-correa-souza.workers.dev';
  function r2Path(path){
    const value = String(path || '').replace(/^\/+/, '');
    return value.startsWith('order/') ? value : `order/${value}`;
  }

  const state = { characters:[], themes:[], editingThemeId:null };


  function escapeHtml(value='') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function message(text,type='success') { const el=$('global-message'); el.textContent=text; el.className=`message ${type}`; el.scrollIntoView({behavior:'smooth',block:'nearest'}); setTimeout(()=>el.classList.add('hidden'),4200); }
  function busy(button,on,label){ if(!button)return; if(on){button.dataset.label=button.textContent;button.textContent=label||'PROCESSANDO...';button.disabled=true;}else{button.textContent=button.dataset.label||button.textContent;button.disabled=false;} }

  function publicCharacterUrl(storagePath){
    if (!storagePath) return '';
    return `${MEDIA_URL}/${r2Path(storagePath)}`;
  }
  async function authToken(){
    const { data, error } = await db.auth.getSession();
    const token = data?.session?.access_token;
    if (error || !token) throw new Error('Sessão expirada. Entre novamente no painel.');
    return token;
  }
  async function mediaRequest(url, opts = {}){
    const token = await authToken();
    const response = await fetch(url, {
      ...opts,
      headers: { ...opts.headers, Authorization: `Bearer ${token}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || `Erro de mídia HTTP ${response.status}`);
    return data;
  }
  async function uploadFileToR2(file){
    if (!file || file.size <= 0 || file.size > 5 * 1024 * 1024)
      throw new Error('A imagem deve ter entre 1 byte e 5 MB.');
    const form = new FormData();
    form.append('file', file);
    form.append('game', 'order');
    const result = await mediaRequest(`${WORKER_URL}/upload`, { method:'POST', body: form });
    if (!/^order\/characters\/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$/i.test(result.key || ''))
      throw new Error('O Worker retornou um caminho inesperado.');
    return result.key;
  }
  function canDeleteFromR2(path){
    return /^order\/characters\/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$/i.test(r2Path(path || ''));
  }
  async function deleteFileFromR2(path){
    if (!canDeleteFromR2(path)) return; // originais initial protegidos
    await mediaRequest(`${WORKER_URL}/file?key=${encodeURIComponent(r2Path(path))}`, { method:'DELETE' });
  }
  async function loadCharacters(){
    $('characters-grid').innerHTML='<div class="loading-card">Carregando personagens...</div>';
    const {data,error}=await db.from('order_characters').select('id,name,storage_path,active,sort_order,created_at').order('sort_order',{ascending:true}).order('created_at',{ascending:true});
    if(error){ $('characters-grid').innerHTML=`<div class="empty-card">${escapeHtml(error.message)}</div>`; return; }
    state.characters=(data||[]).map(c=>({...c,image_url:publicCharacterUrl(c.storage_path)}));
    $('character-count').textContent=state.characters.length;
    const missing=state.characters.filter(c=>!c.storage_path);

    renderCharacters();
  }
  function renderCharacters(){
    const grid=$('characters-grid');
    if(!state.characters.length){grid.innerHTML='<div class="empty-card">Nenhum personagem cadastrado.</div>';return;}
    grid.innerHTML=state.characters.map((c,i)=>`<article class="character-card ${c.active?'':'inactive'} ${c.storage_path?'':'missing-storage'}" data-character="${c.id}">
      <span class="character-status">${c.active?'ATIVO':'INATIVO'}</span>
      <div class="order-actions"><button data-move="up" title="Mover para cima" ${i===0?'disabled':''}>↑</button><button data-move="down" title="Mover para baixo" ${i===state.characters.length-1?'disabled':''}>↓</button></div>
      <div class="character-image">${c.storage_path?`<img src="${escapeHtml(c.image_url)}" alt="${escapeHtml(c.name)}">`:'<div class="character-missing-storage">IMAGEM AINDA NÃO ESTÁ NO STORAGE</div>'}</div>
      <div class="character-meta"><strong title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</strong><span>posição ${i+1}</span><span class="storage-badge ${c.storage_path?'':'missing'}">${c.storage_path?'CLOUDFLARE R2':'SEM IMAGEM'}</span></div>
      <div class="card-actions"><button class="small-btn" data-action="replace-image">TROCAR IMAGEM</button><button class="small-btn" data-action="rename">RENOMEAR</button><button class="small-btn" data-action="toggle">${c.active?'DESATIVAR':'ATIVAR'}</button><button class="small-btn danger" data-action="delete">EXCLUIR</button></div>
    </article>`).join('');
  }

  async function uploadCharacter(file,name,active){
    const storagePath=await uploadFileToR2(file);
    const nextOrder=(Math.max(0,...state.characters.map(c=>Number(c.sort_order)||0))+1);
    const {error:insertError}=await db.from('order_characters').insert({name,storage_path:storagePath,active,sort_order:nextOrder});
    if(insertError){
      try { await deleteFileFromR2(storagePath); } catch(cleanupError){ console.error('Falha ao limpar imagem não utilizada:',cleanupError); }
      throw insertError;
    }
  }
  function pickImageFile(){
    return new Promise(resolve=>{
      const input=document.createElement('input'); input.type='file'; input.accept='image/png,image/jpeg,image/webp';
      input.addEventListener('change',()=>resolve(input.files?.[0]||null),{once:true}); input.click();
    });
  }
  async function replaceCharacterImage(c){
    const file=await pickImageFile(); if(!file)return;
    const oldPath=c.storage_path||null;
    const newPath=await uploadFileToR2(file);
    const {error}=await db.from('order_characters').update({storage_path:newPath}).eq('id',c.id);
    if(error){
      try { await deleteFileFromR2(newPath); } catch(cleanupError){ console.error('Falha ao limpar imagem não utilizada:',cleanupError); }
      throw error;
    }
    // Preservar imagens históricas se houver falha de limpeza.
    if(oldPath && oldPath!==newPath && canDeleteFromR2(oldPath)){
      try { await deleteFileFromR2(oldPath); } catch(cleanupError){ console.warn('Imagem antiga permanece no R2:',cleanupError); }
    }
  }

  async function renameCharacter(c){
    const name=prompt('Novo nome do personagem:',c.name); if(name===null)return; const trimmed=name.trim(); if(!trimmed)return;
    const {error}=await db.from('order_characters').update({name:trimmed}).eq('id',c.id); if(error)throw error;
  }
  async function toggleCharacter(c){ const {error}=await db.from('order_characters').update({active:!c.active}).eq('id',c.id); if(error)throw error; }
  async function deleteCharacter(c){
    if(!confirm(`Excluir definitivamente "${c.name}"?\n\nSe ele já tiver sido usado por jogadores antigos, o histórico continuará existindo, mas sem vínculo com esse personagem.`))return;
    const {error}=await db.from('order_characters').delete().eq('id',c.id); if(error)throw error;
    if(c.storage_path && canDeleteFromR2(c.storage_path)) {
      try { await deleteFileFromR2(c.storage_path); } catch(err) { console.warn('Imagem órfã no R2; registro excluído:', err); }
    }
  }
  async function moveCharacter(c,direction){
    const idx=state.characters.findIndex(x=>x.id===c.id); const swapIdx=direction==='up'?idx-1:idx+1; if(swapIdx<0||swapIdx>=state.characters.length)return;
    const other=state.characters[swapIdx]; const a=Number(c.sort_order)||idx+1; const b=Number(other.sort_order)||swapIdx+1;
    const results=await Promise.all([db.from('order_characters').update({sort_order:b}).eq('id',c.id),db.from('order_characters').update({sort_order:a}).eq('id',other.id)]);
    const err=results.find(r=>r.error)?.error; if(err)throw err;
  }

  async function loadThemes(){
    $('themes-list').innerHTML='<div class="loading-card">Carregando temas...</div>';
    const {data,error}=await db.from('order_themes').select('id,text,active,created_at').order('created_at',{ascending:false});
    if(error){ $('themes-list').innerHTML=`<div class="empty-card">${escapeHtml(error.message)}</div>`; return; }
    state.themes=data||[]; $('theme-count').textContent=state.themes.length; renderThemes();
  }
  function renderThemes(){
    const list=$('themes-list'); if(!state.themes.length){list.innerHTML='<div class="empty-card">Nenhum tema cadastrado.</div>';return;}
    list.innerHTML=state.themes.map((t,i)=>`<article class="theme-row ${t.active?'':'inactive'}" data-theme="${t.id}"><div class="theme-index">${String(state.themes.length-i).padStart(2,'0')}</div><div><div class="theme-text">${escapeHtml(t.text)}</div><div class="theme-meta">${t.active?'ATIVO · ENTRA NO SORTEIO':'INATIVO · FORA DO SORTEIO'}</div></div><div class="theme-actions"><button class="small-btn" data-theme-action="edit">EDITAR</button><button class="small-btn" data-theme-action="toggle">${t.active?'DESATIVAR':'ATIVAR'}</button><button class="small-btn danger" data-theme-action="delete">EXCLUIR</button></div></article>`).join('');
  }
  function setThemeEdit(theme=null){
    state.editingThemeId=theme?.id||null; $('theme-text').value=theme?.text||''; $('theme-active').checked=theme?!!theme.active:true; updateThemeCount();
    $('theme-form-kicker').textContent=theme?'✎ EDITAR TEMA':'＋ NOVO TEMA'; $('theme-form-title').textContent=theme?'Atualizar carta':'Adicionar carta'; $('theme-submit').textContent=theme?'SALVAR ALTERAÇÕES':'ADICIONAR TEMA'; $('cancel-theme-edit').classList.toggle('hidden',!theme);
    if(theme) $('theme-text').focus();
  }
  function updateThemeCount(){ $('theme-char-count').textContent=$('theme-text').value.length; }
  async function saveTheme(text,active){
    if(state.editingThemeId){ const {error}=await db.from('order_themes').update({text,active}).eq('id',state.editingThemeId); if(error)throw error; }
    else { const {error}=await db.from('order_themes').insert({text,active}); if(error)throw error; }
  }

  async function isAdmin(){
    const {data:{user},error}=await db.auth.getUser();
    if(error || !user) return false;
    const result=await db.from('altigames_admins').select('user_id').eq('user_id',user.id).limit(1);
    if(result.error) throw result.error;
    return result.data?.length === 1;
  }
  document.addEventListener('DOMContentLoaded', async () => {
    const loginView=$('login-view');
    const dashboard=$('dashboard-view');
    async function showDashboard(){
      const allowed=await isAdmin();
      dashboard.classList.toggle('hidden',!allowed);
      loginView.classList.toggle('hidden',allowed);
      if(allowed) {
        $('admin-identity').textContent=(await db.auth.getUser()).data.user?.email||'Administrador';
        await Promise.all([loadCharacters(),loadThemes()]);
      } else {
        $('login-error').textContent='Entre com uma conta administrativa autorizada.';
      }
    }
    $('login-form').addEventListener('submit',async e=>{
      e.preventDefault();
      const button=$('login-button'); busy(button,true,'ENTRANDO...');
      $('login-error').textContent='';
      try {
        const {error}=await db.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value});
        if(error) throw error;
        const authorized=await isAdmin();
        if(!authorized){await db.auth.signOut();throw new Error('Conta sem permissão de administrador.');}
        await showDashboard();
      } catch(error){$('login-error').textContent=error.message||'Não foi possível entrar.';}
      finally{busy(button,false);}
    });
    $('logout-button').addEventListener('click',async()=>{await db.auth.signOut();dashboard.classList.add('hidden');loginView.classList.remove('hidden');$('login-password').value='';});
    try{await showDashboard();}catch(error){
      dashboard.classList.add('hidden');loginView.classList.remove('hidden');$('login-error').textContent=error.message||'Erro ao verificar permissões.';
    }

    document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b === btn));
      $('characters-tab').classList.toggle('hidden', btn.dataset.tab !== 'characters');
      $('themes-tab').classList.toggle('hidden', btn.dataset.tab !== 'themes');
    }));

    $('character-file').addEventListener('change', () => {
      const file = $('character-file').files?.[0];
      if (!file) {
        $('character-preview').classList.add('hidden');
        return;
      }
      const url = URL.createObjectURL(file);
      $('character-preview').src = url;
      $('character-preview').classList.remove('hidden');
    });

    $('character-form').addEventListener('submit', async e => {
      e.preventDefault();
      const file = $('character-file').files?.[0];
      if (!file) return;
      const btn = $('character-submit');
      busy(btn, true, 'ENVIANDO...');
      try {
        await uploadCharacter(file, $('character-name').value.trim(), $('character-active').checked);
        e.target.reset();
        $('character-active').checked = true;
        $('character-preview').classList.add('hidden');
        await loadCharacters();
        message('Personagem adicionado com sucesso.');
      } catch (err) {
        message(err.message || 'Não foi possível adicionar o personagem.', 'error');
      } finally {
        busy(btn, false);
      }
    });

    $('characters-grid').addEventListener('click', async e => {
      const card = e.target.closest('[data-character]');
      if (!card) return;
      const c = state.characters.find(x => x.id === card.dataset.character);
      if (!c) return;
      const action = e.target.dataset.action;
      const move = e.target.dataset.move;
      if (!action && !move) return;
      try {
        if (action === 'replace-image') await replaceCharacterImage(c);
        if (action === 'rename') await renameCharacter(c);
        if (action === 'toggle') await toggleCharacter(c);
        if (action === 'delete') await deleteCharacter(c);
        if (move) await moveCharacter(c, move);
        await loadCharacters();
      } catch (err) {
        message(err.message || 'Operação não concluída.', 'error');
      }
    });

    $('refresh-characters').addEventListener('click', loadCharacters);
    $('theme-text').addEventListener('input', updateThemeCount);

    $('theme-form').addEventListener('submit', async e => {
      e.preventDefault();
      const text = $('theme-text').value.trim();
      if (!text) return;
      const btn = $('theme-submit');
      busy(btn, true, 'SALVANDO...');
      try {
        const wasEditing = !!state.editingThemeId;
        await saveTheme(text, $('theme-active').checked);
        setThemeEdit();
        await loadThemes();
        message(wasEditing ? 'Tema atualizado.' : 'Tema salvo com sucesso.');
      } catch (err) {
        message(err.message || 'Não foi possível salvar o tema.', 'error');
      } finally {
        busy(btn, false);
      }
    });

    $('cancel-theme-edit').addEventListener('click', () => setThemeEdit());

    $('themes-list').addEventListener('click', async e => {
      const row = e.target.closest('[data-theme]');
      if (!row) return;
      const theme = state.themes.find(x => String(x.id) === String(row.dataset.theme));
      if (!theme) return;
      const action = e.target.dataset.themeAction;
      if (!action) return;
      try {
        if (action === 'edit') {
          setThemeEdit(theme);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        if (action === 'toggle') {
          const { error } = await db.from('order_themes').update({ active: !theme.active }).eq('id', theme.id);
          if (error) throw error;
        }
        if (action === 'delete') {
          if (!confirm(`Excluir definitivamente este tema?\n\n${theme.text}`)) return;
          const { error } = await db.from('order_themes').delete().eq('id', theme.id);
          if (error) throw error;
        }
        await loadThemes();
      } catch (err) {
        message(err.message || 'Operação não concluída.', 'error');
      }
    });

    $('refresh-themes').addEventListener('click', loadThemes);
  });
})();
