(() => {
  'use strict';

  const SUPABASE_URL = 'https://cvaocseqrgjstyakncnt.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_YzKP1wT4fhO-e260P7Px8A_1xc3b-Tr';
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: { params: { eventsPerSecond: 20 } }
  });

  const COLORS = ['#FF4D6D','#FF9F1C','#FFD60A','#2DD4BF','#3B82F6','#8B5CF6','#EC4899','#22C55E','#F97316','#06B6D4','#A855F7','#84CC16'];
  const FALLBACK_THEMES = [
    'Quanto % esta seu celular','Quanto tempo passou no instagram hoje em minutos','quantos anos você tinha quando perdeu o BV?',
    'Quantas fotos voce tirou esse mes?','Quanto % do dia voce acha que passa sentado?','Quantas abas estão abertas no navegador do seu celular agora?',
    'Quantas pessoas estão na sua lista de Melhores Amigos do Instagram?','quantas pessoas voce segue no instagram','qual foi a maior quantidade de tempo que passou viajando em dias?',
    'Quantas pessoas teria na sua lista de casamento hoje?','Qual o valor da sua ultima compra?','Quanto tempo durou seu relacionamento mais longo em meses?',
    'quantos grupos do whatsapp voce faz parte?','quanto tempo durou a ultima ligação do whatsapp que voce fez em minutos?',
    'Quanto tempo durou seu relacionamento mais curto em meses?','Quantos eps tem a série mais longa que você já assistiu?'
  ];

  const $ = (id) => document.getElementById(id);
  const state = {
    mode: null,
    room: null,
    hostToken: null,
    player: null,
    playerToken: null,
    pendingRoom: null,
    players: [],
    themes: [],
    themeDeck: [],
    themeIndex: 0,
    selectedTheme: null,
    round: null,
    responseSeconds: 30,
    channels: [],
    timerInterval: null,
    sortable: null,
    revealBusy: false
  };

  const audio = {
    correct: new Audio('assets/audio/correct.mp3'),
    lose: new Audio('assets/audio/gameover.mp3'),
    tick: new Audio('assets/audio/countdown.mp3'),
    start: new Audio('assets/audio/turn-start-whistle.mp3')
  };
  Object.values(audio).forEach(a => { a.volume = .55; a.preload = 'auto'; });

  function playSound(name){ try { const a = audio[name]; if(!a) return; a.currentTime = 0; a.play().catch(()=>{}); } catch(_){} }
  function uuid(){ return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16)}); }
  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
  function show(id){ document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); $(id).classList.add('active'); window.scrollTo(0,0); }
  function showError(id, message){ const el=$(id); el.textContent=message; el.classList.remove('hidden'); }
  function clearError(id){ const el=$(id); if(el){el.textContent='';el.classList.add('hidden');} }
  function toast(message, ms=2200){ const el=$('toast'); el.textContent=message; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.add('hidden'),ms); }
  function escapeHtml(v){ return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function formatValue(v){ const n=Number(v); if(Number.isInteger(n)) return String(n); return String(n).replace('.',','); }
  function normalizeNumber(raw){ const text=String(raw??'').trim().replace(',','.'); if(!text || !/^[-+]?\d*(?:\.\d+)?$/.test(text)) return null; const n=Number(text); return Number.isFinite(n)?n:null; }
  function shuffled(arr){ const copy=[...arr]; for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];} return copy; }
  function initials(name){ return String(name||'?').trim().slice(0,1).toUpperCase(); }

  async function removeChannels(){
    state.channels.forEach(ch=>{ try{db.removeChannel(ch);}catch(_){} });
    state.channels=[];
    if(state.timerInterval){clearInterval(state.timerInterval);state.timerInterval=null;}
  }

  async function goHome(message){
    await removeChannels();
    if(state.sortable){try{state.sortable.destroy();}catch(_){} state.sortable=null;}
    state.mode=null; state.room=null; state.player=null; state.round=null; state.pendingRoom=null;
    show('home-screen');
    if(message) toast(message,3200);
  }

  async function loadThemes(){
    const {data,error}=await db.from('order_themes').select('id,text').eq('active',true).order('created_at');
    if(error || !data?.length){
      state.themes=FALLBACK_THEMES.map((text,i)=>({id:null,text,_fallback:i}));
    } else state.themes=data;
    state.themeDeck=shuffled(state.themes);
    state.themeIndex=0;
  }

  function pickNextTheme(){
    if(!state.themeDeck.length) state.themeDeck=shuffled(state.themes);
    if(state.themeIndex>=state.themeDeck.length){ state.themeDeck=shuffled(state.themes); state.themeIndex=0; }
    state.selectedTheme=state.themeDeck[state.themeIndex++];
    $('host-theme-text').textContent=state.selectedTheme?.text || 'Sem tema disponível';
  }

  async function createRoom(){
    clearError('setup-error');
    const btn=$('create-room-button'); btn.disabled=true;
    state.hostToken=uuid();
    try{
      let room=null;
      for(let attempt=0;attempt<8 && !room;attempt++){
        const code=String(Math.floor(100000+Math.random()*900000));
        const {data,error}=await db.from('order_rooms').insert({code,host_token:state.hostToken,status:'lobby',response_seconds:state.responseSeconds}).select().single();
        if(!error) room=data;
        else if(error.code!=='23505') throw error;
      }
      if(!room) throw new Error('Não foi possível gerar um código de sala.');
      state.room=room; state.mode='host';
      await loadThemes();
      await subscribeHost();
      await refreshPlayers();
      renderHostLobby();
      show('host-lobby-screen');
    }catch(err){ showError('setup-error','Não consegui criar a partida. Confirme se você executou o SQL do Supabase.'); console.error(err); }
    finally{ btn.disabled=false; }
  }

  async function subscribeHost(){
    await removeChannels();
    const roomId=state.room.id;
    const roomCh=db.channel(`order-room-db-${roomId}`)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'order_rooms',filter:`id=eq.${roomId}`},payload=>{state.room=payload.new;})
      .on('postgres_changes',{event:'*',schema:'public',table:'order_players',filter:`room_id=eq.${roomId}`},async()=>{await refreshPlayers(); renderHostForStatus();})
      .subscribe();
    state.channels.push(roomCh);

    const presence=db.channel(`order-presence-${state.room.code}`,{config:{presence:{key:`host-${state.room.id}`}}});
    presence.on('presence',{event:'sync'},()=>scheduleDisconnectedCleanup(presence));
    presence.subscribe(async status=>{ if(status==='SUBSCRIBED') await presence.track({role:'host',roomId:state.room.id,at:Date.now()}); });
    state.channels.push(presence);
  }

  let cleanupTimer=null;
  function scheduleDisconnectedCleanup(channel){
    clearTimeout(cleanupTimer);
    cleanupTimer=setTimeout(async()=>{
      if(state.mode!=='host' || !state.room) return;
      const presenceState=channel.presenceState();
      const presentIds=new Set();
      Object.values(presenceState).flat().forEach(p=>{ if(p.role==='player'&&p.playerId)presentIds.add(p.playerId); });
      const now=Date.now();
      const gone=state.players.filter(p=>!presentIds.has(p.id) && now-new Date(p.joined_at).getTime()>7000);
      for(const p of gone){
        await db.from('order_players').delete().eq('id',p.id).eq('room_id',state.room.id);
      }
    },1800);
  }

  async function refreshPlayers(){
    if(!state.room) return;
    const {data}=await db.from('order_players').select('*').eq('room_id',state.room.id).order('joined_at');
    state.players=data||[];
  }

  function renderHostLobby(){
    $('host-room-code').textContent=state.room.code;
    $('lobby-time').textContent=`${state.room.response_seconds}s`;
    renderLobbyPlayers();
  }

  function renderLobbyPlayers(){
    const list=$('host-player-list'); const count=state.players.length;
    $('player-count').textContent=`${count} ${count===1?'jogador':'jogadores'}`;
    $('start-match-button').disabled=count<2;
    $('lobby-min-message').textContent=count<2?'Entre pelo menos 2 jogadores.':'Tudo pronto quando vocês estiverem!';
    if(!count){ list.className='host-player-list empty-state'; list.innerHTML='<p>Os jogadores aparecerão aqui.</p>'; return; }
    list.className='host-player-list';
    list.innerHTML=state.players.map(p=>`<div class="lobby-player-card"><span class="player-color-dot" style="background:${p.color}"></span><strong>${escapeHtml(p.name)}</strong><button class="kick-player" data-kick="${p.id}" title="Expulsar jogador">×</button></div>`).join('');
    list.querySelectorAll('[data-kick]').forEach(btn=>btn.addEventListener('click',()=>kickPlayer(btn.dataset.kick)));
  }

  async function kickPlayer(playerId){
    const p=state.players.find(x=>x.id===playerId); if(!p) return;
    if(!confirm(`Expulsar ${p.name} da partida?`)) return;
    const presence=state.channels.find(ch=>ch.topic?.includes('order-presence-'));
    try{await presence?.send({type:'broadcast',event:'kick',payload:{playerId}});}catch(_){}
    await db.from('order_players').delete().eq('id',playerId).eq('room_id',state.room.id);
    await refreshPlayers(); renderLobbyPlayers();
  }

  async function closeRoom(){
    if(!state.room){goHome();return;}
    if(!confirm('Encerrar esta sala e voltar ao início?')) return;
    await db.from('order_rooms').update({status:'closed'}).eq('id',state.room.id);
    await db.from('order_rooms').delete().eq('id',state.room.id);
    goHome('Sala encerrada.');
  }

  async function startMatch(){
    if(state.players.length<2) return;
    await db.from('order_rooms').update({status:'selecting_theme',round_number:0,current_theme_id:null,current_theme_text:null,current_round_id:null,deadline:null}).eq('id',state.room.id);
    state.room.status='selecting_theme'; state.room.round_number=0;
    pickNextTheme();
    $('host-round-number').textContent='1';
    show('host-theme-screen');
  }

  async function playSelectedTheme(){
    if(!state.selectedTheme || !state.room) return;
    const roundNo=(state.room.round_number||0)+1;
    const deadline=new Date(Date.now()+state.room.response_seconds*1000).toISOString();
    const {data:round,error}=await db.from('order_rounds').insert({
      room_id:state.room.id,theme_id:state.selectedTheme.id||null,theme_text:state.selectedTheme.text,round_number:roundNo,status:'answering',deadline
    }).select().single();
    if(error){toast('Erro ao iniciar a carta.');console.error(error);return;}
    await db.from('order_players').update({answer_round_id:null}).eq('room_id',state.room.id);
    const {data:room}=await db.from('order_rooms').update({status:'answering',current_theme_id:state.selectedTheme.id||null,current_theme_text:state.selectedTheme.text,current_round_id:round.id,round_number:roundNo,deadline}).eq('id',state.room.id).select().single();
    state.round=round; state.room=room;
    playSound('start');
    await refreshPlayers(); renderAnswering(); show('host-answering-screen'); startHostTimer();
  }

  function renderAnswering(){
    $('answer-round-number').textContent=state.room.round_number;
    $('answering-theme').textContent=state.room.current_theme_text;
    const grid=$('answer-status-grid');
    grid.innerHTML=state.players.map(p=>`<div class="answer-status-card ${p.answer_round_id===state.room.current_round_id?'answered':'waiting'}"><span class="dot" style="background:${p.color}"></span><strong>${escapeHtml(p.name)}</strong></div>`).join('');
  }

  function renderHostForStatus(){
    if(!state.room) return;
    if(state.room.status==='lobby') renderLobbyPlayers();
    if(state.room.status==='answering') renderAnswering();
  }

  function startHostTimer(){
    if(state.timerInterval) clearInterval(state.timerInterval);
    let lastTick=null;
    const run=async()=>{
      if(!state.room?.deadline) return;
      const remaining=Math.max(0,Math.ceil((new Date(state.room.deadline).getTime()-Date.now())/1000));
      $('host-timer').textContent=remaining;
      if(remaining<=5 && remaining>0 && lastTick!==remaining){ playSound('tick'); lastTick=remaining; }
      if(remaining<=0){ clearInterval(state.timerInterval); state.timerInterval=null; await finishAnswers(); }
    };
    run(); state.timerInterval=setInterval(run,250);
  }

  async function finishAnswers(){
    if(!state.room || state.room.status!=='answering') return;
    if(state.timerInterval){clearInterval(state.timerInterval);state.timerInterval=null;}
    await refreshPlayers();
    const {data:answers,error}=await db.from('order_answers').select('player_id').eq('round_id',state.room.current_round_id);
    if(error){toast('Não consegui carregar as respostas.');return;}
    await db.from('order_rounds').update({status:'ordering'}).eq('id',state.room.current_round_id);
    const {data:room}=await db.from('order_rooms').update({status:'ordering',deadline:null}).eq('id',state.room.id).select().single();
    state.room=room;
    const responded=new Set((answers||[]).map(a=>a.player_id));
    renderOrdering(responded);
    show('host-ordering-screen');
  }

  function renderOrdering(responded){
    $('order-round-number').textContent=state.room.round_number;
    $('ordering-theme').textContent=state.room.current_theme_text;
    const responders=state.players.filter(p=>responded.has(p.id));
    const missing=state.players.filter(p=>!responded.has(p.id));
    const wrap=$('sortable-player-cards');
    wrap.innerHTML=responders.map((p,i)=>orderCardHtml(p,i+1,false)).join('');
    updateCardPositions(wrap);
    const note=$('missing-answer-note');
    if(missing.length){note.textContent=`Sem resposta nesta carta: ${missing.map(p=>p.name).join(', ')}. Eles ficam fora desta ordenação.`;note.classList.remove('hidden');}else note.classList.add('hidden');
    $('reveal-button').disabled=responders.length<2;
    if(state.sortable){try{state.sortable.destroy();}catch(_){} }
    state.sortable=window.Sortable.create(wrap,{animation:180,delay:70,delayOnTouchOnly:true,touchStartThreshold:5,ghostClass:'sortable-ghost',chosenClass:'sortable-chosen',onEnd:()=>updateCardPositions(wrap)});
  }

  function orderCardHtml(p,pos,revealed,value){
    return `<div class="order-card${revealed?' revealed':''}" data-player-id="${p.id}" data-position="${pos}" style="--player-color:${p.color}"><span class="drag-handle">•••</span><span class="order-dot"></span><strong>${escapeHtml(p.name)}</strong><div class="secret-value">${revealed?escapeHtml(formatValue(value)):'?'}</div></div>`;
  }
  function updateCardPositions(wrap){ [...wrap.children].forEach((el,i)=>el.dataset.position=String(i+1)); }

  async function revealResults(){
    if(state.revealBusy) return; state.revealBusy=true;
    $('reveal-button').disabled=true;
    const orderedIds=[...$('sortable-player-cards').children].map(el=>el.dataset.playerId);
    const {data:answers,error}=await db.from('order_answers').select('player_id,value').eq('round_id',state.room.current_round_id);
    if(error){state.revealBusy=false;toast('Erro ao revelar respostas.');return;}
    const map=new Map((answers||[]).map(a=>[a.player_id,Number(a.value)]));
    const actualPlayers=orderedIds.map(id=>state.players.find(p=>p.id===id)).filter(Boolean);
    const values=orderedIds.map(id=>map.get(id));
    const success=values.every((v,i)=>i===0 || values[i-1]<=v);
    const correctOrder=[...orderedIds].sort((a,b)=>map.get(a)-map.get(b));
    await db.from('order_rounds').update({status:'revealing',host_order:orderedIds,correct_order:correctOrder,success}).eq('id',state.room.current_round_id);
    const {data:room}=await db.from('order_rooms').update({status:'revealing'}).eq('id',state.room.id).select().single(); state.room=room;

    $('result-round-number').textContent=state.room.round_number;
    $('result-theme').textContent=state.room.current_theme_text;
    $('result-headline').textContent='VAMOS REVELAR!'; $('result-badge').textContent='...';
    $('result-message').className='result-message hidden'; $('next-card-button').classList.add('hidden');
    const out=$('result-player-cards'); out.innerHTML=actualPlayers.map((p,i)=>orderCardHtml(p,i+1,false)).join('');
    show('host-result-screen');
    for(let i=0;i<actualPlayers.length;i++){
      await sleep(650);
      const card=out.children[i]; card.classList.add('revealed'); card.querySelector('.secret-value').textContent=formatValue(values[i]);
    }
    await sleep(500);
    [...out.children].forEach((card,i)=>{
      const bad=(i>0&&values[i-1]>values[i]) || (i<values.length-1&&values[i]>values[i+1]);
      card.classList.add(bad?'bad-position':'good-position');
    });
    const msg=$('result-message'); msg.classList.remove('hidden');
    $('result-headline').textContent=success?'VOCÊS ACERTARAM!':'QUASE! A ORDEM ESCAPOU';
    $('result-badge').textContent=success?'ACERTOU!':'ERROU';
    $('result-badge').style.background=success?'#15803d':'#b91c1c';
    msg.classList.add(success?'win':'lose'); msg.textContent=success?'🏆 Ordem perfeita!':'😅 Algum número ficou fora de ordem.';
    document.querySelector('.result-header').classList.add(success?'win':'lose');
    playSound(success?'correct':'lose');
    await db.from('order_rounds').update({status:'result',finished_at:new Date().toISOString()}).eq('id',state.room.current_round_id);
    const {data:resultRoom}=await db.from('order_rooms').update({status:'result'}).eq('id',state.room.id).select().single(); state.room=resultRoom;
    $('next-card-button').classList.remove('hidden'); state.revealBusy=false;
  }

  async function nextCard(){
    document.querySelector('.result-header').classList.remove('win','lose');
    $('result-badge').removeAttribute('style');
    const {data:room}=await db.from('order_rooms').update({status:'selecting_theme',current_theme_id:null,current_theme_text:null,current_round_id:null,deadline:null}).eq('id',state.room.id).select().single();
    state.room=room; state.round=null; pickNextTheme(); $('host-round-number').textContent=(state.room.round_number||0)+1; show('host-theme-screen');
  }

  // PLAYER
  async function lookupRoom(){
    clearError('home-error');
    const code=$('join-code').value.replace(/\D/g,'').slice(0,6); $('join-code').value=code;
    if(code.length!==6){showError('home-error','Digite o código de 6 números.');return;}
    const {data,error}=await db.from('order_rooms').select('*').eq('code',code).neq('status','closed').maybeSingle();
    if(error || !data){showError('home-error','Não encontrei essa partida. Confira o código.');return;}
    if(data.status!=='lobby'){showError('home-error','Essa partida já começou. Peça ao host para criar uma nova sala.');return;}
    state.pendingRoom=data; state.room=data; state.mode='player';
    $('player-room-code').textContent=code; $('player-name').value='';
    await renderColorPicker(); show('player-profile-screen');
  }

  async function renderColorPicker(selected){
    const {data}=await db.from('order_players').select('id,color').eq('room_id',state.room.id);
    const taken=new Set((data||[]).filter(p=>p.id!==state.player?.id).map(p=>p.color.toUpperCase()));
    const current=selected || state.player?.color || COLORS.find(c=>!taken.has(c.toUpperCase())) || COLORS[0];
    const grid=$('player-color-grid');
    grid.innerHTML=COLORS.map(c=>`<button type="button" class="color-option ${c===current?'selected':''} ${taken.has(c.toUpperCase())?'taken':''}" data-color="${c}" style="--c:${c}" ${taken.has(c.toUpperCase())?'disabled':''} aria-label="Cor ${c}"></button>`).join('');
    grid.dataset.selected=current;
    grid.querySelectorAll('.color-option:not(.taken)').forEach(btn=>btn.addEventListener('click',()=>{
      grid.querySelectorAll('.color-option').forEach(b=>b.classList.remove('selected')); btn.classList.add('selected'); grid.dataset.selected=btn.dataset.color;
    }));
  }

  async function joinRoom(){
    clearError('player-profile-error');
    const name=$('player-name').value.trim(); const color=$('player-color-grid').dataset.selected;
    if(!name){showError('player-profile-error','Digite seu nome.');return;}
    if(!color){showError('player-profile-error','Escolha uma cor.');return;}
    const {data:existing}=await db.from('order_players').select('id,color').eq('room_id',state.room.id);
    if((existing||[]).some(p=>p.id!==state.player?.id&&p.color.toUpperCase()===color.toUpperCase())){showError('player-profile-error','Essa cor acabou de ser escolhida por outra pessoa. Escolha outra.');await renderColorPicker(color);return;}
    if(state.player){
      const {data,error}=await db.from('order_players').update({name,color}).eq('id',state.player.id).select().single();
      if(error){showError('player-profile-error','Não consegui salvar as alterações.');return;} state.player=data; renderPlayerWaiting(); show('player-wait-screen'); return;
    }
    state.playerToken=uuid();
    const {data,error}=await db.from('order_players').insert({room_id:state.room.id,player_token:state.playerToken,name,color,connected:true}).select().single();
    if(error){showError('player-profile-error','Não consegui entrar na sala. Tente novamente.');console.error(error);return;}
    state.player=data; await subscribePlayer(); renderPlayerWaiting(); show('player-wait-screen');
  }

  async function subscribePlayer(){
    await removeChannels();
    const roomId=state.room.id;
    const dbCh=db.channel(`player-db-${state.player.id}`)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'order_rooms',filter:`id=eq.${roomId}`},payload=>{state.room=payload.new; routePlayerByRoom();})
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'order_players'},payload=>{if(payload.old?.id===state.player?.id)goHome('Você saiu da partida.');})
      .subscribe(); state.channels.push(dbCh);
    const presence=db.channel(`order-presence-${state.room.code}`,{config:{presence:{key:state.player.id}}});
    presence.on('broadcast',{event:'kick'},msg=>{if(msg.payload?.playerId===state.player.id)goHome('O host removeu você da partida.');});
    presence.subscribe(async status=>{if(status==='SUBSCRIBED')await presence.track({role:'player',playerId:state.player.id,name:state.player.name,at:Date.now()});});
    state.channels.push(presence);
  }

  function renderPlayerWaiting(){
    $('waiting-player-name').textContent=state.player.name; $('player-avatar').textContent=initials(state.player.name); $('player-avatar').style.setProperty('--player-color',state.player.color);
    const lobby=state.room.status==='lobby'; $('lobby-edit-box').classList.toggle('hidden',!lobby);
    $('player-wait-title').textContent=lobby?'Aguardando o host':'Aguardando a próxima etapa';
    $('player-wait-copy').textContent=lobby?'Assim que a partida começar, seu tema aparecerá aqui.':'Acompanhe a tela principal. O host está conduzindo a partida.';
  }

  async function routePlayerByRoom(){
    if(!state.player || !state.room) return;
    if(state.room.status==='closed'){goHome('A sala foi encerrada.');return;}
    if(state.room.status==='answering'){
      const already=state.player.answer_round_id===state.room.current_round_id;
      if(already){show('player-submitted-screen');return;}
      $('player-theme-text').textContent=state.room.current_theme_text||'Tema'; $('player-answer-input').value=''; clearError('player-answer-error'); show('player-answer-screen'); startPlayerTimer(); return;
    }
    if(['ordering','revealing','result','selecting_theme'].includes(state.room.status)){
      $('player-wait-title').textContent=state.room.status==='selecting_theme'?'O host está escolhendo o tema':'Olho na tela principal 👀';
      $('player-wait-copy').textContent=state.room.status==='selecting_theme'?'A próxima carta já vai começar.':'Conversem, organizem a ordem e acompanhem a revelação no dispositivo do host.';
      $('lobby-edit-box').classList.add('hidden'); show('player-wait-screen'); return;
    }
    if(state.room.status==='lobby'){renderPlayerWaiting();show('player-wait-screen');}
  }

  function startPlayerTimer(){
    if(state.timerInterval)clearInterval(state.timerInterval);
    const run=()=>{
      const rem=Math.max(0,Math.ceil((new Date(state.room.deadline).getTime()-Date.now())/1000)); $('player-timer').textContent=rem;
      if(rem<=0){clearInterval(state.timerInterval);state.timerInterval=null;if(state.player.answer_round_id!==state.room.current_round_id){show('player-wait-screen');$('player-wait-title').textContent='Tempo encerrado';$('player-wait-copy').textContent='Você não respondeu nesta carta. Acompanhe o restante na tela principal.';$('lobby-edit-box').classList.add('hidden');}}
    }; run(); state.timerInterval=setInterval(run,250);
  }

  async function submitAnswer(){
    clearError('player-answer-error'); const value=normalizeNumber($('player-answer-input').value);
    if(value===null){showError('player-answer-error','Digite um número válido.');return;}
    if(!state.room.current_round_id){showError('player-answer-error','Essa carta já terminou.');return;}
    if(new Date(state.room.deadline).getTime()<=Date.now()){showError('player-answer-error','O tempo acabou.');return;}
    const btn=$('submit-answer-button');btn.disabled=true;
    const {error}=await db.from('order_answers').insert({round_id:state.room.current_round_id,player_id:state.player.id,value});
    if(error){
      if(error.code==='23505'){show('player-submitted-screen');return;}
      showError('player-answer-error','Não consegui enviar. Tente novamente.'); btn.disabled=false; return;
    }
    const {data}=await db.from('order_players').update({answer_round_id:state.room.current_round_id}).eq('id',state.player.id).select().single();
    if(data)state.player=data;
    if(state.timerInterval){clearInterval(state.timerInterval);state.timerInterval=null;} playSound('correct'); show('player-submitted-screen'); btn.disabled=false;
  }

  async function editPlayer(){
    if(state.room.status!=='lobby')return; $('player-name').value=state.player.name; $('player-room-code').textContent=state.room.code; await renderColorPicker(state.player.color); show('player-profile-screen');
  }

  // UI events
  $('join-code').addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,6)});
  $('join-code').addEventListener('keydown',e=>{if(e.key==='Enter')lookupRoom();});
  $('join-code-button').addEventListener('click',lookupRoom);
  $('create-room-home').addEventListener('click',()=>{state.mode='host';show('host-setup-screen');});
  document.querySelectorAll('[data-go-home]').forEach(b=>b.addEventListener('click',()=>goHome()));
  document.querySelectorAll('[data-time]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-time]').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.responseSeconds=Number(b.dataset.time);}));
  $('create-room-button').addEventListener('click',createRoom);
  $('close-room-button').addEventListener('click',closeRoom);
  $('start-match-button').addEventListener('click',startMatch);
  $('skip-theme-button').addEventListener('click',pickNextTheme);
  $('play-theme-button').addEventListener('click',playSelectedTheme);
  $('finish-answers-button').addEventListener('click',finishAnswers);
  $('reveal-button').addEventListener('click',revealResults);
  $('next-card-button').addEventListener('click',nextCard);
  $('join-room-button').addEventListener('click',joinRoom);
  $('edit-player-button').addEventListener('click',editPlayer);
  $('submit-answer-button').addEventListener('click',submitAnswer);
  $('player-answer-input').addEventListener('keydown',e=>{if(e.key==='Enter')submitAnswer();});

})();
