import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createManagerController} from '../manager/controller.js';
import {simulateField} from '../race-ai.js';
import {sessionComplete} from '../weekend.js';
import {CIRCUIT} from '../track.js';
import {raceLaps} from '../tournament.js';
import {deriveCar} from '../manager/model.js';

const file=process.argv[2];let raw;try{raw=await readFile(file,'utf8');if(raw==='null')raw=undefined;}catch{}
const storage={getItem:()=>raw??null,setItem:(_,value)=>{raw=value;}};
const ctl=createManagerController(storage);
if(!ctl.state){assert.equal(ctl.error,'');ctl.create('aurora','Temporada de validação');}
assert.equal(ctl.state.calendar[ctl.state.round],CIRCUIT.id);
const before=ctl.state.round;
// Routine player decisions, using the same commands as the workshop.
for(const car of ctl.state.teams[ctl.state.selectedTeam].cars){
  if((car.powerUnit?.condition??100)<80)ctl.command('replacePowerUnit',{slot:car.slot});
  for(const itemId of Object.values(car.loadout)){
    const item=ctl.state.items[itemId];
    if(item.condition>0&&item.condition<Math.max(40,100-item.km/150)-1)ctl.command('repair',{itemId});
  }
  deriveCar(ctl.state,ctl.state.selectedTeam,car.slot);
}
function run(pack){let elapsed=pack.elapsed??0;while(elapsed<12000&&!sessionComplete(pack.cars)){elapsed+=1/30;ctl.live(pack.session);simulateField(pack.cars,1/30,elapsed,pack.session);}assert.ok(sessionComplete(pack.cars),`Session stalled: ${CIRCUIT.id}/${pack.session.type}`);ctl.checkpoint(pack.cars,pack.session,elapsed);return pack;}
let pack=run(ctl.begin());ctl.finishPractice(pack.cars);
pack=run(ctl.toQualifying());ctl.completeQualifying(pack.cars);
pack=run(ctl.toRace(pack.cars));ctl.finish(pack.cars);
assert.equal(ctl.state.round,before+1);assert.equal(ctl.state.active,null);
assert.equal(ctl.state.archives.filter(a=>a.season===ctl.state.season).length,before+1);
const report=ctl.state.archives.at(-1),results=report.race.results;
assert.equal(report.circuit,CIRCUIT.id);assert.equal(results.length,20);
assert.ok(results.every(r=>r.retired||r.lapTimes.length===raceLaps(CIRCUIT)));
const restored=createManagerController(storage);assert.equal(restored.error,'');assert.equal(restored.state.round,before+1);
await writeFile(file,ctl.export());
console.log(JSON.stringify({round:before+1,circuit:CIRCUIT.id,laps:report.race.laps,finishers:results.filter(r=>!r.retired).length,points:results.reduce((n,r)=>n+r.points,0),cash:ctl.state.teams.aurora.cash,bytes:ctl.export().length}));

