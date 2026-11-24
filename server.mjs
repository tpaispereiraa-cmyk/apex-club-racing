import http from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import {DatabaseSync} from 'node:sqlite';
import {practiceAPI} from './worker/practice-api.js';

const port=Number(process.env.PORT??5173);
const root=new URL('.',import.meta.url);
await mkdir(new URL('artifacts/',root),{recursive:true});
const sqlite=new DatabaseSync(process.env.PRACTICE_LOCAL_DB??fileURLToPath(new URL('artifacts/practice.sqlite',root)));
if (!sqlite.prepare("select name from sqlite_master where name='practice_drivers'").get()) {
  sqlite.exec(await readFile(new URL('drizzle/0000_practice.sql',root),'utf8'));
}
if (!sqlite.prepare('PRAGMA table_info(practice_laps)').all().some(c=>c.name==='splits')) {
  sqlite.exec(await readFile(new URL('drizzle/0001_practice_splits.sql',root),'utf8'));
}
if (!sqlite.prepare('PRAGMA table_info(practice_laps)').all().some(c=>c.name==='round_key')) {
  const migration=await readFile(new URL('drizzle/0002_pilot_weekend.sql',root),'utf8');
  sqlite.exec(`BEGIN;\n${migration}\nCOMMIT;`);
}
if (!sqlite.prepare('PRAGMA table_info(practice_laps)').all().some(c=>c.name==='replay_json')) {
  sqlite.exec(await readFile(new URL('drizzle/0003_race_replay.sql',root),'utf8'));
}
const DB={prepare(sql){const stmt=sqlite.prepare(sql);return{bind(...args){return{
  first:async()=>stmt.get(...args)??null,
  all:async()=>({results:stmt.all(...args)}),
  run:async()=>({meta:{changes:stmt.run(...args).changes}})
};}};}};
const env={DB,PRACTICE_INVITE:process.env.PRACTICE_INVITE??'apex-local',PRACTICE_CLOSES_AT:process.env.PRACTICE_CLOSES_AT};
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',md:'text/plain; charset=utf-8',wav:'audio/wav',ogg:'audio/ogg'};
http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://'+req.headers.host), pathname=decodeURIComponent(url.pathname);
    if(pathname==='/api/practice'||pathname.startsWith('/api/practice/')){
      const body=req.method==='POST'?Readable.toWeb(req):undefined;
      const response=await practiceAPI(new Request(url,{method:req.method,headers:req.headers,body,duplex:body?'half':undefined}),env);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
    }
    const routed=/^\/(circuitos|pilotar|assistir\/[^/]+|jogar-manager\/[^/]+)\/?$/.test(pathname);
    const file=pathname==='/'||routed?'index.html':pathname.slice(1);
    const type=types[file.split('.').pop()];
    if(file.includes('..')||file.includes('\\')||!type||/^(artifacts|sites|worker|drizzle)\//.test(file))throw Error();
    const body=await readFile(new URL(file,root));
    res.setHeader('Content-Type',type);
    res.end(req.method==='HEAD'?undefined:body);
  } catch {
    res.writeHead(404);res.end('Not found');
  }
}).listen(port,'127.0.0.1',()=>console.log('APEX CLUB · http://127.0.0.1:'+port));
