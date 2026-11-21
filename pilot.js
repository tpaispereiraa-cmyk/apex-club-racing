import {drawCar} from './car-renderer.js';
import {at, length, W, H} from './track.js';
import {drsZoneAt} from './track-profile.js';
import {sectorDelta, SECTOR_COLORS} from './sector-timing.js';
import {createRacingAudio} from './racing-audio.js';
import {makePilotCar, stepPilot, recoverPilot, setupFor, PILOT_STEP, PILOT_SETUP, PRESETS, SETUP} from './pilot-driving.js';

const format = ms => ms == null ? '—' : `${Math.floor(ms/60000)}:${((ms%60000)/1000).toFixed(3).padStart(6,'0')}`;
const closeDate = new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'});
const draftKey = 'apex-practice-setup-v1';
const pendingKey = 'apex-practice-pending-v1';
function readLocal(key) { try {return JSON.parse(localStorage.getItem(key));} catch {return null;} }
function writeLocal(key, value) { try {localStorage.setItem(key,JSON.stringify(value));} catch {} }

async function getState(path='', data) {
  const response = await fetch('/api/practice'+path,data ? {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)
  } : {cache:'no-store'});
  const result = await response.json().catch(()=>null);
  if (!response.ok || !result) {
    const error = new Error(result?.error || 'Conexão indisponível. Tente novamente.');
    error.status = response.status;
    throw error;
  }
  return result;
}

