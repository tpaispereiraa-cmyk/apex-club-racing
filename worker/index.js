import assets from './assets.js';
import {practiceAPI} from './practice-api.js';

const page = /^\/(?:circuitos|pilotar|assistir\/[a-z-]+|jogar-manager\/[a-z-]+)\/?$/;
export default {
  async fetch(request,env) {
    const {pathname} = new URL(request.url);
    if (pathname === '/api/practice' || pathname.startsWith('/api/practice/')) {
      try { return await practiceAPI(request,env); }
      catch(error) {
        console.error('practice:',error.message);
        return Response.json({error:'Banco de treino indisponível. Tente novamente.'},{status:503,headers:{'Cache-Control':'no-store'}});
      }
    }
    if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
    const key = pathname==='/' || page.test(pathname) ? '/index.html' : pathname;
    const asset = Object.hasOwn(assets,key) ? assets[key] : null;
    if (!asset) return new Response('Not found',{status:404});
    const body=request.method==='HEAD'?null:asset.binary?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body;
    return new Response(body,{headers:{
      'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'strict-origin-when-cross-origin'
    }});
  }
};
