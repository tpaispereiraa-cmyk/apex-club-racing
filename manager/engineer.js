import {financeProjection} from './career.js';
import {evaluateSetup,forecastStrategy} from './strategy.js';
import {strategyTelemetry} from './telemetry.js';
import {weatherForecast} from '../weather.js';
import {tyreSuitability} from '../race-systems.js';
import {CIRCUIT} from '../track.js';

export function financialOutlook(state,teamId=state.selectedTeam,cost=0){
  const f=financeProjection(state,teamId),team=state.teams[teamId],after=f.cash-cost,weeklyBurn=Math.max(0,-f.weeklyNet),reserve=(f.wages+f.maintenance)*2;
  return{...f,cost,after,reserve,runwayWeeks:weeklyBurn>0?Math.max(0,after/weeklyBurn):null,debt:team.debt??0,warnings:[
    ...(cost>f.cash?[{severity:'critical',title:'Caixa insuficiente',text:'O custo excede o dinheiro disponível.'}]:[]),
    ...(cost>f.capRemaining?[{severity:'critical',title:'Teto de gastos',text:'A despesa sujeita ao teto ultrapassa o saldo disponível.'}]:[]),
    ...(after>=0&&after<reserve?[{severity:'warning',title:'Reserva operacional curta',text:'Após esta despesa, o caixa fica abaixo de duas semanas de salários e operação. Prêmios de corrida não são garantidos.'}]:[]),
    ...((team.debt??0)>0?[{severity:'critical',title:'Dívida em aberto',text:'A equipe tem compromissos não pagos. Parte do caixa pode ser usada na amortização semanal.'}]:[])
  ]};
}

export function setupComparison(state,teamId,slot,patch){
  const before=evaluateSetup(state,teamId,slot),after=evaluateSetup(state,teamId,slot,patch);
  return{before,after,lap:after.lapSeconds-before.lapSeconds,top:after.topKmh-before.topKmh,sectors:after.sectors.map((v,i)=>v-before.sectors[i]),wear:after.tyreWear/before.tyreWear-1,thermal:after.peakEngineTemp-before.peakEngineTemp};
}

export function practiceDebrief(state,slot){
  const runs=state.active?.circuit===CIRCUIT.id?state.active.archive?.practice:state.archives?.filter(a=>a.circuit===CIRCUIT.id&&a.season===state.season).at(-1)?.practice;
  const driver=state.teams[state.selectedTeam].cars[slot].driver.id;
  const attempts=(runs??[]).map((session,index)=>({session,index:index+1,row:session.results.find(r=>r.teamId===state.selectedTeam&&r.driverId===driver)})).filter(x=>x.row?.bestLap>0);
  if(!attempts.length)return null;
  const current=attempts.at(-1),previous=attempts.at(-2),bestLap=x=>x.row.lapDetails?.find(l=>Math.abs(l.time-x.row.bestLap)<.001);
  if(!previous)return{current,previous:null,notes:['Primeira referência registrada. Altere uma variável por vez e repita o teste.']};
  const a=bestLap(previous),b=bestLap(current),notes=[];if((previous.session.physicsVersion??'manager-1')!==(current.session.physicsVersion??'manager-1'))notes.push('Versões de física diferentes: não atribua a mudança de tempo ao acerto.');
  if((a?.compound??previous.row.tyreHistory?.[0]?.compound)!==(b?.compound??current.row.tyreHistory?.[0]?.compound))notes.push('Compostos diferentes: parte do ganho pode vir dos pneus.');
  if(!a||!b)notes.push('Contexto de volta incompleto neste save.');
  else{
    if(a.condition!==b.condition||a.condition==='mixed')notes.push('A condição da pista mudou: os tempos não são diretamente comparáveis.');
    if(Math.abs(a.fuel-b.fuel)>3)notes.push(`Diferença de ${Math.abs(a.fuel-b.fuel).toFixed(1)} kg na volta rápida: a massa também alterou o tempo.`);
  }
  if(current.row.metrics?.errors||current.row.metrics?.contacts||previous.row.metrics?.errors||previous.row.metrics?.contacts)notes.push('Houve erros ou contatos nas sessões; confira as voltas antes de atribuir a diferença ao acerto.');
  notes.push('Conhecimento de pista, confiança e tráfego também mudam entre testes.');
  const sectors=[0,1,2].map(i=>current.row.sectors?.[i]&&previous.row.sectors?.[i]?current.row.sectors[i].seconds-previous.row.sectors[i].seconds:null);
  const changed=Object.entries(current.row.setup??{}).filter(([k,v])=>previous.row.setup?.[k]!==v).map(([key,value])=>({key,before:previous.row.setup?.[key],after:value}));
  const pieces=(current.row.build??[]).filter(p=>previous.row.build?.some(old=>old.part===p.part&&old.design!==p.design));
  return{current,previous,delta:current.row.bestLap-previous.row.bestLap,sectors,changed,pieces,notes};
}

