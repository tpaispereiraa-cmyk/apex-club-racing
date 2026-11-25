import {ACTIVE_PILOT_ROUND,pilotRoundById} from './pilot-rounds.js';

export function parseRoute(url){const u=new URL(url,'http://localhost'),segments=u.pathname.split('/').filter(Boolean);const modes={'assistir':'watch','jogar-manager':'manager'};
  const pilot=segments[0]==='pilotar';
  const round=pilot?pilotRoundById(u.searchParams.get('rodada'))??ACTIVE_PILOT_ROUND:null;
  return{page:segments[0]==='circuitos'?'circuits':pilot?'pilot':'game',mode:modes[segments[0]]??(u.searchParams.get('career')==='1'?'manager':null),circuit:round?.circuit??segments[1]??u.searchParams.get('circuit')??null};
}
export const circuitUrl=(id,mode='watch')=>`/${mode==='manager'?'jogar-manager':'assistir'}/${encodeURIComponent(id)}`;
