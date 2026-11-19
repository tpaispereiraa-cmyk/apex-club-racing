import {queuePit} from './manager/pit-calls.js';
import {conditionOf} from './weekend-archive.js';
import {recordSectorCrossings,flushSectorCrossings,newSectorTiming} from './sector-timing.js';
import {at,length,mod,clamp,ROAD,CIRCUIT} from './track.js';
import {managedStrategy,managedCompound,managedPitTime,applyRaceCommands,updateRaceControl,neutralization} from './manager/race-control.js';
import {instructAI} from './manager/ai-manager.js';
import {startingGrid,TEAMS} from './teams.js';
import {driverRating} from './drivers.js';
import {garageStop} from './pit-layout.js';
import {CAR_WIDTH,SAFETY_GAP,LANE_CLEARANCE,GRID_SPACING} from './vehicle-geometry.js';
import {sectionAt,drsZoneAt,crosses,PIT,pitOffset} from './track-profile.js';
import {createRace,random,event,updateWeather,bestCompound,tyreSuitability,capabilities,plannedSpeed,battleScore,errorRate,updateSystems,chooseCompound,COMPOUNDS,isDryTyre} from './race-systems.js';
import {resolveContacts,updateMechanical,safeEscapeSide,FAULT_LABELS} from './race-incidents.js';
export function createField(race=createRace(),gridResults=null,customEntries=null){
  // Seedable grid estimate; this is not a separate qualifying session.
  let entries=startingGrid().map(e=>({...e,qualifying:(20-e.grid)*.6+driverRating(e.driver)*.35+random(race)*1.6})).sort((a,b)=>b.qualifying-a.qualifying);
  if(customEntries){const byId=new Map(customEntries.map(e=>[e.id,e]));entries=entries.map(e=>({...e,...structuredClone(byId.get(e.id)??{})}));}
  if(race.type==='practice'&&race.practiceCar)entries=entries.filter(e=>e.id===race.practiceCar);
  if(gridResults){const positions=new Map(gridResults.map((r,i)=>[r.id,i]));if(entries.some(e=>!positions.has(e.id)))throw new Error('Grid com carro desconhecido ou ausente.');entries.sort((a,b)=>positions.get(a.id)-positions.get(b.id));}
  const qualifying=race.type!=='race';
  const field=entries.map((entry,grid)=>{let s=qualifying?-length+PIT.exit:-80-Math.floor(grid/2)*GRID_SPACING,lane=qualifying?-24:grid%2?24:-24;
    return{...entry,grid,...at(s,lane),s,progress:s,lap:1,v:0,lane,laneTarget:lane,finishTime:null,lapStart:null,bestLap:Infinity,previousLap:1,
      lapTimes:[],lapDetails:[],pitHistory:[],lapContext:null,sectorTiming:newSectorTiming(),released:!qualifying,releaseAt:qualifying?grid*(race.type==='qualifying'&&customEntries?9:2.25):0,inGarage:false,
      launchDelay:.08+(100-entry.driver.stats.reactions)*.012,compound:bestCompound(race.wetness),tyreLife:100,tyreTemp:race.wetness>.2?70:90,
      engineTemp:88,engineHealth:100,energy:80,fuel:(10+race.laps*11)*length/14577.843081736215,damage:0,damageParts:{frontWing:0,rearWing:0,suspension:0},fault:null,retired:false,retirementTime:null,contactUntil:0,surface:'asphalt',escapeSide:0,drs:false,drsEligible:false,drsZone:-1,ers:false,
      pit:null,pitRequested:false,pitReason:'',pitStops:0,status:'LARGADA',incident:null,errorCooldown:5,decisionCooldown:0,battleMode:'',battleUntil:0,metrics:{attacks:0,defenses:0,errors:0,contacts:0,faults:0,gravel:0},telemetry:{}};
  });
  for(const c of field){c.compound=chooseCompound(c,race);c.raceWorldLength=length;c.raceMetres=CIRCUIT.metres;c.tyreFittedAtS=c.s;c.tyreHistory=[];if(c.manager){c.compound=race.type==='practice'?(race.practiceCompound??'medium'):qualifying?'soft':c.manager.strategy.compound;if(c.manager.tyreStock[c.compound]<=0)c.compound=managedCompound(c,race,'medium');if(c.manager.tyreStock[c.compound]>0)c.manager.tyreStock[c.compound]--;c.fuel=!qualifying&&c.manager.strategy.fuelKg!==undefined?c.manager.strategy.fuelKg:(qualifying?20:(10+race.laps*3.5)*(CIRCUIT.metres/4309));c.engineHealth=c.manager.engineCondition??100;}}
  for(const c of field)c.tyreHistory.push({compound:c.compound,lap:1});
  field.race=race;return field;
}
function requestPit(c,race){if(c.finishTime!==null||c.retired||c.pit||c.manager?.pitCall?.source==='safety')return;
  const suitability=tyreSuitability(c.compound,race.wetness);const wrong=bestCompound(race.wetness)!==c.compound&&suitability<(c.manager?.65:.9);const worn=c.tyreLife<(c.manager?10:38);
  const available=!c.manager||Object.values(c.manager.tyreStock).some(n=>n>0);
  const safety = c.damage > 12 || !!c.fault || c.tyreLife < 3 || (!c.manager && c.engineHealth < 76);
  if (!safety && !(available && (wrong || worn))) return;
  if (!c.manager && c.pitRequested) return;
  const reason = c.fault ? FAULT_LABELS[c.fault.type] : safety && c.damage > 12 ? 'reparo' : wrong ? 'troca por clima' : 'pneus gastos';
  if (queuePit(c, {source:safety?'safety':'rule', reason})) event(race,c,'box solicitado · '+reason,'pit');
}
function enterPit(c,race){
  const index=TEAMS.findIndex(t=>t.id===c.team.id),marker=garageStop(index),base=Math.floor(c.s/length)*length;
  c.pit={stopAt:base+marker,exitAt:base+length+PIT.exit,served:false,remaining:0,compound:managedCompound(c,race,chooseCompound(c,race))};
  if(c.pit.stopAt<c.s)c.pit.stopAt+=length;
  c.pit.entryLap=c.lap;
  c.pit.call=c.manager?.pitCall??null;
  if(c.manager)c.manager.pitNotice=null;
  if(c.lapContext)c.lapContext.pit=true;
  c.pitRequested=false;c.drs=false;c.status='PIT LANE';event(race,c,'entrou nos boxes','pit');
}
function service(c,race,dt){
  const pit=c.pit;if(!pit||pit.served||c.s<pit.stopAt-.01)return false;
  if(pit.remaining===0){pit.serviceStartedAt=race.elapsed;pit.reason=c.pitReason;pit.from=c.compound;pit.remaining=managedPitTime(c,race,random)+c.damage*.16+(c.engineHealth<85?3:0)+(c.fault?5:0);if(c.manager){c.manager.serviceCosts=(c.manager.serviceCosts??0)+Math.ceil(c.damage*1700+(c.fault?50000:0));c.manager.repairedDamage=(c.manager.repairedDamage??0)+c.damage;}}
  pit.remaining=Math.max(.000001,pit.remaining-dt);c.v=0;c.status='TROCA DE PNEUS';
  if(pit.remaining<=.000001){c.pitHistory??=[];c.pitHistory.push({lap:c.lap,entryLap:pit.entryLap??c.lap,calledLap:pit.call?.calledLap??null,source:pit.call?.source??null,time:race.elapsed,seconds:pit.serviceStartedAt===undefined?null:race.elapsed-pit.serviceStartedAt,from:pit.from??c.compound,compound:pit.compound,reason:pit.reason??c.pitReason,repair:!!c.fault||c.damage>0});const repair=!!c.fault||c.damage>0,canFit=!c.manager||c.manager.tyreStock[pit.compound]>0;c.pitHistory.at(-1).compound=canFit?pit.compound:c.compound;c.pitHistory.at(-1).tyresChanged=canFit;if(canFit){c.tyreHistory??=[];c.tyreHistory.push({compound:pit.compound,lap:c.lap});c.tyreFittedAtS=c.s;c.compound=pit.compound;c.tyreLife=100;c.tyreTemp=isDryTyre(c.compound)?85:65;if(c.manager)c.manager.frontTemp=c.manager.rearTemp=c.tyreTemp;}c.damage=0;c.damageParts={frontWing:0,rearWing:0,suspension:0};c.fault=null;c.engineHealth=c.manager?Math.min(c.manager.engineCondition??100,Math.max(c.engineHealth,85)):Math.max(c.engineHealth,94);c.engineTemp=Math.min(c.engineTemp,98);pit.served=true;c.pitStops++;event(race,c,(canFit?'pneus '+COMPOUNDS[c.compound].name.toLowerCase()+' instalados':'sem pneus novos · manteve conjunto')+(repair?' · reparo concluído':''),'pit');}
  if(pit.served&&c.manager){if(c.manager.tyreStock[pit.compound]>0)c.manager.tyreStock[pit.compound]--;if(pit.call?.planIndex!==undefined&&c.pitHistory.at(-1).tyresChanged){c.manager.usedStops??=[];c.manager.usedStops.push(pit.call.planIndex);}c.manager.pitCall=null;c.manager.requestedCompound=null;c.manager.pit.fatigue=clamp(c.manager.pit.fatigue+3,0,100);}
  return true;
}
function incident(c,race,section,dt,braking,traffic){
  c.errorCooldown=Math.max(0,c.errorCooldown-dt);
  if(c.incident){c.incident.remaining-=dt;if(c.incident.remaining<=0){c.incident=null;c.errorCooldown=8;}return;}
  if(c.errorCooldown>0||c.v<110||c.pit||c.retired||c.finishTime!==null)return;
  if(random(race)>=1-Math.exp(-errorRate(c,race,section,braking,traffic)*dt))return;
  const severity=(100-c.driver.stats.control)/100,roll=random(race),kind=roll<.65?'lockup':roll<.93?'wide':'spin';
  c.incident={kind,remaining:kind==='lockup'?1.2+severity:kind==='wide'?2+severity*2:3+severity*3};
  if(kind==='wide')c.escapeSide=safeEscapeSide(c);
  c.metrics.errors++;
  c.tyreLife=Math.max(0,c.tyreLife-(kind==='lockup'?3:1));if(kind==='wide')c.damage+=2+severity*5;
  c.status=kind==='lockup'?'TRAVOU RODA':kind==='wide'?'ESCAPADA':'RODADA';event(race,c,c.status.toLowerCase(),'incident');
}
export function simulateField(cars,dt,elapsed,race=cars.race){
  race??=createRace({weather:'dry'});cars.race=race;updateWeather(race,dt,elapsed);
  updateRaceControl(race,dt);if(race.commands?.length){applyRaceCommands(cars,race.commands,race);race.commands=[];}
  const snapshot=cars.map(c=>({id:c.id,s:c.s,v:c.v,lane:c.pit?pitOffset(c.s):c.lane,pit:!!c.pit,finishTime:c.finishTime,retired:c.retired,car:c}));
  const green=!race.control||race.control.type==='green';
  const yields=new Map(), passing=new Map();
  if(green&&race.type!=='practice')for(const slower of snapshot){
    if(!slower.car.manager||!slower.car.released||slower.pit||slower.retired||slower.finishTime!==null||slower.car.pitRequested)continue;
    let nearest=null, best=950;
    for(const faster of snapshot){
      if(!faster.car.released||faster.pit||faster.retired||faster.finishTime!==null||faster.id===slower.id)continue;
      const distance=mod(slower.s-faster.s,length);
      const isLapping=race.type==='race'&&faster.s-slower.s>length*.85;
      const onFlyingLap=race.type==='qualifying'&&slower.s<0&&faster.s>=0;
      if((isLapping||onFlyingLap)&&distance>0&&distance<best){nearest=faster;best=distance;}
    }
    if(!nearest)continue;
    const lane=nearest.lane>=0?-24:24;
    yields.set(slower.id,{lane,distance:best});
    passing.set(nearest.id,-lane);
  }
  for(const c of cars){
    if(c.retired||c.inGarage)continue;
    // Coast visually after the flag, but freeze race resources and distance.
    // The last finisher must not charge other cars for extra fuel or wear.
    if(c.finishTime!==null){c.pit=null;c.pitRequested=false;c.v=Math.min(c.v,180);c.s+=c.v*dt;Object.assign(c,at(c.s,c.lane));c.status='FINALIZOU';continue;}
    if(!c.released){if(elapsed<c.releaseAt){c.status='AGUARDA SAÍDA';continue;}c.released=true;c.launchDelay=elapsed+.15;event(race,c,race.type==='practice'?'saiu para o treino livre':'saiu para a classificação',race.type);}
    updateMechanical(c,race,dt);if(c.retired){if(c.manager&&race.type==='race'&&(!race.control||race.control.type==='green')){neutralization(race,'VSC',25);event(race,null,'VSC · recolhimento de carro avariado','control');}continue;}
    managedStrategy(c,race,cars);
    c.surface=c.pit?'pit':Math.abs(c.lane)+CAR_WIDTH/2>ROAD/2?'gravel':'asphalt';
    if(c.lapContext&&c.lapContext.condition!==conditionOf(race.wetness))c.lapContext.condition='mixed';
    const oldS=c.s,section=sectionAt(c.s),driver=c.driver.stats;
    // Arc length shrinks on the inside of a bend. Reserve the physical car
    // length on that lane, not just the distance along the track centerline.
    const offset=c.pit?pitOffset(c.s):c.lane;
    const laneScales=[0,45,90].map(a=>{const p=at(c.s+a,offset),q=at(c.s+a+20,offset);return Math.hypot(p.x-q.x,p.y-q.y)/20;});
    const laneScale=Math.min(...laneScales);
    const requiredGap=SAFETY_GAP/clamp(laneScale,.38,1.5);
    const immediateGap=SAFETY_GAP/clamp(laneScales[0],.38,1.5);
    const ahead=snapshot.filter(o=>o.id!==c.id&&o.car.released&&!o.car.inGarage&&!o.pit&&!o.retired&&o.finishTime===null&&mod(o.s-c.s,length)>0&&mod(o.s-c.s,length)<650).sort((a,b)=>mod(a.s-c.s,length)-mod(b.s-c.s,length));
    const lead=ahead[0],gap=lead?mod(lead.s-c.s,length):Infinity,traffic=c.pit?0:clamp(1-gap/600,0,1);
    instructAI(c,race,gap);
    const behind=snapshot.filter(o=>o.id!==c.id&&o.car.released&&!o.car.inGarage&&!o.pit&&!o.retired&&o.finishTime===null&&mod(c.s-o.s,length)>0&&mod(c.s-o.s,length)<220).sort((a,b)=>mod(c.s-a.s,length)-mod(c.s-b.s,length))[0];
    const yielding=yields.get(c.id),passLane=passing.get(c.id);
    const zone=drsZoneAt(c.s);
    if(zone!==c.drsZone){c.drsZone=zone;c.drsEligible=zone>=0&&gap/Math.max(lead?.v||1,120)<1;}
    c.drs=zone>=0&&section.type==='straight'&&(race.type==='qualifying'||c.drsEligible&&elapsed>12)&&race.wetness<.22&&!c.pit&&!c.incident&&c.surface==='asphalt'&&c.finishTime===null;
    c.ers=section.type==='straight'&&(c.ers?c.energy>12:c.energy>35)&&((gap<450)||(behind&&driver.defending>70)||c.energy>72)&&!c.pit&&!c.incident&&c.surface==='asphalt'&&c.fault?.type!=='electrical'&&c.finishTime===null;
    if(c.manager){const o=c.manager.orders;if(o.ers==='harvest')c.ers=false;else if(o.ers!=='auto')c.ers=section.type==='straight'&&c.energy>(o.ers==='attack'?4:30)&&!c.pit&&!c.incident&&c.fault?.type!=='electrical';}
    if(race.control&&race.control.type!=='green'){c.drs=false;c.ers=false;}
    let cap=capabilities(c,race,{traffic,drs:c.drs,ers:c.ers}),target=plannedSpeed(c,race,cap);
    if(c.drs&&target<c.v-4){c.drs=false;cap=capabilities(c,race,{traffic,drs:false,ers:c.ers});target=plannedSpeed(c,race,cap);}
    if(c.manager?.yielding)target*=.85;
    if(c.manager?.orders.avoidKerbs)target*=section.type==='straight'?1:.985;
    if(c.manager?.orders.traffic==='cleanAir'&&gap<200)target*=.97;
    if(race.control&&race.control.type!=='green')target=Math.min(target,race.control.type==='SC'?150:200);
    target*=1-(100-driver.accuracy)*.00032*(.5+.5*Math.sin(elapsed*.95+c.number));if(elapsed<c.launchDelay)target=0;
    const freeTarget=target;let trafficTarget=target,blockingCar=null,blockingDistance=Infinity;
    c.decisionCooldown=Math.max(0,c.decisionCooldown-dt);
    const sameLane=ahead.find(o=>Math.abs(o.lane-c.lane)<CAR_WIDTH+3);
    const laneClear=targetLane=>!snapshot.some(o=>o.id!==c.id&&o.car.released&&!o.car.inGarage&&!o.pit&&!o.retired&&Math.abs(o.lane-targetLane)<CAR_WIDTH+3&&Math.abs(mod(o.s-c.s+length/2,length)-length/2)<LANE_CLEARANCE);
    // Leave time to open the gap before the inside lane compresses. A short
    // headway and a stiff position correction produce stop-and-go shockwaves.
    if(sameLane&&!c.pit){const distance=mod(sameLane.s-c.s,length);if(distance<300){const desiredGap=requiredGap+c.v*.25;target=Math.min(target,Math.max(0,sameLane.v+(distance-desiredGap)*.8));}}
    trafficTarget=target;
    if(sameLane&&!c.pit&&!yielding&&passLane===undefined&&!(c.manager&&c.pitRequested)&&c.decisionCooldown===0){
      const gapAhead=mod(sameLane.s-c.s,length),other=c.lane>=0?-24:24,skill=battleScore(c)-battleScore(sameLane.car,true);
      const willingness=(.15+c.driver.aggression*.004+driver.overtaking*.002)*(c.manager?.orders.overtake==='careful'?.5:c.manager?.orders.overtake==='aggressive'?1.5:1);
      if((!race.control||race.control.type==='green')&&!(c.manager?.orders.team!=='race'&&c.manager&&sameLane.car.team.id===c.team.id)&&gapAhead<210&&laneClear(other)&&skill>-20&&target>sameLane.v-3&&random(race)<1-Math.exp(-willingness*dt)){
        c.laneTarget=other;c.decisionCooldown=1.8+(100-driver.overtaking)*.035;c.battleMode='ATACANDO';c.battleUntil=elapsed+2;c.metrics.attacks++;event(race,c,`prepara ataque a #${sameLane.car.number}`,'battle');
      }
    }
    if(behind&&!c.pit&&!yielding&&passLane===undefined&&!(c.manager&&c.pitRequested)&&(!race.control||race.control.type==='green')&&c.manager?.orders.defend!=='preserve'&&c.decisionCooldown===0&&mod(c.s-behind.s,length)>115&&battleScore(c,true)>battleScore(behind.car)&&laneClear(behind.lane)&&random(race)<dt*(c.manager?.orders.defend==='firm'?.22:.12)){c.laneTarget=behind.lane>=0?24:-24;c.decisionCooldown=2.5;c.battleMode='DEFENDENDO';c.battleUntil=elapsed+2;c.metrics.defenses++;}
    if(yielding&&!c.pit){c.laneTarget=yielding.lane;target=Math.min(target,yielding.distance<440?42:95);c.ers=false;c.drs=false;}else if(passLane!==undefined&&!c.pit)c.laneTarget=passLane;
    let brake=clamp((c.v-target)/65,0,1);incident(c,race,section,dt,brake>0,traffic);requestPit(c,race);
    if(c.pitRequested&&!c.pit&&mod(PIT.entry-c.s,length)<(c.manager?1000:500)){if(laneClear(-24))c.laneTarget=-24;else if(c.manager&&c.lane>-12)target=Math.min(target,170);}
    if(c.incident){target=Math.min(target,c.incident.kind==='spin'?35:c.incident.kind==='wide'?110:160);c.drs=false;c.ers=false;}
    if(c.surface==='gravel')target=Math.min(target,95);if(c.fault?.type==='puncture')target=Math.min(target,100);
    if(c.pit){target=Math.min(target,140);if(!c.pit.served&&c.s<c.pit.stopAt)target=Math.min(target,Math.sqrt(2*cap.braking*Math.max(0,c.pit.stopAt-c.s)));}
    if(service(c,race,dt)){Object.assign(c,at(c.s,pitOffset(c.s)));updateSystems(c,race,dt);continue;}
    if(c.fuel<=0)target=Math.min(target,105);if(c.finishTime!==null)target=Math.min(target,180);
    const throttle=target>c.v?1:.25;c.v+=clamp(target-c.v,-cap.braking*dt,cap.acceleration*dt);c.v=clamp(c.v,0,cap.maxSpeed);
    if(!c.pit){
      if(Math.sign(c.laneTarget)!==Math.sign(c.lane)&&!laneClear(c.laneTarget))c.laneTarget=c.lane>=0?24:-24;
      const wobble=(100-driver.accuracy)*.055*Math.sin(elapsed*1.5+c.number),goal=c.incident?.kind==='wide'?c.escapeSide*(ROAD/2+22):clamp(c.laneTarget+wobble,-32,32);
      c.lane+=(goal-c.lane)*Math.min(1,dt*cap.steering);
    }
    let travel=c.v*dt;const requestedTravel=travel;
    if(race.control&&race.control.type!=='green'){
      const leader=snapshot.filter(o=>o.id!==c.id&&!o.retired&&o.finishTime===null&&o.car.released&&!o.pit&&mod(o.s-c.s,length)>0).sort((a,b)=>mod(a.s-c.s,length)-mod(b.s-c.s,length))[0];
      if(leader&&!c.pit){const gap=mod(leader.s-c.s,length);travel=Math.min(travel,Math.max(0,gap+Math.max(0,leader.v-cap.braking*dt)*dt-10));}
    }
    // This guard uses the local gap and a conservatively braking leader's
    // movement this step. Future bend spacing belongs to the planner above;
    // imposing it here can instantly freeze a car whose leader is still moving.
    for(const o of snapshot){if(o.id===c.id||!o.car.released||o.car.inGarage||o.retired||o.pit!==!!c.pit||Math.abs(o.lane-(c.pit?pitOffset(c.s):c.lane))>CAR_WIDTH+3||o.finishTime!==null)continue;const distance=mod(o.s-c.s,length);if(distance>0&&distance<200){const leaderAdvance=Math.max(0,o.v-cap.braking*dt)*dt;const allowed=Math.max(0,distance+leaderAdvance-immediateGap);if(allowed<travel){travel=allowed;blockingCar=o.id;blockingDistance=distance;}}}
    if(c.pit&&!c.pit.served)travel=Math.min(travel,Math.max(0,c.pit.stopAt-c.s));
    if(c.pit&&c.pit.served&&c.s+travel>=c.pit.exitAt&&!laneClear(-24))travel=Math.min(travel,Math.max(0,c.pit.exitAt-.5-c.s));
    c.v=Math.min(c.v,travel/dt);
    c.s+=travel;c.progress=c.s;
    recordSectorCrossings(c,oldS,c.s,elapsed-dt,dt,race,length);
    if(c.pitRequested&&!c.pit&&c.lane<-12&&crosses(oldS,c.s,PIT.entry))enterPit(c,race);
    if(c.pit&&c.s>=c.pit.exitAt){c.pit=null;c.lane=-24;c.laneTarget=-24;event(race,c,'voltou à pista','pit');}
    c.lap=Math.max(1,Math.floor(c.s/length)+1);
    if(c.lapStart===null&&oldS<0&&c.s>=0){c.lapStart=elapsed-dt+dt*(-oldS/Math.max(travel,.0001));c.lapContext={compound:c.compound,fuel:c.fuel,condition:conditionOf(race.wetness)};}
    if(c.finishTime===null&&c.lap>c.previousLap){const crossingTime=elapsed-dt+dt*(c.previousLap*length-oldS)/Math.max(travel,.0001);if(c.lapStart!==null){const lapTime=crossingTime-c.lapStart;c.bestLap=Math.min(c.bestLap,lapTime);c.lapTimes.push(lapTime);c.lapDetails??=[];c.lapDetails.push({lap:c.lapTimes.length,time:lapTime,compound:c.lapContext?.compound??c.compound,fuel:c.lapContext?.fuel??c.fuel,pit:!!c.lapContext?.pit||!!c.pit,wetness:race.wetness,condition:c.lapContext?.condition===conditionOf(race.wetness)?conditionOf(race.wetness):'mixed',setup:structuredClone(c.manager?.setup??null),orders:structuredClone(c.manager?.orders??null)});c.lapContext={compound:c.compound,fuel:c.fuel,condition:conditionOf(race.wetness)};if(race.type==='qualifying')event(race,c,`volta rápida ${c.lapTimes.length}/2 · ${lapTime.toFixed(3)}s`,'qualifying');}c.lapStart=crossingTime;c.previousLap=c.lap;}
    if(c.finishTime===null&&c.s>=length*race.laps){c.finishTime=elapsed-dt+dt*(length*race.laps-oldS)/Math.max(travel,.0001);c.progress=length*race.laps;c.pit=null;c.pitRequested=false;if(race.type!=='race'){c.inGarage=true;c.v=0;event(race,c,`completou ${race.laps} voltas rápidas`,race.type);}else event(race,c,'recebeu a bandeirada','finish');}
    brake=clamp((c.v-target)/65,0,1);
    updateSystems(c,race,dt,{throttle,braking:brake,traffic,corner:section.type==='straight'?0:clamp(section.curvature*120,0,1),ers:c.ers});
    const surface=c.pit?'pit':Math.abs(c.lane)+CAR_WIDTH/2>ROAD/2?'gravel':'asphalt';
    if(surface==='gravel'&&c.surface!=='gravel'){c.metrics.gravel++;event(race,c,'saiu para a brita · perde aderência','incident');}c.surface=surface;
    c.telemetry={...c.telemetry,section:section.type,target,freeTarget,trafficTarget,requestedTravel,travel,requiredGap,immediateGap,laneScale,blockingCar,blockingDistance,drs:c.drs,surface};
    if(!c.incident)c.status=c.inGarage?(race.type==='practice'?'TESTE CONCLUÍDO':'CLASSIFICADO'):c.finishTime!==null?'FINALIZOU':c.pit?'PIT LANE':yielding?(race.type==='race'?'BANDEIRA AZUL':'CEDENDO VOLTA RÁPIDA'):race.type==='qualifying'&&c.lapStart===null?'VOLTA DE SAÍDA':c.fault?FAULT_LABELS[c.fault.type]:c.surface==='gravel'?'NA BRITA':c.contactUntil>elapsed?'CONTATO':c.pitRequested?'BOX SOLICITADO':c.engineTemp>113?'PROTEÇÃO TÉRMICA':c.battleUntil>elapsed?c.battleMode:c.drs?'DRS ABERTO':c.ers?'ERS ATAQUE':brake>.1?'FREANDO':gap<240?'EM DISPUTA':'RITMO';
    Object.assign(c,at(c.s,c.pit?pitOffset(c.s):c.lane));if(c.incident?.kind==='spin')c.angle+=Math.sin(c.incident.remaining*5)*1.4;
  }
  flushSectorCrossings(cars,race);
  resolveContacts(cars,race);
}
export function raceOrder(cars){return[...cars].sort((a,b)=>{
  if(a.finishTime!==null&&b.finishTime!==null)return a.finishTime-b.finishTime;
  if(a.finishTime!==null)return-1;if(b.finishTime!==null)return 1;
  if(a.retired!==b.retired)return a.retired?1:-1;return b.progress-a.progress;
});}
