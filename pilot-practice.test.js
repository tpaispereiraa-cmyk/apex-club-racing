import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {practiceAPI} from './worker/practice-api.js';
import {makePilotCar,setupFor,stepPilot} from './pilot-driving.js';
import {at} from './track.js';
import {engineRevs} from './racing-audio.js';

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
  env.PRACTICE_CLOSES_AT='2000-01-01T00:00:00Z';
  assert.equal((await send('/register',{name:'Novo piloto',invite:'test-only'})).status,410);
  assert.equal((await (await send('',null,cookie)).json()).board[0].best,87000);
});

test('WASD can exit the pit and complete a clean lap after the outlap',()=>{
  const car=makePilotCar(setupFor('balanced'),'#ff55ee');
  assert.equal(car.pit,true);assert.equal(car.start,null);
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
