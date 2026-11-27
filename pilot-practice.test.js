import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {practiceAPI} from './worker/practice-api.js';
import {hash} from './worker/pilot-credentials.js';
import {GRID_ASSIST_TICKS,GRID_RED_TICKS,makePilotCar,recoverPilot,setupFor,stepPilot} from './pilot-driving.js';
import {proposePilotSetup} from './pilot-engineer.js';
import {at,length,ROAD} from './track.js';
import {engineRevs} from './racing-audio.js';
import {fastestLaps,lapHistoryTable,pilotLapRows} from './lap-history.js';
import {broadcastEvents,interpolateReplay,replayGap,replayPosition,timingReference} from './pilot-replay-timing.js';
import {parseRoute} from './routes.js';

function practiceFixture(){
  const sqlite=new DatabaseSync(':memory:');
  for(const file of ['0000_practice','0001_practice_splits','0002_pilot_weekend','0003_race_replay','0004_pilot_accounts','0005_practice_quota']){
    sqlite.exec(readFileSync(new URL(`./drizzle/${file}.sql`,import.meta.url),'utf8'));
  }
  const env={PRACTICE_INVITE:'test-only',PRACTICE_CLOSES_AT:'2090-01-01T00:00:00Z',DB:{prepare(sql){return{bind(...args){return{
    first:async()=>sqlite.prepare(sql).get(...args)??null,
    all:async()=>({results:sqlite.prepare(sql).all(...args)}),
    run:async()=>({meta:sqlite.prepare(sql).run(...args)})
  };}};}}};
  const send=(path='',data,cookie,now,series='2026-11-22-weekend')=>{
    const url=new URL('https://test.invalid/api/practice'+path);
    if(series)url.searchParams.set('series',series);
    return practiceAPI(new Request(url,{
      method:data?'POST':'GET',headers:{'Content-Type':'application/json',cookie:cookie??''},body:data&&JSON.stringify({...(path==='/lap'?{phase:'practice'}:{}),...data})
    }),env,now);
  };
  return {sqlite,env,send};
}

