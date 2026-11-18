import {raceLaps,PRACTICE_LAPS} from '../tournament.js';
import {configureAIWeekend} from './ai-manager.js';
// Transport-independent race actor. The host must supply an authenticated
// principal; a browser request body must never be used as that principal.
import {copy,MODEL_VERSION} from './model.js';
import {createCareer,dispatchCareer,prepareEntries,settleWeekend} from './career.js';
import {startingGrid} from '../teams.js';
import {createRace} from '../race-systems.js';
import {createField,simulateField} from '../race-ai.js';
import {qualifyingResults,sessionComplete} from '../weekend.js';
import {CIRCUIT} from '../track.js';
export class ManagerRoom{
  constructor({id='league-1',ownerId='host',startsAt,seed=2026}={}){
    if(!Number.isFinite(startsAt))throw Error('Horário obrigatório.');
    this.data={id,ownerId,startsAt,seed,phase:'preparation',elapsed:0,simulationTime:0,revision:0,members:{},seen:{},commandLog:[],career:createCareer(),session:null,cars:null,modelVersion:MODEL_VERSION};
  }
  join(principal,{teamId,role='manager'}){
    if(!principal?.id)throw Error('Usuário autenticado obrigatório.');if(!['manager','spectator','pilot'].includes(role))throw Error('Papel inválido.');
    if(this.data.phase!=='preparation'&&role!=='spectator')throw Error('Inscrições encerradas.');
    if(this.data.members[principal.id])throw Error('Usuário já inscrito.');
    if(role==='manager'){
      const team=this.data.career.teams[teamId];if(!team||Object.values(this.data.members).some(m=>m.role==='manager'&&m.teamId===teamId))throw Error('Equipe indisponível.');team.ownerId=principal.id;
    }
    // Pilot membership reserves a social role. It grants no management rights
    // and does not switch a ranked management race into direct driving.
    this.data.members[principal.id]={id:principal.id,teamId,role};this.data.revision++;
    return this.view(principal);
  }
  submit(principal,command,now){
    const member=this.data.members[principal?.id];if(!member||member.role!=='manager')throw Error('Apenas o manager pode comandar a equipe.');
    if(!Number.isFinite(now)||now<this.data.startsAt-864000000)throw Error('Relógio inválido.');
    if(this.data.phase==='finished')throw Error('Prova encerrada.');
    if(['startWeekend','settleRace','advance','nextSeason'].includes(command?.type))throw Error('Calendário e resultados são controlados pela sala.');
    if(!command?.id||typeof command.id!=='string')throw Error('Identificador obrigatório.');
    const key=`${principal.id}:${command.id}`;if(this.data.seen[key])return copy(this.data.seen[key]);
    if(command.roomRevision!==this.data.revision)throw Error('Revisão da sala desatualizada.');
    if(now>=this.data.startsAt&&this.data.phase==='preparation')throw Error('Preparação encerrada pelo calendário.');
    const career=this.data.career;
    this.data.career=dispatchCareer(career,{...copy(command),id:key,actorId:principal.id,teamId:member.teamId,revision:career.revision});
    this.data.revision++;const receipt={accepted:true,revision:this.data.revision,simulationTime:this.data.simulationTime};this.data.seen[key]=receipt;this.data.commandLog.push({principalId:principal.id,command:copy(command),acceptedAt:now,simulationTime:this.data.simulationTime});return copy(receipt);
  }
  tick(now,seconds=1/30){
    if(!Number.isFinite(now)||!Number.isFinite(seconds)||seconds<=0||seconds>2)throw Error('Passo inválido.');
    if(this.data.phase==='finished')return;
    if(this.data.phase==='preparation'){
      if(now<this.data.startsAt)return;
      if(CIRCUIT.id!==this.data.career.calendar[this.data.career.round])throw Error('Ator carregado com circuito incorreto.');
      const c=this.data.career;for(const t of Object.values(c.teams))for(const car of t.cars)if(car.driver.remaining<=0)throw Error('Contrato vencido no grid.');
      c.active={id:this.data.id,phase:'practice',round:c.round,circuit:CIRCUIT.id,modelVersion:MODEL_VERSION,pending:[],seed:this.data.seed};this.data.career=configureAIWeekend(c);this.start('practice');
    }
    let remaining=seconds;while(remaining>1e-9&&this.data.phase!=='finished'){
      const dt=Math.min(remaining,1/30);remaining-=dt;const d=this.data;d.elapsed+=dt;d.simulationTime+=dt;
      d.session.commands??=[];d.session.commands.push(...d.career.active.pending);d.career.active.pending=[];
      simulateField(d.cars,dt,d.elapsed,d.session);
      if(sessionComplete(d.cars)){if(d.phase==='practice'){for(const car of d.cars)d.career.teams[car.team.id].cars[car.slot].tyres=copy(car.manager.tyreStock);d.career.active.phase='qualifying';this.start('qualifying');}else if(d.phase==='qualifying'){const grid=qualifyingResults(d.cars);for(const car of d.cars)d.career.teams[car.team.id].cars[car.slot].tyres=copy(car.manager.tyreStock);d.career.active.phase='race';this.start('race',grid);}else{d.career=settleWeekend(d.career,d.cars,d.career.active.id);d.phase='finished';}}
    }
  }
  start(type,grid=null){const d=this.data;d.phase=type;d.elapsed=0;d.session=createRace({seed:d.seed,type,laps:type==='race'?raceLaps(CIRCUIT):type==='practice'?PRACTICE_LAPS:2,weather:type==='race'?'auto':'dry'});d.cars=createField(d.session,grid,prepareEntries(d.career,startingGrid()));}
  view(principal){
    const d=this.data,m=d.members[principal?.id];return{roomId:d.id,revision:d.revision,phase:d.phase,startsAt:d.startsAt,elapsed:d.elapsed,modelVersion:d.modelVersion,
      team:m?.role==='manager'?copy(d.career.teams[m.teamId]):null,
      // Private setups, strategies and inventory never appear in spectator data.
      cars:d.cars?.map(c=>({id:c.id,teamId:c.team.id,driver:c.driver.name,x:c.x,y:c.y,angle:c.angle,speed:c.v,lap:c.lap,compound:c.compound,retired:c.retired,finishTime:c.finishTime})),standings:Object.values(d.career.teams).map(t=>({id:t.id,name:t.name,points:t.points}))};
  }
  checkpoint(){return JSON.stringify(this.data);}
  static restore(raw){const data=JSON.parse(raw);if(data.modelVersion!==MODEL_VERSION||!data.career||!data.members)throw Error('Checkpoint incompatível.');const room=Object.create(ManagerRoom.prototype);room.data=data;if(data.cars){for(const c of data.cars)if(c.bestLap===null)c.bestLap=Infinity;data.cars.race=data.session;}return room;}
}
