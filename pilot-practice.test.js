import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {practiceAPI} from './worker/practice-api.js';
import {makePilotCar,setupFor,stepPilot} from './pilot-driving.js';
import {at} from './track.js';

test('invitation, isolated drivers, atomic quota, retries and deadline',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./drizzle/0000_practice.sql',import.meta.url),'utf8'));
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
  const lap={id:crypto.randomUUID(),ms:87000,valid:true};
  assert.equal((await (await send('/lap',lap,cookie)).json()).best,87000);
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
  let lap;
  for(let i=0;i<60*220&&!lap;i++){
    const p=at(car.s+Math.max(30,car.v*2.7+15));
    const error=angle(Math.atan2(p.y-car.y,p.x-car.x)-car.angle-car.slip);
    const turn=Math.abs(angle(at(car.s+100).angle-at(car.s).angle));
    const target=turn>.77?25:turn>.4?35:turn>.18?47:66;
    lap=stepPilot(car,{w:car.v<target-1,s:car.v>target+4,a:error<-.04,d:error>.04});
  }
  assert.ok(lap?.valid);
  assert.ok(lap.ms>80000 && lap.ms<95000);
  const stable=makePilotCar(setupFor('stable'),'#ffffff').model;
  const speed=makePilotCar(setupFor('speed'),'#ffffff').model;
  assert.ok(stable.clA>speed.clA && stable.cdA>speed.cdA);
});