test('legacy drivers can claim their car, carry named setups and a paused Qualy to another browser',async()=>{
  const {sqlite,send}=practiceFixture(), legacyToken='a'.repeat(64), password='simple-test-password';
  const driverId=await hash(legacyToken), oldBrowser=`apex_practice=${legacyToken}`;
  const practice=Date.parse('2089-12-31T20:00:00Z'), qualy=Date.parse('2090-01-01T01:00:00Z');
  const attempt=crypto.randomUUID();
  sqlite.prepare(`INSERT INTO practice_drivers(id,event_id,name,name_key,color)
    VALUES(?, 'interlagos-2026-11-21','Piloto Legado','piloto legado','#ffffff')`).run(driverId);
  sqlite.prepare(`INSERT INTO practice_laps(driver_id,lap_id,elapsed_ms,valid,round_key,phase)
    VALUES(?,?,65000,1,'2026-11-22-weekend','practice')`).run(driverId,crypto.randomUUID());
  const account={login:'Piloto.Legado',password};
  const validSetup={frontWing:8,rearWing:7,antiRoll:5,brakeBias:55,rideHeight:45};
  const cookie=response=>response.headers.get('Set-Cookie').split(';')[0];
  assert.deepEqual((await (await send('',null,null,practice)).json()).pilots,[{name:'Piloto Legado',canLogin:0}]);
  assert.equal((await send('/credentials',account,null,practice)).status,401);
  assert.equal((await send('/credentials',account,oldBrowser,practice)).status,200);
  assert.equal((await send('/credentials',{...account,password:'other-password'},oldBrowser,practice)).status,409);
  assert.notEqual(sqlite.prepare('SELECT password_hash FROM practice_drivers').get().password_hash,password);
  assert.equal((await send('/register',{name:'Piloto Outro',invite:'test-only',...account},null,practice)).status,409);
  assert.equal((await send('/login',{...account,password:'wrong-password'},null,practice)).status,401);
  const byLogin=await send('/login',account,null,practice);
  const freshBrowser=cookie(byLogin);
  assert.notEqual(freshBrowser,oldBrowser);
  assert.equal((await byLogin.json()).history[0].ms,65000);
  assert.equal((await send('/setup',{name:'Chuva',setup:validSetup},null,practice)).status,401);
  assert.equal((await send('/setup',{name:'Chuva',setup:{...validSetup,frontWing:20}},oldBrowser,practice)).status,400);
  assert.equal((await send('/setup',{name:'  Volta   Rápida ',setup:validSetup},oldBrowser,practice)).status,200);
  assert.equal((await send('/setup',{name:'Volta Rápida',setup:{...validSetup,frontWing:9}},oldBrowser,practice)).status,200);
  assert.deepEqual((await (await send('',null,freshBrowser,practice)).json()).savedSetups,
    [{name:'Volta Rápida',setup:{...validSetup,frontWing:9}}]);
  const another=await send('/register',{name:'Outro piloto',invite:'test-only',login:'outro-piloto',password},null,practice);
  const spectator=cookie(another);
  assert.deepEqual((await another.json()).savedSetups,[]);
  const bestPractice=crypto.randomUUID(), slowerPractice=crypto.randomUUID();
  const practiceFrames=[[0,100,350,0,0],[63000,101,353,0,10000]];
  for(const [id,ms] of [[slowerPractice,66000],[bestPractice,63000]]){
    assert.equal((await send('/lap',{id,start:true,setup:validSetup},oldBrowser,practice)).status,200);
    assert.equal((await send('/lap',{id,ms,valid:false,replay:[practiceFrames[0],[ms,101,353,0,10000]]},oldBrowser,practice)).status,200);
  }
  const leader=(await (await send('/telemetry',null,spectator,practice)).json()).sessions[0].entries[0];
  assert.equal(leader.best.replayId,bestPractice);
  const watch=`/lap-replay?lap=${bestPractice}&phase=`;
  assert.equal((await send(watch+'practice',null,null,practice)).status,401);
  assert.equal((await send(watch+'qualifying',null,spectator,practice)).status,404);
  const replay=await (await send(watch+'practice',null,spectator,practice)).json();
  assert.equal(replay.name,'Piloto Legado');
  assert.equal(replay.ms,63000);
  assert.deepEqual(JSON.parse(replay.frames),practiceFrames);
  const run={round:'2026-11-22-weekend',phase:'qualifying',driver:'Piloto Legado',attemptId:attempt,setup:validSetup,
    car:makePilotCar(validSetup,'#ffffff',null,'flying'),replayFrames:[],operations:[{not:'trusted'}]};
  assert.equal((await send('/checkpoint',{run,version:0},oldBrowser,qualy)).status,409);
  assert.equal((await send('/lap',{id:attempt,phase:'qualifying',start:true,setup:validSetup},oldBrowser,qualy)).status,200);
  assert.equal((await send('/checkpoint',{run,version:0},oldBrowser,qualy)).status,200);
  const byPilot=await send('/login',{pilot:run.driver,password},null,qualy);
  const fromOtherPc=await (await send('/checkpoint',null,cookie(byPilot),qualy)).json();
  assert.equal(fromOtherPc.version,1);
  assert.equal(fromOtherPc.run.attemptId,attempt);
  assert.deepEqual(fromOtherPc.run.operations,[]);
  assert.equal((await send('/checkpoint',{run,version:0},freshBrowser,qualy)).status,409);
  assert.equal((await send('/logout',{},freshBrowser,qualy)).status,200);
  assert.equal((await (await send('',null,freshBrowser,qualy)).json()).driver,null);
  assert.equal((await send('/lap',{id:attempt,phase:'qualifying',ms:64000,valid:true},oldBrowser,qualy)).status,200);
  assert.equal((await (await send('/checkpoint',null,oldBrowser,qualy)).json()).run,null);
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM practice_drivers').get().count,2);
  sqlite.close();
});

