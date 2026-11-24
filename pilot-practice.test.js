import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {practiceAPI} from './worker/practice-api.js';
import {makePilotCar,recoverPilot,setupFor,stepPilot} from './pilot-driving.js';
import {proposePilotSetup} from './pilot-engineer.js';
import {at,ROAD} from './track.js';
import {engineRevs} from './racing-audio.js';
import {fastestLaps,lapHistoryTable,pilotLapRows} from './lap-history.js';

test('invitation, unlimited practice, session limits, retries and deadline',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./drizzle/0000_practice.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('./drizzle/0001_practice_splits.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('./drizzle/0002_pilot_weekend.sql',import.meta.url),'utf8'));
  const env={PRACTICE_INVITE:'test-only',PRACTICE_CLOSES_AT:'2090-01-01T00:00:00Z',DB:{prepare(sql){return{bind(...args){return{
    first:async()=>sqlite.prepare(sql).get(...args)??null,
    all:async()=>({results:sqlite.prepare(sql).all(...args)}),
    run:async()=>({meta:sqlite.prepare(sql).run(...args)})
  };}};}}};
  const send=(path='',data,cookie,now)=>practiceAPI(new Request('https://test.invalid/api/practice'+path,{
    method:data?'POST':'GET',headers:{'Content-Type':'application/json',cookie:cookie??''},body:data&&JSON.stringify({...(path==='/lap'?{phase:'practice'}:{}),...data})
  }),env,now);
  assert.equal((await send('/register',{name:'Teste',invite:'wrong'})).status,403);
  const register=await send('/register',{name:'Piloto Teste',color:'#aabbcc',invite:'test-only'});
  assert.equal(register.status,201);
  const cookie=register.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await send('/register',{name:'piloto teste',invite:'test-only'})).status,409);
  assert.equal((await (await send()).json()).driver,null);
  assert.equal((await send('/telemetry')).status,401);
  const driverId=sqlite.prepare('SELECT id FROM practice_drivers').get().id;
  sqlite.prepare('INSERT INTO practice_laps(driver_id,lap_id,elapsed_ms,valid) VALUES(?,?,60000,1)').run(driverId,crypto.randomUUID());
  const priorLap=sqlite.prepare("INSERT INTO practice_laps(driver_id,lap_id,elapsed_ms,valid,round_key,phase) VALUES(?,?,59000,1,'2026-11-21-weekend',?)");
  for(const phase of ['practice','qualifying','race'])priorLap.run(driverId,crypto.randomUUID(),phase);
  const clean=await (await send('',null,cookie)).json();
  assert.equal(clean.used,0);
  assert.equal(clean.limit,null);
  assert.equal(clean.best,null);
  assert.ok(clean.sessions.every(session=>session.history.length===0));
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM practice_laps WHERE round_key='legacy'").get().n,1);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM practice_laps WHERE round_key='2026-11-21-weekend'").get().n,3);
  const livery={primary:'#011234',secondary:'#ffeebb',accent:'#00ccff',pattern:'chevron',number:48};
  assert.equal((await send('/livery',{...livery,number:100},cookie)).status,400);
  assert.deepEqual((await (await send('/livery',livery,cookie)).json()).driver.livery,livery);
  assert.deepEqual((await (await send('',null,cookie)).json()).driver.livery,livery);
  const lap={id:crypto.randomUUID(),ms:87000,valid:true,splits:[28000,55000,87000]};
  const start=id=>send('/lap',{start:true,id,setup:setupFor('balanced')},cookie);
  assert.equal((await send('/lap',lap,cookie)).status,409);
  assert.equal((await (await start(lap.id)).json()).attemptId,lap.id);
  assert.equal((await (await start(lap.id)).json()).used,1);
  const nextId=crypto.randomUUID();
  const next=await (await send('/lap',{...lap,nextId},cookie)).json();
  assert.deepEqual(next.bestSplits,lap.splits);
  assert.equal(next.used,2);
  assert.equal(next.attemptId,nextId);
  assert.equal((await (await send('/lap',{...lap,nextId},cookie)).json()).used,2);
  const afterLeaving=await (await send('',null,cookie)).json();
  assert.deepEqual(afterLeaving.history[1],{ms:null,valid:false,splits:null});
  assert.equal(afterLeaving.used,2);
  const submissions=Array.from({length:33},async()=>{
    const id=crypto.randomUUID();
    return {id,response:await start(id)};
  });
  const replies=await Promise.all(submissions);
  const started=replies.filter(r=>r.response.ok);
  assert.equal(started.length,33);
  const beyondLimit=crypto.randomUUID();
  const last=await (await send('/lap',{id:started.at(-1).id,ms:92000,valid:true,nextId:beyondLimit},cookie)).json();
  assert.equal(last.used,36);
  assert.equal(last.attemptId,beyondLimit);
  assert.equal(last.history.at(-2).ms,92000);
  assert.equal(last.canStart,true);
  const retry=await (await send('/lap',lap,cookie)).json();
  assert.equal(retry.used,36);assert.equal(retry.best,87000);
  assert.equal(retry.history.length,36);
  assert.deepEqual(retry.history[0],{ms:87000,valid:true,splits:lap.splits});
  assert.equal(retry.history.filter(l=>!l.valid).length,34);
  const liveTelemetry=await (await send('/telemetry',null,cookie)).json();
  const practiceTime=liveTelemetry.sessions[0].entries[0];
  assert.equal(practiceTime.me,true);
  assert.deepEqual(practiceTime.best.sectors,[28000,27000,32000]);
  assert.equal(practiceTime.best.setup.frontWing,5);
  assert.equal(practiceTime.sectors[1].setup.frontWing,5);
  assert.ok(liveTelemetry.rounds.includes('2026-11-21-weekend'));
  const archiveReport=await (await send('/telemetry?round=2026-11-21-weekend',null,cookie)).json();
  assert.equal(archiveReport.sessions[0].entries[0].best.ms,59000);
  assert.equal(archiveReport.sessions[0].entries[0].best.setup,null);
  assert.equal((await send('/telemetry?round=unavailable',null,cookie)).status,404);
  delete env.PRACTICE_CLOSES_AT;
  const qualStart=Date.parse('2026-11-24T15:00:00Z');
  const qualEnd=Date.parse('2026-11-24T20:00:00Z');
  const raceStart=Date.parse('2026-11-24T20:30:00Z');
  const raceEnd=Date.parse('2026-11-25T02:59:59.999Z');
  assert.equal((await (await send('',null,cookie,qualStart-1)).json()).phase,'practice');
  const afterPractice=await (await send('',null,cookie,qualStart)).json();
  assert.equal(afterPractice.phase,'qualifying');
  assert.equal(afterPractice.used,0);
  assert.equal(afterPractice.sessions[0].board[0].best,87000);
  assert.equal((await send('/lap',{start:true,id:crypto.randomUUID()},cookie,qualStart)).status,410);
  const second=await send('/register',{name:'Mais um',invite:'test-only'},undefined,qualStart);
  assert.equal(second.status,201);
  const secondCookie=second.headers.get('Set-Cookie').split(';')[0];
  const stint=async (sessionCookie,phase,now,times)=>{
    let id=crypto.randomUUID();
    const setup=setupFor('stable');
    const first=await send('/lap',{phase,start:true,id,setup},sessionCookie,now);
    assert.equal(first.status,200);
    assert.equal((await first.json()).attemptId,id);
    assert.equal((await send('/lap',{phase,start:true,id:crypto.randomUUID(),setup},sessionCookie,now)).status,409);
    for(const timing of times){
      const nextId=crypto.randomUUID();
      const lap=typeof timing==='number'?{ms:timing,valid:true}:timing;
      const reply=await send('/lap',{phase,id,...lap,nextId},sessionCookie,now);
      assert.equal(reply.status,200);
      const snapshot=await reply.json();
      id=snapshot.attemptId;
      if(!id)return snapshot;
    }
    assert.fail('Stint should be complete');
  };
  const qualified=await stint(cookie,'qualifying',qualStart,[
    {ms:68000,splits:[19000,44000,68000],valid:true},
    {ms:61000,splits:[21000,43000,61000],valid:true},
    {ms:45000,splits:[15000,30000,45000],valid:false},
    67000, 66000, 64000
  ]);
  assert.equal(qualified.used,6);
  assert.equal(qualified.best,61000);
  await stint(secondCookie,'qualifying',qualStart,[65000,62000,65000,66000,64000,63000]);
  const comparisons=(await (await send('/telemetry',null,secondCookie,qualStart)).json()).sessions[1].entries;
  const first=comparisons.find(e=>!e.me);
  assert.equal(first.best.ms,61000);
  assert.equal(first.best.setup.rearWing,9);
  assert.equal(first.sectors.reduce((sum,s)=>sum+s.ms,0),59000);
  assert.equal(comparisons.find(e=>e.me).best.ms,62000);
  assert.equal((await (await send('',null,cookie,qualEnd-1)).json()).phase,'qualifying');
  for(const now of [qualEnd,raceStart-1]){
    const gap=await (await send('',null,cookie,now)).json();
    assert.equal(gap.phase,null);
    assert.deepEqual(gap.sessions.map(session=>session.status),['closed','closed','upcoming']);
    assert.equal((await send('/lap',{phase:'race',start:true,id:crypto.randomUUID()},cookie,now)).status,410);
  }
  const race=await (await send('',null,secondCookie,raceStart)).json();
  assert.equal(race.phase,'race');
  assert.deepEqual(race.grid,{position:2,delay:2000});
  assert.equal(race.lockedSetup.rearWing,9);
  assert.equal(race.sessions[1].board[0].best,61000);
  assert.equal((await send('/register',{name:'Novo piloto',invite:'test-only'},undefined,raceStart)).status,410);
  await stint(cookie,'race',raceStart,Array(10).fill(60000));
  await stint(secondCookie,'race',raceStart,Array(10).fill(59900));
  assert.equal((await (await send('',null,cookie,raceEnd-1)).json()).sessions[2].board,undefined);
  const final=await (await send('',null,cookie,raceEnd)).json();
  assert.equal(final.phase,null);
  assert.deepEqual(final.sessions[2].board.map(r=>[r.name,r.official]),[['Piloto Teste',600000],['Mais um',601000]]);
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

