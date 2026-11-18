import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,prepareEntries} from './manager/career.js';
import {createManagerController} from './manager/controller.js';
import {evaluateSetup} from './manager/strategy.js';
import {strategyTelemetry} from './manager/telemetry.js';
import {managedStrategy,applyRaceCommands} from './manager/race-control.js';
import {createField,simulateField} from './race-ai.js';
import {startingGrid} from './teams.js';
import {createRace,updateWeather} from './race-systems.js';
import {length} from './track.js';
import {weatherForecast} from './weather.js';
import {simulateRemaining} from './session-worker.js';
function pack(){const state=createCareer('cobalto'),session=createRace({type:'race',laps:8,weather:'dry'}),cars=createField(session,null,prepareEntries(state,startingGrid()));return{state,session,cars};}
test('telemetry estimates from recorded fuel and the current tyre stint, without inventing samples',()=>{
  const car={s:3*length,fuel:97,lapTimes:[80,80,80],lapDetails:[{lap:1,fuel:110},{lap:2,fuel:106},{lap:3,fuel:102}],lapContext:{fuel:98},tyreLife:80,tyreFittedAtS:2*length};
  const t=strategyTelemetry(car,{laps:8});assert.equal(t.fuelPerLap,4);assert.equal(t.fuelAtFinish,77);assert.ok(Math.abs(t.tyreLapsRemaining-3.5)<1e-9);
  car.tyreLife=100;car.tyreFittedAtS=car.s;assert.equal(strategyTelemetry(car,{laps:8}).tyreLapsRemaining,null);assert.equal(strategyTelemetry({s:0,fuel:100,tyreLife:100},{laps:8}).fuelPerLap,null);
});
test('public forecast brackets actual onset of rain and identifies fixed weather',()=>{
  const race=createRace({laps:27,weather:'auto'}),forecast=weatherForecast(race);let wetAt=null;
  for(let t=.1;t<500;t+=.1){updateWeather(race,.1,t);if(race.wetness>.22){wetAt=t;break;}}
  assert.ok(wetAt>=forecast.next.from&&wetAt<=forecast.next.to);assert.equal(weatherForecast(createRace({weather:'dry'})).next,null);assert.equal(weatherForecast(createRace({weather:'rain'})).fixed,true);
});
test('manager tyre threshold remains authoritative until the critical safety limit',()=>{
  const {cars,session}=pack(),c=cars.find(c=>c.team.id==='cobalto'&&c.slot===0);c.manager.strategy={compound:'medium',stops:[],rules:[{when:'tyres',threshold:20,compound:'hard'}]};c.tyreLife=30;c.errorCooldown=100;
  simulateField([c],1/30,1,session);assert.equal(c.pitRequested,false);c.tyreLife=19;managedStrategy(c,session,[c]);assert.equal(c.pitRequested,true);
  c.pitRequested=false;c.tyreLife=100;managedStrategy(c,session,[c]);c.tyreLife=19;managedStrategy(c,session,[c]);assert.equal(c.pitRequested,true);
});
test('empty fuel means retirement instead of unlimited driving at reduced speed',()=>{
  const {cars,session}=pack(),c=cars.find(c=>c.team.id==='cobalto'&&c.slot===0);c.fuel=0;simulateField([c],1/30,1,session);assert.equal(c.retired,true);assert.equal(c.retirementReason,'combustível esgotado');
});
test('accepted instructions retain actual time, lap and resources for the post-race report',()=>{
  const {cars,session}=pack(),c=cars.find(c=>c.team.id==='cobalto'&&c.slot===0);session.elapsed=240;c.lap=4;
  applyRaceCommands(cars,[{type:'orders',teamId:'cobalto',slot:0,sequence:1,patch:{pace:'attack'}}],session);assert.equal(c.manager.orders.pace,'attack');assert.equal(c.manager.orderHistory[0].time,240);assert.equal(c.manager.orderHistory[0].lap,4);
});
test('stint simulation stops at the requested car lap without completing or settling the race',async()=>{
  const {cars,session}=pack(),c=cars.find(c=>c.team.id==='cobalto'&&c.slot===0);const result=await simulateRemaining({cars:[c],session,elapsed:0,stopAt:{carId:c.id,laps:2}},{yieldTask:async()=>{}});assert.equal(result.cars[0].lapTimes.length,2);assert.equal(result.cars[0].finishTime,null);
});
test('a missing selected starting compound blocks the grid without consuming the qualifying cars',()=>{
  const ctl=createManagerController({getItem:()=>null,setItem:()=>{}});ctl.create('cobalto','Teste de estoque');ctl.state.active={id:'stock-test',phase:'qualifyingReview'};ctl.state.teams.cobalto.cars[0].tyres.medium=0;
  const {cars}=pack();for(const c of cars)c.finishTime=100;const before=ctl.export();assert.throws(()=>ctl.toRace(cars),/sem conjunto de largada/);assert.equal(ctl.export(),before);
});
test('the setup reference follows actual clean-lap direction and includes thermal risk',()=>{
  const state=createCareer('cobalto');const high=evaluateSetup(state,'cobalto',0,{frontWing:8,rearWing:8}),bad=evaluateSetup(state,'cobalto',0,{frontWing:10,rearWing:0}),closed=evaluateSetup(state,'cobalto',0,{cooling:0});
  assert.ok(high.lapSeconds<bad.lapSeconds);assert.ok(closed.peakEngineTemp>112);assert.match(closed.warning,/proteção térmica/);
});
test('resources and classified distance freeze at the flag while the car coasts visually',()=>{
  const {cars,session}=pack(),c=cars.find(c=>c.team.id==='cobalto'&&c.slot===0);c.finishTime=90;c.progress=length*8;c.s=c.progress;c.v=200;
  const before={fuel:c.fuel,tyres:c.tyreLife,engine:c.engineHealth,progress:c.progress,used:c.manager.fuelUsed};
  for(let i=0;i<300;i++)simulateField([c],1/30,100+i/30,session);
  assert.deepEqual({fuel:c.fuel,tyres:c.tyreLife,engine:c.engineHealth,progress:c.progress,used:c.manager.fuelUsed},before);assert.ok(c.s>before.progress);
});
test('ordinary engine wear does not repeatedly call a managed car for an impossible repair',()=>{
  const {cars,session}=pack(),c=cars.find(c=>c.team.id==='cobalto'&&c.slot===0);c.engineHealth=70;c.manager.strategy={compound:'medium',stops:[],rules:[]};c.errorCooldown=100;
  simulateField([c],1/30,1,session);assert.equal(c.pitRequested,false);assert.equal(c.retired,false);
});
