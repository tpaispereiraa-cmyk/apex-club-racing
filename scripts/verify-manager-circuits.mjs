import {spawnSync} from 'node:child_process';
import {CIRCUITS} from '../circuits.js';
for(const c of CIRCUITS){const result=spawnSync(process.execPath,['scripts/verify-manager.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,RACE_CIRCUIT:c.id},encoding:'utf8'});process.stdout.write(result.stdout);if(result.status!==0){process.stderr.write(result.stderr);process.exitCode=1;}}
