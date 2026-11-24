import {drawCar} from './car-renderer.js';
import {W,H} from './track.js';

export function interpolateReplay(frames,ms) {
  let lower=0, upper=frames.length-1;
  while(upper-lower>1){
    const mid=(lower+upper)>>1;
    if(frames[mid][0]<=ms)lower=mid;
    else upper=mid;
  }
  const [start,x,y,angle,progress]=frames[lower];
  const [end,nextX,nextY,nextAngle,nextProgress]=frames[upper];
  const portion=Math.max(0,Math.min(1,(ms-start)/(end-start)));
  const turn=(nextAngle-angle)/1000;
  return {x:x+(nextX-x)*portion,y:y+(nextY-y)*portion,
    angle:angle/1000+Math.atan2(Math.sin(turn),Math.cos(turn))*portion,
    progress:(progress+(nextProgress-progress)*portion)/10000};
}

export function replayPosition(driver,time) {
  if(time<driver.delay)return {status:'waiting',progress:0};
  const elapsed=time-driver.delay;
  if(elapsed>=driver.duration)return {status:driver.official==null?'dnf':'finished',progress:driver.completed};
  const index=driver.laps.findIndex(lap=>lap.end>elapsed);
  const lap=driver.laps[index];
  if(!lap.frames)return {status:'missing',progress:index};
  const pose=interpolateReplay(lap.frames,elapsed-lap.start);
  return {status:'driving',progress:index+pose.progress,pose};
}

const positionPriority={finished:0,driving:1,missing:1,waiting:2,dnf:3};

export function openRaceReplay(ui,world,getState,format) {
  return openReplay(ui,world,getState,format);
}

export function openQualifyingReplay(ui,world,getState,format,lap) {
  return openReplay(ui,world,getState,format,lap);
}

async function loadReplay(getState,lap,isOpen) {
  if(lap){
    const {name,livery,ms,frames}=await getState(`/qualifying-replay?lap=${encodeURIComponent(lap)}`);
    return {limit:1,drivers:[{name,livery,grid:1,delay:0,duration:ms,official:ms,recorded:1,completed:1,
      laps:[{start:0,end:ms,frames:JSON.parse(frames)}]}],unavailable:false};
  }
  const manifest=await getState('/replay');
  const drivers=[];
  let unavailable=false;
  for(let i=0;i<manifest.drivers.length&&isOpen();i+=4){
    const batch=await Promise.all(manifest.drivers.slice(i,i+4).map(async driver=>{
      let elapsed=0;
      try{
        const {laps}=await getState(`/replay?grid=${driver.grid}`);
        const timeline=laps.map(({ms,frames})=>{
          const start=elapsed;
          elapsed+=ms;
          return {start,end:elapsed,frames:frames?JSON.parse(frames):null};
        });
        return {...driver,laps:timeline,duration:elapsed};
      }catch{
        unavailable=true;
        return null;
      }
    }));
    drivers.push(...batch.filter(Boolean));
  }
  return {drivers,limit:manifest.limit,unavailable};
}

