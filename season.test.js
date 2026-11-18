import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,dispatchCareer} from './manager/career.js';
import {weekendReadiness,suggestedStrategy} from './manager/readiness.js';
import {createManagerController} from './manager/controller.js';
import {CIRCUITS} from './circuits.js';
import {simulateRemaining} from './session-worker.js';
import {createRace} from './race-systems.js';
import {createField,simulateField} from './race-ai.js';
import {sessionComplete} from './weekend.js';

test('readiness identifies destroyed parts and provides stock or fabrication recovery paths',()=>{
  const s=createCareer(),car=s.teams.aurora.cars[0];s.items[car.loadout.frontWing].condition=0;
  let issue=weekendReadiness(s).find(i=>i.blocking);assert.equal(issue.tab,'car');assert.match(issue.message,/estoque/);
  for(const item of Object.values(s.items).filter(i=>i.teamId==='aurora'&&s.designs[i.designId].part==='frontWing'))item.condition=0;
  issue=weekendReadiness(s).find(i=>i.blocking);assert.equal(issue.tab,'development');assert.match(issue.message,/avance a agenda/);
});
test('a destroyed component can be replaced through ordinary workshop commands',()=>{
  let s=createCareer();const own=s.teams.aurora,car=own.cars[0];s.items[car.loadout.floor].condition=0;
  const spare=Object.values(s.items).find(i=>i.teamId==='aurora'&&s.designs[i.designId].part==='floor'&&!own.cars.some(c=>Object.values(c.loadout).includes(i.id)));
  s=dispatchCareer(s,{id:'recover-floor',type:'install',args:{slot:0,itemId:spare.id},actorId:s.ownerId,teamId:s.selectedTeam,revision:s.revision});
  assert.equal(weekendReadiness(s).filter(i=>i.blocking).length,0);
});
test('suggested plans fit every circuit and flag a carried over short-track fuel plan',()=>{
  for(const circuit of CIRCUITS){const plan=suggestedStrategy(circuit);assert.ok(plan.fuelKg>=20&&plan.fuelKg<=250);assert.ok(plan.stops[0].lap>=2);}
  const s=createCareer();s.calendar=['spa'];s.teams.aurora.cars[0].strategy.fuelKg=30;assert.ok(weekendReadiness(s).some(i=>i.tab==='strategy'&&/combustível/.test(i.message)));
});
test('exported careers above the old eight-million-character limit remain importable',()=>{
  const s=createCareer();s.testPadding='x'.repeat(8100000);const ctl=createManagerController({getItem:()=>null,setItem:()=>{}});ctl.import(JSON.stringify(s));assert.equal(ctl.state.selectedTeam,'aurora');
});
test('season honours retain sporting countback when points are tied',()=>{
  let s=createCareer();s.round=s.calendar.length;
  for(const t of Object.values(s.teams))t.finishes=Array(20).fill(0);
  s.teams.aurora.points=100;s.teams.nord.points=100;s.teams.nord.finishes[0]=2;
  s=dispatchCareer(s,{id:'season-end',type:'nextSeason',args:{},actorId:s.ownerId,teamId:s.selectedTeam,revision:s.revision});
  assert.equal(s.history.at(-1).standings[0].id,'nord');assert.equal(s.season,2);assert.equal(s.round,0);
});
test('session fast simulation produces the same lap times and incidents as the live fixed step',async()=>{
  const session=createRace({type:'qualifying',laps:2,seed:773,weather:'dry'}),cars=createField(session),copy=structuredClone({session,cars:[...cars],elapsed:0});
  let elapsed=0;while(!sessionComplete(cars)){elapsed+=1/30;simulateField(cars,1/30,elapsed,session);}
  const result=await simulateRemaining(copy,{yieldTask:async()=>{}});
  assert.equal(result.elapsed,elapsed);assert.deepEqual(result.cars.map(c=>c.lapTimes),cars.map(c=>c.lapTimes));assert.deepEqual(result.session.archiveEvents,session.archiveEvents);
});
