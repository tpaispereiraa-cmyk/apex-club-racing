import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lapTime,stintAge,nextStop,intervalTo} from './watch-dashboard.js';
import {length} from './track.js';
import {createRace} from './race-systems.js';
import {createField,simulateField} from './race-ai.js';

test('broadcast shows actual finish gaps and labels live gaps as estimates',()=>{
  const a={progress:100,v:100,finishTime:null},b={progress:200,v:100,finishTime:null};
  assert.equal(intervalTo(a,b),'~1.0s');
  assert.equal(intervalTo({...a,finishTime:105},{...b,finishTime:100}),'+5.000s');
  assert.equal(intervalTo({...a,retired:true},b),'—');
  assert.equal(intervalTo(a,{...b,progress:a.progress+length*2}),'+2 volta(s)');
  assert.equal(lapTime(Infinity),'—');assert.equal(lapTime(null),'—');assert.equal(lapTime(72.123),'1:12.123');
});
test('broadcast stints use actual fitted distance and the next untriggered plan stop',()=>{
  const c={s:length*8,tyreFittedAtS:length*5,manager:{strategy:{stops:[{lap:5,compound:'hard'},{lap:12,compound:'medium'}]},usedStops:[0]}};
  assert.equal(stintAge(c),3);assert.equal(nextStop(c).lap,12);
  c.manager.usedStops.push(1);assert.equal(nextStop(c),null);
});
test('a completed tyre service records the compound and resets stint distance',()=>{
  const race=createRace({weather:'dry',laps:3}),cars=createField(race),c=cars[0];
  assert.equal(c.tyreHistory.length,1);assert.equal(c.tyreHistory[0].compound,c.compound);
  c.pit={stopAt:c.s,exitAt:c.s+1000,remaining:.01,compound:'hard',served:false};c.released=true;
  // A car already stopped at its garage completes service on the next tick.
  for(let t=1;t<=20&&c.tyreHistory.length===1;t++)simulateField(cars,1/30,t/30,race);
  assert.equal(c.tyreHistory.length,2);assert.equal(c.tyreHistory[1].compound,'hard');assert.equal(stintAge(c),0);
  assert.ok(cars.every(x=>Array.isArray(x.tyreHistory)&&Number.isFinite(x.tyreFittedAtS)));
});
