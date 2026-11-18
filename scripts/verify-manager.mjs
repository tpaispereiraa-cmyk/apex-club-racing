import {raceLaps} from '../tournament.js';
import {configureAIWeekend} from '../manager/ai-manager.js';
import {createCareer,prepareEntries} from '../manager/career.js';
import {createRace} from '../race-systems.js';
import {startingGrid} from '../teams.js';
import {createField,simulateField} from '../race-ai.js';
import {CIRCUIT} from '../track.js';
import {sessionComplete} from '../weekend.js';
import {mkdir,writeFile} from 'node:fs/promises';
const career=configureAIWeekend(createCareer(),{includePlayer:true}),race=createRace({laps:raceLaps(CIRCUIT),seed:2126,weather:process.env.RACE_WEATHER??'dry'}),cars=createField(race,null,prepareEntries(career,startingGrid()));let elapsed=0;
while(elapsed<7500&&!sessionComplete(cars)){elapsed+=1/30;simulateField(cars,1/30,elapsed,race);}
const report={circuit:CIRCUIT.id,weather:race.weather,elapsed,finished:cars.filter(c=>c.finishTime!==null).length,retired:cars.filter(c=>c.retired).length,finite:cars.every(c=>Number.isFinite(c.x)&&Number.isFinite(c.v)),pitStops:cars.reduce((n,c)=>n+c.pitStops,0),contacts:cars.reduce((n,c)=>n+c.metrics.contacts,0)/2};
await mkdir(new URL('../artifacts/manager/',import.meta.url),{recursive:true});await writeFile(new URL(`../artifacts/manager/${CIRCUIT.id}-${race.weather}.json`,import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(!sessionComplete(cars)||!report.finite||report.finished<15)process.exitCode=1;
