import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createField,simulateField,raceOrder} from './race-ai.js';
import {createRace,COMPOUNDS,chooseCompound,updateSystems,capabilities,gripFactor} from './race-systems.js';
import {resolveContacts,updateMechanical,safeEscapeSide,retire} from './race-incidents.js';
import {contactBetween} from './contact-geometry.js';
import {garageStop,pitPoint} from './pit-layout.js';
import {at,length,ROAD} from './track.js';
const fixture=()=>{const race=createRace({weather:'dry',seed:1}),cars=createField(race);race.rng=1;return{race,c:structuredClone(cars[0]),b:structuredClone(cars[1])};};
test('AI chooses five usable compounds according to weather and tyre management',()=>{
  const {race,c}=fixture();assert.equal(Object.keys(COMPOUNDS).length,5);
  c.team.car.tyres=95;c.driver.stats.smoothness=95;assert.equal(chooseCompound(c,race),'soft');
  c.team.car.tyres=82;c.driver.stats.smoothness=82;assert.equal(chooseCompound(c,race),'medium');
  c.team.car.tyres=65;c.driver.stats.smoothness=65;assert.equal(chooseCompound(c,race),'hard');
  race.wetness=.4;assert.equal(chooseCompound(c,race),'inter');race.wetness=.8;assert.equal(chooseCompound(c,race),'wet');
});
test('soft tyres offer early grip while hard tyres preserve grip over a long stint',()=>{
  const {race,c}=fixture(),hard=structuredClone(c);c.compound='soft';hard.compound='hard';c.tyreTemp=98;hard.tyreTemp=91;c.v=hard.v=270;
  assert.ok(gripFactor(c,race)>gripFactor(hard,race));
  for(let t=0;t<300;t+=.1)for(const x of[c,hard])updateSystems(x,race,.1,{throttle:.8,corner:.8,braking:.3});
  assert.ok(hard.tyreLife>c.tyreLife+20);assert.ok(gripFactor(hard,race)>gripFactor(c,race));
});
test('rotated body collision detects real overlap and ignores separate cars',()=>{
  const a={x:0,y:0,angle:Math.PI/4,halfLength:20,halfWidth:10},b={...a,x:15,y:5,angle:-Math.PI/4};
  assert.ok(contactBetween(a,b));assert.equal(contactBetween(a,{...b,x:90}),null);
});
test('contacts cause component damage and lost speed, with a cooldown per pair',()=>{
  const {race,c,b}=fixture();Object.assign(c,{x:0,y:0,angle:0,v:280});Object.assign(b,{x:25,y:3,angle:0,v:120});
  race.elapsed=10;resolveContacts([c,b],race);assert.ok(c.damage>0&&b.damage>0);assert.ok(c.v<280&&b.v<120);assert.equal(c.metrics.contacts,1);
  assert.ok(Object.values(c.damageParts).some(x=>x>0));const damage=c.damage;
  Object.assign(c,{x:0,y:0,angle:0});Object.assign(b,{x:25,y:3,angle:0});race.elapsed=10.1;resolveContacts([c,b],race);assert.equal(c.damage,damage);
});
test('a driving mistake physically reaches gravel and recovers to the asphalt',()=>{
  const {race,c}=fixture();c.s=4000;c.progress=4000;c.lane=24;c.laneTarget=24;c.v=240;c.incident={kind:'wide',remaining:2.5};c.escapeSide=safeEscapeSide(c);c.errorCooldown=999;Object.assign(c,at(c.s,c.lane));
  for(let t=1/30;t<1.5;t+=1/30)simulateField([c],1/30,t,race);
  assert.equal(c.surface,'gravel');assert.ok(Math.abs(c.lane)>ROAD/2);assert.ok(c.v<120);assert.equal(c.metrics.gravel,1);
  for(let t=1.5;t<8;t+=1/30)simulateField([c],1/30,t,race);assert.equal(c.surface,'asphalt');assert.ok(Math.abs(c.lane)<33);
});
test('a spin costs time and rotates the car instead of silently changing a rating',()=>{
  const {race,c}=fixture();c.s=4000;c.progress=4000;c.v=260;c.incident={kind:'spin',remaining:3};c.errorCooldown=999;Object.assign(c,at(c.s,c.lane));
  for(let t=1/30;t<1.5;t+=1/30)simulateField([c],1/30,t,race);
  assert.ok(c.v<60);assert.ok(Math.abs(c.angle-at(c.s).angle)>.1);
});
test('thermal stress can trigger a named mechanical fault and damage reduces available performance',()=>{
  const {race,c}=fixture(),healthy=structuredClone(c);c.v=250;c.engineTemp=200;c.engineHealth=30;c.team.supplier.durability=0;
  updateMechanical(c,race,60);assert.ok(c.fault);assert.equal(c.metrics.faults,1);
  c.engineTemp=healthy.engineTemp;c.engineHealth=healthy.engineHealth;c.fault={type:'gearbox'};assert.ok(capabilities(c,race).maxSpeed<capabilities(healthy,race).maxSpeed);
  c.fault={type:'puncture'};assert.ok(gripFactor(c,race)<gripFactor(healthy,race));
  c.fault=null;c.damageParts.frontWing=60;assert.ok(capabilities(c,race).medium<capabilities(healthy,race).medium);
});
test('the garage repairs the mechanical fault, component damage and tyre wear',()=>{
  const {race,c}=fixture();c.s=garageStop(0);c.progress=c.s;c.pit={stopAt:c.s,exitAt:length+480,served:false,remaining:0,compound:'medium'};c.damage=22;c.damageParts.frontWing=30;c.tyreLife=25;c.fault={type:'gearbox'};Object.assign(c,pitPoint(c.s));
  for(let t=1/30;t<20&&!c.pit.served;t+=1/30)simulateField([c],1/30,t,race);
  assert.equal(c.pit.served,true);assert.equal(c.fault,null);assert.equal(c.damage,0);assert.equal(c.damageParts.frontWing,0);assert.equal(c.tyreLife,100);assert.equal(c.pitStops,1);
});
test('unrecoverable damage retires a car safely and classification handles DNF',()=>{
  const {race,c,b}=fixture();c.damageParts.suspension=95;c.v=200;updateMechanical(c,race,1/30);
  assert.equal(c.retired,true);assert.equal(c.v,0);assert.equal(raceOrder([c,b]).at(-1).id,c.id);
  b.finishTime=90;assert.equal(raceOrder([c,b])[0].id,b.id);retire(c,race,'duplicado');assert.equal(race.events.filter(e=>e.type==='retirement').length,1);
});
