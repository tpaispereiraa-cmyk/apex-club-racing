import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createCareer,dispatchCareer,prepareEntries} from '../manager/career.js';
import {createRace} from '../race-systems.js';
import {createField,simulateField} from '../race-ai.js';
import {startingGrid} from '../teams.js';
import {CIRCUIT} from '../track.js';
import {evaluateSetup} from '../manager/strategy.js';
import {deriveCar} from '../manager/model.js';

const dir=new URL('../artifacts/manager-audit/',import.meta.url);await mkdir(dir,{recursive:true});
let state=process.argv[2]?JSON.parse(await readFile(process.argv[2],'utf8')):createCareer('cobalto','Cobalto · teste de manager');
const issue=(type,args)=>{state=dispatchCareer(state,{id:`audit-${state.revision}`,type,args,actorId:state.ownerId,teamId:state.selectedTeam,revision:state.revision});};
const own=()=>state.teams[state.selectedTeam];
const rows=[];
function run(label,patch={},orders={},seed=2147){
  const s=structuredClone(state),car=s.teams[s.selectedTeam].cars[0];Object.assign(car.setup,patch);Object.assign(car.orders,orders);
  const session=createRace({type:'practice',laps:3,seed,weather:'dry'}),all=createField(session,null,prepareEntries(s,startingGrid()));
  // A single car isolates the causal check from traffic. Actual GPs are played separately in the browser.
  const cars=all.filter(c=>c.team.id===s.selectedTeam&&c.slot===0);cars.race=session;let elapsed=0;
  while(!cars.every(c=>c.retired||c.finishTime!==null)&&elapsed<1800){elapsed+=1/30;simulateField(cars,1/30,elapsed,session);}
  const c=cars[0],model=deriveCar(s,s.selectedTeam,0),result={label,seed,setup:car.setup,best:c.bestLap,laps:c.lapTimes,details:c.lapDetails,errors:c.metrics.errors,contacts:c.metrics.contacts,pitStops:c.pitStops,fuelUsed:c.manager.fuelUsed,tyreConsumed:c.manager.tyreConsumed,forecast:evaluateSetup(s,s.selectedTeam,0).lapSeconds,cdA:model.cdA,clA:model.clA,confidence:model.confidence};
  rows.push(result);console.log(JSON.stringify({label,seed,best:result.best,laps:result.laps,errors:result.errors,pits:result.pitStops,fuel:result.fuelUsed,tyres:result.tyreConsumed,forecast:result.forecast}));return result;
}
for(const seed of [2147,2148]){
  run('baseline',{}, {},seed);run('low-wing',{frontWing:2,rearWing:2},{},seed);run('high-wing',{frontWing:8,rearWing:8},{},seed);run('imbalanced',{frontWing:10,rearWing:0},{},seed);
}
for(const [label,patch]of Object.entries({camberLow:{camber:2},camberHigh:{camber:4},toeLow:{toe:0},toeHigh:{toe:1},brakeFront:{brakeBias:65},brakeRear:{brakeBias:50},rideLow:{rideHeight:25},rideOpt:{rideHeight:43},rideHigh:{rideHeight:65},coolingClosed:{cooling:0},coolingOpen:{cooling:100},rollFront:{antiRoll:10},rollRear:{antiRoll:0}}))run(label,patch);
const original=structuredClone(state);
// Real project, factory lead times and cost; no injected part ratings.
const initialCash=own().cash;
issue('design',{part:'rearWing',focus:'efficiency',engineers:3,cfd:10,tunnel:10});issue('advance',{days:15});
const designId=own().latest.rearWing;issue('manufacture',{designId,quantity:2});issue('advance',{days:4});
const item=Object.values(state.items).find(i=>i.teamId===state.selectedTeam&&i.designId===designId);issue('install',{slot:0,itemId:item.id});
for(const seed of [2147,2148])run('upgrade-rear-wing',{}, {},seed);
state=original;issue('design',{part:'floor',focus:'high',engineers:3,cfd:10,tunnel:10});issue('advance',{days:15});const floorId=own().latest.floor;issue('manufacture',{designId:floorId,quantity:2});issue('advance',{days:4});const floor=Object.values(state.items).find(i=>i.teamId===state.selectedTeam&&i.designId===floorId);issue('install',{slot:0,itemId:floor.id});for(const seed of [2147,2148])run('upgrade-floor',{}, {},seed);
await writeFile(new URL(`${CIRCUIT.id}-controls.json`,dir),JSON.stringify({circuit:CIRCUIT.id,rows,developmentCost:initialCash-own().cash,part:state.designs[floorId],directDevelopmentCost:state.ledger.filter(e=>e.teamId===state.selectedTeam&&['design','manufacture'].includes(e.category)).reduce((n,e)=>n-e.amount,0)},null,2));
