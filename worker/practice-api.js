const EVENT = 'interlagos-2026-11-21';
const ROUND = '2026-11-21-weekend';
const PRACTICE_CLOSE = '2026-11-22T03:00:00.000Z';
const DAY = 86_400_000;
const GRID_STEP = 2000;
const COOKIE = 'apex_practice';
const PHASES = [['practice','Treino livre',30],['qualifying','Classificação',3],['race','Corrida',12]];
const PATTERNS = ['clean','stripe','chevron','checkers','split','bolt'];
const SETUP_BOUNDS = {frontWing:[0,10],rearWing:[0,10],antiRoll:[0,10],brakeBias:[50,65],rideHeight:[25,65]};
const json = (data, status = 200, headers = {}) => Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const problem = (error, status) => json({error},status);
const hex = bytes => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const hash = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
const row = (db,sql,...args) => db.prepare(sql).bind(...args).first();
const lapId = id => typeof id==='string'&&/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id);
const isColor = value => typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);

function calendar(env,now) {
  const end=Date.parse(env.PRACTICE_CLOSES_AT||PRACTICE_CLOSE);
  return PHASES.map(([id,name,limit],i)=>{
    const open=i?end+(i-1)*DAY:null, close=end+i*DAY;
    return {id,name,limit,opensAt:open===null?null:new Date(open).toISOString(),closesAt:new Date(close).toISOString(),
      status:now>=close?'closed':open!==null&&now<open?'upcoming':'open'};
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

const findAttempt = (db,driverId,phase,id) => row(db,'SELECT elapsed_ms,next_lap_id FROM practice_laps WHERE driver_id=? AND round_key=? AND phase=? AND lap_id=?',driverId,ROUND,phase,id);

async function reserveAttempt(db,driverId,{id:phase,limit},id,{first=false,setup=null}={}) {
  // An exclusive phase only accepts a fresh run while its quota is empty.
  const max=first&&phase!=='practice'?1:limit;
  await db.prepare('INSERT INTO practice_laps(driver_id,lap_id,elapsed_ms,valid,round_key,phase,setup_json) SELECT ?,?,0,0,?,?,? WHERE (SELECT count(*) FROM practice_laps WHERE driver_id=? AND round_key=? AND phase=?) < ? ON CONFLICT(driver_id,lap_id) DO NOTHING')
    .bind(driverId,id,ROUND,phase,setup?JSON.stringify(setup):null,driverId,ROUND,phase,max).run();
  return findAttempt(db,driverId,phase,id);
}

async function standings(db,phase) {
  const {results}=await db.prepare(`SELECT d.id, d.name, d.color, count(l.lap_id) AS used,
    min(CASE WHEN l.valid=1 THEN l.elapsed_ms END) AS best,
    count(CASE WHEN l.elapsed_ms>0 THEN 1 END) AS completed,
    sum(CASE WHEN l.elapsed_ms>0 THEN l.elapsed_ms END) AS total
    FROM practice_drivers d LEFT JOIN practice_laps l ON l.driver_id=d.id AND l.round_key=? AND l.phase=?
    WHERE d.event_id=? GROUP BY d.id ORDER BY best IS NULL,best,d.name_key`).bind(ROUND,phase,EVENT).all();
  return results;
}

async function state(db,driver,sessions) {
  const active=sessions.find(s=>s.status==='open');
  const basic={phase:active?.id??null,closesAt:(active??sessions.at(-1)).closesAt,open:!!active,sessions,limit:active?.limit??12};
  if(!driver)return {...basic,driver:null};
  const {results}=await db.prepare('SELECT phase,elapsed_ms AS ms,valid,splits,setup_json FROM practice_laps WHERE driver_id=? AND round_key=? ORDER BY rowid').bind(driver.id,ROUND).all();
  const byPhase=Object.fromEntries(sessions.map(({id})=>[id,results.filter(l=>l.phase===id)]));
  const bestOf=laps=>laps.filter(l=>l.valid).sort((a,b)=>a.ms-b.ms||Number(!!b.splits)-Number(!!a.splits))[0];
  const activeLaps=byPhase[active?.id??'race'], best=bestOf(activeLaps);
  const historyRows=laps=>laps.map(({ms,valid,splits})=>({ms:ms||null,valid:!!valid,splits:splits?JSON.parse(splits):null}));
  const qualifyRows=sessions[1].status==='closed'?await standings(db,'qualifying'):null;
  const gridPos=qualifyRows?.findIndex(d=>d.id===driver.id);
  const grid=Number.isInteger(gridPos)&&gridPos>=0?{position:gridPos+1,delay:gridPos*GRID_STEP}:null;
  const locked=byPhase.qualifying.find(l=>l.setup_json);
  const toPublic=({id,...r})=>r;
  const reports=[];
  for(const session of sessions){
    const report={...session,history:historyRows(byPhase[session.id])};
    if(session.status==='closed'){
      if(session.id==='practice')report.board=(await standings(db,'practice')).filter(r=>r.used).map(toPublic);
      if(session.id==='qualifying')report.board=qualifyRows.map((r,i)=>({...toPublic(r),position:i+1,delay:i*GRID_STEP}));
      if(session.id==='race'){
        const positions=new Map(qualifyRows.map((r,i)=>[r.id,i]));
        report.board=(await standings(db,'race')).map(r=>{
          const i=positions.get(r.id), delay=i*GRID_STEP;
          return {...toPublic(r),grid:i+1,delay,official:r.completed===session.limit?r.total+delay:null};
        }).sort((a,b)=>(a.official??Infinity)-(b.official??Infinity)||b.completed-a.completed||a.grid-b.grid);
      }
    }
    reports.push(report);
  }
  return {...basic,driver:{name:driver.name,color:driver.color,livery:liveryOf(driver)},sessions:reports,
    used:activeLaps.length,best:best?.ms??null,bestSplits:best?.splits?JSON.parse(best.splits):null,history:historyRows(activeLaps),
    canStart:!!active&&activeLaps.length<(active.id==='practice'?active.limit:1),grid,lockedSetup:locked?JSON.parse(locked.setup_json):null};
}

export async function practiceAPI(request,env,now=Date.now()) {
  if(!env.DB||!env.PRACTICE_INVITE)return problem('Inscrições temporariamente indisponíveis.',503);
  const url=new URL(request.url), db=env.DB;
  const sessions=calendar(env,now), active=sessions.find(s=>s.status==='open');
  const token=request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})(?:;|$)`))?.[1];
  const driver=token?await row(db,'SELECT id,name,color,livery FROM practice_drivers WHERE id=? AND event_id=?',await hash(token),EVENT):null;
  const current=()=>state(db,driver,sessions);
  if(request.method==='GET'&&url.pathname==='/api/practice')return json(await current());
  if(request.method!=='POST')return problem('Rota inexistente.',404);
  const origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin)return problem('Origem da solicitação inválida.',403);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return problem('Formato inválido.',415);
  const raw=await request.text();
  if(raw.length>1024)return problem('Dados acima do limite.',413);
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
  const {id,ms,valid,splits,nextId,phase}=payload;
  if(!lapId(id))return problem('Identificador de volta inválido.',400);
  if(!active||phase!==active.id)return problem('A janela dessa sessão encerrou. Consulte o cronograma do GP.',410);
  if(payload.start===true){
    const setup=phase==='qualifying'?parseSetup(payload.setup):null;
    if(phase==='qualifying'&&!setup)return problem('Acerto da classificação inválido.',400);
    const attempt=await reserveAttempt(db,driver.id,active,id,{first:true,setup});
    if(!attempt)return problem(phase==='practice'?'Limite de 30 tentativas atingido.':'Você já iniciou esta sessão.',409);
    return json({...await current(),attemptId:attempt.elapsed_ms===0?id:null});
  }

  if(!Number.isInteger(ms)||ms<35000||ms>1800000||typeof valid!=='boolean')return problem('Tempo de volta inválido.',400);
  if(nextId!=null&&(!lapId(nextId)||nextId===id))return problem('Próxima volta inválida.',400);
  if(splits!=null&&(!Array.isArray(splits)||splits.length!==3||!splits.every(Number.isSafeInteger)||splits[0]<=0||splits[1]<=splits[0]||splits[2]<=splits[1]||splits[2]!==ms))return problem('Parciais inválidas.',400);
  let attempt=await findAttempt(db,driver.id,phase,id);
  if(!attempt)return problem('Essa tentativa não foi iniciada. Recarregue a página para começar outra volta.',409);
  if(attempt.elapsed_ms===0){
    await db.prepare('UPDATE practice_laps SET elapsed_ms=?,valid=?,splits=?,next_lap_id=? WHERE driver_id=? AND round_key=? AND phase=? AND lap_id=? AND elapsed_ms=0')
      .bind(ms,Number(valid),splits?JSON.stringify(splits):null,nextId??null,driver.id,ROUND,phase,id).run();
    attempt=await findAttempt(db,driver.id,phase,id);
  }
  const next=attempt.next_lap_id?await reserveAttempt(db,driver.id,active,attempt.next_lap_id):null;
  return json({...await current(),attemptId:next?.elapsed_ms===0?attempt.next_lap_id:null});
}
