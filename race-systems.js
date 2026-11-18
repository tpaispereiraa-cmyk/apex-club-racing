import {PHYSICS_VERSION} from './physics-version.js';
import {weatherTarget} from './weather.js';
import {raceLaps} from './tournament.js';
import {clamp,length,CIRCUIT} from './track.js';
import {managerCapabilities,managedSystems,managedErrorMultiplier,physicalCornerLimit} from './manager/race-control.js';
import {sectionAt} from './track-profile.js';
export const COMPOUNDS={soft:{name:'Macio',color:'#ef6767',wear:1.85,grip:1.045,optimal:98},medium:{name:'Médio',color:'#f2d45e',wear:1,grip:1,optimal:94},hard:{name:'Duro',color:'#eceee2',wear:.62,grip:.975,optimal:91},inter:{name:'Intermediário',color:'#5cce8d',wear:1.15,grip:.97,optimal:77},wet:{name:'Chuva',color:'#66b9ed',wear:1.3,grip:.94,optimal:68}};
export function createRace({seed=2026,weather='auto',laps=raceLaps(CIRCUIT),type='race'}={}){return{seed,rng:seed>>>0,weather,weatherVersion:2,physicsVersion:PHYSICS_VERSION,laps,type,wetness:weather==='rain'?.8:0,ambient:28,trackTemp:34,archiveEvents:[],events:[],nextEventId:1,elapsed:0};}
export function random(race){race.rng=(Math.imul(1664525,race.rng)+1013904223)>>>0;return race.rng/4294967296;}
export function event(race,c,text,type='info'){race.events.unshift({id:race.nextEventId++,time:race.elapsed,carId:c?.id||null,text:c?`#${c.number} ${c.driver.name}: ${text}`:text,type});if(type!=='battle'){if(!race.archiveEvents){race.archiveEvents=[];race.archivePartial=true;}race.archiveEvents.push({...race.events[0]});}race.events.length=Math.min(race.events.length,12);}
export function updateWeather(race,dt,elapsed){race.elapsed=elapsed;const target=weatherTarget(race,elapsed);race.wetness+=(target-race.wetness)*Math.min(1,dt*.065);race.trackTemp=34-race.wetness*12;const phase=bestCompound(race.wetness);if(race.phase!==phase){if(race.phase)event(race,null,phase==='medium'?'Pista secando · pneus médios voltam a funcionar':phase==='inter'?'Pista úmida · janela de intermediários':'Chuva forte · DRS desativado','weather');race.phase=phase;}}
export function bestCompound(wetness){return wetness>.62?'wet':wetness>.22?'inter':'medium';}
export const isDryTyre=compound=>['soft','medium','hard'].includes(compound);
export function tyreSuitability(compound,wetness){return isDryTyre(compound)?1-wetness*.48:compound==='inter'?1-Math.abs(wetness-.43)*.33:1-Math.max(0,.68-wetness)*.48;}
export function chooseCompound(c,race){const wet=bestCompound(race.wetness);if(wet!=='medium')return wet;
  const preservation=(c.team.car.tyres+c.driver.stats.smoothness)/2;
  if(preservation>87||c.lap>=race.laps)return 'soft';return preservation<77?'hard':'medium';
}
export function gripFactor(c,race){
  const s=c.driver.stats,wet=race.wetness,suit=tyreSuitability(c.compound,wet);
  const mismatch=1-suit,adaptation=1-mismatch*(1-(s.adaptability/100)*.68);
  const waterLoss=1-wet*(.21+(100-s.adaptability)*.0017);
  const wear=1-Math.max(0,78-c.tyreLife)*.0032;
  const optimal=COMPOUNDS[c.compound].optimal;
  const temperature=1-Math.min(.15,Math.abs(c.tyreTemp-optimal)*.0023);
  const surface=c.surface==='gravel'?.55:1,fault=c.fault?.type==='puncture'?.54:1;
  return clamp(adaptation*waterLoss*wear*temperature*COMPOUNDS[c.compound].grip*surface*fault,.22,1.06);
}
export function capabilities(c,race,{traffic=0,drs=false,ers=false}={}){
  if(c.manager)return managerCapabilities(c,race,{traffic,drs,ers},length,CIRCUIT.metres);
  const p=c.performance,s=c.driver.stats,car=c.team.car;
  const fuelMass=1/(1+c.fuel*.0009),grip=gripFactor(c,race);
  const health=1-Math.max(0,90-c.engineHealth)*.0025-Math.max(0,c.engineTemp-112)*.004;
  const damage=1-c.damage*.003,engineFault=['engine','gearbox'].includes(c.fault?.type)?c.fault.type==='engine'?.58:.78:1;
  const dirtyPenalty=traffic*(1-car.dirtyAir/115)*.24;
  const driverUse=.83+s.cornering*.0017;
  const massGrip=Math.sqrt(798/(c.team.weight+c.fuel));
  return {grip,maxSpeed:p.maxSpeed*clamp(health,.65,1)*damage*engineFault+(drs?10+car.drs*.22:0)+(ers?7:0)+traffic*(5+car.dirtyAir*.07),
    acceleration:p.acceleration*(.68+s.reactions*.0032)*fuelMass*clamp(health,.65,1)*damage*engineFault*(c.surface==='gravel'?.42:1)*(ers?1.17:1),
    braking:p.braking*(.7+s.braking*.003)*Math.sqrt(grip)*massGrip,
    low:(.69+car.low*.0031)*driverUse*grip*massGrip*damage*(1-(c.damageParts?.frontWing||0)*.002)*(1-dirtyPenalty*.55),
    medium:(.69+car.medium*.0031)*driverUse*grip*massGrip*damage*(1-(c.damageParts?.frontWing||0)*.002)*(1-dirtyPenalty*.8),
    high:(.69+car.high*.0031)*driverUse*grip*massGrip*damage*(1-(c.damageParts?.rearWing||0)*.0025)*(1-dirtyPenalty),
    steering:p.steering*(.7+s.control*.003),dirtyPenalty};
}
export function cornerSpeed(c,race,section,cap){
  if(section.type==='straight')return cap.maxSpeed;
  if(c.manager){const m=c.manager,scale=length/CIRCUIT.metres,p=m.model,pace=m.orders.pace==='attack'?1.025:m.orders.pace==='conserve'?.96:1;
    const raw=physicalCornerLimit(p,section.curvature*scale,cap.grip,p.mass+c.fuel)*scale;
    return Math.min(cap.maxSpeed,raw*(.85+p.stats[section.type]*.0015)*(.85+c.driver.stats.cornering*.0015)*pace*(1-cap.dirtyPenalty)*(1-Math.abs(p.balance)*.035));
  }
  // Legacy aero/grip now modulate physical load, while each speed band stays independent.
  const chassis=c.manager?1:.94+c.team.stats.aero*.00035+c.team.stats.grip*.0003;
  return Math.min(cap.maxSpeed,section.speed*cap[section.type]*chassis);
}
export function plannedSpeed(c,race,cap){
  let target=cornerSpeed(c,race,sectionAt(c.s),cap);
  for(let distance=65;distance<=620;distance+=65){const section=sectionAt(c.s+distance),corner=cornerSpeed(c,race,section,cap);target=Math.min(target,Math.sqrt(corner*corner+2*cap.braking*distance));}
  return target;
}
export function battleScore(c,defending=false){const s=c.driver.stats;return(defending?s.defending:s.overtaking)*.65+s.accuracy*.2+s.control*.15;}
export function errorRate(c,race,section,braking,traffic){const s=c.driver.stats;return (.00015+(100-s.control)*.000035+(100-s.accuracy)*.000012+(section.type==='straight'?0:.0015)+(braking?.0008:0)+traffic*.001+(c.driver.aggression/100)*.001+race.wetness*(100-s.adaptability)*.00006+Math.max(0,c.tyreTemp-108)*.00007)*managedErrorMultiplier(c);}
export function updateSystems(c,race,dt,{throttle=0,braking=0,traffic=0,corner=0,ers=false}={}){
  if(c.manager){managedSystems(c,race,dt,{throttle,braking,traffic,corner,ers});return;}
  const car=c.team.car,s=c.driver.stats,moving=clamp(c.v/240,0,1);
  const dryness=1-race.wetness,wrong=1-tyreSuitability(c.compound,race.wetness);
  const tyreTarget=race.trackTemp+moving*(isDryTyre(c.compound)?53:40)+corner*15+braking*10+traffic*5-(car.tyres-70)*.12;
  c.tyreTemp+=(tyreTarget-c.tyreTemp)*Math.min(1,dt*.18);
  const wear=(.075+corner*.13+braking*.04)*COMPOUNDS[c.compound].wear*(1.7-car.tyres*.008)*(1.65-s.smoothness*.0075)*(1+Math.max(0,c.tyreTemp-102)*.025)*(1+wrong*2+(!isDryTyre(c.compound)?dryness*.9:0))+(c.surface==='gravel'?.2:0);
  c.tyreLife=clamp(c.tyreLife-wear*moving*dt,0,100);
  c.fuel=Math.max(0,c.fuel-(.065+throttle*.1)*(1.15-c.team.supplier.efficiency*.003)*dt);
  const engineTarget=race.ambient+45+throttle*33+(ers?8:0)+traffic*14-(car.cooling-70)*.38-race.wetness*5+(c.fault?.type==='cooling'?24:0);
  c.engineTemp+=(engineTarget-c.engineTemp)*Math.min(1,dt*.1);
  c.engineHealth=clamp(c.engineHealth-dt*(.006+Math.max(0,c.engineTemp-105)*.007)*(1.5-c.team.supplier.durability*.008),0,100);
  c.energy=clamp(c.energy+dt*(ers?-(9.5-c.team.supplier.ers*.025):braking*(7+c.team.supplier.ers*.035)+1.3),0,100);
  c.telemetry={...c.telemetry,throttle,braking,traffic,corner,grip:gripFactor(c,race),ers,tyreWear:wear};
}
