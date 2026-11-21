import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {practiceAPI} from './worker/practice-api.js';
import {makePilotCar,recoverPilot,setupFor,stepPilot} from './pilot-driving.js';
import {at,ROAD} from './track.js';
import {engineRevs} from './racing-audio.js';
import {fastestLaps,lapHistoryTable,pilotLapRows} from './lap-history.js';

test('invitation, isolated drivers, atomic quota, retries and deadline',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./drizzle/0000_practice.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('./drizzle/0001_practice_splits.sql',import.meta.url),'utf8'));
  const env={PRACTICE_INVITE:'test-only',PRACTICE_CLOSES_AT:'2090-01-01T00:00:00Z',DB:{prepare(sql){return{bind(...args){return{
    first:async()=>sqlite.prepare(sql).get(...args)??null,
    all:async()=>({results:sqlite.prepare(sql).all(...args)}),
    run:async()=>({meta:sqlite.prepare(sql).run(...args)})
  };}};}}};
  const send=(path='',data,cookie)=>practiceAPI(new Request('https://test.invalid/api/practice'+path,{
    method:data?'POST':'GET',headers:{'Content-Type':'application/json',cookie:cookie??''},body:data&&JSON.stringify(data)
  }),env);
  assert.equal((await send('/register',{name:'Teste',invite:'wrong'})).status,403);
  const register=await send('/register',{name:'Piloto Teste',color:'#aabbcc',invite:'test-only'});
  assert.equal(register.status,201);
  const cookie=register.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await send('/register',{name:'piloto teste',invite:'test-only'})).status,409);
  assert.equal((await (await send()).json()).driver,null);
  const lap={id:crypto.randomUUID(),ms:87000,valid:true,splits:[28000,55000,87000]};
  assert.deepEqual((await (await send('/lap',lap,cookie)).json()).bestSplits,lap.splits);
  const submissions=Array.from({length:33},()=>send('/lap',{id:crypto.randomUUID(),ms:85000,valid:false},cookie));
  const replies=await Promise.all(submissions);
  assert.equal(replies.filter(r=>r.ok).length,29);
  const retry=await (await send('/lap',lap,cookie)).json();
  assert.equal(retry.used,30);assert.equal(retry.best,87000);
  assert.equal(retry.history.length,30);
  assert.deepEqual(retry.history[0],{ms:87000,valid:true,splits:lap.splits});
  assert.equal(retry.history.filter(l=>!l.valid).length,29);
  env.PRACTICE_CLOSES_AT='2000-01-01T00:00:00Z';
  assert.equal((await send('/register',{name:'Novo piloto',invite:'test-only'})).status,410);
  assert.equal((await (await send('',null,cookie)).json()).board[0].best,87000);
});

test('gravel costs speed without invalidating the lap, even after an automatic recovery',()=>{
  const car=makePilotCar(setupFor('balanced'),'#ffffff',null,'flying');
  Object.assign(car,at(car.s,ROAD*.72),{v:30});
  stepPilot(car,{});
  assert.equal(car.off,true);
  const speed=car.v;
  stepPilot(car,{});
  assert.ok(car.v<speed);
  assert.equal(car.invalid,false);
  const progress=car.progress;
  Object.assign(car,at(car.s,ROAD*1.6));
  stepPilot(car,{});
  assert.equal(car.progress,progress);
  assert.equal(car.invalid,false);
  recoverPilot(car);
  assert.equal(car.invalid,true);
});

test('heavy braking while turning can spin the car; straight braking stays controllable',()=>{
  function brake(keys){
    const car=makePilotCar(setupFor('balanced'),'#ffffff',null,'flying');
    car.v=100;
    let locked=false,spun=false;
    for(let i=0;i<60;i++){stepPilot(car,keys);locked||=car.locked;spun||=car.spin>0;}
    return {locked,spun};
  }
  assert.deepEqual(brake({s:true}),{locked:false,spun:false});
  assert.deepEqual(brake({s:true,d:true}),{locked:true,spun:true});
});

test('the stable preset is less prone to spinning under a sharp high-speed turn',()=>{
  function spins(preset){
    const car=makePilotCar(setupFor(preset),'#ffffff',null,'flying');
    car.v=89;
    for(let i=0;i<60;i++){
      stepPilot(car,{w:true,d:true});
      if(car.spin>0)return true;
    }
    return false;
  }
  assert.equal(spins('speed'),true);
  assert.equal(spins('stable'),false);
});

test('history shows individual sectors and ranks valid laps only',()=>{
  const rows=pilotLapRows([
    {ms:90000,valid:true,splits:[30000,60000,90000]},
    {ms:91000,valid:true,splits:[29000,60000,91000]},
    {ms:40000,valid:false,splits:null}
  ]);
  assert.deepEqual(rows[1].sectors,[29000,31000,31000]);
  assert.deepEqual(fastestLaps(rows).map(l=>l.lap),[1,2]);
  const table=lapHistoryTable(rows,String);
  assert.match(table,/data-lap-mark="best"[^>]*>29000/);
  assert.match(table,/data-lap-mark="worst"[^>]*>91000/);
});

for(const startMode of ['pits','flying'])test(`WASD starts from ${startMode} and clocks two full laps`,()=>{
  const car=makePilotCar(setupFor('balanced'),'#ff55ee',null,startMode);
  assert.equal(car.pit,startMode==='pits');assert.equal(car.start,null);
  const angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
  const laps=[];
  let exit;
  for(let i=0;i<60*400&&laps.length<2;i++){
    const p=at(car.s+Math.max(30,car.v*2.7+15));
    const error=angle(Math.atan2(p.y-car.y,p.x-car.x)-car.angle-car.slip);
    const turn=Math.abs(angle(at(car.s+100).angle-at(car.s).angle));
    const target=turn>.77?25:turn>.4?35:turn>.18?47:66;
    const lap=stepPilot(car,{w:car.v<target-1,s:car.v>target+4,a:error<-.04,d:error>.04});
    if(!car.pit&&exit===undefined)exit=car.elapsed;
    if(lap)laps.push({lap,display:car.lastSplits});
  }
  const [{lap,display},second]=laps;
  assert.ok(exit<6);
  const firstLine=car.start-lap.ms/1000-second.lap.ms/1000;
  assert.ok(startMode==='flying'?firstLine<18:firstLine>60);
  assert.ok(lap?.valid);
  assert.ok(lap.ms>80000 && lap.ms<95000);
  assert.equal(lap.splits.at(-1),lap.ms);
  assert.deepEqual(display.map(s=>s.delta),[null,null,null]);
  assert.deepEqual(second.display.map(s=>s.delta),second.lap.splits.map((ms,i)=>ms-lap.splits[i]));
  const stable=makePilotCar(setupFor('stable'),'#ffffff').model;
  const speed=makePilotCar(setupFor('speed'),'#ffffff').model;
  assert.ok(stable.clA>speed.clA && stable.cdA>speed.cdA);
});

test('engine pitch climbs within the gear and drops when it shifts up',()=>{
  const first=engineRevs(26,1,1), second=engineRevs(27,1,1);
  assert.equal(second.gear,2);
  assert.ok(second.rpm<first.rpm&&engineRevs(35,2,1).rpm>second.rpm);
  assert.equal(engineRevs(17,2).gear,1);
});
