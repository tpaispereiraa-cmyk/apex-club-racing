import {raceLaps} from '../tournament.js';
import {deriveCar,copy} from './model.js';
import {physicalTopSpeed} from './race-control.js';
import {length,CIRCUIT} from '../track.js';
import {sectionAt,PIT} from '../track-profile.js';
import {capabilities,plannedSpeed,createRace} from '../race-systems.js';
export function evaluateSetup(state,teamId,slot,patch={}){
  const s=copy(state);Object.assign(s.teams[teamId].cars[slot].setup,patch);const own=s.teams[teamId].cars[slot],p=deriveCar(s,teamId,slot),max=physicalTopSpeed(p),scale=length/CIRCUIT.metres;
  // Fixed dry reference, not a prediction of traffic, random errors or weather.
  // Use the live corner/braking envelope: a separate formula previously ranked
  // wing settings in the opposite order to the cars actually running on track.
  const race=createRace({weather:'dry',type:'practice',laps:3}),car={s:0,v:max*scale,driver:own.driver,fuel:18,damage:0,engineTemp:88,tyreLife:92,tyreTemp:96,compound:'medium',surface:'asphalt',fault:null,manager:{model:p,orders:own.orders,practice:own.practice,brakeTemp:350}};
  const step=40,count=Math.ceil(length/step),sectors=[0,0,0];let seconds=0,turnLoad=0,peakEngineTemp=0;
  // Two warm-up passes close the flying lap; the third supplies timing.
  for(let pass=0;pass<3;pass++)for(let i=0;i<count;i++){
    car.s=i*step;const distance=Math.min(step,length-car.s),previous=car.v,cap=capabilities(car,race),accuracy=1-(100-car.driver.stats.accuracy)*.00016;
    const target=plannedSpeed(car,race,cap)*accuracy;
    car.v=Math.max(Math.sqrt(Math.max(0,previous*previous-2*cap.braking*distance)),Math.min(target,Math.sqrt(previous*previous+2*cap.acceleration*distance)));
    const dt=distance/Math.max(1,(previous+car.v)/2),throttle=target>previous?1:.25,thermalTarget=race.ambient+70+throttle*15-(p.cooling-75)*.45;
    car.engineTemp+=(thermalTarget-car.engineTemp)*Math.min(1,dt*.1);
    if(pass===2){seconds+=dt;for(let n=0;n<3;n++){const overlap=Math.max(0,Math.min(car.s+distance,(n+1)*length/3)-Math.max(car.s,n*length/3));sectors[n]+=dt*overlap/distance;}peakEngineTemp=Math.max(peakEngineTemp,car.engineTemp);if(sectionAt(car.s).type!=='straight')turnLoad+=distance/length;}
  }
  return{lapSeconds:seconds,sectors,turnLoad,topKmh:max*3.6,cdA:p.cdA,clA:p.clA,balance:p.balance,mass:p.mass,tyreWear:p.tyreWear*(1+turnLoad*.3),confidence:p.confidence,peakEngineTemp,warning:peakEngineTemp>112?'A refrigeração pode causar proteção térmica e perda de desempenho.':'',uncertainty:Math.max(.015,.12-state.teams[teamId].cars[slot].practice.km*.0005),model:p};
}
// Forecast is deliberately an estimate: it does not consult random future events.
export function forecastStrategy(state,teamId,slot,plan=state.teams[teamId].cars[slot].strategy,laps=raceLaps(state.calendar[state.round]??CIRCUIT.id)){
  const e=evaluateSetup(state,teamId,slot),car=state.teams[teamId].cars[slot],pitDistance=(length-PIT.entry+PIT.exit)/(length/CIRCUIT.metres),pitLoss=pitDistance/22-pitDistance/(e.topKmh/3.6*.8)+3.2;
  const fuelPerLap=e.lapSeconds*.042*(1.2-e.model.efficiency*.004)*(car.orders.fuel==='save'?.72:car.orders.fuel==='push'?1.2:1),suggestedFuel=Math.min(250,Math.ceil(fuelPerLap*laps*1.12+2)),startFuel=plan.fuelKg??(10+laps*3.5)*CIRCUIT.metres/4309;
  const baseWear=e.lapSeconds*(.025+e.turnLoad*.04+.002)*e.model.tyreWear*(1.7-e.model.stats.tyres*.008)*(1.65-car.driver.stats.smoothness*.0075)*(car.orders.pace==='attack'?1.35:car.orders.pace==='conserve'?.68:1);
  let compound=plan.compound,age=0,total=0;const stints=[],stops=plan.stops,required={};let stint={compound,from:1,laps:0};required[compound]=1;
  for(let lap=1;lap<=laps;lap++){
    const stop=stops.find(stop=>stop.lap===lap);if(stop){stints.push(stint);total+=Math.max(4,pitLoss);compound=stop.compound;required[compound]=(required[compound]??0)+1;age=0;stint={compound,from:lap,laps:0};}
    const base=compound==='soft'?-.45:compound==='hard'?.3:compound==='inter'?3:compound==='wet'?6:0;
    const wear=baseWear*(compound==='soft'?1.65:compound==='hard'?.65:1),life=Math.max(0,100-wear*age),degradation=Math.max(0,78-life)*.0032*e.lapSeconds*.65;
    total+=e.lapSeconds+base+degradation+(age===0?.8:0)+Math.max(0,startFuel-lap*fuelPerLap-18)*.012;age++;stint.laps++;stint.estimatedLife=Math.max(0,100-wear*age);
  }
  stints.push(stint);const alerts=[];for(const [id,n]of Object.entries(required))if(n>(car.tyres[id]??0))alerts.push({severity:'critical',title:'Estoque insuficiente',text:`Plano exige ${n} conjunto(s) de ${id}; disponíveis: ${car.tyres[id]??0}.`});
  if(startFuel<fuelPerLap*laps+1)alerts.push({severity:'critical',title:'Margem de combustível baixa',text:`Referência de ${fuelPerLap.toFixed(2)} kg/volta; pode faltar combustível se o consumo se mantiver.`});
  if(stints.some(s=>s.estimatedLife<20))alerts.push({severity:'warning',title:'Stint estendido',text:'Um stint termina abaixo de 20% de vida estimada. Conservar ou outra parada pode ser necessário.'});
  if(['inter','wet'].includes(plan.compound))alerts.push({severity:'warning',title:'Plano para chuva',text:'Esta comparação assume pista seca. O pneu de chuva precisa ser avaliado com a previsão e a água na pista.'});
  return{laps,estimatedSeconds:total,range:[total*(1-e.uncertainty),total*(1+e.uncertainty)],pitLoss:Math.max(4,pitLoss),stints,fuelPerLap,suggestedFuel,fuelMargin:startFuel-fuelPerLap*laps,required,alerts,warning:'Referência seca aproximada; tráfego, chuva, incidentes, desgaste térmico e regras automáticas podem alterar o plano.'};
}
