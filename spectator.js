import {applyRaceCommands} from './manager/race-control.js';
import {pitWallHTML} from './manager/pit-wall.js';
import {liveAdvice} from './manager/engineer.js';
import {ORDER_LABELS} from './manager/model.js';
import {weatherForecast} from './weather.js';
import {strategyTelemetry} from './manager/telemetry.js';
import {createWeekendUI} from './weekend-ui.js';
import {browserSaveStorage} from './manager/storage.js';
import {visibleSectorSplits,sectorDelta,SECTOR_COLORS} from './sector-timing.js';
import {createWatchDashboard} from './watch-dashboard.js';
import {W,H,length,at,clamp,CIRCUIT,belowBridge} from './track.js';
import {createField,simulateField,raceOrder} from './race-ai.js';
import {drawCar} from './car-renderer.js';
import {setupPaddock} from './paddock.js';
import {createRace,COMPOUNDS,event} from './race-systems.js';
import {DRIVER_LABELS,driverRating} from './drivers.js';
import {CAR_SCALE,CAMERA_ZOOM} from './vehicle-geometry.js';
import {updateMarkup} from './hud-view.js';
import {FAULT_LABELS} from './race-incidents.js';
import {qualifyingSession,raceSession,qualifyingOrder,qualifyingResults,sessionComplete,QUALIFYING_LAPS,RACE_LAPS} from './weekend.js';
import {createManagerController} from './manager/controller.js';
import {setupManagerUI} from './manager/ui.js';
import {parseRoute,circuitUrl} from './routes.js';
import {PHASES,POINTS,championshipOrder} from './tournament.js';
const $=s=>document.querySelector(s);
const time=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(3).padStart(6,'0')}`;
export async function bootSpectator({canvas,ctx,world}){
  let managerMode=false,managerWasPaused=false,checkpointTime=0;
  const saveStorage=await browserSaveStorage();
  const notice=document.createElement('aside');notice.id='save-notice';notice.hidden=true;notice.setAttribute('role','status');notice.innerHTML='<span></span><button data-save-action="retry">TENTAR SALVAR</button><button data-save-action="export">EXPORTAR CÓPIA</button>';document.body.append(notice);
  const indicator=document.createElement('span');indicator.id='save-indicator';indicator.textContent='SAVE LOCAL';indicator.dataset.store=saveStorage.kind;document.body.append(indicator);
  const failures=new Map();let failedController=null;
  const persistenceChanged=mode=>status=>{indicator.dataset.saveStatus=status.status;indicator.textContent=({saved:'SALVO',saving:'SALVANDO…',memory:'SAVE PENDENTE'})[status.status]??'SAVE LOCAL';indicator.title=status.errorName?[status.errorName,status.details].filter(Boolean).join(': '):'Progresso salvo neste navegador';if(status.status==='memory')failures.set(mode,status);else if(status.status==='saved')failures.delete(mode);failedController=failures.has('manager')?manager:failures.has('watch')?watch:null;notice.hidden=!failures.size;notice.querySelector('span').textContent=failures.values().next().value?.message??'';};
  const route=parseRoute(location.href),manager=createManagerController(saveStorage,{onPersistenceChange:persistenceChanged('manager')});
  const watchStorage={getItem:()=>saveStorage.getItem('apex-watch-v2'),setItem:(_,value)=>saveStorage.setItem('apex-watch-v2',value)};
  const watchOptions={watch:true,onPersistenceChange:persistenceChanged('watch')};
  let watch=createManagerController(watchStorage,watchOptions);
  notice.addEventListener('click',e=>{const action=e.target.dataset.saveAction;if(action==='retry')failedController?.retrySave();if(action==='export'&&failedController){const url=URL.createObjectURL(new Blob([failedController.export()],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=failures.has('manager')?'apex-career.json':'apex-watch.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}});
  const activeController=()=>managerMode?manager:watch;
  let raceCounter=0,race=createRace(),raceSpeed=1,director=true,directorTimer=0,cameraReason='Líder da sessão';
  let cars=createField(race),state='intro',paused=false,elapsed=0,count=3,finished=false,followedId=cars[0].id,overview=false;
  let weekendSeed=2026,gridResults=[],gridCountdown=10;
  let camera={x:W/2,y:H/2,zoom:.4},view={w:innerWidth,h:innerHeight},sound=false,audio,osc,gain;
  const followed=()=>cars.find(c=>c.id===followedId)||cars[0];
  const resize=()=>{view={w:innerWidth,h:innerHeight};const dpr=Math.min(devicePixelRatio||1,2);canvas.width=view.w*dpr;canvas.height=view.h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);};
  addEventListener('resize',resize);resize();setupPaddock();
  const managerUI=setupManagerUI(manager,{autoOpen:false,onStart:()=>{if(managerMode&&state==='racing'&&!finished){paused=false;return;}managerMode=true;$('#live-manager').hidden=false;openScreen('hub');},onOpen:()=>{managerWasPaused=paused;if(state==='racing')paused=true;},onClose:()=>{if(state==='racing')paused=managerWasPaused;else weekendUI.refresh();},onQualifying:()=>{managerMode=true;openScreen('brief-qualifying');},getLive:()=>managerMode&&state==='racing'?{cars,race,elapsed}:null});
  const watchUI=createWatchDashboard({onFollow:id=>{director=false;overview=false;followedId=id;saveLiveView();hud();},onPrevious:()=>switchCar(-1),onNext:()=>switchCar(1),onCamera:()=>$('#camera-mode').click(),onPause:()=>$('#pause').click(),onSpeed:()=>$('#race-speed').click(),onDirector:()=>{director=!director;directorTimer=0;saveLiveView();hud();}});
  const weekendUI=createWeekendUI({getContext:()=>({career:activeController().state,manager:managerMode,cars,race,hasLive:activeController().state?.active?.circuit===CIRCUIT.id&&!!activeController().state?.active?.checkpoints&&!sessionComplete(activeController().state.active.checkpoints.cars)}),onView:(screen,details)=>activeController().view(screen,details),onAction:(action,args)=>{try{weekendAction(action,args);}catch(e){weekendUI.error(e.message);}}});
  const weekendButton=document.createElement('button');weekendButton.textContent='CENTRAL DO GP';weekendButton.onclick=()=>openScreen('hub');document.querySelector('.race-actions').append(weekendButton);
  const simulateButton=document.createElement('button');simulateButton.textContent='SIMULAR RESTANTE';simulateButton.onclick=()=>simulateSession();document.querySelector('.race-actions').append(simulateButton);
  const stintButton=document.createElement('button');stintButton.textContent='AVANÇAR 3 VOLTAS';stintButton.onclick=()=>simulateSession(3);document.querySelector('.race-actions').append(stintButton);
  let sessionWorker=null;
  function simulateSession(lapsToRun=null){
    if(sessionWorker||state!=='racing'||finished)return;
    const ctl=activeController(),raceId=ctl.state.active?.id;if(!raceId)return;
    const targetCar=cars.find(c=>c.id===followedId&&!c.retired)??cars.find(c=>c.team.id===ctl.state.selectedTeam&&!c.retired);
    const stopAt=lapsToRun&&targetCar?{carId:targetCar.id,laps:Math.min(race.laps,targetCar.lapTimes.length+lapsToRun)}:null;
    if(typeof Worker==='undefined'){openScreen('hub');weekendUI.error('Este navegador não permite simulação em segundo plano. A sessão pode continuar ao vivo.');return;}
    paused=true;ctl.live(race);ctl.checkpoint(cars,race,elapsed);hud();
    const overlay=document.createElement('section');overlay.className='session-simulation';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Simulando sessão');
    overlay.innerHTML='<div><span class="wk-kicker">APEX CLUB / SIMULAÇÃO</span><h2>A estratégia<br>encontra a pista.</h2><p>Seus acertos, ordens e regras de box continuam valendo. Clima, desgaste e incidentes são calculados volta a volta.</p><progress aria-label="Simulação em andamento"></progress><p data-simulation-progress role="status">Preparando os vinte carros…</p><button class="wk-button" data-cancel-simulation>CANCELAR E VOLTAR AO PONTO ANTERIOR</button></div>';
    document.body.append(overlay);const cancel=overlay.querySelector('button');cancel.focus();
    const cleanup=()=>{sessionWorker?.terminate();sessionWorker=null;overlay.remove();};
    cancel.onclick=()=>{cleanup();paused=true;hud();};
    overlay.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape')cancel.click();if(e.key==='Tab'){e.preventDefault();cancel.focus();}});
    const fail=message=>{cleanup();paused=true;openScreen('hub');weekendUI.error(message+' O ponto anterior está salvo.');};
    try{
      sessionWorker=new Worker(new URL(`./session-worker.js?circuit=${encodeURIComponent(CIRCUIT.id)}`,import.meta.url),{type:'module'});
      sessionWorker.onerror=()=>fail('Não foi possível concluir a simulação.');
      sessionWorker.onmessage=({data})=>{
        if(data.type==='progress')overlay.querySelector('[data-simulation-progress]').textContent=`${time(data.elapsed)} de sessão · ${data.finished}/${data.total} pilotos encerraram o programa`;
        if(data.type==='error')fail(data.message);
        if(data.type==='complete'){
          cleanup();if(ctl.state.active?.id!==raceId)return;
          race=data.pack.session;cars=data.pack.cars;cars.race=race;elapsed=data.pack.elapsed;
          if(sessionComplete(cars))finish();else{ctl.checkpoint(cars,race,elapsed);checkpointTime=elapsed;paused=true;hud();}
        }
      };
      sessionWorker.postMessage({cars:[...cars],session:race,elapsed,stopAt});
    }catch(e){fail(e.message);}
  }
  const broadcastHub=document.createElement('button');broadcastHub.className='watch-weekend-link';broadcastHub.textContent='PADDOCK ↗';broadcastHub.onclick=()=>openScreen('hub');document.body.append(broadcastHub);
  const engineerRadio=document.createElement('aside');engineerRadio.id='engineer-radio';engineerRadio.hidden=true;engineerRadio.setAttribute('aria-label','Avisos do engenheiro');engineerRadio.innerHTML='<div class="engineer-radio-label">MURO DOS BOXES <span>AO VIVO</span></div><div data-engineer-alerts></div>';document.body.append(engineerRadio);engineerRadio.addEventListener('click',e=>{const b=e.target.closest('[data-engineer-slot]');if(b)managerUI.show('strategy',Number(b.dataset.engineerSlot));});
  const pitWall=document.createElement('section');
  pitWall.id='pit-wall';
  pitWall.hidden=true;
  pitWall.setAttribute('aria-label','Estratégia ao vivo');
  document.body.append(pitWall);
  let pitSlot=0;
  const pitCompounds={};
  pitWall.addEventListener('change',e=>{if(e.target.matches('[data-pit-compound]'))pitCompounds[pitSlot]=e.target.value;});
  pitWall.addEventListener('click',e=>{
    const select=e.target.closest('[data-pit-slot]');
    if(select){
      pitSlot=Number(select.dataset.pitSlot);
      const car=cars.find(c=>c.team.id===manager.state.selectedTeam&&c.slot===pitSlot);
      if(car){followedId=car.id;saveLiveView();}
      hud();
      return;
    }
    const order=e.target.closest('[data-pit-action]');
    if(!order||sessionWorker||state!=='racing'||race.type!=='race')return;
    try{
      manager.command(order.dataset.pitAction,{slot:pitSlot,compound:pitWall.querySelector('[data-pit-compound]').value});
      manager.live(race);
      applyRaceCommands(cars,race.commands,race);
      race.commands=[];
      manager.checkpoint(cars,race,elapsed);
      hud();
    }catch(error){pitWall.querySelector('.pit-wall-call b').textContent=error.message;}
  });
  const mapContext=$('#map').getContext('2d');
  // Render the map from the exact same centerline as the race.
  function map(){mapContext.clearRect(0,0,290,150);mapContext.save();const scale=Math.min(266/W,135/H);mapContext.translate((290-W*scale)/2,(150-H*scale)/2);mapContext.scale(scale,scale);mapContext.strokeStyle='#a9bb93';mapContext.lineWidth=3/scale;mapContext.beginPath();for(let s=0;s<length;s+=15){let p=at(s);s?mapContext.lineTo(p.x,p.y):mapContext.moveTo(p.x,p.y);}mapContext.closePath();mapContext.stroke();let p=at(0);mapContext.fillStyle='#d5f561';mapContext.beginPath();mapContext.arc(p.x,p.y,4/scale,0,Math.PI*2);mapContext.fill();mapContext.restore();}map();
  const currentOrder=()=>race.type!=='race'?qualifyingOrder(cars):raceOrder(cars);
  function hud(){$('#pause').textContent=paused?'RETOMAR P':'PAUSAR P';const c=followed(),order=currentOrder(),rank=order.indexOf(c)+1,q=race.type!=='race';
    pitWall.hidden=!managerMode||state!=='racing'||race.type!=='race'||finished;
    if(!pitWall.hidden){
      const team=cars.filter(car=>car.team.id===manager.state.selectedTeam).sort((a,b)=>a.slot-b.slot);
      const observed=team.find(car=>car.id===followedId);
      if(observed)pitSlot=observed.slot;
      const selected=team.find(car=>car.slot===pitSlot)??team[0];
      if(selected)updateMarkup(pitWall,pitWallHTML({car:selected,team,order,race,compound:pitCompounds[pitSlot],expanded:pitWall.querySelector('details')?.open}));
    }
    engineerRadio.hidden=!managerMode||state!=='racing'||finished;
    if(!engineerRadio.hidden){const ownCars=cars.filter(x=>x.team.id===manager.state.selectedTeam),alerts=ownCars.flatMap(x=>liveAdvice(x,race).alerts.map(a=>({...a,slot:x.slot,driver:x.driver.name}))).sort((a,b)=>({critical:0,warning:1,info:2}[a.severity]-{critical:0,warning:1,info:2}[b.severity]));engineerRadio.hidden=!alerts.length;updateMarkup(engineerRadio.querySelector('[data-engineer-alerts]'),alerts.filter((a,i,all)=>a.id!=='weather'||all.findIndex(x=>x.id==='weather')===i).slice(0,2).map(a=>`<button class="engineer-radio-alert ${a.severity}" data-engineer-slot="${a.slot}"><span>${a.driver}</span><b>${a.title}</b><p>${a.text}</p><small>REVISAR INSTRUÇÕES ↗</small></button>`).join(''));}
    watchUI.update({active:!managerMode&&state==='racing',c,cars,order,race,elapsed,career:watch.state,paused,speed:raceSpeed,overview,director,cameraReason});
    document.body.classList.toggle('qualifying',q);
    $('#phase-label').textContent=`${PHASES[race.type].day} · ${PHASES[race.type].name.toUpperCase()} · ${PHASES[race.type].step}/3`;$('#lap-label').textContent=q?'VOLTAS RÁPIDAS':'VOLTA';$('#time-label').textContent=q?'TEMPO DA SESSÃO':'TEMPO DE CORRIDA';$('#tower-label').textContent=q?'MELHORES TEMPOS':'POSIÇÕES';
    $('#position').innerHTML=`${c.retired?'DNF':rank}<small>/ ${cars.length}</small>`;$('#lap').textContent=q?(c.inGarage?`${race.laps} / ${race.laps}`:!c.released?'AGUARDA':c.lapStart===null?'SAÍDA':`${Math.min(race.laps,c.lapTimes.length+1)} / ${race.laps}`):`${Math.min(race.laps,c.lap)} / ${race.laps}`;$('#time').textContent=time(elapsed);
    $('#best').textContent='MELHOR VOLTA '+(c.bestLap<Infinity?time(c.bestLap):'—');$('#speed').textContent=Math.round(c.manager?c.v/length*CIRCUIT.metres*3.6:c.v*.57);$('#speedbar').style.width=`${clamp(c.v/c.performance.maxSpeed*100,0,100)}%`;
    $('#following-name').textContent=`#${c.number} · ${c.driver.name}`;$('#following-name').style.color=c.team.color;$('#camera-mode').textContent=overview?'APROXIMAR CÂMERA':'VER PISTA INTEIRA';
    updateMarkup($('#leaderboard'),order.map((entry,i)=>`<button data-follow="${entry.id}" class="${entry.id===c.id?'is-followed':''}" aria-label="Acompanhar carro ${entry.number} da ${entry.team.name}" style="--team:${entry.team.color}"><span>${i+1}</span><i></i><b>#${entry.number}</b><em>${entry.driver.name.split(' ').at(-1)}</em><small>${q?(entry.bestLap<Infinity?time(entry.bestLap):entry.retired?'SEM TEMPO':entry.released?'EM PISTA':'BOX'):entry.retired?'DNF':entry.finishTime!==null?'FINAL':entry.pit?'PIT':entry.drs?'DRS':Math.min(entry.lap,race.laps)+'/'+race.laps}</small></button>`).join(''));
    const sectorMarkup=q?`<div class="manager-live-sectors">${visibleSectorSplits(c).map((split,i)=>`<div><b style="color:${SECTOR_COLORS[i]}">S${i+1}</b><strong>${split?split.seconds.toFixed(3)+'s':'—'}</strong><small style="color:${split?.delta<0?'#b9ef78':'#f3bd7b'}">${split?sectorDelta(split.delta):'—'}</small></div>`).join('')}</div>`:'';
    const st=strategyTelemetry(c,race),compound=COMPOUNDS[c.compound],pilotExpanded=$("#car-telemetry details")?.open||false;
    $('#weather-mode').textContent=({auto:'CLIMA VARIÁVEL',dry:'SECO FIXO',rain:'CHUVA FIXA'}[race.weather]);$('#weather-data').textContent=`Água ${Math.round(race.wetness*100)}% · Asfalto ${Math.round(race.trackTemp)}°C`;
    $('#weather-forecast').textContent=weatherForecast(race).summary;
    $('#race-speed').textContent=`${raceSpeed}×`;
    updateMarkup($('#car-telemetry'),`<div class="telemetry-title"><span>${c.team.name}</span><b>${c.status}</b></div><div class="telemetry-driver">${c.driver.name} <small>${driverRating(c.driver)}</small></div>${sectorMarkup}<p>${{straight:'Reta',low:'Curva lenta',medium:'Curva média',high:'Curva rápida'}[c.telemetry.section]||'Grid'} · ${c.pitStops} parada(s)</p>${c.manager&&!c.manager.automatic?`<p class="manager-current-orders">ORDENS RECEBIDAS: ${['pace','fuel','ers'].map(k=>ORDER_LABELS[c.manager.orders[k]]).join(' · ')}</p>`:''}${c.manager?.automatic?`<p>${c.manager.reason} · asas ${c.manager.setup?.frontWing??'—'}/${c.manager.setup?.rearWing??'—'}</p>`:''}<div class="system-tags"><span class="${c.drs?'active':''}">DRS ${c.drs?'ON':'OFF'}</span><span class="${c.ers?'active':''}">ERS ${c.ers?'ATAQUE':'RECARGA'}</span></div>${[['Pneu '+compound.name,c.tyreLife,compound.color,Math.round(c.tyreLife)+'%'],['Bateria ERS',c.energy,'#d5f561',Math.round(c.energy)+'%'],['Integridade motor',c.engineHealth,'#75b8d4',Math.round(c.engineHealth)+'%']].map(([label,value,color,text])=>`<div class="system-meter"><label>${label}<b>${text}</b></label><i><em style="width:${value}%;background:${color}"></em></i></div>`).join('')}<div class="system-numbers"><span>PNEUS <b>${Math.round(c.tyreTemp)}°C</b></span><span>MOTOR <b>${Math.round(c.engineTemp)}°C</b></span><span>COMB. <b>${c.fuel.toFixed(1)} kg</b></span><span>DANOS <b>${Math.round(c.damage)}%</b></span></div><div class="manager-live-projection"><b>PROJEÇÃO COM DADOS DA PISTA</b>${st.fuelAtFinish!==null&&st.fuelAtFinish<0?'<strong class="manager-fuel-warning">RISCO DE FICAR SEM COMBUSTÍVEL · REDUZA O CONSUMO</strong>':''}<p>${st.fuelPerLap?st.fuelPerLap.toFixed(2)+' kg/volta · chegada: '+st.fuelAtFinish.toFixed(1)+' kg':'Aguardando voltas completas para estimar combustível'}</p><p>${st.tyreLapsRemaining?'Pneu: ~'+st.tyreLapsRemaining.toFixed(1)+' voltas até 10% de vida':'Pneu novo: coletando desgaste do stint'}</p><small>Estimativa pelas voltas recentes; chuva e instruções podem mudar o consumo.</small></div><div class="mechanical-state">${c.fault ? FAULT_LABELS[c.fault.type] : c.retired ? c.retirementReason : (managerMode?'Plano e instruções do manager':'Pneus escolhidos pela IA')}<small>Asa dianteira ${Math.round(c.damageParts.frontWing)}% · traseira ${Math.round(c.damageParts.rearWing)}% · suspensão ${Math.round(c.damageParts.suspension)}%</small></div><details ${pilotExpanded ? 'open' : ''}><summary>HABILIDADES DO PILOTO</summary><div class="live-driver-stats">${Object.entries(DRIVER_LABELS).map(([k,label])=>`<span>${label}<b>${c.driver.stats[k]}</b></span>`).join('')}</div></details>`);
    updateMarkup($('#race-events'),race.events.slice(0,3).map(e=>`<div class="event-${e.type}"><time>${Math.floor(e.time/60)}:${String(Math.floor(e.time%60)).padStart(2,'0')}</time>${e.text}</div>`).join(''));
  }
  function switchCar(delta){director=false;overview=false;const order=currentOrder(),index=order.findIndex(c=>c.id===followedId);followedId=order[(index+delta+order.length)%order.length].id;saveLiveView();hud();}
  $('#previous-car').onclick=()=>switchCar(-1);$('#next-car').onclick=()=>switchCar(1);$('#camera-mode').onclick=()=>{overview=!overview;saveLiveView();hud();};
  $('#leaderboard').onclick=e=>{const b=e.target.closest('[data-follow]');if(b){director=false;followedId=b.dataset.follow;saveLiveView();hud();}};
  function loadSession(pack){weekendUI.hide();race=pack.session;cars=pack.cars;state='racing';paused=false;finished=false;elapsed=pack.elapsed??0;checkpointTime=elapsed;count=pack.resumed||race.type!=='race'?0:3;overview=false;followedId=managerMode?(pack.resumed&&cars.find(c=>c.id===manager.state.liveView?.followedId)?.id)||cars.find(c=>c.team.id===manager.state.selectedTeam&&c.slot===pitSlot)?.id||cars[0].id:cars.find(c=>c.id===watch.state.liveView?.followedId)?.id??cars[0].id;if(!managerMode){director=watch.state.liveView?.director??true;overview=watch.state.liveView?.overview??false;}
    document.body.classList.add('racing');document.body.classList.remove('grid-summary');$('#race-results').classList.remove('qualifying-grid');$('#hud').hidden=false;$('#modal').hidden=true;camera.x=followed().x;camera.y=followed().y;camera.zoom=view.w<600?CAMERA_ZOOM.mobile:CAMERA_ZOOM.desktop;hud();saveLiveView();if(sound)audio?.resume();}
  function start(){if(route.mode!=='watch'){location.href=circuitUrl(CIRCUIT.id,'watch');return;}managerMode=false;if(!watch.state){watch=createManagerController({getItem:()=>null,setItem:watchStorage.setItem},watchOptions);watch.create('aurora','Aurora Racing');}restorePresentation(watch);$('#live-manager').hidden=true;}
  function saveLiveView(){if(state==='racing')activeController().view('live',{paused,followedId,director,overview});}
  function openScreen(screen,options={}){engineerRadio.hidden=true;pitWall.hidden=true;paused=true;state='weekend';$('#modal').hidden=true;$('#hud').hidden=true;document.body.classList.remove('racing','qualifying','grid-summary');watchUI.update({active:false});weekendUI.show(screen,options);}
  function restorePresentation(ctl){const saved=ctl.state.presentation?.circuit===CIRCUIT.id?ctl.state.presentation:null;if(saved?.screen==='live'&&ctl.state.active?.checkpoints){const wasPaused=!!saved.paused;resumeSession();paused=wasPaused;saveLiveView();hud();return;}if(saved?.screen==='grid'&&ctl.state.active?.phase==='race'){weekendAction('start-grid');return;}openScreen(saved?.screen??'hub',saved??{});}
  function resumeSession(){const ctl=activeController(),phase=ctl.state?.active?.phase;if(phase==='practiceReview'){openScreen('practice-report');return;}if(phase==='qualifyingReview'){openScreen('qualifying-report');return;}const pack=ctl.recover();loadSession(pack);if(sessionComplete(cars))finish();}
  async function navigateStage(id){const ctl=activeController();if(await ctl.retrySave()===false){weekendUI.error('O save ainda não foi gravado. Exporte uma cópia ou tente salvar novamente antes de trocar de pista.');return;}location.href=circuitUrl(id,managerMode?'manager':'watch');}
  function weekendAction(action,args){const ctl=activeController();if(['resume','back-live','start-practice','start-qualifying','start-grid'].includes(action)&&ctl.state.active&&ctl.state.active.circuit!==CIRCUIT.id){location.href=circuitUrl(ctl.state.active.circuit,managerMode?'manager':'watch');return;}
    if(action.startsWith('simulate-')){const type=action.slice(9);weekendAction(type==='race'?'start-grid':type==='qualifying'?'start-qualifying':'start-practice',args);if(state==='presentation')weekendAction('skip-grid');simulateSession();return;}
    if(['hub','practice-report','qualifying-report','race-report','brief-practice','brief-qualifying','brief-race'].includes(action)){openScreen(action);return;}
    if(action==='manager'||action.startsWith('manager-')){const [tab,slot]=action.slice(8).split('-');managerUI.show(action==='manager'?undefined:tab,slot===undefined?undefined:Number(slot));return;}
    if(action==='resume'||action==='back-live'){resumeSession();return;}
    if(action==='start-practice'){loadSession(ctl.state.active?.phase==='practice'&&ctl.state.active.checkpoints?ctl.recover():ctl.begin(args));return;}
    if(action==='start-qualifying'){loadSession(ctl.state.active?.phase==='qualifying'?ctl.recover():ctl.toQualifying());return;}
    if(action==='start-grid'){
      if(state==='presentation')return;
      const pack=ctl.state.active?.phase==='race'?ctl.recover():ctl.toRace(ctl.recover().cars);
      race=pack.session;cars=pack.cars;elapsed=pack.elapsed??0;
      if(elapsed>0){loadSession(pack);return;}
      state='presentation';paused=true;finished=false;overview=false;followedId=cars[0].id;watchUI.update({active:false});$('#hud').hidden=true;$('#modal').hidden=true;document.body.classList.add('racing');weekendUI.show('grid');return;
    }
    if(action==='skip-grid'){if(state!=='presentation')return;loadSession({session:race,cars,elapsed:0,resumed:true});count=-1;return;}
    if(action==='new-season'){ctl.command('nextSeason');navigateStage(ctl.state.calendar[0]);return;}
    if(action==='next'){const next=ctl.state.calendar[ctl.state.round];if(next)navigateStage(next);else openScreen('hub',{tab:'season'});}
  }
  function pause(){if(state!=='racing'||finished)return;paused=!paused;saveLiveView();$('#modal').hidden=true;hud();}
  function finish(){const ctl=activeController();ctl.checkpoint(cars,race,elapsed);finished=true;overview=true;
    if(race.type==='practice'){ctl.finishPractice(cars);openScreen('practice-report');}
    else if(race.type==='qualifying'){ctl.completeQualifying(cars);openScreen('qualifying-report');}
    else{ctl.finish(cars);openScreen('race-report');}
  }
  $('#start').onclick=start;$('#restart').onclick=()=>resumeSession();$('#pause').onclick=pause;$('#resume').onclick=()=>pause();$('#home').onclick=()=>openScreen('hub');
  $('#weather-mode').onclick=()=>{const modes=['auto','dry','rain'];race.weather=modes[(modes.indexOf(race.weather)+1)%3];event(race,null,'Clima: '+({auto:'variável',dry:'seco fixo',rain:'chuva fixa'}[race.weather]));hud();};
  $('#race-speed').onclick=()=>{raceSpeed=raceSpeed===4?1:raceSpeed*2;hud();};
  addEventListener('keydown',e=>{if(sessionWorker||e.defaultPrevented||e.repeat||!$('#paddock').hidden||managerUI.isOpen()||weekendUI.isOpen)return;if(state!=='racing'||e.target.closest?.('input,select,textarea')||(e.code==='Space'&&e.target.closest?.('button,summary')))return;if(['ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.code==='KeyP'||e.code==='Space'||e.code==='Escape')pause();if(e.code==='KeyR')loadSession(activeController().begin());if(e.code==='KeyC'){overview=!overview;hud();}if(e.code==='ArrowLeft')switchCar(-1);if(e.code==='ArrowRight')switchCar(1);});
  // Pause when the tab loses focus so a background race is not missed.
  addEventListener('blur',()=>{if(state==='racing'&&!paused&&!finished)pause();});
  $('#sound').onclick=()=>{sound=!sound;$('#sound').textContent=sound?'SOM ON':'SOM OFF';if(sound&&!audio){audio=new AudioContext();osc=audio.createOscillator();gain=audio.createGain();const filter=audio.createBiquadFilter();osc.type='sawtooth';filter.type='lowpass';filter.frequency.value=430;osc.connect(filter);filter.connect(gain);gain.connect(audio.destination);gain.gain.value=0;osc.start();}if(sound)audio.resume();};
  let previous=performance.now(),hudTimer=0;
  function frame(now){let wallDt=Math.min((now-previous)/1000,2),dt=Math.min(wallDt,.05);previous=now;weekendUI.tick(wallDt);
    if(state==='intro'){for(const c of cars){c.s+=dt*(180+c.performance.acceleration*.15);Object.assign(c,at(c.s,c.lane));}}
    else if(!paused&&!finished){let remaining=Math.max(0,wallDt-Math.max(count,0))*raceSpeed;count-=wallDt;$('#countdown').textContent=race.type!=='race'?'':count>0?Math.ceil(count):count>-.8?'VAI!':'';while(remaining>0&&!finished&&state==='racing'){const tick=Math.min(remaining,1/30);elapsed+=tick;activeController().live(race);simulateField(cars,tick,elapsed,race);remaining-=tick;if(elapsed-checkpointTime>10){activeController().checkpoint(cars,race,elapsed);checkpointTime=elapsed;}if(sessionComplete(cars))finish();}}
    if(state==='racing'&&!managerMode&&director&&!paused&&!finished){directorTimer-=wallDt;if(directorTimer<=0){const active=raceOrder(cars).filter(c=>!c.retired&&!c.inGarage&&c.released&&c.finishTime===null),recent=race.events.find(e=>e.carId&&elapsed-e.time<8&&['contact','incident','mechanical','pit'].includes(e.type)),incident=active.find(c=>c.id===recent?.carId),battle=active.find((c,i)=>i>0&&active[i-1].progress-c.progress>0&&active[i-1].progress-c.progress<220);const target=incident??battle??active[0];if(target){followedId=target.id;cameraReason=incident?'Acontecimento na pista':battle?'Disputa próxima':'Líder da sessão';}directorTimer=10;}}
    if(state==='racing'){hudTimer+=dt;if(hudTimer>.15){hud();hudTimer=0;}}
    const watchActive=document.body.classList.contains('watch-view'),sceneTop=watchActive?(view.w<=760?106:94):0,sceneBottom=watchActive?watchUI.height:0,sceneHeight=Math.max(80,view.h-sceneTop-sceneBottom);
    const wide=state==='intro'||overview||!followed().released||followed().inGarage;
    if(state==='presentation'){const row=weekendUI.gridPair,front=cars.find(c=>Math.floor(c.grid/2)===row)??cars[0];camera.x+=(front.x-camera.x)*Math.min(1,dt*3);camera.y+=(front.y-camera.y)*Math.min(1,dt*3);camera.zoom+=((view.w<600?.72:.95)-camera.zoom)*Math.min(1,dt*3);}
    else if(wide){camera.x+=(W/2-camera.x)*Math.min(1,dt*3);camera.y+=(H/2-camera.y)*Math.min(1,dt*3);const target=state==='intro'?Math.max(view.w/W,view.h/H)*1.15:Math.min(view.w/W,sceneHeight/H)*.9;camera.zoom+=(target-camera.zoom)*Math.min(1,dt*3);}
    else{const c=followed();camera.x+=(c.x+Math.cos(c.angle)*c.v*.28-camera.x)*Math.min(1,dt*5);camera.y+=(c.y+Math.sin(c.angle)*c.v*.28-camera.y)*Math.min(1,dt*5);camera.zoom+=((view.w<600?CAMERA_ZOOM.mobile:CAMERA_ZOOM.desktop)-camera.zoom)*Math.min(1,dt*3);}
    ctx.fillStyle='#344e35';ctx.fillRect(0,0,view.w,view.h);ctx.save();if(watchActive){ctx.beginPath();ctx.rect(0,sceneTop,view.w,sceneHeight);ctx.clip();}ctx.translate(view.w*(state==='intro'?.60:.5),watchActive?sceneTop+sceneHeight*.5:view.h*.53);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);ctx.drawImage(world,0,0,W,H);
    for(const c of cars){if(state!=='intro'&&(!c.released||c.inGarage||!c.pit&&belowBridge(c.s)))continue;if(state==='racing'&&(c.surface==='gravel'||c.fault?.type==='engine'||c.fault?.type==='cooling')){ctx.fillStyle=c.surface==='gravel'?'#c8b68b65':'#bbc4c17a';for(let i=1;i<=3;i++){ctx.beginPath();ctx.ellipse(c.x-Math.cos(c.angle)*(10+i*8),c.y-Math.sin(c.angle)*(10+i*8),5+i*2,3+i,0,0,Math.PI*2);ctx.fill();}}drawCar(ctx,c,{player:state==='racing'&&c.id===followedId,scale:CAR_SCALE});}ctx.restore();
    if(state==='racing'&&race.wetness>.1){ctx.fillStyle=`rgba(99,139,165,${race.wetness*.09})`;ctx.fillRect(0,0,view.w,view.h);ctx.strokeStyle=`rgba(201,225,239,${race.wetness*.3})`;ctx.lineWidth=1;for(let i=0;i<70*race.wetness;i++){const x=(i*137+now*.15)%view.w,y=(i*197+now*.5)%view.h;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-6,y+15);ctx.stroke();}}
    if(audio){gain.gain.setTargetAtTime(sound&&state==='racing'&&!paused&&!finished&&count<=0?.018:0,audio.currentTime,.1);osc.frequency.setTargetAtTime(35+followed().v*.43,audio.currentTime,.06);}
    requestAnimationFrame(frame);
  }requestAnimationFrame(frame);
  $('#start').innerHTML='ASSISTIR · TUDO POR IA <span>↗</span>';
  if(route.mode==='watch')start();
  if(route.mode==='manager'){managerMode=true;if(manager.state){restorePresentation(manager);}else managerUI.show();}
}


