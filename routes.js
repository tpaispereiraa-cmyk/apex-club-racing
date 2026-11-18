export function parseRoute(url){const u=new URL(url,'http://localhost'),segments=u.pathname.split('/').filter(Boolean);const modes={'assistir':'watch','jogar-manager':'manager'};
  return{page:segments[0]==='circuitos'?'circuits':'game',mode:modes[segments[0]]??(u.searchParams.get('career')==='1'?'manager':null),circuit:segments[1]??u.searchParams.get('circuit')??null};
}
export const circuitUrl=(id,mode='watch')=>`/${mode==='manager'?'jogar-manager':'assistir'}/${encodeURIComponent(id)}`;
