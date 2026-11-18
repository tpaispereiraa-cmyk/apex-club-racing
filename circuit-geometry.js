const mod=(n,m)=>(n%m+m)%m;
export function makeGeometry(circuit){
  const coords=circuit.coordinates,lat=coords.reduce((n,p)=>n+p[1],0)/coords.length*Math.PI/180;
  // Monaco's much tighter street layout needs a larger world scale to fit
  // the shared car footprint through the hairpin and the harbour chicanes.
  const scale=circuit.id==='monaco'?6:3.38;
  let points=coords.map(p=>({x:(p[0]-coords[0][0])*111320*Math.cos(lat)*scale,y:-(p[1]-coords[0][1])*111320*scale}));
  points=points.filter((p,i)=>!i||Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y)>1);
  if(Math.hypot(points[0].x-points.at(-1).x,points[0].y-points.at(-1).y)<2)points.pop();
  const path=[];
  // Bounded Hermite tangents round survey vertices without overshooting a
  // short hairpin/chicane when the adjacent straight has sparse coordinates.
  for(let i=0;i<points.length;i++){
    const a=points[mod(i-1,points.length)],b=points[i],c=points[(i+1)%points.length],d=points[(i+2)%points.length];
    const bc=Math.hypot(c.x-b.x,c.y-b.y),ab=Math.hypot(b.x-a.x,b.y-a.y),cd=Math.hypot(d.x-c.x,d.y-c.y);
    const tangent=(p,q,scale)=>{const dist=Math.hypot(q.x-p.x,q.y-p.y)||1;return{x:(q.x-p.x)/dist*scale,y:(q.y-p.y)/dist*scale};};
    const u=tangent(a,c,Math.min(ab,bc)),v=tangent(b,d,Math.min(bc,cd)),steps=Math.max(3,Math.ceil(bc/8));
    for(let j=0;j<steps;j++){const t=j/steps,t2=t*t,t3=t2*t;path.push({x:(2*t3-3*t2+1)*b.x+(t3-2*t2+t)*u.x+(-2*t3+3*t2)*c.x+(t3-t2)*v.x,y:(2*t3-3*t2+1)*b.y+(t3-2*t2+t)*u.y+(-2*t3+3*t2)*c.y+(t3-t2)*v.y});}
  }
  let length=0;
  path.forEach((p,i)=>{const q=path[(i+1)%path.length];p.s=length;p.seg=Math.hypot(q.x-p.x,q.y-p.y);p.angle=Math.atan2(q.y-p.y,q.x-p.x);length+=p.seg;});
  const minX=Math.min(...path.map(p=>p.x)),maxX=Math.max(...path.map(p=>p.x)),minY=Math.min(...path.map(p=>p.y)),maxY=Math.max(...path.map(p=>p.y));
  for(const p of path){p.x+=350-minX;p.y+=350-minY;}
  const W=Math.ceil(maxX-minX+700),H=Math.ceil(maxY-minY+700);
  function at(s,offset=0){s=mod(s,length);let lo=0,hi=path.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(path[mid].s<=s)lo=mid;else hi=mid-1;}
    const p=path[lo],q=path[(lo+1)%path.length],t=(s-p.s)/p.seg;
    // Interpolate tangent angle as well as position to avoid offset-lane jumps
    // at sampled vertices. The centerline remains exactly projectable.
    const angle=p.angle+Math.atan2(Math.sin(q.angle-p.angle),Math.cos(q.angle-p.angle))*t;
    return{x:p.x+(q.x-p.x)*t-Math.sin(angle)*offset,y:p.y+(q.y-p.y)*t+Math.cos(angle)*offset,angle};
  }
  function nearest(x,y){let best=Infinity,result;for(let i=0;i<path.length;i++){const p=path[i],q=path[(i+1)%path.length],dx=q.x-p.x,dy=q.y-p.y,t=Math.max(0,Math.min(1,((x-p.x)*dx+(y-p.y)*dy)/(p.seg*p.seg))),px=p.x+dx*t,py=p.y+dy*t,dist=(x-px)**2+(y-py)**2;if(dist<best){best=dist;result={s:p.s+p.seg*t,d:Math.sqrt(dist),x:px,y:py,angle:p.angle};}}return result;}
  return{path,length,W,H,at,nearest,nodes:points};
}
