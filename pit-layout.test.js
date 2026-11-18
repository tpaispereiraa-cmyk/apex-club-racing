import {test} from 'node:test';
import assert from 'node:assert/strict';
import {at,length} from './track.js';
import {CAR_LENGTH,CAR_WIDTH} from './vehicle-geometry.js';
import {PIT_LAYOUT,garageFootprint,garageStop,pitPoint} from './pit-layout.js';

function overlaps(a,b,margin=2){
  const axes=[a.angle,a.angle+Math.PI/2,b.angle,b.angle+Math.PI/2];
  for(const angle of axes){const x=Math.cos(angle),y=Math.sin(angle),distance=Math.abs((a.x-b.x)*x+(a.y-b.y)*y);
    const radius=r=>r.halfLength*Math.abs(Math.cos(r.angle)*x+Math.sin(r.angle)*y)+r.halfWidth*Math.abs(-Math.sin(r.angle)*x+Math.cos(r.angle)*y);
    if(distance>=radius(a)+radius(b)+margin)return false;
  }return true;
}
const footprint=p=>({...p,halfLength:CAR_LENGTH/2+2,halfWidth:CAR_WIDTH/2+1});
test('all racing lanes clear every garage roof, including the Laranjinha section',()=>{
  for(let i=0;i<10;i++)for(let s=0;s<length;s+=8)for(const lane of [-32,0,32]){
    assert.equal(overlaps(footprint(at(s,lane)),garageFootprint(i)),false,`garage ${i}, track ${s}, lane ${lane}`);
  }
});
test('pit entry, service positions and exit clear all garage roofs',()=>{
  for(let s=PIT_LAYOUT.entry;s<=length+PIT_LAYOUT.exit;s+=4){
    const car=footprint(pitPoint(s));for(let i=0;i<10;i++)assert.equal(overlaps(car,garageFootprint(i)),false,`garage ${i}, pit ${s}`);
  }
  for(let i=0;i<10;i++){const car=footprint(pitPoint(garageStop(i)));assert.equal(overlaps(car,garageFootprint(i)),false);}
});
