import {at,ROAD,clamp,differentLevels} from './track.js';
import {CAR_LENGTH,CAR_WIDTH} from './vehicle-geometry.js';
import {garageFootprint} from './pit-layout.js';
import {contactBetween} from './contact-geometry.js';
import {event,random} from './race-systems.js';
export const FAULT_LABELS={gearbox:'Falha no câmbio',electrical:'Falha elétrica',cooling:'Falha de refrigeração',engine:'Falha no motor',puncture:'Pneu furado'};
export const carFootprint=c=>({...c,halfLength:CAR_LENGTH/2,halfWidth:CAR_WIDTH/2});
export function safeEscapeSide(c){
  const preferred=c.lane>=0?1:-1;
  const roofs=Array.from({length:10},(_,i)=>garageFootprint(i));
  for(const side of [preferred,-preferred]){if([0,50,100,150,200,250,300].every(distance=>{const p=carFootprint(at(c.s+distance,side*(ROAD/2+22)));return !roofs.some(roof=>contactBetween(p,roof));}))return side;}
  return 0;
}
export function retire(c,race,reason){
  if(c.retired||c.finishTime!==null)return;
  c.retired=true;c.retirementTime=race.elapsed;c.retirementReason=reason;c.v=0;c.pit=null;c.pitRequested=false;c.drs=false;c.ers=false;c.status='ABANDONOU';
  Object.assign(c,at(c.s,(safeEscapeSide(c)||1)*(ROAD/2+22)));event(race,c,'abandonou · '+reason,'retirement');
}
export function updateMechanical(c,race,dt){
  if(c.retired||c.finishTime!==null||c.pit)return;
  if(c.manager&&c.fuel<=0){retire(c,race,'combustível esgotado');return;}
  if(c.engineHealth<22||c.damage>92||c.damageParts.suspension>85){retire(c,race,c.engineHealth<22?'motor sem condição de continuar':'danos estruturais');return;}
  if(c.fault)return;
  let type=null;
  if(c.damageParts.suspension>32)type='puncture';
  const rate=.00012+(100-c.team.supplier.durability)*.000005+Math.max(0,c.engineTemp-110)*.0001+Math.max(0,90-c.engineHealth)*.00004;
  if(!type&&c.v>80&&random(race)<1-Math.exp(-rate*dt)){
    const roll=random(race);type=roll<.32?'gearbox':roll<.62?'electrical':roll<.84?'cooling':'engine';
  }
  if(!type&&c.tyreLife<14&&c.v>80&&random(race)<dt*.015)type='puncture';
  if(type){c.fault={type,since:race.elapsed};c.metrics.faults++;event(race,c,FAULT_LABELS[type]+' · precisa de reparo','mechanical');}
}
export function resolveContacts(cars,race){
  race.contacts??={};
  for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
    const a=cars[i],b=cars[j];if(a.retired||b.retired||!a.released||!b.released||a.inGarage||b.inGarage||a.finishTime!==null||b.finishTime!==null||differentLevels(a.s,b.s))continue;
    const key=[a.id,b.id].sort().join('|');
    const pair=race.contacts[key]??={touching:false,nextDamage:0};
    if(Math.hypot(a.x-b.x,a.y-b.y)>CAR_LENGTH+CAR_WIDTH){pair.touching=false;continue;}
    const hit=contactBetween(carFootprint(a),carFootprint(b));if(!hit){pair.touching=false;continue;}
    const applyDamage=!pair.touching&&race.elapsed>=pair.nextDamage;pair.touching=true;
    const relative=Math.hypot(Math.cos(a.angle)*a.v-Math.cos(b.angle)*b.v,Math.sin(a.angle)*a.v-Math.sin(b.angle)*b.v);
    for(const [c,sign] of [[a,-1],[b,1]]){
      if(!c.pit){const move=Math.min(5,hit.depth/2+.1)*sign,dx=hit.x*move,dy=hit.y*move;
        c.s+=dx*Math.cos(c.angle)+dy*Math.sin(c.angle);c.progress=c.s;c.lane=clamp(c.lane-dx*Math.sin(c.angle)+dy*Math.cos(c.angle),-78,78);Object.assign(c,at(c.s,c.lane));}
      if(applyDamage){const front=(Math.cos(c.angle)*hit.x+Math.sin(c.angle)*hit.y)*(-sign)>.3;
        const side=Math.abs(-Math.sin(c.angle)*hit.x+Math.cos(c.angle)*hit.y)>.65;
        const part=side?'suspension':front?'frontWing':'rearWing',damage=clamp(1.5+relative*.085,1.5,32);
        c.damageParts[part]=clamp(c.damageParts[part]+damage,0,100);c.damage=clamp(c.damage+damage*.75,0,100);c.v*=clamp(.92-relative*.0008,.48,.92);c.metrics.contacts++;c.status='CONTATO';c.contactUntil=race.elapsed+2;
      }
    }
    if(applyDamage){pair.nextDamage=race.elapsed+2;event(race,a,`contato com #${b.number} · danos registrados`,'contact');}
  }
}
