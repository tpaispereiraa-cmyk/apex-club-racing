import {drawCar} from './car-renderer.js';
import {at, path as trackPath, CIRCUIT, length, W, H} from './track.js';
import {circuitById} from './circuits.js';
import {ACTIVE_PILOT_ROUND,PILOT_ROUNDS,activePilotRound,pilotRoundById,pilotRoundUrl} from './pilot-rounds.js';
import {drsZoneAt} from './track-profile.js';
import {distanceToDRS} from './pilot-drs.js';
import {drawPilotGuides} from './pilot-track-guide.js';
import {addPilotOptions} from './pilot-options.js';
import {createPilotGhost} from './pilot-ghost.js';
import {sectorDelta, SECTOR_COLORS} from './sector-timing.js';
import {createRacingAudio} from './racing-audio.js';
import {fastestLaps, lapHistoryTable, pilotLapRows} from './lap-history.js';
import {addPilotTelemetry} from './pilot-telemetry.js';
import {addPilotEngineer} from './pilot-engineer.js';
import {makePilotCar, stepPilot, recoverPilot, setupFor, PILOT_STEP, PILOT_SETUP, GRID_ASSIST_TICKS, PRESETS, SETUP} from './pilot-driving.js';

const format = ms => ms == null ? '—' : `${Math.floor(ms/60000)}:${((ms%60000)/1000).toFixed(3).padStart(6,'0')}`;
const closeDate = new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});
const deadline = date => closeDate.format(new Date(date));
const patterns = {clean:'Clássica',stripe:'Listras',chevron:'Setas',checkers:'Xadrez',split:'Diagonal',bolt:'Raio'};
const setupHelp = {
  frontWing:{more:'A frente responde mais à direção e o carro ganha apoio em alta. Em troca, aumenta o arrasto nas retas e a traseira pode ficar mais sensível.',less:'A frente fica menos agressiva e há menos arrasto. Você perde apoio em alta e pode precisar reduzir mais para contornar as curvas.',tip:'Combine com a asa traseira: a diferença entre as duas muda o equilíbrio do carro.'},
  rearWing:{more:'Dá mais apoio e estabilidade à traseira, principalmente nas curvas rápidas. O arrasto aumenta e a velocidade nas retas cai.',less:'Reduz o arrasto e favorece a velocidade nas retas. A traseira fica mais solta e exige cuidado ao virar ou frear em curva.',tip:'É a asa que mais pesa na troca entre velocidade de reta e apoio em curva.'},
  antiRoll:{more:'Deixa a resposta da direção mais ágil, mas o carro pode ficar mais arisco nas curvas rápidas e nas frenagens com o volante virado.',less:'Deixa a direção mais dócil e menos imediata. O carro pode exigir mais comando para mudar de direção.',tip:'Perto de 5 há mais aderência mecânica. Valores muito altos ou muito baixos reduzem essa aderência.'},
  brakeBias:{more:'Se estiver abaixo de 57%, aproximar de 57% melhora a força da frenagem. Acima de 57%, aumentar faz o carro frear menos.',less:'Se estiver acima de 57%, aproximar de 57% melhora a força da frenagem. Abaixo de 57%, diminuir faz o carro frear menos.',tip:'Neste carro, 57% é o ponto de frenagem mais forte. Esse ajuste ainda não simula travamento separado das rodas dianteiras e traseiras.'},
  rideHeight:{more:'Se estiver abaixo de 43 mm, aproximar de 43 mm melhora o apoio aerodinâmico. Acima disso, subir mais reduz o apoio nas curvas rápidas.',less:'Se estiver acima de 43 mm, aproximar de 43 mm melhora o apoio. Abaixo disso, baixar mais reduz o apoio; abaixo de 34 mm a perda é maior.',tip:'43 mm é a referência de melhor apoio neste carro. A altura ainda não muda o impacto das zebras.'}
};
const phases = {
  practice:{title:'Treino <em>livre.</em>',instructions:limit=>limit==null
    ?'Voltas ilimitadas para testar acertos e buscar seu melhor tempo até o fim da sessão.'
    :`Até ${limit} voltas para testar acertos e buscar seu melhor tempo até o fim da sessão.`},
  qualifying:{title:'Classifi<em>cação.</em>',instructions:limit=>`Uma saída com ${limit} voltas rápidas seguidas. A melhor define seu lugar no grid.`},
  race:{title:'Dia de <em>corrida.</em>',instructions:limit=>`${limit} voltas rápidas, com pista seca, sem desgaste de pneus e com combustível constante. Cada posição atrás da pole soma 1,3 s ao tempo em pista.`}
};
const draftKey = 'apex-practice-setup-v1';
const pilotRound=pilotRoundById(new URLSearchParams(location.search).get('rodada'))??ACTIVE_PILOT_ROUND;
const previousRace=pilotRound.circuit==='silverstone'?pilotRoundById('2026-11-25-red-bull-ring'):null;
const roundSuffix=pilotRound.id==='2026-11-22-weekend'?'':`:${pilotRound.id}`;
const pendingKey = `apex-practice-pending-v1${roundSuffix}`;
const runKey = `apex-pilot-run-v1${roundSuffix}`;
const warmupKey = 'apex-pilot-warmup-v1';
const warmupLimit = 20;
const loginFields = `<label>Login<input name="login" autocomplete="username" minlength="3" maxlength="24" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,23}" title="3 a 24 caracteres: letras, números, ponto, hífen ou sublinhado" required></label>
  <label>Senha<input name="password" type="password" autocomplete="new-password" minlength="6" maxlength="128" required></label>`;
function readLocal(key) { try {return JSON.parse(localStorage.getItem(key));} catch {return null;} }
function writeLocal(key, value) {
  try {localStorage.setItem(key,JSON.stringify(value));return true;} catch {return false;}
}
const asQueue=value=>Array.isArray(value)?value:value?.phase?[value]:[];
const runQueue=run=>asQueue(run?.operations??run?.operation);

async function getState(path='', data) {
  const body=data ? JSON.stringify(data) : null;
  const url=new URL('/api/practice'+path,location.origin);
  url.searchParams.set('series',pilotRound.id);
  const response = await fetch(url,body ? {
    method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:body.length<48000,
    signal:['/lap','/checkpoint'].includes(path)?AbortSignal.timeout?.(10000):undefined
  } : {cache:'no-store'});
  const result = await response.json().catch(()=>null);
  if (!response.ok || !result) {
    const error = new Error(result?.error || 'Conexão indisponível. Tente novamente.');
    error.status = response.status;
    throw error;
  }
  return result;
}

function replayPoint(car,ms,progress) {
  const angle=Math.atan2(Math.sin(car.angle),Math.cos(car.angle));
  return [ms,Math.round(car.x),Math.round(car.y),Math.round(angle*1000),progress];
}

function circuitPreview() {
  const xs=trackPath.map(p=>p.x),ys=trackPath.map(p=>p.y);
  const minX=Math.min(...xs),minY=Math.min(...ys),maxX=Math.max(...xs),maxY=Math.max(...ys);
  const scale=192/Math.max(maxX-minX,maxY-minY);
  const x=p=>24+(192-(maxX-minX)*scale)/2+(p.x-minX)*scale;
  const y=p=>24+(192-(maxY-minY)*scale)/2+(p.y-minY)*scale;
  const outline=trackPath.map((p,i)=>`${i?'L':'M'}${x(p).toFixed(2)},${y(p).toFixed(2)}`).join(' ')+' Z';
  const start=at(0),direction=at(180);
  return `<aside class="pilot-circuit-card" aria-label="Circuito desta rodada"><div><span>O CIRCUITO</span><strong>${CIRCUIT.name}</strong></div><svg viewBox="0 0 240 240" role="img" aria-label="Traçado de ${CIRCUIT.name}, com largada e sentido da volta"><path d="${outline}" fill="none" stroke="#d5f56118" stroke-width="12" stroke-linejoin="round"/><path d="${outline}" fill="none" stroke="#d6e7d8" stroke-width="4" stroke-linejoin="round"/><g transform="translate(${x(start)},${y(start)}) rotate(${start.angle*180/Math.PI})"><path d="M0,-7V7" stroke="#d5f561" stroke-width="4"/></g><g transform="translate(${x(direction)},${y(direction)}) rotate(${direction.angle*180/Math.PI})"><path d="M-4,-4L2,0L-4,4" fill="none" stroke="#d5f561" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></g></svg><div class="pilot-circuit-caption"><span>${(CIRCUIT.metres/1000).toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3})} km · ${CIRCUIT.corners} curvas</span><small><i aria-hidden="true"></i>Largada / sentido</small></div></aside>`;
}

