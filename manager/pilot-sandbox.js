// Executable prototype for a future separate WASD mode. It is intentionally
// not enabled in manager championships: direct driving needs its own rules.
import {at,nearest,ROAD,length,CIRCUIT,clamp} from '../track.js';
import {physicalForces,unitAdapter} from './race-control.js';
export function createPilotVehicle(model,s=0){return{...at(s),s,v:0,steering:0,model,tyreHeat:85,damage:0};}
export function drivePilot(vehicle,input,dt){
  if(!Number.isFinite(dt)||dt<=0||dt>1/15)throw Error('Passo de pilotagem inválido.');
  const keys=['w','a','s','d'];for(const k of Object.keys(input))if(!keys.includes(k)||typeof input[k]!=='boolean')throw Error('Comando de pilotagem inválido.');
  const u=unitAdapter(length,CIRCUIT.metres),throttle=input.w?1:0,brake=input.s?1:0,steer=(input.d?1:0)-(input.a?1:0),forces=physicalForces(vehicle.model,vehicle.v);
  const position=nearest(vehicle.x,vehicle.y),gravel=position.d>ROAD/2;
  vehicle.steering+=(steer*.34-vehicle.steering)*Math.min(1,dt*6);
  const accel=(forces.drive*throttle-forces.drag)/forces.mass-brake*(gravel?9:27);
  vehicle.v=clamp(vehicle.v+accel*dt,0,115);if(gravel)vehicle.v=Math.max(0,vehicle.v-vehicle.v*.8*dt);
  vehicle.angle+=vehicle.v/3.6*Math.tan(vehicle.steering)*dt*clamp(1-vehicle.v/180,.35,1);
  vehicle.x+=Math.cos(vehicle.angle)*u.toWorld(vehicle.v)*dt;vehicle.y+=Math.sin(vehicle.angle)*u.toWorld(vehicle.v)*dt;
  const projected=nearest(vehicle.x,vehicle.y);vehicle.s=projected.s;vehicle.tyreHeat+=(85+Math.abs(steer)*vehicle.v*.25-vehicle.tyreHeat)*dt*.1;
  return vehicle;
}
