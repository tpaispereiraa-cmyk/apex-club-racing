import {ACTIVE_PILOT_ROUND,pilotRoundById} from '../pilot-rounds.js';
import {hash,randomHex,loginName,validLogin,validPassword,createCredentials,matchesPassword} from './pilot-credentials.js';

const EVENT = 'interlagos-2026-11-21';
const DAY = 86_400_000;
const GRID_STEP = 1300;
const COOKIE = 'apex_practice';
const SESSION_SECONDS = 2592000;
const DRIVER_FIELDS = 'id,name,color,livery,login';
const PATTERNS = ['clean','stripe','chevron','checkers','split','bolt'];
const SETUP_BOUNDS = {frontWing:[0,10],rearWing:[0,10],antiRoll:[0,10],brakeBias:[50,65],rideHeight:[25,65]};
const json = (data, status = 200, headers = {}) => Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const problem = (error, status) => json({error},status);
const row = (db,sql,...args) => db.prepare(sql).bind(...args).first();
const lapId = id => typeof id==='string'&&/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id);
const isColor = value => typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
const nameKey = name => name.toLocaleLowerCase('pt-BR');
const cleanName = value => typeof value==='string'?value.trim().replace(/\s+/g,' ').normalize('NFKC'):'';
const sessionCookie = (url, token, age=SESSION_SECONDS) => ({
  'Set-Cookie':`${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${url.protocol==='https:'?'; Secure':''}`
});

async function signedInDriver(db,tokenHash,now) {
  if(!tokenHash)return null;
  const login=await row(db,'SELECT driver_id FROM practice_sessions WHERE token_hash=? AND expires_at>?',tokenHash,now);
  return row(db,`SELECT ${DRIVER_FIELDS} FROM practice_drivers WHERE id=? AND event_id=?`,login?.driver_id??tokenHash,EVENT);
}

async function allowLogin(db,request,now) {
  const source=await hash(request.headers.get('CF-Connecting-IP')??'local');
  const window=Math.floor(now/600000);
  const record=await row(db,`INSERT INTO practice_login_limits(source,window,attempts) VALUES(?,?,1)
    ON CONFLICT(source) DO UPDATE SET attempts=CASE WHEN window=excluded.window THEN attempts+1 ELSE 1 END,window=excluded.window
    RETURNING attempts`,source,window);
  return record.attempts<=20;
}

const replayTime = race => Date.parse(race.closesAt);

function calendar(round,env,now) {
  const practiceClose=Date.parse(env.PRACTICE_CLOSES_AT);
  return round.sessions.map(([id,name,limit,opensAt,closesAt],i)=>{
    if(Number.isFinite(practiceClose)){
      opensAt=i ? new Date(practiceClose+(i-1)*DAY).toISOString() : null;
      closesAt=new Date(practiceClose+i*DAY).toISOString();
    }
    return {id,name,limit,opensAt,closesAt,
      status:now>=Date.parse(closesAt)?'closed':opensAt&&now<Date.parse(opensAt)?'upcoming':'open'};
  });
}

function liveryOf(driver) {
  return driver.livery?JSON.parse(driver.livery):{primary:'#223037',secondary:'#10191c',accent:driver.color,pattern:'clean',number:1};
}

function parseLivery(value) {
  if(!value||typeof value!=='object')return null;
  const {primary,secondary,accent,pattern,number}=value;
  if(![primary,secondary,accent].every(isColor)||!PATTERNS.includes(pattern)||!Number.isInteger(number)||number<1||number>99)return null;
  return {primary,secondary,accent,pattern,number};
}

function parseSetup(value) {
  if(!value||typeof value!=='object')return null;
  const keys=Object.keys(SETUP_BOUNDS);
  if(!keys.every(key=>Number.isFinite(value[key])&&value[key]>=SETUP_BOUNDS[key][0]&&value[key]<=SETUP_BOUNDS[key][1]))return null;
  return Object.fromEntries(keys.map(key=>[key,value[key]]));
}