test('engineer proposals respect limits and trade straight-line drag for cornering support',()=>{
  const setup=setupFor('balanced');
  const measure=report=>{
    const proposal=proposePilotSetup(setup,report);
    const adjusted={...setup,...Object.fromEntries(proposal.changes.map(({id,to})=>[id,to]))};
    return makePilotCar(adjusted,'#ffffff').model;
  };
  const base=makePilotCar(setup,'#ffffff').model;
  const planted=measure('loose'), fast=measure('slow'), direct=measure('wide');
  assert.ok(planted.clA>base.clA&&planted.cdA>base.cdA&&planted.balance<base.balance);
  assert.ok(fast.clA<base.clA&&fast.cdA<base.cdA);
  assert.ok(direct.balance>base.balance);
  assert.equal(setup.rearWing,5);
  assert.deepEqual(proposePilotSetup({...setup,brakeBias:58},'braking').changes,[{id:'brakeBias',from:58,to:57}]);
  assert.deepEqual(proposePilotSetup({...setup,frontWing:0,rearWing:0},'slow').changes,[]);
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

for(const startMode of ['pits','flying','grid'])test(`WASD starts from ${startMode} and clocks two full laps`,()=>{
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
  assert.ok(startMode==='pits'?firstLine>60:firstLine<18);
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
