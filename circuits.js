import {CIRCUIT_DATA} from './circuit-data.js';
import {parseRoute} from './routes.js';
export const CIRCUITS=[{id:'interlagos',name:'Interlagos',fullName:'Autódromo José Carlos Pace',location:'São Paulo / Brasil',metres:4309,corners:15,theme:'park',description:'Do S do Senna à subida dos boxes.'},...CIRCUIT_DATA];
export const circuitById=id=>CIRCUITS.find(c=>c.id===id)||CIRCUITS[0];
// URL selection reloads the modules together, so physics, pits and scenery
// can never keep the previous circuit's geometry during a session.
const requested=typeof location!=='undefined'?parseRoute(location.href).circuit:globalThis.process?.env?.RACE_CIRCUIT;
export const CIRCUIT=circuitById(requested);
