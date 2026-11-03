'use strict';
const DraftStore = (() => {
  let connection=null;const pending=new Map();let timer=0;
  function database(){return connection ||= new Promise((resolve,reject)=>{let r;try{r=indexedDB.open('tegneskolen-drafts',1);}catch(e){reject(e);return;}r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'id'});r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();connection=null;};resolve(r.result);};r.onerror=r.onblocked=()=>reject(r.error||Error('Luk andre appvinduer og prøv igen.'));}).catch(e=>{connection=null;throw e;});}
  async function transaction(mode,fn){const d=await database();return new Promise((res,rej)=>{const t=d.transaction('drafts',mode),r=fn(t.objectStore('drafts'));t.oncomplete=()=>res(r.result);t.onerror=t.onabort=()=>rej(t.error||Error('Ikke gemt endnu'));});}
  function status(error=false){const el=document.getElementById('saveStatus');if(el){el.hidden=!error;el.querySelector('span').textContent='Ikke gemt endnu. Din tegning er stadig her.';}}
  async function flush(){clearTimeout(timer);for(const [id,item]of [...pending]){try{await transaction('readwrite',s=>s.put({id,strokes:item.strokes,updated:item.updated}));if(pending.get(id)===item)pending.delete(id);}catch{status(true);return false;}}status(pending.size>0);return !pending.size;}
  return {async get(id){if(pending.has(id))return pending.get(id);return transaction('readonly',s=>s.get(id));},queue(id,strokes){pending.set(id,{strokes:JSON.parse(JSON.stringify(strokes)),updated:Date.now()});clearTimeout(timer);timer=setTimeout(flush,180);},flush,async remove(id){pending.delete(id);await transaction('readwrite',s=>s.delete(id));},hasPending:()=>pending.size>0};
})();
