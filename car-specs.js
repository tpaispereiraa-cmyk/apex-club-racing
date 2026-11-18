// Shared supplier specifications. Team installation is applied separately.
export const ENGINES={
  'Aurora H6':{power:1025,efficiency:88,ers:91,durability:90},
  'Scarlatto V6H':{power:1040,efficiency:82,ers:87,durability:86},
  'Vanguard Hybrid':{power:1015,efficiency:91,ers:95,durability:88},
  'Nord E-Power':{power:1020,efficiency:94,ers:89,durability:95},
  'Kairo H-Tech':{power:1000,efficiency:90,ers:94,durability:92}
};
export const CAR_LABELS={topSpeed:'Velocidade final',acceleration:'Aceleração',low:'Curvas lentas',medium:'Curvas médias',high:'Curvas rápidas',braking:'Frenagem',drs:'Eficiência do DRS',dirtyAir:'Tolerância ao ar sujo',tyres:'Preservação dos pneus',cooling:'Refrigeração do motor'};
const profiles={
  aurora:[95,94,93,94,94,93,92,93,91,91],scarlatto:[98,96,90,91,92,95,96,89,86,88],
  vanguard:[92,91,91,97,98,91,94,96,89,89],nord:[93,94,97,94,92,94,89,92,96,96],
  solaris:[87,85,79,81,80,82,89,77,80,81],kairo:[80,83,89,85,82,84,78,84,88,85],
  cobalto:[84,82,80,84,88,83,86,86,79,83],verdan:[81,82,86,82,80,88,79,82,93,88],
  vento:[72,71,73,68,66,72,70,67,78,73],ember:[69,68,69,72,70,69,73,70,70,76]
};
export function specification(team){const values=profiles[team.id];return Object.fromEntries(Object.keys(CAR_LABELS).map((k,i)=>[k,values[i]]));}
