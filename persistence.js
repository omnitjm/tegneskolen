'use strict';
const DraftStore = (() => {
  let connection=null;const pending=new Map();let timer=0;
  function database(){return connection ||= new Promise((resolve,reject)=>{let r;try{r=indexedDB.open('tegneskolen-drafts',1);}catch(e){reject(e);return;}r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'id'});r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();connection=null;};resolve(r.result);};r.onerror=r.onblocked=()=>reject(r.error||Error('Luk andre appvinduer og prøv igen.'));}).catch(e=>{connection=null;throw e;});}
  async function transaction(mode,fn){const d=await database();return new Promise((res,rej)=>{const t=d.transaction('drafts',mode),r=fn(t.objectStore('drafts'));t.oncomplete=()=>res(r.result);t.onerror=t.onabort=()=>rej(t.error||Error('Ikke gemt endnu'));});}
  function status(error=false){const el=document.getElementById('saveStatus');if(el){el.hidden=!error;el.querySelector('span').textContent='Ikke gemt endnu. Din tegning er stadig her.';}}
  function recovery(id){try{const v=JSON.parse(localStorage.getItem(id+'_recovery'));return v&&Array.isArray(v.strokes)&&Number.isFinite(v.updated)?v:null;}catch{return null;}}
  function clearRecovery(id,updated=Infinity){try{if((recovery(id)?.updated??Infinity)<=updated)localStorage.removeItem(id+'_recovery');}catch{}}
  // A navigation can destroy this context before an IndexedDB promise starts.
  // Keep only uncommitted work synchronously until the durable write succeeds.
  function checkpoint(){let ok=true;for(const [id,item]of pending){try{localStorage.setItem(id+'_recovery',JSON.stringify(item));}catch{ok=false;}}if(!ok)status(true);return ok;}
  async function flush(){clearTimeout(timer);for(const [id,item]of [...pending]){try{await transaction('readwrite',s=>s.put({id,strokes:item.strokes,updated:item.updated}));if(pending.get(id)===item)pending.delete(id);clearRecovery(id,item.updated);}catch{status(true);return false;}}status(pending.size>0);return !pending.size;}
  return {async get(id){
    if(pending.has(id))return pending.get(id);
    const backup=recovery(id);let saved;
    try{saved=await transaction('readonly',s=>s.get(id));}catch(error){if(!backup)throw error;}
    if(pending.has(id))return pending.get(id);
    if(backup&&(!saved||backup.updated>=saved.updated)){pending.set(id,backup);clearTimeout(timer);timer=setTimeout(flush,180);return backup;}
    if(saved)clearRecovery(id,saved.updated);return saved;
  },queue(id,strokes){pending.set(id,{strokes:JSON.parse(JSON.stringify(strokes)),updated:Date.now()});clearTimeout(timer);timer=setTimeout(flush,180);},flush,checkpoint,async remove(id){pending.delete(id);clearRecovery(id);await transaction('readwrite',s=>s.delete(id));},hasPending:()=>pending.size>0};
})();


// A wallet is derived from completed drawings, never from individual activities.
// Keep historical spending even when the new earnings are lower; balance clamps
// at zero, while purchased items stay owned. The storage key stays compatible.
const StarEconomy = (() => {
  const map = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const nonnegative = v => Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  function starsFor(lesson) { return ({1:3, 2:4, 3:5})[lesson?.level] || 3; }
  function migrate(value, progress, lessons) {
    const previous = map(value), claims = {}; let earned = 0;
    for (const [id, complete] of Object.entries(map(progress?.done))) {
      if (!complete) continue;
      const lesson = lessons.find(l => l.id === id);
      // Retired lessons remain completed; their saved completion value survives.
      earned += lesson ? starsFor(lesson) : [3,4,5].includes(complete) ? complete : 3;
      claims['lesson:' + id] = true;
    }
    return {version:2, earned, spent:nonnegative(previous.spent), claims,
      unlocked:{...map(previous.unlocked)}, newLessons:{...map(previous.newLessons)}};
  }
  return {starsFor, migrate};
})();