async function checkpointAttempt(db,driverId,roundId,phase) {
  const {results:laps}=await db.prepare(`SELECT lap_id,elapsed_ms FROM practice_laps
    WHERE driver_id=? AND round_key=? AND phase=? ORDER BY rowid`).bind(driverId,roundId,phase).all();
  const attemptId=laps.findLast(lap=>lap.elapsed_ms===0)?.lap_id??null;
  return {attemptId,canPause:!!attemptId||!laps.length};
}

async function saveCheckpoint(db,driver,round,session,payload) {
  const {run,version}=payload, car=run?.car;
  if(!run||!Number.isSafeInteger(version)||version<0||run.round!==round.id||run.phase!==session.id||run.driver!==driver.name||
    (run.attemptId!==null&&!lapId(run.attemptId))||!parseSetup(run.setup)||
    ![car?.x,car?.y,car?.s,car?.angle,car?.v,car?.elapsed,car?.model?.cdA,car?.model?.mechanicalGrip].every(Number.isFinite)||
    !Array.isArray(run.replayFrames)||!Array.isArray(car.splits)){
    return problem('Pausa inválida.',400);
  }
  const driverId=driver.id;
  const {attemptId,canPause}=await checkpointAttempt(db,driverId,round.id,session.id);
  if(!canPause||run.attemptId!==attemptId)return problem('As voltas mudaram em outro dispositivo. Recarregue para continuar.',409);
  const snapshot=JSON.stringify({...run,operations:[],operation:null});
  const result=await db.prepare(`INSERT INTO practice_checkpoints(driver_id,round_key,phase,attempt_id,opens_at,version,snapshot)
    SELECT ?,?,?,?,?,1,? WHERE ?=0 OR EXISTS (
      SELECT 1 FROM practice_checkpoints WHERE driver_id=? AND round_key=? AND phase=?
    )
    ON CONFLICT(driver_id,round_key,phase) DO UPDATE SET attempt_id=excluded.attempt_id,opens_at=excluded.opens_at,
    version=practice_checkpoints.version+1,snapshot=excluded.snapshot WHERE practice_checkpoints.version=?`)
    .bind(driverId,round.id,session.id,attemptId,session.opensAt,snapshot,version,driverId,round.id,session.id,version).run();
  if(!result.meta.changes)return problem('Uma pausa mais recente foi salva em outro dispositivo. Recarregue para continuar.',409);
  return json({version:version+1});
}

const findAttempt = (db,roundId,driverId,phase,id) => row(db,'SELECT elapsed_ms,next_lap_id,setup_json FROM practice_laps WHERE driver_id=? AND round_key=? AND phase=? AND lap_id=?',driverId,roundId,phase,id);

