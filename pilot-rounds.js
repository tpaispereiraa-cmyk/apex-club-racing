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
  }
];

export const ACTIVE_PILOT_ROUND = PILOT_ROUNDS.at(-1);
export const pilotRoundById = id => PILOT_ROUNDS.find(round=>round.id===id);
export const pilotRoundUrl = id => id===ACTIVE_PILOT_ROUND.id ? '/pilotar' : `/pilotar?rodada=${encodeURIComponent(id)}`;
