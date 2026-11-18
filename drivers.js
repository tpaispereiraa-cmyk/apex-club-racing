export const DRIVER_LABELS={cornering:'Curvas',braking:'Frenagem',reactions:'Reações',accuracy:'Precisão',control:'Controle',smoothness:'Suavidade',adaptability:'Adaptação',overtaking:'Ultrapassagem',defending:'Defesa'};
// Fictional drivers, independently rated: the car's constructor tier does not set their skill.
const records=[
  [7,'Rafael Azevedo','Brasil',29,[94,92,90,93,92,91,88,92,90],64],
  [27,'Tomás Duarte','Portugal',23,[88,87,94,85,84,82,92,90,83],80],
  [16,'Luca Moretti','Itália',30,[93,96,91,90,88,85,86,95,89],82],
  [55,'Inés Navarro','Espanha',26,[90,91,88,94,94,95,90,85,92],49],
  [4,'Oliver Hayes','Reino Unido',27,[96,90,93,91,89,87,95,93,87],75],
  [81,'Ethan Brooks','Austrália',22,[90,88,95,86,85,86,88,91,85],78],
  [6,'Felix Adler','Alemanha',32,[91,94,87,96,95,92,89,87,95],45],
  [63,'Mikael Berg','Suécia',25,[92,88,91,89,90,90,96,88,89],58],
  [14,'Diego Serrano','Espanha',34,[87,91,84,92,93,94,86,88,92],52],
  [23,'Mateo Costa','Argentina',24,[85,86,91,80,78,79,84,91,82],88],
  [22,'Haru Takeda','Japão',27,[89,87,94,92,90,88,91,86,87],61],
  [38,'Yuna Mori','Japão',21,[85,84,93,85,88,91,94,82,83],54],
  [10,'Émile Laurent','França',28,[88,86,89,87,85,83,90,90,86],73],
  [31,'Adrien Marchand','França',24,[84,88,90,82,81,85,86,87,88],77],
  [18,'Arthur Reed','Reino Unido',31,[86,90,85,93,94,96,93,81,91],39],
  [44,'Nadia Silva','Brasil',23,[88,87,92,86,87,89,91,89,85],70],
  [12,'Miguel Faria','Portugal',29,[86,85,88,90,91,92,94,84,88],51],
  [36,'Sofia Romano','Itália',20,[82,84,94,78,77,80,87,88,79],91],
  [3,'Noah Walker','Nova Zelândia',25,[85,83,90,86,87,85,92,86,84],66],
  [61,'Jack Sullivan','Austrália',21,[80,82,92,79,78,77,83,85,81],86]
];
export const DRIVERS=records.map(([number,name,country,age,values,aggression])=>({id:`driver-${number}`,number,name,country,age,aggression,stats:Object.fromEntries(Object.keys(DRIVER_LABELS).map((k,i)=>[k,values[i]]))}));
export const driverFor=number=>DRIVERS.find(d=>d.number===number);
export const driverRating=driver=>Math.round(Object.values(driver.stats).reduce((a,b)=>a+b,0)/9);
