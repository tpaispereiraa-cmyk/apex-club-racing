const KEYS=['apex-career-v1','apex-watch-v2'];
function decode(value){
  if(value===null||value===undefined)return null;
  if(typeof value==='string'){
    try{const data=JSON.parse(value);if(data.storageVersion===1&&typeof data.raw==='string')return data;}catch{}
    return{raw:value,savedAt:0};
  }
  return value.storageVersion===1&&typeof value.raw==='string'?value:null;
}
function databaseBackend(indexedDB){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('apex-saves',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('saves');
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(Error('Banco de saves bloqueado por outra aba.'));
    request.onsuccess=()=>{
      const db=request.result;db.onversionchange=()=>db.close();
      resolve({read:key=>new Promise((yes,no)=>{
        const tx=db.transaction('saves','readonly'),get=tx.objectStore('saves').get(key);
        get.onsuccess=()=>yes(get.result??null);get.onerror=()=>no(get.error);
      }),write:(key,value)=>new Promise((yes,no)=>{
        const tx=db.transaction('saves','readwrite');tx.objectStore('saves').put(value,key);
        tx.oncomplete=()=>yes();tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error??Error('Gravação cancelada.'));
      })});
    };
  });
}

// Cache makes the controller's reads synchronous; writes resolve only after
// the durable transaction commits. Each mode keeps its own key and write queue.
export async function createSaveStorage({legacy=null,backend=null}={}){
  const cache=new Map(),queues=new Map();let timestamp=0;
  for(const key of KEYS){
    let dbValue=null,oldValue=null;
    try{dbValue=decode(await backend?.read(key));}catch{/* The legacy save remains available. */}
    try{oldValue=decode(legacy?.getItem(key));}catch{/* Storage can be disabled. */}
    const value=!dbValue||(oldValue?.savedAt??0)>dbValue.savedAt?oldValue:dbValue;
    if(value){cache.set(key,value.raw);timestamp=Math.max(timestamp,value.savedAt);}
  }
  return{
    get kind(){return backend?'indexeddb':'localStorage';},
    getItem:key=>cache.get(key)??null,
    setItem(key,value){
      if(!KEYS.includes(key))throw Error('Chave de save desconhecida.');
      // Capture the exact revision now, before any asynchronous operation.
      cache.set(key,value);timestamp=Math.max(Date.now(),timestamp+1);
      const record={storageVersion:1,raw:value,savedAt:timestamp};
      const write=async()=>{
        if(backend){
          try{await backend.write(key,record);
            // Only retire this game's old copy AFTER the new copy has committed.
            try{const old=decode(legacy?.getItem(key));if(!old||old.savedAt<=record.savedAt)legacy?.removeItem?.(key);}catch{}
            return;
          }catch(dbError){
            try{if(!legacy)throw dbError;legacy.setItem(key,JSON.stringify(record));return;}catch{throw dbError;}
          }
        }
        if(!legacy)throw Error('O navegador não disponibilizou armazenamento persistente.');
        legacy.setItem(key,JSON.stringify(record));
      };
      const pending=(queues.get(key)??Promise.resolve()).catch(()=>{}).then(write);
      queues.set(key,pending);return pending;
    }
  };
}
export async function browserSaveStorage(){
  let legacy=null,backend=null;
  try{legacy=globalThis.localStorage;}catch{}
  try{if(globalThis.indexedDB)backend=await databaseBackend(globalThis.indexedDB);}catch{}
  return createSaveStorage({legacy,backend});
}
