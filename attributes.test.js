import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createField,simulateField} from './race-ai.js';
import {physics,TEAMS} from './teams.js';
import {DRIVERS,DRIVER_LABELS} from './drivers.js';
import {CAR_LABELS} from './car-specs.js';
import {length,at,ROAD} from './track.js';
import {sectionAt,DRS_ZONES} from './track-profile.js';
import {CAR_SCALE,CAR_WIDTH,CAR_LENGTH,SAFETY_GAP,GRID_SPACING,CAMERA_ZOOM} from './vehicle-geometry.js';
import {createRace,capabilities,cornerSpeed,updateSystems,gripFactor,errorRate,battleScore} from './race-systems.js';
const car=()=>structuredClone(createField(createRace({weather:'dry'}))[0]);
const dry=()=>createRace({weather:'dry'});
function variants(key,scope='car'){let low=car(),high=structuredClone(low);if(scope==='car'){low.team.car[key]=35;high.team.car[key]=98;low.performance=physics(low.team);high.performance=physics(high.team);}else{low.driver.stats[key]=35;high.driver.stats[key]=98;}return[low,high];}
test('twenty named drivers have all nine skills and every constructor has all ten car attributes',()=>{
  assert.equal(DRIVERS.length,20);assert.equal(new Set(DRIVERS.map(d=>d.number)).size,20);
  for(const d of DRIVERS)for(const key of Object.keys(DRIVER_LABELS))assert.ok(d.stats[key]>0&&d.stats[key]<=100);
  for(const t of TEAMS)for(const key of Object.keys(CAR_LABELS))assert.ok(t.car[key]>0&&t.car[key]<=100);
});
test('track offers all speed bands and DRS straights; car scale and collision footprint agree',()=>{
  const kinds=new Set();for(let s=0;s<length;s+=25)kinds.add(sectionAt(s).type);assert.equal(kinds.size,4);assert.equal(DRS_ZONES.length,2);
  assert.ok(CAR_WIDTH/ROAD<.22);assert.ok(CAR_LENGTH/ROAD<.4);assert.ok(SAFETY_GAP>CAR_LENGTH&&GRID_SPACING>SAFETY_GAP);assert.equal(CAR_SCALE,.55);assert.ok(CAMERA_ZOOM.desktop<.8);
});
for(const key of ['topSpeed','acceleration','braking'])test(`car ${key} changes available mechanical performance`,()=>{
  const [a,b]=variants(key),field=key==='topSpeed'?'maxSpeed':key;
  assert.ok(capabilities(b,dry())[field]>capabilities(a,dry())[field]);
});
for(const key of ['low','medium','high'])test(`${key}-speed corner capability changes only its own speed band`,()=>{
  const [a,b]=variants(key),r=dry();let ca=capabilities(a,r),cb=capabilities(b,r);
  assert.ok(cornerSpeed(b,r,{type:key,speed:180},cb)>cornerSpeed(a,r,{type:key,speed:180},ca));
  for(const other of ['low','medium','high'].filter(k=>k!==key))assert.equal(ca[other],cb[other]);
});
test('DRS attribute adds speed when enabled, and dirty-air tolerance preserves cornering in traffic',()=>{
  let [a,b]=variants('drs'),r=dry();assert.equal(capabilities(a,r).maxSpeed,capabilities(b,r).maxSpeed);assert.ok(capabilities(b,r,{drs:true}).maxSpeed>capabilities(a,r,{drs:true}).maxSpeed);
  [a,b]=variants('dirtyAir');assert.equal(capabilities(a,r).high,capabilities(b,r).high);assert.ok(capabilities(b,r,{traffic:1}).high>capabilities(a,r,{traffic:1}).high);
});
function stint(c,r,seconds=50,options={throttle:1,braking:.5,traffic:1,corner:1,ers:true}){c.v=280;for(let t=0;t<seconds;t+=.1)updateSystems(c,r,.1,options);return c;}
test('tyre preservation, driver smoothness and appropriate compounds extend useful grip',()=>{
  let [a,b]=variants('tyres'),r=dry();stint(a,r);stint(b,r);assert.ok(b.tyreLife>a.tyreLife);assert.ok(b.tyreTemp<a.tyreTemp);
  [a,b]=variants('smoothness','driver');stint(a,r);stint(b,r);assert.ok(b.tyreLife>a.tyreLife);
  a=car();b=structuredClone(a);b.tyreLife=25;assert.ok(gripFactor(a,r)>gripFactor(b,r));r.wetness=.8;b=structuredClone(a);b.compound='wet';b.tyreTemp=68;assert.ok(gripFactor(b,r)>gripFactor(a,r));
});
test('cooling and supplier durability limit engine damage; efficiency and ERS conserve resources',()=>{
  let [a,b]=variants('cooling'),r=dry();stint(a,r,90);stint(b,r,90);assert.ok(b.engineTemp<a.engineTemp);assert.ok(b.engineHealth>a.engineHealth);
  a=car();b=structuredClone(a);a.team.supplier.efficiency=30;b.team.supplier.efficiency=98;stint(a,r);stint(b,r);assert.ok(b.fuel>a.fuel);
  a=car();b=structuredClone(a);a.team.supplier.ers=30;b.team.supplier.ers=98;stint(a,r,5);stint(b,r,5);assert.ok(b.energy>a.energy);
  a=car();b=structuredClone(a);a.team.supplier.durability=30;b.team.supplier.durability=98;stint(a,r);stint(b,r);assert.ok(b.engineHealth>a.engineHealth);
  a.engineTemp=130;assert.ok(capabilities(a,r).maxSpeed<capabilities(car(),r).maxSpeed);
});
test('pilot cornering, braking and reactions improve distinct parts of executing a lap',()=>{
  for(const [key,metric] of [['cornering','medium'],['braking','braking'],['reactions','acceleration']]){const [a,b]=variants(key,'driver');assert.ok(capabilities(b,dry())[metric]>capabilities(a,dry())[metric]);}
});
test('pilot control and precision reduce errors; adaptation helps in rain and attack/defence have separate scores',()=>{
  for(const key of ['control','accuracy']){const [a,b]=variants(key,'driver');assert.ok(errorRate(b,dry(),{type:'low'},true,1)<errorRate(a,dry(),{type:'low'},true,1));}
  const [a,b]=variants('adaptability','driver'),r=dry();assert.equal(gripFactor(a,r),gripFactor(b,r));r.wetness=.8;assert.ok(gripFactor(b,r)>gripFactor(a,r));
  for(const [key,defending] of [['overtaking',false],['defending',true]]){const [a,b]=variants(key,'driver');assert.ok(battleScore(b,defending)>battleScore(a,defending));assert.equal(battleScore(a,!defending),battleScore(b,!defending));}
});
test('lighter fuel loads and lower chassis mass help; power installation belongs to each team',()=>{
  const a=car(),b=structuredClone(a),r=dry();a.fuel=32;b.fuel=5;assert.ok(capabilities(b,r).acceleration>capabilities(a,r).acceleration);
  a.team.weight=825;b.team.weight=798;a.performance=physics(a.team);b.performance=physics(b.team);assert.ok(capabilities(b,r).acceleration>capabilities(a,r).acceleration);
  for(const team of TEAMS)assert.ok(Math.abs(team.power-team.supplier.power*team.installation)<1e-8);
});
test('DRS closes in rain; equal weather and seed reproduce the same driving decisions',()=>{
  const r1=createRace({weather:'rain',seed:77}),r2=createRace({weather:'rain',seed:77}),a=createField(r1),b=createField(r2);
  for(let t=1/30;t<25;t+=1/30){simulateField(a,1/30,t,r1);simulateField(b,1/30,t,r2);for(const c of a)assert.equal(c.drs,false);}
  assert.deepEqual(a.map(c=>[c.s,c.v,c.tyreLife,c.metrics]),b.map(c=>[c.s,c.v,c.tyreLife,c.metrics]));
});
test('precision produces measurable pace and line differences in the same car',()=>{
  const [a,b]=variants('accuracy','driver');for(const c of [a,b]){c.s=0;c.progress=0;c.v=200;c.lane=-24;c.laneTarget=-24;Object.assign(c,at(0,-24));c.errorCooldown=999;}
  const r1=dry(),r2=dry();for(let t=1/30;t<12;t+=1/30){simulateField([a],1/30,t,r1);simulateField([b],1/30,t,r2);}assert.ok(b.progress>a.progress);assert.ok(Math.abs(b.lane+24)<Math.abs(a.lane+24));
});
test('clean cornering keeps momentum and brakes progressively instead of almost stopping',()=>{
  const c=car(),r=dry();c.errorCooldown=999;let minimum=Infinity;
  for(let t=1/30;t<80;t+=1/30){const previous=c.v;simulateField([c],1/30,t,r);if(t>8&&!c.pit&&c.finishTime===null){minimum=Math.min(minimum,c.v);assert.ok(previous-c.v<15,'abrupt speed drop in a clean lap');}}
  assert.ok(minimum>105,`unnecessary stop: ${minimum}`);
});
