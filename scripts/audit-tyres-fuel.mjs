import {createCareer,prepareEntries} from '../manager/career.js';
import {startingGrid} from '../teams.js';
import {createRace} from '../race-systems.js';
import {createField,simulateField} from '../race-ai.js';
import {CIRCUIT} from '../track.js';
import {mkdir,writeFile} from 'node:fs/promises';
const rows=[];
for(const [label,compound,weather,laps,fuel]of [['soft','soft','dry',4,60],['medium','medium','dry',4,60],['hard','hard','dry',4,60],['inter-rain','inter','rain',4,60],['wet-rain','wet','rain',4,60],['underfuel','medium','dry',8,20],['planned-pit','medium','dry',6,60]]){
  const state=createCareer('cobalto'),own=state.teams.cobalto.cars[0];own.strategy={compound,fuelKg:fuel,stops:label==='planned-pit'?[{lap:3,compound:'hard'}]:[],rules:[]};
  const session=createRace({type:'race',laps,weather,seed:2147}),cars=createField(session,null,prepareEntries(state,startingGrid())).filter(c=>c.team.id==='cobalto'&&c.slot===0),car=cars[0];let elapsed=0;
  while(!car.retired&&car.finishTime===null&&elapsed<3000){elapsed+=1/30;simulateField(cars,1/30,elapsed,session);}
  const row={label,laps:car.lapTimes,best:car.bestLap,fuelUsed:car.manager.fuelUsed,tyreUsed:car.manager.tyreConsumed,remainingTyre:car.tyreLife,pits:car.pitHistory,stock:car.manager.tyreStock,retired:car.retired,reason:car.retirementReason,errors:car.metrics.errors,elapsed};rows.push(row);console.log(JSON.stringify(row));
}
const dir=new URL('../artifacts/manager-audit/',import.meta.url);await mkdir(dir,{recursive:true});await writeFile(new URL(`${CIRCUIT.id}-tyres-fuel.json`,dir),JSON.stringify(rows,null,2));
