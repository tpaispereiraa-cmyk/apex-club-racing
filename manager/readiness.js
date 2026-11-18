import {CIRCUITS,CIRCUIT} from '../circuits.js';
import {raceLaps} from '../tournament.js';
import {PARTS} from './model.js';
import {forecastStrategy,evaluateSetup} from './strategy.js';

export function suggestedStrategy(circuit){const laps=raceLaps(circuit);return{compound:'medium',fuelKg:Math.min(250,Math.ceil((10+laps*3.5)*circuit.metres/4309)),stops:[{lap:Math.max(2,Math.round(laps*.48)),compound:'hard'}],rules:[{when:'wet',threshold:.25,compound:'inter'},{when:'dry',threshold:.15,compound:'medium'},{when:'tyres',threshold:32,compound:'hard'}]};}
export function weekendReadiness(state){
  const team=state.teams[state.selectedTeam],circuit=CIRCUITS.find(c=>c.id===state.calendar[state.round]),issues=[];
  if(!circuit)return issues;
  const add=(slot,tab,message,blocking=false)=>issues.push({slot,tab,message,blocking});
  for(const car of team.cars){
    const prefix=`Carro ${car.slot+1}`;
    if(car.driver.age>=38)add(car.slot,'people',`${prefix}: substitua o piloto, que atingiu a idade limite.`,true);
    else if(car.driver.remaining<=0)add(car.slot,'people',`${prefix}: renove o contrato ou contrate outro piloto.`,true);
    for(const [part,label] of Object.entries(PARTS)){
      const item=state.items[car.loadout[part]];
      if(!item||item.condition<=0){const reserve=Object.values(state.items).some(i=>i.teamId===team.id&&i.condition>0&&state.designs[i.designId]?.part===part&&state.designs[i.designId]?.valid&&!team.cars.some(c=>Object.values(c.loadout).includes(i.id)));add(car.slot,reserve?'car':'development',`${prefix}: ${label} destruído. ${reserve?'Instale um exemplar do estoque.':'Fabrique um exemplar, avance a agenda e instale-o.'}`,true);}
      else if(item.condition<55)add(car.slot,'car',`${prefix}: ${label} em ${Math.round(item.condition)}%. Repare ou substitua.`);
    }
    if((car.powerUnit?.condition??100)<75)add(car.slot,'car',`${prefix}: motor em ${Math.round(car.powerUnit.condition)}%. Considere substituir a unidade.`);
    if(!car.tyres[car.strategy.compound])add(car.slot,'strategy',`${prefix}: não há conjunto de ${car.strategy.compound} para a largada. Escolha outro composto.`,true);
    if(circuit.id===CIRCUIT.id){try{
      const forecast=forecastStrategy(state,team.id,car.slot),setup=evaluateSetup(state,team.id,car.slot);
      for(const alert of forecast.alerts)if(alert.title!=='Estoque insuficiente'||car.tyres[car.strategy.compound]>0)add(car.slot,'strategy',`${prefix}: ${alert.title.toLowerCase()}. ${alert.text}`);
      if(setup.peakEngineTemp>112)add(car.slot,'car',`${prefix}: refrigeração pode ativar proteção térmica. Pico estimado de ${setup.peakEngineTemp.toFixed(0)}°C.`);
    }catch{/* The destroyed-part recovery message above takes priority. */}}
    else if(car.strategy.fuelKg!==undefined&&car.strategy.fuelKg<suggestedStrategy(circuit).fuelKg*.9)add(car.slot,'strategy',`${prefix}: combustível abaixo da referência para ${circuit.name}. Revise o plano.`);
    if(car.strategy.stops.some(p=>p.lap>=raceLaps(circuit)))add(car.slot,'strategy',`${prefix}: uma parada está fora da distância deste GP. Ajuste a estratégia.`);
  }
  return issues;
}
