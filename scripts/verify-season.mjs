import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {CALENDAR,championshipOrder} from '../tournament.js';
import {createManagerController} from '../manager/controller.js';
import assert from 'node:assert/strict';

const folder=new URL('../artifacts/season/',import.meta.url);await mkdir(folder,{recursive:true});
const file=new URL('career.json',folder);const rows=[];
let start=0;
if(process.argv.includes('--resume')){const previous=JSON.parse(await readFile(file,'utf8'));start=previous.round;}
else await writeFile(file,'null');
for(const circuit of CALENDAR.slice(start)){
  const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/verify-season-round.mjs',fileURLToPath(file)],{cwd:new URL('..',import.meta.url),env:{...process.env,RACE_CIRCUIT:circuit}});let output='';child.stdout.on('data',b=>{output+=b;process.stdout.write(b);});child.stderr.on('data',b=>{output+=b;process.stderr.write(b);});child.on('error',reject);child.on('close',code=>resolve({code,output}));});
  assert.equal(result.code,0,`Failed ${circuit}: ${result.output}`);rows.push(JSON.parse(result.output.trim()));
}
let raw=await readFile(file,'utf8');const storage={getItem:()=>raw,setItem:(_,value)=>raw=value};const ctl=createManagerController(storage);
assert.equal(ctl.state.round,14);assert.equal(ctl.state.archives.length,14);
assert.equal(new Set(ctl.state.completedRaces).size,14);
// Exported careers must remain importable after an entire season.
const fresh=createManagerController({getItem:()=>null,setItem:()=>{}});fresh.import(raw);assert.equal(fresh.state.round,14);
const awarded=ctl.state.archives.reduce((total,a)=>total+a.race.results.reduce((n,r)=>n+r.points,0),0);assert.equal(Object.values(ctl.state.teams).reduce((n,t)=>n+t.points,0),awarded);assert.equal(Object.values(ctl.state.driverPoints).reduce((n,d)=>n+d.points,0),awarded);
const standings=championshipOrder(Object.values(ctl.state.teams)).map(t=>({name:t.name,points:t.points}));
const exportBytes=raw.length;const allRounds=ctl.state.archives.filter(a=>a.season===1).map(a=>({round:a.round+1,circuit:a.circuit,laps:a.race.laps,drivers:a.race.results.length,points:a.race.results.reduce((n,r)=>n+r.points,0)}));ctl.command('nextSeason');assert.equal(ctl.state.season,2);assert.equal(ctl.state.round,0);
assert.ok(Object.values(ctl.state.teams).every(t=>t.points===0));
await writeFile(new URL('season-two.json',folder),ctl.export());
await writeFile(new URL('verification.json',folder),JSON.stringify({status:'passed',rounds:allRounds,standings,exportBytes,seasonTwoCreated:true},null,2));
console.log(JSON.stringify({status:'passed',rounds:14,archives:14,exportBytes,champion:standings[0],seasonTwoCreated:true}));
