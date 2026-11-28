import {clamp} from './track.js';

const shifts = [27,39,51,64,77,90,105];

export function engineRevs(speed, gear = 1, throttle = 0) {
  let next=clamp(gear,1,shifts.length);
  while(next<shifts.length&&speed>=shifts[next-1])next++;
  while(next>1&&speed<shifts[next-2]*.86)next--;
  const rpm=2650+10900*clamp(speed/shifts[next-1],0,1.07)+throttle*450;
  return {gear:next,rpm};
}

export function createRacingAudio() {
  let audio,engine,music,engineLevel,musicLevel,filter,ready;
  let enabled=false,gear=1;
  async function prepare(context) {
    const load=async name=>{
      const response=await fetch('/assets/audio/'+name);
      if(!response.ok)throw Error('Áudio indisponível');
      return context.decodeAudioData(await response.arrayBuffer());
    };
    const start=(buffer,destination)=>{
      const source=context.createBufferSource();
      source.buffer=buffer;
      source.loop=true;
      source.connect(destination);
      source.start();
      return source;
    };
    const gain=()=>{
      const node=context.createGain();node.gain.value=0;node.connect(context.destination);return node;
    };
    const [motor,track]=await Promise.allSettled([load('engine.wav'),load('pure-raceway.ogg')]);
    engineLevel=gain();musicLevel=gain();
    filter=context.createBiquadFilter();
    filter.type='lowpass';filter.frequency.value=650;filter.connect(engineLevel);
    if(motor.status==='fulfilled')engine=start(motor.value,filter);
    if(track.status==='fulfilled')music=start(track.value,musicLevel);
    return !!(engine||music);
  }
  return {
    get enabled(){return enabled;},
    notifyDRS(){
      if(!enabled||audio?.state!=='running')return;
      const oscillator=audio.createOscillator(),volume=audio.createGain(),now=audio.currentTime;
      oscillator.frequency.setValueAtTime(880,now);oscillator.frequency.setValueAtTime(1174,now+.1);
      volume.gain.setValueAtTime(.045,now);volume.gain.exponentialRampToValueAtTime(.001,now+.23);
      oscillator.connect(volume);volume.connect(audio.destination);oscillator.start(now);oscillator.stop(now+.24);
      oscillator.onended=()=>{oscillator.disconnect();volume.disconnect();};
    },
    async setEnabled(on) {
      enabled=on;
      if(!on)return false;
      const Audio=globalThis.AudioContext??globalThis.webkitAudioContext;
      if(!Audio){enabled=false;return false;}
      try {
        if(!audio)audio=new Audio();
        const resume=audio.resume();
        ready??=prepare(audio);
        const [,available]=await Promise.all([resume,ready]);
        if(!available)enabled=false;
      } catch {enabled=false;}
      return enabled;
    },
    update({active=false,speed=0,throttle=0,braking=false}={}) {
      const previous=gear;
      const revs=engineRevs(speed,active?gear:1,throttle);
      gear=revs.gear;
      if(audio?.state==='running'&&engineLevel) {
        const now=audio.currentTime,audible=active&&enabled;
        const set=(param,value,smooth)=>{if(param) param.setTargetAtTime(value,now,smooth);};
        set(engine?.playbackRate,clamp(revs.rpm/7450,.43,1.95),previous===gear?.075:.034);
        set(filter.frequency,braking?650:680+throttle*1750+revs.rpm*.095,.14);
        set(engineLevel.gain,audible?(braking?.11:.135+throttle*.16):0,.14);
        set(musicLevel.gain,audible&&music?.buffer?.duration>0?.135:0,.2);
      }
      return revs;
    }
  };
}
