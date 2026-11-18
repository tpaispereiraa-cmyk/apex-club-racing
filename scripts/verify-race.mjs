import {mkdir,writeFile} from 'node:fs/promises';
import {createField,simulateField,raceOrder} from '../race-ai.js';
import {createRace} from '../race-systems.js';
const results=[];
for(const weather of ['dry','rain','auto']){
  const race=createRace({weather,seed:2026}),cars=createField(race);let elapsed=0,lowSpeed=0,samples=0,drsSamples=0,ersSamples=0;
  while(elapsed<6500&&!cars.every(c=>c.finishTime!==null||c.retired)){
    elapsed+=1/30;simulateField(cars,1/30,elapsed,race);
    for(const c of cars){if(c.drs)drsSamples++;if(c.ers)ersSamples++;if(elapsed>10&&!c.pit&&!c.incident&&!c.fault&&!c.retired&&c.finishTime===null){samples++;if(c.v<70)lowSpeed++;}}
  }
  results.push({weather,seed:2026,elapsed,finished:cars.filter(c=>c.finishTime!==null).length,retired:cars.filter(c=>c.retired).length,pitStops:cars.reduce((s,c)=>s+c.pitStops,0),errors:cars.reduce((s,c)=>s+c.metrics.errors,0),contacts:cars.reduce((s,c)=>s+c.metrics.contacts,0)/2,faults:cars.reduce((s,c)=>s+c.metrics.faults,0),gravel:cars.reduce((s,c)=>s+c.metrics.gravel,0),attacks:cars.reduce((s,c)=>s+c.metrics.attacks,0),defenses:cars.reduce((s,c)=>s+c.metrics.defenses,0),drsSamples,ersSamples,lowSpeedFraction:lowSpeed/samples,classification:raceOrder(cars).map(c=>({number:c.number,driver:c.driver.name,team:c.team.name,time:c.finishTime,retired:c.retired,bestLap:c.bestLap,stops:c.pitStops,tyre:c.compound}))});
}
await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
await writeFile(new URL('../artifacts/simulation-results.json',import.meta.url),JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(({classification,...summary})=>summary),null,2));
if(results.some(r=>r.finished+r.retired!==20||r.drsSamples>0&&r.weather==='rain'))process.exitCode=1;