test('invitation, unlimited practice, session limits, retries and deadline',async()=>{
  const {sqlite,env,send}=practiceFixture();
  const password='test-password';
  assert.equal((await send('/register',{name:'Teste',invite:'wrong'})).status,403);
  const register=await send('/register',{name:'Piloto Teste',color:'#aabbcc',invite:'test-only',login:'piloto',password});
  assert.equal(register.status,201);
  const cookie=register.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await send('/register',{name:'piloto teste',invite:'test-only',login:'outro',password})).status,409);
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
  const raceStart=Date.parse('2026-11-25T12:00:00Z');
  const raceEnd=Date.parse('2026-11-25T13:25:17Z');
  assert.equal((await (await send('',null,cookie,qualStart-1)).json()).phase,'practice');
  const afterPractice=await (await send('',null,cookie,qualStart)).json();
  assert.equal(afterPractice.phase,'qualifying');
  assert.equal(afterPractice.used,0);
  assert.equal(afterPractice.sessions[0].board[0].best,87000);
  assert.equal((await send('/lap',{start:true,id:crypto.randomUUID()},cookie,qualStart)).status,410);
  const second=await send('/register',{name:'Mais um',invite:'test-only',login:'mais-um',password},undefined,qualStart);
  assert.equal(second.status,201);
  const secondCookie=second.headers.get('Set-Cookie').split(';')[0];
  const stint=async (sessionCookie,phase,now,times)=>{
    let id=crypto.randomUUID();
    const setup=setupFor('stable');
    const first=await send('/lap',{phase,start:true,id,setup},sessionCookie,now);
    assert.equal(first.status,200);
    assert.equal((await first.json()).attemptId,id);
    const resumed=await (await send('',null,sessionCookie,now)).json();
    assert.equal(resumed.attemptId,id);
    assert.equal(resumed.used,1);
    assert.equal((await send('/lap',{phase,start:true,id:crypto.randomUUID(),setup},sessionCookie,now)).status,409);
    for(const timing of times){
      const nextId=crypto.randomUUID();
      const lap=typeof timing==='number'?{ms:timing,valid:true}:timing;
      const reply=await send('/lap',{phase,id,...lap,nextId},sessionCookie,now);
      assert.equal(reply.status,200);
      const snapshot=await reply.json();
      id=snapshot.attemptId;
      const reopened=await (await send('',null,sessionCookie,now)).json();
      assert.equal(reopened.attemptId,id);
      assert.deepEqual(reopened.history,snapshot.history);
      if(!id)return snapshot;
    }
    assert.fail('Stint should be complete');
  };
  const qualifyReplay=Array.from({length:611},(_,i)=>[i*100,100+i,200,0,Math.round(i/610*10000)]);
  const qualified=await stint(cookie,'qualifying',qualStart,[
    {ms:68000,splits:[19000,44000,68000],valid:true},
    {ms:61000,splits:[21000,43000,61000],valid:true,replay:qualifyReplay},
    {ms:69000,splits:[24000,46000,69000],valid:false},
    67000, 66000, 64000
  ]);
  assert.equal(qualified.used,6);
  assert.equal(qualified.best,61000);
  assert.equal(qualified.history[2].valid,true);
  await stint(secondCookie,'qualifying',qualStart,[65000,62000,65000,66000,64000,63000]);
  const changeQualifyingSetup=sqlite.prepare("UPDATE practice_laps SET setup_json=? WHERE phase='qualifying' AND elapsed_ms=?");
  const pilotSetup=preset=>JSON.stringify(Object.fromEntries(['frontWing','rearWing','antiRoll','brakeBias','rideHeight'].map(id=>[id,setupFor(preset)[id]])));
  changeQualifyingSetup.run(pilotSetup('speed'),62000);
  changeQualifyingSetup.run(pilotSetup('agile'),63000);
  const comparisons=(await (await send('/telemetry',null,secondCookie,qualStart)).json()).sessions[1].entries;
  const first=comparisons.find(e=>!e.me);
  assert.equal(first.best.ms,61000);
  assert.ok(first.best.replayId);
  assert.equal(first.best.setup.rearWing,9);
  assert.equal(first.sectors.reduce((sum,s)=>sum+s.ms,0),59000);
  assert.equal(comparisons.find(e=>e.me).best.ms,62000);
  assert.equal(comparisons.find(e=>e.me).best.replayId,undefined);
  const qualifyPath=`/qualifying-replay?lap=${first.best.replayId}`;
  const recordedQualy=await (await send(qualifyPath,null,secondCookie,qualStart)).json();
  assert.equal(recordedQualy.name,'Piloto Teste');
  assert.equal(recordedQualy.ms,61000);
  assert.deepEqual(JSON.parse(recordedQualy.frames),qualifyReplay);
  assert.equal((await send(qualifyPath,null,undefined,qualStart)).status,401);
  assert.equal((await send('/qualifying-replay?lap=missing',null,cookie,qualStart)).status,404);
  const noShow=await send('/register',{name:'Só classificou',invite:'test-only',login:'so-classificou',password},undefined,qualStart);
  assert.equal(noShow.status,201);
  const noShowCookie=noShow.headers.get('Set-Cookie').split(';')[0];
  await stint(noShowCookie,'qualifying',qualStart,Array(6).fill(61500));
  assert.equal((await (await send('',null,cookie,qualEnd-1)).json()).phase,'qualifying');
  for(const now of [qualEnd,raceStart-1]){
    const gap=await (await send('',null,cookie,now)).json();
    assert.equal(gap.phase,null);
    assert.deepEqual(gap.sessions.map(session=>session.status),['closed','closed','upcoming']);
    assert.equal((await send('/lap',{phase:'race',start:true,id:crypto.randomUUID()},cookie,now)).status,410);
  }
  const race=await (await send('',null,secondCookie,raceStart)).json();
  assert.equal(race.phase,'race');
  assert.equal(race.limit,6);
  assert.equal(race.replayAvailable,false);
  assert.deepEqual(race.grid,{position:3,delay:2600});
  assert.deepEqual(race.lockedSetup,JSON.parse(pilotSetup('speed')));
  const raceCar=makePilotCar(race.lockedSetup,'#ffffff',null,'grid');
  assert.equal(raceCar.model.cdA,makePilotCar(setupFor('speed'),'#ffffff').model.cdA);
  assert.ok(Number.isFinite(raceCar.model.mechanicalGrip));
  assert.equal(race.sessions[1].board[0].best,61000);
  assert.equal((await send('/register',{name:'Novo piloto',invite:'test-only'},undefined,raceStart)).status,410);
  const replay=Array.from({length:601},(_,i)=>[i*100,100+i,200,0,Math.round(i/600*10000)]);
  const finishedRace=await stint(cookie,'race',raceStart,Array(6).fill({ms:60000,valid:false,replay}));
  assert.ok(finishedRace.history.every(lap=>lap.valid));
  await stint(secondCookie,'race',raceStart,Array(6).fill(59900));
  const raceSetups=sqlite.prepare("SELECT DISTINCT setup_json FROM practice_laps WHERE phase='race' AND elapsed_ms=59900").all();
  assert.deepEqual(raceSetups.map(lap=>JSON.parse(lap.setup_json)),[race.lockedSetup]);
  assert.equal((await (await send('',null,cookie,raceEnd-1)).json()).sessions[2].board,undefined);
  for(const now of [raceStart,raceEnd-1]){
    const hidden=await (await send('',null,cookie,now)).json();
    assert.equal(hidden.sessions[2].board,undefined);
    assert.equal(hidden.replayReady,false);
    assert.equal(Date.parse(hidden.replayAt),raceEnd);
    assert.equal((await send('/replay',null,cookie,now)).status,404);
    assert.equal((await send('/replay?grid=1',null,cookie,now)).status,404);
    const telemetry=await (await send('/telemetry',null,cookie,now)).json();
    assert.deepEqual(telemetry.sessions[2].entries,[]);
  }
  const final=await (await send('',null,cookie,raceEnd)).json();
  assert.equal(final.phase,null);
  assert.equal(final.replayReady,true);
  assert.equal(final.replayAvailable,true);
  assert.deepEqual(final.sessions[1].board.map(r=>[r.name,r.position,r.grid]),[
    ['Piloto Teste',1,1],['Só classificou',2,null],['Mais um',3,2]
  ]);
  assert.deepEqual(final.sessions[2].board.map(r=>[r.name,r.grid,r.official]),[['Piloto Teste',1,360000],['Mais um',2,360700]]);
  const finalSecond=await (await send('',null,secondCookie,raceEnd)).json();
  assert.deepEqual(finalSecond.grid,{position:2,delay:1300});
  assert.equal((await send('/lap',{phase:'race',start:true,id:crypto.randomUUID()},cookie,raceEnd)).status,410);
  assert.equal((await send('/replay',null,undefined,raceEnd)).status,401);
  const manifest=await (await send('/replay',null,cookie,raceEnd)).json();
  assert.deepEqual(manifest.drivers.map(d=>[d.name,d.delay,d.official,d.recorded]),[
    ['Piloto Teste',0,360000,6],['Mais um',1300,360700,0]
  ]);
  const playback=await (await send('/replay?grid=1',null,cookie,raceEnd)).json();
  assert.equal(playback.laps.length,6);
  assert.equal(playback.laps[0].valid,1);
  assert.deepEqual(JSON.parse(playback.laps[0].frames),replay);
  const playbackSecond=await (await send('/replay?grid=2',null,cookie,raceEnd)).json();
  assert.equal(playbackSecond.laps[0].ms,59900);
  assert.equal((await send('/replay?grid=3',null,cookie,raceEnd)).status,404);
  assert.equal((await send('/replay?grid=99',null,cookie,raceEnd)).status,404);

  const currentSeries='2026-11-25-red-bull-ring';
  const practiceNow=Date.parse('2026-11-25T16:00:00Z');
  const opened=await (await send('',null,cookie,practiceNow,null)).json();
  assert.equal(opened.round,currentSeries);
  assert.equal(opened.circuit,'red-bull-ring');
  assert.equal(opened.driver.name,'Piloto Teste');
  assert.equal(opened.used,0);
  assert.deepEqual(opened.sessions.map(s=>[s.id,s.limit,s.closesAt]),[
    ['practice',45,'2026-11-26T02:59:59.999Z'],['qualifying',6,'2026-11-27T02:59:59.999Z'],['race',20,'2026-11-28T02:59:59.999Z']
  ]);
  assert.equal((await send('/lap',{phase:'practice',start:true,id:crypto.randomUUID()},cookie,practiceNow,null)).status,409);
  const startPractice=await send('/lap',{phase:'practice',start:true,id:crypto.randomUUID()},cookie,practiceNow,currentSeries);
  let practiceId=(await startPractice.json()).attemptId;
  for(let i=1;i<=45;i++){
    const reply=await send('/lap',{phase:'practice',id:practiceId,ms:60000,valid:true,nextId:crypto.randomUUID()},cookie,practiceNow,currentSeries);
    assert.equal(reply.status,200);
    const snapshot=await reply.json();
    assert.equal(snapshot.history.filter(lap=>lap.ms!=null).length,i);
    practiceId=snapshot.attemptId;
  }
  assert.equal(practiceId,null);
  const capped=await (await send('',null,cookie,practiceNow,currentSeries)).json();
  assert.equal(capped.used,45);
  assert.equal(capped.canStart,false);
  assert.equal((await send('/lap',{phase:'practice',start:true,id:crypto.randomUUID()},cookie,practiceNow,currentSeries)).status,409);
  const unfinishedPractice=crypto.randomUUID();
  assert.equal((await send('/lap',{phase:'practice',start:true,id:unfinishedPractice},secondCookie,practiceNow,currentSeries)).status,200);
  sqlite.prepare("UPDATE practice_laps SET quota_exempt=1 WHERE round_key=? AND phase='practice'").run(currentSeries);
  const reset=await (await send('',null,cookie,practiceNow,currentSeries)).json();
  assert.deepEqual([reset.used,reset.limit,reset.canStart,reset.best],[0,45,true,60000]);
  assert.deepEqual(reset.history,capped.history);
  const resetOther=await (await send('',null,secondCookie,practiceNow,currentSeries)).json();
  assert.deepEqual([resetOther.used,resetOther.attemptId,resetOther.history],[0,null,[]]);
  const continuing=await send('/lap',{phase:'practice',id:unfinishedPractice,ms:60500,nextId:crypto.randomUUID()},secondCookie,practiceNow,currentSeries);
  assert.equal(continuing.status,200);
  assert.equal((await continuing.json()).used,1);
  const freshStart=await send('/lap',{phase:'practice',start:true,id:crypto.randomUUID()},cookie,practiceNow,currentSeries);
  assert.equal(freshStart.status,200);
  assert.equal((await freshStart.json()).used,1);
  assert.equal((await send(qualifyPath,null,cookie,practiceNow,currentSeries)).status,404);
  const archived=await (await send('/replay',null,cookie,practiceNow)).json();
  assert.deepEqual(archived.drivers.map(d=>d.official),manifest.drivers.map(d=>d.official));
  const nextQualy=await (await send('',null,cookie,Date.parse('2026-11-26T03:00:00Z'),currentSeries)).json();
  const nextRace=await (await send('',null,cookie,Date.parse('2026-11-27T03:00:00Z'),currentSeries)).json();
  assert.deepEqual([nextQualy.phase,nextQualy.used,nextRace.phase,nextRace.limit],['qualifying',0,'race',20]);
});

