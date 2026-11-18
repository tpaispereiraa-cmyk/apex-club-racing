import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const port=Number(process.env.PORT??5173);
const root=fileURLToPath(new URL('.',import.meta.url));
http.createServer(async(req,res)=>{try{const p=decodeURIComponent(req.url.split('?')[0]);const routed=/^\/(circuitos\/?|assistir\/[^/]+\/?|jogar-manager\/[^/]+\/?)$/.test(p);const file=p==='/'||routed?'index.html':p.slice(1);if(file.includes('..'))throw Error();const body=await readFile(root+file);res.setHeader('Content-Type',({'html':'text/html; charset=utf-8','js':'text/javascript','css':'text/css'})[file.split('.').pop()]||'application/octet-stream');res.end(body);}catch{res.writeHead(404);res.end('Not found');}}).listen(port,'127.0.0.1',()=>console.log('APEX CLUB · http://127.0.0.1:'+port));
