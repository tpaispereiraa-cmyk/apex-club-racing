import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qualifyingSession,raceSession,qualifyingResults,sessionComplete,QUALIFYING_LAPS,RACE_LAPS} from './weekend.js';
import {simulateField} from './race-ai.js';
import {length} from './track.js';
test('every driver runs an outlap and two timed laps; the best actual time builds the half-distance race grid',()=>{
  const q=qualifyingSession(2026);assert.equal(q.session.type,'qualifying');assert.equal(QUALIFYING_LAPS,2);assert.equal(RACE_LAPS,36);
  assert.ok(q.cars.every(c=>c.s<0&&c.lapTimes.length===0&&c.bestLap===Infinity));
  let elapsed=0;while(elapsed<700&&!sessionComplete(q.cars)){elapsed+=1/30;simulateField(q.cars,1/30,elapsed,q.session);}
  assert.ok(sessionComplete(q.cars));
  for(const c of q.cars){assert.equal(c.lapTimes.length,2,`#${c.number} needs exactly two timed laps`);assert.equal(c.bestLap,Math.min(...c.lapTimes));assert.ok(c.lapTimes.every(t=>t>25&&t<180));assert.ok(c.inGarage);}
  const results=qualifyingResults(q.cars);for(let i=1;i<results.length;i++)assert.ok(results[i].bestLap>=results[i-1].bestLap);
  const race=raceSession(results,2026);assert.equal(race.session.laps,RACE_LAPS);assert.equal(race.session.type,'race');
  assert.deepEqual(race.cars.map(c=>c.id),results.map(c=>c.id));assert.ok(race.cars.every(c=>c.lapTimes.length===0&&c.bestLap===Infinity&&c.damage===0&&c.tyreLife===100));
  elapsed=0;while(elapsed<6000&&!sessionComplete(race.cars)){elapsed+=1/30;simulateField(race.cars,1/30,elapsed,race.session);}
  assert.ok(sessionComplete(race.cars),'the complete fourteen-lap race must terminate');assert.ok(race.cars.some(c=>c.finishTime!==null));
  for(const c of race.cars.filter(c=>!c.retired)){assert.ok(c.progress>=RACE_LAPS*length);assert.equal(c.lapTimes.length,RACE_LAPS);}
});
test('the race rejects an incomplete or duplicate qualifying grid',()=>{
  assert.throws(()=>raceSession([]));const q=qualifyingSession();const results=qualifyingResults(q.cars);results[1]=results[0];assert.throws(()=>raceSession(results));
});
