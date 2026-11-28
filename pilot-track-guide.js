import {at,length,ROAD} from './track.js';
import {DRS_ZONES,inInterval} from './track-profile.js';
import {createRacingLine} from './racing-line.js';

const count=Math.ceil(length/32),step=length/count;
export const PILOT_RACING_LINE=createRacingLine({at,length,road:ROAD});
const points=PILOT_RACING_LINE;
const noise=s=>Math.sin(s*.037)*.55+Math.sin(s*.113)*.25+Math.sin(s*.271)*.2;
const widths=points.map(p=>{
  const a=at(p.s-100),b=at(p.s+100);
  const turn=Math.abs(Math.atan2(Math.sin(b.angle-a.angle),Math.cos(b.angle-a.angle)));
  return 9+Math.min(7,turn*7)+noise(p.s)*1.1;
});
let rubberPaths;
function makeRubberPaths(){
  // Irregular, feathered rubber deposits, rather than a painted guide stripe.
  const layers=[1.35,1.15,.95,.72,.45].map((scale,j)=>{
    const path=new Path2D();
    for(const side of [1,-1]){
      for(let n=0;n<points.length;n++){
        const i=side===1?n:points.length-1-n,p=points[i];
        const lateral=Math.max(-ROAD/2+2,Math.min(ROAD/2-2,p.offset+side*widths[i]*scale));
        const q=at(p.s,lateral);
        if(side===1&&n===0)path.moveTo(q.x,q.y);else path.lineTo(q.x,q.y);
      }
    }
    path.closePath();return {path,color:['#22282004','#22282006','#22282008','#22282009','#22282009'][j],fill:true};
  });
  for(let lane=-5;lane<=5;lane++){
    const path=new Path2D();
    points.forEach((p,i)=>{
      const q=at(p.s,p.offset+lane*widths[i]/6+noise(p.s+lane*67)*.8);
      if(i)path.lineTo(q.x,q.y);else path.moveTo(q.x,q.y);
    });
    path.closePath();layers.push({path,color:'#20251f0d',width:.45+Math.abs(lane%3)*.18});
  }
  return layers;
}

export function drawPilotGuides(ctx,{line=true,drs=true}={}) {
  ctx.save();
  if(line){
    ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);
    rubberPaths??=makeRubberPaths();
    for(const layer of rubberPaths){
      if(layer.fill){ctx.fillStyle=layer.color;ctx.fill(layer.path);}
      else {ctx.lineWidth=layer.width;ctx.strokeStyle=layer.color;ctx.stroke(layer.path);}
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
