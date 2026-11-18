import {CIRCUITS,CIRCUIT} from './circuits.js';
import {CALENDAR,POINTS,REAL_LAPS,raceLaps} from './tournament.js';
import {parseRoute,circuitUrl} from './routes.js';
import {makeGeometry} from './circuit-geometry.js';
import * as interlagos from './interlagos.js';
const $=s=>document.querySelector(s);
export function setupCircuits(){
  document.title=`APEX CLUB — ${CIRCUIT.name}`;
  $('.live').innerHTML=`<i></i> ${CIRCUIT.name.toUpperCase()} <span>${CIRCUIT.location.toUpperCase()}</span>`;
  $('#intro>p').textContent=`${CIRCUIT.description} Sexta: treino livre. Sábado: duas voltas rápidas. Domingo: corrida de ${raceLaps(CIRCUIT)} voltas (50%).`;
  $('.race-spec>div:last-child b').innerHTML=`${(CIRCUIT.metres/1000).toLocaleString('pt-BR',{minimumFractionDigits:3})} <small>km</small>`;
  $('.race-spec>div:last-child span').textContent='EXTENSÃO DE REFERÊNCIA';
  $('#trackcard h2').textContent=CIRCUIT.name;
  $('#trackcard p').textContent=`${CIRCUIT.fullName} · versão arcade`;
  $('.card-top span').textContent=`THE TRACK / ${CIRCUIT.corners} CURVAS`;
  document.querySelector('.race-spec>div:first-child b').textContent=raceLaps(CIRCUIT);const button=document.createElement('a');button.className='circuit-open';button.textContent='CIRCUITOS E CAMPEONATO · 14 PISTAS ↗';button.id='open-circuits';button.href='/circuitos';
  $('.intro-actions').after(button);
  const panel=document.createElement('section');panel.id='circuits';panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-labelledby','circuits-title');
  panel.innerHTML=`<div class="circuits-header"><div><span class="sheet-kicker">APEX CLUB / WORLD CIRCUITS</span><h2 id="circuits-title">O mundo é a sua pista.</h2><p>Escolha a pista e como participar. Campeonato com 14 etapas e dois modos independentes.</p></div><a href="/" class="circuits-back">VOLTAR AO INÍCIO ↗</a></div><div class="circuit-grid"></div><p class="circuit-note">Traçados geográficos adaptados ao jogo: pista plana, boxes e DRS simplificados. Barcelona usa a versão com chicane final. <a href="https://github.com/bacinger/f1-circuits" target="_blank" rel="noopener">Dados de Tomislav Bacinger · MIT</a></p>`;
  const grid=panel.querySelector('.circuit-grid');
  for(const [i,id] of CALENDAR.entries()){
    const c=CIRCUITS.find(c=>c.id===id);const geo=c.id==='interlagos'?interlagos:makeGeometry(c),stride=Math.max(1,Math.floor(geo.path.length/450));
    const points=geo.path.filter((_,j)=>j%stride===0).map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),start=geo.at(0);
    const link=document.createElement('article');link.className=`circuit-option${c.id===CIRCUIT.id?' selected':''}`;link.setAttribute('aria-label',c.name);if(c.id===CIRCUIT.id)link.setAttribute('aria-current','true');
    link.innerHTML=`<div class="circuit-number">${String(i+1).padStart(2,'0')}<span>${c.id===CIRCUIT.id?'SELECIONADO':c.theme==='urban'?'URBANO':'GRAND PRIX'}</span></div><svg viewBox="0 0 ${geo.W} ${geo.H}" role="img" aria-label="Traçado de ${c.name}"><polyline points="${points} ${geo.path[0].x},${geo.path[0].y}" fill="none" stroke="currentColor" stroke-width="5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><circle cx="${start.x}" cy="${start.y}" r="${Math.max(geo.W,geo.H)*.016}" fill="#d5f561"/></svg><h3>${c.name}</h3><p>${c.location}</p><div class="circuit-facts"><span>${(c.metres/1000).toLocaleString('pt-BR',{minimumFractionDigits:3})} km</span><span>${raceLaps(c)} voltas · 50%</span></div><div class="circuit-modes"><a href="${circuitUrl(c.id)}" aria-label="Assistir em ${c.name}">ASSISTIR ↗</a><a href="${circuitUrl(c.id,'manager')}" aria-label="Jogar Manager em ${c.name}">JOGAR MANAGER ↗</a></div>`;
    grid.append(link);
  }
  document.body.append(panel);
  const calendar=document.createElement('section');calendar.className='tournament-rules';calendar.innerHTML=`<h2>O fim de semana.</h2><div class="weekend-stages"><article><b>01 / SEXTA</b><h3>Treino livre</h3><p>Teste peças e acertos na pista. Compare tempos e volte à oficina para refinar a build antes de fechar o carro.</p></article><article><b>02 / SÁBADO</b><h3>Qualificação</h3><p>Uma volta de saída e duas voltas rápidas por piloto. O melhor tempo determina o grid.</p></article><article><b>03 / DOMINGO</b><h3>Corrida · 50%</h3><p>Metade das voltas de referência, arredondada para cima. Estratégia, pneus e instruções valem na pista.</p></article></div><h2>Pontos e calendário.</h2><p>Os dois carros pontuam para os construtores. Treino e qualificação não dão pontos. Sem bônus de volta mais rápida.</p><div class="points-grid">${POINTS.map((p,i)=>'<span>'+(i+1)+'º <b>'+p+' pts</b></span>').join('')}</div><p>Desempate por vitórias, segundos lugares e demais colocações. Abandonos não pontuam nesta versão.</p><ol class="season-calendar">${CALENDAR.map(id=>{const c=CIRCUITS.find(c=>c.id===id);return '<li><b>'+c.name+'</b><span>'+raceLaps(c)+' / '+REAL_LAPS[id]+' voltas</span></li>';}).join('')}</ol><p class="circuit-note">Calendário próprio do APEX CLUB. Sexta, sábado e domingo são etapas do jogo, sem bloqueio pelo dia real. <a href="https://www.formula1.com/en/racing/2026/brazil" target="_blank" rel="noopener">Voltas de referência: Formula1.com</a>; Nürburgring usa o GP de Eifel de 2020.</p>`;panel.insertBefore(calendar,panel.querySelector('.circuit-note'));
  if(parseRoute(location.href).page==='circuits'){panel.hidden=false;document.body.classList.add('circuit-route');document.title='APEX CLUB — Circuitos e campeonato';}
}
