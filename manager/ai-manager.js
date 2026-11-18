import {copy} from './model.js';
import {evaluateSetup} from './strategy.js';
import {raceLaps} from '../tournament.js';
import {CIRCUIT} from '../track.js';
// Identical tools and estimates available to a human, with no future weather.
export function configureAIWeekend(state,{includePlayer=false}={}){
  const s=copy(state),laps=raceLaps(CIRCUIT);
  for(const t of Object.values(s.teams)){
    t.automatic=includePlayer||t.ownerId!==s.ownerId;
    if(!t.automatic)continue;
    for(const c of t.cars){
      const builds=[2,5,8].flatMap(rearWing=>[35,60,85,100].map(cooling=>({rearWing,frontWing:Math.round(rearWing*.9*2)/2,cooling})));
      const evaluated=builds.map(setup=>({setup,estimate:evaluateSetup(s,t.id,c.slot,setup)})).sort((a,b)=>Math.max(0,a.estimate.peakEngineTemp-112)-Math.max(0,b.estimate.peakEngineTemp-112)||a.estimate.lapSeconds-b.estimate.lapSeconds);
      Object.assign(c.setup,evaluated[0].setup);
      c.practice.confidence=Math.max(c.practice.confidence,75);c.practice.trackKnowledge=Math.max(c.practice.trackKnowledge,40);
      c.strategy={compound:t.supplier.efficiency>89?'medium':'hard',fuelKg:Math.min(250,Math.ceil((10+laps*3.5)*CIRCUIT.metres/4309)),stops:[{lap:Math.max(2,Math.round(laps*.48)),compound:'hard'}],rules:[{when:'wet',threshold:.25,compound:'inter'},{when:'dry',threshold:.15,compound:'medium'},{when:'tyres',threshold:30,compound:'hard'}]};
      c.aiBuilds=evaluated.map(e=>({setup:e.setup,estimatedLap:e.estimate.lapSeconds}));
    }
  }
  return s;
}
export function instructAI(c,race,gap){const m=c.manager;if(!m?.automatic||race.elapsed<(m.nextDecision??0))return;
  m.nextDecision=race.elapsed+5;const o=m.orders;
  o.pace=c.tyreTemp>108||c.tyreLife<35?'conserve':gap<150&&c.tyreLife>60?'attack':'normal';
  o.ers=c.energy<20?'harvest':gap<180&&c.energy>45?'attack':'auto';
  const remaining=Math.max(0,race.laps-c.lap+1);o.fuel=c.fuel<remaining*2.5?'save':'normal';
  o.overtake=c.driver.stats.overtaking>88&&c.tyreLife>50?'aggressive':'normal';o.defend=c.tyreLife<35?'preserve':c.driver.stats.defending>90?'firm':'normal';
  m.reason=`IA: ${o.pace==='attack'?'ataque ao rival':o.pace==='conserve'?'conservação dos pneus':'ritmo de stint'}`;
}
