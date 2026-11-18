import {mkdir,writeFile} from 'node:fs/promises';
import {createRace} from '../race-systems.js';
import {createField,simulateField} from '../race-ai.js';
const summaries=[];
for(const seed of [2026,2027,2028,2029,2030]){
  const race=createRace({seed,weather:'dry'}),cars=createField(race),samples=[],perCar={};let clipped=0,stopped=0;
  for(let t=1/30;t<24;t+=1/30){simulateField(cars,1/30,t,race);for(const c of cars){if(t<2||c.incident||c.pit||c.retired)continue;
    const p=perCar[c.number]??={number:c.number,minSpeed:Infinity,zeroFrames:0,hardClips:0};p.minSpeed=Math.min(p.minSpeed,c.v*.57);
    if(c.telemetry.blockingCar){clipped++;p.hardClips++;}
    if(c.v<1){stopped++;p.zeroFrames++;if(samples.length<8)samples.push({time:t,number:c.number,s:c.s,lane:c.lane,speed:c.v,...c.telemetry});}
  }}summaries.push({seed,stoppedFrames:stopped,hardClippedFrames:clipped,perCar:Object.values(perCar),samples});
}
await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
await writeFile(new URL('../artifacts/start-diagnostic.json',import.meta.url),JSON.stringify(summaries,null,2));
console.log(JSON.stringify(summaries.map(r=>({seed:r.seed,stoppedFrames:r.stoppedFrames,hardClippedFrames:r.hardClippedFrames,first:r.samples[0]})),null,2));
