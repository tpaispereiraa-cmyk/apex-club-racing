import {at,length,mod,clamp,CIRCUIT} from './track.js';

// The lane and buildings share one layout. The narrow infield between the
// pit straight and Laranjinha cannot accommodate the previous deep garages.
export const PIT_LAYOUT={
  entry:length-1350,exit:480,mergeLength:220,
  laneOffset:-82,laneWidth:33,
  garageOffset:-127,garageWidth:106,garageDepth:32,
  firstStop:length-1120,stopSpacing:120
};
if(CIRCUIT.id!=='interlagos'){PIT_LAYOUT.garageOffset=-155;PIT_LAYOUT.garageWidth=80;}
if(CIRCUIT.id==='spa')Object.assign(PIT_LAYOUT,{entry:length-1100,firstStop:length-900,stopSpacing:90,garageWidth:76});
export const garageStop=index=>PIT_LAYOUT.firstStop+index*PIT_LAYOUT.stopSpacing;
export function garagePose(index){return at(garageStop(index),PIT_LAYOUT.garageOffset);}
export function pitOffset(s){
  const local=mod(s-PIT_LAYOUT.entry,length),distance=length-PIT_LAYOUT.entry+PIT_LAYOUT.exit;
  const blend=clamp(Math.min(local/PIT_LAYOUT.mergeLength,(distance-local)/PIT_LAYOUT.mergeLength),0,1);
  return-24+(PIT_LAYOUT.laneOffset+24)*blend;
}
export const pitPoint=s=>at(s,pitOffset(s));
export function garageFootprint(index){const p=garagePose(index);return{...p,x:p.x+Math.cos(p.angle)*3,y:p.y+Math.sin(p.angle)*3,halfLength:PIT_LAYOUT.garageWidth/2,halfWidth:PIT_LAYOUT.garageDepth/2};}
