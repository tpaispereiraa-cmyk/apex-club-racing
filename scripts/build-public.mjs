import {cp,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {CIRCUITS} from '../circuits.js';

const root=fileURLToPath(new URL('..',import.meta.url)),dist=path.join(root,'dist');
await mkdir(dist,{recursive:true});
const assets=Object.create(null);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.md':'text/plain; charset=utf-8'};
async function add(file){
  await cp(path.join(root,file),path.join(dist,file));
  assets['/'+file]={type:types[path.extname(file)],body:await readFile(path.join(root,file),'utf8')};
}
const files=(await readdir(root)).filter(name=>name==='index.html'||name.endsWith('.css')||name.endsWith('.js')&&!name.endsWith('.test.js'));
for(const file of files)await add(file);
await mkdir(path.join(dist,'manager'),{recursive:true});
for(const file of await readdir(path.join(root,'manager')))if(/\.(js|css)$/.test(file)&&!file.endsWith('.test.js'))await add('manager/'+file);
await mkdir(path.join(dist,'data'),{recursive:true});await add('data/CIRCUITS-LICENSE.md');
// Real route entry files also work on static hosting without SPA rewrite support.
const html=await readFile(path.join(root,'index.html'),'utf8');
for(const route of ['circuitos','pilotar',...CIRCUITS.flatMap(c=>['assistir/'+c.id,'jogar-manager/'+c.id])]){const folder=path.join(dist,route);await mkdir(folder,{recursive:true});await writeFile(path.join(folder,'index.html'),html);}
await writeFile(path.join(dist,'_headers'),'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n');
const server=path.join(dist,'server');
await mkdir(server,{recursive:true});
const api=(await readFile(path.join(root,'worker/practice-api.js'),'utf8')).replace('export async function practiceAPI','async function practiceAPI');
const worker=(await readFile(path.join(root,'worker/index.js'),'utf8')).replace(/^import .*?;\r?\n/gm,'');
await writeFile(path.join(server,'index.js'),`const assets = ${JSON.stringify(assets)};\n${api}\n${worker}`);
console.log(JSON.stringify({output:'dist',circuits:CIRCUITS.length,modes:3,routes:31,personalSavesIncluded:false}));
