import {readFile,writeFile} from 'node:fs/promises';
const data=JSON.parse(await readFile(new URL('../data/f1-circuits.geojson',import.meta.url)));
const definitions=[
  ['monaco','mc-1929','Mônaco','Monte Carlo / Mônaco',19,'urban','Precisão entre muros, hairpin e túnel.'],
  ['monza','it-1922','Monza','Monza / Itália',11,'forest','Retas longas, chicanes e a Parabólica.'],
  ['spa','be-1925','Spa-Francorchamps','Stavelot / Bélgica',19,'forest','Eau Rouge, Raidillon e a longa reta Kemmel.'],
  ['silverstone','gb-1948','Silverstone','Silverstone / Reino Unido',18,'park','Curvas de alta e a sequência Maggotts–Becketts.'],
  ['suzuka','jp-1962','Suzuka','Suzuka / Japão',18,'park','Os esses, a Spoon e o cruzamento em oito.'],
  ['imola','it-1953','Imola','Imola / Itália',19,'forest','Tamburello, Acque Minerali e Rivazza.'],
  ['nurburgring','de-1927','Nürburgring GP','Nürburg / Alemanha',15,'forest','Mercedes Arena, Dunlop e a chicane final.'],
  ['hungaroring','hu-1986','Hungaroring','Budapeste / Hungria',14,'park','Sequências técnicas e poucas pausas entre curvas.'],
  ['red-bull-ring','at-1969','Red Bull Ring','Spielberg / Áustria',10,'forest','Retas rápidas e fortes frenagens.'],
  ['barcelona','es-1991','Barcelona-Catalunya','Montmeló / Espanha',16,'park','Curvas variadas; versão com a chicane final.'],
  ['montreal','ca-1978','Gilles-Villeneuve','Montreal / Canadá',14,'island','Chicanes, hairpin e o Muro dos Campeões.'],
  ['austin','us-2012','Circuit of the Americas','Austin / Estados Unidos',20,'dry','Curva 1, esses rápidos e uma longa reta oposta.'],
  ['melbourne','au-1953','Albert Park','Melbourne / Austrália',14,'lake','Curvas velozes no parque ao redor do lago.']
];
const circuits=definitions.map(([id,sourceId,name,location,corners,theme,description])=>{
  const f=data.features.find(f=>f.properties.id===sourceId),coordinates=f.geometry.coordinates;
  return{id,sourceId,name,fullName:f.properties.Name,location,metres:f.properties.length,corners,theme,description,coordinates};
});
await writeFile(new URL('../circuit-data.js',import.meta.url),'// Derived from bacinger/f1-circuits (MIT). See data/CIRCUITS-LICENSE.md.\nexport const CIRCUIT_DATA='+JSON.stringify(circuits)+';\n');
