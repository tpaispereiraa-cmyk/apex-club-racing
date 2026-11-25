import {drawCar} from './car-renderer.js';
import {CIRCUIT,W,H} from './track.js';
import {broadcastEvents,interpolateReplay,replayGap,replayPosition,timingReference} from './pilot-replay-timing.js';

const positionPriority={finished:0,driving:1,missing:1,waiting:2,dnf:3};
const formatGap=ms=>ms==null?'—':`+${(ms/1000).toFixed(2)} s`;

function eventText(event,format) {
  if(event.kind==='pass')return `${event.name} ultrapassou ${event.rival}`;
  if(event.kind==='fastest')return `${event.name} fez a melhor volta da corrida · ${format(event.ms)}`;
  if(event.place===1)return `${event.name} venceu a corrida`;
  return `${event.name} cruzou a linha em P${event.place}`;
}

function broadcastShot(positions,passes,time) {
  const imminent=passes.find(event=>event.time-3000<=time&&time<=event.time+3500);
  if(imminent){
    const pair=positions.filter(driver=>driver.pose&&(driver.grid===imminent.grid||driver.grid===imminent.rivalGrid));
    if(pair.length===2)return pair;
  }
  const running=positions.filter(driver=>driver.pose);
  let pair=[], closest=.017;
  for(let i=1;i<running.length;i++){
    const gap=running[i-1].progress-running[i].progress;
    if(gap<closest){closest=gap;pair=running.slice(i-1,i+1);}
  }
  return pair.length?pair:running.slice(0,1);
}

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
        const timeline=laps.map(({ms,frames,valid})=>{
          const start=elapsed;
          elapsed+=ms;
          return {start,end:elapsed,valid:!!valid,frames:frames?JSON.parse(frames):null};
        });
        return {...driver,laps:timeline,duration:elapsed,crossings:timingReference(timeline)};
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
    <header><div><span>${CIRCUIT.name.toUpperCase()}${lap?' · CLASSIFICAÇÃO':''}</span><h2 id="pilot-replay-title">${lap?'Replay da volta':'Assista a corrida'}</h2></div>
    <button type="button" data-close>Fechar</button></header>
    <p role="status">Carregando ${lap?'a volta':'a corrida'}…</p>
    <div class="pilot-replay-content" hidden>
      <div class="pilot-replay-track">
        <canvas aria-label="Replay no circuito ${CIRCUIT.name}"></canvas>
        ${lap?'':`<div class="pilot-broadcast-overlay"><div class="pilot-broadcast-camera" data-shot></div>
          <div class="pilot-broadcast-headline" data-headline role="status" hidden></div></div>`}
      </div>
      <section aria-label="${lap?'Tempo da volta':'Posições na corrida'}"><h3>${lap?'Piloto':'Posições'}</h3><ol data-positions></ol>
      ${lap?'':'<div class="pilot-broadcast-events" hidden><h3>Momentos da corrida</h3><ul data-events></ul></div>'}</section>
    </div>
    <div class="pilot-replay-controls" hidden>
      <button type="button" data-play>Reproduzir</button>
      <label class="pilot-replay-timeline"><span>Tempo da ${lap?'volta':'corrida'}</span><input type="range" min="0" value="0" step="1"><output></output></label>
      <label>Velocidade <select data-speed><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
      <label>Câmera <select data-camera>${lap?'':'<option value="broadcast">Direção automática</option>'}<option value="leader">${lap?'Seguir piloto':'Líder'}</option><option value="map">Circuito inteiro</option></select></label>
    </div>`;
  ui.append(dialog);
  const $=selector=>dialog.querySelector(selector);
  let animation=0;
  dialog.addEventListener('close',()=>{cancelAnimationFrame(animation);dialog.remove();},{once:true});
  $('[data-close]').onclick=()=>dialog.close();
  dialog.showModal();

  const status=dialog.querySelector(':scope > [role=status]');
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
    const canvas=$('canvas'), ctx=canvas.getContext('2d'), list=$('[data-positions]');
    const seek=$('input'), clock=$('output'), play=$('[data-play]'), speed=$('[data-speed]'), view=$('[data-camera]');
    const duration=Math.max(...drivers.map(driver=>driver.delay+driver.duration));
    const events=lap?[]:broadcastEvents(drivers,duration);
    const passes=events.filter(event=>event.kind==='pass');
    const shotLabel=$('[data-shot]'), headline=$('[data-headline]'), feed=$('[data-events]');
    seek.max=duration;
    for(const driver of lap?[]:drivers){
      const option=new Option(driver.name,String(driver.grid));
      view.add(option);
    }
    let time=0, previous=0, playing=!!lap, refreshAt=0;
    if(playing)play.textContent='Pausar';
    let camera, shotKey, lastEvent;
    play.onclick=()=>{
      if(time>=duration)time=0;
      playing=!playing;
      play.textContent=playing?'Pausar':'Reproduzir';
    };
    seek.oninput=()=>{time=Number(seek.value);camera=null;refreshAt=0;};
    view.onchange=()=>{camera=null;refreshAt=0;};
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
      const focus=view.value==='broadcast'?broadcastShot(positions,passes,time)
        : view.value==='leader'?positions.filter(driver=>driver.pose).slice(0,1)
          : positions.filter(driver=>driver.pose&&String(driver.grid)===view.value);
      if(now>=refreshAt){
        const leader=positions[0];
        list.replaceChildren(...positions.map((driver,index)=>{
          const item=document.createElement('li');
          const name=document.createElement('b'), label=document.createElement('small');
          name.textContent=driver.name;
          name.style.borderColor=driver.livery.accent;
          label.textContent=lap?format(driver.official):{waiting:`Grid P${driver.grid} · +${(driver.delay/1000).toLocaleString('pt-BR')} s`,
            driving:`Volta ${Math.floor(driver.progress)+1}/${limit}`,finished:format(driver.official),
            missing:'Volta sem gravação',dnf:`Abandono · ${driver.completed}/${limit}`}[driver.status];
          item.append(name,label);
          if(!lap&&index>0&&['driving','finished'].includes(driver.status)){
            const gap=document.createElement('small');
            gap.className='pilot-broadcast-gaps';
            const toLeader=formatGap(replayGap(driver,leader,time));
            gap.textContent=index===1?`Líder ${toLeader}`
              : `Líder ${toLeader} · À frente ${formatGap(replayGap(driver,positions[index-1],time))}`;
            item.append(gap);
          }
          return item;
        }));
        if(!lap){
          if(focus.length===2){
            const [ahead,behind]=focus;
            const gap=replayGap(behind,ahead,time);
            const metres=Math.round((ahead.progress-behind.progress)*CIRCUIT.metres);
            shotLabel.textContent=`Disputa · ${ahead.name} × ${behind.name} · ~${metres} m${gap==null?'':` · ${formatGap(gap)}`}`;
          }else shotLabel.textContent=focus.length?`Câmera · ${focus[0].name}`:CIRCUIT.name;
          const eventIndex=events.findLastIndex(event=>event.time<=time);
          const event=events[eventIndex];
          const active=event&&time-event.time<4500;
          headline.hidden=!active;
          if(event!==lastEvent){
            lastEvent=event;
            headline.textContent=event?eventText(event,format):'';
            headline.dataset.kind=event?.kind??'';
            feed.parentElement.hidden=!event;
            feed.replaceChildren(...events.slice(Math.max(0,eventIndex-3),eventIndex+1).reverse().map(event=>{
              const item=document.createElement('li'), stamp=document.createElement('time');
              stamp.textContent=format(event.time);
              item.append(stamp,document.createTextNode(eventText(event,format)));
              return item;
            }));
          }
        }
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
      const first=focus[0]?.pose,second=focus[1]?.pose;
      const target=second?{x:(first.x+second.x)/2,y:(first.y+second.y)/2}:first;
      const fit=Math.min(width/W,height/H)*.97;
      const closeZoom=Math.min(width,height)/850;
      const battleZoom=second?Math.min(width*.7/(Math.abs(first.x-second.x)+120),height*.65/(Math.abs(first.y-second.y)+120)):Infinity;
      const zoom=target?Math.max(fit,Math.min(closeZoom,battleZoom)):fit;
      if(target){
        const key=focus.map(driver=>driver.grid).sort().join('/');
        if(!camera||key!==shotKey)camera={x:target.x,y:target.y};
        shotKey=key;
        camera.x+=(target.x-camera.x)*.16;
        camera.y+=(target.y-camera.y)*.16;
      }else camera=null;
      ctx.save();
      ctx.translate(width/2,height/2);
      ctx.scale(zoom,zoom);
      ctx.translate(-(camera?.x??W/2),-(camera?.y??H/2));
      ctx.drawImage(world,0,0,W,H);
      if(second){
        ctx.save();
        ctx.setLineDash([5/zoom,5/zoom]);
        ctx.strokeStyle='#d5f561a0';
        ctx.lineWidth=1.5/zoom;
        ctx.beginPath();ctx.moveTo(first.x,first.y);ctx.lineTo(second.x,second.y);ctx.stroke();
        ctx.restore();
      }
      for(const {livery,pose,name} of positions){
        if(!pose)continue;
        drawCar(ctx,{...pose,compound:'medium',number:livery.number,
          team:{color:livery.primary,secondary:livery.secondary,accent:livery.accent,pattern:livery.pattern}},
        {scale:Math.max(1,.18/zoom)});
        if(!lap&&(focus.length===0||focus.some(driver=>driver.pose===pose))){
          ctx.font=`bold ${11/zoom}px sans-serif`;
          ctx.textAlign='center';
          ctx.lineWidth=3/zoom;
          ctx.strokeStyle='#0b1510';
          ctx.fillStyle=livery.accent;
          ctx.strokeText(name,pose.x,pose.y-17/zoom);
          ctx.fillText(name,pose.x,pose.y-17/zoom);
        }
      }
      ctx.restore();
      animation=requestAnimationFrame(draw);
    }
    animation=requestAnimationFrame(draw);
  }catch(error){
    status.textContent=error.message;
  }
}
