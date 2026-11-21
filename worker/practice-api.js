const EVENT = 'interlagos-2026-11-21';
const CLOSE = '2026-11-22T03:00:00.000Z';
const LIMIT = 30;
const COOKIE = 'apex_practice';
const json = (data, status = 200, headers = {}) => Response.json(data, {
  status, headers: {'Cache-Control':'no-store', ...headers}
});
const problem = (error, status) => json({error}, status);
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
const hash = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
const row = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
const lapId = id => typeof id==='string' && /^[a-f0-9-]{36}$/i.test(id);
const findAttempt = (db,driverId,id) => row(db,'SELECT elapsed_ms FROM practice_laps WHERE driver_id=? AND lap_id=?',driverId,id);

async function reserveAttempt(db,driverId,id) {
  // Zero elapsed means the timer started and the attempt has no finish yet.
  await db.prepare('INSERT INTO practice_laps(driver_id,lap_id,elapsed_ms,valid) SELECT ?,?,0,0 WHERE (SELECT count(*) FROM practice_laps WHERE driver_id=?) < ? ON CONFLICT(driver_id,lap_id) DO NOTHING').bind(driverId,id,driverId,LIMIT).run();
  return findAttempt(db,driverId,id);
}

async function state(db, driver, closesAt, open) {
  const basic = {closesAt, open, limit:LIMIT};
  if (!driver) return {...basic, driver:null};
  const {results}=await db.prepare('SELECT elapsed_ms AS ms, valid, splits FROM practice_laps WHERE driver_id=? ORDER BY rowid').bind(driver.id).all();
  const history=results.map(({ms,valid,splits})=>({ms:ms||null,valid:!!valid,splits:splits?JSON.parse(splits):null}));
  const reference=history.filter(lap=>lap.valid).sort((a,b)=>a.ms-b.ms||Number(!!b.splits)-Number(!!a.splits))[0];
  const result = {...basic, driver:{name:driver.name,color:driver.color},used:history.length,best:reference?.ms??null,
    bestSplits:reference?.splits??null,history};
  if (!open) {
    const board = await db.prepare('SELECT d.name, d.color, count(l.lap_id) AS used, min(CASE WHEN l.valid=1 THEN l.elapsed_ms END) AS best FROM practice_drivers d LEFT JOIN practice_laps l ON d.id=l.driver_id WHERE d.event_id=? GROUP BY d.id ORDER BY best IS NULL, best, d.name_key').bind(EVENT).all();
    result.board = board.results;
  }
  return result;
}

export async function practiceAPI(request, env) {
  if (!env.DB || !env.PRACTICE_INVITE) return problem('Inscrições temporariamente indisponíveis.', 503);
  const url = new URL(request.url);
  const closesAt = env.PRACTICE_CLOSES_AT || CLOSE;
  const close = Date.parse(closesAt);
  const open = Date.now() < close;
  const token = request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})(?:;|$)`))?.[1];
  const driver = token ? await row(env.DB, 'SELECT id,name,color FROM practice_drivers WHERE id=? AND event_id=?', await hash(token), EVENT) : null;
  if (request.method === 'GET' && url.pathname === '/api/practice') return json(await state(env.DB,driver,closesAt,open));
  if (request.method !== 'POST') return problem('Rota inexistente.', 404);
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return problem('Origem da solicitação inválida.', 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return problem('Formato inválido.', 415);
  const raw = await request.text();
  if (raw.length > 1024) return problem('Dados acima do limite.', 413);
  let payload;
  try { payload = JSON.parse(raw); } catch { return problem('Dados inválidos.', 400); }
  if (!payload || typeof payload !== 'object') return problem('Dados inválidos.', 400);

  if (url.pathname === '/api/practice/register') {
    if (driver) return json(await state(env.DB,driver,closesAt,open));
    if (!open) return problem('O treino já encerrou.', 410);
    if (payload.invite !== env.PRACTICE_INVITE) return problem('Precisa de um convite válido para entrar.', 403);
    const name = typeof payload.name === 'string' ? payload.name.trim().replace(/\s+/g,' ').normalize('NFKC') : '';
    if (name.length < 2 || name.length > 32 || !/^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._'’-]*$/u.test(name)) return problem('Use de 2 a 32 caracteres no nome.', 400);
    const color = payload.color || '#d5f561';
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return problem('Cor inválida.', 400);
    const session = hex(crypto.getRandomValues(new Uint8Array(32)));
    const id = await hash(session);
    const result = await env.DB.prepare('INSERT INTO practice_drivers(id,event_id,name,name_key,color) VALUES(?,?,?,?,?) ON CONFLICT(event_id,name_key) DO NOTHING').bind(id,EVENT,name,name.toLocaleLowerCase('pt-BR'),color).run();
    if (!result.meta.changes) return problem('Esse nome já está inscrito. Use o navegador da inscrição ou escolha outro nome.', 409);
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    return json(await state(env.DB,{id,name,color},closesAt,true),201,{'Set-Cookie':`${COOKIE}=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`});
  }

  if (url.pathname !== '/api/practice/lap') return problem('Rota inexistente.', 404);
  if (!driver) return problem('Faça a inscrição antes de entrar na pista.', 401);
  const {id, ms, valid, splits, nextId} = payload;
  if (!lapId(id)) return problem('Identificador de volta inválido.',400);
  if (payload.start===true) {
    if (!open) return problem('O treino já encerrou.',410);
    const attempt=await reserveAttempt(env.DB,driver.id,id);
    if (!attempt) return problem('Limite de 30 voltas atingido.',409);
    return json({...await state(env.DB,driver,closesAt,open),attemptId:attempt.elapsed_ms===0?id:null});
  }

  if (!Number.isInteger(ms) || ms < 35000 || ms > 1800000 || typeof valid !== 'boolean') return problem('Tempo de volta inválido.',400);
  if (nextId!=null&&(!lapId(nextId)||nextId===id)) return problem('Próxima volta inválida.',400);
  if (splits!=null&&(!Array.isArray(splits)||splits.length!==3||!splits.every(Number.isSafeInteger)||splits[0]<=0||splits[1]<=splits[0]||splits[2]<=splits[1]||splits[2]!==ms))return problem('Parciais inválidas.',400);
  const attempt=await findAttempt(env.DB,driver.id,id);
  if (!attempt) return problem('Essa tentativa não foi iniciada. Recarregue a página para começar outra volta.',409);
  if (attempt.elapsed_ms===0) {
    if (!open) return problem('O treino encerrou antes de receber essa volta.',410);
    await env.DB.prepare('UPDATE practice_laps SET elapsed_ms=?,valid=?,splits=? WHERE driver_id=? AND lap_id=? AND elapsed_ms=0').bind(ms,Number(valid),splits?JSON.stringify(splits):null,driver.id,id).run();
  }
  const next=nextId&&open?await reserveAttempt(env.DB,driver.id,nextId):null;
  return json({...await state(env.DB,driver,closesAt,open),attemptId:next?.elapsed_ms===0?nextId:null});
}
