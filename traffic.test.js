import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createField,simulateField} from './race-ai.js';
import {createRace} from './race-systems.js';
import {qualifyingSession,qualifyingResults,raceSession,sessionComplete} from './weekend.js';
import {at} from './track.js';
import {carFootprint} from './race-incidents.js';
import {contactBetween} from './contact-geometry.js';

function checkLaunch(cars,race,dt){
  let samples=0;
  for(let elapsed=dt;elapsed<24;elapsed+=dt){
    simulateField(cars,dt,elapsed,race);
    for(const c of cars){
      if(elapsed<2||c.incident||c.pit||c.retired||c.fault||c.surface!=='asphalt')continue;
      samples++;
      assert.ok(c.v>35,`#${c.number} stalled in launch traffic at ${elapsed.toFixed(2)}s: ${c.v}`);
    }
  }
  assert.ok(samples>1000);
}

test('twenty-car launches keep moving through the Senna S at both rendering step sizes',()=>{
  for(const dt of [1/30,1/60])for(const seed of [2026,2027,2028,2029,2030]){
    const race=createRace({seed,weather:'dry'});
    checkLaunch(createField(race),race,dt);
  }
});

test('the actual qualifying grid also keeps moving through the first corners',()=>{
  const q=qualifyingSession(2026);
  for(let elapsed=1/30;elapsed<700&&!sessionComplete(q.cars);elapsed+=1/30)simulateField(q.cars,1/30,elapsed,q.session);
  assert.ok(sessionComplete(q.cars));
  const r=raceSession(qualifyingResults(q.cars),2026);
  checkLaunch(r.cars,r.session,1/30);
});

test('traffic protection still stops a follower behind a stationary car',()=>{
  const race=createRace({weather:'dry'}),cars=createField(race).slice(0,2),[lead,follower]=cars;
  for(const [c,s,v] of [[lead,3000,0],[follower,2900,250]]){
    Object.assign(c,{s,progress:s,v,lane:24,laneTarget:24,launchDelay:c===lead?100:0,decisionCooldown:100},at(s,24));
  }
  for(let elapsed=1/60;elapsed<2;elapsed+=1/60){
    simulateField(cars,1/60,elapsed,race);
    assert.ok(follower.s<lead.s);
    assert.equal(contactBetween(carFootprint(lead),carFootprint(follower)),null);
  }
  assert.ok(follower.v<.001);
});