async function telemetry(db,driver,selectedRound,env,now,requestedRound) {
  const {results:archive}=await db.prepare('SELECT DISTINCT l.round_key FROM practice_laps l JOIN practice_drivers d ON d.id=l.driver_id WHERE d.event_id=? AND l.valid=1 AND l.elapsed_ms>0 ORDER BY l.round_key DESC').bind(EVENT).all();
  const rounds=[...new Set([ACTIVE_PILOT_ROUND.id,selectedRound.id,...archive.map(lap=>lap.round_key)])];
  const round=requestedRound??selectedRound.id;
  if(!rounds.includes(round))return null;
  const definition=pilotRoundById(round);
  const sessions=calendar(definition??selectedRound,env,now);
  const replayReady=!definition||now>=replayTime(sessions.at(-1));
  const {results}=await db.prepare(`SELECT l.driver_id,d.name,d.color,d.livery,l.phase,l.elapsed_ms,l.splits,
    CASE WHEN l.phase IN ('practice','qualifying') AND l.replay_json IS NOT NULL THEN l.lap_id END AS replay_id,
    coalesce(l.setup_json, CASE WHEN l.phase IN ('qualifying','race') THEN (
      SELECT q.setup_json FROM practice_laps q WHERE q.driver_id=l.driver_id AND q.round_key=l.round_key
      AND q.phase='qualifying' AND q.setup_json IS NOT NULL ORDER BY q.rowid LIMIT 1
    ) END) AS setup_json
    FROM practice_laps l JOIN practice_drivers d ON d.id=l.driver_id
    WHERE d.event_id=? AND l.round_key=? AND l.valid=1 AND l.elapsed_ms>0
    AND (l.phase<>'race' OR ?) ORDER BY l.rowid`).bind(EVENT,round,Number(replayReady)).all();
  const groups=new Map(sessions.map(({id})=>[id,new Map()]));
  for(const lap of results){
    const group=groups.get(lap.phase);
    if(!group)continue;
    if(!group.has(lap.driver_id))group.set(lap.driver_id,{
      name:lap.name,me:lap.driver_id===driver.id,livery:liveryOf(lap),best:null,sectors:[null,null,null]
    });
    const entry=group.get(lap.driver_id);
    const splits=lap.splits?JSON.parse(lap.splits):null;
    const sectors=splits?.map((ms,i)=>ms-(splits[i-1]??0))??null;
    const setup=lap.setup_json?JSON.parse(lap.setup_json):null;
    if(!entry.best||lap.elapsed_ms<entry.best.ms||lap.elapsed_ms===entry.best.ms&&!entry.best.replayId&&lap.replay_id){
      entry.best={ms:lap.elapsed_ms,sectors,setup};
      if(lap.replay_id)entry.best.replayId=lap.replay_id;
    }
    for(const [index,ms] of (sectors??[]).entries()){
      if(!entry.sectors[index]||ms<entry.sectors[index].ms)entry.sectors[index]={ms,setup};
    }
  }
  return {round,rounds,circuit:definition?.circuit??'interlagos',sessions:sessions.map(({id,name,status})=>({
    id,name,status:definition?status:'closed',entries:[...groups.get(id).values()]
  }))};
}

async function reserveAttempt(db,roundId,driverId,{id:phase,limit},id,{first=false,setup=null}={}) {
  // An exclusive phase only accepts a fresh run while its quota is empty.
  const max=first&&phase!=='practice'?1:limit;
  await db.prepare('INSERT INTO practice_laps(driver_id,lap_id,elapsed_ms,valid,round_key,phase,setup_json) SELECT ?,?,0,0,?,?,? WHERE ? IS NULL OR (SELECT count(*) FROM practice_laps WHERE driver_id=? AND round_key=? AND phase=? AND quota_exempt=0) < ? ON CONFLICT(driver_id,lap_id) DO NOTHING')
    .bind(driverId,id,roundId,phase,setup?JSON.stringify(setup):null,max,driverId,roundId,phase,max).run();
  return findAttempt(db,roundId,driverId,phase,id);
}

async function standings(db,roundId,phase) {
  const {results}=await db.prepare(`SELECT d.id, d.name, d.color, d.livery,
    count(CASE WHEN l.quota_exempt=0 OR l.elapsed_ms>0 THEN 1 END) AS used,
    min(CASE WHEN l.valid=1 THEN l.elapsed_ms END) AS best,
    count(CASE WHEN l.elapsed_ms>0 THEN 1 END) AS completed,
    count(CASE WHEN l.elapsed_ms>0 AND l.replay_json IS NOT NULL THEN 1 END) AS recorded,
    sum(CASE WHEN l.elapsed_ms>0 THEN l.elapsed_ms END) AS total
    FROM practice_drivers d LEFT JOIN practice_laps l ON l.driver_id=d.id AND l.round_key=? AND l.phase=?
    WHERE d.event_id=? GROUP BY d.id ORDER BY best IS NULL,best,d.name_key`).bind(roundId,phase,EVENT).all();
  return results;
}

