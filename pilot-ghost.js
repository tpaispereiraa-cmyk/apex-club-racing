import {drawCar} from './car-renderer.js';
import {interpolateReplay} from './pilot-replay-timing.js';
import {length} from './track.js';

export function createPilotGhost(ui,getState) {
  const status=ui.querySelector('#pilot-ghost-status');
  let recording=null, loading=0;
  return {
    async load(mode,phase){
      const request=++loading;recording=null;status.hidden=mode==='off'||!['practice','qualifying'].includes(phase);
      if(status.hidden)return;
      status.textContent='Carregando fantasma…';
      try{
        const report=await getState('/telemetry');
        const entries=(report.sessions.find(s=>s.id===phase)?.entries??[]).sort((a,b)=>a.best.ms-b.best.ms);
        const index=entries.findIndex(e=>e.me);
        const target=mode==='self'?entries[index]:mode==='next'?(index>0?entries[index-1]:index<0?entries.at(-1):null):entries[0];
        if(request!==loading)return;
        if(!target?.best.replayId){status.textContent=mode==='next'&&index===0?'Você lidera esta sessão.':'Referência sem gravação disponível nesta sessão.';return;}
        const params=new URLSearchParams({lap:target.best.replayId,phase});
        const result=await getState('/lap-replay?'+params);
        if(request!==loading)return;
        const frames=JSON.parse(result.frames);
        let furthest=-1;
        const crossings=frames.filter(frame=>{if(frame[4]<=furthest)return false;furthest=frame[4];return true;});
        recording={...result,frames,crossings,setup:target.best.setup};
        const setup=target.best.setup;
        status.title=setup?`Acerto da referência · asas ${setup.frontWing}/${setup.rearWing} · antirrolagem ${setup.antiRoll} · freio ${setup.brakeBias}% · altura ${setup.rideHeight} mm`:'Acerto da referência sem registro';
        status.textContent=`Fantasma · ${result.name} · ${(result.ms/1000).toFixed(3)} s`;
      }catch{if(request===loading)status.textContent='Fantasma indisponível. Você pode seguir pilotando.';}
    },
    draw(ctx,car,opacity,enabled){
      if(!enabled||!recording||!car||car.start===null)return;
      const time=Math.max(0,(car.elapsed-car.start)*1000);
      if(time>recording.ms)return;
      const pose=interpolateReplay(recording.frames,time),p=recording.livery;
      ctx.save();ctx.globalAlpha=opacity;
      drawCar(ctx,{...pose,number:p.number,compound:'medium',team:{color:p.primary,secondary:p.secondary,accent:p.accent,pattern:p.pattern}});
      ctx.restore();
    },
    update(car){
      if(!recording||car.start===null)return;
      const time=(car.elapsed-car.start)*1000;
      const start=car.gate-car.sector*length/8;
      const progress=Math.max(0,Math.min(10000,(car.progress-start)/length*10000));
      const frames=recording.crossings;
      let lo=0,hi=frames.length-1;
      while(hi-lo>1){const mid=(lo+hi)>>1;if(frames[mid][4]<=progress)lo=mid;else hi=mid;}
      const a=frames[lo],b=frames[hi];
      if(progress<a[4]||progress>b[4]||a[4]===b[4])return;
      const reference=a[0]+(b[0]-a[0])*(progress-a[4])/(b[4]-a[4]);
      const delta=(time-reference)/1000;
      status.textContent=`Fantasma · ${recording.name} · ${delta>0?'+':''}${delta.toFixed(3)} s`;
      status.dataset.trend=delta<=0?'gain':'loss';
    },
    clear(){loading++;recording=null;status.hidden=true;}
  };
}
