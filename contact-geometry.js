// Separating-axis test for rotated vehicle/building rectangles.
// The normal points from a to b; null means the bodies are separate.
export function contactBetween(a,b){
  let depth=Infinity,normal=null;
  for(const angle of [a.angle,a.angle+Math.PI/2,b.angle,b.angle+Math.PI/2]){
    const x=Math.cos(angle),y=Math.sin(angle),projection=(b.x-a.x)*x+(b.y-a.y)*y;
    const radius=r=>r.halfLength*Math.abs(Math.cos(r.angle)*x+Math.sin(r.angle)*y)+r.halfWidth*Math.abs(-Math.sin(r.angle)*x+Math.cos(r.angle)*y);
    const overlap=radius(a)+radius(b)-Math.abs(projection);if(overlap<=0)return null;
    if(overlap<depth){depth=overlap;const direction=projection>=0?1:-1;normal={x:x*direction,y:y*direction};}
  }return{depth,...normal};
}
