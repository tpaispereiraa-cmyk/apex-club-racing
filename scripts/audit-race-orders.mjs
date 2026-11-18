import {createManagerController} from '../manager/controller.js';
import {simulateField} from '../race-ai.js';
import {sessionComplete} from '../weekend.js';
import {CIRCUIT} from '../track.js';
import {mkdir,writeFile} from 'node:fs/promises';

let raw=null;const storage={getItem:()=>raw,setItem:(_,v)=>raw=v};const ctl=createManagerController(storage);ctl.create('cobalto','Cobalto · decisões em pista');ctl.state.calendar=[CIRCUIT.id,...ctl.state.calendar.filter(id=>id!==CIRCUIT.id)];
function run(pack,until=()=>sessionComplete(pack.cars)){pack.session.weather='dry';let elapsed=pack.elapsed??0;while(!until()&&elapsed<7000){elapsed+=1/30;ctl.live(pack.session);simulateField(pack.cars,1/30,elapsed,pack.session);}pack.elapsed=elapsed;ctl.checkpoint(pack.cars,pack.session,elapsed);return pack;}
let p=run(ctl.begin());ctl.finishPractice(p.cars);p=run(ctl.toQualifying());ctl.completeQualifying(p.cars);p=ctl.toRace(p.cars);run(p,()=>p.cars.find(c=>c.team.id==='cobalto'&&c.slot===0).lapTimes.length>=3);
const snapshot=ctl.export(),results=[];
for(const [label,patch]of Object.entries({normal:{pace:'normal',fuel:'normal',ers:'auto'},attack:{pace:'attack',fuel:'push',ers:'attack'},conserve:{pace:'conserve',fuel:'save',ers:'harvest'},paceOnly:{pace:'attack'},fuelOnly:{fuel:'save'},ersOnly:{ers:'harvest'}})){
  let branchRaw=snapshot;const branch=createManagerController({getItem:()=>branchRaw,setItem:(_,v)=>branchRaw=v}),pack=branch.recover(),car=pack.cars.find(c=>c.team.id==='cobalto'&&c.slot===0),before={fuel:car.fuel,tyres:car.tyreLife,totalTyreConsumed:car.manager.tyreConsumed??0,errors:car.metrics.errors,contacts:car.metrics.contacts,pits:car.pitStops,lap:car.lapTimes.length,energy:car.energy},target=before.lap+3;
  branch.command('orders',{slot:0,patch});branch.live(pack.session);let elapsed=pack.elapsed;
  while(car.lapTimes.length<target&&!car.retired&&elapsed<6000){elapsed+=1/30;simulateField(pack.cars,1/30,elapsed,pack.session);}
  const row={label,patch,before,received:car.manager.orders,commandSequence:car.manager.commandSequence,laps:car.lapTimes.slice(before.lap),fuelUsed:before.fuel-car.fuel,tyreUsed:(car.manager.tyreConsumed??0)-before.totalTyreConsumed,energy:car.energy,errors:car.metrics.errors-before.errors,contacts:car.metrics.contacts-before.contacts,pits:car.pitStops-before.pits,frontTemp:car.manager.frontTemp,rearTemp:car.manager.rearTemp};results.push(row);console.log(JSON.stringify(row));
}
const dir=new URL('../artifacts/manager-audit/',import.meta.url);await mkdir(dir,{recursive:true});await writeFile(new URL(`${CIRCUIT.id}-orders.json`,dir),JSON.stringify({circuit:CIRCUIT.id,fromCompletedLap:3,results},null,2));
