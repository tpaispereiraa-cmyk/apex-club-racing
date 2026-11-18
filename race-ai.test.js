import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createField,simulateField,raceOrder} from './race-ai.js';
import {nearest,ROAD,length} from './track.js';
import {createRace} from './race-systems.js';
for(const weather of ['dry','rain','auto'])test(`all twenty AI cars finish in ${weather}, including weather pit stops`,()=>{
  const race=createRace({weather,laps:3}),cars=createField(race),dt=1/30;let elapsed=0;
  while(elapsed<360&&!cars.every(c=>c.finishTime!==null)){
    elapsed+=dt;simulateField(cars,dt,elapsed,race);
    if(Math.round(elapsed*30)%300===0)for(const c of cars){assert.ok(Number.isFinite(c.x)&&Number.isFinite(c.y));assert.ok(nearest(c.x,c.y).d<(c.pit?125:c.surface==='gravel'||c.retired?90:ROAD/2));assert.ok(c.v>=0&&c.v<=c.performance.maxSpeed+60);}
  }
  assert.ok(cars.every(c=>c.finishTime!==null),`unfinished: ${cars.filter(c=>c.finishTime===null).map(c=>c.id)}`);
  for(const c of cars){assert.ok(c.progress>=length*3);assert.ok(c.finishTime>0&&c.bestLap>0&&c.bestLap<Infinity);}
  let order=raceOrder(cars);for(let i=1;i<order.length;i++)assert.ok(order[i].finishTime>=order[i-1].finishTime);
  if(weather==='auto'){assert.ok(cars.every(c=>c.pitStops>=1));assert.ok(cars.every(c=>!c.pit));}
});