async function openReplay(ui,world,getState,format,lap) {
  const dialog=document.createElement('dialog');
  dialog.className='pilot-replay';
  dialog.setAttribute('aria-labelledby','pilot-replay-title');
  dialog.innerHTML=`
    <header><div><span>GP DE INTERLAGOS${lap?' · CLASSIFICAÇÃO':''}</span><h2 id="pilot-replay-title">${lap?'Replay da volta':'Assista a corrida'}</h2></div>
    <button type="button" data-close>Fechar</button></header>
    <p role="status">Carregando ${lap?'a volta':'a corrida'}…</p>
    <div class="pilot-replay-content" hidden>
      <canvas aria-label="Replay no circuito de Interlagos"></canvas>
      <section aria-label="${lap?'Tempo da volta':'Posições na corrida'}"><h3>${lap?'Piloto':'Posições'}</h3><ol></ol></section>
    </div>
    <div class="pilot-replay-controls" hidden>
      <button type="button" data-play>Reproduzir</button>
      <label class="pilot-replay-timeline"><span>Tempo da ${lap?'volta':'corrida'}</span><input type="range" min="0" value="0" step="1"><output></output></label>
      <label>Velocidade <select data-speed><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
      <label>Câmera <select data-camera><option value="leader">${lap?'Seguir piloto':'Líder'}</option><option value="map">Circuito inteiro</option></select></label>
    </div>`;
  ui.append(dialog);
  const $=selector=>dialog.querySelector(selector);
  let animation=0;
  dialog.addEventListener('close',()=>{cancelAnimationFrame(animation);dialog.remove();},{once:true});
  $('[data-close]').onclick=()=>dialog.close();
  dialog.showModal();

  const status=$('[role=status]');
  try{
    const {drivers,limit,unavailable}=await loadReplay(getState,lap,()=>dialog.open);
    if(!dialog.open)return;
    if(!drivers.some(driver=>driver.recorded)){
      status.textContent=unavailable?'Não foi possível carregar as gravações. Feche e tente novamente.':'Ainda não há voltas gravadas para reproduzir.';
      return;
    }
    const partial=unavailable||drivers.some(driver=>driver.recorded<driver.completed);
    status.hidden=!partial;
    status.textContent='Algumas voltas estão sem gravação. Os tempos oficiais continuam no resultado do GP.';
    $('.pilot-replay-content').hidden=false;
    $('.pilot-replay-controls').hidden=false;
    const canvas=$('canvas'), ctx=canvas.getContext('2d'), list=$('ol');
    const seek=$('input'), clock=$('output'), play=$('[data-play]'), speed=$('[data-speed]'), view=$('[data-camera]');
    const duration=Math.max(...drivers.map(driver=>driver.delay+driver.duration));
    seek.max=duration;
    for(const driver of lap?[]:drivers){
      const option=new Option(driver.name,String(driver.grid));
      view.add(option);
    }
    let time=0, previous=0, playing=!!lap, refreshAt=0;
    if(playing)play.textContent='Pausar';
    let camera;
    play.onclick=()=>{
      if(time>=duration)time=0;
      playing=!playing;
      play.textContent=playing?'Pausar':'Reproduzir';
    };
    seek.oninput=()=>{time=Number(seek.value);camera=null;refreshAt=0;};
    view.onchange=()=>{camera=null;};
    function draw(now) {
      if(playing)time=Math.min(duration,time+Math.min(100,now-(previous||now))*Number(speed.value));
      previous=now;
      if(time>=duration&&playing){playing=false;play.textContent='Rever';}
      seek.value=Math.round(time);
      clock.textContent=`${format(Math.round(time))} / ${format(duration)}`;
      const positions=drivers.map(driver=>{
        const position=replayPosition(driver,time);
        if(lap&&position.status==='finished')position.pose=interpolateReplay(driver.laps[0].frames,driver.duration);
        return {...driver,...position};
      }).sort((a,b)=>
        positionPriority[a.status]-positionPriority[b.status]
        || (a.status==='finished'&&b.status==='finished'?a.official-b.official:b.progress-a.progress)
        || a.grid-b.grid);
      if(now>=refreshAt){
        list.replaceChildren(...positions.map(driver=>{
          const item=document.createElement('li');
          const name=document.createElement('b'), label=document.createElement('small');
          name.textContent=driver.name;
          name.style.borderColor=driver.livery.accent;
          label.textContent=lap?format(driver.official):{waiting:`Grid P${driver.grid} · +${driver.delay/1000}s`,
            driving:`Volta ${Math.floor(driver.progress)+1}/${limit}`,finished:format(driver.official),
            missing:'Volta sem gravação',dnf:`Abandono · ${driver.completed}/${limit}`}[driver.status];
          item.append(name,label);
          return item;
        }));
        refreshAt=now+250;
      }
      const width=canvas.clientWidth,height=canvas.clientHeight;
      if(!width||!height){animation=requestAnimationFrame(draw);return;}
      const density=Math.min(2,devicePixelRatio||1);
      if(canvas.width!==Math.round(width*density)||canvas.height!==Math.round(height*density)){
        canvas.width=Math.round(width*density);
        canvas.height=Math.round(height*density);
      }
      ctx.setTransform(density,0,0,density,0,0);
      ctx.fillStyle='#24392b';
      ctx.fillRect(0,0,width,height);
      const target=view.value==='leader'?positions.find(driver=>driver.pose)?.pose
        : positions.find(driver=>String(driver.grid)===view.value)?.pose;
      const fit=Math.min(width/W,height/H)*.97;
      const zoom=target?Math.max(fit,Math.min(width,height)/850):fit;
      if(target){
        if(!camera)camera={x:target.x,y:target.y};
        camera.x+=(target.x-camera.x)*.16;
        camera.y+=(target.y-camera.y)*.16;
      }else camera=null;
      ctx.save();
      ctx.translate(width/2,height/2);
      ctx.scale(zoom,zoom);
      ctx.translate(-(camera?.x??W/2),-(camera?.y??H/2));
      ctx.drawImage(world,0,0,W,H);
      for(const {livery,pose} of positions){
        if(!pose)continue;
        drawCar(ctx,{...pose,compound:'medium',number:livery.number,
          team:{color:livery.primary,secondary:livery.secondary,accent:livery.accent,pattern:livery.pattern}},
        {scale:Math.max(1,.18/zoom)});
      }
      ctx.restore();
      animation=requestAnimationFrame(draw);
    }
    animation=requestAnimationFrame(draw);
  }catch(error){
    status.textContent=error.message;
  }
}
