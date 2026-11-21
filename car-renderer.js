// Formula-style open-wheel car. The same renderer powers garage previews and racing.
export function drawCar(ctx,c,{player=false,scale=1}={}){
  const team=c.team,primary=team.color,secondary=team.secondary,accent=team.accent;
  const tyreColor=({soft:'#ef6767',medium:'#ecc34b',hard:'#eceee2',inter:'#5cce8d',wet:'#66b9ed'})[c.compound]||'#ecc34b';
  ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.angle||0);ctx.scale(scale,scale);
  const shape=(pts,fill)=>{ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();};
  // Contact shadow, carbon floor and the suspension arms between exposed tyres.
  ctx.fillStyle='#07100f65';ctx.beginPath();ctx.ellipse(2,4,36,19,0,0,Math.PI*2);ctx.fill();
  shape([[-24,-12],[6,-12],[12,-7],[17,-5],[17,5],[12,7],[6,12],[-24,12]],'#161d22');
  ctx.strokeStyle='#303d42';ctx.lineWidth=1.5;
  for(let side of [-1,1])for(let [x,anchor] of [[18,6],[-20,-8]]){ctx.beginPath();ctx.moveTo(anchor,side*4);ctx.lineTo(x-4,side*15);ctx.lineTo(anchor-6,side*5);ctx.stroke();}
  for(let x of [-21,18])for(let y of [-17,10]){
    const rubber=ctx.createLinearGradient(0,y,0,y+7);rubber.addColorStop(0,'#080d10');rubber.addColorStop(.45,'#30373b');rubber.addColorStop(1,'#0b0e12');
    ctx.fillStyle=rubber;ctx.beginPath();ctx.roundRect(x-6,y,13,7,2);ctx.fill();ctx.fillStyle='#8e9b9540';ctx.fillRect(x-4,y+1,9,.7);ctx.fillStyle=tyreColor;ctx.fillRect(x+4,y+2,1.2,3);
  }
  // Rear wing with endplates and a contrasting flap.
  ctx.fillStyle=secondary;ctx.fillRect(-31,-16,8,32);ctx.fillStyle=primary;ctx.fillRect(-30,-14,3,28);ctx.fillStyle=accent;ctx.fillRect(-32,-17,9,2);ctx.fillRect(-32,15,9,2);
  if(c.drs){ctx.fillStyle='#101a15';ctx.fillRect(-29,-12,4,24);ctx.fillStyle='#d5f561';ctx.fillRect(-31,-12,1,24);}
  // Sidepods flare around a slender cockpit and engine cover.
  const paint=ctx.createLinearGradient(0,-12,0,12);paint.addColorStop(0,primary);paint.addColorStop(.45,primary);paint.addColorStop(1,secondary);
  shape([[-25,-4],[-16,-10],[-2,-11],[8,-8],[12,-4],[30,-2.5],[31,2.5],[12,4],[8,8],[-2,11],[-16,10],[-25,4]],paint);
  const pattern=team.pattern;
  if(pattern&&pattern!=='clean'){
    ctx.save();ctx.clip();ctx.fillStyle=accent;
    switch(pattern){
      case 'stripe':
        ctx.fillRect(-25,-5,54,10);
        ctx.fillStyle=secondary;ctx.fillRect(-25,-2,54,4);
        break;
      case 'chevron':
        for(const x of [-26,-14,-2])shape([[x,-14],[x+4,-14],[x+14,0],[x+4,14],[x,14],[x+10,0]],accent);
        break;
      case 'checkers':
        ctx.fillStyle=secondary;ctx.fillRect(-21,-12,24,24);
        ctx.fillStyle=accent;
        for(let x=0;x<6;x++)for(let y=0;y<6;y++)if((x+y)%2===0)ctx.fillRect(-21+x*4,-12+y*4,4,4);
        break;
      case 'split':
        shape([[-28,-13],[1,-13],[19,13],[-28,13]],secondary);
        shape([[-3,-13],[1,-13],[19,13],[15,13]],accent);
        break;
      case 'bolt':
        shape([[-22,-12],[1,-12],[-5,-4],[17,-4],[-8,13],[-4,4],[-23,4],[-15,-4]],accent);
        break;
    }
    ctx.restore();
  }else{
    shape([[-22,-2],[-8,-3],[0,-3],[7,-2],[23,-1],[23,1],[7,2],[0,3],[-8,3],[-22,2]],secondary);
  }
  ctx.fillStyle=accent;ctx.fillRect(-15,-9,16,1.7);ctx.fillRect(-15,7.3,16,1.7);ctx.fillRect(17,-1,11,2);
  // Sidepod intake slots and small wing mirrors.
  ctx.fillStyle='#142027';ctx.fillRect(1,-8,6,2.5);ctx.fillRect(1,5.5,6,2.5);
  ctx.fillStyle=accent;ctx.fillRect(7,-11,4,2);ctx.fillRect(7,9,4,2);
  // Cockpit, helmet and three-point halo.
  ctx.fillStyle='#091319';ctx.beginPath();ctx.ellipse(-1,0,7,4.5,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=c.slot===1?'#ffdc52':'#f0f3e8';ctx.beginPath();ctx.arc(-3,0,2.7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#243d46';ctx.fillRect(-2,-2,1.6,4);
  ctx.strokeStyle='#aeb8b7';ctx.lineWidth=1.1;ctx.beginPath();ctx.ellipse(1,0,7,4.8,0,-Math.PI/2,Math.PI/2);ctx.stroke();ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(11,0);ctx.stroke();
  // Front wing spans the wheel track, with multiple carbon elements.
  ctx.fillStyle=secondary;shape([[27,-17],[34,-16],[35,-7],[33,0],[35,7],[34,16],[27,17],[28,6],[29,0],[28,-6]],secondary);
  ctx.fillStyle=primary;ctx.fillRect(30,-15,2,30);ctx.fillStyle=accent;ctx.fillRect(27,-18,8,2);ctx.fillRect(27,16,8,2);
  ctx.strokeStyle='#d6e5e85c';ctx.lineWidth=.65;for(let y of [-12,-9,9,12]){ctx.beginPath();ctx.moveTo(28,y);ctx.lineTo(33,y);ctx.stroke();}
  // Nose number, camera pod and rear rain light.
  ctx.save();ctx.translate(16,0);ctx.rotate(Math.PI/2);ctx.fillStyle='#f5f5ec';ctx.font='bold 4.8px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
  if(pattern){ctx.strokeStyle='#10181c';ctx.lineWidth=.9;ctx.strokeText(String(c.number),0,0);}
  ctx.fillText(String(c.number),0,0);ctx.restore();
  ctx.fillStyle=c.slot===1?'#ffe060':secondary;ctx.fillRect(-9,-1.6,3,3.2);ctx.fillStyle='#ed4743';ctx.fillRect(-28,-1,2,2);
  if(player){ctx.fillStyle='#d5f561';shape([[-41,0],[-49,-5],[-49,5]],'#d5f561');}
  ctx.restore();
}
