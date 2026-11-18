import {TEAMS,TIERS,physics,rating} from './teams.js';
import {drawCar} from './car-renderer.js';
import {CAR_LABELS} from './car-specs.js';
import {DRIVER_LABELS,driverFor,driverRating} from './drivers.js';
const $=s=>document.querySelector(s);
function preview(canvas,team,number,slot,scale){const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);drawCar(c,{x:canvas.width/2,y:canvas.height/2,angle:0,team,number,slot},{scale});}
export function setupPaddock(){
  const root=$('#paddock'),list=$('#team-list'),detail=$('#team-detail');
  for(const tier of ['front','mid','back']){
    const group=document.createElement('div');group.className='team-group';
    group.innerHTML=`<h3>${TIERS[tier]} <span>${TEAMS.filter(t=>t.tier===tier).length} EQUIPES</span></h3>`;
    for(const team of TEAMS.filter(t=>t.tier===tier)){
      const button=document.createElement('button');button.className='team-row';button.dataset.team=team.id;button.setAttribute('aria-label',`Ver ficha de ${team.name}`);button.setAttribute('aria-pressed','false');button.style.setProperty('--team',team.color);
      button.innerHTML=`<canvas width="100" height="48" aria-hidden="true"></canvas><span><b>${team.name}</b><small>${team.country} · ${team.chassis}</small></span><i>↗</i>`;
      preview(button.querySelector('canvas'),team,team.numbers[0],0,1.12);button.onclick=()=>show(team);group.append(button);
    }list.append(group);
  }
  function show(team){
    list.querySelectorAll('[data-team]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.team===team.id)));
    detail.style.setProperty('--team',team.color);let p=physics(team);
    detail.innerHTML=`<div class="sheet-heading"><div><span class="sheet-kicker">${team.country.toUpperCase()} / ${TIERS[team.tier].toUpperCase()}</span><h2>${team.name}</h2><p>${team.character}</p></div><div class="team-rating"><b>${Math.round(rating(team))}</b><span>GERAL</span></div></div>
      <div class="car-stage"><span class="stage-model">${team.chassis}</span><canvas id="hero-car" width="680" height="215" aria-label="Vista superior do monoposto ${team.chassis}"></canvas><span class="stage-caption">MONOPOSTO HÍBRIDO · RODAS EXPOSTAS</span></div>
      <p class="team-description">${team.description}</p>
      <div class="technical-specs"><div><span>CHASSI</span><b>${team.chassis}</b></div><div><span>UNIDADE DE POTÊNCIA</span><b>${team.engine}</b></div><div><span>POTÊNCIA</span><b>${team.power} <small>cv</small></b></div><div><span>PESO</span><b>${team.weight} <small>kg</small></b></div></div>
      <div class="stat-bars car-attributes">${Object.entries(CAR_LABELS).map(([k,label])=>`<div><span>${label}</span><i><em style="width:${team.car[k]}%"></em></i><b>${team.car[k]}</b></div>`).join('')}</div>
      <div class="supplier-info">Motor compartilhado: ${team.supplier.power} cv de base · instalação ${(team.installation*100).toFixed(1)}%<br>Eficiência ${team.supplier.efficiency} · ERS ${team.supplier.ers} · Durabilidade ${team.supplier.durability}</div>
      <div class="entries-label">OS DOIS CARROS <span>MESMA ESPECIFICAÇÃO BASE</span></div>
      <div class="entry-cards">${team.numbers.map((n,i)=>{const d=driverFor(n);return`<div><canvas width="190" height="75" aria-label="Carro número ${n}"></canvas><b>#${n}</b><span>CARRO ${i+1} · CÂMERA ${i?'AMARELA':'DA EQUIPE'}</span><section class="driver-sheet"><h3>${d.name} <small>${driverRating(d)}</small></h3><p>${d.country} · ${d.age} anos</p>${Object.entries(DRIVER_LABELS).map(([k,label])=>`<div><span>${label}</span><b>${d.stats[k]}</b></div>`).join('')}<p>Agressividade: ${d.aggression} / 100</p></section></div>`;}).join('')}</div>
      <p class="sheet-note">Sede: ${team.base}. Fichas fictícias, lógica arcade. Os nove atributos dos pilotos são aplicados na simulação: ritmo em curva, ponto de freada, retomada, traçado, erros, pneus, chuva, ataque e defesa. Os dois carros compartilham a base mecânica; o resultado depende de quem pilota e das condições.</p>`;
    preview($('#hero-car'),team,team.numbers[0],0,5.1);
    detail.querySelectorAll('.entry-cards canvas').forEach((c,i)=>preview(c,team,team.numbers[i],i,1.65));
  }
  const close=()=>{root.hidden=true;document.body.classList.remove('paddock-open');$('#open-paddock').focus();};
  $('#open-paddock').onclick=()=>{root.hidden=false;document.body.classList.add('paddock-open');$('#close-paddock').focus();};
  $('#close-paddock').onclick=close;
  root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}if(e.key==='Tab'){const controls=[...root.querySelectorAll('button')],first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  show(TEAMS[0]);
}
