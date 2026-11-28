import {DRS_ZONES,drsZoneAt} from './track-profile.js';
import {length,mod} from './track.js';

export function distanceToDRS(s) {
  return DRS_ZONES.length?Math.min(...DRS_ZONES.map(zone=>mod(zone.start-s,length))):Infinity;
}

export function updatePilotDRS(car,keys) {
  const zone=drsZoneAt(car.s), pressed=!!keys.e;
  const safe=!keys.s&&!car.off&&car.spin===0;
  if(keys.drsToggle){
    if(pressed&&!car.drsPressed)car.drsArmed=!car.drsArmed;
    if(!safe||(car.drsZone>=0&&zone!==car.drsZone))car.drsArmed=false;
    if(zone<0&&distanceToDRS(car.s)>180)car.drsArmed=false;
  }else car.drsArmed=pressed;
  car.drsPressed=pressed;
  car.drsZone=zone;
  return safe&&zone>=0&&!!keys.w&&car.drsArmed;
}
