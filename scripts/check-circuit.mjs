import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {CIRCUIT,W,H,path,length,at,nearest,ROAD,BRIDGES,belowBridge,differentLevels} from '../track.js';
import {DRS_ZONES,sectionAt} from '../track-profile.js';
import {garageFootprint,PIT_LAYOUT,pitPoint} from '../pit-layout.js';
import {contactBetween} from '../contact-geometry.js';
import {CAR_LENGTH,CAR_WIDTH} from '../vehicle-geometry.js';
import {simulateField} from '../race-ai.js';
import {resolveContacts} from '../race-incidents.js';
import {qualifyingSession,qualifyingResults,raceSession,sessionComplete} from '../weekend.js';
const car=p=>({...p,halfLength:CAR_LENGTH/2+2,halfWidth:CAR_WIDTH/2+1});
assert.ok(length>10000&&length<26000);
assert.deepEqual(at(0),at(length));
for(const p of path){assert.ok(Number.isFinite(p.seg)&&p.seg>0);assert.ok(p.x>ROAD&&p.y>ROAD&&p.x<W-ROAD&&p.y<H-ROAD);}
for(let s=0;s<length;s+=137){const p=at(s);assert.ok(nearest(p.x,p.y).d<.001);}
assert.ok(DRS_ZONES.length>0&&DRS_ZONES.length<=2);
const bands=new Set();for(let s=0;s<length;s+=25)bands.add(sectionAt(s).type);assert.ok(bands.has('straight')&&bands.has('low'));
for(let i=0;i<10;i++){
  const roof=garageFootprint(i);
  for(let s=0;s<length;s+=12)for(const lane of [-32,0,32])assert.equal(contactBetween(car(at(s,lane)),roof),null,`roof ${i} crosses road at ${s}`);
  for(let s=PIT_LAYOUT.entry;s<length+PIT_LAYOUT.exit;s+=8)assert.equal(contactBetween(car(pitPoint(s)),roof),null,`roof ${i} crosses pit at ${s}`);
}
if(CIRCUIT.id==='suzuka'){assert.equal(BRIDGES.length,1);assert.ok(belowBridge(BRIDGES[0].lower));assert.ok(differentLevels(BRIDGES[0].upper,BRIDGES[0].lower));}
const q=qualifyingSession(2026),dt=1/30;let elapsed=0;
if(CIRCUIT.id==='suzuka'){
  const crossing=q.cars.slice(0,2),bridge=BRIDGES[0];
  for(const [i,c] of crossing.entries()){const s=i?bridge.lower:bridge.upper;Object.assign(c,{s,released:true,v:200},at(s));}
  resolveContacts(crossing,q.session);assert.ok(crossing.every(c=>c.metrics.contacts===0),'cars on separate bridge levels collided');
  // Run qualifying from its original release positions after the bridge probe.
  const fresh=qualifyingSession(2026);q.cars=fresh.cars;q.session=fresh.session;
}
while(elapsed<1000&&!sessionComplete(q.cars)){elapsed+=dt;simulateField(q.cars,dt,elapsed,q.session);}
assert.ok(sessionComplete(q.cars),'qualifying stalled');
for(const c of q.cars.filter(c=>!c.retired))assert.equal(c.lapTimes.length,2);
const qualifyingTime=elapsed,results=qualifyingResults(q.cars),r=raceSession(results,2026);r.session.weather='dry';elapsed=0;
assert.deepEqual(r.cars.map(c=>c.id),results.map(c=>c.id));
let stoppedInLaunch=0;
while(elapsed<6500&&!sessionComplete(r.cars)){
  elapsed+=dt;simulateField(r.cars,dt,elapsed,r.session);
  for(const c of r.cars){assert.ok(Number.isFinite(c.v)&&Number.isFinite(c.x));if(elapsed>2&&elapsed<24&&!c.incident&&!c.pit&&!c.retired&&c.v<1)stoppedInLaunch++;}
}
assert.ok(sessionComplete(r.cars),'race stalled');
assert.equal(r.cars.filter(c=>c.finishTime!==null).length,20,'the reference weekend must bring all twenty cars to the finish');
for(const c of r.cars.filter(c=>!c.retired))assert.equal(c.lapTimes.length,r.session.laps);
const report={circuit:CIRCUIT.id,world:[W,H],length,bridges:BRIDGES.length,drs:DRS_ZONES.length,qualifyingTime,raceTime:elapsed,finished:r.cars.filter(c=>c.finishTime!==null).length,contacts:r.cars.reduce((n,c)=>n+c.metrics.contacts,0)/2,stoppedInLaunch,pitStops:r.cars.reduce((n,c)=>n+c.pitStops,0)};
await mkdir(new URL('../artifacts/circuits/',import.meta.url),{recursive:true});
await writeFile(new URL(`../artifacts/circuits/${CIRCUIT.id}.json`,import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
