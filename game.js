import {SECTOR_COLORS} from './sector-timing.js';
import {bootSpectator} from './spectator.js';
import {TEAMS} from './teams.js';
import {CAR_LENGTH,CAR_WIDTH,GRID_SPACING} from './vehicle-geometry.js';
import {PIT_LAYOUT,pitPoint,garagePose} from './pit-layout.js';
import {W,H,ROAD,mod,clamp,path,length,at,nearest,landmarks,CIRCUIT,BRIDGES} from './track.js';
import {setupCircuits} from './circuit-picker.js';
import {parseRoute} from './routes.js';
const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d');
const $=s=>document.querySelector(s),TAU=Math.PI*2;
let seed=4827;function rnd(){seed=(seed*16807)%2147483647;return(seed-1)/2147483646;}
const world=document.createElement('canvas'),rasterScale=Math.min(1,Math.sqrt(18000000/(W*H)));world.width=Math.ceil(W*rasterScale);world.height=Math.ceil(H*rasterScale);const g=world.getContext('2d');g.scale(rasterScale,rasterScale);
function line(c,width,color){c.beginPath();path.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.lineJoin='round';c.lineWidth=width;c.strokeStyle=color;c.stroke();}
function tree(x,y,r){g.fillStyle='#0b1b1245';g.beginPath();g.ellipse(x+13,y+19,r*1.1,r*.8,0,0,TAU);g.fill();for(let i=0;i<9;i++){let a=rnd()*TAU,rr=r*(.35+rnd()*.5);g.fillStyle=['#25432b','#345536','#3c603c','#496c40'][i%4];g.beginPath();g.arc(x+Math.cos(a)*r*.45,y+Math.sin(a)*r*.45,rr,0,TAU);g.fill();}g.fillStyle='#63834c60';g.beginPath();g.arc(x-5,y-7,r*.35,0,TAU);g.fill();}
function building(x,y,w,h){g.fillStyle='#0a19134d';g.fillRect(x+12,y+17,w,h);g.fillStyle='#a5aaa3';g.fillRect(x,y,w,h);g.fillStyle='#d0d2c9';g.fillRect(x,y,w,h-9);g.strokeStyle='#8b958b';g.lineWidth=1;for(let k=x+8;k<x+w;k+=12){g.beginPath();g.moveTo(k,y);g.lineTo(k,y+h-10);g.stroke();}g.fillStyle='#727f77';g.fillRect(x+12,y+12,30,h-30);}
function makeWorld(){g.fillStyle=CIRCUIT.theme==='dry'?'#817950':CIRCUIT.theme==='urban'?'#536165':CIRCUIT.theme==='island'||CIRCUIT.theme==='lake'?'#486e76':'#526747';g.fillRect(0,0,W,H);for(let i=0;i<225000;i++){g.fillStyle=rnd()>.5?'#adc17a13':'#172e1a16';g.fillRect(rnd()*W,rnd()*H,rnd()*4+1,rnd()*3+1);}line(g,ROAD+105,'#8b967c');line(g,ROAD+75,'#a9a789');for(let i=0;i<9500;i++){let p=at(rnd()*length,(rnd()>.5?1:-1)*(65+rnd()*25));g.fillStyle='#9e987e30';g.fillRect(p.x,p.y,3,2);}line(g,ROAD+17,'#e9e9d6');line(g,ROAD+10,'#d4b93e');g.save();g.setLineDash([18,36]);line(g,ROAD+10,'#e7e7d9');g.setLineDash([18,36]);g.lineDashOffset=18;line(g,ROAD+10,'#498266');g.restore();line(g,ROAD,'#626866');line(g,ROAD-8,'#666b68');
g.save();g.globalAlpha=.2;for(let offset of [-27,28]){g.beginPath();for(let s=0;s<length;s+=6){let p=at(s,offset);s?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y);}g.closePath();g.lineWidth=12;g.strokeStyle='#343c39';g.stroke();}g.restore();
for(let i=0;i<26000;i++){let p=at(rnd()*length,(rnd()-.5)*(ROAD-10));g.fillStyle=rnd()>.5?'#ffffff08':'#0c19140a';g.fillRect(p.x,p.y,2,2);}
for(let side of [-1,1]){g.beginPath();for(let s=0;s<length;s+=8){let p=at(s,side*111);s?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y);}g.closePath();g.lineWidth=7;g.strokeStyle='#394b3e';g.stroke();g.lineWidth=3;g.strokeStyle='#a0aaa0';g.stroke();}
// Pit lane follows the inside of the actual main straight.
g.beginPath();for(let s=PIT_LAYOUT.entry;s<=length+PIT_LAYOUT.exit;s+=5){let p=pitPoint(s);s===PIT_LAYOUT.entry?g.moveTo(p.x,p.y):g.lineTo(p.x,p.y);}g.lineWidth=PIT_LAYOUT.laneWidth+6;g.strokeStyle='#a1a58e';g.stroke();g.lineWidth=PIT_LAYOUT.laneWidth;g.strokeStyle='#747c73';g.stroke();
for(let i=0;i<10;i++){let p=garagePose(i);g.save();g.translate(p.x,p.y);g.rotate(p.angle);building(-PIT_LAYOUT.garageWidth/2+3,-PIT_LAYOUT.garageDepth/2,PIT_LAYOUT.garageWidth,PIT_LAYOUT.garageDepth);g.fillStyle=TEAMS[i].color;g.fillRect(-PIT_LAYOUT.garageWidth/2+5,17,PIT_LAYOUT.garageWidth-4,6);g.fillStyle='#17271f';g.font='bold 6px Arial';g.textAlign='center';g.fillText(TEAMS[i].name.toUpperCase(),0,4);g.strokeStyle='#e9e1ab';g.lineWidth=1;g.strokeRect(-38,34,32,22);g.strokeRect(8,34,32,22);g.restore();}
for(let s=-1450;s<200;s+=110){let p=at(s,180);g.save();g.translate(p.x,p.y);g.rotate(p.angle);g.fillStyle='#172b2155';g.fillRect(-45,-28,104,68);g.fillStyle='#adb4a2';g.fillRect(-52,-35,104,62);for(let y=-29;y<24;y+=8){g.fillStyle='#536251';g.fillRect(-48,y,96,3);for(let x=-46;x<45;x+=7){g.fillStyle=['#e1c652','#3b835a','#c0c7b7','#437ca0'][Math.floor(rnd()*4)];g.fillRect(x,y-2,3,4);}}g.restore();}
for(let i=0;i<520;i++){let x=80+rnd()*(W-160),y=60+rnd()*(H-120);const distance=nearest(x,y).d;if(distance>245){if(CIRCUIT.theme==='urban'){if(distance<1200){const w=40+rnd()*95,h=40+rnd()*90;building(x,y,w,h);g.fillStyle='#829292';for(let wx=x+8;wx<x+w-8;wx+=14)for(let wy=y+8;wy<y+h-8;wy+=14)g.fillRect(wx,wy,7,5);}}else if(CIRCUIT.theme==='lake'||CIRCUIT.theme==='island'){if(distance<470){g.fillStyle='#567452';g.beginPath();g.arc(x,y,45,0,TAU);g.fill();tree(x,y,14+rnd()*26);}}else if(CIRCUIT.theme!=='dry'||rnd()>.7)tree(x,y,14+rnd()*26);}}
g.save();g.font='600 17px Arial';g.textAlign='center';for(let p of landmarks){g.fillStyle='#122a2055';g.fillText(p.name,p.x+2,p.y+2);g.fillStyle='#e1e8c9aa';g.fillText(p.name,p.x,p.y);}g.restore();
for(let s=0;s<length;s+=650){
  const p=at(s,115),a=Math.cos(p.angle),b=Math.sin(p.angle);
  const overlaps=[-68,-34,0,34,68].some(x=>[-10,0,10].some(y=>nearest(p.x+a*x-b*y,p.y+b*x+a*y).d<ROAD/2+12));
  if(overlaps)continue;
  g.save();g.translate(p.x,p.y);g.rotate(p.angle);g.fillStyle='#162b21';g.fillRect(-68,-10,136,20);g.fillStyle='#d6ee97';g.font='bold 11px Arial';g.textAlign='center';g.fillText('APEX  /  CLUB',0,4);g.restore();
}
const p=at(0);g.save();g.translate(p.x,p.y);g.rotate(p.angle);for(let a=0;a<4;a++)for(let b=0;b<10;b++){g.fillStyle=(a+b)%2?'#25352b':'#eeefdf';g.fillRect(a*8-16,b*10-50,8,10);}g.restore();for(let row=0;row<10;row++)for(let col=0;col<2;col++){let p=at(-80-row*GRID_SPACING,col?24:-24);g.save();g.translate(p.x,p.y);g.rotate(p.angle);g.strokeStyle='#e7e6c57a';g.lineWidth=2;g.strokeRect(-(CAR_LENGTH+4)/2,-(CAR_WIDTH+4)/2,CAR_LENGTH+4,CAR_WIDTH+4);g.restore();}}
makeWorld();
// The crossing at Suzuka is a bridge, not an at-grade intersection.
for(const bridge of BRIDGES){
  for(const [width,color] of [[ROAD+22,'#18201c'],[ROAD+10,'#c4c7b5'],[ROAD,'#666b68']]){
    g.beginPath();for(let s=bridge.upper-100;s<=bridge.upper+100;s+=4){const p=at(s);s===bridge.upper-100?g.moveTo(p.x,p.y):g.lineTo(p.x,p.y);}g.lineWidth=width;g.strokeStyle=color;g.stroke();
  }
  for(const side of [-1,1]){g.beginPath();for(let s=bridge.upper-100;s<=bridge.upper+100;s+=4){const p=at(s,side*(ROAD/2+7));s===bridge.upper-100?g.moveTo(p.x,p.y):g.lineTo(p.x,p.y);}g.strokeStyle='#d4dbcd';g.lineWidth=4;g.stroke();}
}
// Sector timing gates: start/finish and the two equal-distance split lines.
for(let i=0;i<3;i++){const p=at(i*length/3);g.save();g.translate(p.x,p.y);g.rotate(p.angle);g.strokeStyle=SECTOR_COLORS[(i+2)%3];g.lineWidth=3;g.setLineDash([8,5]);g.beginPath();g.moveTo(0,-ROAD/2);g.lineTo(0,ROAD/2);g.stroke();g.setLineDash([]);g.fillStyle='#10221e';g.fillRect(-24,ROAD/2+10,48,25);g.fillStyle=SECTOR_COLORS[(i+2)%3];g.font='bold 13px Arial';g.textAlign='center';g.fillText(i===0?'S3 / FIM':'S'+i,0,ROAD/2+27);g.restore();}
if (parseRoute(location.href).page==='pilot') {
  const {bootPilot}=await import('./pilot.js');
  bootPilot({canvas,ctx,world});
} else {
  setupCircuits();
  bootSpectator({canvas,ctx,world});
}


