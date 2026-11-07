'use strict';
const PREFIX='tegneskolen-',CACHE=PREFIX+'v47-zero-audit2-1794018008',RUNTIME=CACHE+'-runtime',PACK_INDEX=PREFIX+'offline-index-v1';
const SCAN_VERSION='1794018008';
const STICKER_VERSION='1794018008';
const VERSION='1794018008';
// The previous audited packages have identical lesson and voice content.
// Retain them across this shell-only update; revisions are checked separately.
const PACK_BUILDS=new Set([VERSION,'1794014404','1794018002','1794018003','1794018004','1794018005','1794018006','1794018007']);
const FILES=['assets/fonts/nunito-sans-regular.ttf','assets/fonts/nunito-sans-semibold.ttf','assets/fonts/nunito-sans-bold.ttf','./','index.html','assets/vector/shell-atmosphere.svg',...['favorites','dyr','natur'].map(id=>'assets/vector/collection-'+id+'.svg'),...['construction','contour','shading','fur'].map(id=>'assets/vector/technique-'+id+'.svg'),'assets/player/welcome-process.webp','assets/player/desk.webp','assets/player/paper.png','assets/vector/scene-forest-tree0.svg','assets/vector/scene-forest-tree1.svg','assets/vector/scene-forest-tree2.svg','assets/vector/scene-forest-tree3.svg','assets/vector/scene-forest-brush.svg','assets/vector/scene-jungle-palms.svg','assets/vector/scene-jungle-brush.svg','assets/vector/scene-farm-barn.svg','assets/vector/scene-farm-tree.svg','assets/vector/scene-farm-fence.svg','assets/vector/scene-savanna-trees.svg','assets/vector/scene-ocean-plants.svg',...['style.css','design.css','player.css','platform.js','ui-icons.js','persistence.js','scan-core.js','scan.js','techniques.js','plan-codec.js','playback-timing.js','app.js','stickers.js','lessons.js'].map(f=>`${f}?v=${f==='stickers.js'?STICKER_VERSION:/^scan(?:-core)?\.js$/.test(f)?SCAN_VERSION:VERSION}`),'manifest.webmanifest',`manifest.webmanifest?v=${VERSION}`,'assets/playback-index.json','assets/lesson-revisions.json','assets/offline-gallery.json','voice/index.json',`voice/index.json?v=${VERSION}`,`voice/phrase_flot_klaret_din_tegning_er_faerdig.m4a?v=${VERSION}`,'icon.svg',`icon-180.png?v=${VERSION}`,`icon-512.png?v=${VERSION}`,'icon-180.png','icon-192.png','icon-512.png','icon-maskable-512.png',`icon-192.png?v=${VERSION}`,`icon-maskable-512.png?v=${VERSION}`,'assets/vector/header.svg',...['meadow','forest','ocean','jungle','savanna','space','snow','sky','farm','night'].map(id=>`assets/vector/scene-${id}.svg`)];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES).then(()=>self.skipWaiting()))));
async function preserveOfflineGallery(names){
  // These releases share the same artwork. Carry explicitly downloaded art
  // forward before deleting their shell; lesson-package pointers stay valid.
  const previous=names.filter(k=>k.startsWith(PREFIX+'v')&&k!==CACHE&&[...PACK_BUILDS].some(build=>k.endsWith('-'+build)));
  if(!previous.length)return;
  const current=await caches.open(CACHE),inventory=await current.match(new URL('assets/offline-gallery.json',self.registration.scope));
  if(!inventory)return;
  for(const file of await inventory.json()){
    const url=new URL(file,self.registration.scope);if(await current.match(url))continue;
    for(const name of previous){const found=await(await caches.open(name)).match(url);if(found){await current.put(url,found);break;}}
  }
}
self.addEventListener('activate',e=>e.waitUntil((async()=>{const names=await caches.keys();await preserveOfflineGallery(names);await Promise.all(names.filter(k=>k.startsWith(PREFIX+'v')&&k!==CACHE&&k!==RUNTIME).map(k=>caches.delete(k)));await self.clients.claim();})()));
async function network(request,ms=45000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);try{const response=await fetch(request,{signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);return response;}finally{clearTimeout(timer);}}
let currentRevisions;
async function packageMatch(request){
  const revisions=await (currentRevisions ||= caches.open(CACHE).then(cache=>cache.match(new URL('assets/lesson-revisions.json',self.registration.scope))).then(r=>r?r.json():{}));
  const url=new URL(request.url),match=/\/lessons\/([^/]+)\//.exec(url.pathname),index=await caches.open(PACK_INDEX);
  const pointers=match?[await index.match(new URL('offline-index/'+match[1],self.registration.scope))]:await Promise.all((await index.keys()).map(key=>index.match(key)));
  for(const pointer of pointers){if(!pointer)continue;const data=await pointer.json();if(!PACK_BUILDS.has(data.build))continue;if(match&&data.revision!==revisions[decodeURIComponent(match[1])])continue;const found=await(await caches.open(data.cache)).match(request,{ignoreSearch:true});if(found)return found;}return null;
}
async function cachedResponse(request){
  const pack=await packageMatch(request).catch(()=>null);if(pack)return pack;
  let runtime,cached,shell;
  try{const cache=await caches.open(CACHE);runtime=await caches.open(RUNTIME);shell=await cache.match(request);cached=shell||await runtime.match(request);}catch{/* Cache storage may be disabled; online teaching still works. */}
  const url=new URL(request.url),versioned=url.searchParams.has('v');if(shell||cached&&(versioned||url.pathname.includes('/lessons/')||/\.m4a$/.test(url.pathname)))return cached;
  try{const response=await network(request);if(response.status===200&&runtime)await runtime.put(request,response.clone()).catch(()=>{});return response;}catch{return cached||Response.error();}
}
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(/\.m4a$/.test(new URL(e.request.url).pathname)?voiceResponse(e.request):cachedResponse(e.request));});
async function voiceResponse(request){const headers=new Headers(request.headers);headers.delete('range');const full=new Request(request,{headers}),response=await cachedResponse(full);const range=request.headers.get('range');if(!range||response.status!==200)return response;
  const data=await response.arrayBuffer(),size=data.byteLength,match=/^bytes=(\d*)-(\d*)$/.exec(range);let start=0,end=size-1;if(match&&(match[1]||match[2])){if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}else start=Math.max(0,size-Number(match[2]));}else start=size;
  if(start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});const h=new Headers(response.headers);h.delete('Content-Encoding');h.set('Content-Type','audio/mp4');h.set('Accept-Ranges','bytes');h.set('Content-Range',`bytes ${start}-${end}/${size}`);h.set('Content-Length',end-start+1);return new Response(data.slice(start,end+1),{status:206,headers:h});
}
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING'){e.waitUntil(self.skipWaiting());return;}if(e.data?.type!=='DOWNLOAD_LESSON')return;const port=e.ports?.[0];e.waitUntil((async()=>{
  let staging;try{const response=await network(new URL('assets/lesson-packages.json',self.registration.scope),6000),manifest=await response.json(),pack=manifest.lessons[e.data.id];if(!pack||pack.revision!==e.data.revision)throw Error('Indholdet er opdateret. Åbn lektionen igen.');
    const index=await caches.open(PACK_INDEX),key=new URL('offline-index/'+encodeURIComponent(e.data.id),self.registration.scope),previous=await index.match(key);staging=PREFIX+'pack-'+encodeURIComponent(e.data.id)+'-'+pack.revision+'-'+Date.now();const cache=await caches.open(staging);let done=0;
    for(const item of pack.files){const request=new Request(new URL(item.path,self.registration.scope)),r=await network(request,12000);if(r.status!==200)throw Error('Ufuldstændig fil');if(item.sha256){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await r.clone().arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');if(hash!==item.sha256)throw Error('En fil passer ikke til lektionen. Prøv igen.');}await cache.put(request,r);port?.postMessage({progress:++done,total:pack.files.length});}
    // Cache discovery, shop, course and sticker art once per release, only
    // after an explicit offline download. This avoids a large initial install.
    const shell=await caches.open(CACHE),galleryResponse=await shell.match(new URL('assets/offline-gallery.json',self.registration.scope));
    if(!galleryResponse)throw Error('Offlineoversigten mangler. Åbn appen igen.');
    const gallery=await galleryResponse.json();
    for(const file of gallery){const url=new URL(file,self.registration.scope);if(!await shell.match(url))await shell.put(url,await network(new Request(url),12000));}
    await index.put(key,new Response(JSON.stringify({cache:staging,revision:pack.revision,build:VERSION})));if(previous){const old=await previous.json();if(old.cache!==staging)await caches.delete(old.cache);}port?.postMessage({complete:true,revision:pack.revision});
  }catch(error){if(staging)await caches.delete(staging);port?.postMessage({error:error.message||'Kunne ikke gemme lektionen. Prøv igen.'});}
})());});
