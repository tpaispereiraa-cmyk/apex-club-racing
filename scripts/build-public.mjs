import {cp,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {CIRCUITS} from '../circuits.js';

const root=fileURLToPath(new URL('..',import.meta.url)),dist=path.join(root,'dist');
await mkdir(dist,{recursive:true});
const files=(await readdir(root)).filter(name=>name==='index.html'||name.endsWith('.css')||name.endsWith('.js')&&!name.endsWith('.test.js'));
for(const file of files)await cp(path.join(root,file),path.join(dist,file));
await mkdir(path.join(dist,'manager'),{recursive:true});
for(const file of await readdir(path.join(root,'manager')))if(/\.(js|css)$/.test(file)&&!file.endsWith('.test.js'))await cp(path.join(root,'manager',file),path.join(dist,'manager',file));
await mkdir(path.join(dist,'data'),{recursive:true});await cp(path.join(root,'data/CIRCUITS-LICENSE.md'),path.join(dist,'data/CIRCUITS-LICENSE.md'));
// Real route entry files also work on static hosting without SPA rewrite support.
const html=await readFile(path.join(root,'index.html'),'utf8');
for(const route of ['circuitos',...CIRCUITS.flatMap(c=>['assistir/'+c.id,'jogar-manager/'+c.id])]){const folder=path.join(dist,route);await mkdir(folder,{recursive:true});await writeFile(path.join(folder,'index.html'),html);}
await writeFile(path.join(dist,'_headers'),'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n');
console.log(JSON.stringify({output:'dist',circuits:CIRCUITS.length,modes:2,routes:30,personalSavesIncluded:false}));
