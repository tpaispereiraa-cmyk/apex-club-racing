import {PHYSICS_VERSION} from './physics-version.js';
import {CIRCUIT,length} from './track.js';
import {championshipOrder} from './tournament.js';
export const ARCHIVE_VERSION=1;
export const conditionOf=wetness=>wetness>.62?'wet':wetness>.22?'damp':'dry';
export function standingsSnapshot(state){return{teams:championshipOrder(Object.values(state.teams)).map(t=>({id:t.id,name:t.name,points:t.points,finishes:[...(t.finishes??[])],cash:t.cash,spent:t.spent})),drivers:championshipOrder(Object.values(state.driverPoints??{})).map(d=>structuredClone(d))};}
export function ensureWeekendArchive(state){
  if(!state.active)return null;
  return state.active.archive??={version:ARCHIVE_VERSION,partial:state.active.phase!=='practice'||(state.active.checkpoints?.elapsed??0)>0,id:state.active.id,season:state.season,round:state.round,circuit:state.active.circuit,modelVersion:state.modelVersion,layoutVersion:'geographic-1',physicsVersion:state.active.checkpoints?.race?.physicsVersion??(state.active.checkpoints?'manager-1':PHYSICS_VERSION),practice:[],qualifying:null,race:null,pointsBefore:standingsSnapshot(state)};
}
export function sessionReport(cars,race){
  const timed=race.type!=='race';
  const order=[...cars].sort((a,b)=>timed?(a.bestLap-b.bestLap)||a.number-b.number:a.retired!==b.retired?(a.retired?1:-1):a.finishTime!==null?(b.finishTime!==null?a.finishTime-b.finishTime:-1):b.finishTime!==null?1:b.progress-a.progress);
  return{type:race.type,physicsVersion:race.physicsVersion??'manager-1',trackLength:length,laps:race.laps,elapsed:race.elapsed,weather:race.weather,wetness:race.wetness,condition:conditionOf(race.wetness),trackTemp:race.trackTemp,partialHistory:!!race.archivePartial||!race.archiveEvents,
    events:structuredClone(race.archiveEvents??race.events??[]),
    results:order.map((c,i)=>({id:c.id,position:i+1,grid:c.grid+1,number:c.number,teamId:c.team.id,team:c.team.name,color:c.team.color,driverId:c.driver.id,driver:c.driver.name,
      bestLap:Number.isFinite(c.bestLap)?c.bestLap:null,time:c.finishTime,retired:c.retired,reason:c.retirementReason??null,progress:c.progress,lapTimes:[...c.lapTimes],lapDetails:structuredClone(c.lapDetails??[]),
      sectors:structuredClone(Math.abs((c.sectorTiming?.best?.time??Infinity)-c.bestLap)<.00001?c.sectorTiming.best.splits:[]),sectorHistory:structuredClone(c.sectorTiming?.history??[]),
      tyreHistory:structuredClone(c.tyreHistory??[]),pitHistory:structuredClone(c.pitHistory??[]),pitStops:c.pitStops,
      build:Object.entries(c.manager?.model.parts??{}).map(([part,p])=>({part,design:p.design.id,version:p.design.version,item:p.item.id,condition:p.item.condition})),strategy:structuredClone(c.manager?.strategy??null),setup:structuredClone(c.manager?.setup??null),orders:structuredClone(c.manager?.orders??null),instructions:structuredClone(c.manager?.orderHistory??[]),metrics:structuredClone(c.metrics),
      fuelUsed:c.manager?.fuelUsed??null,repairCosts:c.manager?.serviceCosts??0,engineHealth:c.engineHealth,damage:c.damage}))};
}
export function closeWeekendArchive(state,report){
  state.archives??=[];
  if(state.archives.some(w=>w.id===report.id))return;
  state.archives.push(structuredClone(report));
}
export function practiceOverview(runs=[]){
  if(!runs.length)return null;
  const best=new Map();
  for(const [index,run]of runs.entries())for(const row of run.results){const previous=best.get(row.id);if(!previous||(row.bestLap??Infinity)<(previous.bestLap??Infinity))best.set(row.id,{...row,run:index+1});}
  return{...runs.at(-1),results:[...best.values()].sort((a,b)=>(a.bestLap??Infinity)-(b.bestLap??Infinity)||a.number-b.number).map((r,i)=>({...r,position:i+1}))};
}
export function circuitEditions(state,circuit=CIRCUIT.id){return(state.archives??[]).filter(w=>w.circuit===circuit).sort((a,b)=>b.season-a.season||b.round-a.round);}
export function circuitRecords(state,{circuit=CIRCUIT.id,condition='dry',modelVersion=state.modelVersion,physicsVersion=PHYSICS_VERSION}={}){
  const records={practice:null,qualifying:null,race:null,sectors:[null,null,null]};
  for(const w of circuitEditions(state,circuit)){
    if((w.physicsVersion??'manager-1')!==physicsVersion||w.modelVersion!==modelVersion||w.layoutVersion!=='geographic-1')continue;
    for(const s of [...w.practice,w.qualifying,w.race].filter(Boolean))for(const r of s.results){
      const laps=r.lapDetails??[];
      for(const lap of laps){if(lap.condition!==condition||!Number.isFinite(lap.time)||lap.time<=0)continue;
        if(!records[s.type]||lap.time<records[s.type].time)records[s.type]={time:lap.time,driver:r.driver,team:r.team,season:w.season,compound:lap.compound};
      }
      if(s.type==='race'||condition!=='dry')continue;
      for(const lap of r.sectorHistory??[]){if(!laps.some(x=>x.lap===lap.lap&&x.condition===condition))continue;for(const split of lap.splits){const i=split.sector-1;if(!records.sectors[i]||split.seconds<records.sectors[i].time)records.sectors[i]={time:split.seconds,driver:r.driver,season:w.season};}}
    }
  }
  return records;
}
