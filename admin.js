(() => {
  'use strict';
  const SUPABASE_URL = 'https://cvaocseqrgjstyakncnt.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_YzKP1wT4fhO-e260P7Px8A_1xc3b-Tr';
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const $ = id => document.getElementById(id);
  const CHARACTER_BUCKET = 'order-characters';
  const state = { characters:[], themes:[], editingThemeId:null };
  const INITIAL_CHARACTER_FILES = {
    '00000000-0000-4000-8000-000000000001':'Angry Chibi in Red Beanie.png',
    '00000000-0000-4000-8000-000000000002':'Cheerful Golden Retriever Avatar (1).png',
    '00000000-0000-4000-8000-000000000003':'Chibi Avatar with Heart Sunglasses.png',
    '00000000-0000-4000-8000-000000000004':'Chibi Axolotl Mascot with Blue Ear Frills.png',
    '00000000-0000-4000-8000-000000000005':'Chibi Clancy Tactical Avatar.png',
    '00000000-0000-4000-8000-000000000006':'Chibi Neon-Haired Tuxedo Avatar.png',
    '00000000-0000-4000-8000-000000000007':'Chibi Space-Bun Avatar in Striped Pullover.png',
    '00000000-0000-4000-8000-000000000008':'Hooded Bandana Mascot Avatar.png',
    '00000000-0000-4000-8000-000000000009':'Masked Rebel Avatar with Cyrillic Collar.png',
    '00000000-0000-4000-8000-000000000010':'Masked Red-Stripe Tactical Avatar.png',
    '00000000-0000-4000-8000-000000000011':'Mysterious Crimson Hooded Avatar.png',
    '00000000-0000-4000-8000-000000000012':'Stern Buzz-Cut Military Avatar.png',
    '00000000-0000-4000-8000-000000000013':'Stern Pink-Haired Chibi Avatar.png',
    '00000000-0000-4000-8000-000000000014':'Stern Red-Haired Chibi Avatar.png',
    '00000000-0000-4000-8000-000000000015':'Veiled Crimson Hooded Specter.png'
  };

  function escapeHtml(value='') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function message(text,type='success') { const el=$('global-message'); el.textContent=text; el.className=`message ${type}`; el.scrollIntoView({behavior:'smooth',block:'nearest'}); setTimeout(()=>el.classList.add('hidden'),4200); }
  function busy(button,on,label){ if(!button)return; if(on){button.dataset.label=button.textContent;button.textContent=label||'PROCESSANDO...';button.disabled=true;}else{button.textContent=button.dataset.label||button.textContent;button.disabled=false;} }

  function publicCharacterUrl(storagePath){
    if(!storagePath) return '';
    return db.storage.from(CHARACTER_BUCKET).getPublicUrl(String(storagePath)).data.publicUrl;
  }
  async function loadCharacters(){
    $('characters-grid').innerHTML='<div class="loading-card">Carregando personagens...</div>';
    const {data,error}=await db.from('order_characters').select('id,name,storage_path,active,sort_order,created_at').order('sort_order',{ascending:true}).order('created_at',{ascending:true});
    if(error){ $('characters-grid').innerHTML=`<div class="empty-card">${escapeHtml(error.message)}</div>`; return; }
    state.characters=(data||[]).map(c=>({...c,image_url:publicCharacterUrl(c.storage_path)}));
    $('character-count').textContent=state.characters.length;
    const missing=state.characters.filter(c=>!c.storage_path);
    $('legacy-migration-card').classList.toggle('hidden',missing.length===0);
    renderCharacters();
  }
  function renderCharacters(){
    const grid=$('characters-grid');
    if(!state.characters.length){grid.innerHTML='<div class="empty-card">Nenhum personagem cadastrado.</div>';return;}
    grid.innerHTML=state.characters.map((c,i)=>`<article class="character-card ${c.active?'':'inactive'} ${c.storage_path?'':'missing-storage'}" data-character="${c.id}">
      <span class="character-status">${c.active?'ATIVO':'INATIVO'}</span>
      <div class="order-actions"><button data-move="up" title="Mover para cima" ${i===0?'disabled':''}>↑</button><button data-move="down" title="Mover para baixo" ${i===state.characters.length-1?'disabled':''}>↓</button></div>
      <div class="character-image">${c.storage_path?`<img src="${escapeHtml(c.image_url)}" alt="${escapeHtml(c.name)}">`:'<div class="character-missing-storage">IMAGEM AINDA NÃO ESTÁ NO STORAGE</div>'}</div>
      <div class="character-meta"><strong title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</strong><span>posição ${i+1}</span><span class="storage-badge ${c.storage_path?'':'missing'}">${c.storage_path?'SUPABASE STORAGE':'SEM IMAGEM'}</span></div>
      <div class="card-actions"><button class="small-btn" data-action="replace-image">TROCAR IMAGEM</button><button class="small-btn" data-action="rename">RENOMEAR</button><button class="small-btn" data-action="toggle">${c.active?'DESATIVAR':'ATIVAR'}</button><button class="small-btn danger" data-action="delete">EXCLUIR</button></div>
    </article>`).join('');
  }

  async function uploadFileToStorage(file,path=null){
    if(file.size>5*1024*1024) throw new Error('A imagem deve ter no máximo 5 MB.');
    const ext=(file.name.split('.').pop()||'png').toLowerCase().replace(/[^a-z0-9]/g,'')||'png';
    const storagePath=path || `characters/${crypto.randomUUID()}.${ext}`;
    const {error}=await db.storage.from(CHARACTER_BUCKET).upload(storagePath,file,{cacheControl:'31536000',upsert:true,contentType:file.type||undefined});
    if(error) throw error;
    return storagePath;
  }
  async function uploadCharacter(file,name,active){
    const storagePath=await uploadFileToStorage(file);
    const nextOrder=(Math.max(0,...state.characters.map(c=>Number(c.sort_order)||0))+1);
    const {error:insertError}=await db.from('order_characters').insert({name,storage_path:storagePath,active,sort_order:nextOrder});
    if(insertError){ await db.storage.from(CHARACTER_BUCKET).remove([storagePath]); throw insertError; }
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
    const newPath=await uploadFileToStorage(file);
    const {error}=await db.from('order_characters').update({storage_path:newPath}).eq('id',c.id);
    if(error){ await db.storage.from(CHARACTER_BUCKET).remove([newPath]); throw error; }
    if(oldPath && oldPath!==newPath) await db.storage.from(CHARACTER_BUCKET).remove([oldPath]);
  }
  function normalizeFilename(name){ return String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  async function migrateInitialCharacters(files){
    const selected=[...files];
    const byName=new Map(selected.map(file=>[normalizeFilename(file.name),file]));
    const targets=state.characters.filter(c=>!c.storage_path && INITIAL_CHARACTER_FILES[c.id]);
    if(!targets.length) throw new Error('Não há personagens iniciais pendentes de migração.');
    const missing=[];
    for(const c of targets){ if(!byName.has(normalizeFilename(INITIAL_CHARACTER_FILES[c.id]))) missing.push(INITIAL_CHARACTER_FILES[c.id]); }
    if(missing.length) throw new Error(`Faltam ${missing.length} arquivo(s): ${missing.slice(0,3).join(', ')}${missing.length>3?'...':''}`);
    for(let i=0;i<targets.length;i++){
      const c=targets[i]; const file=byName.get(normalizeFilename(INITIAL_CHARACTER_FILES[c.id]));
      const ext=(file.name.split('.').pop()||'png').toLowerCase().replace(/[^a-z0-9]/g,'')||'png';
      const path=`characters/initial/${c.id}.${ext}`;
      await uploadFileToStorage(file,path);
      const {error}=await db.from('order_characters').update({storage_path:path}).eq('id',c.id);
      if(error) throw error;
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
    if(c.storage_path) await db.storage.from(CHARACTER_BUCKET).remove([c.storage_path]);
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

  document.addEventListener('DOMContentLoaded', async () => {
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
    $('legacy-character-files').addEventListener('change',()=>{
      const count=$('legacy-character-files').files?.length||0;
      $('legacy-files-label').textContent=count?`${count} arquivo(s) selecionado(s)`:'Selecione os arquivos originais';
    });
    $('migrate-legacy-characters').addEventListener('click',async()=>{
      const files=$('legacy-character-files').files;
      if(!files?.length){ message('Selecione os arquivos dos personagens antes de migrar.','error'); return; }
      const btn=$('migrate-legacy-characters'); busy(btn,true,'MIGRANDO...');
      try{ await migrateInitialCharacters(files); $('legacy-character-files').value=''; $('legacy-files-label').textContent='Selecione os arquivos originais'; await loadCharacters(); message('Personagens migrados para o Supabase Storage.'); }
      catch(err){ message(err.message||'Não foi possível concluir a migração.','error'); }
      finally{ busy(btn,false); }
    });
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
    await Promise.all([loadCharacters(), loadThemes()]);
  });
})();
