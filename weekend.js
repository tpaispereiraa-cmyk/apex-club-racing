import {createRace} from './race-systems.js';
import {createField} from './race-ai.js';
import {CIRCUIT} from './track.js';
import {raceLaps,PRACTICE_LAPS} from './tournament.js';
export const QUALIFYING_LAPS=2,RACE_LAPS=raceLaps(CIRCUIT);
export const sessionComplete=cars=>cars.every(c=>c.finishTime!==null||c.retired);
export function qualifyingOrder(cars){return[...cars].sort((a,b)=>(a.bestLap-b.bestLap)||(a.number-b.number));}
export function qualifyingResults(cars){return qualifyingOrder(cars).map((c,grid)=>({id:c.id,number:c.number,driver:c.driver,team:c.team,grid,bestLap:c.bestLap,lapTimes:[...c.lapTimes],sectorTiming:structuredClone(c.sectorTiming??null),retired:c.retired}));}
export function qualifyingSession(seed=2026){const session=createRace({seed,type:'qualifying',laps:QUALIFYING_LAPS,weather:'dry'});return{session,cars:createField(session)};}
export function practiceSession(seed=2026,entries=null){const session=createRace({seed,type:'practice',laps:PRACTICE_LAPS,weather:'dry'});return{session,cars:createField(session,null,entries)};}
export function raceSession(results,seed=2026){
  if(results.length!==20||new Set(results.map(r=>r.id)).size!==20)throw new Error('O grid precisa das vinte entradas da classificação.');
  const session=createRace({seed,type:'race',laps:RACE_LAPS,weather:'auto'});
  return{session,cars:createField(session,results)};
}
