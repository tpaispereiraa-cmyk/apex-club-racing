import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordSectorCrossings,flushSectorCrossings,newSectorTiming,visibleSectorSplits,sectorDelta,sectorBoundaries} from './sector-timing.js';
import {qualifyingSession,practiceSession,sessionComplete} from './weekend.js';
import {simulateField} from './race-ai.js';

const car=id=>({id,driver:{name:id},finishTime:null,sectorTiming:newSectorTiming()});
test('three sectors cover the track and interpolate exact crossing times',()=>{
  assert.deepEqual(sectorBoundaries(300),[100,200,300]);
  const a=car('A'),race={type:'qualifying'};
  recordSectorCrossings(a,-1,300,-.1,30.1,race,300);flushSectorCrossings([a],race);
  assert.equal(a.sectorTiming.history.length,1);
  for(const x of a.sectorTiming.last.splits)assert.ok(Math.abs(x.seconds-10)<1e-10);
  assert.ok(Math.abs(a.sectorTiming.last.time-30)<1e-10);
  assert.equal(visibleSectorSplits(a).length,3);
});
test('crossings are chronological and deltas remain frozen after the leader improves',()=>{
  const a=car('A'),b=car('B'),race={type:'practice'};
  // Deliberately queue the slower driver first, as if it was first in the field array.
  recordSectorCrossings(b,-1,300,-.11,33.11,race,300);
  recordSectorCrossings(a,-1,300,-.1,30.1,race,300);flushSectorCrossings([b,a],race);
  assert.ok(Math.abs(b.sectorTiming.last.splits[0].delta-1)<1e-10);
  assert.equal(b.sectorTiming.last.splits[0].provisional,true);
  assert.ok(Math.abs(b.sectorTiming.last.splits[2].delta-3)<1e-10);
  assert.equal(b.sectorTiming.last.splits[2].provisional,false);
  const frozen=structuredClone(b.sectorTiming.last),c=car('C');
  recordSectorCrossings(c,-1,300,39.91,27.09,race,300);flushSectorCrossings([a,b,c],race);
  assert.equal(race.sectorTiming.leader.id,'C');assert.deepEqual(b.sectorTiming.last,frozen);
  assert.ok(Math.abs(c.sectorTiming.last.splits[0].delta+1)<1e-10);
});
test('outlaps and old checkpoints do not invent missing sector times',()=>{
  const a=car('A'),race={type:'practice'};
  recordSectorCrossings(a,-250,-1,0,25,race,300);flushSectorCrossings([a],race);
  assert.deepEqual(visibleSectorSplits(a),[null,null,null]);
  delete a.sectorTiming;
  recordSectorCrossings(a,150,300,25,15,race,300);flushSectorCrossings([a],race);
  assert.equal(a.sectorTiming.last,null);
  recordSectorCrossings(a,300,600,40,30,race,300);flushSectorCrossings([a],race);
  assert.equal(a.sectorTiming.history.length,1);assert.equal(a.sectorTiming.last.time,30);
  assert.equal(sectorDelta(null),'—');assert.equal(sectorDelta(-.234),'−0.234s');assert.equal(sectorDelta(.15),'+0.150s');
});
test('contact pushing a car behind a timing gate does not duplicate or restart its split',()=>{
  const a=car('A'),race={type:'qualifying'};
  recordSectorCrossings(a,-1,300,-.1,30.1,race,300);flushSectorCrossings([a],race);
  recordSectorCrossings(a,298,305,30,1,race,300);flushSectorCrossings([a],race);
  assert.equal(a.sectorTiming.start,30);assert.equal(a.sectorTiming.history.length,1);
  recordSectorCrossings(a,305,600,31,29,race,300);flushSectorCrossings([a],race);
  assert.equal(a.sectorTiming.history.length,2);assert.equal(a.sectorTiming.last.time,30);
});
for(const type of ['practice','qualifying'])test(`${type}: all actual timed laps have three sectors summing to the recorded lap`,()=>{
  const pack=type==='practice'?practiceSession(2031):qualifyingSession(2031);let elapsed=0;
  while(elapsed<1200&&!sessionComplete(pack.cars)){elapsed+=1/30;simulateField(pack.cars,1/30,elapsed,pack.session);}
  assert.ok(sessionComplete(pack.cars));
  for(const c of pack.cars.filter(c=>!c.retired)){
    assert.equal(c.sectorTiming.history.length,pack.session.laps);
    let personalBest=null;
    for(const [i,lap]of c.sectorTiming.history.entries()){
      assert.equal(lap.splits.length,3);assert.ok(Math.abs(lap.splits.reduce((n,x)=>n+x.seconds,0)-c.lapTimes[i])<1e-6);
      for(const [j,split]of lap.splits.entries()){
        assert.equal(split.personalDelta,personalBest?split.cumulative-personalBest.splits[j].cumulative:null);
      }
      if(!personalBest||lap.time<personalBest.time)personalBest=lap;
    }
    assert.ok(Math.abs(c.sectorTiming.best.time-c.bestLap)<1e-6);
  }
});
