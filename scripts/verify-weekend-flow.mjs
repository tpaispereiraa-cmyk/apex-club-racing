import {createManagerController} from '../manager/controller.js';
import {simulateField} from '../race-ai.js';
import {sessionComplete} from '../weekend.js';
import {circuitRecords} from '../weekend-archive.js';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
const ctl=createManagerController(storage);ctl.create('aurora','Aurora GP');ctl.state.calendar=['interlagos',...ctl.state.calendar.filter(id=>id!=='interlagos')];
const output=new URL('../artifacts/weekend/',import.meta.url);await mkdir(output,{recursive:true});
function run(pack){let elapsed=0;pack.session.weather='dry';while(elapsed<6500&&!sessionComplete(pack.cars)){elapsed+=1/30;simulateField(pack.cars,1/30,elapsed,pack.session);}assert.ok(sessionComplete(pack.cars));ctl.checkpoint(pack.cars,pack.session,elapsed);return pack;}
let pack=run(ctl.begin());ctl.finishPractice(pack.cars);ctl.view('practice-report');await writeFile(new URL('practice-save.json',output),ctl.export());
assert.equal(ctl.state.active.archive.practice.length,1);
pack=run(ctl.toQualifying());ctl.completeQualifying(pack.cars);ctl.view('qualifying-report');await writeFile(new URL('qualifying-save.json',output),ctl.export());
assert.equal(ctl.state.active.phase,'qualifyingReview');assert.equal(ctl.state.active.archive.qualifying.results.length,20);
pack=ctl.toRace(pack.cars);const grid=ctl.state.active.grid;
for(const c of pack.cars)assert.equal(c.grid,grid.findIndex(g=>g.id===c.id));
const fuel=pack.cars[0].fuel;ctl.view('grid');assert.equal(pack.cars[0].fuel,fuel);assert.equal(pack.session.elapsed,0);
run(pack);const id=ctl.state.active.id;ctl.finish(pack.cars);const revision=ctl.state.revision;ctl.finish(pack.cars);assert.equal(ctl.state.revision,revision);
assert.equal(ctl.state.archives.length,1);const archive=ctl.state.archives[0];assert.equal(archive.id,id);assert.equal(archive.race.results.length,20);
assert.ok(archive.race.results.every(r=>r.retired||r.lapTimes.length===36));
assert.ok(archive.race.results.some(r=>r.pitHistory.length>0));assert.ok(archive.race.events.length>12);
assert.equal(archive.race.results.reduce((n,r)=>n+r.points,0),101);
assert.ok(archive.race.results.some(r=>r.lapDetails.some(l=>l.condition==='dry')));
assert.ok(circuitRecords(ctl.state).practice&&circuitRecords(ctl.state).qualifying&&circuitRecords(ctl.state).race);
await writeFile(new URL('race-save.json',output),ctl.export());
const restored=createManagerController(storage);assert.equal(restored.state.archives[0].race.results.length,20);
console.log(JSON.stringify({sessions:archive.practice.length+2,drivers:20,raceLaps:36,events:archive.race.events.length,points:101,fixtures:'artifacts/weekend',status:'passed'}));