export function bootPilot({canvas,ctx,world}) {
  document.body.classList.add('pilot-mode');
  document.title='APEX CLUB — Treino em Interlagos';
  const ui=document.createElement('section');
  ui.id='pilot';
  ui.innerHTML=`
    <nav class="pilot-nav"><a href="/" aria-label="Voltar ao APEX CLUB"><strong>A</strong> APEX CLUB</a><span>INTERLAGOS / PILOTAR</span><button id="pilot-sound" class="icon-button" aria-pressed="false">SOM OFF</button></nav>
    <div class="pilot-garage">
      <section class="pilot-intro"><span class="pilot-kicker">PRACTICE · INTERLAGOS</span><h1>Dia de <em>prática.</em></h1><p id="pilot-deadline">Consultando o horário do treino…</p>
      <div class="pilot-car-stage"><canvas id="pilot-preview" width="480" height="230" aria-label="Prévia da pintura do seu monoposto"></canvas><div><span>VOLTAS USADAS</span><b id="pilot-quota">0 / 30</b></div></div>
      <dl class="pilot-times"><div><dt>MELHOR VOLTA</dt><dd id="pilot-best">—</dd></div><div><dt>ÚLTIMA VOLTA</dt><dd id="pilot-last">—</dd></div></dl></section>
      <section class="pilot-form-card">
        <p class="pilot-message" role="status"></p>
        <form id="pilot-register" hidden><h2>Inscrição de piloto</h2><label>Seu nome<input name="name" autocomplete="nickname" minlength="2" maxlength="32" required></label><label>Código do convite<input name="invite" autocomplete="off" required></label><label class="pilot-color">Cor de destaque<input type="color" name="color" value="#d5f561"></label><button class="pilot-button">Entrar no treino</button></form>
        <div id="pilot-setup" hidden><h2 id="pilot-driver"></h2><p>Escolha um acerto para a próxima saída.</p><div class="pilot-presets" role="group" aria-label="Acertos sugeridos">${Object.entries(PRESETS).map(([id,p])=>`<button data-preset="${id}" aria-pressed="false"><b>${p.name}</b><small>${p.description}</small></button>`).join('')}</div>
        <details><summary>Configuração avançada</summary><div class="pilot-sliders">${PILOT_SETUP.map(id=>{const s=SETUP[id];return `<label><span>${s.label} <output></output></span><input type="range" name="${id}" min="${s.min}" max="${s.max}" step="${s.step}"></label>`;}).join('')}</div></details>
        <button id="pilot-start" class="pilot-button">Iniciar treino</button><p class="pilot-controls"><kbd>W</kbd> acelerar <kbd>A</kbd><kbd>D</kbd> virar <kbd>S</kbd> frear <kbd>E</kbd> DRS</p></div>
        <section id="pilot-results" hidden><h2>Tempos do treino</h2><ol></ol></section>
        <button id="pilot-retry" class="pilot-button" hidden>Tentar novamente</button>
      </section>
    </div>
    <section class="pilot-track" hidden>
      <div class="pilot-track-top"><div><span id="pilot-phase">PISTA</span><strong id="pilot-live-time">—</strong></div><div><span>VOLTAS USADAS</span><strong id="pilot-live-quota">0 / 30</strong></div></div>
      <p id="pilot-radio" role="status"></p>
      <div class="pilot-splits"><span>Δ VS. SUA MELHOR VOLTA</span><div>${SECTOR_COLORS.map((color,i)=>`<div><b style="color:${color}">S${i+1}</b><output>—</output></div>`).join('')}</div></div>
      <div class="pilot-track-bottom"><div class="pilot-drive-actions"><button data-action="garage">Voltar à garagem</button><button data-action="recover">Reposicionar</button></div><div class="pilot-speed"><b id="pilot-gear">N</b><strong>0</strong> km/h <span>DRS</span></div></div>
      <div class="pilot-touch" aria-label="Controles de pilotagem">${[['a','◀'],['d','▶'],['e','DRS'],['s','Freio'],['w','Acelerar']].map(([k,label])=>`<button data-key="${k}">${label}</button>`).join('')}</div>
    </section>`;
  document.body.append(ui);
  const $ = id => ui.querySelector(id);
  const form = $('#pilot-register'), garage = $('.pilot-garage'), track = $('.pilot-track');
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
  let last=0, accumulator=0, camera=null, width=0, height=0, density=1;
  const elapsed = ()=>car?.start == null ? null : Math.round((car.elapsed-car.start)*1000);
  const message = value => {$('.pilot-message').textContent=value;};
  const radio = value => {$('#pilot-radio').textContent=value;};

  function syncSetup() {
    for (const b of ui.querySelectorAll('[data-preset]')) b.setAttribute('aria-pressed',String(b.dataset.preset===preset));
    for (const input of ui.querySelectorAll('input[type=range]')) {
      input.value=setup[input.name];
      input.parentElement.querySelector('output').value=input.value;
    }
    writeLocal(draftKey,{preset,setup});
  }
  function drawPreview() {
    const c=makePilotCar(setup,state?.driver?.color ?? form.elements.color.value);
    previewCtx.clearRect(0,0,480,230);
    drawCar(previewCtx,{...c,x:240,y:111,angle:0},{scale:5.4});
  }
  function showState() {
    if (!state) return;
    const {driver,used=0,best,open,limit,closesAt}=state;
    $('#pilot-deadline').textContent=open ? `Janela aberta até ${closeDate.format(new Date(closesAt))} · horário de Brasília.` : 'A janela de prática encerrou.';
    $('#pilot-quota').textContent=$('#pilot-live-quota').textContent=`${used} / ${limit}`;
    $('#pilot-best').textContent=format(best);
    $('#pilot-last').textContent=format(latest?.ms)+(latest&&!latest.valid?' · inválida':'');
    form.hidden=!!driver || !open;
    $('#pilot-setup').hidden=!driver || !open;
    $('#pilot-driver').textContent=driver?.name ?? '';
    $('#pilot-start').disabled=!open || used>=limit || !!pending;
    $('#pilot-retry').hidden=!pending;
    const results=$('#pilot-results');
    results.hidden=!state.board;
    const list=results.querySelector('ol');
    list.replaceChildren(...(state.board ?? []).map(entry=>{
      const li=document.createElement('li');
      li.textContent=`${entry.name} · ${format(entry.best)} · ${entry.used}/${limit}`;
      return li;
    }));
    drawPreview();
  }
  async function refresh() {
    try {state=await getState();showState();}
    catch(error) {message(error.message);$('#pilot-retry').hidden=false;}
  }
  function leave() {
    car=null; track.hidden=true; garage.hidden=false;
    keys.clear(); touches.clear();
    last=0; accumulator=0; showState();
  }
  async function saveLap() {
    if (!pending || saving) return;
    saving=true;
    radio('Gravando volta…');
    try {
      state=await getState('/lap',pending);
      if(car)car.bestSplits=state.bestSplits??null;
      pending=null;writeLocal(pendingKey,null);
      message('');
      if(!state.open || state.used>=state.limit) {
        leave();
        message(state.open?'Você completou suas 30 voltas.':'O treino encerrou.');
      }
      showState();
    } catch(error) {
      if ([400,401,409,410].includes(error.status)) {pending=null;writeLocal(pendingKey,null);}
      leave();message(error.message);
      if(!pending)await refresh();
    } finally {saving=false;accumulator=0;}
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
  $('#pilot-setup').addEventListener('click',e=>{
    const selected=e.target.closest('[data-preset]')?.dataset.preset;
    if(selected) {preset=selected;setup=setupFor(preset);syncSetup();}
  });
  $('#pilot-setup').addEventListener('input', e=>{
    if (!PILOT_SETUP.includes(e.target.name)) return;
    preset='manual';setup[e.target.name]=Number(e.target.value);syncSetup();
  });
  $('#pilot-start').addEventListener('click',async ()=>{
    if(busy || pending) return;
    if(wantsSound)setSound(true);
    busy=true;
    message('');
    try {
      state=await getState();
      showState();
      if(!state.driver || !state.open || state.used>=state.limit)return;
      car=makePilotCar(setup,state.driver.color,state.bestSplits??null);
      camera=null;accumulator=0;last=0;
      garage.hidden=true;track.hidden=false;
      radio('Segure W para sair dos boxes.');
    } catch(error){message(error.message);}
    finally {busy=false;}
  });
  $('#pilot-retry').onclick=()=>pending?saveLap():refresh();
  track.addEventListener('click',e=>{
    if(e.target.dataset.action==='garage') {if(!saving)leave();}
    if(e.target.dataset.action==='recover' && car && !car.pit)recoverPilot(car);
  });
  addEventListener('keydown',e=>{
    const key=e.key.toLowerCase();
    if(!car) return;
    if(key==='escape'&&!saving){leave();return;}
    if(!'wasde'.includes(key)||key.length!==1||e.ctrlKey||e.altKey||e.metaKey)return;
    e.preventDefault();keys.add(key);
  });
  addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  addEventListener('blur',()=>{keys.clear();touches.clear();});
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
    const zoom=width<620?.52:.68;
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
      if(Date.now()>=Date.parse(state.closesAt)&&!saving) {leave();refresh();return;}
      if(!saving) {
        accumulator+=dt;
        const pressed=new Set([...keys,...touches.values()]);
        const input=Object.fromEntries([...pressed].map(key=>[key,true]));
        while(car&&accumulator>=PILOT_STEP&&!saving) {
          accumulator-=PILOT_STEP;
          const lap=stepPilot(car,input);
          if(lap) {
            latest=lap;
            pending={...lap,id:crypto.randomUUID()};
            writeLocal(pendingKey,pending);
            saveLap();
          }
        }
      }
      if(car) {
        $('#pilot-phase').textContent=car.pit?'PIT LANE':car.start===null?'VOLTA DE SAÍDA':'VOLTA RÁPIDA';
        $('#pilot-live-time').textContent=format(elapsed());
        $('.pilot-speed strong').textContent=Math.round(car.v*3.6);
        const brake=keys.has('s')||[...touches.values()].includes('s');
        const throttle=!brake&&(keys.has('w')||[...touches.values()].includes('w'))?1:0;
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
        if(!saving)radio(car.pit?'Segure W para sair dos boxes.':car.invalid?'Volta invalidada por limite de pista.':car.start===null?'Volta de saída. Cruze a linha para começar o cronômetro.':latest?`Última volta ${format(latest.ms)}${latest.valid?'':' · inválida'}`:'Volta cronometrada em andamento.');
      }
    } else racingAudio.update();
    paint(car??idle);
  }
  resize();addEventListener('resize',resize);
  syncSetup();drawPreview();refresh();requestAnimationFrame(frame);
  setInterval(()=>{if(!car && !busy && !saving && state?.open && Date.now()>=Date.parse(state.closesAt))refresh();},1000);
}
