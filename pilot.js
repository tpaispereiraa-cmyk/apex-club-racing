import {drawCar} from './car-renderer.js';
import {at, length, W, H} from './track.js';
import {drsZoneAt} from './track-profile.js';
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
const phases = {
  practice:{title:'Treino <em>livre.</em>',instructions:()=> 'Voltas ilimitadas para testar acertos e buscar seu melhor tempo até o fim da sessão.'},
  qualifying:{title:'Classifi<em>cação.</em>',instructions:limit=>`Uma saída com ${limit} voltas rápidas seguidas. A melhor define seu lugar no grid.`},
  race:{title:'Dia de <em>corrida.</em>',instructions:limit=>`${limit} voltas rápidas, com pista seca, sem desgaste de pneus e com combustível constante. Cada posição atrás da pole soma 2 s ao tempo em pista.`}
};
const draftKey = 'apex-practice-setup-v1';
const pendingKey = 'apex-practice-pending-v1';
const runKey = 'apex-pilot-run-v1';
const warmupKey = 'apex-pilot-warmup-v1';
const warmupLimit = 20;
function readLocal(key) { try {return JSON.parse(localStorage.getItem(key));} catch {return null;} }
function writeLocal(key, value) {
  try {localStorage.setItem(key,JSON.stringify(value));return true;} catch {return false;}
}