test('Pilotar loads the current series circuit and the archived circuit independently',()=>{
  assert.equal(parseRoute('/pilotar').circuit,'red-bull-ring');
  assert.equal(parseRoute('/pilotar?rodada=2026-11-22-weekend').circuit,'interlagos');
  assert.equal(parseRoute('/assistir/monza').circuit,'monza');
});

test('grid starts in qualifying slots, holds on red and moves automatically on green',()=>{
  // The API stores only the five adjustable Pilotar settings.
  const lockedSetup={frontWing:6,rearWing:9,antiRoll:3,brakeBias:57,rideHeight:45};
  const cars=Array.from({length:6},(_,i)=>makePilotCar(i===1?lockedSetup:setupFor('balanced'),'#ffffff',null,'grid',i+1));
  const stable=makePilotCar(setupFor('stable'),'#ffffff');
  assert.deepEqual(cars[1].model,stable.model);
  assert.equal(cars[0].s,cars[1].s);
  assert.ok(cars[2].s<cars[0].s);
  assert.notEqual(cars[0].y,cars[1].y);
  for(const car of cars){
    const {x,y,s}=car;
    for(let tick=0;tick<GRID_RED_TICKS;tick++)stepPilot(car,{w:true});
    assert.deepEqual([car.x,car.y,car.s,car.v,car.elapsed,car.start],[x,y,s,0,0,null]);
    for(let tick=0;tick<GRID_ASSIST_TICKS;tick++)stepPilot(car,{});
    assert.ok(car.v>0&&car.s>s);
    for(let tick=0;tick<900&&car.start===null;tick++)stepPilot(car,{w:true});
    assert.notEqual(car.start,null);
  }
});