async function raceGrid(db,roundId,qualifying,limit) {
  const started=new Map((await standings(db,roundId,'race')).filter(row=>row.used>0).map(row=>[row.id,row]));
  return qualifying.filter(row=>started.has(row.id)).map(({id},index)=>{
    const driver=started.get(id), delay=index*GRID_STEP;
    return {...driver,grid:index+1,delay,official:driver.completed===limit?driver.total+delay:null};
  });
}

function validReplay(frames,ms) {
  if(!Array.isArray(frames)||frames.length<2||frames.length>Math.ceil(ms/100)+2
    ||frames[0]?.[0]!==0||frames.at(-1)?.[0]!==ms)return false;
  let previous=-1;
  for(const frame of frames){
    if(!Array.isArray(frame)||frame.length!==5||!frame.every(Number.isInteger))return false;
    const [time,x,y,angle,progress]=frame;
    if(time<=previous||Math.abs(x)>100000||Math.abs(y)>100000||Math.abs(angle)>3142||progress<0||progress>10000)return false;
    previous=time;
  }
  return true;
}

async function raceReplay(db,roundId,race,gridPosition) {
  const grid=await raceGrid(db,roundId,await standings(db,roundId,'qualifying'),race.limit);
  if(gridPosition!==null){
    const entry=grid[Number(gridPosition)-1];
    if(!/^[1-9][0-9]*$/.test(gridPosition)||!entry)return problem('Piloto indisponível no replay.',404);
    const {results:laps}=await db.prepare(`SELECT elapsed_ms AS ms,replay_json AS frames,valid
      FROM practice_laps WHERE driver_id=? AND round_key=? AND phase='race' AND elapsed_ms>0 ORDER BY rowid`)
      .bind(entry.id,roundId).all();
    return json({laps});
  }
  const drivers=grid.map(driver=>({name:driver.name,livery:liveryOf(driver),grid:driver.grid,delay:driver.delay,
    completed:driver.completed,official:driver.official,recorded:driver.recorded}));
  return json({limit:race.limit,drivers});
}