async function getState(path='', data) {
  const body=data ? JSON.stringify(data) : null;
  const response = await fetch('/api/practice'+path,body ? {
    method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:body.length<48000
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

export function bootPilot({canvas,ctx,world}) {
  document.body.classList.add('pilot-mode');
  document.title='APEX CLUB — GP de Interlagos';
  const ui=document.createElement('section');
  ui.id='pilot';
  ui.innerHTML=`
    <nav class="pilot-nav"><a href="/" aria-label="Voltar ao APEX CLUB"><strong>A</strong> APEX CLUB</a><span>INTERLAGOS / PILOTAR</span><button id="pilot-sound" class="icon-button" aria-pressed="false">SOM OFF</button></nav>
    <button type="button" id="pilot-replay-banner" hidden><strong>Assista a corrida</strong><span>Replay do GP de Interlagos →</span></button>
    <div class="pilot-garage">
      <section class="pilot-intro"><span class="pilot-kicker">GP DE INTERLAGOS</span><h1>Treino <em>livre.</em></h1><p id="pilot-deadline">Consultando o cronograma…</p>
      <div class="pilot-schedule" role="group" aria-label="Sessões do GP"></div>
      <p class="pilot-session-note" id="pilot-session-note"></p>
      <button id="pilot-open-telemetry" type="button" aria-haspopup="dialog" aria-controls="pilot-telemetry"><span class="telemetry-glyph" aria-hidden="true"><i></i><i></i><i></i></span><span><b>Telemetria</b><small>Compare voltas e setores dos pilotos</small></span></button>
      <div class="pilot-car-stage"><canvas id="pilot-preview" width="480" height="230" role="img" aria-label="Prévia da pintura do seu monoposto"></canvas><div><span>VOLTAS USADAS</span><b id="pilot-quota">—</b></div></div>
      <dl class="pilot-times"><div><dt>MELHOR VOLTA</dt><dd id="pilot-best">—</dd></div><div><dt>ÚLTIMA VOLTA</dt><dd id="pilot-last">—</dd></div></dl>
      <section id="pilot-history" hidden><h2>Minhas voltas</h2><div></div></section>
      <section id="pilot-results" hidden><h2></h2><p hidden>Nenhum tempo registrado nesta sessão.</p><ol></ol></section></section>
      <section class="pilot-form-card">
        <p class="pilot-message" role="status"></p>
        <form id="pilot-register" hidden><h2>Inscrição de piloto</h2><label>Seu nome<input name="name" autocomplete="nickname" minlength="2" maxlength="32" required></label><label>Código do convite<input name="invite" autocomplete="off" required></label><label class="pilot-color">Cor de destaque<input type="color" name="color" value="#d5f561"></label><button class="pilot-button">Entrar no GP</button></form>
        <div id="pilot-setup" hidden><h2 id="pilot-driver"></h2><p id="pilot-grid" hidden></p>
        <div id="pilot-acerto"><p>Escolha um acerto para a próxima saída.</p><div class="pilot-presets" role="group" aria-label="Acertos sugeridos">${Object.entries(PRESETS).map(([id,p])=>`<button data-preset="${id}" aria-pressed="false"><b>${p.name}</b><small>${p.description}</small></button>`).join('')}</div>
        <details><summary>Configuração avançada</summary><div class="pilot-sliders">${PILOT_SETUP.map(id=>{const s=SETUP[id];return `<label><span>${s.label} <output></output></span><input type="range" name="${id}" min="${s.min}" max="${s.max}" step="${s.step}"></label>`;}).join('')}</div></details>
        <button type="button" id="pilot-open-engineer" aria-haspopup="dialog" aria-controls="pilot-engineer-dialog" hidden>Falar com o engenheiro</button><p id="pilot-engineer-note" role="status" hidden></p></div>
        <div class="pilot-start-options"><button class="pilot-button" data-pilot-start="pits">Sair dos boxes</button><button class="pilot-button" data-pilot-start="flying">Iniciar volta rápida</button><button class="pilot-button" data-pilot-start="grid" hidden>Ir para a largada</button><button class="pilot-button" id="pilot-resume" hidden>Continuar</button></div>
        <button class="pilot-button" id="pilot-warmup" hidden>Treinar</button>
        <p class="pilot-start-note"></p>
        <p class="pilot-controls"><kbd>W</kbd> acelerar <kbd>A</kbd><kbd>D</kbd> virar <kbd>S</kbd> frear <kbd>E</kbd> DRS · Scroll para ajustar o zoom</p></div>
        <form id="pilot-livery" hidden><h2>Pintura do carro</h2><div class="pilot-paints">
        <label>Principal<input type="color" name="primary"></label><label>Secundária<input type="color" name="secondary"></label><label>Destaque<input type="color" name="accent"></label><label>Número<input type="number" name="number" min="1" max="99" required></label></div>
        <fieldset><legend>Estampa</legend><div class="pilot-patterns">${Object.entries(patterns).map(([id,label])=>`<label><input type="radio" name="pattern" value="${id}" required><span data-pattern="${id}">${label}</span></label>`).join('')}</div></fieldset>
        <button class="pilot-button" disabled>Salvar pintura</button><output role="status"></output></form>
        <button id="pilot-retry" class="pilot-button" hidden>Tentar novamente</button>
      </section>
    </div>
    <section class="pilot-track" hidden>
      <div class="pilot-track-top"><div><span id="pilot-phase">PISTA</span><strong id="pilot-live-time">—</strong></div><div><span>VOLTAS USADAS</span><strong id="pilot-live-quota">—</strong></div></div>
      <p id="pilot-radio" role="status"></p>
      <div id="pilot-grid-signal" role="status" hidden><i aria-hidden="true"></i><strong></strong></div>
      <aside id="pilot-top-laps" class="live-top-laps" hidden><b>MINHAS 3 MELHORES</b><ol></ol></aside>
      <div class="pilot-splits"><span>Δ VS. SUA MELHOR VOLTA</span><div>${SECTOR_COLORS.map((color,i)=>`<div><b style="color:${color}">S${i+1}</b><output>—</output></div>`).join('')}</div></div>
      <div class="pilot-track-bottom"><div class="pilot-drive-actions"><button data-action="garage">Voltar à garagem</button><button data-action="recover">Reposicionar</button></div><div class="pilot-speed"><b id="pilot-gear">N</b><strong>0</strong> km/h <span>DRS</span></div></div>
      <div class="pilot-touch" aria-label="Controles de pilotagem">${[['a','◀'],['d','▶'],['e','DRS'],['s','Freio'],['w','Acelerar']].map(([k,label])=>`<button data-key="${k}">${label}</button>`).join('')}</div>
    </section>`;
  document.body.append(ui);
  const $ = id => ui.querySelector(id);
  const form = $('#pilot-register'), garage = $('.pilot-garage'), track = $('.pilot-track');
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
  let state=null, car=null, latest=null, pending=readLocal(pendingKey), saving=false, busy=false;
  let attemptId=null, drivingPhase, runSetup, selectedReport=null;
  let savedRun=readLocal(runKey), lastCheckpoint=0, releaseRunLock;
  let warmup=readLocal(warmupKey);
  let replayFrames=[], replayPollAt=0;
  let liveryDraft=null, liveryDirty=false;
  addPilotTelemetry(ui,getState,format,()=>selectedReport??state?.phase,async id=>{
    const {openQualifyingReplay}=await import('./pilot-race-replay.js');
    await openQualifyingReplay(ui,world,getState,format,id);
  });
  if(pending&&!pending.phase){pending=null;writeLocal(pendingKey,null);}
  let last=0, accumulator=0, camera=null, width=0, height=0, density=1, zoomFactor=1;
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
  const canWarmup = () => !!state.driver && state.phase==='qualifying' && state.canStart
    && !canResume(savedRun) && !pending && warmupLaps()<warmupLimit;

  function checkpoint() {
    if(!car||!timed(drivingPhase))return false;
    savedRun={round:state.round,phase:drivingPhase,driver:state.driver.name,car,setup:runSetup,
      attemptId,latest,camera,zoomFactor,operation:pending,replayFrames,
      opensAt:drivingPhase==='race'?raceOpensAt():null};
    return writeLocal(runKey,savedRun);
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
    for (const input of ui.querySelectorAll('input[type=range]')) {
      input.value=setup[input.name];
      input.parentElement.querySelector('output').value=input.value;
    }
    writeLocal(draftKey,{preset,setup});
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
    results.querySelector('h2').textContent=report.id==='qualifying'?'Grid de largada':report.id==='race'?'Resultado final da corrida':'Tempos do treino';
    results.querySelector('p').hidden=!!report.board?.length;
    results.querySelector('ol').replaceChildren(...(report.board??[]).map(entry=>{
      const item=document.createElement('li'), name=document.createElement('b'), time=document.createElement('span');
      const offset=entry.delay===0?'pole':`+${entry.delay/1000} s no grid`;
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
      time.textContent=session.status==='upcoming'
        ? `${deadline(session.opensAt)} – ${deadline(session.closesAt)}`
        : deadline(session.closesAt);
      button.querySelector('small').textContent={open:'Em andamento',upcoming:'Aguardando',
        closed:session.id==='race'?'Finalizada':'Encerrado'}[session.status];
    }
    $('#pilot-quota').textContent=$('#pilot-live-quota').textContent=limit==null?String(used):`${used} / ${limit}`;
    $('#pilot-best').textContent=format(best);
    const lastLap=state.history?.findLast(lap=>lap.ms!=null);
    $('#pilot-last').textContent=lastLap?.ms==null?'—':format(lastLap.ms)+(!lastLap.valid?' · inválida':'');
    form.hidden=!!driver || !open || race;
    paintForm.hidden=!driver;
    if(driver&&!liveryDirty){
      liveryDraft=driver.livery;
      for(const [key,value] of Object.entries(liveryDraft))paintForm.elements[key].value=value;
    }
    $('#pilot-setup').hidden=!driver || !open;
    $('#pilot-driver').textContent=driver?.name ?? '';
    $('#pilot-acerto').hidden=!!(race&&lockedSetup)||!canStart||resumable;
    $('#pilot-open-engineer').hidden=phase!=='practice';
    if(phase!=='practice')engineerNote.hidden=true;
    const gridNote=$('#pilot-grid');
    gridNote.hidden=!race||!grid;
    gridNote.textContent=grid?`P${grid.position} no grid · +${grid.delay/1000} s ao tempo final.${lockedSetup?' Acerto da classificação aplicado.':''}`:'';
    const finished=state.history?.filter(lap=>lap.ms!=null) ?? [];
    $('.pilot-start-note').textContent=canStart
      ? race?'Sua corrida é individual. O resultado geral sai no fim da janela.':'Na volta rápida, você começa antes da última curva. A tentativa conta ao cruzar a linha.'
      : finished.length===limit
        ? race?`Seu tempo oficial foi ${format(finished.reduce((total,lap)=>total+lap.ms,grid?.delay??0))}.`:`Você completou suas ${limit} voltas.`
        : 'Sua saída já foi iniciada. A sessão permite uma saída por piloto.';
    $('.pilot-start-options').dataset.phase=phase ?? '';
    const resume=$('#pilot-resume');
    resume.hidden=!resumable;
    resume.disabled=!!(pending||savedRun?.operation);
    resume.textContent=race?'Continuar Race':'Continuar Qualy';
    const warmupButton=$('#pilot-warmup');
    warmupButton.hidden=!canWarmup();
    warmupButton.textContent=`Treinar · ${warmupLimit-warmupLaps()} voltas restantes`;
    if(resumable)$('.pilot-start-note').textContent='Retome do ponto em que parou. O prazo da sessão continua valendo.';
    for(const button of ui.querySelectorAll('[data-pilot-start]')){
      button.hidden=resumable||(button.dataset.pilotStart==='grid')!==race;
      button.disabled=!canStart||!!pending;
    }
    if(!driver&&race)message('As inscrições encerraram. Pilotos inscritos podem entrar pelo navegador usado na inscrição.');
    const laps=pilotLapRows(state.history);
    const top=$('#pilot-top-laps'), fastest=fastestLaps(laps);
    top.hidden=!fastest.length;
    top.querySelector('ol').replaceChildren(...fastest.map(lap=>{
      const item=document.createElement('li');
      item.textContent=`V${lap.lap} · ${format(lap.ms)}`;
      return item;
    }));
    $('#pilot-retry').hidden=!(pending||matchesRun(savedRun)&&savedRun.operation);
    showReport();
    drawPreview();
  }
  async function refresh() {
    try {
      state=await getState();
      if(!car&&matchesRun(savedRun)&&savedRun.operation)await retryLap();
      showState();
    }
    catch(error) {message(error.message);$('#pilot-retry').hidden=false;}
  }
  function leave() {
    car=null; track.hidden=true; garage.hidden=false;
    attemptId=null;
    keys.clear(); touches.clear();
    last=0; accumulator=0; showState();
    if(!saving)unlockRun();
  }
  async function saveLap() {
    if (!pending || saving) return;
    saving=true;
    radio(pending.start?'Registrando início da volta…':'Gravando volta…');
    try {
      const operation=pending;
      state=await getState('/lap',pending);
      if(car){car.bestSplits=state.bestSplits??null;attemptId=state.attemptId??null;}
      pending=null;writeLocal(pendingKey,null);
      if(timed(operation.phase)&&matchesRun(savedRun)&&savedRun.operation?.id===operation.id){
        if(state.attemptId){
          savedRun={...savedRun,attemptId:state.attemptId,operation:null};
          savedRun.car.bestSplits=state.bestSplits??null;
          writeLocal(runKey,savedRun);
        }else clearRun();
      }
      message('');
      const sessionEnded=state.limit!=null&&state.used>=state.limit&&!state.attemptId;
      if(!state.open||(!attemptId&&car)||sessionEnded) {
        leave();
        message(sessionEnded?'Sessão concluída. Seus tempos estão no histórico.':'A tentativa foi encerrada.');
      }
      showState();
    } catch(error) {
      if ([400,401,409,410].includes(error.status)) {
        if(savedRun?.operation?.id===pending?.id)clearRun();
        pending=null;writeLocal(pendingKey,null);
      }
      leave();message(error.message);
      if(!pending)await refresh();
    } finally {saving=false;accumulator=0;if(!car)unlockRun();}
  }
  function submitLap(operation) {
    pending=operation;
    if(!checkpoint())writeLocal(pendingKey,pending);
    saveLap();
  }
  async function retryLap() {
    if(saving)return;
    if(!car&&timed(state?.phase)){
      if(!await lockRun())return;
      savedRun=readLocal(runKey);
      if(matchesRun(savedRun)&&savedRun.operation)pending=savedRun.operation;
      else if(!pending||!readLocal(pendingKey)){pending=null;unlockRun();return;}
    }
    await saveLap();
  }
  const params=new URLSearchParams(location.hash.slice(1));
  form.elements.invite.value=params.get('convite') ?? '';
  form.addEventListener('input',e=>{if(e.target.name==='color')drawPreview();});
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    if (busy) return;
    busy=true;
    form.querySelector('button').disabled=true;
    message('');
    try {
      state=await getState('/register',Object.fromEntries(new FormData(form)));
      if(params.has('convite'))history.replaceState(null,'',location.pathname);
      showState();
    } catch(error) {message(error.message);}
    finally {busy=false;form.querySelector('button').disabled=false;}
  });
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
    const selected=e.target.closest('[data-preset]')?.dataset.preset;
    if(selected) {preset=selected;setup=setupFor(preset);engineerNote.hidden=true;syncSetup();}
  });
  $('#pilot-setup').addEventListener('input', e=>{
    if (!PILOT_SETUP.includes(e.target.name)) return;
    preset='manual';setup[e.target.name]=Number(e.target.value);engineerNote.hidden=true;syncSetup();
  });
  async function startDriving(mode) {
    if(busy || pending) return;
    if(wantsSound)setSound(true);
    busy=true;
    message('');
    try {
      if(!await lockRun()){message('Já há uma saída aberta em outra aba.');return;}
      savedRun=readLocal(runKey);
      state=await getState();
      warmup=readLocal(warmupKey)??warmup;
      showState();
      if(mode==='resume'){
        if(!canResume(savedRun)||savedRun.operation)return;
        ({car,attemptId,phase:drivingPhase,setup:runSetup,latest,camera,zoomFactor}=savedRun);
        replayFrames=savedRun.replayFrames??[];
        selectedReport=drivingPhase;
        last=0;accumulator=0;
        garage.hidden=true;track.hidden=false;
        track.querySelector('[data-action=garage]').textContent='Pausar';
        return;
      }
      if(canResume(savedRun)||matchesRun(savedRun)&&savedRun.operation)return;
      const training=mode==='warmup';
      if(training&&!canWarmup())return;
      if(!state.driver||!state.canStart||(mode==='grid')!==(state.phase==='race'))return;
      if(liveryDirty&&!training){
        if(!paintForm.reportValidity())return;
        await saveLivery();
        if(!state.canStart||(mode==='grid')!==(state.phase==='race'))return;
      }
      drivingPhase=training?'warmup':state.phase;
      selectedReport=state.phase;
      runSetup={...(drivingPhase==='race'?state.lockedSetup??setup:setup)};
      car=makePilotCar(runSetup,training?liveryDraft??state.driver.livery:state.driver.livery,
        training?null:state.bestSplits??null,training?'flying':mode,state.grid?.position??1);
      replayFrames=[];
      camera=null;accumulator=0;last=0;latest=null;
      garage.hidden=true;track.hidden=false;
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
  $('#pilot-retry').onclick=()=>pending||savedRun?.operation?retryLap():refresh();
  function exitTrack() {
    if(timed(drivingPhase)){
      if(!checkpoint()){radio('Não foi possível salvar a pausa neste navegador.');return;}
      leave();
      message('Sessão pausada. Você pode continuar até o horário de encerramento.');
      return;
    }
    if(saving)return;
    leave();
  }
  track.addEventListener('click',e=>{
    if(e.target.dataset.action==='garage')exitTrack();
    if(e.target.dataset.action==='recover' && car && !car.pit && !car.gridRed)recoverPilot(car);
  });
  const drivingKey=key=>({ArrowUp:'w',ArrowLeft:'a',ArrowDown:'s',ArrowRight:'d'}[key]??key.toLowerCase());
  addEventListener('keydown',e=>{
    const key=drivingKey(e.key);
    if(!car) return;
    if(key==='escape'&&!e.repeat){exitTrack();return;}
    if(!'wasde'.includes(key)||key.length!==1||e.ctrlKey||e.altKey||e.metaKey)return;
    e.preventDefault();keys.add(key);
  });
  addEventListener('keyup',e=>keys.delete(drivingKey(e.key)));
  addEventListener('blur',()=>{keys.clear();touches.clear();});
  addEventListener('pagehide',()=>{if(car)checkpoint();});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&car&&timed(drivingPhase))exitTrack();
  });
  addEventListener('wheel',e=>{
    if(!car||e.ctrlKey)return;
    e.preventDefault();
    zoomFactor=Math.max(.65,Math.min(1.7,zoomFactor*Math.exp(-Math.sign(e.deltaY)*.12)));
  },{passive:false});
  track.addEventListener('pointerdown',e=>{
    const b=e.target.closest('[data-key]');
    if(b){e.preventDefault();b.setPointerCapture(e.pointerId);touches.set(e.pointerId,b.dataset.key);}
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture']) track.addEventListener(type,e=>touches.delete(e.pointerId));

  function resize() {
    width=innerWidth;height=innerHeight;density=Math.min(2,devicePixelRatio||1);
    canvas.width=Math.round(width*density);canvas.height=Math.round(height*density);
  }
  function paint(target) {
    const zoom=(width<620?.52:.68)*zoomFactor;
    const look = car && !car.pit ? 86+car.v*2.25 : 60;
    const x=target.x+Math.cos(target.angle)*look,y=target.y+Math.sin(target.angle)*look;
    if(!camera)camera={x,y};
    camera.x+=(x-camera.x)*.15;camera.y+=(y-camera.y)*.15;
    ctx.setTransform(density,0,0,density,0,0);
    ctx.fillStyle='#24392b';ctx.fillRect(0,0,width,height);
    ctx.save();ctx.translate(width/2,height/2);ctx.scale(zoom,zoom);ctx.translate(-camera.x,-camera.y);
    ctx.drawImage(world,0,0,world.width,world.height,0,0,world.width/targetTextureScale,world.height/targetTextureScale);
    if(car)drawCar(ctx,car,{player:true});
    ctx.restore();
  }
  const targetTextureScale=Math.min(1,Math.sqrt(18000000/(W*H)));
  const idle=at(length*.93);
  function frame(now) {
    requestAnimationFrame(frame);
    const dt=last?Math.min(.1,(now-last)/1000):0;
    last=now;
    if(car) {
      if(Date.now()>=Date.parse(state.closesAt)&&!saving) {if(timed(drivingPhase))clearRun();leave();refresh();return;}
      if(!saving&&!document.hidden) {
        accumulator+=dt;
        const pressed=new Set([...keys,...touches.values()]);
        const input=Object.fromEntries([...pressed].map(key=>[key,true]));
        while(car&&accumulator>=PILOT_STEP&&!saving) {
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
            const nextId=state.limit==null||state.used<state.limit?crypto.randomUUID():null;
            let replay;
            if(timed(drivingPhase)){
              if(replayFrames[0]?.[0]===0){
                replay=replayFrames;
                if(replay.at(-1)[0]===lap.ms)replay.pop();
                replay.push(replayPoint(car,lap.ms,10000));
              }
              replayFrames=[replayPoint(car,0,0)];
            }
            submitLap({...lap,id:attemptId,nextId,phase:drivingPhase,replay});
          }else if(before===null&&car.start!==null){
            if(timed(drivingPhase))replayFrames=[replayPoint(car,0,0)];
            submitLap({start:true,id:crypto.randomUUID(),phase:drivingPhase,setup:runSetup});
          }else if(timed(drivingPhase)&&car.start!==null&&replayFrames.length){
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
        if(!saving&&now-lastCheckpoint>=500&&timed(drivingPhase)){checkpoint();lastCheckpoint=now;}
        const signal=$('#pilot-grid-signal'), red=car.gridRed>0, green=!red&&car.gridAssist>0;
        signal.hidden=!(red||green);
        if(red||green){
          signal.dataset.light=red?'red':'green';
          const label=red?`P${state.grid?.position??1} · ${Math.ceil(car.gridRed*PILOT_STEP)}`:'VERDE · ACELERE';
          const title=signal.querySelector('strong');
          if(title.textContent!==label)title.textContent=label;
        }
        $('#pilot-phase').textContent=drivingPhase==='warmup'?'AQUECIMENTO':car.pit?'PIT LANE':car.start!==null?(drivingPhase==='race'?'VOLTA DE CORRIDA':'VOLTA RÁPIDA'):car.startMode==='grid'?'LARGADA':car.startMode==='flying'?'APROXIMAÇÃO':'VOLTA DE SAÍDA';
        $('#pilot-live-time').textContent=format(elapsed());
        $('.pilot-speed strong').textContent=Math.round(car.v*3.6);
        const brake=keys.has('s')||[...touches.values()].includes('s');
        const throttle=!red&&!brake&&(green||keys.has('w')||[...touches.values()].includes('w'))?1:0;
        const revs=racingAudio.update({active:!document.hidden,speed:car.v,throttle,braking:brake});
        $('#pilot-gear').textContent=car.v<.4&&!throttle?'N':revs.gear;
        for(const [i,output] of splitOutputs.entries()){
          const split=car.splits[i]??car.lastSplits[i];
          const delta=split?.valid?split.delta:null;
          const label=split&&!split.valid?'INV':sectorDelta(delta==null?null:delta/1000);
          if(output.value!==label)output.value=label;
          output.dataset.trend=delta<0?'gain':delta>0?'loss':'';
        }
        $('.pilot-speed span').dataset.available=String(!car.pit&&drsZoneAt(car.s)>=0);
        $('.pilot-speed span').dataset.active=String(car.drs);
        if(!saving)radio(red?'Aguarde o sinal verde.':green?'Largada liberada · mantenha W ou ↑ para acelerar.':car.pit?'Segure W para sair dos boxes.':car.spin>0?'Rodada · alivie os comandos para recuperar.':car.locked?'Rodas travadas · alivie o freio.':car.off?'Brita · aderência reduzida.':car.start===null?'Cruze a linha para começar o cronômetro.':car.invalid?'Volta inválida após reposicionamento.':latest?`Última volta ${format(latest.ms)}${latest.valid?'':' · inválida'}`:'Volta cronometrada em andamento.');
      }
    } else racingAudio.update();
    paint(car??idle);
  }
  resize();addEventListener('resize',resize);
  syncSetup();drawPreview();refresh();requestAnimationFrame(frame);
  setInterval(()=>{
    if(car||busy||saving||!state)return;
    const now=Date.now();
    if(state.driver&&!state.replayReady&&now>=Date.parse(state.replayAt)&&now>=replayPollAt){
      replayPollAt=now+5000;
      refresh();
      return;
    }
    const transition=state.open ? state.closesAt : state.sessions.find(session=>session.status==='upcoming')?.opensAt;
    if(now>=Date.parse(transition))refresh();
  },1000);
}
