import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {CIRCUITS,circuitById} from './circuits.js';
test('the catalogue keeps Interlagos and adds thirteen distinct real circuits',()=>{
  assert.equal(CIRCUITS.length,14);assert.equal(new Set(CIRCUITS.map(c=>c.id)).size,14);
  assert.equal(circuitById('unknown').id,'interlagos');
  assert.equal(circuitById('nurburgring').fullName,'Nürburgring');
});
for(const c of CIRCUITS.slice(1))test(`${c.name}: safe geometry, two qualifying laps, actual grid and complete half-distance race`,{timeout:120000},async()=>{
  const result=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['scripts/check-circuit.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,RACE_CIRCUIT:c.id}});let output='';
    child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('close',code=>resolve({code,output}));
  });
  assert.equal(result.code,0,result.output);
});