async function state(db,round,driver,sessions,now) {
  const roundId=round.id;
  const active=sessions.find(s=>s.status==='open');
  const race=sessions.at(-1), replayAt=replayTime(race), replayReady=now>=replayAt;
  const basic={round:roundId,circuit:round.circuit,phase:active?.id??null,closesAt:(active??race).closesAt,open:!!active,sessions,limit:(active??race).limit,
    replayAt:new Date(replayAt).toISOString(),replayReady};
  if(!driver){
    const {results:pilots}=await db.prepare('SELECT name, login IS NOT NULL AS canLogin FROM practice_drivers WHERE event_id=? ORDER BY name_key').bind(EVENT).all();
    return {...basic,driver:null,pilots};
  }
  const replayAvailable=replayReady&&!!await row(db,`SELECT 1 AS recorded FROM practice_laps l
    JOIN practice_drivers d ON d.id=l.driver_id
    WHERE d.event_id=? AND l.round_key=? AND l.phase='race' AND l.elapsed_ms>0 AND l.replay_json IS NOT NULL LIMIT 1`,EVENT,roundId);
  const {results}=await db.prepare(`SELECT lap_id AS id,phase,elapsed_ms AS ms,valid,splits,setup_json,quota_exempt
    FROM practice_laps WHERE driver_id=? AND round_key=? AND (quota_exempt=0 OR elapsed_ms>0) ORDER BY rowid`).bind(driver.id,roundId).all();
  const byPhase=Object.fromEntries(sessions.map(({id})=>[id,results.filter(l=>l.phase===id)]));
  const bestOf=laps=>laps.filter(l=>l.valid).sort((a,b)=>a.ms-b.ms||Number(!!b.splits)-Number(!!a.splits))[0];
  const activeLaps=byPhase[active?.id??'race'], best=bestOf(activeLaps);
  const used=activeLaps.filter(lap=>!lap.quota_exempt).length;
  const historyRows=laps=>laps.map(({ms,valid,splits})=>({ms:ms||null,valid:!!valid,splits:splits?JSON.parse(splits):null}));
  const qualifyRows=sessions[1].status==='closed'?await standings(db,roundId,'qualifying'):null;
  const finalGrid=replayReady?await raceGrid(db,roundId,qualifyRows,race.limit):null;
  const finalByDriver=finalGrid&&new Map(finalGrid.map(row=>[row.id,row]));
  const gridPos=(finalGrid??qualifyRows)?.findIndex(d=>d.id===driver.id);
  const grid=Number.isInteger(gridPos)&&gridPos>=0?{position:gridPos+1,delay:gridPos*GRID_STEP}:null;
  const locked=byPhase.qualifying.find(l=>l.setup_json);
  const toPublic=({id,livery,recorded,...r})=>r;
  const reports=[];
  for(const session of sessions){
    const report={...session,history:historyRows(byPhase[session.id])};
    if(session.status==='closed'){
      if(session.id==='practice')report.board=(await standings(db,roundId,'practice')).filter(r=>r.used).map(toPublic);
      if(session.id==='qualifying')report.board=qualifyRows.map((r,i)=>{
        const starter=finalByDriver?.get(r.id);
        return {...toPublic(r),position:i+1,grid:finalGrid?starter?.grid??null:i+1,delay:finalGrid?starter?.delay??null:i*GRID_STEP};
      });
      if(session.id==='race'&&replayReady){
        report.board=finalGrid.map(toPublic)
          .sort((a,b)=>(a.official??Infinity)-(b.official??Infinity)||b.completed-a.completed||a.grid-b.grid);
      }
    }
    reports.push(report);
  }
  const {results:savedSetups}=await db.prepare('SELECT name,setup_json FROM practice_saved_setups WHERE driver_id=? ORDER BY name_key').bind(driver.id).all();
  return {...basic,replayAvailable,driver:{name:driver.name,color:driver.color,livery:liveryOf(driver),login:driver.login??null},sessions:reports,
    savedSetups:savedSetups.map(({name,setup_json})=>({name,setup:JSON.parse(setup_json)})),
    used,best:best?.ms??null,bestSplits:best?.splits?JSON.parse(best.splits):null,history:historyRows(activeLaps),
    attemptId:active ? activeLaps.findLast(lap=>lap.ms===0)?.id??null : null,
    canStart:!!active&&(active.id==='practice'?active.limit==null||used<active.limit:used===0),
    grid,lockedSetup:locked?JSON.parse(locked.setup_json):null};
}

