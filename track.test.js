import {test} from 'node:test';
import assert from 'node:assert/strict';
import {path,length,at,nearest,W,H,ROAD} from './track.js';
test('Interlagos forms a continuous anticlockwise loop inside the world',()=>{
  let signedArea=0;
  path.forEach((p,i)=>{let q=path[(i+1)%path.length];assert.ok(p.x>ROAD&&p.x<W-ROAD&&p.y>ROAD&&p.y<H-ROAD);assert.ok(p.seg>0&&p.seg<45);signedArea+=p.x*q.y-q.x*p.y;});
  // Screen y grows downwards: positive shoelace area is visually clockwise.
  assert.ok(signedArea<0);
  assert.deepEqual(at(0),at(length));
  assert.ok(Math.hypot(at(-.01).x-at(.01).x,at(-.01).y-at(.01).y)<.03);
});
test('projection preserves lap distance along every part of the track',()=>{
  for(let s=0;s<length;s+=31){let p=at(s),n=nearest(p.x,p.y);assert.ok(n.d<1e-6);assert.ok(Math.abs(n.s-s)<1e-5);}
});
test('separate stretches do not intersect or overlap the road',()=>{
  for(let s=0;s<length;s+=35)for(let t=s+260;t<length;t+=35){if(length-(t-s)<260)continue;let a=at(s),b=at(t);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>ROAD,`overlap at ${s}, ${t}`);}
});
