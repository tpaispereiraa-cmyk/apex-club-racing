import {PHYSICS_VERSION} from './physics-version.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,dispatchCareer} from './manager/career.js';
import {ensureWeekendArchive,closeWeekendArchive,circuitRecords,sessionReport,practiceOverview} from './weekend-archive.js';
import {createRace,event} from './race-systems.js';
import {createField} from './race-ai.js';
import {gridRows,cleanLapAverage} from './weekend-ui.js';
import {createManagerController} from './manager/controller.js';

test('event archive preserves relevant race history beyond the twelve-line live ticker',()=>{
  const race=createRace();for(let i=0;i<30;i++)event(race,null,'Weather '+i,'weather');event(race,null,'Approaching','battle');
  assert.equal(race.events.length,12);assert.equal(race.archiveEvents.length,30);
  delete race.archiveEvents;event(race,null,'Legacy stop','pit');assert.equal(race.archivePartial,true);
});
test('weekend archives are independent snapshots and do not duplicate when revisited',()=>{
  let state=createCareer();state=dispatchCareer(state,{id:'weekend',actorId:state.ownerId,teamId:state.selectedTeam,revision:state.revision,type:'startWeekend',args:{}});
  const report=ensureWeekendArchive(state);assert.equal(report.pointsBefore.teams.length,10);report.race={results:[]};closeWeekendArchive(state,report);closeWeekendArchive(state,report);
  assert.equal(state.archives.length,1);report.practice.push({type:'practice'});assert.equal(state.archives[0].practice.length,0);
});
test('records separate physics versions and conditions, without inventing legacy lap data',()=>{
  const state=createCareer();const session=(condition,time)=>({type:'qualifying',results:[{driver:'A',team:'Team A',lapDetails:[{lap:1,time,condition,compound:'soft'}],sectorHistory:[{lap:1,splits:[{sector:1,seconds:20}]}]}]});
  state.archives=[{id:'old',season:1,round:0,circuit:'interlagos',layoutVersion:'geographic-1',modelVersion:'old',practice:[],qualifying:session('dry',40)},{id:'current',season:1,round:1,circuit:'interlagos',layoutVersion:'geographic-1',physicsVersion:PHYSICS_VERSION,modelVersion:state.modelVersion,practice:[],qualifying:session('wet',50)},{id:'dry',season:1,round:2,circuit:'interlagos',layoutVersion:'geographic-1',physicsVersion:PHYSICS_VERSION,modelVersion:state.modelVersion,practice:[],qualifying:session('dry',70)}];
  const dry=circuitRecords(state);assert.equal(dry.qualifying.time,70);assert.equal(dry.sectors[0].time,20);assert.equal(circuitRecords(state,{condition:'wet'}).qualifying.time,50);
  state.archives[2].qualifying.results[0].lapDetails=[];assert.equal(circuitRecords(state).qualifying,null);assert.equal(circuitRecords(state).sectors[0],null);
});
test('grid and pace summaries use real positions and omit pit laps from averages',()=>{
  assert.deepEqual(gridRows({qualifying:{results:[{id:'a',position:1},{id:'b',position:2}]}}).map(r=>r.startPosition),[1,2]);
  assert.equal(cleanLapAverage({lapDetails:[{time:70,pit:false},{time:110,pit:true},{time:72,pit:false}]}),71);assert.equal(cleanLapAverage({}),null);
});
test('reports retain setup, lap context and actual tyre service instead of only counters',()=>{
  const race=createRace({type:'practice',laps:3}),cars=createField(race),c=cars[0];c.lapDetails=[{lap:1,time:80,compound:'medium',condition:'dry',fuel:18}];c.lapTimes=[80];c.bestLap=80;c.pitHistory=[{lap:1,compound:'hard',reason:'reparo',seconds:5}];
  const report=sessionReport(cars,race),row=report.results.find(r=>r.id===c.id);assert.equal(row.lapDetails[0].fuel,18);assert.equal(row.pitHistory[0].reason,'reparo');c.lapDetails[0].fuel=0;assert.equal(row.lapDetails[0].fuel,18);
});
test('qualifying briefing retains the best practice attempt and its original setup',()=>{
  const overview=practiceOverview([{results:[{id:'a',number:1,bestLap:70,setup:{rearWing:2}},{id:'b',number:2,bestLap:72}]},{results:[{id:'a',number:1,bestLap:71,setup:{rearWing:8}},{id:'b',number:2,bestLap:69}]}]);
  assert.equal(overview.results[0].id,'b');assert.equal(overview.results[1].setup.rearWing,2);assert.equal(overview.results[1].run,1);
});
test('Sunday strategy remains editable while qualifying parc ferme still locks the build',()=>{
  let state=createCareer();state.active={id:'review',phase:'qualifyingReview',pending:[]};
  const command=(type,args)=>dispatchCareer(state,{id:type,actorId:state.ownerId,teamId:state.selectedTeam,revision:state.revision,type,args});
  const plan=structuredClone(state.teams.aurora.cars[0].strategy);plan.fuelKg=100;
  state=command('strategy',{slot:0,plan});assert.equal(state.teams.aurora.cars[0].strategy.fuelKg,100);
  assert.throws(()=>command('setup',{slot:0,patch:{rearWing:1}}));
});
test('presentation preferences survive checkpoints without advancing the session or consuming resources',()=>{
  const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)},ctl=createManagerController(storage,{watch:true});ctl.create();const pack=ctl.begin(),fuel=pack.cars[0].fuel;
  ctl.view('brief-practice',{auto:false});ctl.view('grid');ctl.view('live',{paused:true});assert.equal(pack.session.elapsed,0);assert.equal(pack.cars[0].fuel,fuel);
  const restored=createManagerController(storage,{watch:true});assert.equal(restored.state.preferences.weekendAuto,false);assert.equal(restored.state.presentation.paused,true);assert.equal(restored.recover().session.elapsed,0);
});
