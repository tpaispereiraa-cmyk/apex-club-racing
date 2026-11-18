import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createCareer,prepareEntries} from './manager/career.js';
import {financialOutlook,setupComparison,practiceDebrief,liveAdvice,strategyChoices} from './manager/engineer.js';
import {debriefCard,setupCard,comparisonCard,strategyCards,financeCard,liveCard} from './manager/engineer-view.js';
import {evaluateSetup,forecastStrategy} from './manager/strategy.js';
import {createField} from './race-ai.js';
import {createRace} from './race-systems.js';
import {startingGrid} from './teams.js';
import {managedSystems} from './manager/race-control.js';
import {weatherForecast,rainWindow,weatherTarget} from './weather.js';
import {CIRCUIT,length} from './track.js';
import {ensureWeekendArchive,circuitRecords} from './weekend-archive.js';
import {PHYSICS_VERSION} from './physics-version.js';

test('wing decisions reverse by track instead of a universal high-wing recommendation',()=>{
  for(const circuit of ['monza','hungaroring']){
    const code="import {createCareer} from './manager/career.js';import {evaluateSetup} from './manager/strategy.js';const s=createCareer('cobalto');console.log(JSON.stringify([2,5,8].map(w=>evaluateSetup(s,'cobalto',0,{frontWing:w,rearWing:w}).lapSeconds)));";
    const r=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,RACE_CIRCUIT:circuit},encoding:'utf8'});assert.equal(r.status,0,r.stderr);const [low,,high]=JSON.parse(r.stdout);assert.ok(circuit==='monza'?low<high:high<low,`${circuit}: ${r.stdout}`);
  }
});
test('sector estimates sum to the lap and comparison never installs a setup',()=>{
  const s=createCareer('cobalto'),before=JSON.stringify(s),e=evaluateSetup(s,'cobalto',0),c=setupComparison(s,'cobalto',0,{rearWing:2});
  assert.ok(Math.abs(e.sectors.reduce((a,b)=>a+b,0)-e.lapSeconds)<1e-8);assert.ok(Math.abs(c.sectors.reduce((a,b)=>a+b,0)-c.lap)<1e-8);assert.equal(JSON.stringify(s),before);
});
test('practice engineer compares the same driver and calls out changing conditions and physics',()=>{
  const s=createCareer('cobalto'),id=s.teams.cobalto.cars[0].driver.id,row=(time,wing,fuel,condition)=>({teamId:'cobalto',driverId:id,bestLap:time,setup:{rearWing:wing},build:[],metrics:{errors:0,contacts:0},lapDetails:[{time,lap:1,fuel,compound:'medium',condition}],sectors:[{seconds:20},{seconds:30},{seconds:time-50}]});
  s.active={circuit:CIRCUIT.id,archive:{practice:[{physicsVersion:'old',results:[row(80,5,20,'dry')]},{physicsVersion:PHYSICS_VERSION,results:[row(79,2,10,'wet')]}]}};
  const d=practiceDebrief(s,0);assert.equal(d.delta,-1);assert.equal(d.changed[0].key,'rearWing');assert.ok(d.notes.some(x=>x.includes('física')));assert.ok(d.notes.some(x=>x.includes('condição')));assert.ok(d.notes.some(x=>x.includes('10.0 kg')));
});
test('financial preview exposes payroll runway, debt and cost-cap issues without spending',()=>{
  const s=createCareer(),t=s.teams.aurora;t.cash=200000;t.debt=50000;t.spent=s.costCap-10000;const before=JSON.stringify(s),f=financialOutlook(s,'aurora',150000);
  assert.equal(f.after,50000);assert.ok(f.warnings.some(x=>x.title==='Teto de gastos'));assert.ok(f.warnings.some(x=>x.title==='Reserva operacional curta'));assert.ok(f.warnings.some(x=>x.title==='Dívida em aberto'));assert.equal(JSON.stringify(s),before);
});
test('strategy scenarios retain the player plan and expose insufficient stock and extended stints',()=>{
  const s=createCareer('cobalto'),before=JSON.stringify(s),choices=strategyChoices(s,'cobalto',0);assert.equal(choices.length,4);assert.deepEqual(choices[0].plan,s.teams.cobalto.cars[0].strategy);assert.equal(JSON.stringify(s),before);
  s.teams.cobalto.cars[0].tyres.soft=0;assert.ok(strategyChoices(s,'cobalto',0).find(c=>c.id==='attack').forecast.alerts.some(a=>a.title==='Estoque insuficiente'));
  const f=forecastStrategy(s,'cobalto',0,{compound:'soft',fuelKg:20,stops:[],rules:[]},40);assert.ok(f.alerts.some(a=>a.title==='Stint estendido'));assert.ok(f.alerts.some(a=>a.title==='Margem de combustível baixa'));
});
test('live advice prioritizes measured fuel danger and clears after the resource state recovers',()=>{
  const s=createCareer('cobalto'),race=createRace({weather:'dry'}),c=createField(race,null,prepareEntries(s,startingGrid())).find(c=>c.id==='cobalto-10');c.s=c.progress=3*length;c.lap=4;c.lapTimes=[80,80,80];c.lapDetails=[{lap:1,fuel:20},{lap:2,fuel:16},{lap:3,fuel:12}];c.lapContext={fuel:8};c.fuel=8;c.engineTemp=118;c.energy=2;c.manager.orders.ers='attack';
  const advice=liveAdvice(c,race);assert.equal(advice.alerts[0].id,'fuel');assert.ok(advice.alerts.some(a=>a.id==='heat'));assert.ok(advice.alerts.some(a=>a.id==='ers'));
  c.fuel=200;c.engineTemp=100;c.energy=80;assert.ok(!liveAdvice(c,race).alerts.some(a=>['fuel','heat','ers'].includes(a.id)));c.finishTime=90;assert.equal(liveAdvice(c,race).alerts.length,0);
});
test('wet tyres heat and wear faster on a dry surface than on a wet surface',()=>{
  const s=createCareer('cobalto'),race=createRace({weather:'dry'}),c=createField(race,null,prepareEntries(s,startingGrid())).find(c=>c.id==='cobalto-10');c.compound='wet';c.manager.frontTemp=c.manager.rearTemp=68;c.tyreTemp=68;
  const dry=structuredClone(c),wet=structuredClone(c),wetRace={...race,wetness:.8,trackTemp:24};for(let n=0;n<1800;n++){managedSystems(dry,race,1/30,{throttle:1,corner:.5});managedSystems(wet,wetRace,1/30,{throttle:1,corner:.5});}
  assert.ok(dry.tyreTemp>wet.tyreTemp+20);assert.ok(dry.tyreLife<wet.tyreLife-5);
});
test('weather varies reproducibly by weekend seed without consuming driving randomness',()=>{
  const scenarios=Array.from({length:12},(_,i)=>createRace({seed:2026+i,laps:35})),windows=scenarios.map(r=>rainWindow(r));assert.ok(new Set(windows.map(w=>w.start.toFixed(2))).size>8);assert.ok(windows.some(w=>w.dry));
  const race=scenarios[0],rng=race.rng;assert.deepEqual(weatherForecast(race),weatherForecast(structuredClone(race)));assert.equal(race.rng,rng);assert.equal(weatherTarget({...race,weather:'dry'},900),0);
});
test('old physics records remain archived but cannot overwrite the current model records',()=>{
  const s=createCareer();s.active={id:'a',seed:1,circuit:CIRCUIT.id,phase:'practice'};const a=ensureWeekendArchive(s);assert.equal(a.physicsVersion,PHYSICS_VERSION);
  s.archives=[{...a,physicsVersion:'manager-1',practice:[{type:'practice',results:[{driver:'Old',team:'Old',lapDetails:[{time:1,condition:'dry'}]}]}]}];assert.equal(circuitRecords(s).practice,null);assert.equal(s.archives.length,1);
});
test('engineer screens render for fresh careers and include explicit actions with no mutation',()=>{
  const s=createCareer('cobalto'),before=JSON.stringify(s);for(const html of [debriefCard(s,0),setupCard(s,0),comparisonCard(s,0,{rearWing:2}),strategyCards(s,0),financeCard(s)]){assert.ok(html.includes('engineer-card'));assert.ok(!html.includes('NaN'));assert.ok(!html.includes('undefined'));}
  const race=createRace(),car=createField(race,null,prepareEntries(s,startingGrid()))[0];assert.ok(liveCard(car,race).includes('AO VIVO'));assert.equal(JSON.stringify(s),before);
});
