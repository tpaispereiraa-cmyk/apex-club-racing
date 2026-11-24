export function interpolateReplay(frames,ms) {
  let lower=0,upper=frames.length-1;
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

export function timingReference(laps) {
  return laps.map(({frames})=>{
    if(!frames)return null;
    const crossings=[];
    let furthest=-1;
    for(const [time,,,,progress] of frames){
      if(progress<=furthest)continue;
      crossings.push([progress,time]);
      furthest=progress;
    }
    return crossings;
  });
}

function crossingTime(driver,progress) {
  const lapIndex=Math.floor(progress);
  if(progress===lapIndex){
    const boundary=lapIndex===0?0:driver.laps[lapIndex-1]?.end;
    return boundary==null?null:driver.delay+boundary;
  }
  const crossings=driver.crossings[lapIndex];
  if(!crossings)return null;
  const distance=(progress-lapIndex)*10000;
  let low=0,high=crossings.length-1;
  if(distance<crossings[low][0]||distance>crossings[high][0])return null;
  while(high-low>1){
    const mid=(low+high)>>1;
    if(crossings[mid][0]<distance)low=mid;
    else high=mid;
  }
  const [from,at]=crossings[low],[to,until]=crossings[high];
  const elapsed=to===from?at:at+(until-at)*(distance-from)/(to-from);
  return driver.delay+driver.laps[lapIndex].start+elapsed;
}

export function replayGap(behind,ahead,time) {
  if(!ahead||behind.grid===ahead.grid)return null;
  if(behind.status==='finished'&&ahead.status==='finished')return behind.official-ahead.official;
  if(behind.status!=='driving'||!['driving','finished'].includes(ahead.status))return null;
  if(ahead.progress<behind.progress)return null;
  const passedAt=crossingTime(ahead,behind.progress);
  return passedAt==null?null:Math.max(0,time-passedAt);
}

export function broadcastEvents(drivers,duration) {
  const events=[];
  const completed=drivers.flatMap(driver=>driver.laps.map((lap,index)=>({
    driver,index,ms:lap.end-lap.start,valid:lap.valid,time:driver.delay+lap.end
  }))).sort((a,b)=>a.time-b.time||a.driver.grid-b.driver.grid);
  let fastest=Infinity;
  for(const lap of completed){
    if(!lap.valid||lap.ms>=fastest)continue;
    fastest=lap.ms;
    events.push({kind:'fastest',time:lap.time,grid:lap.driver.grid,name:lap.driver.name,ms:lap.ms,lap:lap.index+1});
  }
  const finishers=drivers.filter(driver=>driver.official!=null).sort((a,b)=>a.official-b.official||a.grid-b.grid);
  finishers.forEach((driver,index)=>events.push({
    kind:'finish',time:driver.official,grid:driver.grid,name:driver.name,place:index+1
  }));

  const orderAt=time=>drivers.map(driver=>({driver,...replayPosition(driver,time)}))
    .filter(position=>position.status==='driving')
    .sort((a,b)=>b.progress-a.progress||a.driver.grid-b.driver.grid);
  const step=Math.max(250,Math.ceil(duration/24000));
  const lastPass=new Map();
  let previous=orderAt(0);
  for(let time=step;time<duration;time+=step){
    const current=orderAt(time);
    const prior=new Map(previous.map((position,index)=>[position.driver.grid,{...position,index}]));
    for(let i=0;i<current.length-1;i++){
      const ahead=current[i],behind=current[i+1];
      const a=prior.get(ahead.driver.grid),b=prior.get(behind.driver.grid);
      if(!a||!b||a.index<=b.index||b.progress-a.progress>.025||ahead.progress-behind.progress>.025)continue;
      const key=[ahead.driver.grid,behind.driver.grid].sort((x,y)=>x-y).join('/');
      if(time-(lastPass.get(key)??-Infinity)<5000)continue;
      const later=replayPosition(ahead.driver,time+1250);
      const opponent=replayPosition(behind.driver,time+1250);
      if(later.status!=='driving'||opponent.status!=='driving'||later.progress-opponent.progress<.00015)continue;
      const oldGap=b.progress-a.progress,newGap=ahead.progress-behind.progress;
      const crossing=time-step+step*oldGap/(oldGap+newGap||1);
      events.push({kind:'pass',time:Math.round(crossing),grid:ahead.driver.grid,name:ahead.driver.name,
        rivalGrid:behind.driver.grid,rival:behind.driver.name});
      lastPass.set(key,time);
    }
    previous=current;
  }
  return events.sort((a,b)=>a.time-b.time);
}
