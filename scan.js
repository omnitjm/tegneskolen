'use strict';
const ScanFlow=(()=>{
  const q=id=>document.getElementById(id);let session=null,serial=0,stream=null,worker=null,frame=0,eraser=false,gesture=null,cameraTimer=0,cancelProcess=null;
  function stopCamera(){clearTimeout(cameraTimer);cameraTimer=0;stream?.getTracks().forEach(t=>t.stop());stream=null;q('scanVideo').srcObject=null;}
  function stopWork(){cancelProcess?.();cancelProcess=null;worker?.terminate();worker=null;cancelAnimationFrame(frame);frame=0;}
  function message(text){q('scanMessage').textContent=text;}
  function close(){if(!session)return;const focus=session.focus;serial++;stopCamera();stopWork();gesture=null;session=null;q('scanModal').hidden=true;modalInert(false);if(focus?.isConnected)focus.focus({preventScroll:true});if(current==='stickerbook')StickerBook.resume();}
  async function camera(){stopCamera();stopWork();gesture=null;if(session)session.job=(session.job||0)+1;const token=++serial;q('scanShutter').disabled=true;q('scanCameraRetry').hidden=true;q('scanCaptureLabel').hidden=true;q('scanCamera').hidden=false;q('scanReview').hidden=true;q('scanLiving').hidden=true;q('scanFileLabel').hidden=false;message('Læg dit papir inden for rammen. Sørg for lys på hele arket.');
    try{if(!navigator.mediaDevices?.getUserMedia)throw Error('fallback');const next=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1600},height:{ideal:1200}},audio:false});if(token!==serial||!session||q('scanCamera').hidden){next.getTracks().forEach(t=>t.stop());return;}stream=next;q('scanVideo').srcObject=next;await q('scanVideo').play();if(token===serial&&session){q('scanShutter').disabled=false;guideCamera(token);}}
    catch{if(token!==serial||!session||q('scanCamera').hidden)return;stopCamera();q('scanCamera').hidden=true;q('scanCameraRetry').hidden=false;q('scanCaptureLabel').hidden=false;message('Vælg et foto, eller tag et nyt med kameraet.');}
  }
  async function open(options={}){if(session)close();const focus=document.activeElement;session={...options,attemptId:options.attemptId||crypto.randomUUID?.()||String(Date.now()),focus,motion:options.lesson?StickerBook.presetFor(options.lesson.id):'idle',undo:[],entryId:options.entryId,raw:null,result:null,png:null,busy:false};serial++;q('scanFileLabel').hidden=false;q('scanCaptureLabel').hidden=true;q('scanModal').hidden=false;modalInert(true);q('scanClose').focus({preventScroll:true});q('scanReview').hidden=q('scanLiving').hidden=true;q('scanCamera').hidden=true;q('scanMotion').hidden=!!options.lesson;for(const b of document.querySelectorAll('[data-scan-motion]'))b.setAttribute('aria-pressed',String(b.dataset.scanMotion===session.motion));q('scanStrength').value='1';q('scanEraser').setAttribute('aria-pressed','false');eraser=false;gesture=null;q('scanCanvas').classList.remove('erasing');q('scanRestore').setAttribute('aria-pressed','false');q('scanBefore').removeAttribute('src');StickerBook.suspend();if(current==='lesson')pauseStep();q('scanZoom').value='1';q('scanCanvas').style.transform='';q('scanCanvas').style.width=q('scanCanvas').style.maxWidth=q('scanCanvas').style.maxHeight='';q('scanSource').hidden=true;q('scanBefore').hidden=false;
    if(options.file)await selectFile(options.file);
    else if(options.src)await ingest(options.src);else await camera();
  }
  function image(src){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(Error('Fotoet kunne ikke åbnes'));im.src=src;});}
  async function readPhoto(file){
    const url=URL.createObjectURL(file);
    try{const im=await image(url),k=Math.min(1,1600/Math.max(im.naturalWidth,im.naturalHeight)),c=document.createElement('canvas');c.width=Math.round(im.naturalWidth*k);c.height=Math.round(im.naturalHeight*k);c.getContext('2d').drawImage(im,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.98);}
    finally{URL.revokeObjectURL(url);}
  }
  async function selectFile(file){
    const s=session;if(!s)return;const token=++serial;s.job=(s.job||0)+1;stopCamera();stopWork();q('scanUse').disabled=true;message('Vi åbner dit foto…');
    try{const src=await readPhoto(file);if(session===s&&token===serial)await ingest(src);}
    catch{if(session===s&&token===serial){message('Fotoet kunne ikke åbnes. Prøv et andet.');q('scanUse').disabled=!s.result;}}
  }
  function reviewUI(){
    if(q('scanRestore'))return;
    const style=document.createElement('style');style.textContent=`
      .scan-compare{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin:12px 0}
      .scan-compare figure{margin:0;min-width:0;display:flex;flex-direction:column;gap:8px}
      .scan-compare figcaption{font-weight:800;text-align:center;font-size:15px}
      #scanBefore{width:100%;height:240px;object-fit:contain;background:#eee7df;border-radius:16px}
      .scan-compare #scanPaper{min-height:240px;margin:0;display:flex;align-items:center;justify-content:center;overflow:auto;max-height:60vh;touch-action:pan-x pan-y}
      .scan-compare #scanCanvas{max-height:300px;max-width:100%;width:auto;height:auto;cursor:crosshair}
      #scanCanvas.erasing{touch-action:none}
      #scanRestore[aria-pressed=true],#scanEraser[aria-pressed=true]{background:#e9dfff;outline:3px solid #7451bb}
      .scan-tools button{min-height:48px;font-size:14px}
      #scanCamera{position:relative}#scanFrame{position:absolute;inset:10% 13% 25%;border:3px dashed white;border-radius:16px;pointer-events:none;box-shadow:0 0 0 200px #0002}
      #scanFrame.ready{border-color:#c1ffc9;border-style:solid}
      #scanCameraHint{position:absolute;top:12px;left:8px;right:8px;text-align:center;color:white;background:#30233ddd;padding:8px;border-radius:12px;font-size:14px;pointer-events:none}
      #scanShutter{position:relative}
      #scanSource{max-width:100%;max-height:420px;width:auto;height:auto;align-self:center;touch-action:none;cursor:crosshair}
      #scanPaper #scanCanvas{transform-origin:top left;flex-shrink:0}
      #scanPaper.dark{background:#344456}
      #scanUse{position:sticky;bottom:8px;z-index:4;box-shadow:0 2px 14px #30233d55}
      .scan-corrections{display:flex;flex-wrap:wrap;gap:8px}.scan-corrections button{min-height:48px}
      .scan-adjust{display:flex;flex-wrap:wrap;gap:12px;align-items:center}.scan-adjust label{font-size:14px}
      @media(min-width:760px){.scan-compare{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
      @media(max-width:500px){#scanUse{position:fixed;left:50%;transform:translateX(-50%);bottom:max(24px,env(safe-area-inset-bottom));width:min(280px,75vw);z-index:45}.scan-card{padding-bottom:90px}#scanBefore{height:190px}.scan-compare #scanPaper{min-height:190px}.scan-compare #scanCanvas{max-height:230px}.scan-compare{gap:8px}}
    `;document.head.append(style);
    const paper=q('scanPaper'),compare=document.createElement('div');compare.className='scan-compare';paper.before(compare);
    const before=document.createElement('figure');before.innerHTML='<figcaption>Dit foto</figcaption><img id="scanBefore" alt="Dit originale foto af tegningen">';compare.append(before);
    const after=document.createElement('figure');after.innerHTML='<figcaption>Din figur</figcaption>';compare.append(after);after.append(paper);
    const source=document.createElement('canvas');source.id='scanSource';source.hidden=true;source.setAttribute('aria-label','Træk en ramme om tegningen, eller sæt fire papirhjørner.');q('scanBefore').after(source);
    const corrections=document.createElement('div');corrections.className='scan-corrections';corrections.innerHTML='<button id="scanCrop" type="button" class="btn">Vælg område på foto</button><button id="scanCorners" type="button" class="btn">Ret papirhjørner</button><button id="scanExpand" type="button" class="btn">Vis hele papiret</button><button id="scanBackground" type="button" class="btn" aria-pressed="false">Mørk baggrund</button>';
    compare.after(corrections);
    const adjustments=document.createElement('div');adjustments.className='scan-adjust';adjustments.innerHTML='<label>Zoom <input id="scanZoom" type="range" min="1" max="4" step=".25" value="1"></label><label>Penselstørrelse <input id="scanBrush" type="range" min="2" max="32" step="1" value="12"></label>';
    corrections.after(adjustments);
    const restore=document.createElement('button');restore.id='scanRestore';restore.className='btn';restore.textContent='Tilføj tilbage';restore.setAttribute('aria-pressed','false');q('scanEraser').after(restore);const clean=document.createElement('button');clean.id='scanCleanDots';clean.className='btn';clean.textContent='Fjern løse prikker';restore.after(clean);
    const boost=document.createElement('button');boost.id='scanBoost';boost.className='btn';boost.textContent='Gør stregerne tydeligere';restore.after(boost);
    const slider=q('scanStrength');slider.min='.5';slider.max='2.5';slider.setAttribute('aria-label','Lysere eller mørkere streger');
    for(const node of slider.parentNode.childNodes)if(node.nodeType===Node.TEXT_NODE)node.textContent='Lysere ↔ Mørkere streger';
    q('scanCamera').querySelector('.scan-frame')?.remove();
    q('scanCanvas').setAttribute('aria-label','Dit udklip. Vælg Viskelæder eller Tilføj tilbage, og tegn på figuren.');
    const edit=document.createElement('details');edit.className='scan-editor';const summary=document.createElement('summary');summary.textContent='Ret billedet';edit.append(summary);
    const picker=document.createElement('select');picker.setAttribute('aria-label','Vælg rettelse');
    const tools=[corrections,adjustments,q('scanEraser').closest('.scan-tools')];
    ['Papir og udsnit','Zoom og pensel','Streger og viskelæder'].forEach((name,i)=>{const option=document.createElement('option');option.value=i;option.textContent=name;picker.append(option);});edit.append(picker);
    for(const [i,tool]of tools.entries()){tool.hidden=i!==0;edit.append(tool);}picker.onchange=()=>tools.forEach((tool,i)=>tool.hidden=i!==Number(picker.value));compare.after(edit);
    const toggle=document.createElement('button');toggle.className='btn scan-compare-toggle';toggle.textContent='Vis original';toggle.setAttribute('aria-pressed','false');
    compare.before(toggle);before.hidden=true;toggle.onclick=()=>comparison(before.hidden);
    const finalStyle=document.createElement('style');finalStyle.textContent=`
      #scanModal .scan-card{display:flex;flex-direction:column;background:#f3f0df;color:#110034;max-height:100dvh;padding-bottom:16px}
      #scanModal .scan-compare{display:block;margin:8px 0;flex:none}
      #scanModal .scan-compare figure[hidden]{display:none}
      #scanModal .scan-compare #scanPaper{min-height:260px;height:42dvh;max-height:460px}
      #scanModal .scan-compare #scanCanvas,#scanModal #scanBefore{max-height:40dvh;height:auto;width:auto;max-width:100%;object-fit:contain}
      #scanModal .scan-actions{position:sticky;bottom:0;display:flex;flex:none;gap:12px;background:#f3f0df;padding:12px 0;z-index:5;margin-top:auto}
      #scanModal #scanUse{position:static;transform:none;box-shadow:none;width:auto;flex:1;min-height:48px}
      #scanModal .scan-editor>summary{min-height:48px;display:flex;align-items:center;cursor:pointer}
      #scanModal .scan-editor{flex:none;max-height:30dvh;overflow:auto}
      #scanModal .scan-editor [hidden]{display:none!important}
      #scanModal .scan-compare-toggle{align-self:center;min-height:44px}
      #scanModal .scan-corrections,#scanModal .scan-tools,#scanModal .scan-adjust{gap:8px}
      #scanModal .scan-source-actions:has(~#scanReview:not([hidden])){display:none}
    `;document.head.append(finalStyle);
    const guide=document.createElement('div');guide.id='scanFrame';guide.setAttribute('aria-hidden','true');q('scanVideo').after(guide);
    const hint=document.createElement('div');hint.id='scanCameraHint';hint.setAttribute('role','status');hint.textContent='Hele papiret inden for rammen';guide.after(hint);
  }
  function guideCamera(token){
    const canvas=document.createElement('canvas');let last=null,stable=0;
    const tick=()=>{
      if(token!==serial||!stream||!session||q('scanCamera').hidden)return;
      const video=q('scanVideo');if(video.videoWidth){
        const k=192/Math.max(video.videoWidth,video.videoHeight);canvas.width=Math.round(video.videoWidth*k);canvas.height=Math.round(video.videoHeight*k);const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,0,0,canvas.width,canvas.height);
        const result=DrawingScan.detectPaper(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height),quad=result.quad;
        const steady=quad&&last&&quad.every((p,i)=>Math.hypot(p[0]-last[i][0],p[1]-last[i][1])<4);
        stable=quad&&result.confidence>.85?(steady?stable+1:1):0;last=quad;
        q('scanFrame').classList.toggle('ready',stable>1);q('scanCameraHint').textContent=stable>1?'Papir fundet! Hold stille — vi tager et foto…':'Hele papiret inden for rammen. Du kan også trykke på kameraet.';
        if(stable>=5){q('scanShutter').click();return;}
      }
      cameraTimer=setTimeout(tick,650);
    };cameraTimer=setTimeout(tick,650);
  }
  async function journal(s){if(s.entryId)return;const raw=s.raw,id=await addEntry(raw,s.lesson?.title||'Min tegning',{lessonId:s.lesson?.id,attemptId:s.attemptId,kind:'photo',selfAssessment:s.assessment,skillIds:s.lesson?lessonSkills(s.lesson):[]});if(s.raw===raw)s.entryId=id;}
  async function ingest(src){const s=session;if(!s)return;stopCamera();stopWork();if(s.raw&&s.raw!==src){s.entryId=null;s.stickerId=null;}s.raw=src;s.processing=false;const job=s.job=(s.job||0)+1;q('scanBefore').src=src;q('scanCameraRetry').hidden=true;q('scanCaptureLabel').hidden=true;s.result=null;s.png=null;s.undo=[];q('scanCamera').hidden=true;q('scanReview').hidden=false;q('scanLiving').hidden=true;q('scanUse').disabled=true;q('scanUndo').disabled=true;q('scanPaper').classList.add('processing');q('scanCanvas').hidden=true;q('scanStrength').value='1';q('scanZoom').value='1';q('scanCanvas').style.transform='';q('scanCanvas').style.width=q('scanCanvas').style.maxWidth=q('scanCanvas').style.maxHeight='';q('scanSource').hidden=true;q('scanBefore').hidden=false;comparison(true);message('Vi retter papiret op og finder dine streger…');
    try{await journal(s);}catch{message('Fotoet er ikke gemt endnu. Vi prøver igen, når du vælger “Brug den”.');}
    try{const im=await image(src);if(session!==s||job!==s.job)return;const w=im.naturalWidth||im.width,h=im.naturalHeight||im.height,k=Math.min(1,1600/Math.max(w,h)),c=document.createElement('canvas');c.width=Math.round(w*k);c.height=Math.round(h*k);const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0,c.width,c.height);const pixels=ctx.getImageData(0,0,c.width,c.height);s.pixels=pixels;const result=await process(pixels);if(session!==s||job!==s.job)return;acceptResult(s,result);;}
    catch(error){if(session!==s||job!==s.job)return;message(error.message||'Prøv et tættere foto af papiret.');}
    finally{if(session===s&&job===s.job)q('scanPaper').classList.remove('processing');}
  }
  function process(pixels,options={}){return new Promise((resolve,reject)=>{
    let settled=false,timer=0,current=null;
    const finish=(value,error)=>{if(settled)return;settled=true;clearTimeout(timer);current?.terminate();if(worker===current)worker=null;if(cancelProcess===cancel)cancelProcess=null;error?reject(error):resolve(value);};
    const cancel=()=>finish(null,Error('Scan annulleret.'));cancelProcess=cancel;
    const fallback=()=>{current?.terminate();if(worker===current)worker=null;clearTimeout(timer);timer=setTimeout(()=>{if(settled)return;try{finish(DrawingScan.extract(pixels.data,pixels.width,pixels.height,options));}catch(e){finish(null,e);}},20);};
    if(typeof Worker==='undefined'){fallback();return;}
    try{current=worker=new Worker(document.querySelector('script[src*="scan-core.js"]')?.src||'scan-core.js');timer=setTimeout(fallback,12000);
      current.onmessage=e=>{if(e.data.error)finish(null,Error(e.data.error));else finish({...e.data,data:new Uint8ClampedArray(e.data.data),restore:new Uint8ClampedArray(e.data.restore||e.data.data),fullData:new Uint8ClampedArray(e.data.fullData||e.data.data),fullRestore:new Uint8ClampedArray(e.data.fullRestore||e.data.restore||e.data.data),source:new Uint8ClampedArray(e.data.source||[])});};
      current.onerror=fallback;const copy=pixels.data.slice();current.postMessage({data:copy.buffer,width:pixels.width,height:pixels.height,options},[copy.buffer]);
    }catch{fallback();}
  });}
  function acceptResult(s,result){
    s.sourceBounds=DrawingScan.sourceBounds(result,s.pixels.width,s.pixels.height);const {data,restore,fullData,fullRestore,source,...meta}=result;s.result=meta;s.base=new Uint8ClampedArray(result.data);s.restore=new Uint8ClampedArray(result.restore||result.data);s.fullBase=new Uint8ClampedArray(result.fullData||result.data);s.fullRestore=new Uint8ClampedArray(result.fullRestore||result.restore||result.data);s.undo=[];s.turns=0;
    renderResult();q('scanCanvas').hidden=false;q('scanUse').disabled=false;q('scanUndo').disabled=true;q('scanPaper').classList.toggle('dark',result.polarity==='light');q('scanBackground').setAttribute('aria-pressed',String(result.polarity==='light'));
    q('scanBefore').hidden=false;q('scanSource').hidden=true;comparison(false);
    message(result.uncertain?'Tjek, at alle dine streger er med. Vælg et område på fotoet eller vis hele papiret for at rette udklippet.':'Tjek din figur. Du kan vælge et andet område, viske væk eller pensle streger tilbage.');
  }
  function syncFull(){const s=session;if(!s?.result)return;const r=s.result,[l,t]=r.crop;for(let y=0;y<r.height;y++)s.fullBase.set(s.base.subarray(y*r.width*4,(y+1)*r.width*4),((y+t)*r.rectWidth+l)*4);}
  function expand(){const s=session;if(!s?.result)return;finishErase();syncFull();s.result={...s.result,width:s.result.rectWidth,height:s.result.rectHeight,crop:[0,0,s.result.rectWidth,s.result.rectHeight]};s.base=s.fullBase.slice();s.restore=s.fullRestore.slice();s.undo=[];q('scanUndo').disabled=true;renderResult();message('Hele papiret er med. Pensl manglende streger tilbage, eller vælg et område på fotoet.');}
  function photoPoint(e){const c=q('scanSource'),r=c.getBoundingClientRect();return [Math.max(0,Math.min(c.width-1,(e.clientX-r.left)/r.width*c.width)),Math.max(0,Math.min(c.height-1,(e.clientY-r.top)/r.height*c.height))];}
  function drawSource(points){const s=session,c=q('scanSource');if(!s?.pixels)return;c.width=s.pixels.width;c.height=s.pixels.height;const ctx=c.getContext('2d');ctx.putImageData(s.pixels,0,0);if(!points?.length)return;ctx.strokeStyle='#7944df';ctx.lineWidth=Math.max(4,c.width/160);ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));if(points.length>2)ctx.closePath();ctx.stroke();for(const [x,y]of points){ctx.beginPath();ctx.arc(x,y,c.width/90,0,Math.PI*2);ctx.fillStyle='#7944df';ctx.fill();}}
  function comparison(original){
    q('scanBefore').closest('figure').hidden=!original;
    q('scanPaper').closest('figure').hidden=original;
    const toggle=document.querySelector('#scanModal .scan-compare-toggle');
    toggle.textContent=original?'Vis resultat':'Vis original';toggle.setAttribute('aria-pressed',String(original));
  }
  function startSelection(mode){const s=session;if(!s?.result||s.processing)return;finishErase();s.selection={mode,points:[]};q('scanBefore').hidden=true;q('scanSource').hidden=false;comparison(true);drawSource(s.sourceBounds);message(mode==='corners'?'Tryk på papirets fire hjørner: øverst venstre, øverst højre, nederst højre, nederst venstre.':'Træk en ramme om det, du vil beholde. Du kan vælge én figur eller flere.');q('scanSource').scrollIntoView?.({block:'center',behavior:'smooth'});}
  async function selectQuad(points){const s=session;if(!s?.pixels||s.processing)return;s.selection=null;s.processing=true;const job=s.job=(s.job||0)+1;stopWork();q('scanUse').disabled=true;q('scanPaper').classList.add('processing');message('Vi finder stregerne i dit valgte område…');
    try{const result=await process(s.pixels,{quad:points,manual:true});if(session!==s||s.job!==job)return;acceptResult(s,result);drawSource(points);}
    catch(e){if(session===s&&s.job===job){message(e.message||'Vælg et større område.');q('scanUse').disabled=!s.result;}}
    finally{if(session===s&&s.job===job){s.processing=false;q('scanPaper').classList.remove('processing');}}
  }
  function trimCanvas(){const src=q('scanCanvas'),ctx=src.getContext('2d'),p=ctx.getImageData(0,0,src.width,src.height);let l=src.width,t=src.height,r=0,b=0;
    for(let y=0;y<src.height;y++)for(let x=0;x<src.width;x++)if(p.data[(y*src.width+x)*4+3]>5){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}
    if(l>r||t>b)throw Error('Der er ingen streger tilbage. Tilføj streger eller fortryd.');const c=document.createElement('canvas');c.width=r-l+1+24;c.height=b-t+1+24;c.getContext('2d').drawImage(src,l,t,r-l+1,b-t+1,12,12,r-l+1,b-t+1);return c;
  }
  function renderResult(){const s=session;if(!s?.result)return;const {width,height}=s.result,c=q('scanCanvas');c.width=width;c.height=height;const ctx=c.getContext('2d'),pixels=ctx.createImageData(width,height);pixels.data.set(s.base);const strength=Number(q('scanStrength').value);for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=Math.min(255,pixels.data[i]*strength);ctx.putImageData(pixels,0,0);}
  function snapshot(){const s=session,c=q('scanCanvas');if(!s?.result)return;s.undo.push(new Uint8ClampedArray(s.base));if(s.undo.length>6)s.undo.shift();q('scanUndo').disabled=false;}
  function pointer(e){const c=q('scanCanvas'),r=c.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*c.width,y:(e.clientY-r.top)/r.height*c.height};}
  function erase(e){
    const s=session;if(!s?.result||!eraser||!gesture||gesture.id!==e.pointerId)return;e.preventDefault();
    const p=pointer(e),c=q('scanCanvas'),radius=Number(q('scanBrush').value)*c.width/Math.max(1,c.getBoundingClientRect().width),dx=p.x-gesture.x,dy=p.y-gesture.y,steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/(radius*.3)));
    for(let step=0;step<=steps;step++){
      const cx=gesture.x+dx*step/steps,cy=gesture.y+dy*step/steps;
      for(let y=Math.max(0,Math.floor(cy-radius));y<=Math.min(c.height-1,Math.ceil(cy+radius));y++)for(let x=Math.max(0,Math.floor(cx-radius));x<=Math.min(c.width-1,Math.ceil(cx+radius));x++){
        const coverage=Math.min(1,Math.max(0,radius-Math.hypot(x-cx,y-cy))),at=(y*c.width+x)*4;
        if(eraser==='restore'){for(let k=0;k<3;k++)s.base[at+k]=s.restore[at+k];s.base[at+3]=Math.max(s.base[at+3],Math.round(s.restore[at+3]*coverage));}
        else s.base[at+3]=Math.round(s.base[at+3]*(1-coverage));
      }
    }
    gesture={...gesture,...p};renderResult();
  }
  function finishErase(){gesture=null;}
  function tool(mode){finishErase();eraser=eraser===mode?false:mode;q('scanEraser').setAttribute('aria-pressed',String(eraser==='erase'));q('scanRestore').setAttribute('aria-pressed',String(eraser==='restore'));q('scanCanvas').classList.toggle('erasing',!!eraser);}
  function rotatePixels(data,w,h){const out=new Uint8ClampedArray(data.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++)out.set(data.subarray((y*w+x)*4,(y*w+x)*4+4),(x*h+h-1-y)*4);return out;}
  function rim(canvas){const pad=20,c=document.createElement('canvas');c.width=canvas.width+pad*2;c.height=canvas.height+pad*2;const mask=document.createElement('canvas');mask.width=c.width;mask.height=c.height;const m=mask.getContext('2d');for(let a=0;a<Math.PI*2;a+=Math.PI/12)m.drawImage(canvas,pad+Math.cos(a)*4,pad+Math.sin(a)*4);m.globalCompositeOperation='source-in';m.fillStyle='#fff';m.fillRect(0,0,c.width,c.height);const ctx=c.getContext('2d');ctx.shadowColor='#35254240';ctx.shadowBlur=6;ctx.shadowOffsetY=4;ctx.drawImage(mask,0,0);ctx.shadowColor='transparent';ctx.drawImage(canvas,pad,pad);return c.toDataURL('image/png');}
  async function use(){const s=session;if(!s?.result||s.busy)return;s.busy=true;q('scanUse').disabled=true;message('Gemmer din figur…');
    try{await journal(s);const png=rim(trimCanvas());const id=await StickerBook.addOwn({entryId:s.entryId,png,lessonId:s.lesson?.id,targetId:s.targetId,motion:s.motion,title:s.lesson?.title||'Min figur'});if(session!==s)return;s.stickerId=id;s.png=png;q('scanReview').hidden=q('scanFileLabel').hidden=true;q('scanLiving').hidden=false;message('Din figur er klar til at lege.');if(current==='done'&&s.lesson?.id===L?.id){q('doneArt').src=s.raw;q('doneArt').dataset.owner='child';q('doneCaption').textContent='Din egen tegning · Gemt i tegnebogen';}
      const im=await image(png),start=performance.now();const animate=now=>{if(session!==s)return;StickerBook.preview(q('scanLivingCanvas'),im,s.motion,reducedMotion.matches?0:(now-start)/1000);if(!reducedMotion.matches&&!document.hidden)frame=requestAnimationFrame(animate);};frame=requestAnimationFrame(animate);
    }catch(error){if(session===s){message(error.message||'Ikke gemt endnu. Din figur er stadig her. Frigør plads og prøv igen.');q('scanUse').disabled=false;}}finally{s.busy=false;}
  }
  function init(){reviewUI();q('scanClose').onclick=close;q('scanLater').onclick=close;q('scanRetry').onclick=q('scanCameraRetry').onclick=camera;q('scanUse').onclick=use;q('scanPlace').onclick=()=>{const id=session?.stickerId;if(!id)return;close();StickerBook.fromOwn(id);};
    q('doneScan').onclick=()=>open({lesson:L,attemptId,assessment});q('bookScan').onclick=()=>open();q('journalScan').onclick=()=>open();
    q('scanFile').onchange=q('scanCapture').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(f)await selectFile(f);};
    q('scanShutter').onclick=async()=>{const video=q('scanVideo');if(!video.videoWidth)return;const k=Math.min(1,1600/Math.max(video.videoWidth,video.videoHeight)),c=document.createElement('canvas');c.width=Math.round(video.videoWidth*k);c.height=Math.round(video.videoHeight*k);c.getContext('2d').drawImage(video,0,0,c.width,c.height);await ingest(c.toDataURL('image/jpeg',.98));};
    q('scanEraser').onclick=()=>tool('erase');q('scanRestore').onclick=()=>tool('restore');q('scanStrength').oninput=()=>{finishErase();renderResult();};
    q('scanBoost').onclick=()=>{finishErase();q('scanStrength').value=1.65;renderResult();};
    q('scanUndo').onclick=()=>{finishErase();if(!session?.undo.length)return;session.base=session.undo.pop();renderResult();q('scanUndo').disabled=!session.undo.length;};
    q('scanCleanDots').onclick=()=>{if(!session?.result)return;finishErase();snapshot();session.base=DrawingScan.cleanDetached(session.base,session.result.width,session.result.height);renderResult();message('Løse prikker uden for figuren er fjernet. Tryk Tilbage for at fortryde.');};q('scanBackground').onclick=()=>{const dark=q('scanPaper').classList.toggle('dark');q('scanBackground').setAttribute('aria-pressed',String(dark));};q('scanCrop').onclick=()=>startSelection('crop');q('scanCorners').onclick=()=>startSelection('corners');q('scanExpand').onclick=expand;
    q('scanZoom').oninput=()=>{finishErase();const c=q('scanCanvas');c.style.maxWidth=Number(q('scanZoom').value)>1?'none':'';c.style.maxHeight=Number(q('scanZoom').value)>1?'none':'';c.style.width=Number(q('scanZoom').value)>1?Math.round(q('scanPaper').clientWidth*Number(q('scanZoom').value))+'px':'';};
    const photo=q('scanSource');photo.addEventListener('pointerdown',e=>{const s=session;if(!s?.selection)return;e.preventDefault();const p=photoPoint(e);if(s.selection.mode==='corners'){s.selection.points.push(p);drawSource(s.selection.points);if(s.selection.points.length===4)selectQuad(s.selection.points);return;}s.selection.start=p;s.selection.id=e.pointerId;try{photo.setPointerCapture?.(e.pointerId);}catch{}});
    photo.addEventListener('pointermove',e=>{const s=session,sel=s?.selection;if(!sel?.start||sel.id!==e.pointerId)return;const [x,y]=sel.start,[u,v]=photoPoint(e);drawSource([[x,y],[u,y],[u,v],[x,v]]);});
    photo.addEventListener('pointerup',e=>{const sel=session?.selection;if(!sel?.start||sel.id!==e.pointerId)return;const [x,y]=sel.start,[u,v]=photoPoint(e),l=Math.min(x,u),t=Math.min(y,v),r=Math.max(x,u),b=Math.max(y,v);delete sel.start;if(r-l>16&&b-t>16)selectQuad([[l,t],[r,t],[r,b],[l,b]]);});
    photo.addEventListener('pointercancel',()=>{if(session?.selection)delete session.selection.start;});
    q('scanRotate').onclick=()=>{finishErase();if(!session?.result)return;const s=session,{width:w,height:h}=s.result;syncFull();const rw=s.result.rectWidth,rh=s.result.rectHeight,[left,top]=s.result.crop;s.fullBase=rotatePixels(s.fullBase,rw,rh);s.fullRestore=rotatePixels(s.fullRestore,rw,rh);s.turns=(s.turns+1)%4;s.base=rotatePixels(s.base,w,h);s.restore=rotatePixels(s.restore,w,h);s.result={...s.result,width:h,height:w,rectWidth:rh,rectHeight:rw,crop:[rh-top-h,left,h,w]};s.undo=[];renderResult();q('scanUndo').disabled=true;};
    const c=q('scanCanvas');c.addEventListener('pointerdown',e=>{if(!eraser||!session?.result||gesture||(e.button!==undefined&&e.button!==0))return;e.preventDefault();snapshot();gesture={id:e.pointerId,...pointer(e),strength:Number(q('scanStrength').value)};try{c.setPointerCapture?.(e.pointerId);}catch{}erase(e);});c.addEventListener('pointermove',erase);for(const event of ['pointerup','pointercancel','lostpointercapture'])c.addEventListener(event,finishErase);
    for(const b of document.querySelectorAll('[data-scan-motion]'))b.onclick=()=>{if(!session)return;session.motion=b.dataset.scanMotion;for(const other of document.querySelectorAll('[data-scan-motion]'))other.setAttribute('aria-pressed',String(other===b));};
    window.addEventListener('pagehide',()=>{stopCamera();stopWork();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){stopCamera();cancelAnimationFrame(frame);if(session&&!q('scanCamera').hidden){q('scanCamera').hidden=true;q('scanCameraRetry').hidden=false;q('scanCaptureLabel').hidden=false;message('Kameraet er sat på pause. Åbn det igen, eller vælg et foto.');q('scanFileLabel').hidden=false;}}});
  }
  return {init,open,close,rim};
})();
