const EVENT = 'interlagos-2026-11-21';
const ROUND = '2026-11-22-weekend';
const DAY = 86_400_000;
const GRID_STEP = 1300;
const COOKIE = 'apex_practice';
const PHASES = [
  ['practice','Treino livre',null,null,'2026-11-24T15:00:00.000Z'],
  ['qualifying','Classificação',6,'2026-11-24T15:00:00.000Z','2026-11-24T20:00:00.000Z'],
  ['race','Corrida',6,'2026-11-25T12:00:00.000Z','2026-11-25T13:25:17.000Z']
];
const PATTERNS = ['clean','stripe','chevron','checkers','split','bolt'];
const SETUP_BOUNDS = {frontWing:[0,10],rearWing:[0,10],antiRoll:[0,10],brakeBias:[50,65],rideHeight:[25,65]};
const json = (data, status = 200, headers = {}) => Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const problem = (error, status) => json({error},status);
const hex = bytes => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const hash = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
const row = (db,sql,...args) => db.prepare(sql).bind(...args).first();
const lapId = id => typeof id==='string'&&/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id);
const isColor = value => typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);

const replayTime = race => Date.parse(race.closesAt);

function calendar(env,now) {
  const practiceClose=Date.parse(env.PRACTICE_CLOSES_AT);
  return PHASES.map(([id,name,limit,opensAt,closesAt],i)=>{
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

const findAttempt = (db,driverId,phase,id) => row(db,'SELECT elapsed_ms,next_lap_id,setup_json FROM practice_laps WHERE driver_id=? AND round_key=? AND phase=? AND lap_id=?',driverId,ROUND,phase,id);

async function telemetry(db,driver,sessions,requestedRound,replayReady) {
  const {results:archive}=await db.prepare('SELECT DISTINCT l.round_key FROM practice_laps l JOIN practice_drivers d ON d.id=l.driver_id WHERE d.event_id=? AND l.valid=1 AND l.elapsed_ms>0 ORDER BY l.round_key DESC').bind(EVENT).all();
  const rounds=[...new Set([ROUND,...archive.map(lap=>lap.round_key)])];
  const round=requestedRound??ROUND;
  if(!rounds.includes(round))return null;
  const {results}=await db.prepare(`SELECT l.driver_id,d.name,d.color,d.livery,l.phase,l.elapsed_ms,l.splits,
    CASE WHEN l.phase='qualifying' AND l.replay_json IS NOT NULL THEN l.lap_id END AS replay_id,
    coalesce(l.setup_json, CASE WHEN l.phase IN ('qualifying','race') THEN (
      SELECT q.setup_json FROM practice_laps q WHERE q.driver_id=l.driver_id AND q.round_key=l.round_key
      AND q.phase='qualifying' AND q.setup_json IS NOT NULL ORDER BY q.rowid LIMIT 1
    ) END) AS setup_json
    FROM practice_laps l JOIN practice_drivers d ON d.id=l.driver_id
    WHERE d.event_id=? AND l.round_key=? AND l.valid=1 AND l.elapsed_ms>0
    AND (l.phase<>'race' OR ?) ORDER BY l.rowid`).bind(EVENT,round,Number(round!==ROUND||replayReady)).all();
  const groups=new Map(PHASES.map(([id])=>[id,new Map()]));
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
  return {round,rounds,sessions:sessions.map(({id,name,status})=>({
    id,name,status:round===ROUND?status:'closed',entries:[...groups.get(id).values()]
  }))};
}

async function reserveAttempt(db,driverId,{id:phase,limit},id,{first=false,setup=null}={}) {
  // An exclusive phase only accepts a fresh run while its quota is empty.
  const max=first&&phase!=='practice'?1:limit;
  await db.prepare('INSERT INTO practice_laps(driver_id,lap_id,elapsed_ms,valid,round_key,phase,setup_json) SELECT ?,?,0,0,?,?,? WHERE ? IS NULL OR (SELECT count(*) FROM practice_laps WHERE driver_id=? AND round_key=? AND phase=?) < ? ON CONFLICT(driver_id,lap_id) DO NOTHING')
    .bind(driverId,id,ROUND,phase,setup?JSON.stringify(setup):null,max,driverId,ROUND,phase,max).run();
  return findAttempt(db,driverId,phase,id);
}

async function standings(db,phase) {
  const {results}=await db.prepare(`SELECT d.id, d.name, d.color, d.livery, count(l.lap_id) AS used,
    min(CASE WHEN l.valid=1 THEN l.elapsed_ms END) AS best,
    count(CASE WHEN l.elapsed_ms>0 THEN 1 END) AS completed,
    count(CASE WHEN l.elapsed_ms>0 AND l.replay_json IS NOT NULL THEN 1 END) AS recorded,
    sum(CASE WHEN l.elapsed_ms>0 THEN l.elapsed_ms END) AS total
    FROM practice_drivers d LEFT JOIN practice_laps l ON l.driver_id=d.id AND l.round_key=? AND l.phase=?
    WHERE d.event_id=? GROUP BY d.id ORDER BY best IS NULL,best,d.name_key`).bind(ROUND,phase,EVENT).all();
  return results;
}

async function raceGrid(db,qualifying,limit) {
  const started=new Map((await standings(db,'race')).filter(row=>row.used>0).map(row=>[row.id,row]));
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

async function raceReplay(db,race,gridPosition) {
  const grid=await raceGrid(db,await standings(db,'qualifying'),race.limit);
  if(gridPosition!==null){
    const entry=grid[Number(gridPosition)-1];
    if(!/^[1-9][0-9]*$/.test(gridPosition)||!entry)return problem('Piloto indisponível no replay.',404);
    const {results:laps}=await db.prepare(`SELECT elapsed_ms AS ms,replay_json AS frames,valid
      FROM practice_laps WHERE driver_id=? AND round_key=? AND phase='race' AND elapsed_ms>0 ORDER BY rowid`)
      .bind(entry.id,ROUND).all();
    return json({laps});
  }
  const drivers=grid.map(driver=>({name:driver.name,livery:liveryOf(driver),grid:driver.grid,delay:driver.delay,
    completed:driver.completed,official:driver.official,recorded:driver.recorded}));
  return json({limit:race.limit,drivers});
}

async function state(db,driver,sessions,now) {
  const active=sessions.find(s=>s.status==='open');
  const race=sessions.at(-1), replayAt=replayTime(race), replayReady=now>=replayAt;
  const basic={round:ROUND,phase:active?.id??null,closesAt:(active??race).closesAt,open:!!active,sessions,limit:(active??race).limit,
    replayAt:new Date(replayAt).toISOString(),replayReady};
  if(!driver)return {...basic,driver:null};
  const replayAvailable=replayReady&&!!await row(db,`SELECT 1 AS recorded FROM practice_laps l
    JOIN practice_drivers d ON d.id=l.driver_id
    WHERE d.event_id=? AND l.round_key=? AND l.phase='race' AND l.elapsed_ms>0 AND l.replay_json IS NOT NULL LIMIT 1`,EVENT,ROUND);
  const {results}=await db.prepare('SELECT lap_id AS id,phase,elapsed_ms AS ms,valid,splits,setup_json FROM practice_laps WHERE driver_id=? AND round_key=? ORDER BY rowid').bind(driver.id,ROUND).all();
  const byPhase=Object.fromEntries(sessions.map(({id})=>[id,results.filter(l=>l.phase===id)]));
  const bestOf=laps=>laps.filter(l=>l.valid).sort((a,b)=>a.ms-b.ms||Number(!!b.splits)-Number(!!a.splits))[0];
  const activeLaps=byPhase[active?.id??'race'], best=bestOf(activeLaps);
  const historyRows=laps=>laps.map(({ms,valid,splits})=>({ms:ms||null,valid:!!valid,splits:splits?JSON.parse(splits):null}));
  const qualifyRows=sessions[1].status==='closed'?await standings(db,'qualifying'):null;
  const finalGrid=replayReady?await raceGrid(db,qualifyRows,race.limit):null;
  const finalByDriver=finalGrid&&new Map(finalGrid.map(row=>[row.id,row]));
  const gridPos=(finalGrid??qualifyRows)?.findIndex(d=>d.id===driver.id);
  const grid=Number.isInteger(gridPos)&&gridPos>=0?{position:gridPos+1,delay:gridPos*GRID_STEP}:null;
  const locked=byPhase.qualifying.find(l=>l.setup_json);
  const toPublic=({id,livery,recorded,...r})=>r;
  const reports=[];
  for(const session of sessions){
    const report={...session,history:historyRows(byPhase[session.id])};
    if(session.status==='closed'){
      if(session.id==='practice')report.board=(await standings(db,'practice')).filter(r=>r.used).map(toPublic);
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
  return {...basic,replayAvailable,driver:{name:driver.name,color:driver.color,livery:liveryOf(driver)},sessions:reports,
    used:activeLaps.length,best:best?.ms??null,bestSplits:best?.splits?JSON.parse(best.splits):null,history:historyRows(activeLaps),
    attemptId:active ? activeLaps.findLast(lap=>lap.ms===0)?.id??null : null,
    canStart:!!active&&(active.id==='practice'||activeLaps.length===0),grid,lockedSetup:locked?JSON.parse(locked.setup_json):null};
}

export async function practiceAPI(request,env,now=Date.now()) {
  if(!env.DB||!env.PRACTICE_INVITE)return problem('Inscrições temporariamente indisponíveis.',503);
  const url=new URL(request.url), db=env.DB;
  const sessions=calendar(env,now), active=sessions.find(s=>s.status==='open'), race=sessions.at(-1);
  const replayReady=now>=replayTime(race);
  const token=request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})(?:;|$)`))?.[1];
  const driver=token?await row(db,'SELECT id,name,color,livery FROM practice_drivers WHERE id=? AND event_id=?',await hash(token),EVENT):null;
  const current=()=>state(db,driver,sessions,now);
  if(request.method==='GET'&&url.pathname==='/api/practice')return json(await current());
  if(request.method==='GET'&&url.pathname==='/api/practice/replay'){
    if(!replayReady)return problem('O replay ainda não foi liberado.',404);
    if(!driver)return problem('Use o navegador da sua inscrição para assistir à corrida.',401);
    return raceReplay(db,race,url.searchParams.get('grid'));
  }
  if(request.method==='GET'&&url.pathname==='/api/practice/telemetry'){
    if(!driver)return problem('Use o navegador da sua inscrição para ver o comparativo do GP.',401);
    const report=await telemetry(db,driver,sessions,url.searchParams.get('round'),replayReady);
    return report?json(report):problem('Rodada indisponível.',404);
  }
  if(request.method==='GET'&&url.pathname==='/api/practice/qualifying-replay'){
    if(!driver)return problem('Use o navegador da sua inscrição para assistir à volta.',401);
    const lap=url.searchParams.get('lap');
    if(!lapId(lap))return problem('Replay de classificação indisponível.',404);
    const record=await row(db,`SELECT d.name,d.color,d.livery,l.elapsed_ms AS ms,l.replay_json AS frames
      FROM practice_laps l JOIN practice_drivers d ON d.id=l.driver_id
      WHERE d.event_id=? AND l.lap_id=? AND l.phase='qualifying' AND l.valid=1
      AND l.elapsed_ms>0 AND l.replay_json IS NOT NULL`,EVENT,lap);
    return record?json({name:record.name,livery:liveryOf(record),ms:record.ms,frames:record.frames})
      :problem('Replay de classificação indisponível.',404);
  }
  if(request.method!=='POST')return problem('Rota inexistente.',404);
  const origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin)return problem('Origem da solicitação inválida.',403);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return problem('Formato inválido.',415);
  const bodyLimit=url.pathname==='/api/practice/lap'?750000:1024;
  if(Number(request.headers.get('Content-Length'))>bodyLimit)return problem('Dados acima do limite.',413);
  const raw=await request.text();
  if(raw.length>bodyLimit)return problem('Dados acima do limite.',413);
  let payload;
  try{payload=JSON.parse(raw);}catch{return problem('Dados inválidos.',400);}
  if(!payload||typeof payload!=='object')return problem('Dados inválidos.',400);

  if(url.pathname==='/api/practice/register'){
    if(driver)return json(await current());
    if(!active||active.id==='race')return problem('As inscrições para este GP encerraram.',410);
    if(payload.invite!==env.PRACTICE_INVITE)return problem('Precisa de um convite válido para entrar.',403);
    const name=typeof payload.name==='string'?payload.name.trim().replace(/\s+/g,' ').normalize('NFKC'):'';
    if(name.length<2||name.length>32||!/^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._'’-]*$/u.test(name))return problem('Use de 2 a 32 caracteres no nome.',400);
    const livery=payload.livery?parseLivery(payload.livery):null;
    const color=livery?.accent??payload.color??'#d5f561';
    if((payload.livery&&!livery)||!isColor(color))return problem('Pintura inválida.',400);
    const session=hex(crypto.getRandomValues(new Uint8Array(32))), id=await hash(session), stored=livery?JSON.stringify(livery):null;
    const result=await db.prepare('INSERT INTO practice_drivers(id,event_id,name,name_key,color,livery) VALUES(?,?,?,?,?,?) ON CONFLICT(event_id,name_key) DO NOTHING').bind(id,EVENT,name,name.toLocaleLowerCase('pt-BR'),color,stored).run();
    if(!result.meta.changes)return problem('Esse nome já está inscrito. Use o navegador da inscrição ou escolha outro nome.',409);
    const secure=url.protocol==='https:'?'; Secure':'';
    return json(await state(db,{id,name,color,livery:stored},sessions),201,{'Set-Cookie':`${COOKIE}=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`});
  }

  if(!driver)return problem('Faça a inscrição antes de entrar na pista.',401);
  if(url.pathname==='/api/practice/livery'){
    const livery=parseLivery(payload);
    if(!livery)return problem('Pintura inválida.',400);
    const stored=JSON.stringify(livery);
    await db.prepare('UPDATE practice_drivers SET color=?,livery=? WHERE id=?').bind(livery.accent,stored,driver.id).run();
    return json(await state(db,{...driver,color:livery.accent,livery:stored},sessions));
  }
  if(url.pathname!=='/api/practice/lap')return problem('Rota inexistente.',404);
  const {id,ms,valid,splits,nextId,phase,replay}=payload;
  if(!lapId(id))return problem('Identificador de volta inválido.',400);
  if(!active||phase!==active.id)return problem('A janela dessa sessão encerrou. Consulte o cronograma do GP.',410);
  if(payload.start===true){
    const locked=phase==='race'?await row(db,"SELECT setup_json FROM practice_laps WHERE driver_id=? AND round_key=? AND phase='qualifying' AND setup_json IS NOT NULL ORDER BY rowid LIMIT 1",driver.id,ROUND):null;
    const setup=locked?JSON.parse(locked.setup_json):parseSetup(payload.setup);
    if(phase==='qualifying'&&!setup)return problem('Acerto da classificação inválido.',400);
    const attempt=await reserveAttempt(db,driver.id,active,id,{first:true,setup});
    if(!attempt)return problem(phase==='practice'?'Não foi possível registrar esta tentativa.':'Você já iniciou esta sessão.',409);
    return json({...await current(),attemptId:attempt.elapsed_ms===0?id:null});
  }

  if(!Number.isInteger(ms)||ms<35000||ms>1800000||typeof valid!=='boolean')return problem('Tempo de volta inválido.',400);
  if(nextId!=null&&(!lapId(nextId)||nextId===id))return problem('Próxima volta inválida.',400);
  if(splits!=null&&(!Array.isArray(splits)||splits.length!==3||!splits.every(Number.isSafeInteger)||splits[0]<=0||splits[1]<=splits[0]||splits[2]<=splits[1]||splits[2]!==ms))return problem('Parciais inválidas.',400);
  if(replay!=null&&(!['race','qualifying'].includes(phase)||!validReplay(replay,ms)))return problem('Gravação de volta inválida.',400);
  let attempt=await findAttempt(db,driver.id,phase,id);
  if(!attempt)return problem('Essa tentativa não foi iniciada. Recarregue a página para começar outra volta.',409);
  if(attempt.elapsed_ms===0){
    await db.prepare('UPDATE practice_laps SET elapsed_ms=?,valid=?,splits=?,next_lap_id=?,replay_json=? WHERE driver_id=? AND round_key=? AND phase=? AND lap_id=? AND elapsed_ms=0')
      .bind(ms,Number(valid),splits?JSON.stringify(splits):null,nextId??null,replay?JSON.stringify(replay):null,driver.id,ROUND,phase,id).run();
    attempt=await findAttempt(db,driver.id,phase,id);
  }
  const next=attempt.next_lap_id?await reserveAttempt(db,driver.id,active,attempt.next_lap_id,{
    setup:attempt.setup_json?JSON.parse(attempt.setup_json):null
  }):null;
  return json({...await current(),attemptId:next?.elapsed_ms===0?attempt.next_lap_id:null});
}
