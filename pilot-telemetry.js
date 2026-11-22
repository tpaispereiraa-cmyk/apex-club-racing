import {drawCar} from './car-renderer.js';
import {PILOT_SETUP,PRESETS,SETUP,setupFor} from './pilot-driving.js';

const METRICS=[
  ['best','Melhor volta','Melhor volta completa de cada piloto.'],
  ['s1','Setor 1','Melhor primeiro setor de cada piloto.'],
  ['s2','Setor 2','Melhor segundo setor de cada piloto.'],
  ['s3','Setor 3','Melhor terceiro setor de cada piloto.'],
  ['ideal','Melhores setores','Volta ideal de cada piloto, somando seus melhores S1, S2 e S3. Os setores podem vir de voltas e acertos diferentes.']
];
const PRESET_SETUPS=Object.keys(PRESETS).map(id=>[PRESETS[id].name,setupFor(id)]);
const shortSector=ms=>ms==null?'—':`${(ms/1000).toFixed(3)} s`;
const roundLabel=round=>round==='legacy'?'Teste inicial':`Rodada de ${round.slice(8,10)}/${round.slice(5,7)}`;

function setupLabel(setup) {
  if(!setup)return 'Acerto sem registro';
  return PRESET_SETUPS.find(([,values])=>PILOT_SETUP.every(key=>values[key]===setup[key]))?.[0]??'Acerto manual';
}

function score(entry,metric) {
  if(metric==='best')return entry.best.ms;
  if(metric==='ideal')return entry.sectors.every(Boolean)?entry.sectors.reduce((sum,s)=>sum+s.ms,0):null;
  return entry.sectors[Number(metric[1])-1]?.ms??null;
}

function appendSetup(parent,setup,label) {
  const group=document.createElement('div'), title=document.createElement('b');
  title.textContent=label;
  group.append(title);
  if(setup){
    const list=document.createElement('dl');
    for(const id of PILOT_SETUP){
      const label=document.createElement('dt'), value=document.createElement('dd');
      label.textContent=SETUP[id].label;
      value.textContent=setup[id];
      list.append(label,value);
    }
    group.append(list);
  }
  parent.append(group);
}

function carDetails(entry,metric) {
  const paint=entry.livery, box=document.createElement('div'), canvas=document.createElement('canvas');
  box.className='telemetry-car';
  canvas.width=152;
  canvas.height=74;
  canvas.setAttribute('aria-label',`Pintura atual do carro #${paint.number}`);
  canvas.setAttribute('role','img');
  drawCar(canvas.getContext('2d'),{x:74,y:36,number:paint.number,team:{
    color:paint.primary,secondary:paint.secondary,accent:paint.accent,pattern:paint.pattern
  }},{scale:1.9});
  const details=document.createElement('details'), summary=document.createElement('summary');
  details.append(summary);
  if(metric==='ideal'){
    summary.textContent=`#${paint.number} · Acertos por setor`;
    entry.sectors.forEach(({setup},i)=>appendSetup(details,setup,`S${i+1} · ${setupLabel(setup)}`));
  }else{
    const setup=metric==='best'?entry.best.setup:entry.sectors[Number(metric[1])-1].setup;
    summary.textContent=`#${paint.number} · ${setupLabel(setup)}`;
    if(setup)appendSetup(details,setup,'Configuração da volta');
    else {
      const note=document.createElement('p');
      note.textContent='O jogo ainda não gravava esse acerto quando a volta foi feita.';
      details.append(note);
    }
  }
  box.append(canvas,details);
  return box;
}

