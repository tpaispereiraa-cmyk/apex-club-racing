export const PILOT_ROUNDS = [
  {
    id:'2026-11-22-weekend', circuit:'interlagos', warmup:true,
    sessions:[
      ['practice','Treino livre',null,null,'2026-11-24T15:00:00.000Z'],
      ['qualifying','Classificação',6,'2026-11-24T15:00:00.000Z','2026-11-24T20:00:00.000Z'],
      ['race','Corrida',6,'2026-11-25T12:00:00.000Z','2026-11-25T13:25:17.000Z']
    ]
  },
  {
    id:'2026-11-25-red-bull-ring', circuit:'red-bull-ring',
    sessions:[
      ['practice','Treino livre',45,'2026-11-25T03:00:00.000Z','2026-11-26T02:59:59.999Z'],
      ['qualifying','Classificação',6,'2026-11-26T03:00:00.000Z','2026-11-27T02:59:59.999Z'],
      ['race','Corrida',20,'2026-11-27T03:00:00.000Z','2026-11-28T02:59:59.999Z']
    ]
  },
  {
    id:'2026-11-28-silverstone', circuit:'silverstone', practiceBeforeQualifying:true,
    sessions:[
      ['practice','Treino livre',45,'2026-11-28T03:00:00.000Z','2026-11-29T02:59:59.999Z'],
      ['qualifying','Classificação',6,'2026-11-28T03:00:00.000Z','2026-11-29T02:59:59.999Z'],
      ['race','Corrida',20,'2026-11-29T03:00:00.000Z','2026-11-30T02:59:59.999Z']
    ]
  }
];

export function activePilotRound(now=Date.now()) {
  return PILOT_ROUNDS.findLast(round=>!round.sessions[0][3]||Date.parse(round.sessions[0][3])<=now)??PILOT_ROUNDS[0];
}
export const ACTIVE_PILOT_ROUND = activePilotRound();
export const pilotRoundById = id => PILOT_ROUNDS.find(round=>round.id===id);
export const pilotRoundUrl = id => id===ACTIVE_PILOT_ROUND.id ? '/pilotar' : `/pilotar?rodada=${encodeURIComponent(id)}`;
