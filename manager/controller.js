import {ensureWeekendArchive,sessionReport,closeWeekendArchive,standingsSnapshot} from '../weekend-archive.js';
import {createCareer,dispatchCareer,saveCareer,loadCareer,prepareEntries,settleWeekend,manageRivals} from './career.js';
import {createRace} from '../race-systems.js';
import {startingGrid} from '../teams.js';
import {createField,raceOrder} from '../race-ai.js';
import {qualifyingResults} from '../weekend.js';
import {CIRCUIT,length} from '../track.js';
import {FLYING_START,TIMED_PIT_RELEASE} from '../track-profile.js';
import {configureAIWeekend} from './ai-manager.js';
import {raceLaps,PRACTICE_LAPS} from '../tournament.js';
export const MAX_SAVE_CHARS=64*1024*1024;
const timedStartDistance=start=>start==='flying'?-FLYING_START:start==='pits'?-TIMED_PIT_RELEASE:length;
const practiceKm=(laps,start)=>(laps+timedStartDistance(start)/length)*CIRCUIT.metres/1000;
function validateTimedStart(start) {if(start!==null&&start!=='pits'&&start!=='flying')throw Error('Saída de pista inválida.');}
export function createManagerController(storage,{watch=false,onPersistenceChange=()=>{}}={}){
  let career=null,error='';try{career=loadCareer(storage);}catch(e){error=e.message;}
  let persistence={status:'idle',message:'',errorName:null},writeSequence=0;
  const report=(status,message='',cause=null)=>{persistence={status,message,errorName:cause?.name??null,details:cause?.message??null};try{onPersistenceChange(persistence);}catch{}};
  const failed=cause=>{report('memory','Não foi possível salvar no navegador. A partida continua em memória; exporte uma cópia antes de fechar a página.',cause);};
  const persist=()=>{const sequence=++writeSequence;try{
    const pending=saveCareer(career,storage);
    if(pending&&typeof pending.then==='function'){report('saving');return Promise.resolve(pending).then(()=>{if(sequence===writeSequence)report('saved');return true;},cause=>{if(sequence===writeSequence)failed(cause);return false;});}
    report('saved');return true;
  }catch(cause){failed(cause);return false;}};
  const api={get state(){return career;},get error(){return error;},get persistence(){return persistence;},view(screen,details={}){if(!career)return;career.presentation={screen,circuit:CIRCUIT.id,...details};if(details.auto!==undefined){career.preferences??={};career.preferences.weekendAuto=details.auto;}if(screen==='live')career.liveView={...details};persist();},retrySave(){return persist();},create(teamId,name){if(career)throw Error('Já existe uma carreira; exporte-a antes de substituir.');career=createCareer(teamId,name);if(watch){career.calendar=[CIRCUIT.id,...career.calendar.filter(id=>id!==CIRCUIT.id)];}persist();return career;},
    command(type,args={}){if(!career)throw Error('Crie uma equipe.');const id=`${career.ownerId}-${career.revision}-${Date.now()}`;career=dispatchCareer(career,{id,type,args,actorId:career.ownerId,teamId:career.selectedTeam,revision:career.revision});persist();return career;},
    begin(program=null,{start=null}={}){validateTimedStart(start);if(!career)throw Error('Crie uma carreira.');if(career.calendar[career.round]!==CIRCUIT.id)throw Error('Abra a pista da próxima etapa antes de iniciar.');if(career.active?.phase==='practiceReview'){
      if(program&&(watch||![0,1].includes(program.slot)||![1,2,3].includes(program.laps)||!['soft','medium','hard'].includes(program.compound)))throw Error('Programa de treino inválido.');
      const cars=career.teams[career.selectedTeam].cars.filter(c=>!program||c.slot===program.slot);
      for(const c of cars){
        if(c.practice.km+practiceKm(program?.laps??PRACTICE_LAPS,start)>180)throw Error('Limite de 180 km para este piloto. Escolha uma saída mais curta ou o outro carro.');
        if(c.tyres[program?.compound??'medium']<1)throw Error('Sem conjunto desse composto. Escolha outro pneu ou outro carro.');
      }
      const pack=makeSession('practice',null,program,start);career.active.phase='practice';persist();return pack;
    }if(career.active){if(career.active.checkpoints)return restore(career.active.checkpoints);throw Error('Sessão ativa sem checkpoint; use recuperar sessão.');}const previous=career;try{api.command('startWeekend');ensureWeekendArchive(career);career=configureAIWeekend(career,{includePlayer:watch});return makeSession('practice',null,null,start);}catch(e){career=previous;persist();throw e;}},
    finishPractice(cars){if(career?.active?.phase!=='practice')throw Error('Treino livre não está ativo.');if(!cars.every(c=>c.finishTime!==null||c.retired))throw Error('Treino ainda em andamento.');const report=ensureWeekendArchive(career);report.practice.push(sessionReport(cars,career.active.checkpoints?.race??cars.race));const results=qualifyingResults(cars);career.active.practiceRuns??=[];career.active.practiceRuns.push({results:structuredClone(results),setups:Object.values(career.teams).flatMap(t=>t.cars.map(c=>({teamId:t.id,slot:c.slot,setup:structuredClone(c.setup)})))});consume(cars);for(const c of cars){const p=career.teams[c.team.id].cars[c.slot].practice;p.km+=practiceKm(c.lapTimes.length,cars.race?.timedStart??career.active.checkpoints?.race.timedStart);p.confidence=Math.min(100,p.confidence+8);p.trackKnowledge=Math.min(100,p.trackKnowledge+12);p.reports.push({program:'Treino em pista',km:p.km,balance:c.manager.model.balance,uncertainty:.04,bestLap:Number.isFinite(c.bestLap)?c.bestLap:null});}career.active.phase='practiceReview';career.active.checkpoints=null;persist();},
    toQualifying({start=null}={}){validateTimedStart(start);if(career?.active?.phase!=='practiceReview')throw Error('Conclua o treino livre primeiro.');career.active.phase='qualifying';return makeSession('qualifying',null,null,start);},
    completeQualifying(cars){if(career?.active?.phase==='qualifyingReview')return;if(career?.active?.phase!=='qualifying'||!cars.every(c=>c.finishTime!==null||c.retired))throw Error('Conclua a classificação.');const archive=ensureWeekendArchive(career);archive.qualifying=sessionReport(cars,career.active.checkpoints?.race??cars.race);career.active.grid=qualifyingResults(cars);career.active.phase='qualifyingReview';persist();},
    toRace(cars){if(!['qualifying','qualifyingReview'].includes(career?.active?.phase)||!cars.every(c=>c.finishTime!==null||c.retired))throw Error('Conclua a classificação antes da corrida.');if(!watch)for(const car of career.teams[career.selectedTeam].cars){const qualified=cars.find(c=>c.team.id===career.selectedTeam&&c.slot===car.slot),stock=qualified?.manager?.tyreStock??car.tyres;if(car.tyres[car.strategy.compound]<=0||stock[car.strategy.compound]<=0)throw Error(`Carro ${car.slot+1}: sem conjunto de largada. Abra a estratégia e escolha um composto disponível.`);}if(career.active.phase==='qualifying')api.completeQualifying(cars);consume(cars);career.active.phase='race';const pack=makeSession('race',career.active.grid);persist();return pack;},
    live(race){if(!career?.active)return;race.commands??=[];race.commands.push(...career.active.pending);career.active.pending=[];},
    checkpoint(cars,race,elapsed){if(!career?.active)return;career.active.checkpoints={cars:structuredClone([...cars]),race:structuredClone(race),elapsed};return persist();},
    finish(cars){if(!career?.active)return;const archive=ensureWeekendArchive(career);archive.race=sessionReport(cars,career.active.checkpoints?.race??cars.race);career=manageRivals(settleWeekend(career,cars,career.active.id),{includePlayer:watch});archive.pointsAfter=standingsSnapshot(career);for(const r of archive.race.results){const result=career.history.at(-1)?.results?.find(x=>x.teamId===r.teamId&&x.driver===r.driver);r.points=result?.points??0;}closeWeekendArchive(career,archive);career.presentation={screen:'race-report',reportId:archive.id};persist();},
    recover(){if(!career?.active?.checkpoints)throw Error('Não há checkpoint recuperável.');return restore(career.active.checkpoints);},
    export(){return JSON.stringify(career,null,2);},
    import(raw){if(career?.active)throw Error('Conclua o fim de semana antes de importar outra carreira.');if(typeof raw!=='string'||raw.length>MAX_SAVE_CHARS)throw Error('Arquivo de save inválido ou acima de 64 MB.');const memory={getItem:()=>raw};const next=loadCareer(memory);if(!next)throw Error('Arquivo vazio.');career=next;persist();error='';return career;}
  };
  function consume(cars){for(const c of cars.filter(c=>c.manager)){const own=career.teams[c.team.id].cars[c.slot];own.tyres=structuredClone(c.manager.tyreStock);own.powerUnit??={condition:100,km:0};own.powerUnit.condition=c.engineHealth;const distance=Math.max(0,c.s)/Math.max(c.raceWorldLength,1)*CIRCUIT.metres/1000;own.powerUnit.km+=distance;for(const id of Object.values(own.loadout)){const item=career.items[id],design=career.designs[item.designId];item.km+=distance;item.condition=Math.max(1,item.condition-distance/(design.durability*10));}}}
  function makeSession(type,grid=null,program=null,timedStart=null){const session=createRace({seed:career.active.seed+(type==='practice'?(career.active.practiceRuns?.length??0):0),type,laps:type==='race'?raceLaps(CIRCUIT):type==='practice'?(program?.laps??PRACTICE_LAPS):2,weather:type==='race'?'auto':'dry'});if(timedStart)session.timedStart=timedStart;if(program){const car=startingGrid().find(c=>c.team.id===career.selectedTeam&&c.slot===program.slot);session.practiceCar=car.id;session.practiceCompound=program.compound;}session.managerRaceId=career.active.id;session.modelVersion=career.modelVersion;const entries=prepareEntries(career,startingGrid());const cars=createField(session,grid,entries);api.checkpoint(cars,session,0);return{session,cars,elapsed:0};}
  function restore(cp){const session=structuredClone(cp.race),cars=structuredClone(cp.cars);for(const c of cars)if(c.bestLap===null)c.bestLap=Infinity;
    session.commands??=[];for(const log of career.commands){if(log.acceptedRaceId!==career.active.id||!['orders','box','keepOut'].includes(log.type))continue;const car=cars.find(c=>c.team.id===log.teamId&&c.slot===(log.args.slot??0));if(car?.manager&&log.resultRevision>car.manager.commandSequence)session.commands.push({type:log.type,slot:car.slot,teamId:log.teamId,patch:log.args.patch,compound:log.args.compound,sequence:log.resultRevision});}
    cars.race=session;return{session,cars,elapsed:cp.elapsed,resumed:true};}
  return api;
}
