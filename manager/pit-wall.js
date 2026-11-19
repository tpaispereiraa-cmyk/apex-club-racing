import {CIRCUIT, length} from '../track.js';
import {COMPOUNDS, bestCompound} from '../race-systems.js';
import {lapTime, intervalTo} from '../watch-dashboard.js';
import {pendingPlan} from './pit-calls.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function rivalsAround(car, order) {
  const active = order.filter(c => !c.retired && c.finishTime === null);
  const place = active.indexOf(car);
  return place < 0 ? [null, null] : [active[place - 1] ?? null, active[place + 1] ?? null];
}

function rivalGap(label, car, other, ahead) {
  if (!other) return `<div><small>${label}</small><b>—</b></div>`;
  const distance = Math.abs(car.progress - other.progress)*CIRCUIT.metres/length;
  const gap = ahead ? intervalTo(car, other) : intervalTo(other, car);
  return `<div><small>${label} · ${esc(other.driver.name)}</small><b>${gap}</b><span>${Math.round(distance).toLocaleString('pt-BR')} m · ${lapTime(other.lapTimes.at(-1))}</span></div>`;
}

function gapChart(car, ahead, behind) {
  const halfRange = CIRCUIT.metres / 2;
  const marker = (other, direction) => {
    if (!other) return '';
    const metres = Math.abs(car.progress - other.progress) * CIRCUIT.metres / length;
    const offset = Math.min(1, Math.sqrt(metres / halfRange)) * 49;
    return `<i style="left:${50 + direction * offset}%"></i>`;
  };
  return `<div class="pit-wall-track" aria-hidden="true">${marker(behind,-1)}<b></b>${marker(ahead,1)}</div>`;
}

function paceChart(car, ahead, behind, expanded) {
  const series = [ahead, car, behind].filter(Boolean);
  const end = Math.max(...series.map(c => c.lapTimes.length));
  const rows = Array.from({length:Math.min(4,end)}, (_,i) => end - Math.min(4,end) + i);
  const values = rows.flatMap(i => series.map(c => c.lapTimes[i])).filter(v => v>0);
  const min = Math.min(...values), max = Math.max(...values);
  if (!rows.length) return '<p class="pit-wall-note">Os ritmos aparecem após a primeira volta.</p>';
  return `<details class="pit-wall-pace" ${expanded?'open':''}><summary>RITMO VOLTA A VOLTA</summary><div class="pit-wall-chart">${rows.map(i => `<div class="pit-wall-chart-lap"><small>V${i+1}</small><div>${series.map(c => {
    const v = c.lapTimes[i], box = c.lapDetails?.[i]?.pit;
    return v>0 ? `<div class="pit-wall-bar" style="--pace-color:${c===car?'#d5f561':'#71927f'};--pace-width:${45+55*(v-min)/Math.max(1,max-min)}%"><i></i><span>${esc(c.driver.name.split(' ').at(-1))} <b>${lapTime(v)}${box?' · BOX':''}</b></span></div>` : '';
  }).join('')}</div></div>`).join('')}</div><p class="pit-wall-note">Voltas de mesmo número. Barra menor indica volta mais rápida.</p></details>`;
}

export function pitWallHTML({car, team, order, race, compound, expanded}) {
  const m = car.manager, call = m.pitCall, next = pendingPlan(car);
  const [ahead, behind] = rivalsAround(car,order);
  const available = Object.entries(m.tyreStock).filter(([,count])=>count>0);
  const recommended = race.wetness < .3 ? next?.compound : bestCompound(race.wetness);
  const selected = [compound, call?.compound, recommended, bestCompound(race.wetness), ...available.map(([id])=>id)].find(id=>m.tyreStock[id]>0);
  const active = !car.pit && !car.retired && car.finishTime===null;
  const pending = car.pitRequested;
  const label = car.retired ? 'Abandonou' : car.finishTime!==null ? 'Finalizou' : car.pit ? 'Em atendimento ou no pit lane' : pending ? `Chamada V${call?.calledLap??car.lap} · ${car.pitReason}` : m.keepOutLap===car.lap ? `Mantendo na pista na V${car.lap}` : next ? `Plano V${next.lap} · ${COMPOUNDS[next.compound]?.name}` : 'Sem próxima parada planejada';
  const pitName = call?.compound && m.tyreStock[call.compound]>0 ? call.compound : null;
  return `<nav aria-label="Seus carros">${team.map(c=>`<button data-pit-slot="${c.slot}" aria-pressed="${c===car}">Carro ${c.slot+1} · ${esc(c.driver.name)}</button>`).join('')}</nav>
    <div class="pit-wall-gaps">${rivalGap('À FRENTE',car,ahead,true)}<div><small>SUA ÚLTIMA VOLTA</small><b>${lapTime(car.lapTimes.at(-1))}</b><span>V${car.lap} · ${COMPOUNDS[car.compound].name}</span></div>${rivalGap('ATRÁS',car,behind,false)}</div>
    ${gapChart(car,ahead,behind)}
    <div class="pit-wall-call${pending?' pending':''}"><div><small>${pending?'CHAMADA ATIVA':'BOXES'}</small><b>${esc(label)}</b>${pending&&pitName?`<span>Composto previsto · ${COMPOUNDS[pitName]?.name}</span>`:''}${m.pitNotice&&!pending?`<span>${esc(m.pitNotice)}</span>`:''}</div>
    <div class="pit-wall-actions"><select data-pit-compound aria-label="Composto para o box" ${!active||!available.length?'disabled':''}>${available.map(([id,count])=>`<option value="${id}" ${id===selected?'selected':''}>${COMPOUNDS[id].name} (${count})</option>`).join('')}</select><button data-pit-action="box" ${!active||!selected?'disabled':''}>PIT NOW</button><button data-pit-action="keepOut" title="Adiar a chamada até a próxima volta" ${!active||!pending||call?.source==='safety'?'disabled':''}>KEEP OUT</button></div></div>
    ${paceChart(car,ahead,behind,expanded)}`;
}
