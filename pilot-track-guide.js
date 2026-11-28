import {at,length,ROAD} from './track.js';
import {DRS_ZONES,inInterval} from './track-profile.js';

const count=Math.ceil(length/32),step=length/count;
const points=Array.from({length:count},(_,i)=>{
  const p=at(i*step);
  return {...p,offset:0,nx:-Math.sin(p.angle),ny:Math.cos(p.angle)};
});
// Reduce changes of direction inside a bounded corridor around the track.
for(let pass=0;pass<140;pass++){
  for(let i=0;i<count;i++){
    const p=points[i],a=points[(i+count-1)%count],b=points[(i+1)%count];
    const c=points[(i+count-2)%count],d=points[(i+2)%count];
    const gx=6*p.x-4*(a.x+b.x)+c.x+d.x,gy=6*p.y-4*(a.y+b.y)+c.y+d.y;
    const offset=Math.max(-ROAD*.3,Math.min(ROAD*.3,p.offset-(gx*p.nx+gy*p.ny)*.13));
    p.x+=(offset-p.offset)*p.nx;p.y+=(offset-p.offset)*p.ny;p.offset=offset;
  }
}
export const PILOT_RACING_LINE=points.map(({x,y},i)=>({x,y,s:i*step}));

export function drawPilotGuides(ctx,{line=true,drs=true}={}) {
  ctx.save();
  if(line){
    // A continuous rubbered-in strip blends into the asphalt while still
    // showing the corner entry, apex and exit of the suggested racing line.
    ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);
    ctx.beginPath();
    points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.closePath();
    for(const [width,color] of [[30,'#17201c0a'],[24,'#17201c12'],[18,'#17201c24']]){
      ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke();
    }
  }
  if(drs)for(const zone of DRS_ZONES){
    for(const side of [-1,1]){
      ctx.beginPath();let begun=false;
      for(let i=0;i<=count;i++){
        const s=i*step,p=at(s,side*(ROAD/2+22));
        if(!inInterval(s,zone.start,zone.end)){begun=false;continue;}
        if(!begun)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
        begun=true;
      }
      ctx.lineWidth=5;ctx.strokeStyle='#55dbef';ctx.stroke();
    }
    for(const [s,label] of [[zone.start,'DRS'],[zone.end,'FIM DRS']]){
      const p=at(s);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
      ctx.strokeStyle='#55dbefaa';ctx.lineWidth=2;ctx.setLineDash([7,7]);
      ctx.beginPath();ctx.moveTo(0,-ROAD/2);ctx.lineTo(0,ROAD/2);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#0d272e';ctx.fillRect(-35,-ROAD/2-52,70,24);
      ctx.fillStyle='#8eefff';ctx.font='bold 12px Arial';ctx.textAlign='center';
      ctx.fillText(label,0,-ROAD/2-35);ctx.restore();
    }
  }
  ctx.restore();
}
