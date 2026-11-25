import {at, nearest, mod, clamp, length, ROAD, CIRCUIT} from './track.js';
import {PIT_LAYOUT, pitPoint} from './pit-layout.js';
import {drsZoneAt, FLYING_START} from './track-profile.js';
import {createCareer} from './manager/career.js';
import {defaultSetup, deriveCar, SETUP} from './manager/model.js';
import {physicalForces, unitAdapter} from './manager/race-control.js';
import {GRID_SPACING} from './vehicle-geometry.js';

export const PILOT_SETUP = ['frontWing','rearWing','antiRoll','brakeBias','rideHeight'];
export const PRESETS = {
  balanced:{name:'Equilibrado', description:'Uma base para conhecer a pista.', patch:{}},
  stable:{name:'Mais estabilidade', description:'Traseira mais plantada nas curvas rápidas.', patch:{frontWing:6,rearWing:9,antiRoll:3}},
  speed:{name:'Mais velocidade', description:'Menos arrasto e menos apoio em curva.', patch:{frontWing:2,rearWing:1}},
  agile:{name:'Mais ágil nas curvas', description:'Frente mais pronta para mudar de direção.', patch:{frontWing:9,rearWing:6,antiRoll:7}}
};
export const setupFor = id => ({...defaultSetup(), ...PRESETS[id]?.patch});
export {SETUP};
const units = unitAdapter(length,CIRCUIT.metres);
const fixedStep = 1/60;
export const PILOT_STEP = fixedStep;
export const GRID_RED_TICKS = 180;
export const GRID_ASSIST_TICKS = 72;
const base = createCareer('aurora','APEX Practice');

export function makePilotCar(setup,color,bestSplits=null,startMode='pits',gridPosition=1) {
  base.teams.aurora.cars[0].setup = {...defaultSetup(),...setup};
  const paint=typeof color==='string'?{primary:'#223037',secondary:'#10191c',accent:color,number:1}:color;
  const flying=startMode==='flying';
  const grid=startMode==='grid', onTrack=flying||grid;
  const slot=Math.max(0,gridPosition-1);
  const s=flying?FLYING_START:grid?-80-Math.floor(slot/2)*GRID_SPACING:length+PIT_LAYOUT.exit-270;
  const lane=grid?(slot%2?24:-24):0;
  const pose=onTrack?at(s,lane):pitPoint(s);
  return {...pose, s, pit:!onTrack, v:flying?22:0, steer:0, slip:0, drs:false, off:false,
    team:{color:paint.primary,secondary:paint.secondary,accent:paint.accent,pattern:paint.pattern}, compound:'medium', number:paint.number,
    model:deriveCar(base,'aurora',0), elapsed:0, startMode, progress:onTrack?s:0, sector:onTrack?8:0, gate:0,
    start:null, invalid:false, safeS:s, bestSplits, splits:[], lastSplits:[], nextSplit:null,
    instability:0, spin:0, spinDirection:0, locked:false,
    gridRed:grid?GRID_RED_TICKS:0, gridAssist:grid?GRID_ASSIST_TICKS:0};
}

function timeLap(car, delta) {
  const before = car.progress;
  car.progress += delta;
  if (delta <= 0) return null;
  const crossing = gate => car.elapsed-fixedStep*clamp((car.progress-gate)/Math.max(.001,car.progress-before),0,1);
  if (car.start!==null && car.splits.length<2 && car.progress>=car.nextSplit) {
    car.splits.push(splitAt(car,crossing(car.nextSplit)));
    car.nextSplit+=length/3;
  }
  if (car.progress < car.gate) return null;
  const at = crossing(car.gate);
  if (car.sector < 8) {
    car.sector++;
    car.gate += length/8;
    return null;
  }
  let lap=null;
  if(car.start!==null) {
    car.splits.push(splitAt(car,at));
    car.lastSplits=car.splits.map(s=>({...s,valid:!car.invalid}));
    lap={ms:car.splits[2].ms,valid:!car.invalid,splits:car.splits.map(s=>s.ms)};
    if(lap.valid&&(!car.bestSplits||lap.ms<car.bestSplits[2]))car.bestSplits=lap.splits;
  }
  car.start=at;
  car.splits=[];
  car.nextSplit=car.gate+length/3;
  car.invalid=false;
  car.sector=1;
  car.gate+=length/8;
  return lap;
}

function splitAt(car,time) {
  const ms=Math.round((time-car.start)*1000);
  const reference=car.bestSplits?.[car.splits.length]??null;
  return {ms,delta:reference===null?null:ms-reference,valid:!car.invalid};
}

