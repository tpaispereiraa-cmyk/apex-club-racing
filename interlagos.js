// Centerline traced by hand from the official Formula 1 Interlagos circuit map.
// Reference: https://www.formula1.com/en/information/brazil-autodromo-jose-carlos-pace-sao-paulo.5z2RfrmiTTfEP6Wnxv1yIW
// Arcade adaptation: planar scenery, constant road width, simplified elevation.
export const W=4400,H=2850,ROAD=104;
export const mod=(n,m)=>(n%m+m)%m;
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const trace=[
  [535,168],[340,225],[195,275], // main straight, towards Senna S
  [140,310],[135,342],[163,372], // T1: left
  [202,410],[209,442],[190,480], // T2: right
  [157,550],[153,620],[177,690],[223,746],[295,788], // Curva do Sol
  [545,856],[820,930],[1060,995],[1177,1023], // Reta Oposta
  [1225,1011],[1247,972],[1267,865], // Descida do Lago, T4
  [1270,808],[1250,748],[1214,701], // T5
  [1080,596],[940,492],[824,405], // approach to Ferradura
  [784,350],[776,296],[790,245], // T6
  [820,197],[854,179],[949,158], // T7, Laranjinha
  [1022,151],[1063,164],[1075,191],[1063,225], // T8
  [1035,270],[1032,309],[1050,343], // Pinheirinho
  [1084,357],[1120,350],[1153,326], // T9
  [1228,250],[1270,223],[1347,205],[1380,201], // Bico de Pato
  [1404,212],[1414,237],[1406,258], // T10 hairpin
  [1367,297],[1303,357],[1272,407], // Mergulho
  [1257,456],[1265,509],[1298,553], // T11
  [1396,623],[1495,685],[1542,713], // Junção approach
  [1575,707],[1596,675],[1616,617],[1638,546], // T12
  [1637,497],[1624,430],[1602,358], // T13
  [1567,274],[1531,216],[1485,176], // T14, Subida dos Boxes
  [1423,146],[1324,120],[1190,91],[1073,71], // Café
  [994,65],[927,72],[788,100],[651,136] // T15 and pit straight
];
export const project=([x,y])=>({x:x*2.35+40,y:y*2.35+130});
export const nodes=trace.map(p=>{let q=project(p);return[q.x,q.y];});
export const path=[];
for(let i=0;i<nodes.length;i++)for(let j=0;j<24;j++){
  let t=j/24,a=nodes[mod(i-1,nodes.length)],b=nodes[i],c=nodes[(i+1)%nodes.length],d=nodes[(i+2)%nodes.length];
  let f=k=>.5*(2*b[k]+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t);
  path.push({x:f(0),y:f(1)});
}
export let length=0;
path.forEach((p,i)=>{p.s=length;let q=path[(i+1)%path.length];p.seg=Math.hypot(q.x-p.x,q.y-p.y);length+=p.seg;p.angle=Math.atan2(q.y-p.y,q.x-p.x);});
export function at(s,offset=0){s=mod(s,length);let lo=0,hi=path.length-1;while(lo<hi){let mid=Math.ceil((lo+hi)/2);if(path[mid].s<=s)lo=mid;else hi=mid-1;}let p=path[lo],q=path[(lo+1)%path.length],t=(s-p.s)/p.seg;return{x:p.x+(q.x-p.x)*t-Math.sin(p.angle)*offset,y:p.y+(q.y-p.y)*t+Math.cos(p.angle)*offset,angle:p.angle};}
export function nearest(x,y){let best=Infinity,result;for(let i=0;i<path.length;i++){let p=path[i],q=path[(i+1)%path.length],dx=q.x-p.x,dy=q.y-p.y,t=clamp(((x-p.x)*dx+(y-p.y)*dy)/(p.seg*p.seg),0,1),px=p.x+dx*t,py=p.y+dy*t,d=(x-px)**2+(y-py)**2;if(d<best){best=d;result={s:p.s+p.seg*t,d:Math.sqrt(d),x:px,y:py,angle:p.angle};}}return result;}
export const landmarks=[
  ['S DO SENNA',[92,420]],['CURVA DO SOL',[238,675]],['RETA OPOSTA',[710,936]],
  ['DESCIDA DO LAGO',[1320,957]],['FERRADURA',[695,341]],['LARANJINHA',[904,217]],
  ['PINHEIRINHO',[1100,404]],['BICO DE PATO',[1429,172]],['MERGULHO',[1351,479]],
  ['JUNÇÃO',[1535,765]],['SUBIDA DOS BOXES',[1725,391]],['CAFÉ',[1160,36]]
].map(([name,p])=>({name,...project(p)}));