export function liveAdvice(car,race){
  const t=strategyTelemetry(car,race),m=car.manager,alerts=[];if(!m||car.retired||car.finishTime!==null)return{telemetry:t,alerts};
  const add=(id,severity,title,text,action)=>alerts.push({id,severity,title,text,action});
  if(t.fuelAtFinish!==null&&t.fuelAtFinish<1)add('fuel',t.fuelAtFinish<0?'critical':'warning','Combustível no limite',`Projeção de ${t.fuelAtFinish.toFixed(1)} kg na chegada com o consumo recente. Poupe e acompanhe a próxima volta.`,'orders');
  if(car.fault)add('fault','critical','Avaria no carro','O carro precisa de atenção. Avalie a chamada ao box e a perda de desempenho.','box');
  if(car.engineTemp>112)add('heat','warning','Proteção térmica',`Motor a ${Math.round(car.engineTemp)}°C. A refrigeração atual está limitando o desempenho. Evite manter ataque e revise a abertura na próxima sexta.`,'orders');
  const next=m.strategy.stops.find((_,i)=>!(m.usedStops??[]).includes(i)),untilStop=next?Math.max(0,next.lap-car.lap):t.remainingLaps;
  if(t.tyreLapsRemaining!==null&&t.tyreLapsRemaining<untilStop)add('tyres',car.tyreLife<20?'critical':'warning','Pneu pode não chegar à janela',`~${t.tyreLapsRemaining.toFixed(1)} voltas até 10% de vida; faltam ${untilStop.toFixed(1)} até ${next?'a parada':'o fim'}. Conserve ou antecipe o box.`,'box');
  if(tyreSuitability(car.compound,race.wetness)<.85)add('compound','warning','Composto fora da janela',`Água na pista: ${Math.round(race.wetness*100)}%. A aderência do pneu atual está prejudicada; compare a tendência do tempo antes de trocar.`,'box');
  const forecast=weatherForecast(race);if(forecast.next&&forecast.next.from<120)add('weather','info','Mudança de tempo próxima',forecast.summary+'. Planeje a troca considerando a água atual e o tempo perdido no box.','strategy');
  if(m.orders.ers==='attack'&&car.energy<15)add('ers','warning','Bateria quase esgotada','O ataque de ERS não será sustentado. Recupere energia antes da próxima disputa.','orders');
  if(m.orders.pace==='attack'&&car.tyreLife<45)add('pace','warning','Ataque encurta o stint','O pneu já está gasto. Ganhar tempo agora pode exigir outra parada.','orders');
  alerts.sort((a,b)=>({critical:0,warning:1,info:2}[a.severity]-{critical:0,warning:1,info:2}[b.severity]));return{telemetry:t,alerts};
}

export function strategyChoices(state,teamId,slot){
  const car=state.teams[teamId].cars[slot],reference=forecastStrategy(state,teamId,slot),laps=reference.laps;
  const base=structuredClone(car.strategy),fuels=reference.suggestedFuel;
  const choices=[{id:'current',name:'Seu plano',plan:base},{id:'balanced',name:'Uma parada',plan:{...base,compound:'medium',fuelKg:fuels,stops:[{lap:Math.max(2,Math.round(laps*.48)),compound:'hard'}]}},{id:'attack',name:'Dois stints de ataque',plan:{...base,compound:'soft',fuelKg:fuels,stops:[{lap:Math.max(2,Math.round(laps*.32)),compound:'medium'},{lap:Math.max(3,Math.round(laps*.66)),compound:'hard'}]}},{id:'long',name:'Stint longo',plan:{...base,compound:'hard',fuelKg:fuels,stops:[]}}];
  return choices.map(c=>({...c,forecast:forecastStrategy(state,teamId,slot,c.plan)}));
}
