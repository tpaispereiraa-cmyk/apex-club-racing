import {at, nearest, mod, clamp, length, ROAD, CIRCUIT} from './track.js';
import {PIT_LAYOUT, pitPoint} from './pit-layout.js';
import {drsZoneAt} from './track-profile.js';
import {createCareer} from './manager/career.js';
import {defaultSetup, deriveCar, SETUP} from './manager/model.js';
import {physicalForces, unitAdapter} from './manager/race-control.js';

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
const base = createCareer('aurora','APEX Practice');

export function makePilotCar(setup,color) {
  base.teams.aurora.cars[0].setup = {...setup};
  const s = PIT_LAYOUT.firstStop;
  return {...pitPoint(s), s, pit:true, v:0, steer:0, slip:0, drs:false, off:false,
    team:{color:'#223037',secondary:'#10191c',accent:color}, compound:'medium', number:1,
    model:deriveCar(base,'aurora',0), elapsed:0, progress:0, sector:0, gate:0,
    start:null, invalid:false, safeS:s};
}

function timeLap(car, delta) {
  const before = car.progress;
  car.progress += delta;
  if (delta <= 0 || car.progress < car.gate) return null;
  const at = car.elapsed - fixedStep * clamp((car.progress-car.gate)/Math.max(.001,car.progress-before),0,1);
  if (car.sector < 8) {
    car.sector++;
    car.gate += length/8;
    return null;
  }
  const lap = car.start === null ? null : {ms:Math.round((at-car.start)*1000),valid:!car.invalid};
  car.start=at;
  car.invalid=false;
  car.sector=1;
  car.gate+=length/8;
  return lap;
}

export function recoverPilot(car) {
  Object.assign(car,at(car.safeS),{s:car.safeS,v:0,slip:0,steer:0,invalid:true,off:false});
}

export function stepPilot(car, keys) {
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
  car.drs = !!keys.e && !!keys.w && !keys.s && !car.off && drsZoneAt(car.s)>=0;
  const forces = physicalForces(model,car.v,0,car.drs);
  const accel = ((keys.w&&!keys.s?forces.drive:0)-forces.drag)/forces.mass-.31-(keys.s?29+model.braking*.12:0);
  car.v = clamp(car.v+accel*fixedStep,0,115);
  if (car.off) car.v *= 1-fixedStep*1.3;
  const lateral = model.mechanicalGrip * (18+forces.load/forces.mass) * (car.off?.43:1);
  const yaw = Math.min(car.v*.13,2.35,lateral/Math.max(11,car.v));
  const turnAuthority = clamp(1+model.balance*.17,.78,1.22);
  car.angle += car.steer*yaw*turnAuthority*fixedStep;
  const slipTarget = -car.steer * clamp((car.v-24)/155,0,.34) * clamp(1.08-model.balance*.65,.65,1.5);
  car.slip += (slipTarget-car.slip)*fixedStep*(5.5+model.clA*.6);
  car.v *= 1-Math.abs(car.steer)*fixedStep*(.11+Math.abs(car.slip)*.46);
  const movement = units.toWorld(car.v)*fixedStep;
  car.x += Math.cos(car.angle+car.slip)*movement;
  car.y += Math.sin(car.angle+car.slip)*movement;
  const p = nearest(car.x,car.y);
  car.off = p.d>ROAD*.5;
  if (p.d>ROAD*.66) car.invalid=true;
  const delta = mod(p.s-car.s+length/2,length)-length/2;
  if (p.d>ROAD*1.45 || Math.abs(delta)>Math.max(20,movement*2.15)) {
    recoverPilot(car);
    return null;
  }
  car.s=p.s;
  if (!car.off && delta>=0) car.safeS=car.s;
  return timeLap(car,delta);
}
