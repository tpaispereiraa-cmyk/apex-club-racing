// Original APEX model. No code from the community reference tools is used.
export const MODEL_VERSION='manager-1';
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const copy=x=>structuredClone(x);
export function number(v,a,b,name='valor'){if(typeof v!=='number'||!Number.isFinite(v)||v<a||v>b)throw Error(`${name} fora do intervalo ${a}–${b}.`);return v;}
export const PARTS={chassis:'Chassi',frontWing:'Asa dianteira',rearWing:'Asa traseira',sidepods:'Pontões',floor:'Assoalho',suspension:'Suspensão'};
export const FOCUS={balanced:'Equilibrado',low:'Curvas lentas',medium:'Curvas médias',high:'Curvas rápidas',efficiency:'Eficiência',cooling:'Refrigeração',drs:'DRS',dirtyAir:'Tolerância ao ar sujo',tyres:'Preservação de pneus',braking:'Frenagem',light:'Redução de massa',durability:'Durabilidade'};
export const SETUP={frontWing:{label:'Asa dianteira',min:0,max:10,step:.5,base:5},rearWing:{label:'Asa traseira',min:0,max:10,step:.5,base:5},antiRoll:{label:'Equilíbrio antirrolagem',min:0,max:10,step:.5,base:5},camber:{label:'Cambagem negativa (°)',min:2,max:4,step:.1,base:3},toe:{label:'Convergência divergente (°)',min:0,max:1,step:.05,base:.5},brakeBias:{label:'Frenagem dianteira (%)',min:50,max:65,step:1,base:57},rideHeight:{label:'Altura (mm)',min:25,max:65,step:2,base:45},cooling:{label:'Abertura de refrigeração (%)',min:0,max:100,step:5,base:50}};
export const defaultSetup=()=>Object.fromEntries(Object.entries(SETUP).map(([k,v])=>[k,v.base]));
export const ORDERS={pace:['conserve','normal','attack'],fuel:['save','normal','push'],ers:['auto','harvest','balanced','attack'],overtake:['careful','normal','aggressive'],defend:['preserve','normal','firm'],traffic:['follow','cleanAir'],team:['race','hold','yield']};
export const defaultOrders=()=>({pace:'normal',fuel:'normal',ers:'auto',overtake:'normal',defend:'normal',traffic:'follow',team:'race',avoidKerbs:false});
export const ORDER_LABELS={conserve:'Conservar',normal:'Normal',attack:'Atacar',save:'Poupar',push:'Usar reserva',auto:'Automático',harvest:'Recuperar',balanced:'Equilibrado',careful:'Prudente',aggressive:'Agressiva',preserve:'Preservar',firm:'Firme',follow:'Aproximar',cleanAir:'Buscar ar limpo',race:'Disputar',hold:'Não atacar companheiro',yield:'Ceder ao companheiro'};
const mass={chassis:34,frontWing:12,rearWing:14,sidepods:18,floor:26,suspension:22};
export function initialDesign(team,part,id){const c=team.car;return{id,part,version:1,season:1,valid:true,mass:mass[part],durability:100,stats:{low:c.low,medium:c.medium,high:c.high,efficiency:c.topSpeed,drs:c.drs,dirtyAir:c.dirtyAir,tyres:c.tyres,cooling:c.cooling,braking:c.braking},focus:'balanced'};}
const weights={low:{frontWing:.2,rearWing:.15,floor:.25,suspension:.4},medium:{frontWing:.2,rearWing:.2,floor:.45,suspension:.15},high:{frontWing:.2,rearWing:.25,floor:.5,suspension:.05},efficiency:{chassis:.2,rearWing:.3,sidepods:.2,floor:.2,suspension:.1},drs:{rearWing:.8,chassis:.2},dirtyAir:{frontWing:.4,rearWing:.3,floor:.3},tyres:{frontWing:.15,suspension:.65,floor:.2},cooling:{chassis:.35,sidepods:.65},braking:{frontWing:.2,suspension:.8}};
export function deriveCar(state,teamId,slot){
  const t=state.teams[teamId],car=t.cars[slot],parts={};
  for(const part of Object.keys(PARTS)){const item=state.items[car.loadout[part]];if(!item||item.condition<=0)throw Error(`Falta ${PARTS[part]} utilizável no carro ${slot+1}.`);parts[part]={item,design:state.designs[item.designId]};}
  const stats={};for(const [k,ws]of Object.entries(weights))stats[k]=Object.entries(ws).reduce((n,[part,w])=>n+parts[part].design.stats[k]*(.82+.18*parts[part].item.condition/100)*w,0);
  // Ratings are derived once. No legacy aero/grip bonuses are applied again.
  const totalMass=Object.values(parts).reduce((n,p)=>n+p.design.mass,0),s=car.setup;
  const front=(s.frontWing-5)/5,rear=(s.rearWing-5)/5,camber=s.camber-3,toe=s.toe-.5,roll=(s.antiRoll-5)/5;
  const balance=front*.65-rear*.55+roll*.2;
  const platform=clamp(1-Math.abs(s.rideHeight-43)*.003-Math.max(0,34-s.rideHeight)*.01,.7,1);
  const supplier=t.supplier;
  return{stats,mass:Math.max(750,t.baseMass-126+totalMass),powerKW:supplier.power*.7457,efficiency:supplier.efficiency,
    cdA:clamp(1.12-(stats.efficiency-70)*.004+front*.04+rear*.30+toe*.04+(s.cooling-50)*.0008,.75,1.6),
    clA:clamp((3.7+stats.high*.025+front*.25+rear*.55)*platform,2,8),
    mechanicalGrip:1.35+stats.low*.002+camber*.035+toe*.025-Math.abs(roll)*.025,
    balance,tyreWear:1+Math.abs(camber)*.18+Math.abs(toe)*.12+Math.abs(balance)*.15,
    cooling:stats.cooling+(s.cooling-50)*.35,braking:stats.braking-Math.abs(s.brakeBias-57)*.8,
    confidence:clamp(car.practice.confidence-Math.abs(balance-car.preference)*16,20,100),platform,
    drsFraction:.13+stats.drs*.0012,durability:Object.values(parts).reduce((n,p)=>n+p.design.durability,0)/6,parts};
}
export function designQuote(state,teamId,{part,focus='balanced',engineers=3,method='normal',research=false}){
  if(!PARTS[part]||!FOCUS[focus]||!['normal','rushed','intensive'].includes(method))throw Error('Projeto inválido.');
  if(!['balanced','light','durability'].includes(focus)&&!weights[focus]?.[part])throw Error('Esse foco não é desenvolvido por esta família de peças.');
  number(engineers,1,20,'Engenheiros');if(!Number.isInteger(engineers))throw Error('Use um número inteiro de engenheiros.');
  const t=state.teams[teamId],expert=t.expertise[part],facility=t.facilities.design;
  const days=Math.ceil((part==='floor'?20:14)/(1+Math.sqrt(engineers)*.22+facility*.12)*(method==='rushed'?.65:method==='intensive'?1.35:1));
  return{days,cost:Math.round((part==='floor'?500000:300000)*(1+engineers*.08)*(method==='intensive'?1.7:method==='rushed'?1.35:1)),gain:(2.5+(100-expert)*.035)*(1+t.staff.technical.skill/250)*(method==='intensive'?1.2:method==='rushed'?.8:1)};
}
export function refinedDesign(base,project,season){
  const d=copy(base),g=project.gain;d.id=project.designId;d.version++;d.season=season;d.focus=project.focus;
  const focus=project.focus;
  for(const k of Object.keys(d.stats)){let change=focus==='balanced'?g*.35:k===focus?g:0;if(focus==='efficiency'&&['low','medium','high'].includes(k))change=-g*.2;d.stats[k]=clamp(d.stats[k]+change,25,99);}
  if(focus==='light'){d.mass=Math.max(base.mass*.72,d.mass-g*.15);d.durability=clamp(d.durability-g*1.6,45,140);}
  if(focus==='durability'){d.durability=clamp(d.durability+g*2,45,140);d.mass+=g*.08;}
  if(focus==='cooling')d.stats.efficiency=Math.max(25,d.stats.efficiency-g*.2);
  return d;
}
export function pitProfile(team){const p=team.pit;return{seconds:Math.max(2,4.8-p.speed*.023+Math.max(0,p.fatigue-45)*.018),errorChance:clamp(.15-p.precision*.0013+p.fatigue*.001, .005,.3)};}
export function staffCandidate(role,index=0){const skill=60+index*8;return{id:`${role}-${index}`,role,name:['Alex Martins','Camila Sato','Leon Fischer','Valentina Costa'][index],skill,salary:12000+index*12000,signing:60000+index*65000,remaining:2};}
export function manufactureQuote(design,quantity,factory=1,rush=false){number(quantity,1,10,'Quantidade');if(!Number.isInteger(quantity))throw Error('Quantidade inteira obrigatória.');return{cost:Math.round((design.part==='floor'?95000:55000)*(1+(100-design.durability)*.01)*(rush?1.5:1)*quantity),days:Math.max(1,Math.ceil(quantity*(rush?1:2)/factory))};}
export function sponsorOffer(kind){if(kind==='safe')return{kind,name:'Atlas',weekly:160000,bonus:25000,target:16};if(kind==='performance')return{kind,name:'Vertex',weekly:80000,bonus:220000,target:8};throw Error('Patrocinador inválido.');}
