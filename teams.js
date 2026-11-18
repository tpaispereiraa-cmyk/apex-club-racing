import {ENGINES,specification} from './car-specs.js';
import {driverFor} from './drivers.js';
// Fictional constructors. Both entries use exactly the same base car specification.
export const TIERS={front:'Competitivas',mid:'Bloco médio',back:'Em desenvolvimento'};
export const TEAMS=[
  {id:'aurora',name:'Aurora GP',country:'Brasil',base:'São Paulo',chassis:'AUR-01',engine:'Aurora H6',tier:'front',color:'#12b9a0',secondary:'#e5f4ed',accent:'#d5f561',numbers:[7,27],power:1035,weight:798,stats:{power:96,aero:94,grip:93,brakes:93},character:'Equilíbrio de ponta',description:'Um carro completo: forte nas retas, estável nas curvas rápidas e previsível nas frenagens.'},
  {id:'scarlatto',name:'Scarlatto Corse',country:'Itália',base:'Modena',chassis:'SC-01',engine:'Scarlatto V6H',tier:'front',color:'#e33e3d',secondary:'#f0d8bb',accent:'#ffc75c',numbers:[16,55],power:1040,weight:801,stats:{power:98,aero:91,grip:90,brakes:95},character:'Motor e frenagem',description:'Potência para atacar no fim da reta e freios fortes. Exige mais cuidado para contornar o miolo.'},
  {id:'vanguard',name:'Vanguard Racing',country:'Reino Unido',base:'Silverstone',chassis:'VR-01',engine:'Vanguard Hybrid',tier:'front',color:'#466be9',secondary:'#101e46',accent:'#ffaf42',numbers:[4,81],power:1015,weight:800,stats:{power:92,aero:98,grip:94,brakes:91},character:'Eficiência aerodinâmica',description:'O carro das curvas de alta. A aerodinâmica segura a traseira e permite manter o embalo.'},
  {id:'nord',name:'Nord Apex',country:'Alemanha',base:'Stuttgart',chassis:'NA-01',engine:'Nord E-Power',tier:'front',color:'#c8d5df',secondary:'#222c37',accent:'#67dbe9',numbers:[6,63],power:1020,weight:799,stats:{power:93,aero:92,grip:97,brakes:94},character:'Precisão e aderência',description:'Excelente tração e resposta limpa ao volante. Especialmente forte nas saídas de curva.'},
  {id:'solaris',name:'Solaris Motorsport',country:'Espanha',base:'Valência',chassis:'SOL-01',engine:'Scarlatto V6H',tier:'mid',color:'#f6ad32',secondary:'#4c2532',accent:'#ffe5aa',numbers:[14,23],power:990,weight:808,stats:{power:85,aero:80,grip:83,brakes:82},character:'Ataque nas retas',description:'Bom motor e velocidade final. Perde sustentação nas curvas rápidas para as equipes de ponta.'},
  {id:'kairo',name:'Kairo Dynamics',country:'Japão',base:'Suzuka',chassis:'KD-01',engine:'Kairo H-Tech',tier:'mid',color:'#f0eee6',secondary:'#c93e58',accent:'#f57a95',numbers:[22,38],power:965,weight:805,stats:{power:80,aero:85,grip:86,brakes:84},character:'Chassi técnico',description:'Leve e ágil no miolo. Compensa parte da desvantagem de motor com boas mudanças de direção.'},
  {id:'cobalto',name:'Cobalto Racing',country:'França',base:'Lyon',chassis:'CB-01',engine:'Vanguard Hybrid',tier:'mid',color:'#2fadd3',secondary:'#142b4d',accent:'#f1edda',numbers:[10,31],power:980,weight:810,stats:{power:83,aero:84,grip:80,brakes:83},character:'Fluidez em alta',description:'Aerodinâmica consistente e bom embalo. A tração nas saídas lentas é seu ponto mais delicado.'},
  {id:'verdan',name:'Verdan Works',country:'Reino Unido',base:'Bristol',chassis:'VW-01',engine:'Nord E-Power',tier:'mid',color:'#357f54',secondary:'#182e25',accent:'#e8d295',numbers:[18,44],power:970,weight:807,stats:{power:81,aero:81,grip:84,brakes:88},character:'Confiança na freada',description:'Uma plataforma previsível para disputar posição. Freia bem, mas sofre quando a reta se alonga.'},
  {id:'vento',name:'Vento Scuderia',country:'Portugal',base:'Porto',chassis:'VT-01',engine:'Aurora H6',tier:'back',color:'#a77be2',secondary:'#322747',accent:'#f4c8ec',numbers:[12,36],power:925,weight:820,stats:{power:70,aero:66,grip:71,brakes:72},character:'Projeto em construção',description:'Tem uma base de motor promissora, mas o peso e a aerodinâmica ainda limitam o ritmo.'},
  {id:'ember',name:'Ember Racing',country:'Austrália',base:'Melbourne',chassis:'ER-01',engine:'Kairo H-Tech',tier:'back',color:'#ef784a',secondary:'#292d33',accent:'#f5e7d4',numbers:[3,61],power:910,weight:824,stats:{power:67,aero:70,grip:68,brakes:69},character:'O desafio do grid',description:'Um carro que pede paciência e linhas limpas. Aceleração e aderência ainda estão abaixo do pelotão.'}
];
for(const team of TEAMS){team.car=specification(team);team.supplier=ENGINES[team.engine];team.installation=team.power/team.supplier.power;}
export function physics(team){
  const s=team.stats,c=team.car;
  return {maxSpeed:355+c.topSpeed*.88+(s.power-80)*.12-(s.aero-80)*.05,
    acceleration:145+c.acceleration*.4+(team.supplier.power*team.installation-900)*.18-(team.weight-798)*.45,
    braking:235+c.braking*1.45+s.brakes*.2,grip:4.6+s.grip*.055,
    steering:1.35+s.grip*.009,cornering:.44+s.aero*.002+s.grip*.0025};
}
export function rating(team){return Object.values(team.car).reduce((a,b)=>a+b,0)/Object.keys(team.car).length;}
export const ENTRIES=TEAMS.flatMap(team=>team.numbers.map((number,slot)=>({id:`${team.id}-${number}`,team,number,slot,driver:driverFor(number),performance:physics(team)})));
export function startingGrid(){
  const entries=[...ENTRIES].sort((a,b)=>rating(b.team)-rating(a.team)||a.slot-b.slot);
  return entries.map((entry,grid)=>({...entry,grid}));
}
