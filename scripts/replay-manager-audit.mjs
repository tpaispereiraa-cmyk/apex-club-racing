import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createManagerController} from '../manager/controller.js';
import {simulateField} from '../race-ai.js';
import {sessionComplete} from '../weekend.js';
import {CIRCUIT,length} from '../track.js';
import {suggestedStrategy} from '../manager/readiness.js';

let raw=await readFile(process.argv[2],'utf8');const ctl=createManagerController({getItem:()=>raw,setItem:(_,v)=>raw=v});
const own=()=>ctl.state.teams.cobalto,find=p=>p.cars.find(c=>c.id==='cobalto-10');
function run(p,until=()=>sessionComplete(p.cars)){let elapsed=p.elapsed??0;while(!until()&&elapsed<8000){elapsed+=1/30;ctl.live(p.session);simulateField(p.cars,1/30,elapsed,p.session);}assert.ok(until());p.elapsed=elapsed;ctl.checkpoint(p.cars,p.session,elapsed);return p;}
if(CIRCUIT.id==='hungaroring'){
  ctl.command('design',{part:'floor',focus:'high',engineers:3,cfd:10,tunnel:10});ctl.command('advance',{days:15});ctl.command('manufacture',{designId:own().latest.floor,quantity:2});ctl.command('advance',{days:4});ctl.command('setup',{slot:0,patch:{camber:3.5,rideHeight:43}});
}
let p=run(ctl.begin());ctl.finishPractice(p.cars);
if(CIRCUIT.id==='monza'){
  ctl.command('setup',{slot:0,patch:{frontWing:2,rearWing:2}});p=run(ctl.begin());ctl.finishPractice(p.cars);ctl.command('setup',{slot:0,patch:{frontWing:8,rearWing:8}});
}else{
  const floor=Object.values(ctl.state.items).find(i=>i.teamId==='cobalto'&&i.designId===own().latest.floor);ctl.command('install',{slot:0,itemId:floor.id});
}
p=run(ctl.begin());ctl.finishPractice(p.cars);p=run(ctl.toQualifying());ctl.completeQualifying(p.cars);
for(const slot of CIRCUIT.id==='monza'?[0]:[0,1]){const plan=suggestedStrategy(CIRCUIT);if(CIRCUIT.id==='monza')plan.fuelKg=118;else if(!own().cars[slot].tyres[plan.compound])plan.compound='hard';ctl.command('strategy',{slot,plan});}
p=ctl.toRace(p.cars);p.session.weather=CIRCUIT.id==='monza'?'auto':'dry';
run(p,()=>find(p).lapTimes.length>=3);
ctl.command('orders',{slot:0,patch:CIRCUIT.id==='monza'?{pace:'conserve',fuel:'save',ers:'harvest'}:{pace:'attack',fuel:'push',ers:'attack'}});
run(p,()=>find(p).lapTimes.length>=6);
ctl.command('orders',{slot:0,patch:CIRCUIT.id==='monza'?{pace:'normal',fuel:'normal',ers:'auto'}:{pace:'conserve',fuel:'save',ers:'harvest'}});
if(CIRCUIT.id==='monza')ctl.command('box',{slot:0,compound:'wet'});
run(p,()=>find(p).lapTimes.length>=(CIRCUIT.id==='monza'?9:12));
if(CIRCUIT.id==='hungaroring')ctl.command('orders',{slot:0,patch:{pace:'normal',fuel:'normal',ers:'auto'}});
run(p);
for(const c of p.cars.filter(c=>c.finishTime!==null)){assert.equal(c.progress,length*p.session.laps);const initial=c.manager.strategy.fuelKg??(10+p.session.laps*3.5)*CIRCUIT.metres/4309;assert.ok(Math.abs(c.manager.fuelUsed-(initial-c.fuel))<1e-6);}
ctl.finish(p.cars);await writeFile(process.argv[3],ctl.export());
const a=ctl.state.archives.at(-1),result={circuit:CIRCUIT.id,finishers:a.race.results.filter(r=>!r.retired).length,maxPits:Math.max(...a.race.results.map(r=>r.pitStops)),elapsed:a.race.elapsed,own:a.race.results.filter(r=>r.teamId==='cobalto').map(r=>({driver:r.driver,position:r.position,fuelUsed:r.fuelUsed,pits:r.pitStops,points:r.points,retired:r.retired})),cash:own().cash,status:'passed'};
await writeFile(process.argv[3]+'.verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