export function recoverPilot(car, invalidate=true) {
  Object.assign(car,at(car.safeS),{s:car.safeS,v:0,slip:0,steer:0,
    invalid:car.invalid||invalidate,off:false,instability:0,spin:0,locked:false});
}

export function stepPilot(car, keys) {
  if(car.gridRed>0){
    car.gridRed--;
    return null;
  }
  if(car.gridAssist>0){
    car.gridAssist--;
    if(!keys.s)keys={...keys,w:true};
  }
  car.elapsed += fixedStep;
  if (car.pit) {
    const goal = keys.w && !keys.s ? 22 : 0;
    car.v += clamp(goal-car.v,-25*fixedStep,13*fixedStep);
    car.s += units.toWorld(car.v)*fixedStep;
    Object.assign(car,pitPoint(car.s));
    if (car.s>=length+PIT_LAYOUT.exit) {
      car.pit=false;
      car.progress=car.s-length;
      car.gate=length;
      car.sector=8;
      car.safeS=car.s;
    }
    return null;
  }
  const input = Number(!!keys.d)-Number(!!keys.a);
  const {model} = car;
  car.steer += (input-car.steer)*fixedStep*(input?9+model.balance*2:15);
  car.drs = !!keys.e && !!keys.w && !keys.s && !car.off && car.spin===0 && drsZoneAt(car.s)>=0;
  const forces = physicalForces(model,car.v,0,car.drs);
  const brake = 29+model.braking*.12;
  const lateral = model.mechanicalGrip * (18+forces.load/forces.mass) * (car.off?.43:1);
  const yaw = Math.min(car.v*.13,2.35,lateral/Math.max(11,car.v));
  const steerLoad = Math.abs(car.steer)*yaw*car.v/Math.max(1,lateral);
  const grip = clamp(.98-model.balance*.22+model.clA*.018,.82,1.22);
  const speedLoad=.75+car.v/190+Math.max(0,car.v-65)*.014;
  const demand = Math.hypot(steerLoad*speedLoad, keys.s?.92:keys.w?.24:0)/grip;
  car.locked=!!keys.s&&car.v>24&&demand>1.14;
  const excess = car.v<26 ? 0 : Math.max(0,demand-1.08);
  car.instability=clamp(car.instability+fixedStep*(excess*6.5-(excess>0?.14:1.25)),0,1);
  if(car.spin===0&&car.instability>=1&&Math.abs(car.steer)>.36){
    car.spin=1.15;
    car.spinDirection=Math.sign(car.steer);
    car.instability=0;
    car.drs=false;
  }
  const spinning=car.spin>0;
  const accel = ((keys.w&&!keys.s&&!spinning?forces.drive:0)-forces.drag)/forces.mass-.31-(keys.s?brake*(car.locked?.68:1):0);
  car.v = clamp(car.v+accel*fixedStep,0,115);
  if (car.off) car.v *= 1-fixedStep*1.3;
  const turnAuthority = clamp(1+model.balance*.17,.78,1.22);
  car.angle += car.steer*yaw*turnAuthority*(car.locked?.65:1)*fixedStep;
  if(spinning){
    car.spin=Math.max(0,car.spin-fixedStep);
    car.angle+=car.spinDirection*3.3*fixedStep;
    car.v*=1-1.8*fixedStep;
  }
  const slipTarget = -car.steer * clamp((car.v-24)/155,0,.34) * clamp(1.08-model.balance*.65,.65,1.5);
  car.slip += (slipTarget-car.slip)*fixedStep*(5.5+model.clA*.6);
  car.v *= 1-Math.abs(car.steer)*fixedStep*(.11+Math.abs(car.slip)*.46);
  const movement = units.toWorld(car.v)*fixedStep;
  car.x += Math.cos(car.angle+car.slip)*movement;
  car.y += Math.sin(car.angle+car.slip)*movement;
  const p = nearest(car.x,car.y);
  car.off = p.d>ROAD*.5;
  const delta = mod(p.s-car.s+length/2,length)-length/2;
  if (p.d>ROAD*1.45 || Math.abs(delta)>Math.max(20,movement*2.15)) {
    // Restore position without awarding progress or shortcutting the timing gates.
    recoverPilot(car,false);
    return null;
  }
  car.s=p.s;
  if (!car.off && delta>=0) car.safeS=car.s;
  return timeLap(car,delta);
}
