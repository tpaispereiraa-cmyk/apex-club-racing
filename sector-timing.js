// Three equal-distance sectors in the game's geometry (not official FIA splits).
export const SECTOR_COLORS=['#79d6db','#ecd077','#c49af0'];
export const sectorBoundaries=trackLength=>[trackLength/3,trackLength*2/3,trackLength];
export const newSectorTiming=()=>({start:null,lapIndex:null,lastMarker:null,current:[],last:null,best:null,history:[],lastPass:null});

// Queue crossings first, then process in chronological order across all cars.
// This prevents array iteration order from lending a driver a future benchmark.
export function recordSectorCrossings(c,oldS,newS,start,dt,race,trackLength){
  if(newS<=oldS||c.finishTime!==null)return;
  const step=trackLength/3;
  for(let marker=Math.floor((oldS+1e-7)/step)+1;marker<=Math.floor((newS+1e-7)/step);marker++){
    if(marker<0)continue;
    const position=marker*step,time=start+dt*(position-oldS)/(newS-oldS);
    (race.sectorCrossings??=[]).push({id:c.id,marker,time});
  }
}
function recordRaceSplit(car, pass) {
  const timing=car.raceSplits??={marker:-1,time:null,parts:[]};
  if(pass.marker<=timing.marker)return;
  if(pass.marker===timing.marker+1&&timing.time!==null)timing.parts.push(pass.time-timing.time);
  timing.marker=pass.marker;
  timing.time=pass.time;
  if(pass.marker%3!==0)return;
  const lap=car.lapDetails?.[pass.marker/3-1];
  if(lap&&timing.parts.length===3)lap.sectors=timing.parts;
  timing.parts=[];
}

export function flushSectorCrossings(cars,race){
  const pending=race.sectorCrossings??[];if(!pending.length)return;
  const byId=new Map(cars.map(c=>[c.id,c]));
  const session=race.sectorTiming??={leader:null,provisional:[null,null,null],bestSectors:[null,null,null]};
  pending.sort((a,b)=>a.time-b.time||String(a.id).localeCompare(String(b.id)));
  for(const pass of pending){
    const c=byId.get(pass.id);if(!c)continue;
    if(race.type==='race'){recordRaceSplit(c,pass);continue;}
    const timing=c.sectorTiming??=newSectorTiming(),sector=(pass.marker+2)%3,lapIndex=Math.floor((pass.marker-1)/3);
    if(timing.lastMarker!==null&&timing.lastMarker!==undefined&&pass.marker<=timing.lastMarker)continue;
    timing.lastMarker=pass.marker;
    if(pass.marker===0){timing.start=pass.time;timing.lapIndex=0;timing.current=[];continue;}
    const valid=timing.start!==null&&timing.lapIndex===lapIndex&&timing.current.length===sector;
    if(valid){
      const cumulative=pass.time-timing.start,previous=timing.current.at(-1)?.cumulative??0,seconds=cumulative-previous;
      const reference=session.leader?{...session.leader,cumulative:session.leader.splits[sector].cumulative}:session.provisional[sector];
      const personalTime=timing.best?.splits[sector]?.cumulative??null;
      const record={sector:sector+1,seconds,cumulative,at:pass.time,lap:lapIndex+1,
        delta:reference?cumulative-reference.cumulative:null,referenceId:reference?.id??null,referenceName:reference?.name??null,
        personalDelta:personalTime===null?null:cumulative-personalTime,
        referenceTime:reference?.cumulative??null,provisional:!session.leader,
        sessionBest:!session.bestSectors[sector]||seconds<session.bestSectors[sector].seconds};
      timing.current.push(record);timing.lastPass=record;
      if(record.sessionBest)session.bestSectors[sector]={id:c.id,name:c.driver.name,seconds};
      if(!session.provisional[sector]||cumulative<session.provisional[sector].cumulative)session.provisional[sector]={id:c.id,name:c.driver.name,cumulative};
      if(sector===2){
        const lap={lap:lapIndex+1,time:cumulative,splits:structuredClone(timing.current)};
        timing.last=lap;timing.history.push(lap);
        if(!timing.best||lap.time<timing.best.time)timing.best=structuredClone(lap);
        if(!session.leader||lap.time<session.leader.time)session.leader={id:c.id,name:c.driver.name,time:lap.time,splits:structuredClone(lap.splits)};
      }
    }
    // Missing a start or an older checkpoint's first partial does not invent splits.
    if(sector===2){timing.start=pass.time;timing.lapIndex=lapIndex+1;timing.current=[];}
  }
  race.sectorCrossings=[];
}
export function visibleSectorSplits(c){
  const t=c.sectorTiming;if(!t)return[null,null,null];
  return [0,1,2].map(i=>t.current[i]??t.last?.splits[i]??null);
}
export function sectorDelta(value){return value===null||!Number.isFinite(value)?'—':`${value>=0?'+':'−'}${Math.abs(value).toFixed(3)}s`;}