test('race replay interpolates poses and applies grid delay once',()=>{
  const frames=[[0,0,10,3130,0],[100,10,20,-3130,10000]];
  const midpoint=interpolateReplay(frames,50);
  assert.deepEqual([midpoint.x,midpoint.y,midpoint.progress],[5,15,.5]);
  assert.ok(Math.abs(midpoint.angle-Math.PI)<.001);
  const driver={delay:2000,duration:200,official:2200,completed:2,
    laps:[{start:0,end:100,frames},{start:100,end:200,frames}]};
  assert.equal(replayPosition(driver,1999).status,'waiting');
  assert.equal(replayPosition(driver,2050).progress,.5);
  assert.equal(replayPosition(driver,2150).progress,1.5);
  assert.equal(replayPosition(driver,2199).status,'driving');
  assert.equal(replayPosition(driver,2200).status,'finished');
});

test('broadcast detects a sustained pass, timing gaps and valid lap records',()=>{
  function runner(grid,name,delay,times){
    let duration=0;
    const laps=times.map(([ms,valid])=>{
      const start=duration;
      duration+=ms;
      return {start,end:duration,valid,frames:[[0,0,0,0,0],[ms,100,0,0,10000]]};
    });
    return {grid,name,delay,laps,completed:laps.length,duration,official:delay+duration,crossings:timingReference(laps)};
  }
  const first=runner(1,'Verde',0,[[60000,true],[50000,true]]);
  const second=runner(2,'Laranja',2000,[[54000,false],[58000,true]]);
  const at=(time,driver)=>({...driver,...replayPosition(driver,time)});
  assert.ok(Math.abs(replayGap(at(10000,second),at(10000,first),10000)-1111.111)<.01);
  assert.equal(replayGap(at(114000,second),at(114000,first),114000),4000);
  const events=broadcastEvents([first,second],114000);
  const pass=events.find(event=>event.kind==='pass');
  assert.ok(Math.abs(pass.time-20000)<250);
  assert.deepEqual([pass.grid,pass.rivalGrid],[2,1]);
  assert.deepEqual(events.filter(event=>event.kind==='fastest').map(event=>event.ms),[60000,50000]);
  assert.deepEqual(events.filter(event=>event.kind==='finish').map(event=>event.time),[110000,114000]);
});

