import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSaveStorage} from './manager/storage.js';
import {createManagerController} from './manager/controller.js';
import {simulateField} from './race-ai.js';

function memoryStorage(){const data=new Map();return{data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
function backend(){const data=new Map();return{data,read:async k=>data.get(k)??null,write:async(k,v)=>{data.set(k,v);}};}
const quota=()=>Object.assign(Error('Quota exceeded'),{name:'QuotaExceededError'});
test('existing saves migrate only after a successful database commit, preserving both modes',async()=>{
  const legacy=memoryStorage(),db=backend();legacy.setItem('apex-career-v1','manager-old');legacy.setItem('apex-watch-v2','watch-old');legacy.setItem('unrelated','keep');
  const store=await createSaveStorage({legacy,backend:db});assert.equal(store.getItem('apex-career-v1'),'manager-old');
  const pending=store.setItem('apex-watch-v2','watch-new');assert.equal(legacy.getItem('apex-watch-v2'),'watch-old');await pending;
  assert.equal(legacy.getItem('apex-watch-v2'),null);assert.equal(legacy.getItem('apex-career-v1'),'manager-old');assert.equal(legacy.getItem('unrelated'),'keep');
  const reloaded=await createSaveStorage({legacy,backend:db});assert.equal(reloaded.getItem('apex-watch-v2'),'watch-new');assert.equal(reloaded.getItem('apex-career-v1'),'manager-old');
});
test('large checkpoints bypass the localStorage quota and survive reload',async()=>{
  const legacy={getItem:()=>null,setItem:()=>{throw quota();}},db=backend(),store=await createSaveStorage({legacy,backend:db});
  const raw='x'.repeat(6*1024*1024);await store.setItem('apex-watch-v2',raw);
  const reloaded=await createSaveStorage({legacy,backend:db});assert.equal(reloaded.getItem('apex-watch-v2'),raw);
});
test('database failure preserves the old save and reload prefers a newer successful fallback',async()=>{
  const legacy=memoryStorage(),db=backend();db.data.set('apex-career-v1',{storageVersion:1,raw:'older-db',savedAt:1});
  db.write=async()=>{throw Error('Database unavailable');};const store=await createSaveStorage({legacy,backend:db});await store.setItem('apex-career-v1','newer-local');
  const reloaded=await createSaveStorage({legacy,backend:db});assert.equal(reloaded.getItem('apex-career-v1'),'newer-local');
  legacy.setItem=()=>{throw quota();};await assert.rejects(store.setItem('apex-career-v1','in-memory-only'));
  assert.equal((await createSaveStorage({legacy,backend:db})).getItem('apex-career-v1'),'newer-local');
});
test('asynchronous writes remain ordered and capture distinct revisions',async()=>{
  const values=[],db=backend();db.write=async(key,record)=>{await Promise.resolve();values.push(record.raw);db.data.set(key,record);};
  const store=await createSaveStorage({backend:db});await Promise.all([store.setItem('apex-watch-v2','first'),store.setItem('apex-watch-v2','second')]);
  assert.deepEqual(values,['first','second']);assert.equal((await createSaveStorage({backend:db})).getItem('apex-watch-v2'),'second');
});
test('a rejected checkpoint does not stop simulation, keeps the previous save and can retry',()=>{
  const storage=memoryStorage(),ctl=createManagerController(storage,{watch:true});ctl.create();const pack=ctl.begin(),previous=storage.getItem('apex-career-v1'),write=storage.setItem;
  storage.setItem=()=>{throw quota();};simulateField(pack.cars,1/30,1/30,pack.session);
  assert.equal(ctl.checkpoint(pack.cars,pack.session,1/30),false);assert.equal(ctl.persistence.status,'memory');assert.equal(ctl.persistence.errorName,'QuotaExceededError');assert.equal(storage.getItem('apex-career-v1'),previous);
  const before=pack.cars[0].s;for(let i=2;i<60;i++)simulateField(pack.cars,1/30,i/30,pack.session);assert.ok(pack.cars[0].s>before);
  storage.setItem=write;assert.equal(ctl.retrySave(),true);assert.equal(ctl.persistence.status,'saved');assert.equal(createManagerController(storage,{watch:true}).recover().elapsed,1/30);
});
test('asynchronous storage rejection is handled and recovery writes the current in-memory state',async()=>{
  const storage=memoryStorage(),write=storage.setItem;storage.setItem=()=>Promise.reject(quota());
  const ctl=createManagerController(storage,{watch:true});assert.doesNotThrow(()=>ctl.create());assert.equal(await ctl.retrySave(),false);assert.equal(ctl.persistence.status,'memory');
  const pack=ctl.begin();assert.equal(await ctl.checkpoint(pack.cars,pack.session,12),false);
  storage.setItem=async(k,v)=>write(k,v);assert.equal(await ctl.retrySave(),true);
  assert.equal(createManagerController(storage,{watch:true}).recover().elapsed,12);
});