export async function practiceAPI(request,env,now=Date.now()) {
  if(!env.DB||!env.PRACTICE_INVITE)return problem('Inscrições temporariamente indisponíveis.',503);
  const url=new URL(request.url), db=env.DB;
  const requestedSeries=url.searchParams.get('series');
  if(!requestedSeries&&request.method==='POST'&&url.pathname==='/api/practice/lap'){
    return problem('Recarregue a página para pilotar na rodada atual.',409);
  }
  const roundId=requestedSeries??ACTIVE_PILOT_ROUND.id, round=pilotRoundById(roundId);
  if(!round)return problem('Rodada indisponível.',404);
  const sessions=calendar(round,env,now), active=sessions.find(s=>s.status==='open'), race=sessions.at(-1);
  const replayReady=now>=replayTime(race);
  const token=request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})(?:;|$)`))?.[1];
  const tokenHash=token?await hash(token):null;
  const driver=await signedInDriver(db,tokenHash,now);
  const current=()=>state(db,round,driver,sessions,now);
  if(request.method==='GET'&&url.pathname==='/api/practice')return json(await current());
  if(request.method==='GET'&&url.pathname==='/api/practice/checkpoint'){
    if(!driver)return problem('Entre no seu carro antes de continuar.',401);
    if(!active||active.id==='practice')return json({version:0,run:null});
    const [previous,{attemptId,canPause}]=await Promise.all([
      row(db,`SELECT version,attempt_id,opens_at,snapshot FROM practice_checkpoints
        WHERE driver_id=? AND round_key=? AND phase=?`,driver.id,roundId,active.id),
      checkpointAttempt(db,driver.id,roundId,active.id)
    ]);
    const usable=canPause&&previous&&previous.attempt_id===attemptId&&previous.opens_at===active.opensAt;
    return json({version:previous?.version??0,run:usable?JSON.parse(previous.snapshot):null});
  }
  if(request.method==='GET'&&url.pathname==='/api/practice/replay'){
    if(!replayReady)return problem('O replay ainda não foi liberado.',404);
    if(!driver)return problem('Entre no seu carro para assistir à corrida.',401);
    return raceReplay(db,roundId,race,url.searchParams.get('grid'));
  }
  if(request.method==='GET'&&url.pathname==='/api/practice/telemetry'){
    if(!driver)return problem('Entre no seu carro para ver o comparativo do GP.',401);
    const report=await telemetry(db,driver,round,env,now,url.searchParams.get('round'));
    return report?json(report):problem('Rodada indisponível.',404);
  }
  if(request.method==='GET'&&['/api/practice/lap-replay','/api/practice/qualifying-replay'].includes(url.pathname)){
    if(!driver)return problem('Entre no seu carro para assistir à volta.',401);
    const lap=url.searchParams.get('lap');
    const phase=url.pathname.endsWith('/qualifying-replay')?'qualifying':url.searchParams.get('phase');
    if(!lapId(lap)||!['practice','qualifying'].includes(phase))return problem('Replay da volta indisponível.',404);
    const record=await row(db,`SELECT d.name,d.color,d.livery,l.elapsed_ms AS ms,l.replay_json AS frames
      FROM practice_laps l JOIN practice_drivers d ON d.id=l.driver_id
      WHERE d.event_id=? AND l.round_key=? AND l.lap_id=? AND l.phase=? AND l.valid=1
      AND l.elapsed_ms>0 AND l.replay_json IS NOT NULL`,EVENT,roundId,lap,phase);
    return record?json({name:record.name,livery:liveryOf(record),ms:record.ms,frames:record.frames})
      :problem('Replay da volta indisponível.',404);
  }
  if(request.method!=='POST')return problem('Rota inexistente.',404);
  const origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin)return problem('Origem da solicitação inválida.',403);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return problem('Formato inválido.',415);
  const bodyLimit=['/api/practice/lap','/api/practice/checkpoint'].includes(url.pathname)?750000:1024;
  if(Number(request.headers.get('Content-Length'))>bodyLimit)return problem('Dados acima do limite.',413);
  const raw=await request.text();
  if(raw.length>bodyLimit)return problem('Dados acima do limite.',413);
  let payload;
  try{payload=JSON.parse(raw);}catch{return problem('Dados inválidos.',400);}
  if(!payload||typeof payload!=='object')return problem('Dados inválidos.',400);

  if(url.pathname==='/api/practice/login'){
    if(driver)return problem('Saia do piloto atual antes de trocar de carro.',409);
    const login=loginName(payload.login), pilot=cleanName(payload.pilot);
    if((pilot?pilot.length>32:!validLogin(login))||!validPassword(payload.password))return problem('Informe o piloto ou login e a senha.',400);
    if(!await allowLogin(db,request,now))return problem('Muitas tentativas. Tente novamente em alguns minutos.',429);
    const account=await row(db,`SELECT ${DRIVER_FIELDS},password_salt,password_hash FROM practice_drivers
      WHERE event_id=? AND ${pilot?'name_key':'login'}=?`,EVENT,pilot?nameKey(pilot):login);
    if(!await matchesPassword(payload.password,account?.password_salt,account?.password_hash)){
      return problem('Piloto, login ou senha incorretos.',401);
    }
    const session=randomHex(32);
    await db.prepare('DELETE FROM practice_sessions WHERE driver_id=? AND expires_at<=?').bind(account.id,now).run();
    await db.prepare('INSERT INTO practice_sessions(token_hash,driver_id,expires_at) VALUES(?,?,?)')
      .bind(await hash(session),account.id,now+SESSION_SECONDS*1000).run();
    return json(await state(db,round,account,sessions,now),200,sessionCookie(url,session));
  }

  const login=loginName(payload.login);

  if(url.pathname==='/api/practice/register'){
    if(driver)return json(await current());
    if(!active||active.id==='race')return problem('As inscrições para este GP encerraram.',410);
    if(payload.invite!==env.PRACTICE_INVITE)return problem('Precisa de um convite válido para entrar.',403);
    const name=cleanName(payload.name);
    if(name.length<2||name.length>32||!/^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._'’-]*$/u.test(name))return problem('Use de 2 a 32 caracteres no nome.',400);
    const livery=payload.livery?parseLivery(payload.livery):null;
    const color=livery?.accent??payload.color??'#d5f561';
    if((payload.livery&&!livery)||!isColor(color))return problem('Pintura inválida.',400);
    if(!validLogin(login)||!validPassword(payload.password))return problem('Escolha um login de 3 a 24 caracteres e uma senha de 6 a 128 caracteres.',400);
    const {salt,digest}=await createCredentials(payload.password);
    const session=randomHex(32), id=await hash(session), stored=livery?JSON.stringify(livery):null;
    const result=await db.prepare(`INSERT INTO practice_drivers(id,event_id,name,name_key,color,livery,login,password_salt,password_hash)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`).bind(id,EVENT,name,nameKey(name),color,stored,login,salt,digest).run();
    if(!result.meta.changes){
      if(await row(db,'SELECT 1 FROM practice_drivers WHERE event_id=? AND name_key=?',EVENT,nameKey(name))){
        return problem('Esse nome já está inscrito. Use Entrar no meu carro ou escolha outro nome.',409);
      }
      return problem('Esse login já está em uso. Escolha outro.',409);
    }
    return json(await state(db,round,{id,name,color,livery:stored,login},sessions,now),201,sessionCookie(url,session));
  }

  if(!driver)return problem('Entre no seu carro antes de continuar.',401);
  if(url.pathname==='/api/practice/credentials'){
    if(driver.login)return problem('Este piloto já tem login cadastrado.',409);
    if(!validLogin(login)||!validPassword(payload.password))return problem('Escolha um login de 3 a 24 caracteres e uma senha de 6 a 128 caracteres.',400);
    const {salt,digest}=await createCredentials(payload.password);
    const result=await db.prepare(`UPDATE practice_drivers SET login=?,password_salt=?,password_hash=?
      WHERE id=? AND login IS NULL AND NOT EXISTS (SELECT 1 FROM practice_drivers WHERE event_id=? AND login=?)`)
      .bind(login,salt,digest,driver.id,EVENT,login).run();
    if(!result.meta.changes)return problem('Esse login já está em uso ou este piloto já cadastrou uma senha.',409);
    return json(await state(db,round,{...driver,login},sessions,now));
  }
  if(url.pathname==='/api/practice/logout'){
    if(!driver.login)return problem('Cadastre um login e uma senha antes de sair.',409);
    await db.prepare('DELETE FROM practice_sessions WHERE token_hash=?').bind(tokenHash).run();
    return json(await state(db,round,null,sessions,now),200,sessionCookie(url,'',0));
  }
  if(url.pathname==='/api/practice/setup'){
    const name=cleanName(payload.name), setup=parseSetup(payload.setup);
    if(!name||name.length>40||!setup)return problem('Informe um nome de até 40 caracteres e um acerto válido.',400);
    const key=nameKey(name);
    const result=await db.prepare(`INSERT INTO practice_saved_setups(driver_id,name_key,name,setup_json) SELECT ?,?,?,?
      WHERE (SELECT count(*) FROM practice_saved_setups WHERE driver_id=?)<30
      OR EXISTS (SELECT 1 FROM practice_saved_setups WHERE driver_id=? AND name_key=?)
      ON CONFLICT(driver_id,name_key) DO UPDATE SET name=excluded.name,setup_json=excluded.setup_json`)
      .bind(driver.id,key,name,JSON.stringify(setup),driver.id,driver.id,key).run();
    if(!result.meta.changes)return problem('Este piloto já tem 30 configurações salvas.',409);
    return json(await current());
  }
  if(url.pathname==='/api/practice/checkpoint'){
    if(!active||active.id==='practice')return problem('A janela dessa sessão encerrou.',410);
    return saveCheckpoint(db,driver,round,active,payload);
  }
  if(url.pathname==='/api/practice/livery'){
    const livery=parseLivery(payload);
    if(!livery)return problem('Pintura inválida.',400);
    const stored=JSON.stringify(livery);
    await db.prepare('UPDATE practice_drivers SET color=?,livery=? WHERE id=?').bind(livery.accent,stored,driver.id).run();
    return json(await state(db,round,{...driver,color:livery.accent,livery:stored},sessions,now));
  }
  if(url.pathname!=='/api/practice/lap')return problem('Rota inexistente.',404);
  const {id,ms,splits,nextId,phase,replay}=payload;
  if(!lapId(id))return problem('Identificador de volta inválido.',400);
  if(!active||phase!==active.id)return problem('A janela dessa sessão encerrou. Consulte o cronograma do GP.',410);
  if(payload.start===true){
    const locked=phase==='race'?await row(db,"SELECT setup_json FROM practice_laps WHERE driver_id=? AND round_key=? AND phase='qualifying' AND setup_json IS NOT NULL ORDER BY rowid LIMIT 1",driver.id,roundId):null;
    const setup=locked?JSON.parse(locked.setup_json):parseSetup(payload.setup);
    if(phase==='qualifying'&&!setup)return problem('Acerto da classificação inválido.',400);
    const attempt=await reserveAttempt(db,roundId,driver.id,active,id,{first:true,setup});
    if(!attempt)return problem(phase==='practice'?'Não foi possível registrar esta tentativa.':'Você já iniciou esta sessão.',409);
    return json({...await current(),attemptId:attempt.elapsed_ms===0?id:null});
  }

  if(!Number.isInteger(ms)||ms<35000||ms>1800000)return problem('Tempo de volta inválido.',400);
  if(nextId!=null&&(!lapId(nextId)||nextId===id))return problem('Próxima volta inválida.',400);
  if(splits!=null&&(!Array.isArray(splits)||splits.length!==3||!splits.every(Number.isSafeInteger)||splits[0]<=0||splits[1]<=splits[0]||splits[2]<=splits[1]||splits[2]!==ms))return problem('Parciais inválidas.',400);
  if(replay!=null&&!validReplay(replay,ms))return problem('Gravação de volta inválida.',400);
  let attempt=await findAttempt(db,roundId,driver.id,phase,id);
  if(!attempt)return problem('Essa tentativa não foi iniciada. Recarregue a página para começar outra volta.',409);
  if(attempt.elapsed_ms===0){
    await db.prepare('UPDATE practice_laps SET elapsed_ms=?,valid=1,splits=?,next_lap_id=?,replay_json=? WHERE driver_id=? AND round_key=? AND phase=? AND lap_id=? AND elapsed_ms=0')
      .bind(ms,splits?JSON.stringify(splits):null,nextId??null,replay?JSON.stringify(replay):null,driver.id,roundId,phase,id).run();
    attempt=await findAttempt(db,roundId,driver.id,phase,id);
  }
  const next=attempt.next_lap_id?await reserveAttempt(db,roundId,driver.id,active,attempt.next_lap_id,{
    setup:attempt.setup_json?JSON.parse(attempt.setup_json):null
  }):null;
  return json({...await current(),attemptId:next?.elapsed_ms===0?attempt.next_lap_id:null});
}