test('gravel slows the car without teleporting it',()=>{
  const car=makePilotCar(setupFor('balanced'),'#ffffff',null,'flying');
  Object.assign(car,at(car.s,ROAD*.72),{v:30});
  stepPilot(car,{});
  assert.equal(car.off,true);
  const speed=car.v;
  stepPilot(car,{});
  assert.ok(car.v<speed);
  const progress=car.progress;
  Object.assign(car,at(car.s,ROAD*1.6));
  const position={x:car.x,y:car.y};
  stepPilot(car,{});
  assert.equal(car.progress,progress);
  assert.equal(car.off,true);
  const distance=Math.hypot(car.x-position.x,car.y-position.y);
  assert.ok(distance>0&&distance<20);
  assert.ok(car.v>0);

  Object.assign(car,at(car.s+70),{v:30});
  stepPilot(car,{});
  assert.ok(car.progress>progress+65);
});

test('timing reconnects on asphalt and clocks the real S1 and finish crossings',()=>{
  const car=makePilotCar(setupFor('balanced'),'#ffffff',null,'flying');
  const split=length/3;
  Object.assign(car,at(split-8),{s:split-110,progress:split-110,gate:length*3/8,sector:3,
    start:1,elapsed:21,v:26,nextSplit:split});
  for(let i=0;i<22;i++)stepPilot(car,{w:true});
  assert.ok(car.progress>split);
  assert.equal(car.splits.length,1);
  assert.ok(Math.abs(car.splits[0].ms-20000)<600);

  Object.assign(car,at(-110),{s:length-110,progress:length-110,gate:length,sector:8,
    elapsed:63,v:26,nextSplit:length,safeS:length-115,splits:[car.splits[0],{ms:41000}]});
  recoverPilot(car);
  assert.ok(Math.abs(car.progress-(length-115))<.001);
  Object.assign(car,at(-8),{v:26});
  let lap;
  for(let i=0;i<35;i++)lap=stepPilot(car,{w:true})??lap;
  assert.equal(lap.valid,true);
  assert.ok(Math.abs(lap.ms-62000)<600);
  assert.equal(lap.splits.at(-1),lap.ms);
  assert.ok(car.elapsed-car.start<1);
});

test('rejoining beyond a timing line does not fabricate its crossing',()=>{
  const car=makePilotCar(setupFor('balanced'),'#ffffff',null,'flying');
  const split=length/3;
  Object.assign(car,at(split+8),{s:split-110,progress:split-110,gate:length*3/8,sector:3,
    start:1,elapsed:21,v:26,nextSplit:split});
  stepPilot(car,{w:true});
  assert.ok(car.progress>split);
  assert.equal(car.splits[0],null);
  assert.equal(car.nextSplit,length*2/3);

  Object.assign(car,at(8),{s:length-110,progress:length-110,gate:length,sector:8,elapsed:63,v:26});
  assert.equal(stepPilot(car,{w:true}),null);
  assert.equal(car.gate,length+length/8);
  assert.equal(car.start,1);

  Object.assign(car,at(-8),{s:length-8,progress:2*length-8,gate:2*length,sector:8,elapsed:126,v:26});
  let lap;
  for(let i=0;i<35;i++)lap=stepPilot(car,{w:true})??lap;
  assert.equal(lap.valid,true);
  assert.equal(lap.splits,null);
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
