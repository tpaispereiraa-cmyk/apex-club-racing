// Standard Grand Prix distances, checked against Formula1.com race profiles.
// Nürburgring uses the 60-lap 2020 Eifel GP (FIA final classification).
export const REAL_LAPS={interlagos:71,monaco:78,monza:53,spa:44,silverstone:52,suzuka:53,imola:63,nurburgring:60,hungaroring:70,'red-bull-ring':71,barcelona:66,montreal:70,austin:56,melbourne:58};
export const raceLaps=circuit=>Math.ceil(REAL_LAPS[typeof circuit==='string'?circuit:circuit.id]/2);
export const CALENDAR=['melbourne','suzuka','imola','monaco','barcelona','montreal','red-bull-ring','silverstone','hungaroring','spa','nurburgring','monza','austin','interlagos'];
export const POINTS=[25,18,15,12,10,8,6,4,2,1];
export const PHASES={practice:{day:'SEXTA',name:'Treino livre',step:1},qualifying:{day:'SÁBADO',name:'Qualificação',step:2},race:{day:'DOMINGO',name:'Corrida',step:3}};
export const PRACTICE_LAPS=3;
export function championshipOrder(rows){return[...rows].sort((a,b)=>(b.points??0)-(a.points??0)||countback(a,b)||String(a.id).localeCompare(String(b.id)));}
function countback(a,b){for(let i=0;i<20;i++){const delta=(b.finishes?.[i]??0)-(a.finishes?.[i]??0);if(delta)return delta;}return 0;}
export function addResult(standing,position,retired=false){standing.finishes??=Array(20).fill(0);if(!retired)standing.finishes[position-1]++;standing.points=(standing.points??0)+(retired?0:POINTS[position-1]??0);return standing;}
