import {length} from '../track.js';
export function strategyTelemetry(car,race){
  const samples=[...(car.lapDetails??[]),...(car.lapContext?[{...car.lapContext,lap:(car.lapTimes?.length??0)+1}]:[])].filter(l=>Number.isFinite(l.fuel)&&Number.isFinite(l.lap)).slice(-4);
  const first=samples[0],last=samples.at(-1),fuelPerLap=samples.length>1&&last.lap>first.lap?(first.fuel-last.fuel)/(last.lap-first.lap):null;
  const distance=Number.isFinite(car.progress)?car.progress:car.s;
  const remaining=Math.max(0,race.laps-Math.max(0,distance/length)),age=Math.max(0,(distance-(car.tyreFittedAtS??car.s))/length),wear=100-car.tyreLife;
  const tyreWearPerLap=age>.75&&wear>1?wear/age:null;
  return{fuelPerLap:fuelPerLap>0?fuelPerLap:null,fuelAtFinish:fuelPerLap>0?car.fuel-fuelPerLap*remaining:null,tyreWearPerLap,tyreLapsRemaining:tyreWearPerLap?Math.max(0,(car.tyreLife-10)/tyreWearPerLap):null,remainingLaps:remaining};
}
