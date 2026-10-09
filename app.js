(() => {
  'use strict';

  const SUPABASE_URL = 'https://cvaocseqrgjstyakncnt.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_YzKP1wT4fhO-e260P7Px8A_1xc3b-Tr';
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: { params: { eventsPerSecond: 20 } }
  });

  const LEGACY_PLAYER_COLOR = '#7854ff';
  const CHARACTER_BUCKET = 'order-characters';

  const FALLBACK_THEMES = [
    'Quanto % esta seu celular','Quanto tempo passou no instagram hoje em minutos','quantos anos você tinha quando perdeu o BV?',
    'Quantas fotos voce tirou esse mes?','Quanto % do dia voce acha que passa sentado?','Quantas abas estão abertas no navegador do seu celular agora?',
    'Quantas pessoas estão na sua lista de Melhores Amigos do Instagram?','quantas pessoas voce segue no instagram','qual foi a maior quantidade de tempo que passou viajando em dias?',
    'Quantas pessoas teria na sua lista de casamento hoje?','Qual o valor da sua ultima compra?','Quanto tempo durou seu relacionamento mais longo em meses?',
    'quantos grupos do whatsapp voce faz parte?','quanto tempo durou a ultima ligação do whatsapp que voce fez em minutos?',
    'Quanto tempo durou seu relacionamento mais curto em meses?','Quantos eps tem a série mais longa que você já assistiu?'
  ];

  const $ = (id) => document.getElementById(id);
  const PLAYER_SESSION_KEY = 'na-ordem-player-session-v1';
  const state = {
    mode: null,
    room: null,
    hostToken: null,
    player: null,
    playerToken: null,
    pendingRoom: null,
    waitForNextRoundId: null,
    players: [],
    characters: [],
    themes: [],
    themeDeck: [],
    themeIndex: 0,
    selectedTheme: null,
    round: null,
    responseSeconds: 30,
    responseInfinite: false,
    channels: [],
    timerInterval: null,
    sortable: null,
    revealBusy: false,
    couchPlayers: [],
    couchAnswers: new Map(),
    couchTurnIndex: 0,
    couchPendingValue: null,
    couchTimerInterval: null
  };

  const audio = {
    correct: new Audio('assets/audio/correct.mp3'),
    lose: new Audio('assets/audio/gameover.mp3'),
    winResult: new Audio('assets/audio/win-result.mp3'),
    loseResult: new Audio('assets/audio/lose-result.mp3'),
    tick: new Audio('assets/audio/countdown.mp3'),
    start: new Audio('assets/audio/turn-start-whistle.mp3')
  };
  Object.values(audio).forEach(a => { a.volume = .55; a.preload = 'auto'; });

  const gameMusic = {
    background: new Audio('assets/audio/game-background.mp3'),
    answering: new Audio('assets/audio/answering.mp3')
  };
  gameMusic.background.loop = true;
  gameMusic.answering.loop = true;
  gameMusic.background.volume = .22;
  gameMusic.answering.volume = .46;
  Object.values(gameMusic).forEach(a=>{a.preload='auto';});
  let gameMusicStarted=false;
  let gameMusicMuted=false;

  function playSound(name){ try { const a = audio[name]; if(!a) return; a.currentTime = 0; a.play().catch(()=>{}); } catch(_){} }
  function setMusicTrackPlaying(track,shouldPlay){
    const a=gameMusic[track]; if(!a)return;
    if(shouldPlay && !gameMusicMuted){a.play().catch(()=>{});}
    else a.pause();
  }
  function updateMuteButton(){
    const btn=$('game-mute-button'); if(!btn)return;
    btn.setAttribute('aria-label',gameMusicMuted?'Ativar música':'Mutar música');
    btn.title=gameMusicMuted?'Ativar música':'Mutar música';
    btn.querySelector('.mute-icon-on')?.classList.toggle('hidden',gameMusicMuted);
    btn.querySelector('.mute-icon-off')?.classList.toggle('hidden',!gameMusicMuted);
  }
  function startGameMusic(){
    if(state.mode!=='host' && state.mode!=='couch')return;
    gameMusicStarted=true;
    if(!gameMusicMuted) gameMusic.background.play().catch(()=>{});
    updateMuteButton();
  }
  function stopGameMusic(){
    gameMusicStarted=false;
    Object.values(gameMusic).forEach(a=>{a.pause();a.currentTime=0;});
  }
  function syncGameMusicForScreen(screenId){
    const isGameMode=state.mode==='host'||state.mode==='couch';
    const gameplayScreen=isGameMode && !['home-screen','host-setup-screen','couch-setup-screen'].includes(screenId);
    const btn=$('game-mute-button'); if(btn)btn.classList.toggle('hidden',!gameplayScreen);

    const answering=screenId==='host-answering-screen'||screenId==='couch-turn-screen';

    if(!gameplayScreen || !gameMusicStarted || gameMusicMuted){
      gameMusic.background.pause();
      gameMusic.answering.pause();
      updateMuteButton();
      return;
    }

    if(answering){
      // During the response phase, Time's Running Out replaces the looping game track.
      gameMusic.background.pause();
      gameMusic.answering.play().catch(()=>{});
    }else{
      // Leaving the response phase stops the answering track and resumes the main loop
      // from the exact point where it was paused.
      gameMusic.answering.pause();
      gameMusic.answering.currentTime=0;
      gameMusic.background.play().catch(()=>{});
    }
    updateMuteButton();
  }
  function toggleGameMusic(){
    gameMusicMuted=!gameMusicMuted;
    if(gameMusicMuted) Object.values(gameMusic).forEach(a=>a.pause());
    else {
      const active=document.querySelector('.screen.active');
      syncGameMusicForScreen(active?.id||'');
    }
    updateMuteButton();
  }
  function uuid(){ return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16)}); }
  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
  function show(id){
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    $(id).classList.add('active');
    document.body.classList.toggle('couch-mode',state.mode==='couch');
    updatePlayerLeaveButton();
    syncGameMusicForScreen(id);
    window.scrollTo(0,0);
  }
  function showError(id, message){ const el=$(id); el.textContent=message; el.classList.remove('hidden'); }
  function clearError(id){ const el=$(id); if(el){el.textContent='';el.classList.add('hidden');} }
  function toast(message, ms=2200){ const el=$('toast'); el.textContent=message; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.add('hidden'),ms); }
  function escapeHtml(v){ return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function formatValue(v){ const n=Number(v); if(Number.isInteger(n)) return String(n); return String(n).replace('.',','); }
  function normalizeNumber(raw){ const text=String(raw??'').trim().replace(',','.'); if(!text || !/^[-+]?\d*(?:\.\d+)?$/.test(text)) return null; const n=Number(text); return Number.isFinite(n)?n:null; }
  function shuffled(arr){ const copy=[...arr]; for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];} return copy; }
  function initials(name){ return String(name||'?').trim().slice(0,1).toUpperCase(); }
  function responseTimeLabel(seconds, infinite=false){ return infinite ? '∞' : `${Number(seconds)}s`; }
  function updatePlayerLeaveButton(){ const btn=$('player-leave-button'); if(btn) btn.classList.toggle('hidden', !(state.mode==='player' && state.player)); }
  function publicCharacterUrl(storagePath){
    if(!storagePath) return '';
    return db.storage.from(CHARACTER_BUCKET).getPublicUrl(String(storagePath)).data.publicUrl;
  }
  function normalizeCharacter(row){
    if(!row?.id || !row?.storage_path) return null;
    return {
      id:String(row.id),
      name:String(row.name||'Personagem'),
      storage_path:String(row.storage_path),
      image_url:publicCharacterUrl(row.storage_path),
      sort_order:Number(row.sort_order||0),
      active:row.active!==false
    };
  }
  async function loadCharacters(){
    try{
      const {data,error}=await db.from('order_characters').select('id,name,storage_path,sort_order,active').order('sort_order');
      if(error) throw error;
      state.characters=(data||[]).map(normalizeCharacter).filter(Boolean);
    }catch(err){
      state.characters=[];
      console.error('Não foi possível carregar o catálogo de personagens do Supabase.',err);
    }
  }
  function selectableCharacters(){ return state.characters.filter(c=>c.active!==false); }
  function characterById(id){ return state.characters.find(c=>c.id===id) || null; }
  function characterForPlayer(player){ return characterById(player?.character_id) || state.characters[0] || null; }
  function characterImageHtml(player,className='player-character-image'){
    const c=characterForPlayer(player);
    if(!c) return `<div class="${className} character-missing" aria-label="Personagem indisponível">?</div>`;
    return `<img class="${className}" src="${escapeHtml(c.image_url)}" alt="${escapeHtml(c.name)}">`;
  }

  let appConfirmResolver=null;
  let appConfirmDismissible=true;
  function appConfirm(message,{title='Tem certeza?',confirmText='CONFIRMAR',cancelText='CANCELAR',danger=true,dismissible=true}={}){
    const overlay=$('app-confirm-overlay');
    if(!overlay) return Promise.resolve(window.confirm(message));
    $('app-confirm-title').textContent=title;
    $('app-confirm-message').textContent=message;
    const ok=$('app-confirm-ok');
    const cancel=$('app-confirm-cancel');
    ok.textContent=confirmText;
    cancel.textContent=cancelText;
    ok.classList.toggle('danger-button',danger);
    appConfirmDismissible=dismissible;
    overlay.classList.remove('hidden');
    return new Promise(resolve=>{ appConfirmResolver=resolve; });
  }
  function closeAppConfirm(value){
    const overlay=$('app-confirm-overlay');
    overlay?.classList.add('hidden');
    const resolve=appConfirmResolver; appConfirmResolver=null;
    appConfirmDismissible=true;
    if(resolve) resolve(Boolean(value));
  }
  function roomJoinUrl(code){
    const url=new URL(window.location.href);
    url.search='';
    url.hash='';
    url.searchParams.set('room',code);
    return url.toString();
  }
  function clearRoomQueryFromUrl(){
    try{
      const url=new URL(window.location.href);
      if(!url.searchParams.has('room')) return;
      url.searchParams.delete('room');
      history.replaceState({},'',url.pathname+(url.search?url.search:'')+(url.hash||''));
    }catch(_){}
  }
  function renderRoomQRCodes(){
    if(!state.room?.code || typeof window.QRCode==='undefined') return;
    const text=roomJoinUrl(state.room.code);
    document.querySelectorAll('[data-room-qr]').forEach(el=>{
      const size=Math.max(44,Number(el.dataset.qrSize)||64);
      if(el.dataset.qrText===text && el.childElementCount) return;
      el.innerHTML='';
      try{
        new window.QRCode(el,{text,width:size,height:size,colorDark:'#1d0b4f',colorLight:'#ffffff',correctLevel:window.QRCode.CorrectLevel.M});
        el.dataset.qrText=text;
      }catch(err){console.warn('Não foi possível gerar o QR Code:',err);}
    });
  }
  function updateRoomCodeDisplays(){
    document.querySelectorAll('[data-room-code-display]').forEach(el=>{el.textContent=state.room?.code||'------';});
    renderRoomQRCodes();
  }

  async function shareRoomLink(){
    if(!state.room?.code) return;
    const url=roomJoinUrl(state.room.code);
    const isTouchDevice=window.matchMedia?.('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if(isTouchDevice && typeof navigator.share==='function'){
      try{
        await navigator.share({title:'Na Ordem!',text:'Entre na minha sala do Na Ordem!',url});
        return;
      }catch(err){
        if(err?.name==='AbortError') return;
      }
    }
    try{
      await navigator.clipboard.writeText(url);
      toast('Link da sala copiado!',1800);
    }catch(_){
      const ta=document.createElement('textarea');
      ta.value=url;
      ta.setAttribute('readonly','');
      ta.style.position='fixed';
      ta.style.opacity='0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast('Link da sala copiado!',1800);
    }
  }

  function savePlayerSession(){
    if(!state.room?.id || !state.room?.code || !state.player?.id || !state.playerToken) return;
    try{
      localStorage.setItem(PLAYER_SESSION_KEY, JSON.stringify({
        roomId: state.room.id,
        roomCode: state.room.code,
        playerId: state.player.id,
        playerToken: state.playerToken,
        waitForNextRoundId: state.waitForNextRoundId || null
      }));
    }catch(_){}
  }

  function loadPlayerSession(){
    try{
      const raw=localStorage.getItem(PLAYER_SESSION_KEY);
      if(!raw) return null;
      const session=JSON.parse(raw);
      if(!session?.roomId || !session?.playerId || !session?.playerToken) return null;
      return session;
    }catch(_){ return null; }
  }

  function clearPlayerSession(){
    try{localStorage.removeItem(PLAYER_SESSION_KEY);}catch(_){}
  }

  async function removeChannels(){
    state.channels.forEach(ch=>{ try{db.removeChannel(ch);}catch(_){} });
    state.channels=[];
    if(state.timerInterval){clearInterval(state.timerInterval);state.timerInterval=null;}
  }

  async function goHome(message){
    const wasPlayer=state.mode==='player' || !!state.player;
    await removeChannels();
    if(state.sortable){try{state.sortable.destroy();}catch(_){} state.sortable=null;}
    if(wasPlayer){ clearPlayerSession(); clearRoomQueryFromUrl(); }
    stopGameMusic();
    state.mode=null; state.room=null; state.player=null; state.playerToken=null; state.round=null; state.pendingRoom=null; state.waitForNextRoundId=null; state.couchPlayers=[]; state.couchAnswers=new Map(); state.couchTurnIndex=0; state.couchPendingValue=null; if(state.couchTimerInterval){clearInterval(state.couchTimerInterval);state.couchTimerInterval=null;}
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

  async function pickNextTheme(){
    if(!state.themeDeck.length) state.themeDeck=shuffled(state.themes);
    if(state.themeIndex>=state.themeDeck.length){ state.themeDeck=shuffled(state.themes); state.themeIndex=0; }
    state.selectedTheme=state.themeDeck[state.themeIndex++];
    $('host-theme-text').textContent=state.selectedTheme?.text || 'Sem tema disponível';
    if(state.mode==='host' && state.room?.id && state.room.status==='selecting_theme' && state.selectedTheme){
      const {data,error}=await db.from('order_rooms').update({current_theme_id:state.selectedTheme.id||null,current_theme_text:state.selectedTheme.text}).eq('id',state.room.id).select().single();
      if(!error && data){state.room=data;updateRoomCodeDisplays();}
      else if(error) console.error('Erro ao sincronizar sugestão de carta:',error);
    }
  }

  async function createRoom(){
    clearError('setup-error');
    startGameMusic();
    const btn=$('create-room-button'); btn.disabled=true;
    state.hostToken=uuid();
    try{
      let room=null;
      for(let attempt=0;attempt<8 && !room;attempt++){
        const code=String(Math.floor(100000+Math.random()*900000));
        const {data,error}=await db.from('order_rooms').insert({code,host_token:state.hostToken,status:'lobby',response_seconds:state.responseSeconds,response_infinite:state.responseInfinite}).select().single();
        if(!error) room=data;
        else if(error.code!=='23505') throw error;
      }
      if(!room) throw new Error('Não foi possível gerar um código de sala.');
      state.room=room; state.mode='host'; updateRoomCodeDisplays();
      await loadThemes();
      await subscribeHost();
      await refreshPlayers();
      renderHostLobby();
      show('host-lobby-screen');
    }catch(err){ stopGameMusic(); showError('setup-error','Não consegui criar a partida. Verifique o console para detalhes.'); console.error('Erro ao criar partida:',err); }
    finally{ btn.disabled=false; }
  }

  async function subscribeHost(){
    await removeChannels();
    const roomId=state.room.id;
    const roomCh=db.channel(`order-room-db-${roomId}`)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'order_rooms',filter:`id=eq.${roomId}`},payload=>{state.room=payload.new; updateRoomCodeDisplays();})
      .on('postgres_changes',{event:'*',schema:'public',table:'order_players',filter:`room_id=eq.${roomId}`},async()=>{await refreshPlayers(); renderHostForStatus(); await maybeAutoFinishAnswers();})
      .subscribe();
    state.channels.push(roomCh);

    const presence=db.channel(`order-presence-${state.room.code}`,{config:{presence:{key:`host-${state.room.id}`}}});
    presence.subscribe(async status=>{ if(status==='SUBSCRIBED') await presence.track({role:'host',roomId:state.room.id,at:Date.now()}); });
    state.channels.push(presence);
  }

  async function refreshPlayers(){
    if(!state.room) return;
    const {data}=await db.from('order_players').select('*').eq('room_id',state.room.id).order('joined_at');
    const rows=data||[];
    const preserveCurrentRound=['ordering','revealing','result'].includes(state.room.status) && state.room.current_round_id;
    state.players=rows.filter(p=>p.connected!==false || (preserveCurrentRound && p.answer_round_id===state.room.current_round_id));
  }

  function renderHostLobby(){
    $('host-room-code').textContent=state.room.code;
    const lobbyTime=$('lobby-time');
    lobbyTime.textContent=responseTimeLabel(state.room.response_seconds,state.room.response_infinite);
    lobbyTime.classList.toggle('infinite-time-icon',Boolean(state.room.response_infinite));
    updateRoomCodeDisplays();
    renderLobbyPlayers();
  }

  function applyResponsivePlayerGrid(element,count){
    if(!element) return;
    const total=Math.max(0,Number(count)||0);
    const baseColumns=5;
    const maxRows=2;
    const columns=total<=baseColumns ? Math.max(1,total) : (total<=baseColumns*maxRows ? baseColumns : Math.ceil(total/maxRows));
    element.style.setProperty('--player-grid-columns',String(columns));
    element.dataset.playerCount=String(total);
    element.dataset.playerGridDensity=columns<=5?'normal':(columns<=7?'compact':'dense');
  }

  function renderLobbyPlayers(){
    const list=$('host-player-list'); const count=state.players.length;
    $('player-count').textContent=`${count} ${count===1?'jogador':'jogadores'}`;
    $('start-match-button').disabled=count<2;
    $('lobby-min-message').textContent=count<2?'Entre pelo menos 2 jogadores.':'Tudo pronto quando vocês estiverem!';
    if(!count){ list.className='host-player-list empty-state'; list.innerHTML='<p>Os jogadores aparecerão aqui.</p>'; return; }
    list.className='host-player-list';
    applyResponsivePlayerGrid(list,count);
    list.innerHTML=state.players.map(p=>`<div class="lobby-player-card"><button class="kick-player" data-kick="${p.id}" title="Expulsar jogador" aria-label="Expulsar ${escapeHtml(p.name)}">×</button><div class="lobby-player-character">${characterImageHtml(p)}</div><strong>${escapeHtml(p.name)}</strong><span class="lobby-player-status">AGUARDANDO</span></div>`).join('');
    list.querySelectorAll('[data-kick]').forEach(btn=>btn.addEventListener('click',()=>kickPlayer(btn.dataset.kick)));
  }

  async function kickPlayer(playerId){
    const p=state.players.find(x=>x.id===playerId); if(!p) return;
    if(!(await appConfirm(`Expulsar ${p.name} da partida?`,{title:'Remover jogador?',confirmText:'REMOVER'}))) return;
    const presence=state.channels.find(ch=>ch.topic?.includes('order-presence-'));
    try{await presence?.send({type:'broadcast',event:'kick',payload:{playerId}});}catch(_){}
    await db.from('order_players').delete().eq('id',playerId).eq('room_id',state.room.id);
    await refreshPlayers(); renderLobbyPlayers();
  }

  async function endRoom(message='Partida encerrada.'){
    if(!state.room){await goHome();return;}
    const presence=state.channels.find(ch=>ch.topic?.includes('order-presence-'));
    try{await presence?.send({type:'broadcast',event:'room_closed',payload:{roomId:state.room.id}});}catch(_){}
    const {error}=await db.from('order_rooms').update({status:'closed',deadline:null}).eq('id',state.room.id);
    if(error){toast('Não consegui encerrar a partida.');console.error('Erro ao encerrar sala:',error);return;}
    await goHome(message);
  }

  async function closeRoom(){
    if(!state.room){goHome();return;}
    if(!(await appConfirm('Encerrar esta sala e voltar ao início?',{title:'Encerrar sala?',confirmText:'ENCERRAR'}))) return;
    await endRoom('Sala encerrada.');
  }

  async function endMatch(){
    if(!state.room) return;
    if(!(await appConfirm(state.mode==='couch'?'Encerrar esta partida?':'Encerrar a partida para todos os jogadores?',{title:'Encerrar partida?',confirmText:'ENCERRAR'}))) return;
    if(state.mode==='couch'){ await goHome('Partida encerrada.'); return; }
    await endRoom('Partida encerrada.');
  }

  async function startMatch(){
    if(state.players.length<2) return;
    await db.from('order_rooms').update({status:'selecting_theme',round_number:0,current_theme_id:null,current_theme_text:null,current_round_id:null,deadline:null}).eq('id',state.room.id);
    state.room.status='selecting_theme'; state.room.round_number=0; updateRoomCodeDisplays();
    await pickNextTheme();
    $('host-round-number').textContent='1';
    show('host-theme-screen');
  }

  async function playSelectedTheme(){
    if(!state.selectedTheme || !state.room) return;
    if(state.mode==='couch'){
      const roundNo=(state.room.round_number||0)+1;
      state.room={...state.room,status:'answering',round_number:roundNo,current_theme_text:state.selectedTheme.text,current_theme_id:state.selectedTheme.id||null,current_round_id:`couch-round-${roundNo}`,deadline:null};
      state.round={id:state.room.current_round_id,round_number:roundNo,theme_text:state.selectedTheme.text,status:'answering'};
      state.couchAnswers=new Map();
      state.couchTurnIndex=0;
      state.players=state.couchPlayers.map(p=>({...p,answer_round_id:null}));
      playSound('start');
      beginCouchTurn();
      return;
    }
    const roundNo=(state.room.round_number||0)+1;
    const deadline=state.room.response_infinite ? null : new Date(Date.now()+Number(state.room.response_seconds)*1000).toISOString();
    const {data:round,error}=await db.from('order_rounds').insert({
      room_id:state.room.id,theme_id:state.selectedTheme.id||null,theme_text:state.selectedTheme.text,round_number:roundNo,status:'answering',deadline
    }).select().single();
    if(error){toast('Erro ao iniciar a carta.');console.error(error);return;}
    await db.from('order_players').update({answer_round_id:null}).eq('room_id',state.room.id);
    const {data:room}=await db.from('order_rooms').update({status:'answering',current_theme_id:state.selectedTheme.id||null,current_theme_text:state.selectedTheme.text,current_round_id:round.id,round_number:roundNo,deadline}).eq('id',state.room.id).select().single();
    state.round=round; state.room=room; updateRoomCodeDisplays();
    playSound('start');
    await refreshPlayers(); renderAnswering(); show('host-answering-screen'); startHostTimer();
  }

  function renderAnswering(){
    $('answer-round-number').textContent=state.room.round_number;
    $('answering-theme').textContent=state.room.current_theme_text;
    const grid=$('answer-status-grid');
    applyResponsivePlayerGrid(grid,state.players.length);
    grid.innerHTML=state.players.map(p=>{
      const answered=p.answer_round_id===state.room.current_round_id;
      return `<div class="answer-status-card ${answered?'answered':'waiting'}"><div class="answer-player-character">${characterImageHtml(p)}</div><strong>${escapeHtml(p.name)}</strong></div>`;
    }).join('');
  }

  function renderHostForStatus(){
    if(!state.room) return;
    updateRoomCodeDisplays();
    if(state.room.status==='lobby') renderLobbyPlayers();
    if(state.room.status==='answering') renderAnswering();
  }

  let autoFinishBusy=false;
  async function maybeAutoFinishAnswers(){
    if(autoFinishBusy || !state.room || state.room.status!=='answering' || !state.room.current_round_id) return;
    if(!state.players.length) return;
    const allAnswered=state.players.every(p=>p.answer_round_id===state.room.current_round_id);
    if(!allAnswered) return;
    autoFinishBusy=true;
    try{
      toast('Todos responderam! Avançando...',1200);
      await finishAnswers();
    }finally{ autoFinishBusy=false; }
  }

  function startHostTimer(){
    if(state.timerInterval) clearInterval(state.timerInterval);
    const timerPill=$('host-timer').closest('.timer-pill');
    if(!state.room?.deadline){
      $('host-timer').textContent='∞';
      $('host-timer-unit').textContent='';
      timerPill?.classList.add('is-infinite');
      return;
    }
    timerPill?.classList.remove('is-infinite');
    $('host-timer-unit').textContent='s';
    let lastTick=null;
    const run=async()=>{
      const remaining=Math.max(0,Math.ceil((new Date(state.room.deadline).getTime()-Date.now())/1000));
      $('host-timer').textContent=remaining;
      if(remaining<=5 && remaining>0 && lastTick!==remaining){ playSound('tick'); lastTick=remaining; }
      if(remaining<=0){ clearInterval(state.timerInterval); state.timerInterval=null; await finishAnswers(); }
    };
    run(); state.timerInterval=setInterval(run,250);
  }

  async function retryIncompleteRound(){
    if(state.mode==='couch'){
      state.couchAnswers=new Map();
      state.couchTurnIndex=0;
      state.couchPendingValue=null;
      state.players=state.couchPlayers.map(p=>({...p,answer_round_id:null}));
      state.room={...state.room,status:'answering',deadline:null};
      if(state.round) state.round={...state.round,status:'answering'};
      playSound('start');
      beginCouchTurn();
      return;
    }
    if(!state.room?.current_round_id) return;
    const roundId=state.room.current_round_id;
    const deadline=state.room.response_infinite ? null : new Date(Date.now()+Number(state.room.response_seconds)*1000).toISOString();
    const {error:deleteError}=await db.from('order_answers').delete().eq('round_id',roundId);
    if(deleteError){toast('Não consegui reiniciar esta carta.');console.error(deleteError);return;}
    await db.from('order_players').update({answer_round_id:null}).eq('room_id',state.room.id);
    await db.from('order_rounds').update({status:'answering',deadline}).eq('id',roundId);
    const {data:room,error}=await db.from('order_rooms').update({status:'answering',deadline}).eq('id',state.room.id).select().single();
    if(error){toast('Não consegui reiniciar esta carta.');console.error(error);return;}
    state.room=room;
    if(state.round) state.round={...state.round,status:'answering',deadline};
    await refreshPlayers();
    renderAnswering();
    show('host-answering-screen');
    startHostTimer();
  }

  async function handleIncompleteRound(responseCount){
    const retry=await appConfirm(
      responseCount===0
        ? 'Ninguém respondeu esta carta. São necessárias pelo menos 2 respostas para continuar.'
        : 'Apenas 1 jogador respondeu esta carta. São necessárias pelo menos 2 respostas para continuar.',
      {title:'Partida incompleta',confirmText:'TENTAR NOVAMENTE',cancelText:'PRÓXIMA CARTA',danger:false,dismissible:false}
    );
    if(retry) await retryIncompleteRound();
    else await nextCard();
  }

  let finishAnswersBusy=false;
  async function finishAnswers(){
    if(finishAnswersBusy || !state.room || state.room.status!=='answering') return;
    finishAnswersBusy=true;
    try{
      if(state.timerInterval){clearInterval(state.timerInterval);state.timerInterval=null;}
      await refreshPlayers();
      const roundId=state.room.current_round_id;
      const {data:answers,error}=await db.from('order_answers').select('player_id').eq('round_id',roundId);
      if(error){toast('Não consegui carregar as respostas.');return;}
      const responded=new Set((answers||[]).map(a=>a.player_id));
      if(responded.size<2){
        await handleIncompleteRound(responded.size);
        return;
      }
      await db.from('order_rounds').update({status:'ordering'}).eq('id',roundId);
      const {data:room}=await db.from('order_rooms').update({status:'ordering',deadline:null}).eq('id',state.room.id).select().single();
      state.room=room; updateRoomCodeDisplays();
      renderOrdering(responded);
      show('host-ordering-screen');
    }finally{
      finishAnswersBusy=false;
    }
  }

  function renderOrdering(responded){
    $('order-round-number').textContent=state.room.round_number;
    $('ordering-theme').textContent=state.room.current_theme_text;
    const responders=state.players.filter(p=>responded.has(p.id));
    const missing=state.players.filter(p=>!responded.has(p.id));
    const wrap=$('sortable-player-cards');
    applyResponsivePlayerGrid(wrap,responders.length);
    wrap.innerHTML=responders.map((p,i)=>orderCardHtml(p,i+1,false)).join('');
    updateCardPositions(wrap);
    const note=$('missing-answer-note');
    if(missing.length){note.textContent=`Sem resposta nesta carta: ${missing.map(p=>p.name).join(', ')}. Eles ficam fora desta ordenação.`;note.classList.remove('hidden');}else note.classList.add('hidden');
    $('reveal-button').disabled=responders.length<2;
    if(state.sortable){try{state.sortable.destroy();}catch(_){} }
    state.sortable=window.Sortable.create(wrap,{animation:180,delay:70,delayOnTouchOnly:true,touchStartThreshold:5,ghostClass:'sortable-ghost',chosenClass:'sortable-chosen',onEnd:()=>updateCardPositions(wrap)});
  }

  function orderCardHtml(p,pos,revealed,value){
    return `<div class="order-card${revealed?' revealed':''}" data-player-id="${p.id}" data-position="${pos}"><span class="drag-handle">•••</span><div class="order-player-character">${characterImageHtml(p)}</div><strong>${escapeHtml(p.name)}</strong><div class="secret-value">${revealed?escapeHtml(formatValue(value)):'?'}</div></div>`;
  }
  function updateCardPositions(wrap){ [...wrap.children].forEach((el,i)=>el.dataset.position=String(i+1)); }

  function setHostResultOutcome(success){
    const headline=$('result-headline');
    const img=$('result-outcome-image');
    if(headline) headline.classList.add('hidden');
    if(img){
      img.src=success?'assets/images/result-win.png':'assets/images/result-lose.png';
      img.alt=success?'Vocês acertaram!':'Vocês erraram!';
      img.classList.remove('hidden');
    }
  }
  function resetHostResultOutcome(){
    const headline=$('result-headline');
    const img=$('result-outcome-image');
    if(headline) headline.classList.remove('hidden');
    if(img) img.classList.add('hidden');
  }

  async function revealResults(){
    if(state.revealBusy) return; state.revealBusy=true;
    $('reveal-button').disabled=true;
    const orderedIds=[...$('sortable-player-cards').children].map(el=>el.dataset.playerId);
    if(state.mode==='couch'){
      const map=new Map(state.couchAnswers);
      const actualPlayers=orderedIds.map(id=>state.players.find(p=>p.id===id)).filter(Boolean);
      const values=orderedIds.map(id=>map.get(id));
      const success=values.every((v,i)=>i===0 || values[i-1]<=v);
      state.round={...state.round,status:'revealing',host_order:orderedIds,success};
      state.room.status='revealing';
      $('result-round-number').textContent=state.room.round_number;
      $('result-theme').textContent=state.room.current_theme_text;
      resetHostResultOutcome(); $('result-headline').textContent='VAMOS REVELAR!'; $('result-badge').textContent='...';
      $('result-message').className='result-message hidden'; $('result-actions').classList.add('hidden');
      const out=$('result-player-cards'); applyResponsivePlayerGrid(out,actualPlayers.length); out.innerHTML=actualPlayers.map((p,i)=>orderCardHtml(p,i+1,false)).join('');
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
      $('result-headline').textContent=success?'VOCÊS ACERTARAM!':'VOCÊS ERRARAM!';
      setHostResultOutcome(success);
      $('result-badge').textContent=success?'ACERTOU!':'ERROU';
      $('result-badge').style.background=success?'#15803d':'#b91c1c';
      msg.classList.add(success?'win':'lose'); msg.textContent='';
      document.querySelector('.result-header').classList.add(success?'win':'lose');
      playSound(success?'winResult':'loseResult');
      state.round.status='result'; state.room.status='result';
      $('result-actions').classList.remove('hidden'); state.revealBusy=false;
      return;
    }
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
    resetHostResultOutcome(); $('result-headline').textContent='VAMOS REVELAR!'; $('result-badge').textContent='...';
    $('result-message').className='result-message hidden'; $('result-actions').classList.add('hidden');
    const out=$('result-player-cards'); applyResponsivePlayerGrid(out,actualPlayers.length); out.innerHTML=actualPlayers.map((p,i)=>orderCardHtml(p,i+1,false)).join('');
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
    $('result-headline').textContent=success?'VOCÊS ACERTARAM!':'VOCÊS ERRARAM!';
    setHostResultOutcome(success);
    $('result-badge').textContent=success?'ACERTOU!':'ERROU';
    $('result-badge').style.background=success?'#15803d':'#b91c1c';
    msg.classList.add(success?'win':'lose'); msg.textContent='';
    document.querySelector('.result-header').classList.add(success?'win':'lose');
    playSound(success?'winResult':'loseResult');
    await db.from('order_rounds').update({status:'result',finished_at:new Date().toISOString()}).eq('id',state.room.current_round_id);
    const {data:resultRoom}=await db.from('order_rooms').update({status:'result'}).eq('id',state.room.id).select().single(); state.room=resultRoom;
    $('result-actions').classList.remove('hidden'); state.revealBusy=false;
  }

  async function nextCard(){
    document.querySelector('.result-header').classList.remove('win','lose');
    $('result-badge').removeAttribute('style');
    if(state.mode==='couch'){
      state.room={...state.room,status:'selecting_theme',current_theme_id:null,current_theme_text:null,current_round_id:null,deadline:null};
      state.round=null; state.couchAnswers=new Map(); state.couchTurnIndex=0;
      await pickNextTheme(); $('host-round-number').textContent=(state.room.round_number||0)+1; show('host-theme-screen');
      return;
    }
    const {data:room}=await db.from('order_rooms').update({status:'selecting_theme',current_theme_id:null,current_theme_text:null,current_round_id:null,deadline:null}).eq('id',state.room.id).select().single();
    state.room=room; state.round=null; updateRoomCodeDisplays(); await pickNextTheme(); $('host-round-number').textContent=(state.room.round_number||0)+1; show('host-theme-screen');
  }

  // COUCH MODE
  function renderCouchSetupTime(){
    const infinite=state.responseInfinite;
    $('couch-time-value').textContent=infinite?'∞':`${state.responseSeconds}s`;
    $('couch-time-value-button').classList.toggle('infinite',infinite);
    $('couch-time-infinite').classList.toggle('active',infinite);
    $('couch-time-minus').disabled=infinite || state.responseSeconds<=30;
  }

  function renderCouchPlayerEditor(){
    const wrap=$('couch-player-editor');
    wrap.innerHTML=state.couchPlayers.map((p,i)=>`<div class="couch-player-edit-card" data-couch-player="${p.id}">
      <div class="couch-player-index">${i+1}</div>
      <input class="mobile-input couch-name-input" maxlength="24" value="${escapeHtml(p.name||'')}" placeholder="Nome do jogador" data-couch-name="${p.id}">
      <div class="couch-character-row">${selectableCharacters().map(c=>`<button type="button" class="couch-character-option ${p.character_id===c.id?'selected':''}" data-couch-character="${p.id}" data-character-id="${c.id}" aria-label="Escolher ${escapeHtml(c.name)}"><img src="${escapeHtml(c.image_url)}" alt=""></button>`).join('')}</div>
      <button class="couch-remove-player" type="button" data-couch-remove="${p.id}" ${state.couchPlayers.length<=2?'disabled':''}>×</button>
    </div>`).join('');
    wrap.querySelectorAll('[data-couch-name]').forEach(inp=>inp.addEventListener('input',()=>{
      const p=state.couchPlayers.find(x=>x.id===inp.dataset.couchName); if(p) p.name=inp.value;
    }));
    wrap.querySelectorAll('[data-couch-character]').forEach(btn=>btn.addEventListener('click',()=>{
      const p=state.couchPlayers.find(x=>x.id===btn.dataset.couchCharacter); if(!p)return; p.character_id=btn.dataset.characterId; renderCouchPlayerEditor();
    }));
    wrap.querySelectorAll('[data-couch-remove]').forEach(btn=>btn.addEventListener('click',()=>{
      if(state.couchPlayers.length<=2)return; state.couchPlayers=state.couchPlayers.filter(x=>x.id!==btn.dataset.couchRemove); renderCouchPlayerEditor();
    }));
  }

  function addCouchPlayer(){
    const i=state.couchPlayers.length;
    const available=selectableCharacters();
    const character=available[i%available.length] || null;
    state.couchPlayers.push({id:`couch-${uuid()}`,name:'',character_id:character?.id||null,color:LEGACY_PLAYER_COLOR,connected:true});
    renderCouchPlayerEditor();
  }

  async function openCouchSetup(){
    await loadCharacters();
    state.mode='couch'; state.room=null; state.player=null; state.players=[];
    state.responseSeconds=30; state.responseInfinite=false;
    state.couchPlayers=[]; addCouchPlayer(); addCouchPlayer();
    renderCouchSetupTime();
    show('couch-setup-screen');
  }

  async function startCouchMatch(){
    clearError('couch-setup-error');
    const names=state.couchPlayers.map(p=>String(p.name||'').trim());
    if(state.couchPlayers.length<2){showError('couch-setup-error','Adicione pelo menos 2 participantes.');return;}
    if(names.some(n=>!n)){showError('couch-setup-error','Preencha o nome de todos os participantes.');return;}
    startGameMusic();
    state.couchPlayers=state.couchPlayers.map((p,i)=>({...p,name:names[i]}));
    state.players=state.couchPlayers.map(p=>({...p}));
    state.room={id:'couch-local',code:null,status:'selecting_theme',response_seconds:state.responseSeconds,response_infinite:state.responseInfinite,round_number:0,current_theme_id:null,current_theme_text:null,current_round_id:null,deadline:null};
    await loadThemes();
    await pickNextTheme();
    $('host-round-number').textContent='1';
    show('host-theme-screen');
  }

  function startCouchTurnTimer(){
    if(state.couchTimerInterval){clearInterval(state.couchTimerInterval);state.couchTimerInterval=null;}
    if(state.responseInfinite){$('couch-turn-timer').textContent='∞';$('couch-turn-timer-unit').textContent='';return;}
    $('couch-turn-timer-unit').textContent='s';
    const started=Date.now(); const duration=state.responseSeconds*1000;
    let lastTick=null;
    const run=()=>{
      const rem=Math.max(0,Math.ceil((duration-(Date.now()-started))/1000));
      $('couch-turn-timer').textContent=rem;
      if(rem<=5 && rem>0 && lastTick!==rem){playSound('tick');lastTick=rem;}
      if(rem<=0){clearInterval(state.couchTimerInterval);state.couchTimerInterval=null;skipCouchTurnOnTimeout();}
    };
    run(); state.couchTimerInterval=setInterval(run,250);
  }

  function beginCouchTurn(){
    if(state.couchTurnIndex>=state.players.length){finishCouchAnswers();return;}
    const p=state.players[state.couchTurnIndex];
    $('couch-round-number').textContent=state.room.round_number;
    $('couch-theme-text').textContent=state.room.current_theme_text;
    $('couch-turn-player-name').textContent=p.name;
    const couchCharacter=characterForPlayer(p);
    if(couchCharacter){
      $('couch-turn-player-character').src=couchCharacter.image_url;
      $('couch-turn-player-character').alt=couchCharacter.name;
    }else{
      $('couch-turn-player-character').removeAttribute('src');
      $('couch-turn-player-character').alt='Personagem indisponível';
    }
    $('couch-answer-input').value='';
    clearError('couch-answer-error');
    $('couch-confirm-overlay').classList.add('hidden');
    state.couchPendingValue=null;
    show('couch-turn-screen');
    $('couch-answer-input').focus();
    startCouchTurnTimer();
  }

  function reviewCouchAnswer(){
    clearError('couch-answer-error');
    const value=normalizeNumber($('couch-answer-input').value);
    if(value===null){showError('couch-answer-error','Digite um número válido.');return;}
    const p=state.players[state.couchTurnIndex]; if(!p)return;
    state.couchPendingValue=value;
    $('couch-confirm-player-name').textContent=p.name;
    $('couch-confirm-value').textContent=formatValue(value);
    $('couch-confirm-overlay').classList.remove('hidden');
  }

  function closeCouchConfirmation(){
    state.couchPendingValue=null;
    $('couch-confirm-overlay').classList.add('hidden');
    $('couch-answer-input').focus();
  }

  function confirmCouchAnswer(){
    const p=state.players[state.couchTurnIndex];
    if(!p || state.couchPendingValue===null)return;
    if(state.couchTimerInterval){clearInterval(state.couchTimerInterval);state.couchTimerInterval=null;}
    state.couchAnswers.set(p.id,Number(state.couchPendingValue));
    p.answer_round_id=state.room.current_round_id;
    state.couchPendingValue=null;
    $('couch-confirm-overlay').classList.add('hidden');
    playSound('correct');
    state.couchTurnIndex++;
    beginCouchTurn();
  }

  function skipCouchTurnOnTimeout(){
    const p=state.players[state.couchTurnIndex];
    toast(`Tempo de ${p?.name||'jogador'} encerrado.`,1400);
    $('couch-confirm-overlay').classList.add('hidden');
    state.couchPendingValue=null;
    state.couchTurnIndex++;
    setTimeout(beginCouchTurn,450);
  }

  async function finishCouchAnswers(){
    if(state.couchTimerInterval){clearInterval(state.couchTimerInterval);state.couchTimerInterval=null;}
    const responded=new Set(state.couchAnswers.keys());
    if(responded.size<2){
      await handleIncompleteRound(responded.size);
      return;
    }
    state.room.status='ordering';
    renderOrdering(responded);
    show('host-ordering-screen');
  }

  // PLAYER
  async function openRoomByCode(rawCode,{fromQr=false}={}){
    clearError('home-error');
    const code=String(rawCode||'').replace(/\D/g,'').slice(0,6);
    $('join-code').value=code;
    if(code.length!==6){
      if(fromQr) showError('home-error','Este QR Code não contém um código de partida válido.');
      else showError('home-error','Digite o código de 6 números.');
      return false;
    }
    const {data,error}=await db.from('order_rooms').select('*').eq('code',code).neq('status','closed').maybeSingle();
    if(error || !data){
      show('home-screen');
      showError('home-error',fromQr?'Essa partida não está mais disponível.':'Não encontrei essa partida. Confira o código.');
      return false;
    }
    state.pendingRoom=data; state.room=data; state.mode='player';
    $('player-room-code').textContent=code; $('player-name').value='';
    await loadCharacters(); renderCharacterPicker(); show('player-profile-screen');
    return true;
  }

  async function lookupRoom(){
    return openRoomByCode($('join-code').value);
  }

  function renderCharacterPicker(selected){
    const available=selectableCharacters();
    const current=selected || state.player?.character_id || available[0]?.id || '';
    const grid=$('player-character-grid');
    grid.innerHTML=available.length ? available.map(c=>`<button type="button" class="character-option ${c.id===current?'selected':''}" data-character-id="${c.id}" role="radio" aria-checked="${c.id===current?'true':'false'}" aria-label="${escapeHtml(c.name)}"><img src="${escapeHtml(c.image_url)}" alt=""></button>`).join('') : '<div class="character-catalog-empty">Nenhum personagem disponível. Cadastre personagens no painel Admin.</div>';
    grid.dataset.selected=current;
    grid.querySelectorAll('.character-option').forEach(btn=>btn.addEventListener('click',()=>{
      grid.querySelectorAll('.character-option').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-checked','false');});
      btn.classList.add('selected'); btn.setAttribute('aria-checked','true'); grid.dataset.selected=btn.dataset.characterId;
    }));
  }


  async function joinRoom(){
    clearError('player-profile-error');
    const name=$('player-name').value.trim(); const characterId=$('player-character-grid').dataset.selected;
    if(!name){showError('player-profile-error','Digite seu nome.');return;}
    if(!characterId){showError('player-profile-error','Escolha um personagem.');return;}
    if(state.player){
      const {data,error}=await db.from('order_players').update({name,character_id:characterId,color:LEGACY_PLAYER_COLOR}).eq('id',state.player.id).select().single();
      if(error){showError('player-profile-error','Não consegui salvar as alterações.');return;} state.player=data; savePlayerSession(); renderPlayerWaiting(); show('player-wait-screen'); return;
    }
    state.playerToken=uuid();
    const {data,error}=await db.from('order_players').insert({room_id:state.room.id,player_token:state.playerToken,name,character_id:characterId,color:LEGACY_PLAYER_COLOR,connected:true}).select().single();
    if(error){showError('player-profile-error','Não consegui entrar na sala. Tente novamente.');console.error(error);return;}
    state.player=data;
    state.waitForNextRoundId=(!['lobby','answering'].includes(state.room.status) && state.room.current_round_id) ? state.room.current_round_id : null;
    savePlayerSession();
    await subscribePlayer();
    await routePlayerByRoom();
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
    presence.on('broadcast',{event:'room_closed'},msg=>{if(!msg.payload?.roomId || msg.payload.roomId===state.room?.id)goHome('A partida foi encerrada pelo host.');});
    presence.subscribe(async status=>{if(status==='SUBSCRIBED')await presence.track({role:'player',playerId:state.player.id,name:state.player.name,at:Date.now()});});
    state.channels.push(presence);
  }

  function renderPlayerWaiting(){
    $('waiting-player-name').textContent=state.player.name;
    const playerCharacter=characterForPlayer(state.player);
    if(playerCharacter){
      $('player-avatar-image').src=playerCharacter.image_url; $('player-avatar-image').alt=playerCharacter.name;
    }else{
      $('player-avatar-image').removeAttribute('src'); $('player-avatar-image').alt='Personagem indisponível';
    }
    const waitCard=document.querySelector('#player-wait-screen .waiting-card');
    if(waitCard) waitCard.classList.remove('choosing-theme-mode');
    const lobby=state.room.status==='lobby'; $('lobby-edit-box').classList.toggle('hidden',!lobby);
    $('player-wait-title').textContent=lobby?'Aguardando o host':'Aguardando a próxima etapa';
    $('player-wait-copy').textContent=lobby?'Assim que a partida começar, seu tema aparecerá aqui.':'Acompanhe a tela principal. O host está conduzindo a partida.';
    $('player-wait-copy').classList.remove('hidden');
  }

  async function routePlayerByRoom(){
    if(!state.player || !state.room) return;
    if(state.room.status==='closed'){goHome('A sala foi encerrada.');return;}

    const waitingCurrentRound=!!(state.waitForNextRoundId && state.room.current_round_id===state.waitForNextRoundId);
    if(state.waitForNextRoundId && state.room.current_round_id!==state.waitForNextRoundId){
      state.waitForNextRoundId=null;
      savePlayerSession();
    }

    if(state.room.status==='answering' && !waitingCurrentRound){
      const already=state.player.answer_round_id===state.room.current_round_id;
      $('player-submitted-theme-text').textContent=state.room.current_theme_text||'Tema';
      if(already){show('player-submitted-screen');return;}
      $('player-theme-text').textContent=state.room.current_theme_text||'Tema';
      $('player-answer-input').value='';
      clearError('player-answer-error');
      show('player-answer-screen');
      startPlayerTimer();
      return;
    }

    if(state.room.status==='result' && !waitingCurrentRound){
      await renderPlayerResult();
      return;
    }

    if(['ordering','revealing','result','selecting_theme'].includes(state.room.status) || waitingCurrentRound){
      const waitCard=document.querySelector('#player-wait-screen .waiting-card');
      if(waitCard){
        waitCard.classList.toggle('choosing-theme-mode',state.room.status==='selecting_theme' && !waitingCurrentRound);
        waitCard.classList.toggle('organizing-mode',state.room.status==='ordering' && !waitingCurrentRound);
        waitCard.classList.toggle('revealing-mode',state.room.status==='revealing' && !waitingCurrentRound);
      }
      const hasTheme=!!state.room.current_theme_text;
      $('player-wait-theme').classList.toggle('hidden',!hasTheme);
      if(hasTheme){
        $('player-wait-theme-text').textContent=state.room.current_theme_text;
        const label=$('player-wait-theme-label');
        if(label) label.textContent=state.room.status==='selecting_theme'?'SUGESTÃO DE CARTA':'CARTA ATUAL';
      }
      if(waitingCurrentRound){
        $('player-wait-title').textContent='Você entra na próxima carta 👋';
        $('player-wait-copy').textContent='Esta carta já estava em andamento quando você entrou. Aguarde o host iniciar a próxima.';
      }else if(state.room.status==='selecting_theme'){
        $('player-wait-title').textContent='O host está escolhendo a carta';
        $('player-wait-copy').textContent='';
      }else if(state.room.status==='revealing'){
        $('player-wait-title').textContent='Olho na tela principal!';
        $('player-wait-copy').textContent='';
      }else{
        $('player-wait-title').textContent='Olho na tela principal!';
        $('player-wait-copy').textContent='';
      }
      $('player-wait-copy').classList.toggle('hidden',!$('player-wait-copy').textContent.trim());
      $('lobby-edit-box').classList.add('hidden');
      show('player-wait-screen');
      return;
    }
    if(state.room.status==='lobby'){
      $('player-wait-theme').classList.add('hidden');
      const waitLabel=$('player-wait-theme-label'); if(waitLabel) waitLabel.textContent='CARTA ATUAL';
      renderPlayerWaiting();
      show('player-wait-screen');
    }
  }

  async function renderPlayerResult(){
    const {data:round}=await db.from('order_rounds').select('success,theme_text').eq('id',state.room.current_round_id).maybeSingle();
    const success=!!round?.success;
    $('player-result-theme-text').textContent=round?.theme_text || state.room.current_theme_text || 'Carta';
    const resultImg=$('player-result-image');
    if(resultImg){resultImg.src=success?'assets/images/result-win.png':'assets/images/result-lose.png';resultImg.alt=success?'Vocês acertaram!':'Vocês erraram!';}
    $('player-result-screen').classList.toggle('player-result-win',success);
    $('player-result-screen').classList.toggle('player-result-lose',!success);
    show('player-result-screen');
  }

  function startPlayerTimer(){
    if(state.timerInterval)clearInterval(state.timerInterval);
    const timerBox=document.querySelector('#player-answer-screen .mobile-timer');
    if(!state.room.deadline){
      $('player-timer').textContent='∞';
      if(timerBox) timerBox.classList.add('infinite');
      return;
    }
    if(timerBox) timerBox.classList.remove('infinite');
    const run=()=>{
      const rem=Math.max(0,Math.ceil((new Date(state.room.deadline).getTime()-Date.now())/1000)); $('player-timer').textContent=rem;
      if(rem<=0){clearInterval(state.timerInterval);state.timerInterval=null;if(state.player.answer_round_id!==state.room.current_round_id){show('player-wait-screen');$('player-wait-theme').classList.remove('hidden');$('player-wait-theme-text').textContent=state.room.current_theme_text||'Tema';$('player-wait-title').textContent='Tempo encerrado';$('player-wait-copy').textContent='Você não respondeu nesta carta. Acompanhe o restante na tela principal.';$('lobby-edit-box').classList.add('hidden');}}
    }; run(); state.timerInterval=setInterval(run,250);
  }

  async function submitAnswer(){
    clearError('player-answer-error'); const value=normalizeNumber($('player-answer-input').value);
    if(value===null){showError('player-answer-error','Digite um número válido.');return;}
    if(!state.room.current_round_id){showError('player-answer-error','Essa carta já terminou.');return;}
    if(state.room.deadline && new Date(state.room.deadline).getTime()<=Date.now()){showError('player-answer-error','O tempo acabou.');return;}
    const btn=$('submit-answer-button');btn.disabled=true;
    const {error}=await db.from('order_answers').insert({round_id:state.room.current_round_id,player_id:state.player.id,value});
    if(error){
      if(error.code==='23505'){show('player-submitted-screen');return;}
      showError('player-answer-error','Não consegui enviar. Tente novamente.'); btn.disabled=false; return;
    }
    const {data}=await db.from('order_players').update({answer_round_id:state.room.current_round_id}).eq('id',state.player.id).select().single();
    if(data)state.player=data;
    if(state.timerInterval){clearInterval(state.timerInterval);state.timerInterval=null;} $('player-submitted-theme-text').textContent=state.room.current_theme_text||'Tema'; playSound('correct'); show('player-submitted-screen'); btn.disabled=false;
  }

  async function leaveMatch(){
    if(!state.player || !state.room) return;
    if(!(await appConfirm('Sair desta partida?',{title:'Sair da partida?',confirmText:'SAIR'}))) return;
    const playerId=state.player.id;
    const roomId=state.room.id;
    const playerToken=state.playerToken;
    try{
      const {error}=await db.from('order_players').update({connected:false}).eq('id',playerId).eq('room_id',roomId).eq('player_token',playerToken);
      if(error) throw error;
    }catch(err){
      console.error('Erro ao sair da partida:',err);
      toast('Não consegui registrar a saída, mas sua sessão local será encerrada.');
    }
    await goHome('Você saiu da partida.');
  }

  async function editPlayer(){
    if(state.room.status!=='lobby')return; $('player-name').value=state.player.name; $('player-room-code').textContent=state.room.code; await loadCharacters(); renderCharacterPicker(state.player.character_id); show('player-profile-screen');
  }

  let restoringPlayerSession=false;
  async function restorePlayerSession({silent=false}={}){
    if(restoringPlayerSession) return false;
    const session=loadPlayerSession();
    if(!session) return false;
    restoringPlayerSession=true;
    try{
      const [{data:room,error:roomError},{data:player,error:playerError}]=await Promise.all([
        db.from('order_rooms').select('*').eq('id',session.roomId).maybeSingle(),
        db.from('order_players').select('*').eq('id',session.playerId).eq('room_id',session.roomId).eq('player_token',session.playerToken).maybeSingle()
      ]);
      if(roomError || playerError || !room || !player || player.connected===false || room.status==='closed'){
        clearPlayerSession();
        return false;
      }
      state.mode='player';
      state.room=room;
      state.player=player;
      state.playerToken=session.playerToken;
      state.waitForNextRoundId=session.waitForNextRoundId || null;
      state.pendingRoom=null;
      savePlayerSession();
      await subscribePlayer();
      await routePlayerByRoom();
      if(!silent) toast('Você voltou para a partida.',1800);
      return true;
    }catch(err){
      console.error('Falha ao restaurar sessão do jogador:',err);
      return false;
    }finally{
      restoringPlayerSession=false;
    }
  }

  async function refreshPlayerAfterResume(){
    if(state.mode!=='player' || !state.player || !state.room) return;
    const session=loadPlayerSession();
    if(!session) return;
    try{
      const [{data:room},{data:player}]=await Promise.all([
        db.from('order_rooms').select('*').eq('id',session.roomId).maybeSingle(),
        db.from('order_players').select('*').eq('id',session.playerId).eq('room_id',session.roomId).eq('player_token',session.playerToken).maybeSingle()
      ]);
      if(!room || !player || player.connected===false || room.status==='closed'){
        await goHome('Essa partida não está mais disponível.');
        return;
      }
      state.room=room;
      state.player=player;
      await subscribePlayer();
      await routePlayerByRoom();
    }catch(err){
      console.warn('Não foi possível sincronizar a partida ao retornar:',err);
    }
  }

  function renderSetupTime(){
    const infinite=state.responseInfinite;
    $('setup-time-value').textContent=infinite?'∞':`${state.responseSeconds}s`;
    $('time-value-button').classList.toggle('infinite',infinite);
    $('time-infinite-button').classList.toggle('active',infinite);
    $('time-minus-button').disabled=infinite || state.responseSeconds<=30;
  }
  function setResponseSeconds(value){
    state.responseInfinite=false;
    state.responseSeconds=Math.max(30,Math.round(value/30)*30);
    renderSetupTime();
  }
  function toggleInfiniteTime(){
    state.responseInfinite=!state.responseInfinite;
    renderSetupTime();
  }

  // UI events
  $('join-code').addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,6)});
  $('join-code').addEventListener('keydown',e=>{if(e.key==='Enter')lookupRoom();});
  $('join-code-button').addEventListener('click',lookupRoom);
  $('create-room-home').addEventListener('click',()=>{state.mode='host';renderSetupTime();show('host-setup-screen');});
  $('create-couch-home').addEventListener('click',openCouchSetup);
  $('couch-time-minus').addEventListener('click',()=>{state.responseInfinite=false;state.responseSeconds=Math.max(30,state.responseSeconds-30);renderCouchSetupTime();});
  $('couch-time-plus').addEventListener('click',()=>{state.responseInfinite=false;state.responseSeconds+=30;renderCouchSetupTime();});
  $('couch-time-value-button').addEventListener('click',()=>{state.responseInfinite=!state.responseInfinite;renderCouchSetupTime();});
  $('couch-time-infinite').addEventListener('click',()=>{state.responseInfinite=!state.responseInfinite;renderCouchSetupTime();});
  $('couch-add-player').addEventListener('click',addCouchPlayer);
  $('start-couch-button').addEventListener('click',startCouchMatch);
  $('couch-answer-review').addEventListener('click',reviewCouchAnswer);
  $('couch-answer-input').addEventListener('keydown',e=>{if(e.key==='Enter')reviewCouchAnswer();});
  $('couch-confirm-back').addEventListener('click',closeCouchConfirmation);
  $('couch-confirm-submit').addEventListener('click',confirmCouchAnswer);
  $('time-minus-button').addEventListener('click',()=>setResponseSeconds(state.responseSeconds-30));
  $('time-plus-button').addEventListener('click',()=>setResponseSeconds(state.responseSeconds+30));
  $('time-value-button').addEventListener('click',toggleInfiniteTime);
  $('time-infinite-button').addEventListener('click',toggleInfiniteTime);
  document.querySelectorAll('[data-go-home]').forEach(b=>b.addEventListener('click',()=>goHome()));
  $('create-room-button').addEventListener('click',createRoom);
  $('close-room-button').addEventListener('click',closeRoom);
  $('start-match-button').addEventListener('click',startMatch);
  $('share-room-button')?.addEventListener('click',shareRoomLink);
  $('skip-theme-button').addEventListener('click',pickNextTheme);
  $('play-theme-button').addEventListener('click',playSelectedTheme);
  $('finish-answers-button').addEventListener('click',finishAnswers);
  $('reveal-button').addEventListener('click',revealResults);
  $('next-card-button').addEventListener('click',nextCard);
  $('end-match-result-button').addEventListener('click',endMatch);
  $('end-match-theme-button').addEventListener('click',endMatch);
  $('join-room-button').addEventListener('click',joinRoom);
  $('edit-player-button').addEventListener('click',editPlayer);
  $('player-leave-button').addEventListener('click',leaveMatch);
  $('game-mute-button')?.addEventListener('click',toggleGameMusic);
  $('app-confirm-cancel')?.addEventListener('click',()=>closeAppConfirm(false));
  $('app-confirm-ok')?.addEventListener('click',()=>closeAppConfirm(true));
  $('app-confirm-overlay')?.addEventListener('click',e=>{if(e.target===$('app-confirm-overlay') && appConfirmDismissible)closeAppConfirm(false);});
  $('submit-answer-button').addEventListener('click',submitAnswer);
  $('player-answer-input').addEventListener('keydown',e=>{if(e.key==='Enter')submitAnswer();});

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible') refreshPlayerAfterResume();
  });
  window.addEventListener('pageshow',()=>{
    if(state.mode==='player') refreshPlayerAfterResume();
  });
  window.addEventListener('online',()=>{
    if(state.mode==='player') refreshPlayerAfterResume();
  });

  async function initApp(){
    await loadCharacters();
    const restored=await restorePlayerSession({silent:true});
    if(restored) return;
    const params=new URLSearchParams(window.location.search);
    const qrRoom=params.get('room');
    if(qrRoom) await openRoomByCode(qrRoom,{fromQr:true});
  }

  initApp();


  function closeHostRoomOnPageExit(event){
    if(event?.persisted) return; // Do not close when the page is kept alive in BFCache.
    if(state.mode!=='host' || !state.room?.id || !state.hostToken) return;
    if(state.room.status==='closed') return;

    try{
      const url = `${SUPABASE_URL}/rest/v1/order_rooms?id=eq.${encodeURIComponent(state.room.id)}&host_token=eq.${encodeURIComponent(state.hostToken)}`;
      fetch(url,{
        method:'PATCH',
        headers:{
          'apikey':SUPABASE_KEY,
          'Authorization':`Bearer ${SUPABASE_KEY}`,
          'Content-Type':'application/json',
          'Prefer':'return=minimal'
        },
        body:JSON.stringify({status:'closed',deadline:null}),
        keepalive:true
      }).catch(()=>{});
    }catch(_){}
  }

  window.addEventListener('pagehide',closeHostRoomOnPageExit);

})();
