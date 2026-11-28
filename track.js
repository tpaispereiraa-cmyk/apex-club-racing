import * as interlagos from './interlagos.js';
import {CIRCUIT} from './circuits.js';
import {makeGeometry} from './circuit-geometry.js';
export {CIRCUIT} from './circuits.js';
export const mod=(n,m)=>(n%m+m)%m;
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const geometry=CIRCUIT.id==='interlagos'?interlagos:makeGeometry(CIRCUIT);
export const {W,H,path,length,at,nearest,nodes}=geometry;
export const ROAD=CIRCUIT.id==='monaco'?78:104;
export const CURB=12;
export const project=interlagos.project;
export const landmarks=CIRCUIT.id==='interlagos'?interlagos.landmarks:[];
// Suzuka's crossing has two separate road levels. Nearby cars on the other
// leg must not collide, and the lower leg disappears underneath the bridge.
export const BRIDGES=[];
if(CIRCUIT.id==='suzuka'){
  for(let i=0;i<path.length;i++)for(let j=i+30;j<path.length;j++){
    const a=path[i],b=path[(i+1)%path.length],c=path[j],d=path[(j+1)%path.length];
    if(length-(c.s-a.s)<250)continue;
    if(Math.abs(a.x-c.x)>30||Math.abs(a.y-c.y)>30)continue;
    const dx=b.x-a.x,dy=b.y-a.y,ex=d.x-c.x,ey=d.y-c.y,den=dx*ey-dy*ex;
    if(Math.abs(den)<.0001)continue;
    const t=((c.x-a.x)*ey-(c.y-a.y)*ex)/den,u=((c.x-a.x)*dy-(c.y-a.y)*dx)/den;
    if(t>=0&&t<=1&&u>=0&&u<=1)BRIDGES.push({upper:c.s+u*c.seg,lower:a.s+t*a.seg});
  }
}
const near=(a,b,d)=>Math.abs(mod(a-b+length/2,length)-length/2)<d;
export const belowBridge=s=>BRIDGES.some(b=>near(s,b.lower,ROAD*.67));
export const differentLevels=(a,b)=>BRIDGES.some(bridge=>near(a,bridge.upper,180)&&near(b,bridge.lower,180)||near(b,bridge.upper,180)&&near(a,bridge.lower,180));