export function bootPilot({canvas,ctx,world}) {
  document.body.classList.add('pilot-mode');
  document.title=`APEX CLUB — ${CIRCUIT.name}`;
  const ui=document.createElement('section');
  ui.id='pilot';
  ui.innerHTML=`
    <nav class="pilot-nav"><a href="/" aria-label="Voltar ao APEX CLUB"><strong>A</strong> APEX CLUB</a><span>${CIRCUIT.name.toUpperCase()} / PILOTAR</span><div><button id="pilot-open-options" class="icon-button" type="button" aria-haspopup="dialog">PILOTAGEM</button><button id="pilot-sound" class="icon-button" aria-pressed="false">SOM OFF</button></div></nav>
    ${previousRace?`<a id="pilot-previous-replay-banner" href="${pilotRoundUrl(previousRace.id)}&replay=1"><strong>Veja a corrida de Red Bull Ring</strong><span>Replay da etapa anterior</span></a>`:''}
    <button type="button" id="pilot-replay-banner" hidden><strong>Assista a corrida</strong><span>Replay · ${CIRCUIT.name} →</span></button>
    <div class="pilot-garage">
      <section class="pilot-intro"><span class="pilot-kicker">GP · ${CIRCUIT.name.toUpperCase()}</span><h1>Treino <em>livre.</em></h1><p id="pilot-deadline">Consultando o cronograma…</p>
      <nav class="pilot-round-links" aria-label="Rodadas">${PILOT_ROUNDS.filter(round=>round.id!==pilotRound.id).map(round=>
        `<a href="${pilotRoundUrl(round.id)}">${round.id===ACTIVE_PILOT_ROUND.id?'Rodada atual':Date.parse(round.sessions[0][3])>Date.now()?'Próxima rodada':'Resultados e replay'} · ${circuitById(round.circuit).name} →</a>`).join('')}</nav>
      <div class="pilot-schedule" role="group" aria-label="Sessões do GP"></div>
      <p class="pilot-session-note" id="pilot-session-note"></p>
      <button id="pilot-open-telemetry" type="button" aria-haspopup="dialog" aria-controls="pilot-telemetry"><span class="telemetry-glyph" aria-hidden="true"><i></i><i></i><i></i></span><span><b>Telemetria</b><small>Compare voltas e setores dos pilotos</small></span></button>
      <div class="pilot-car-overview"><div class="pilot-car-stage"><canvas id="pilot-preview" width="480" height="230" role="img" aria-label="Prévia da pintura do seu monoposto"></canvas><div><span>VOLTAS USADAS</span><b id="pilot-quota">—</b></div></div>${circuitPreview()}</div>
      <dl class="pilot-times"><div><dt>MELHOR VOLTA</dt><dd id="pilot-best">—</dd></div><div><dt>ÚLTIMA VOLTA</dt><dd id="pilot-last">—</dd></div></dl>
      <section id="pilot-history" hidden><h2>Minhas voltas</h2><div></div></section>
      <section id="pilot-results" hidden><h2></h2><p hidden>Nenhum tempo registrado nesta sessão.</p><ol></ol></section></section>
      <section class="pilot-form-card">
        <p class="pilot-message" role="status"></p>
        <div class="pilot-account-menu" hidden>
          <button type="button" data-account="login">Entrar no meu carro</button><button type="button" data-account="register">Criar piloto</button>
        </div>
        <form id="pilot-login" hidden><h2>Entrar no meu carro</h2>
          <label id="pilot-list-label">Escolha seu piloto<select name="pilot"><option value="">Usar meu login</option></select></label>
          <label id="pilot-login-label">Login<input name="login" autocomplete="username" maxlength="24" required></label>
          <label>Senha<input name="password" type="password" autocomplete="current-password" minlength="6" maxlength="128" required></label>
          <button class="pilot-button">Entrar</button>
        </form>
        <form id="pilot-register" hidden><h2>Inscrição de piloto</h2><label>Seu nome<input name="name" autocomplete="nickname" minlength="2" maxlength="32" required></label><label>Código do convite<input name="invite" autocomplete="off" required></label>${loginFields}<label class="pilot-color">Cor de destaque<input type="color" name="color" value="#d5f561"></label><button class="pilot-button">Criar piloto</button></form>
        <div id="pilot-account-info" hidden><p></p><button type="button" id="pilot-logout">Sair do meu carro</button></div>
        <details id="pilot-credentials" hidden><summary>Cadastrar login e senha</summary>
          <form><p>Use o login e a senha para acessar este carro em outro dispositivo.</p>${loginFields}<button class="pilot-button">Cadastrar login e senha</button></form>
        </details>
        <div id="pilot-setup" hidden><h2 id="pilot-driver"></h2><p id="pilot-grid" hidden></p>
        <div id="pilot-acerto"><p>Escolha um acerto para a próxima saída.</p><div class="pilot-presets" role="group" aria-label="Acertos sugeridos">${Object.entries(PRESETS).map(([id,p])=>`<button data-preset="${id}" aria-pressed="false"><b>${p.name}</b><small>${p.description}</small></button>`).join('')}</div>
        <details><summary>Configuração avançada</summary><div class="pilot-sliders">${PILOT_SETUP.map(id=>{const s=SETUP[id],help=setupHelp[id];return `<div class="pilot-setup-control"><div class="pilot-setup-heading"><label for="pilot-adjust-${id}">${s.label}</label><button type="button" class="pilot-setup-info" data-setup-help="${id}" aria-label="Como ajustar ${s.label}" aria-expanded="false" aria-controls="pilot-help-${id}">i</button><output for="pilot-adjust-${id}"></output></div><input id="pilot-adjust-${id}" type="range" name="${id}" min="${s.min}" max="${s.max}" step="${s.step}"><div class="pilot-setup-explanation" id="pilot-help-${id}" hidden><p><strong>+ Aumentar</strong>${help.more}</p><p><strong>− Diminuir</strong>${help.less}</p><p class="pilot-setup-tip">${help.tip}</p></div></div>`;}).join('')}</div></details>
        <button type="button" id="pilot-open-engineer" aria-haspopup="dialog" aria-controls="pilot-engineer-dialog" hidden>Falar com o engenheiro</button><p id="pilot-engineer-note" role="status" hidden></p></div>
        <p id="pilot-race-setup-notice" hidden>Você iniciará <strong>ESTA</strong> corrida com a configuração de seu melhor tempo.</p>
        <div class="pilot-start-options"><button class="pilot-button" data-pilot-start="pits">Sair dos boxes</button><button class="pilot-button" data-pilot-start="flying">Iniciar volta rápida</button><button class="pilot-button" data-pilot-start="grid" hidden>Ir para a largada</button><button class="pilot-button" id="pilot-resume" hidden>Continuar</button></div>
        <button class="pilot-button" id="pilot-warmup" hidden>Treinar</button>
        <p class="pilot-start-note"></p>
        <div id="pilot-practice-progression" hidden><p>Ao concluir as 45 voltas de treino, você passa para o quali de 6 voltas rápidas. Você também pode pular o restante do treino.</p><button id="pilot-finish-practice" type="button">Pular treino e ir para o quali</button></div>
        <button type="button" id="pilot-sync-pause" hidden>Sincronizar pausa</button>
        <p class="pilot-controls">Configure as teclas, câmera e fantasma em Pilotagem. Use o scroll ou os botões + e − para ajustar a visão.</p></div>
        <details id="pilot-saved-setups" hidden><summary>Configurações salvas</summary>
          <div class="pilot-load-setup"><label>Meus acertos<select></select></label><button type="button" id="pilot-load-setup" disabled>Carregar</button></div>
          <form><label>Nome da configuração<input name="name" maxlength="40" required placeholder="Ex.: Red Bull Ring - Qualy"></label>
            <button class="pilot-button">Salvar configuração do carro</button><output role="status"></output>
          </form>
        </details>
        <form id="pilot-livery" hidden><h2>Pintura do carro</h2><div class="pilot-paints">
        <label>Principal<input type="color" name="primary"></label><label>Secundária<input type="color" name="secondary"></label><label>Destaque<input type="color" name="accent"></label><label>Número<input type="number" name="number" min="1" max="99" required></label></div>
        <fieldset><legend>Estampa</legend><div class="pilot-patterns">${Object.entries(patterns).map(([id,label])=>`<label><input type="radio" name="pattern" value="${id}" required><span data-pattern="${id}">${label}</span></label>`).join('')}</div></fieldset>
        <button class="pilot-button" disabled>Salvar pintura</button><output role="status"></output></form>
        <button id="pilot-retry" class="pilot-button" hidden>Tentar novamente</button>
      </section>
    </div>
    <section class="pilot-track" hidden>
      <div id="pilot-resume-countdown" role="status" aria-atomic="true" hidden><span>RETOMANDO SESSÃO</span><strong>3</strong></div>
      <div class="pilot-track-top"><div><span id="pilot-phase">PISTA</span><strong id="pilot-live-time">—</strong></div><div><span>VOLTAS USADAS</span><strong id="pilot-live-quota">—</strong><small id="pilot-lap-sync" hidden>Sincronizando…</small></div></div>
      <p id="pilot-radio" role="status"></p>
      <p id="pilot-ghost-status" hidden></p>
      <div class="pilot-camera-actions"><button type="button" data-zoom="-1" aria-label="Afastar câmera">−</button><button type="button" data-zoom="1" aria-label="Aproximar câmera">+</button><button type="button" data-fullscreen>Tela cheia</button></div>
      <p class="pilot-rotate-hint">Vire o celular para jogar deitado.</p>
      <div id="pilot-grid-signal" role="status" hidden><i aria-hidden="true"></i><strong></strong></div>
      <aside id="pilot-top-laps" class="live-top-laps" hidden><b>MINHAS 3 MELHORES</b><ol></ol></aside>
      <div class="pilot-splits"><span>Δ VS. SUA MELHOR VOLTA</span><div>${SECTOR_COLORS.map((color,i)=>`<div><b style="color:${color}">S${i+1}</b><output>—</output></div>`).join('')}</div></div>
      <div class="pilot-track-bottom"><div class="pilot-drive-actions"><button data-action="garage">Voltar à garagem</button><button data-action="recover">Reposicionar</button></div><div class="pilot-speed"><b id="pilot-gear">N</b><strong>0</strong> km/h <span>DRS</span></div></div>
      <div class="pilot-touch" aria-label="Controles de pilotagem"><div class="pilot-steer" role="slider" aria-label="Direção" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0" tabindex="0"><span></span></div><div class="pilot-pedals">${[['e','DRS'],['s','Freio'],['w','Acelerar']].map(([k,label])=>`<button data-key="${k}">${label}</button>`).join('')}</div></div>
    </section>`;
  document.body.append(ui);
  const $ = id => ui.querySelector(id);
  const form = $('#pilot-register'), garage = $('.pilot-garage'), track = $('.pilot-track');
  const resumeCountdown=$('#pilot-resume-countdown'), resumeNumber=resumeCountdown.querySelector('strong');
  const recoverButton=track.querySelector('[data-action=recover]');
  const loginForm = $('#pilot-login'), credentialsForm = $('#pilot-credentials form');
  const setupForm = $('#pilot-saved-setups form'), savedSetupSelect = $('#pilot-saved-setups select');
  const inviteUrl=new URL(location.href);
  const invite=inviteUrl.searchParams.get('convite')??new URLSearchParams(inviteUrl.hash.slice(1)).get('convite');
  let accountMode=invite?'register':'login';
  const paintForm = $('#pilot-livery'), schedule = $('.pilot-schedule');
  const preview = $('#pilot-preview'), previewCtx = preview.getContext('2d');
  const racingAudio=createRacingAudio();
  const soundButton=$('#pilot-sound');
  const splitOutputs=[...ui.querySelectorAll('.pilot-splits output')];
  let wantsSound=readLocal('apex-pilot-sound')!==false;
  const setSound=async on=>{
    const enabled=await racingAudio.setEnabled(on);
    soundButton.textContent=enabled?'SOM ON':'SOM OFF';
    soundButton.setAttribute('aria-pressed',String(enabled));
  };
  soundButton.onclick=()=>{
    wantsSound=!racingAudio.enabled;
    writeLocal('apex-pilot-sound',wantsSound);
    setSound(wantsSound);
  };
  const keys = new Set(), touches = new Map();
  const draft = readLocal(draftKey) ?? {};
  let preset=PRESETS[draft.preset] ? draft.preset : 'balanced', setup=setupFor(preset);
  for (const id of PILOT_SETUP) {
    const value=draft.setup?.[id], {min,max}=SETUP[id];
    if (Number.isFinite(value) && value>=min && value<=max) setup[id]=value;
  }
  if (draft.preset==='manual') preset='manual';
  let state=null, car=null, latest=null, pending=[], saving=false, busy=false;
  let attemptId=null, drivingPhase, runSetup, selectedReport=null;
  let savedRun=readLocal(runKey), lastCheckpoint=0, releaseRunLock;
  let cloudVersion=0, syncingPause=false, initialized=false;
  let warmup=readLocal(warmupKey);
  let replayFrames=[], replayPollAt=0, retryTimer=0;
  let liveryDraft=null, liveryDirty=false;
  addPilotTelemetry(ui,getState,format,()=>selectedReport??state?.phase,pilotRound.id,async (id,phase)=>{
    const {openLapReplay}=await import('./pilot-race-replay.js');
    await openLapReplay(ui,world,getState,format,id,phase);
  });
  let last=0, accumulator=0, camera=null, width=0, height=0, density=1, zoomFactor=1;
  let resumeAt=null;
  let analogue=0,steerPointer=null,lastDrsAvailable=false;
  let previousPad={};
  const ghost=createPilotGhost(ui,getState);
  const controls=addPilotOptions(ui,{
    onChange:prefs=>{zoomFactor=prefs.zoom;},
    paintPreview:(preview,zoom)=>{
      const g=preview.getContext('2d'),p=car??at(length*.93),scale=.68*zoom;
      g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,preview.width,preview.height);
      g.save();g.translate(preview.width/2,preview.height/2);g.scale(scale,scale);g.translate(-p.x,-p.y);
      const textureScale=Math.min(1,Math.sqrt(18000000/(W*H)));
      g.drawImage(world,0,0,world.width,world.height,0,0,world.width/textureScale,world.height/textureScale);
      drawCar(g,car??{...makePilotCar(setup,'#d5f561'),...p});
      g.restore();
    }
  });
  const elapsed = ()=>car?.start == null ? null : Math.round((car.elapsed-car.start)*1000);
  const message = value => {$('.pilot-message').textContent=value;};
  const radio = value => {$('#pilot-radio').textContent=value;};
  const timed = phase => phase==='qualifying'||phase==='race';
  const raceOpensAt = () => state.sessions.find(session=>session.id==='race').opensAt;
  const matchesRun = run => run && timed(state?.phase) && state.open
    && run.round===state.round && run.phase===state.phase && run.driver===state.driver?.name
    && (run.phase!=='race'||run.opensAt===raceOpensAt());
  const canResume = run => matchesRun(run) && run.car && [run.car.x,run.car.y,run.car.s,run.car.angle,run.car.v,
    run.car.model?.cdA,run.car.model?.mechanicalGrip].every(Number.isFinite) && (run.attemptId
    ? run.attemptId===state.attemptId : state.canStart);
  const warmupLaps = () => warmup?.round===state.round && warmup?.driver===state.driver?.name ? warmup.used : 0;
  const usedLaps = () => (state.used??0)+pending.filter(op=>op.phase===drivingPhase
    &&(state.practiceBeforeQualifying&&drivingPhase==='practice'?!op.start:op.start||op.nextId)).length;
  const canWarmup = () => pilotRound.warmup && !!state.driver && state.phase==='qualifying' && state.canStart
    && !canResume(savedRun) && !pending.length && warmupLaps()<warmupLimit;

  function checkpoint(paused=false) {
    if(!car||!timed(drivingPhase))return false;
    savedRun={round:state.round,phase:drivingPhase,driver:state.driver.name,car,setup:runSetup,
      attemptId,latest,camera,zoomFactor,operations:pending,replayFrames,paused,cloudVersion,cloudSynced:false,
      opensAt:drivingPhase==='race'?raceOpensAt():null};
    return writeLocal(runKey,savedRun);
  }

  async function restoreCheckpoint() {
    if(!state.driver||!timed(state.phase)||!state.open||pending.length||runQueue(savedRun).length&&matchesRun(savedRun))return;
    const {version,run}=await getState('/checkpoint');
    cloudVersion=version;
    if(canResume(run)&&(!canResume(savedRun)||(savedRun.cloudVersion??0)<version)){
      savedRun={...run,paused:true,cloudVersion:version,cloudSynced:true};
      writeLocal(runKey,savedRun);
    }
  }

  async function syncPausedRun(announce=true) {
    if(syncingPause||saving||pending.length||!canResume(savedRun)||!savedRun.paused||savedRun.cloudSynced)return;
    syncingPause=true;
    const run=savedRun;
    try{
      const {version}=await getState('/checkpoint',{version:run.cloudVersion??0,run});
      cloudVersion=version;
      if(savedRun===run){
        savedRun={...run,cloudVersion:version,cloudSynced:true};
        writeLocal(runKey,savedRun);
      }
      if(announce)message('Pausa salva. Você pode continuar em outro dispositivo.');
    }catch(error){
      if(announce)message(error.status===409?error.message:'Pausa salva neste navegador. Sincronize para continuar em outro dispositivo.');
    }finally{
      syncingPause=false;
      if(announce)showState();
    }
  }

  function clearRun() {
    savedRun=null;
    writeLocal(runKey,null);
  }

  async function lockRun() {
    if(!navigator.locks)return true;
    return new Promise((resolve,reject)=>{
      navigator.locks.request(runKey,{ifAvailable:true},lock=>{
        if(!lock){resolve(false);return;}
        return new Promise(release=>{releaseRunLock=release;resolve(true);});
      }).catch(reject);
    });
  }

  function unlockRun() {
    releaseRunLock?.();
    releaseRunLock=undefined;
  }
  const engineerNote=$('#pilot-engineer-note');
  addPilotEngineer(ui,{
    getSetup:()=>setup,
    applySetup:changes=>{
      preset='manual';
      setup={...setup,...changes};
      syncSetup();
      engineerNote.hidden=false;
      engineerNote.textContent='Acerto do engenheiro aplicado. Saia para a pista e compare seus tempos.';
    },
    canApply:()=>!!state?.canStart&&state.phase==='practice'&&Date.now()<Date.parse(state.closesAt)
  });

  function syncSetup() {
    for (const b of ui.querySelectorAll('[data-preset]')) b.setAttribute('aria-pressed',String(b.dataset.preset===preset));
    for (const input of ui.querySelectorAll('#pilot-setup input[type=range]')) {
      input.value=setup[input.name];
      input.parentElement.querySelector('output').value=input.value;
    }
    writeLocal(draftKey,{preset,setup});
  }
  function showPilotSelector() {
    const select=loginForm.elements.pilot;
    const selected=select.value;
    select.replaceChildren(new Option('Usar meu login',''),...(state.pilots??[]).map(pilot=>{
      const option=new Option(pilot.canLogin?pilot.name:`${pilot.name} · senha ainda não cadastrada`,pilot.name);
      option.disabled=!pilot.canLogin;
      return option;
    }));
    if([...select.options].some(option=>option.value===selected&&!option.disabled))select.value=selected;
    select.dispatchEvent(new Event('change'));
  }
  function showSavedSetups() {
    const selected=savedSetupSelect.value;
    const options=(state.savedSetups??[]).map(({name})=>new Option(name,name));
    savedSetupSelect.replaceChildren(new Option(options.length?'Selecione um acerto':'Nenhuma configuração salva',''),...options);
    if(options.some(option=>option.value===selected))savedSetupSelect.value=selected;
    $('#pilot-load-setup').disabled=!savedSetupSelect.value;
  }
  function drawPreview() {
    const paint=liveryDraft ?? state?.driver?.livery ?? form.elements.color.value;
    const c=makePilotCar(setup,paint);
    preview.setAttribute('aria-label',typeof paint==='string'?'Prévia do monoposto':`Monoposto número ${paint.number}, pintura ${patterns[paint.pattern]}`);
    previewCtx.clearRect(0,0,480,230);
    drawCar(previewCtx,{...c,x:228,y:123,angle:0},{scale:4.8});
  }
  function showReport() {
    const report=state.sessions.find(s=>s.id===selectedReport) ?? state.sessions.find(s=>s.id===state.phase) ?? state.sessions.at(-1);
    for(const button of schedule.children)button.setAttribute('aria-pressed',String(button.dataset.report===report.id));
    const history=$('#pilot-history'), results=$('#pilot-results'), laps=pilotLapRows(report.history);
    history.hidden=!state.driver;
    history.querySelector('h2').textContent=`Minhas voltas · ${report.name}`;
    history.querySelector('div').innerHTML=lapHistoryTable(laps,format);
    results.hidden=!report.board;
    results.querySelector('h2').textContent=report.id==='qualifying'?'Resultado da classificação':report.id==='race'?'Resultado final da corrida':'Tempos do treino';
    results.querySelector('p').hidden=!!report.board?.length;
    results.querySelector('ol').replaceChildren(...(report.board??[]).map(entry=>{
      const item=document.createElement('li'), name=document.createElement('b'), time=document.createElement('span');
      const offset=entry.grid==null?'Não largou':entry.delay===0?'P1 no grid':`P${entry.grid} no grid · +${(entry.delay/1000).toLocaleString('pt-BR')} s`;
      name.textContent=entry.name;
      time.textContent=report.id==='race'
        ? entry.official==null?`${entry.used?'Abandono':'Sem largada'} · ${entry.completed}/${report.limit}`:`${format(entry.official)} · ${offset}`
        : report.id==='qualifying'?`${entry.best==null?'Sem tempo':format(entry.best)} · ${offset}`:`${format(entry.best)} · ${entry.used} ${entry.used===1?'tentativa':'tentativas'}`;
      item.append(name,time);
      return item;
    }));
  }
  schedule.onclick=e=>{
    const button=e.target.closest('[data-report]');
    if (button){selectedReport=button.dataset.report;showReport();}
  };
  function showState() {
    if (!state) return;
    const {driver,phase,used=0,best,open,limit,closesAt,canStart,grid,lockedSetup}=state;
    $('#pilot-replay-banner').hidden=!state.replayAvailable;
    if(state.replayAvailable&&new URLSearchParams(location.search).has('replay')){
      const url=new URL(location.href);
      url.searchParams.delete('replay');
      history.replaceState(null,'',url.pathname+url.search+url.hash);
      queueMicrotask(()=>$('#pilot-replay-banner').click());
    }
    const race=phase==='race';
    const resumable=canResume(savedRun);
    const upcoming=state.sessions.find(session=>session.status==='upcoming');
    $('.pilot-intro h1').innerHTML=phases[phase]?.title ?? (upcoming?'Entre <em>sessões.</em>':'GP <em>encerrado.</em>');
    $('#pilot-deadline').textContent=open
      ? `Sessão aberta até ${deadline(closesAt)} · horário de Brasília.`
      : upcoming ? `${upcoming.name} começa em ${deadline(upcoming.opensAt)} · horário de Brasília.` : 'As três sessões foram encerradas.';
    $('#pilot-session-note').textContent=phases[phase??upcoming?.id]?.instructions((open?limit:upcoming?.limit)) ?? 'Selecione uma sessão para consultar os tempos e resultados.';
    if(!schedule.children.length){
      schedule.innerHTML=state.sessions.map(s=>`<button type="button" data-report="${s.id}"><b></b><time></time><small></small></button>`).join('');
    }
    for(const [index,session] of state.sessions.entries()){
      const button=schedule.children[index], time=button.querySelector('time');
      button.dataset.status=session.status;
      button.querySelector('b').textContent=session.name;
      time.dateTime=session.closesAt;
      time.textContent=session.gated?'Após o treino, até '+deadline(session.closesAt):session.status==='upcoming'
        ? `${deadline(session.opensAt)} – ${deadline(session.closesAt)}`
        : deadline(session.closesAt);
      button.querySelector('small').textContent={open:'Em andamento',upcoming:'Aguardando',
        closed:session.id==='race'?'Finalizada':'Encerrado'}[session.status];
    }
    $('#pilot-quota').textContent=$('#pilot-live-quota').textContent=limit==null?String(used):`${used} / ${limit}`;
    for(const span of ui.querySelectorAll('.pilot-car-stage > div > span,.pilot-track-top > div:last-child > span')){
      span.textContent=state.practiceBeforeQualifying&&phase==='practice'?'VOLTAS CONCLUÍDAS':'VOLTAS USADAS';
    }
    $('#pilot-best').textContent=format(best);
    const lastLap=state.history?.findLast(lap=>lap.ms!=null);
    $('#pilot-last').textContent=lastLap?.ms==null?'—':format(lastLap.ms)+(!lastLap.valid?' · inválida':'');
    const canRegister=open&&!race;
    if(!canRegister)accountMode='login';
    $('.pilot-account-menu').hidden=!!driver;
    for(const button of ui.querySelectorAll('[data-account]')){
      button.hidden=button.dataset.account==='register'&&!canRegister;
      button.setAttribute('aria-pressed',String(button.dataset.account===accountMode));
    }
    form.hidden=!!driver||accountMode!=='register';
    loginForm.hidden=!!driver||accountMode!=='login';
    if(!driver)showPilotSelector();
    $('#pilot-credentials').hidden=!driver||!!driver.login;
    $('#pilot-account-info').hidden=!driver?.login;
    $('#pilot-account-info p').textContent=driver?.login?`Carro de ${driver.name} · Login: ${driver.login}`:'';
    $('#pilot-saved-setups').hidden=!driver;
    showSavedSetups();
    paintForm.hidden=!driver;
    if(driver&&!liveryDirty){
      liveryDraft=driver.livery;
      for(const [key,value] of Object.entries(liveryDraft))paintForm.elements[key].value=value;
    }
    $('#pilot-setup').hidden=!driver || !open;
    $('#pilot-driver').textContent=driver?.name ?? '';
    $('#pilot-practice-progression').hidden=!(state.practiceBeforeQualifying&&phase==='practice');
    $('#pilot-finish-practice').disabled=saving||!!pending.length;
    $('#pilot-acerto').hidden=!!(race&&lockedSetup)||!canStart||resumable;
    $('#pilot-open-engineer').hidden=phase!=='practice';
    if(phase!=='practice')engineerNote.hidden=true;
    const gridNote=$('#pilot-grid');
    gridNote.hidden=!race||!grid;
    gridNote.textContent=grid?`P${grid.position} no grid · +${(grid.delay/1000).toLocaleString('pt-BR')} s ao tempo final.`:'';
    const qualified=state.sessions.find(session=>session.id==='qualifying')?.history?.some(lap=>lap.valid&&lap.ms>0);
    $('#pilot-race-setup-notice').hidden=!(race&&canStart&&!resumable&&lockedSetup&&qualified);
    const finished=state.history?.filter(lap=>lap.ms!=null) ?? [];
    $('.pilot-start-note').textContent=canStart
      ? race?'Sua corrida é individual. O resultado geral sai no fim da janela.':state.practiceBeforeQualifying&&phase==='practice'?'Só as voltas concluídas contam nas 45 voltas de treino.':'Na volta rápida, você começa antes da última curva. A tentativa conta ao cruzar a linha.'
      : finished.length===limit
        ? race?`Seu tempo oficial foi ${format(finished.reduce((total,lap)=>total+lap.ms,grid?.delay??0))}.`:`Você completou suas ${limit} voltas.`
        : 'Sua saída já foi iniciada. A sessão permite uma saída por piloto.';
    $('.pilot-start-options').dataset.phase=phase ?? '';
    const resume=$('#pilot-resume');
    resume.hidden=!resumable;
    resume.disabled=!!(pending.length||runQueue(savedRun).length||syncingPause);
    resume.textContent=race?'Continuar Race':'Continuar Qualy';
    const warmupButton=$('#pilot-warmup');
    warmupButton.hidden=!canWarmup();
    warmupButton.textContent=`Treinar · ${warmupLimit-warmupLaps()} voltas restantes`;
    if(resumable)$('.pilot-start-note').textContent='Retome do ponto em que parou. O prazo da sessão continua valendo.';
    for(const button of ui.querySelectorAll('[data-pilot-start]')){
      button.hidden=resumable||(button.dataset.pilotStart==='grid')!==race;
      button.disabled=!canStart||!!pending.length;
    }
    $('#pilot-sync-pause').hidden=!resumable||!savedRun?.paused||savedRun.cloudSynced;
    $('#pilot-sync-pause').disabled=syncingPause||!!pending.length;
    const laps=pilotLapRows(state.history);
    const top=$('#pilot-top-laps'), fastest=fastestLaps(laps);
    top.hidden=!fastest.length;
    top.querySelector('ol').replaceChildren(...fastest.map(lap=>{
      const item=document.createElement('li');
      item.textContent=`V${lap.lap} · ${format(lap.ms)}`;
      return item;
    }));
    $('#pilot-retry').hidden=!(pending.length||matchesRun(savedRun)&&runQueue(savedRun).length);
    showReport();
    drawPreview();
  }
  async function refresh() {
    try {
      state=await getState();
      if(!initialized){
        loadPending(true);
        initialized=true;
      }
      if(state.driver&&!car&&(pending.length||matchesRun(savedRun)&&runQueue(savedRun).length))await retryLap();
      await restoreCheckpoint().catch(()=>{});
      showState();
    }
    catch(error) {message(error.message);$('#pilot-retry').hidden=false;}
  }

  function loadPending(allowLegacy=false) {
    const stored=readLocal(pendingKey);
    pending=!state.driver?[]:stored?.driver===state.driver.name?asQueue(stored.operations):allowLegacy?asQueue(stored):[];
  }
  function leave() {
    car=null; track.hidden=true; garage.hidden=false;
    clearResumeCountdown();
    attemptId=null;
    keys.clear(); touches.clear();
    analogue=0;steerPointer=null;ghost.clear();
    $('.pilot-steer').style.setProperty('--steer',0);
    $('#pilot-open-options').disabled=false;
    last=0; accumulator=0; showState();
    if(!saving&&!pending.length)unlockRun();
  }

  function clearResumeCountdown() {
    resumeAt=null;
    resumeCountdown.hidden=true;
    recoverButton.disabled=false;
  }

  function persistLaps() {
    if(checkpoint())return;
    if(!car&&matchesRun(savedRun)){
      savedRun={...savedRun,operations:pending,operation:null};
      if(writeLocal(runKey,savedRun))return;
    }
    writeLocal(pendingKey,pending.length?{driver:state.driver.name,operations:pending}:null);
  }

  async function saveLap() {
    if(!pending.length||saving)return;
    clearTimeout(retryTimer);
    retryTimer=0;
    saving=true;
    let practiceFinished=false;
    try {
      while(pending.length){
        const operation=pending[0];
        state=await getState('/lap',operation);
        pending.shift();
        if(state.practiceBeforeQualifying&&operation.phase==='practice'&&state.phase==='qualifying'){
          practiceFinished=true;
          selectedReport='qualifying';
        }
        if(car&&state.practiceBeforeQualifying&&operation.phase==='practice'&&state.phase==='qualifying'){
          leave();
          message('Treino concluído. Suas 6 voltas rápidas do quali estão disponíveis.');
        }
        writeLocal(pendingKey,null);
        if(!car&&timed(operation.phase)&&matchesRun(savedRun)&&!pending.length){
          if(state.attemptId)savedRun={...savedRun,attemptId:state.attemptId};
          else clearRun();
        }
        persistLaps();
      }
      if(!car){
        const finished=state.limit!=null&&state.used>=state.limit&&!state.attemptId;
        message(practiceFinished?'Treino concluído. Suas 6 voltas rápidas do quali estão disponíveis.':finished?'Sessão concluída. Seus tempos estão no histórico.':'Voltas sincronizadas.');
        showState();
      }
    } catch(error) {
      if([400,401,409,410,413,415].includes(error.status)){
        pending=[];
        clearRun();
        writeLocal(pendingKey,null);
        leave();
        await refresh();
      }else{
        retryTimer=setTimeout(saveLap,2500);
        if(!car)showState();
      }
      message(error.status?error.message:'Conexão instável. O jogo vai reenviar as voltas salvas neste navegador.');
    } finally {
      saving=false;
      if(!car&&!pending.length){
        unlockRun();
        syncPausedRun();
      }
    }
  }
  function submitLap(operation) {
    pending.push(operation);
    attemptId=operation.start?operation.id:operation.nextId;
    persistLaps();
    if(!saving&&!retryTimer)retryTimer=setTimeout(saveLap,0);
  }
  async function retryLap() {
    if(saving)return;
    if(!car&&timed(state?.phase)){
      if(!releaseRunLock&&!await lockRun())return;
      savedRun=readLocal(runKey);
      const operations=matchesRun(savedRun)?runQueue(savedRun):[];
      if(operations.length)pending=operations;
      else if(!pending.length){unlockRun();return;}
    }
    await saveLap();
  }
  form.elements.invite.value=invite??'';
  $('.pilot-account-menu').onclick=e=>{
    const mode=e.target.closest('[data-account]')?.dataset.account;
    if(!mode||busy)return;
    accountMode=mode;
    message('');
    showState();
  };
  loginForm.elements.pilot.onchange=()=>{
    const chosen=!!loginForm.elements.pilot.value, input=loginForm.elements.login;
    $('#pilot-login-label').hidden=chosen;
    input.disabled=chosen;
  };
  form.addEventListener('input',e=>{if(e.target.name==='color')drawPreview();});
  function accountAction(button, action) {
    return async e=>{
      e.preventDefault();
      if(busy||car||syncingPause)return;
      busy=true;
      button.disabled=true;
      message('');
      try{
        await action();
        showState();
      }catch(error){message(error.message);}
      finally{busy=false;button.disabled=false;}
    };
  }
  form.onsubmit=accountAction(form.querySelector('button'),async()=>{
    state=await getState('/register',Object.fromEntries(new FormData(form)));
    if(invite){
      inviteUrl.searchParams.delete('convite');
      if(new URLSearchParams(inviteUrl.hash.slice(1)).has('convite'))inviteUrl.hash='';
      history.replaceState(null,'',inviteUrl.pathname+inviteUrl.search+inviteUrl.hash);
    }
    form.reset();
  });
  loginForm.onsubmit=accountAction(loginForm.querySelector('button'),async()=>{
    state=await getState('/login',Object.fromEntries(new FormData(loginForm)));
    loginForm.reset();
    loadPending();
    if(pending.length||matchesRun(savedRun)&&runQueue(savedRun).length)await retryLap();
    await restoreCheckpoint().catch(()=>{});
    message(`Você entrou no carro de ${state.driver.name}.`);
  });
  credentialsForm.onsubmit=accountAction(credentialsForm.querySelector('button'),async()=>{
    state=await getState('/credentials',Object.fromEntries(new FormData(credentialsForm)));
    credentialsForm.reset();
    message('Login e senha cadastrados. Você já pode entrar em outro dispositivo.');
    if(canResume(savedRun)&&!savedRun.cloudSynced){
      savedRun={...savedRun,paused:true};
      await syncPausedRun();
    }
  });
  const logout=$('#pilot-logout');
  logout.onclick=accountAction(logout,async()=>{
    if(saving||pending.length||matchesRun(savedRun)&&runQueue(savedRun).length){
      throw new Error('Aguarde a sincronização das voltas para sair.');
    }
    if(canResume(savedRun)&&!savedRun.cloudSynced){
      if(!savedRun.paused)savedRun={...savedRun,paused:true};
      await syncPausedRun(false);
      if(!savedRun.cloudSynced)throw new Error('Sincronize a pausa antes de sair do carro.');
    }
    state=await getState('/logout',{});
    liveryDraft=null;
    liveryDirty=false;
    pending=[];
    cloudVersion=0;
    accountMode='login';
    setupForm.reset();
    setupForm.querySelector('output').textContent='';
    preset='balanced';
    setup=setupFor(preset);
    syncSetup();
  });
  savedSetupSelect.onchange=()=>{$('#pilot-load-setup').disabled=!savedSetupSelect.value;};
  $('#pilot-load-setup').onclick=()=>{
    const saved=state.savedSetups.find(entry=>entry.name===savedSetupSelect.value);
    if(!saved||busy)return;
    preset='manual';
    setup={...saved.setup};
    syncSetup();
    setupForm.elements.name.value=saved.name;
    setupForm.querySelector('output').textContent=`Configuração carregada: ${saved.name}.`;
  };
  setupForm.onsubmit=async e=>{
    e.preventDefault();
    if(busy||!state.driver)return;
    const button=setupForm.querySelector('button'), output=setupForm.querySelector('output');
    busy=true;
    button.disabled=true;
    try{
      const name=setupForm.elements.name.value.trim();
      state=await getState('/setup',{name,setup});
      showState();
      savedSetupSelect.value=name.normalize('NFKC').replace(/\s+/g,' ');
      savedSetupSelect.dispatchEvent(new Event('change'));
      output.textContent='Configuração salva no seu piloto.';
    }catch(error){output.textContent=error.message;}
    finally{busy=false;button.disabled=false;}
  };
  paintForm.addEventListener('input',()=>{
    const data=Object.fromEntries(new FormData(paintForm));
    liveryDraft={...data,number:Number(data.number)||state.driver.livery.number};
    liveryDirty=true;
    paintForm.querySelector('button').disabled=false;
    paintForm.querySelector('output').textContent='';
    drawPreview();
  });
  async function saveLivery() {
    state=await getState('/livery',liveryDraft);
    liveryDirty=false;
    paintForm.querySelector('button').disabled=true;
    paintForm.querySelector('output').textContent='Pintura salva.';
    showState();
  }
  paintForm.addEventListener('submit',async e=>{
    e.preventDefault();
    if(busy||!liveryDirty)return;
    busy=true;
    try {await saveLivery();}
    catch(error){paintForm.querySelector('output').textContent=error.message;}
    finally {busy=false;}
  });
  $('#pilot-setup').addEventListener('click',e=>{
    const info=e.target.closest('[data-setup-help]');
    if(info){
      const expanded=info.getAttribute('aria-expanded')!=='true';
      info.setAttribute('aria-expanded',String(expanded));
      $('#'+info.getAttribute('aria-controls')).hidden=!expanded;
      return;
    }
    const selected=e.target.closest('[data-preset]')?.dataset.preset;
    if(selected) {preset=selected;setup=setupFor(preset);engineerNote.hidden=true;syncSetup();}
  });
  $('#pilot-setup').addEventListener('input', e=>{
    if (!PILOT_SETUP.includes(e.target.name)) return;
    preset='manual';setup[e.target.name]=Number(e.target.value);engineerNote.hidden=true;syncSetup();
  });
  async function startDriving(mode) {
    if(busy||pending.length||syncingPause)return;
    if(wantsSound)setSound(true);
    busy=true;
    message('');
    try {
      if(!await lockRun()){message('Já há uma saída aberta em outra aba.');return;}
      savedRun=readLocal(runKey);
      state=await getState();
      await restoreCheckpoint().catch(()=>{});
      warmup=readLocal(warmupKey)??warmup;
      showState();
      if(mode==='resume'){
        if(!canResume(savedRun)||runQueue(savedRun).length)return;
        ({car,attemptId,phase:drivingPhase,setup:runSetup,latest,camera}=savedRun);
        replayFrames=savedRun.replayFrames??[];
        selectedReport=drivingPhase;
        ghost.load(controls.prefs.ghost,drivingPhase);
        last=0;accumulator=0;
        garage.hidden=true;track.hidden=false;
        $('#pilot-open-options').disabled=true;
        resumeAt=performance.now()+3000;
        resumeNumber.textContent='3';
        resumeCountdown.hidden=false;
        $('#pilot-grid-signal').hidden=true;
        recoverButton.disabled=true;
        track.querySelector('[data-action=garage]').textContent='Pausar';
        return;
      }
      if(canResume(savedRun)||matchesRun(savedRun)&&runQueue(savedRun).length)return;
      const training=mode==='warmup';
      if(training&&!canWarmup())return;
      if(!state.driver||!state.canStart||(mode==='grid')!==(state.phase==='race'))return;
      if(liveryDirty&&!training){
        if(!paintForm.reportValidity())return;
        await saveLivery();
        if(!state.canStart||(mode==='grid')!==(state.phase==='race'))return;
      }
      drivingPhase=training?'warmup':state.phase;
      ghost.load(controls.prefs.ghost,training?'practice':drivingPhase);
      selectedReport=state.phase;
      runSetup={...(drivingPhase==='race'?state.lockedSetup??setup:setup)};
      car=makePilotCar(runSetup,training?liveryDraft??state.driver.livery:state.driver.livery,
        training?null:state.bestSplits??null,training?'flying':mode,state.grid?.position??1);
      replayFrames=[];
      camera=null;accumulator=0;last=0;latest=null;
      garage.hidden=true;track.hidden=false;
      $('#pilot-open-options').disabled=true;
      track.querySelector('[data-action=garage]').textContent=timed(drivingPhase)?'Pausar':'Voltar à garagem';
      checkpoint();
      if(training){
        $('#pilot-top-laps').hidden=true;
        $('#pilot-live-quota').textContent=`${warmupLaps()} / ${warmupLimit}`;
      }
      radio(training?'Aquecimento livre. Suas voltas do Qualy ficam disponíveis na garagem.':car.pit?'Segure W para sair dos boxes.':mode==='grid'?'Aguarde o sinal verde.':'Cruze a linha para iniciar a volta rápida.');
    } catch(error){message(error.message);}
    finally {busy=false;if(!car)unlockRun();}
  }
  for(const button of ui.querySelectorAll('[data-pilot-start]'))button.onclick=()=>startDriving(button.dataset.pilotStart);
  $('#pilot-resume').onclick=()=>startDriving('resume');
  $('#pilot-sync-pause').onclick=()=>syncPausedRun();
  $('#pilot-warmup').onclick=()=>startDriving('warmup');
  $('#pilot-replay-banner').onclick=async event=>{
    const button=event.currentTarget;
    button.disabled=true;
    message('');
    try{
      const {openRaceReplay}=await import('./pilot-race-replay.js');
      await openRaceReplay(ui,world,getState,format);
    }catch(error){message(error.message);}
    finally{button.disabled=false;}
  };
  $('#pilot-retry').onclick=()=>pending.length||runQueue(savedRun).length?retryLap():refresh();
  $('#pilot-finish-practice').onclick=async()=>{
    if(busy||saving||pending.length)return;
    if(!confirm('Ao ir para o quali, você encerra definitivamente seu treino desta rodada e não poderá voltar para completar as voltas restantes. Deseja continuar?'))return;
    busy=true;
    $('#pilot-finish-practice').disabled=true;
    try{
      state=await getState('/finish-practice',{confirm:true});
      latest=null;selectedReport='qualifying';
      message('Treino encerrado. Você pode iniciar suas 6 voltas rápidas do quali.');
      showState();
    }catch(error){message(error.message);}
    finally{busy=false;$('#pilot-finish-practice').disabled=false;}
  };
  addEventListener('online',()=>{if(pending.length)saveLap();});
  function exitTrack() {
    if(timed(drivingPhase)){
      if(!checkpoint(true)){radio('Não foi possível salvar a pausa neste navegador.');return;}
      leave();
      message('Sessão pausada. Sincronizando para outros dispositivos…');
      syncPausedRun();
      return;
    }
    leave();
  }
  track.addEventListener('click',e=>{
    const zoom=e.target.closest('[data-zoom]');
    if(zoom)controls.setZoom(zoomFactor+Number(zoom.dataset.zoom)*.1);
    if(e.target.closest('[data-fullscreen]'))document.documentElement.requestFullscreen?.().catch(()=>radio('Tela cheia indisponível neste navegador.'));
    if(e.target.dataset.action==='garage')exitTrack();
    if(e.target.dataset.action==='recover' && car && !car.pit && !car.gridRed && resumeAt===null)recoverPilot(car);
  });
  addEventListener('keydown',e=>{
    if(!car||e.ctrlKey||e.altKey||e.metaKey||ui.querySelector('dialog[open]'))return;
    const key=controls.action(e);
    if(!key)return;
    e.preventDefault();
    if(key==='pause'){if(!e.repeat)exitTrack();return;}
    if(key==='zoomIn'||key==='zoomOut'){controls.setZoom(zoomFactor+(key==='zoomIn'?.1:-.1));return;}
    keys.add(key);
  });
  addEventListener('keyup',e=>keys.delete(controls.action(e)));
  addEventListener('blur',()=>{keys.clear();touches.clear();analogue=0;});
  addEventListener('pagehide',()=>{if(car&&checkpoint(true))syncPausedRun(false);});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&car&&timed(drivingPhase))exitTrack();
  });
  addEventListener('wheel',e=>{
    if(!car||e.ctrlKey)return;
    e.preventDefault();
    controls.setZoom(zoomFactor*Math.exp(-Math.sign(e.deltaY)*.12));
  },{passive:false});
  track.addEventListener('pointerdown',e=>{
    const b=e.target.closest('[data-key]');
    if(b){e.preventDefault();b.setPointerCapture(e.pointerId);touches.set(e.pointerId,b.dataset.key);b.dataset.pressed='true';}
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture']) track.addEventListener(type,e=>{
    touches.delete(e.pointerId);
    const b=e.target.closest('[data-key]');
    if(b)b.dataset.pressed=String([...touches.values()].includes(b.dataset.key));
  });
  const steering=$('.pilot-steer');
  function steerAt(event){
    const rect=steering.getBoundingClientRect();
    analogue=Math.max(-1,Math.min(1,(event.clientX-rect.left-rect.width/2)/(rect.width*.4)));
    steering.style.setProperty('--steer',analogue);
    steering.setAttribute('aria-valuenow',String(Math.round(analogue*100)));
  }
  steering.onpointerdown=event=>{
    if(steerPointer!==null)return;
    event.preventDefault();steerPointer=event.pointerId;steering.setPointerCapture(event.pointerId);steerAt(event);
  };
  steering.onpointermove=event=>{if(event.pointerId===steerPointer)steerAt(event);};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])steering.addEventListener(type,event=>{
    if(event.pointerId!==steerPointer)return;
    steerPointer=null;analogue=0;steering.style.setProperty('--steer',0);steering.setAttribute('aria-valuenow','0');
  });

  function resize() {
    width=innerWidth;height=innerHeight;density=Math.min(matchMedia('(pointer: coarse)').matches?1.25:2,devicePixelRatio||1);
    canvas.width=Math.round(width*density);canvas.height=Math.round(height*density);
  }
  function paint(target) {
    const zoom=(width<620?.52:.68)*zoomFactor;
    const look = Math.min(car&&!car.pit?86+car.v*2.25:60,height*.24/zoom);
    const x=target.x+Math.cos(target.angle)*look,y=target.y+Math.sin(target.angle)*look;
    if(!camera)camera={x,y};
    camera.x+=(x-camera.x)*.15;camera.y+=(y-camera.y)*.15;
    ctx.setTransform(density,0,0,density,0,0);
    ctx.fillStyle='#24392b';ctx.fillRect(0,0,width,height);
    ctx.save();ctx.translate(width/2,height/2);ctx.scale(zoom,zoom);ctx.translate(-camera.x,-camera.y);
    ctx.drawImage(world,0,0,world.width,world.height,0,0,world.width/targetTextureScale,world.height/targetTextureScale);
    drawPilotGuides(ctx,{line:controls.prefs.line,drs:controls.prefs.drsZones});
    ghost.draw(ctx,car,controls.prefs.opacity,controls.prefs.ghost!=='off');
    if(car)drawCar(ctx,car,{player:true});
    ctx.restore();
  }
  const targetTextureScale=Math.min(1,Math.sqrt(18000000/(W*H)));
  const idle=at(length*.93);
  function frame(now) {
    requestAnimationFrame(frame);
    const dt=last?Math.min(.1,(now-last)/1000):0;
    last=now;
    const pad=controls.pollGamepad();
    if(car){
      if(pad.pause>.5&&!(previousPad.pause>.5))exitTrack();
      if(pad.zoomIn>.5&&!(previousPad.zoomIn>.5))controls.setZoom(zoomFactor+.1);
      if(pad.zoomOut>.5&&!(previousPad.zoomOut>.5))controls.setZoom(zoomFactor-.1);
    }
    previousPad=pad;
    if(car) {
      if(Date.now()>=Date.parse(state.closesAt)){
        if(timed(drivingPhase)&&!pending.length)clearRun();
        leave();
        if(!pending.length)refresh();
        return;
      }
      const resuming=resumeAt!==null;
      if(resuming){
        const seconds=Math.ceil((resumeAt-now)/1000);
        if(seconds<=0)clearResumeCountdown();
        else if(resumeNumber.textContent!==String(seconds))resumeNumber.textContent=String(seconds);
      }
      if(!resuming&&!document.hidden) {
        accumulator+=dt;
        const pressed=new Set([...keys,...touches.values()]);
        const input=Object.fromEntries([...pressed].map(key=>[key,true]));
        input.a=Math.max(Number(input.a||0),-analogue,pad.a);
        input.d=Math.max(Number(input.d||0),analogue,pad.d);
        input.w=Math.max(Number(input.w||0),pad.w);
        input.s=Math.max(Number(input.s||0),pad.s);
        input.e=!!input.e||pad.e>.5;
        input.drsToggle=controls.prefs.drsMode==='toggle';
        while(car&&accumulator>=PILOT_STEP) {
          accumulator-=PILOT_STEP;
          const before=car.start;
          const lap=stepPilot(car,input);
          if(drivingPhase==='warmup'){
            if(!lap)continue;
            latest=lap;
            warmup={round:state.round,driver:state.driver.name,used:warmupLaps()+1};
            writeLocal(warmupKey,warmup);
            $('#pilot-live-quota').textContent=`${warmup.used} / ${warmupLimit}`;
            if(warmup.used>=warmupLimit){
              leave();
              message('Aquecimento concluído. Suas voltas do Qualy estão disponíveis.');
            }
          }else if(lap) {
            latest=lap;
            const consumed=usedLaps()+(state.practiceBeforeQualifying&&drivingPhase==='practice'?1:0);
            const nextId=state.limit==null||consumed<state.limit?crypto.randomUUID():null;
            let replay;
            if(replayFrames[0]?.[0]===0&&(drivingPhase!=='practice'||lap.ms<=(state.best??Infinity))){
              replay=replayFrames;
              if(replay.at(-1)[0]===lap.ms)replay.pop();
              replay.push(replayPoint(car,lap.ms,10000));
            }
            replayFrames=[replayPoint(car,0,0)];
            submitLap({...lap,id:attemptId,nextId,phase:drivingPhase,replay});
            if(!nextId){
              leave();
              message('Última volta concluída. Sincronizando os tempos…');
            }
          }else if(before===null&&car.start!==null){
            replayFrames=[replayPoint(car,0,0)];
            submitLap({start:true,id:crypto.randomUUID(),phase:drivingPhase,setup:runSetup});
          }else if(car.start!==null&&replayFrames.length){
            const ms=elapsed();
            if(ms-replayFrames.at(-1)[0]>=100){
              const start=car.gate-car.sector*length/8;
              const progress=Math.max(0,Math.min(9999,Math.round((car.progress-start)/length*10000)));
              replayFrames.push(replayPoint(car,ms,progress));
            }
          }
        }
      }
      if(car) {
        if(now-lastCheckpoint>=500&&timed(drivingPhase)){checkpoint();lastCheckpoint=now;}
        if(drivingPhase!=='warmup'){
          const used=usedLaps();
          const quota=state.limit==null?String(used):`${used} / ${state.limit}`;
          const label=$('#pilot-live-quota');
          if(label.textContent!==quota)label.textContent=quota;
        }
        $('#pilot-lap-sync').hidden=!pending.length;
        const signal=$('#pilot-grid-signal'), red=car.gridRed>0, green=!red&&car.gridAssist>0;
        signal.hidden=resuming||!(red||green);
        if(!signal.hidden){
          signal.dataset.light=red?'red':'green';
          const label=red?`P${state.grid?.position??1} · ${Math.ceil(car.gridRed*PILOT_STEP)}`:'VERDE · ACELERE';
          const title=signal.querySelector('strong');
          if(title.textContent!==label)title.textContent=label;
        }
        $('#pilot-phase').textContent=drivingPhase==='warmup'?'AQUECIMENTO':car.pit?'PIT LANE':car.start!==null?(drivingPhase==='race'?'VOLTA DE CORRIDA':'VOLTA RÁPIDA'):car.startMode==='grid'?'LARGADA':car.startMode==='flying'?'APROXIMAÇÃO':'VOLTA DE SAÍDA';
        $('#pilot-live-time').textContent=format(elapsed());
        $('.pilot-speed strong').textContent=Math.round(car.v*3.6);
        const brake=!resuming&&(keys.has('s')||[...touches.values()].includes('s')||pad.s>.03);
        const throttle=!resuming&&!red&&!brake?Math.max(Number(green||keys.has('w')||[...touches.values()].includes('w')),pad.w):0;
        const revs=racingAudio.update({active:!document.hidden,speed:car.v,throttle,braking:brake});
        $('#pilot-gear').textContent=car.v<.4&&!throttle?'N':revs.gear;
        for(const [i,output] of splitOutputs.entries()){
          const split=car.splits[i]??car.lastSplits[i];
          const delta=split?.delta??null;
          const label=sectorDelta(delta==null?null:delta/1000);
          if(output.value!==label)output.value=label;
          output.dataset.trend=delta<0?'gain':delta>0?'loss':'';
        }
        const drsAvailable=!car.pit&&drsZoneAt(car.s)>=0,drsLabel=$('.pilot-speed span');
        if(drsAvailable&&!lastDrsAvailable&&!resuming)racingAudio.notifyDRS();
        lastDrsAvailable=drsAvailable;
        drsLabel.dataset.available=String(drsAvailable);
        drsLabel.dataset.active=String(car.drs);
        const approaching=!car.pit&&distanceToDRS(car.s)<=180;
        drsLabel.textContent=car.drs?'DRS ABERTO':drsAvailable?'DRS DISPONÍVEL':car.drsArmed&&controls.prefs.drsMode==='toggle'?'DRS ARMADO':approaching?'DRS À FRENTE':'DRS FECHADO';
        const touchDRS=track.querySelector('[data-key=e]');
        touchDRS.dataset.active=String(car.drs);
        touchDRS.setAttribute('aria-label',drsLabel.textContent);
        ghost.update(car);
        radio(resuming?'Aguarde a contagem para continuar.':red?'Aguarde o sinal verde.':green?'Largada liberada · mantenha W ou ↑ para acelerar.':car.pit?'Segure W para sair dos boxes.':car.spin>0?'Rodada · alivie os comandos para recuperar.':car.locked?'Rodas travadas · alivie o freio.':car.off?'Brita · aderência reduzida.':car.start===null?'Cruze a linha para começar o cronômetro.':latest?`Última volta ${format(latest.ms)}`:'Volta cronometrada em andamento.');
      }
    } else racingAudio.update();
    paint(car??idle);
  }
  resize();addEventListener('resize',resize);
  syncSetup();drawPreview();refresh();requestAnimationFrame(frame);
  setInterval(()=>{
    if(car||busy||saving||pending.length||!state)return;
    const now=Date.now();
    if(!new URLSearchParams(location.search).has('rodada')&&activePilotRound(now).id!==pilotRound.id){
      location.reload();
      return;
    }
    if(state.driver&&!state.replayReady&&now>=Date.parse(state.replayAt)&&now>=replayPollAt){
      replayPollAt=now+5000;
      refresh();
      return;
    }
    const transition=state.open ? state.closesAt : state.sessions.find(session=>session.status==='upcoming'&&!session.gated)?.opensAt;
    if(now>=Date.parse(transition))refresh();
  },1000);
}
