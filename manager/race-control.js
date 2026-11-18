import {clamp,pitProfile} from './model.js';
export const MODEL_UNITS={speed:'m/s',mass:'kg',power:'W',energy:'J',temperature:'°C'};
// Rendering scale is an adapter only. The manager model uses physical units.
export function unitAdapter(worldLength,metres){const scale=worldLength/metres;return{scale,toMetres:x=>x/scale,toWorld:x=>x*scale,toMps:v=>v/scale,toKmh:v=>v/scale*3.6};}
export function physicalForces(model,speed,fuel=0,drs=false){const v=Math.max(0,speed),rho=1.2,mass=model.mass+fuel,drag=.5*rho*model.cdA*(drs?1-model.drsFraction:1)*v*v,load=.5*rho*model.clA*(drs?.9:1)*v*v,power=model.powerKW*1000;const traction=model.mechanicalGrip*(mass*9.81+load)*.58;return{drag,load,mass,power,drive:Math.min(power/Math.max(v,12),traction),acceleration:(Math.min(power/Math.max(v,12),traction)-drag-mass*9.81*.012)/mass};}
const topSpeedCache=new WeakMap();
export function physicalTopSpeed(model,drs=false){const signature=[model.cdA,model.clA,model.powerKW,model.mass,model.mechanicalGrip,drs].join('|'),cached=topSpeedCache.get(model);if(cached?.signature===signature)return cached.value;let lo=20,hi=120;for(let n=0;n<30;n++){const v=(lo+hi)/2;if(physicalForces(model,v,0,drs).acceleration>0)lo=v;else hi=v;}const value=(lo+hi)/2;topSpeedCache.set(model,{signature,value});return value;}
export function physicalCornerLimit(model,curvature,grip=1,mass=model.mass){
  if(curvature<.00001)return physicalTopSpeed(model);
  const mu=model.mechanicalGrip*grip, aero=.5*1.2*model.clA/mass;
  // Cap the aerodynamic contribution to prevent a singularity at fast bends.
  return Math.min(physicalTopSpeed(model),Math.sqrt(mu*9.81/Math.max(curvature*.35,curvature-mu*aero)));
}
export function managerCapabilities(c,race,{traffic=0,drs=false,ers=false}={},worldLength,metres){
  const m=c.manager,p=m.model,o=m.orders,u=unitAdapter(worldLength,metres),v=u.toMps(c.v),f=physicalForces(p,v,c.fuel,drs);
  const fuel=o.fuel==='save'?.95:o.fuel==='push'?1.025:1,pace=o.pace==='conserve'?.96:o.pace==='attack'?1.025:1;
  const condition=clamp(1-c.damage*.003-Math.max(0,c.engineTemp-112)*.006,.55,1),wet=1-race.wetness*(.28+(100-c.driver.stats.adaptability)*.0015);
  const optimal={soft:98,medium:94,hard:91,inter:77,wet:68}[c.compound],compoundGrip={soft:1.045,medium:1,hard:.975,inter:.97,wet:.94}[c.compound];
  const suitability=['soft','medium','hard'].includes(c.compound)?1-race.wetness*.48:c.compound==='inter'?1-Math.abs(race.wetness-.43)*.33:1-Math.max(0,.68-race.wetness)*.48;
  const tyre=clamp((1-Math.max(0,78-c.tyreLife)*.0032)*(1-Math.min(.17,Math.abs(c.tyreTemp-optimal)*.0025))*compoundGrip*suitability,.25,1.05);
  const dirty=traffic*(1-p.stats.dirtyAir/115)*.22;
  const driver=.85+c.driver.stats.cornering*.0015,confidence=.975+p.confidence*.0002+(m.practice.trackKnowledge??0)*.00005+(race.type==='qualifying'?(m.practice.qualifyingKnowledge??0)*.00004:0);
  const imbalance=1-Math.abs(p.balance)*.035;
  const grip=clamp(wet*tyre*condition*(c.surface==='gravel'?.55:1)*(c.fault?.type==='puncture'?.54:1),.2,1.05);
  const base={low:(.69+p.stats.low*.0031),medium:(.69+p.stats.medium*.0031),high:(.69+p.stats.high*.0031)};
  const fault=c.fault?.type==='engine'?.58:c.fault?.type==='gearbox'?.78:1;
  const top=physicalTopSpeed(p,drs)*u.scale*fuel*condition*fault+(ers?u.toWorld(2):0);
  // The reduced physical model changes the envelope, then the proven traffic
  // solver handles movement. Reference envelopes keep the arcade race duration.
  return{grip,dirtyPenalty:dirty,maxSpeed:top,
    acceleration:u.toWorld(clamp(f.acceleration,1.2,19))*fuel*condition*fault*(ers?1.16:1)*(c.surface==='gravel'?.42:1)*(.85+c.driver.stats.reactions*.0015),
    braking:u.toWorld(45*(.7+p.braking*.003)*Math.sqrt(grip)*Math.sqrt(798/f.mass)*clamp(1-Math.max(0,m.brakeTemp-700)*.0007,.65,1)),
    low:base.low*grip*driver*confidence*imbalance*pace*(1-dirty*.55)*(1+(p.mechanicalGrip-1.52)*.18),
    medium:base.medium*grip*driver*confidence*imbalance*pace*(1-dirty*.8)*Math.sqrt(p.clA/6),
    high:base.high*grip*driver*confidence*imbalance*pace*(1-dirty)*Math.sqrt(p.clA/6),steering:(1.5+c.driver.stats.control*.01)*(1-Math.abs(p.balance)*.1),physical:{speed:v,drag:f.drag,load:f.load,cdA:p.cdA,clA:p.clA}};
}
export function managedErrorMultiplier(c){if(!c.manager)return 1;const m=c.manager,o=m.orders;return(o.pace==='attack'?1.65:o.pace==='conserve'?.65:1)*(o.overtake==='aggressive'?1.25:o.overtake==='careful'?.8:1)*(1+m.fatigue*.003+Math.abs(m.model.balance)*.15)*(1+(75-m.driverMorale)*.002);}
export function managedSystems(c,race,dt,{throttle=0,braking=0,corner=0,ers=false}={}){
  const m=c.manager,o=m.orders,p=m.model,pace=o.pace==='attack'?1.35:o.pace==='conserve'?.68:1;
  const rainTyre=c.compound==='wet'||c.compound==='inter',dryPenalty=rainTyre?Math.max(0,(c.compound==='wet'?.6:.25)-race.wetness):0,extraHeat=dryPenalty*(c.compound==='wet'?65:45);
  const previousFuel=c.fuel,previousLife=c.tyreLife;
  m.fatigue=clamp(m.fatigue+dt*(o.pace==='attack'?.035:.012),0,100);
  m.frontTemp+=(race.trackTemp+(rainTyre?35:50)+extraHeat+corner*22+Math.max(0,p.balance)*15+Math.abs(c.manager.model.balance)*5+(o.pace==='attack'?9:0)-m.frontTemp)*Math.min(1,dt*.15);
  m.rearTemp+=(race.trackTemp+(rainTyre?35:50)+extraHeat+throttle*8+Math.max(0,-p.balance)*15+(o.pace==='attack'?9:0)-m.rearTemp)*Math.min(1,dt*.15);
  m.brakeTemp+=(180+braking*600-(p.braking-70)*2-m.brakeTemp)*Math.min(1,dt*.25);
  c.tyreTemp=(m.frontTemp+m.rearTemp)/2;
  c.tyreLife=clamp(c.tyreLife-dt*(.025+corner*.055+braking*.015)*pace*p.tyreWear*(1.7-p.stats.tyres*.008)*(1-(m.practice.raceKnowledge??0)*.0008)*(1.65-c.driver.stats.smoothness*.0075)*(c.compound==='soft'?1.65:c.compound==='hard'?.65:1)*(1+Math.max(0,c.tyreTemp-105)*.035)*(1+dryPenalty*4),0,100);
  const fuelRate=(.015+throttle*.035)*(1.2-p.efficiency*.004)*(o.fuel==='save'?.72:o.fuel==='push'?1.2:1);c.fuel=Math.max(0,c.fuel-dt*fuelRate);
  const engineTarget=race.ambient+70+throttle*15+(ers?7:0)-(p.cooling-75)*.45+(c.fault?.type==='cooling'?25:0);c.engineTemp+=(engineTarget-c.engineTemp)*Math.min(1,dt*.1);
  c.engineHealth=clamp(c.engineHealth-dt*(.004+Math.max(0,c.engineTemp-112)*.007)*(1.5-c.team.supplier.durability*.008),0,100);
  c.energy=clamp(c.energy+dt*(ers?-7:braking*10+(o.ers==='harvest'?2.8:1.4)),0,100);
  m.fuelUsed=(m.fuelUsed??0)+previousFuel-c.fuel;m.tyreConsumed=(m.tyreConsumed??0)+previousLife-c.tyreLife;
  c.telemetry={...c.telemetry,throttle,braking,corner,orders:{...o},frontTemp:m.frontTemp,rearTemp:m.rearTemp,brakeTemp:m.brakeTemp,confidence:p.confidence,reason:m.reason};
}
export function applyRaceCommands(cars,commands,race=null){for(const command of commands){const c=cars.find(c=>c.manager?.slot===command.slot&&c.manager.teamId===command.teamId);if(!c||c.retired||c.finishTime!==null||command.sequence<=c.manager.commandSequence)continue;if(command.type==='orders'){c.manager.orderHistory??=[];c.manager.orderHistory.push({time:race?.elapsed??null,lap:c.lap,patch:{...command.patch},fuel:c.fuel,tyreLife:c.tyreLife,energy:c.energy,sequence:command.sequence});Object.assign(c.manager.orders,command.patch);c.manager.reason='Instrução do manager';}else if(command.type==='box'){c.pitRequested=true;c.pitReason='ordem do manager';c.manager.requestedCompound=command.compound;}c.manager.commandSequence=command.sequence;}}
export function managedStrategy(c,race,cars){if(!c.manager||c.pit||c.retired||c.finishTime!==null)return;const m=c.manager,plan=m.strategy;
  if(m.temporaryOrder&&c.lap>m.temporaryOrder.lap){Object.assign(m.orders,m.temporaryOrder.previous);m.temporaryOrder=null;}
  for(const [index,stop]of plan.stops.entries())if(c.lap>=stop.lap&&!m.usedStops.includes(index)&&race.type==='race'){c.pitRequested=true;c.pitReason='parada planejada';m.requestedCompound=stop.compound;m.usedStops.push(index);}
  for(const[index,rule]of plan.rules.entries()){
    const match=rule.when==='wet'?race.wetness>=rule.threshold:rule.when==='dry'?race.wetness<=rule.threshold&&!['soft','medium','hard'].includes(c.compound):rule.when==='tyres'?c.tyreLife<=rule.threshold:rule.when==='energy'?c.energy<=rule.threshold:rule.when==='fuel'?c.fuel<=rule.threshold:rule.when==='rivalPit'?cars.some(o=>o.team.id!==c.team.id&&o.pit&&Math.abs(o.progress-c.progress)<600):false;
    if(!match)m.usedRules=m.usedRules.filter(i=>i!==index);
    if(match&&!m.usedRules.includes(index)){if(rule.orders){if(rule.when==='rivalPit')m.temporaryOrder={lap:c.lap,previous:Object.fromEntries(Object.keys(rule.orders).map(k=>[k,m.orders[k]]))};Object.assign(m.orders,rule.orders);}if(rule.compound&&rule.compound!==c.compound){c.pitRequested=true;c.pitReason='regra automática: '+rule.when;m.requestedCompound=rule.compound;}m.usedRules.push(index);m.reason='Plano automático: '+rule.when;}
  }
  if(m.orders.team==='yield'&&cars.some(o=>o.team.id===c.team.id&&o.id!==c.id&&o.s<c.s&&c.s-o.s<180))m.yielding=true;else m.yielding=false;
}
export function managedCompound(c,race,fallback){if(!c.manager)return fallback;const m=c.manager,requested=m.requestedCompound;
  if(requested&&m.tyreStock[requested]>0)return requested;
  const preferred=race.wetness>.62?'wet':race.wetness>.22?'inter':fallback;
  return [preferred,fallback,'hard','medium','soft','inter','wet'].find(comp=>m.tyreStock[comp]>0)??c.compound;
}
export function managedPitTime(c,race,random){if(!c.manager)return 3.2;const p=pitProfile({pit:c.manager.pit}),error=random(race)<p.errorChance;return p.seconds+(error?2+random(race)*3:0);}
export function neutralization(race,type,duration=30){if(!['SC','VSC','green'].includes(type)||!Number.isFinite(duration)||duration<0||duration>180)throw Error('Neutralização inválida.');race.control={type,remaining:duration};}
export function updateRaceControl(race,dt){if(race.control&&race.control.type!=='green'){race.control.remaining-=dt;if(race.control.remaining<=0)race.control={type:'green',remaining:0};}}
