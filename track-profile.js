import {at,length,mod,clamp,nearest,project,CIRCUIT} from './track.js';
import {PIT_LAYOUT} from './pit-layout.js';
export {pitOffset} from './pit-layout.js';
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const STEP=25,profile=[];
for(let s=0;s<length;s+=STEP){
  const a=at(s-65),b=at(s+65),curvature=Math.abs(angleDelta(b.angle,a.angle))/130;
  const speed=clamp(Math.sqrt(210/(curvature+.00008)),150,460);
  profile.push({curvature,speed,type:curvature<.00045?'straight':speed<235?'low':speed<335?'medium':'high'});
}
export function sectionAt(s){return profile[Math.floor(mod(s,length)/STEP)]||profile[0];}
const distanceTo=p=>{const q=project(p);return nearest(q.x,q.y).s;};
// Two arcade DRS zones fitted to the straights of this hand-traced Interlagos.
function straightZones(){
  const runs=[];let start=null;
  // Walk two laps to include the main straight across the timing line.
  for(let s=0;s<=length*2;s+=STEP){const a=at(s-100),b=at(s+100),straight=Math.abs(angleDelta(b.angle,a.angle))<.13;
    if(straight&&start===null)start=s;
    if(!straight&&start!==null){if(s-start>450&&start<length)runs.push({start:mod(start+75,length),end:mod(s-75,length),distance:s-start});start=null;}
  }
  return runs.sort((a,b)=>b.distance-a.distance).slice(0,2).map((r,i)=>({name:`Reta DRS ${i+1}`,start:r.start,end:r.end}));
}
export const DRS_ZONES=CIRCUIT.id==='interlagos'?[{name:'Reta Oposta',start:distanceTo([295,788]),end:distanceTo([1177,1023])},{name:'Reta dos Boxes',start:distanceTo([994,65]),end:distanceTo([195,275])}]:straightZones();
export const inInterval=(s,start,end)=>{s=mod(s,length);return start<end?s>=start&&s<=end:s>=start||s<=end;};
export const drsZoneAt=s=>DRS_ZONES.findIndex(z=>inInterval(s,z.start,z.end));
export function crosses(from,to,marker){if(to<=from)return false;return Math.floor((from-marker)/length)<Math.floor((to-marker)/length);}
export const PIT={entry:PIT_LAYOUT.entry,exit:PIT_LAYOUT.exit};

// Leave enough room to take the final bend before the timing line.
export const FLYING_START=(()=>{
  const runUp=clamp(length*.08,720,1400);
  for(let s=-100;s>=-length*.24;s-=STEP){
    const turn=Math.abs(angleDelta(at(s+85).angle,at(s-85).angle));
    if(turn>.16)return Math.min(-runUp,s-350);
  }
  return -runUp;
})();
export const TIMED_PIT_RELEASE=-length+PIT.exit-270;