export function addPilotTelemetry(ui,load,format,getPhase) {
  const dialog=document.createElement('dialog');
  dialog.className='telemetry-dialog';
  dialog.id='pilot-telemetry';
  dialog.setAttribute('aria-labelledby','telemetry-title');
  dialog.innerHTML=`
    <div class="telemetry-panel">
      <div class="telemetry-head">
        <div><p class="pilot-kicker">GP DE INTERLAGOS</p><h2 id="telemetry-title">Telemetria</h2></div>
        <form method="dialog"><button class="telemetry-close" aria-label="Fechar telemetria" autofocus>Fechar <span aria-hidden="true">×</span></button></form>
      </div>
      <p id="telemetry-status" class="telemetry-status" role="status"></p>
      <div class="telemetry-body" hidden>
        <div class="telemetry-controls">
          <div class="telemetry-sessions" role="group" aria-label="Sessão"></div>
          <label>Rodada<select aria-label="Rodada"></select></label>
        </div>
        <div class="telemetry-filters" role="group" aria-label="Ordenar por tempo">${METRICS.map(([id,label])=>`<button type="button" data-metric="${id}" aria-pressed="false">${label}</button>`).join('')}</div>
        <p class="telemetry-description"></p>
        <div class="telemetry-overview" hidden>
          <div><span>REFERÊNCIA DA SESSÃO</span><b data-leader></b><small data-leader-name></small></div>
          <div><span>SEU RESULTADO</span><b data-personal></b><small data-personal-gap></small></div>
        </div>
        <p class="telemetry-empty" hidden></p>
        <div class="telemetry-table-wrap" hidden>
          <table class="telemetry-table">
            <thead><tr><th scope="col">Pos.</th><th scope="col">Carro e acerto</th><th scope="col">Piloto</th><th scope="col">Tempo</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>`;
  ui.append(dialog);
  const $=selector=>dialog.querySelector(selector);
  const body=$('.telemetry-body'), status=$('#telemetry-status'), tabs=$('.telemetry-sessions'), roundSelect=$('select');
  const overview=$('.telemetry-overview'), table=$('.telemetry-table-wrap'), empty=$('.telemetry-empty');
  let report, phase, metric='best', requestNumber=0;

  function render() {
    const session=report.sessions.find(item=>item.id===phase);
    for(const button of tabs.children)button.setAttribute('aria-pressed',String(button.dataset.session===phase));
    for(const button of dialog.querySelectorAll('[data-metric]'))button.setAttribute('aria-pressed',String(button.dataset.metric===metric));
    $('.telemetry-description').textContent=METRICS.find(([id])=>id===metric)[2];
    const entries=session.entries.map(entry=>({...entry,ms:score(entry,metric)}))
      .filter(entry=>entry.ms!=null).sort((a,b)=>a.ms-b.ms||a.name.localeCompare(b.name,'pt-BR'));
    const time=metric.startsWith('s')?shortSector:format;
    const leader=entries[0], you=entries.find(entry=>entry.me);
    overview.hidden=table.hidden=!leader;
    empty.hidden=!!leader;
    empty.textContent=session.status==='upcoming'?'Esta sessão ainda vai começar.':session.entries.length?'Ainda não há setores registrados para este filtro.':'Nenhuma volta válida registrada nesta sessão.';
    if(!leader)return;
    $('[data-leader]').textContent=time(leader.ms);
    $('[data-leader-name]').textContent=leader.name;
    $('[data-personal]').textContent=you?time(you.ms):'—';
    $('[data-personal-gap]').textContent=you?(you.ms===leader.ms?'Melhor tempo':`+${shortSector(you.ms-leader.ms)} para o líder`):'Sem tempo neste filtro';
    $('tbody').replaceChildren(...entries.map((entry,i)=>{
      const row=document.createElement('tr'), position=row.insertCell(), car=row.insertCell(), pilot=row.insertCell(), pace=row.insertCell();
      row.classList.toggle('is-you',entry.me);
      position.textContent=entry.ms===entries[i-1]?.ms?entries.findIndex(candidate=>candidate.ms===entry.ms)+1:i+1;
      car.append(carDetails(entry,metric));
      const name=document.createElement('b');
      name.textContent=entry.name;
      pilot.append(name);
      if(entry.me){
        const tag=document.createElement('small');
        tag.textContent='Você';
        pilot.append(tag);
      }
      const mainTime=document.createElement('b'), detail=document.createElement('small');
      mainTime.textContent=time(entry.ms);
      const sectors=metric==='ideal'?entry.sectors.map(s=>s.ms):entry.best.sectors;
      detail.textContent=(metric==='best'||metric==='ideal')&&sectors
        ? sectors.map((ms,i)=>`S${i+1} ${shortSector(ms)}`).join(' · ')
        : entry.ms===leader.ms?'Referência':`+${shortSector(entry.ms-leader.ms)}`;
      pace.append(mainTime,detail);
      return row;
    }));
  }

  async function reload(round) {
    const request=++requestNumber;
    body.hidden=true;
    status.hidden=false;
    status.textContent='Buscando tempos…';
    try {
      const result=await load(round?`/telemetry?round=${encodeURIComponent(round)}`:'/telemetry');
      if(request!==requestNumber)return;
      report=result;
      if(!phase||round&&!report.sessions.find(s=>s.id===phase)?.entries.length){
        phase=report.sessions.find(s=>s.entries.length)?.id??'practice';
      }
      roundSelect.replaceChildren(...report.rounds.map(value=>new Option(roundLabel(value),value,value===report.round,value===report.round)));
      tabs.replaceChildren(...report.sessions.map(session=>{
        const button=document.createElement('button');
        button.type='button';
        button.dataset.session=session.id;
        button.textContent=session.name;
        return button;
      }));
      status.hidden=true;
      body.hidden=false;
      render();
    }catch(error){
      if(request===requestNumber)status.textContent=error.message;
    }
  }

  tabs.addEventListener('click',event=>{
    const button=event.target.closest('[data-session]');
    if(button){phase=button.dataset.session;render();}
  });
  $('.telemetry-filters').addEventListener('click',event=>{
    const button=event.target.closest('[data-metric]');
    if(button){metric=button.dataset.metric;render();}
  });
  roundSelect.addEventListener('change',()=>reload(roundSelect.value));
  ui.querySelector('#pilot-open-telemetry').addEventListener('click',()=>{
    phase=getPhase();
    metric='best';
    dialog.showModal();
    reload();
  });
}
