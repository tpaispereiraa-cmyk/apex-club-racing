// Optimize over a corner-sized horizon, then interpolate the lateral offset
// along the surveyed track. Fine samples alone converge to the centreline.
export function createRacingLine({at,length,road}) {
  const count=Math.ceil(length/96),step=length/count,limit=road*.35;
  const controls=Array.from({length:count},(_,i)=>{
    const p=at(i*step);
    return {...p,offset:0,nx:-Math.sin(p.angle),ny:Math.cos(p.angle)};
  });
  for(let pass=0;pass<2500;pass++)for(let i=0;i<count;i++){
    const p=controls[i],a=controls[(i+count-1)%count],b=controls[(i+1)%count];
    const c=controls[(i+count-2)%count],d=controls[(i+2)%count];
    const gx=6*p.x-4*(a.x+b.x)+c.x+d.x,gy=6*p.y-4*(a.y+b.y)+c.y+d.y;
    const offset=Math.max(-limit,Math.min(limit,p.offset-(gx*p.nx+gy*p.ny)*.13));
    p.x+=(offset-p.offset)*p.nx;p.y+=(offset-p.offset)*p.ny;p.offset=offset;
  }
  const samples=Math.ceil(length/16);
  const line=Array.from({length:samples},(_,j)=>{
    const s=j*length/samples,u=s/step,i=Math.floor(u),t=u-i;
    const a=controls[(i+count-1)%count].offset,b=controls[i].offset;
    const c=controls[(i+1)%count].offset,d=controls[(i+2)%count].offset;
    const offset=Math.max(-limit,Math.min(limit,.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)));
    const p=at(s,offset);
    return {...p,s,offset,nx:-Math.sin(p.angle),ny:Math.cos(p.angle)};
  });
  // Remove survey-vertex/tangent ripples after resampling without losing the
  // wider entry and exit positions found by the coarse optimization.
  for(let pass=0;pass<240;pass++)for(let i=0;i<samples;i++){
    const p=line[i],a=line[(i+samples-1)%samples],b=line[(i+1)%samples];
    const c=line[(i+samples-2)%samples],d=line[(i+2)%samples];
    const gx=6*p.x-4*(a.x+b.x)+c.x+d.x,gy=6*p.y-4*(a.y+b.y)+c.y+d.y;
    const offset=Math.max(-limit,Math.min(limit,p.offset-(gx*p.nx+gy*p.ny)*.13));
    p.x+=(offset-p.offset)*p.nx;p.y+=(offset-p.offset)*p.ny;p.offset=offset;
  }
  return line;
}
