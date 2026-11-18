import {simulateField} from './race-ai.js';
import {sessionComplete} from './weekend.js';

// Same fixed step as the live race. Batches yield so cancellation is responsive.
export async function simulateRemaining(pack,{onProgress=()=>{},yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0))}={}){
  const {cars,session}=pack;let elapsed=pack.elapsed??0,lastProgress=elapsed;
  const reached=()=>pack.stopAt&&cars.some(c=>c.id===pack.stopAt.carId&&(c.retired||c.lapTimes.length>=pack.stopAt.laps));
  while(!sessionComplete(cars)&&!reached()){
    for(let i=0;i<300&&!sessionComplete(cars)&&!reached();i++){
      elapsed+=1/30;simulateField(cars,1/30,elapsed,session);
      if(elapsed>18000)throw Error('A sessão excedeu o tempo máximo. O ponto anterior foi preservado.');
    }
    if(elapsed-lastProgress>=30){onProgress({elapsed,finished:cars.filter(c=>c.retired||c.finishTime!==null).length,total:cars.length});lastProgress=elapsed;}
    await yieldTask();
  }
  return{cars,session,elapsed};
}
if(typeof self!=='undefined'&&typeof document==='undefined')self.onmessage=async({data})=>{
  try{const pack=await simulateRemaining(data,{onProgress:progress=>self.postMessage({type:'progress',...progress})});self.postMessage({type:'complete',pack});}
  catch(error){self.postMessage({type:'error',message:error.message});}
};
