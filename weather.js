// Public forecast and actual weather share a scenario, never future car events.
function scenario(race){const seed=(race.seed??2026)>>>0,hash=n=>{let x=(seed+n*374761393)>>>0;x=Math.imul(x^(x>>>13),1274126177);return((x^(x>>>16))>>>0)/4294967296;};return{start:30+hash(1)*26,duration:30+hash(2)*35,level:.38+hash(3)*.46,dry:hash(4)<.18};}
export function rainWindow(race){const scale=Math.max(1,race.laps/3);if(race.weatherVersion!==2)return{start:38*scale,end:92*scale,level:.8,dry:false};const s=scenario(race);return{start:s.start*scale,end:(s.start+s.duration)*scale,level:s.level,dry:s.dry};}
export function weatherTarget(race,elapsed){if(race.weather==='rain')return .82;if(race.weather==='dry')return 0;const w=rainWindow(race);return w.dry||elapsed<w.start||elapsed>=w.end?0:w.level;}
export function weatherForecast(race){
  const elapsed=race.elapsed??0;
  if(race.weather!=='auto')return{fixed:true,next:null,summary:race.weather==='rain'?'Chuva fixa durante a sessão':'Tempo seco durante a sessão'};
  const w=rainWindow(race);if(w.dry)return{fixed:false,next:null,summary:'Tendência de tempo seco no restante da sessão'};
  const kind=elapsed<w.start?'rain':elapsed<w.end?'drying':null,at=kind==='rain'?w.start:w.end;
  if(!kind)return{fixed:false,next:null,summary:'Tendência de tempo seco no restante da sessão'};
  const from=Math.max(0,at-elapsed-60),to=Math.max(0,at-elapsed+60);
  return{fixed:false,next:{kind,from,to,confidence:'scenario'},summary:`${kind==='rain'?'Chuva':'Tendência de secagem'} em ${Math.floor(from/60)}–${Math.ceil(to/60)} min · janela aproximada`};
}
