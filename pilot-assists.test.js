import {test} from 'node:test';
import assert from 'node:assert/strict';
import {at,nearest,length,ROAD,CURB} from './track.js';
import {DRS_ZONES,drsZoneAt} from './track-profile.js';
import {distanceToDRS,updatePilotDRS} from './pilot-drs.js';
import {PILOT_RACING_LINE} from './pilot-track-guide.js';
import {makePilotCar,setupFor,stepPilot} from './pilot-driving.js';
import {createPilotGhost} from './pilot-ghost.js';
import {gamepadInput,GAMEPAD_BUTTONS} from './pilot-gamepad.js';

test('DRS toggle arms on approach, opens in the zone and closes with braking or exit',()=>{
  const zone=DRS_ZONES[0];
  assert.ok(zone);
  const car={s:zone.start-40,off:false,spin:0};
  assert.ok(distanceToDRS(car.s)<41);
  assert.equal(updatePilotDRS(car,{e:true,w:true,drsToggle:true}),false);
  assert.equal(car.drsArmed,true);
  car.s=zone.start+2;
  assert.equal(updatePilotDRS(car,{w:true,drsToggle:true}),true);
  assert.equal(updatePilotDRS(car,{w:true,s:true,drsToggle:true}),false);
  assert.equal(car.drsArmed,false);
  assert.equal(updatePilotDRS(car,{e:true,w:true,drsToggle:true}),true);
  car.s=zone.end+5;
  assert.equal(updatePilotDRS(car,{w:true,drsToggle:true}),false);
  assert.equal(car.drsArmed,false);
  assert.equal(updatePilotDRS(car,{w:true,e:true}),drsZoneAt(car.s)>=0);
});

test('the suggested line stays inside the road and smooths the centreline',()=>{
  const bend=points=>points.reduce((total,p,i)=>{
    const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];
    return total+(a.x-2*p.x+b.x)**2+(a.y-2*p.y+b.y)**2;
  },0);
  assert.ok(PILOT_RACING_LINE.every(p=>Number.isFinite(p.x)&&nearest(p.x,p.y).d<=ROAD*.36));
  assert.ok(PILOT_RACING_LINE.filter(p=>Math.abs(p.offset)>ROAD*.2).length>PILOT_RACING_LINE.length*.15,'the line must use the track width, not hug its centre');
  assert.ok(bend(PILOT_RACING_LINE)<bend(PILOT_RACING_LINE.map(p=>at(p.s))));
  for(let s=0;s<length;s+=10){
    assert.ok(DRS_ZONES.filter(z=>{
      const offset=(s-z.start+length)%length,span=(z.end-z.start+length)%length;
      return offset<=span;
    }).length<=1,'DRS zones must be distinct');
  }
});

test('curbs have grip between tarmac and gravel and analogue steering accepts partial input',()=>{
  const curb=makePilotCar(setupFor('balanced'),'#ffffff',null,'flying');
  Object.assign(curb,at(curb.s,ROAD/2+CURB/2),{v:0});
  stepPilot(curb,{});
  assert.equal(curb.curb,true);
  assert.equal(curb.off,false);
  const partial=makePilotCar(setupFor('balanced'),'#ffffff',null,'flying');
  const full=makePilotCar(setupFor('balanced'),'#ffffff',null,'flying');
  stepPilot(partial,{d:.25});stepPilot(full,{d:1});
  assert.ok(Math.abs(partial.steer*4-full.steer)<.00001);
});

test('ghost picks personal, next and leader recordings and never loads race results',async()=>{
  const status={dataset:{}},requested=[];
  const entries=[
    {name:'Líder',me:false,best:{ms:50000,replayId:'leader'}},
    {name:'Acima',me:false,best:{ms:52000,replayId:'next'}},
    {name:'Você',me:true,best:{ms:54000,replayId:'self'}}
  ];
  const ghost=createPilotGhost({querySelector:()=>status},async path=>{
    if(path==='/telemetry')return {sessions:[{id:'practice',entries}]};
    const lap=new URL('https://local.invalid'+path).searchParams.get('lap');
    requested.push(lap);
    return {name:lap,ms:54000,frames:JSON.stringify([[0,0,0,0,0],[54000,1,1,0,10000]])};
  });
  for(const mode of ['self','next','leader'])await ghost.load(mode,'practice');
  assert.deepEqual(requested,['self','next','leader']);
  await ghost.load('leader','race');
  assert.equal(status.hidden,true);
  assert.equal(requested.length,3);
  entries[2].best.replayId=null;
  await ghost.load('self','practice');
  assert.match(status.textContent,/sem gravação/);
});

test('controllers support proportional steering and pedals, deadzone and button remapping',()=>{
  const buttons=Array.from({length:16},()=>({value:0,pressed:false}));
  buttons[7]={value:.6,pressed:true};buttons[0]={value:1,pressed:true};
  const input=gamepadInput({axes:[.575],buttons},{deadzone:.15});
  assert.ok(Math.abs(input.d-.5)<.00001);
  assert.equal(input.w,.6);assert.equal(input.e,1);
  assert.equal(gamepadInput({axes:[.1],buttons}).d,0);
  const remapped=gamepadInput({axes:[0],buttons},{gamepadButtons:{...GAMEPAD_BUTTONS,e:1}});
  assert.equal(remapped.e,0);
  const low=makePilotCar(setupFor('balanced'),'#ffffff',null,'flying');
  const high=makePilotCar(setupFor('balanced'),'#ffffff',null,'flying');
  stepPilot(low,{w:.3});stepPilot(high,{w:1});
  assert.ok(high.v>low.v);
  assert.equal(gamepadInput(null).w,0);
});
