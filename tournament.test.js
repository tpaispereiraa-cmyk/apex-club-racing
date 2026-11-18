import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CALENDAR,REAL_LAPS,raceLaps,POINTS,championshipOrder,addResult} from './tournament.js';
import {parseRoute,circuitUrl} from './routes.js';
import {createCareer,loadCareer,prepareEntries} from './manager/career.js';
import {configureAIWeekend,instructAI} from './manager/ai-manager.js';
import {startingGrid} from './teams.js';

test('the ordered fourteen-round season finishes at Interlagos with half GP distances',()=>{
  assert.equal(CALENDAR.length,14);assert.equal(new Set(CALENDAR).size,14);
  assert.equal(CALENDAR[0],'melbourne');assert.equal(CALENDAR.at(-1),'interlagos');
  for(const id of CALENDAR)assert.equal(raceLaps(id),Math.ceil(REAL_LAPS[id]/2));
  assert.equal(raceLaps('interlagos'),36);assert.equal(raceLaps('spa'),22);assert.equal(raceLaps('monaco'),39);
  assert.deepEqual(createCareer().calendar,CALENDAR);
});
test('modes have distinct direct routes and preserve legacy links',()=>{
  for(const mode of ['watch','manager'])for(const id of CALENDAR){const route=parseRoute(circuitUrl(id,mode));assert.equal(route.mode,mode);assert.equal(route.circuit,id);}
  assert.equal(parseRoute('/circuitos').page,'circuits');
  assert.equal(parseRoute('/?circuit=monaco&career=1').mode,'manager');
});
test('scoring counts both team cars, excludes retirees and uses finish countback',()=>{
  const team={id:'a'},other={id:'b'};addResult(team,1);addResult(team,10);assert.equal(team.points,26);
  addResult(other,1,true);assert.equal(other.points,0);assert.equal(other.finishes[0],0);assert.equal(POINTS.reduce((a,b)=>a+b),101);
  const a={id:'a',points:25,finishes:[1]},b={id:'b',points:25,finishes:[0,2]};assert.equal(championshipOrder([b,a])[0],a);
});
test('watch AI evaluates builds for all twenty cars while manager retains player choices',()=>{
  const original=createCareer(),raw=JSON.stringify(original),watch=configureAIWeekend(original,{includePlayer:true});assert.equal(JSON.stringify(original),raw);
  assert.ok(Object.values(watch.teams).every(t=>t.automatic&&t.cars.every(c=>new Set(c.aiBuilds.map(b=>b.setup.rearWing)).size>=3&&new Set(c.aiBuilds.map(b=>b.setup.cooling)).size>=2)));
  const manager=configureAIWeekend(original);assert.equal(manager.teams.aurora.automatic,false);assert.deepEqual(manager.teams.aurora.cars[0].setup,original.teams.aurora.cars[0].setup);
  const entries=prepareEntries(watch,startingGrid());assert.ok(entries.every(e=>e.manager.automatic));
  const c={manager:entries[0].manager,tyreLife:80,tyreTemp:90,energy:60,fuel:150,lap:2,driver:entries[0].driver};instructAI(c,{elapsed:10,laps:36},50);assert.equal(c.manager.orders.pace,'attack');assert.equal(c.manager.orders.ers,'attack');
  c.tyreTemp=115;instructAI(c,{elapsed:16,laps:36},50);assert.equal(c.manager.orders.pace,'conserve');
});
test('legacy calendar migration preserves completed rounds and adds missing tracks',()=>{
  const s=createCareer();delete s.calendarVersion;s.calendar=['interlagos','monaco','monza'];s.round=1;s.history=[{circuit:'interlagos'}];
  const loaded=loadCareer({getItem:()=>JSON.stringify(s)});assert.equal(loaded.calendar[0],'interlagos');assert.equal(loaded.round,1);assert.equal(loaded.calendar.length,14);assert.equal(loaded.history[0].circuit,'interlagos');
});
