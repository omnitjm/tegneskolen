'use strict';

// The book owns its scene/layout data and a separate photo store. Journal originals
// and lesson progress are only read; choosing/returning a sticker never deletes art.
const StickerBook = (() => {
  const W = 1000, H = 625, LIMIT = 12, KEY = 'ts_stickerbook_v1';
  const SCENES = [
    { id: 'meadow', title: 'Blomstereng', ground: .80, price: 0, description: 'En solvarm eng med blomster og bløde, grønne bakker' },
    { id: 'forest', title: 'Skov', ground: .80, price: 0, description: 'En lysning mellem enkle grønne træer og bløde bakker' },
    { id: 'ocean', title: 'Under havet', ground: .89, water: true, price: 0, description: 'Blåt hav med flade bølger, havplanter og en lys sandbund' },
    { id:'jungle', title:'Jungle', ground:.81, price:0, description:'Grøn jungle med lianer, palmer og store blade' },
    { id:'savanna', title:'Savanne', ground:.81, price: 6, description:'Gylden savanne med akacietræer og varmt aftenslys' },
    { id:'space', title:'Rummet', ground:.83, price: 8, description:'Planeter, stjerner og et stille månelandskab' },
    { id:'snow', title:'Is og sne', ground:.82, price: 8, description:'Isbjerge, snefnug og nordlys i blå og lilla farver' },
    { id: 'sky', title: 'Oppe i skyerne', ground: .84, price: 6, description: 'En lys himmel med en regnbue og bløde, hvide skyer' },
    { id: 'farm', title: 'Bondegård', ground: .80, price: 8, description: 'En hyggelig gård med rød lade og grønne græsgange' },
    { id: 'night', title: 'Natten', ground: .80, price: 10, description: 'En fredelig nat med gyldne stjerner og en lysende måne' },
  ].map(s => ({ ...s, art: `assets/vector/scene-${s.id}.svg` }));
  // Explicit presets take precedence over category defaults. Portraits stay still.
  const PRESETS = {
    e_fisk: 'swim', delfin: 'swim', s_haj: 'swim', e_hval: 'swim', skildpadde: 'swim',
    sommerfugl: 'butterfly', e_bi: 'fly', papegoeje: 'sway', e_fugl: 'idle', e_ugle: 'idle', ugle: 'idle', s_oern: 'fly', s_ugle_flyv: 'fly', s_drage: 'fly',
    e_kanin: 'hop', kanin: 'hop', egern: 'climb', s_panda_baby: 'idle',
    e_kat: 'walk', e_hund: 'walk', raev: 'walk', kat: 'walk', hvalp: 'walk', hest: 'portrait', panda: 'walk',
    elefant: 'walk', e_snegl: 'crawl', e_skildpadde: 'crawl', e_marienhone: 'crawl', s_trex: 'walk', s_ulv: 'walk', s_enhjoerning: 'walk',
    e_kylling: 'walk', e_mus: 'crawl', e_pingvin: 'walk', e_gris: 'walk', pindsvin: 'crawl', hjort: 'walk',
    e_frø:'hop', e_ræv:'walk', e_puma:'walk', e_ulv:'walk', puma:'walk', ulv:'walk', puma_svaer:'portrait', ulv_svaer:'portrait',
    loeve: 'portrait', s_tiger: 'portrait',
    e_tulipan: 'sway', rose: 'sway', solsikke: 'sway', fluesvamp: 'sway', eg: 'sway', e_kaktus: 'sway', blomsterbuket: 'sway',
    e_regnbue: 'idle', fyrtaarn: 'idle',
    e_aeble: 'idle', e_hus: 'idle', s_sportsvogn: 'roll',
  };
  // Coordinates are foot anchors on the painted surfaces, not horizontal lanes.
  // The five samples follow the rear edge of each SVG's actual walkable floor.
  const TERRAIN = {
    meadow: [.59,.49,.59,.59,.55], forest: [.61,.55,.61,.58,.56],
    ocean: [.855,.82,.86,.85,.84], jungle: [.56,.48,.58,.55,.52],
    savanna: [.61,.55,.61,.59,.59], space: [.78,.69,.73,.78,.73],
    snow: [.79,.74,.79,.78,.78], sky: [.81,.74,.79,.77,.79],
    farm: [.55,.46,.55,.58,.53], night: [.66,.55,.65,.64,.60],
  };
  // Each feature has a painted depth and a small ground footprint. The matching
  // transparent overlay is lifted straight out of the book's existing SVG art.
  const FEATURES = {
    forest: [
      {key:'tree0',rect:[0, 10, 290, 430],x:.095,y:.699,rx:.022,ry:.025,top:.34},
      {key:'tree1',rect:[155, 80, 270, 302],x:.290,y:.606,rx:.018,ry:.022,top:.29},
      {key:'tree2',rect:[670, 0, 330, 430],x:.866,y:.682,rx:.022,ry:.025,top:.32},
      {key:'tree3',rect:[610, 140, 235, 260],x:.727,y:.634,rx:.017,ry:.022,top:.33},
      {key:'brush',rect:[0, 540, 1000, 85],y:.98},
    ],
    jungle:[{key:'palms',rect:[0, 60, 1000, 410],y:.726}, {key:'trunkL',x:.168,y:.725,rx:.023,ry:.023,top:.40,toX:.123}, {key:'trunkR',x:.831,y:.715,rx:.023,ry:.023,top:.40,toX:.878}, {key:'brush',rect:[0, 70, 1000, 470],y:.85}],
    farm:[{key:'barn',rect:[605, 155, 255, 285],x:.733,y:.70,rx:.11,ry:.04}, {key:'tree',rect:[30, 195, 200, 220],x:.129,y:.658,rx:.018,ry:.024,top:.43}, {key:'fence',rect:[15, 430, 415, 90],x:.22,y:.82,rx:.205,ry:.021}],
    savanna:[{key:'trees',rect:[30, 195, 910, 270],y:.725}, {key:'trunkL',x:.176,y:.714,rx:.018,ry:.025,top:.43}, {key:'trunkR',x:.840,y:.725,rx:.018,ry:.025,top:.52}],
    ocean:[{key:'plants',rect:[50, 425, 900, 170],y:.93}],
  };
  const featureImages = new Map();
  let openPages = new Set(), offscreenTime = 0, bookChanged = false;
  const rear = (s,x) => {const v=TERRAIN[s.id],u=clamp(x,0,1)*4,i=Math.min(3,Math.floor(u));return v[i]+(v[i+1]-v[i])*(u-i);};
  const airPreset = p => p==='fly'||p==='butterfly';
  const mobilePreset = p => ['walk','hop','crawl','roll','swim','fly','butterfly','climb'].includes(p);
  const habitat = (s,preset,x) => airPreset(preset)?[.23,Math.max(.40,rear(s,x)-.045)]:preset==='swim'?[.23,s.water?.85:.83]:[rear(s,x)+.025,.965];
  const depthAt = (s,p,preset) => airPreset(preset)?.70+.38*(p.roam?.depth??.5):preset==='swim'?.78+clamp(p.y,0,1)*.25:.64+.49*clamp((p.y-rear(s,p.x))/(.97-rear(s,p.x)),0,1);
  const uid = () => 'actor_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
  function random(n) {n.seed=(Math.imul(n.seed,1664525)+1013904223)>>>0;return n.seed/4294967296;}
  function navigation(p) {
    if(p.roam)return p.roam;
    const seed=[...(p.uid||p.id)].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,73);
    return p.roam={seed,vx:0,vy:0,heading:p.dir<0?Math.PI:0,step:0,depth:.5,targetDepth:.5,until:0,rest:0,crossIn:30+seed%43,climbIn:8+seed%12};
  }
  function destination(s,p,n,preset) {
    // Stratified targets visit all four quadrants, with a different curved route
    // for every actor. A destination never resets the actual dropped position.
    const quadrant=n.step++%4,x=.10+((quadrant%2)*.5+random(n)*.5)*.80;
    const [lo,hi]=habitat(s,preset,x),u=(quadrant<2?.08:.58)+random(n)*.32;
    n.tx=x;n.ty=lo+(hi-lo)*u;n.targetDepth=.15+random(n)*.8;n.until=20+random(n)*16;
  }
  function allowedNeighbour(s,side,p) {
    const next=SCENES[SCENES.indexOf(s)+side];if(!next||!openPages.has(next.id))return null;
    const list=state.pages[next.id]||[];
    return list.length<LIMIT&&!list.some(q=>q.id===p.id)?next:null;
  }
  function transfer(s,p,n,side) {
    const next=allowedNeighbour(s,side,p);if(!next)return false;
    const source=state.pages[s.id],at=source.indexOf(p),target=state.pages[next.id]||=[];
    const oldX=p.x,oldTrip=p.trip;
    source.splice(at,1);target.push(p);p.x=side>0?-.14:1.14;
    if(p.trip?.home===next.id)delete p.trip;
    else if(!p.trip)p.trip={home:s.id,side,returnIn:18+random(n)*18};
    n.portal=0;n.arriving=side;n.rest=0;n.tx=side>0?.25:.75;n.ty=clamp(p.y,...habitat(next,presetFor(p.id),.5));n.until=12;n.crossIn=40+random(n)*50;
    dirty=true;
    // Moving one object is atomic in the single book storage record. Quota failure
    // rolls it back; ownership, journal originals and wallet are never changed.
    if(!save()){target.pop();source.splice(at,0,p);p.x=oldX;p.trip=oldTrip;n.portal=0;n.tx=.5;return false;}
    if(s.id===state.page){const a=actors.get(p.id);if(a)a.rig.cycles={};actors.delete(p.id);if(selected===p.id)selected=null;}
    if(next.id===state.page)attachActor(p);
    bookChanged=true;return true;
  }
  function attachActor(p) {
    const version=pageVersion,page=state.page;
    imageFor(p.id).then(image=>{
      if(!active||version!==pageVersion||state.page!==page||!placements().includes(p))return;
      if(!actors.has(p.id)){const a=makeActor(p.id,image,navigation(p).seed%19);a.facing=p.dir;actors.set(p.id,a);}requestPaint();
    }).catch(()=>{});
  }
  function roamPage(s,dt) {
    const list=[...(state.pages[s.id]||[])];
    for(const p of list){
      if(s.id===state.page&&pointer?.id===p.id)continue;
      const preset=presetFor(p.id),n=navigation(p);
      if(!mobilePreset(preset)||preset==='swim'&&!s.water){n.vx=n.vy=0;continue;}
      n.depth??=.5;n.targetDepth??=.5;n.depth+=(n.targetDepth-n.depth)*(1-Math.exp(-dt*.45));
      if(n.arriving&&(n.arriving>0?p.x>.14:p.x<.86))n.arriving=0;
      n.crossIn-=dt;n.climbIn-=dt;n.until-=dt;n.rest=Math.max(0,n.rest-dt);
      if(p.trip)p.trip.returnIn-=dt;
      if(n.climb){
        const f=(FEATURES[s.id]||[]).find(f=>f.key===n.climb);
        if(!f){delete n.climb;continue;}
        if(n.rest>0)continue;
        n.climbT+=dt*.19*n.climbDir;
        if(n.climbT>=1){n.climbT=1;n.climbDir=-1;n.rest=1.4;}
        const u=smooth(n.climbT),entry=1-smooth(n.climbT/.18);
        p.x=f.x+.042+((f.toX||f.x)-f.x)*u+((n.climbFromX??f.x)-f.x-.042)*entry;
        p.y=f.y+(f.top-f.y)*u+((n.climbFromY??f.y)-f.y)*entry;
        n.vx=0;n.vy=-.04*n.climbDir;n.activity='climb';
        if(n.climbT<=0){delete n.climb;n.climbIn=30+random(n)*30;destination(s,p,n,preset);}
        dirty=true;continue;
      }
      const climber=preset==='climb'||/egern/.test(state.own?.[p.id]?.lessonId||p.id);
      const climbFeature=climber&&n.climbIn<=0?(FEATURES[s.id]||[]).find(f=>f.top):null;
      if(climbFeature){n.tx=climbFeature.x+.028;n.ty=climbFeature.y;if(Math.hypot((p.x-n.tx), (p.y-n.ty)*H/W)<.04){n.climb=climbFeature.key;n.climbFromX=p.x;n.climbFromY=p.y;n.climbT=0;n.climbDir=1;p.dir=-1;continue;}}
      const tripReady=p.trip&&p.trip.returnIn<=0;
      if(!climbFeature&&!n.portal&&(n.crossIn<=0||tripReady)){
        const side=tripReady?-p.trip.side:(random(n)<.5?-1:1);
        if(allowedNeighbour(s,side,p)){n.portal=side;n.tx=side<0?-.20:1.20;n.ty=clamp(p.y,...habitat(s,preset,.5));n.until=60;}
        else n.crossIn=5;
      }
      const distance=Math.hypot((n.tx??p.x)-p.x,((n.ty??p.y)-p.y)*H/W);
      if(!climbFeature&&!n.portal&&(n.tx===undefined||n.until<=0||distance<.035)){
        if(n.tx!==undefined&&random(n)<.42)n.rest=.8+random(n)*2.6;
        destination(s,p,n,preset);
      }
      // Distances and accelerations use square world units; y integrates through
      // the page aspect ratio. Bounded heading changes give a genuine turning arc.
      let dx=n.tx-p.x,dy=(n.ty-p.y)*H/W;
      const norm=Math.hypot(dx,dy)||1;dx/=norm;dy/=norm;
      let steerX=dx,steerY=dy;
      const body=actors.get(p.id),radius=body&&s.id===state.page?body.w*depthAt(s,p,preset)/W*.42:.064;
      for(const other of list){
        if(other===p)continue;
        const op=presetFor(other.id);
        const floating=preset==='swim'&&!s.water,otherFloating=op==='swim'&&!s.water;
        // Even different habitats share the picture: steer around silhouettes
        // when their projected positions converge, including a bird and a fish.
        const on=navigation(other),rx=(p.x-other.x)+(n.vx-on.vx)*.65,ry=(p.y-other.y)*H/W+(n.vy-on.vy)*.65;
        const oa=s.id===state.page?actors.get(other.id):null;
        const gap=Math.hypot(rx,ry),safe=radius+(oa?oa.w*depthAt(s,other,op)/W*.44:.075);
        if(gap<safe+.055){const strength=clamp((safe+.055-gap)/(safe+.055),0,1)*3;const sign=p.uid<other.uid?-1:1;
          steerX+=(gap>.001?rx/gap:sign*.7)*strength;steerY+=(gap>.001?ry/gap:sign*.7)*strength;}
      }
      if(groundPreset(preset)||preset==='climb')for(const f of FEATURES[s.id]||[]){
        if(!f.rx||f===climbFeature)continue;
        const rx=(p.x+n.vx*.6-f.x)/(f.rx+radius*.55),ry=(p.y+n.vy*.6*W/H-f.y)/(f.ry+.025),d=Math.hypot(rx,ry);
        if(d<1.6){steerX+=rx/(d||1)*(1.6-d)*2;steerY+=ry/(d||1)*(1.6-d)*2;}
      }
      const [lo,hi]=habitat(s,preset,p.x),edge=Math.max(.09,radius+.055);
      if(!n.portal){steerX+=Math.max(0,(edge-p.x)/edge)*2-Math.max(0,(p.x-(1-edge))/edge)*2;}
      steerY+=Math.max(0,(lo+.035-p.y)/.08)*2-Math.max(0,(p.y-(hi-.025))/.07)*2;
      // A manual drop outside a habitat returns along a visible continuous path.
      const wanted=Math.atan2(steerY,steerX),turn=Math.atan2(Math.sin(wanted-n.heading),Math.cos(wanted-n.heading));
      n.heading+=clamp(turn,-dt*1.9,dt*1.9);
      let speed=preset==='crawl'?.017:airPreset(preset)?.058:preset==='roll'?.047:preset==='swim'?.04:.033;
      n.activity=n.rest>0?'look':n.step%7===6?'run':'walk';
      if(n.activity==='run')speed*=1.3;
      speed*=n.rest>0?0:.35+.65*Math.max(0,Math.cos(turn));
      if(!n.portal&&!n.arriving)speed*=clamp(Math.min(p.x,1-p.x)/(radius+.055),.12,1);
      if(climbFeature||n.portal)speed=Math.max(speed,.024);
      const tx=Math.cos(n.heading)*speed,ty=Math.sin(n.heading)*speed,accel=dt*.09;
      n.vx+=clamp(tx-n.vx,-accel,accel);n.vy+=clamp(ty-n.vy,-accel,accel);
      p.x+=n.vx*dt;p.y+=n.vy*dt*W/H;
      // Emergency guards are beyond the soft boundary, never a habitat snap.
      p.y=clamp(p.y,0,1);if(!n.portal)p.x=clamp(p.x,-.17,1.17);
      if(n.portal&&(n.portal<0?p.x<-.145:p.x>1.145)){
        const side=n.portal;if(!transfer(s,p,n,side)){n.arriving=-side;n.portal=0;n.crossIn=5;destination(s,p,n,preset);}
      }
      if(Math.abs(n.vx)>.0001||Math.abs(n.vy)>.0001)dirty=true;
    }
  }
  function settleNeighbours(dt){
    if(!dt)return;const list=placements();
    for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
      const p=list[i],q=list[j],a=actors.get(p.id),b=actors.get(q.id);if(!a||!b||pointer?.id===p.id||pointer?.id===q.id)continue;
      const an=navigation(p),bn=navigation(q);if(an.climb||bn.climb||an.portal||bn.portal)continue;
      const floating=x=>airPreset(x)||x==='swim'&&!scene().water;

      const ax=a.w*depthAt(scene(),p,a.preset),bx=b.w*depthAt(scene(),q,b.preset);
      const safeX=(ax+bx)*.46/W,safeY=(floating(a.preset)||floating(b.preset)||a.preset==='swim'||b.preset==='swim')?(a.h+b.h)*.30/H:.085;
      const dx=(q.x-p.x)/safeX,dy=(q.y-p.y)/safeY,d=Math.hypot(dx,dy);if(d>=1)continue;
      const fixedA=!mobilePreset(a.preset)||a.preset==='swim'&&!scene().water,fixedB=!mobilePreset(b.preset)||b.preset==='swim'&&!scene().water;
      if(fixedA&&fixedB)continue;
      const sign=p.uid<q.uid?-1:1,ux=d>.001?dx/d:sign*.707,uy=d>.001?dy/d:sign*.707;
      const amount=(1-d)*(1-Math.exp(-dt*2)),share=fixedA?0:fixedB?1:.5;
      const sx=ux*safeX*amount,sy=uy*safeY*amount;
      p.x=clamp(p.x-sx*share,0,1);p.y=clamp(p.y-sy*share,0,1);
      q.x=clamp(q.x+sx*(1-share),0,1);q.y=clamp(q.y+sy*(1-share),0,1);dirty=true;
    }
  }

  function roamBook(dt) {
    if(!dt)return;
    roamPage(scene(),dt);offscreenTime+=dt;
    if(offscreenTime>=.20){const step=offscreenTime;offscreenTime=0;for(const s of SCENES)if(s.id!==state.page&&openPages.has(s.id))roamPage(s,step);}
    if(bookChanged){bookChanged=false;updatePage();}
  }

  const q = id => document.getElementById(id);
  const lessonFor = id => LESSONS.find(l=>l.id===id) || state?.own?.[id];
  const presetFor = id => state?.own?.[id]?.motion || PRESETS[id] || (lessonFor(id)?.cat === 'natur' ? 'sway' : 'idle');
  const groundPreset = p => ['walk', 'hop', 'crawl', 'roll', 'sway', 'portrait', 'idle', 'climb'].includes(p);
  const earned = id => !!state?.own?.[id] || !!store.get().done[id];
  const unlocked = scene => !scene.price || !!latestWallet().unlocked['scene:' + scene.id];
  const sceneProduct = scene => ({ id: 'scene:' + scene.id, sceneId: scene.id, title: scene.title, price: scene.price, shop: true, stickerScene: true, art: scene.art });
  const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
  let motionPaused = false;
  let state, active = false, frame = 0, last = 0, elapsed = 0, dirty = false, savedAt = 0, storageWarned = false;
  let selected = null, pointer = null, holdTimer = 0, flipTimer = 0, pageVersion = 0, pendingLesson = null;
  let soundEnabled = true, soundContext = null, mutedUntil = 0, photo = null, photoVersion = 0;
  const images = new Map(), actors = new Map(), particles = [];
  let assetDB;
  const blank = () => ({ v: 1, page: 'meadow', pages: {}, custom: {}, own: {} });
  function readState() {
    const value = readLocal(KEY), next = blank();
    if (value?.v !== 1) return next;
    for(const [id,item] of Object.entries(objectMap(value.own))) if(/^scan_[a-z0-9:_-]+$/i.test(id)&&item&&typeof item.title==='string'&&['walk','swim','fly','idle','hop','crawl','sway','portrait','roll','butterfly','climb'].includes(item.motion))next.own[id]={id,title:item.title.slice(0,100),motion:item.motion,lessonId:item.lessonId,entryId:item.entryId,cat:'dyr'};
    next.page = SCENES.some(s => s.id === value.page) ? value.page : 'meadow';
    for (const scene of SCENES) {
      const seen = new Set();
      next.pages[scene.id] = (Array.isArray(value.pages?.[scene.id]) ? value.pages[scene.id] : []).filter(p => {
        if (!p || !(LESSONS.some(l=>l.id===p.id)||next.own[p.id]) || seen.has(p.id)) return false;
        seen.add(p.id); return true;
      }).slice(0, LIMIT).map(p => {
        const next={id:p.id,uid:typeof p.uid==='string'?p.uid.slice(0,90):uid(),
          x:Number.isFinite(p.x)?clamp(p.x,-.17,1.17):.5,
          y:Number.isFinite(p.y)?clamp(p.y,0,1):scene.ground,dir:p.dir===-1?-1:1};
        if(p.roam&&typeof p.roam==='object'){
          const n=navigation(next);
          for(const key of ['seed','vx','vy','heading','step','until','rest','crossIn','climbIn','tx','ty','climbT','climbDir','climbFromX','climbFromY','depth','targetDepth'])
            if(Number.isFinite(p.roam[key]))n[key]=clamp(p.roam[key],-10000000000,10000000000);
          n.vx=clamp(n.vx,-.15,.15);n.vy=clamp(n.vy,-.15,.15);
          n.portal=p.roam.portal===-1?-1:p.roam.portal===1?1:0;
          n.arriving=p.roam.arriving===-1?-1:p.roam.arriving===1?1:0;
          if((FEATURES[scene.id]||[]).some(f=>f.key===p.roam.climb&&f.top))n.climb=p.roam.climb;
        }
        if(p.trip&&SCENES.some(s=>s.id===p.trip.home)&&Math.abs(SCENES.findIndex(s=>s.id===p.trip.home)-SCENES.indexOf(scene))===1)
          next.trip={home:p.trip.home,side:p.trip.side===-1?-1:1,returnIn:clamp(Number(p.trip.returnIn)||0,0,180)};
        return next;
      });
    }
    for (const [id, revision] of Object.entries(value.custom || {})) if ((LESSONS.some(l=>l.id===id)||next.own[id]) && Number.isFinite(revision)) next.custom[id] = revision;
    return next;
  }
  const scene = () => SCENES.find(s => s.id === state.page) || SCENES[0];
  const placements = () => state.pages[state.page] ||= [];
  function save(force = false) {
    if (!state || (!dirty && !force)) return true;
    try {
      localStorage.setItem(KEY, JSON.stringify(state)); dirty = false; savedAt = elapsed; storageWarned = false; return true;
    } catch {
      if (!storageWarned) toast('Bogen kunne ikke gemmes. Der skal være mere plads på enheden.');
      storageWarned = true; return false;
    }
  }
  function assetStore(mode, fn) {
    assetDB ||= new Promise((resolve, reject) => {
      const r = indexedDB.open('tegneskolen-stickers', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('cutouts', { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result); r.onerror = () => { assetDB = null; reject(r.error); };
      r.onblocked = () => { assetDB = null; reject(new Error('Luk andre åbne vinduer af appen og prøv igen.')); };
    });
    return assetDB.then(d => new Promise((resolve, reject) => {
      const t = d.transaction('cutouts', mode), request = fn(t.objectStore('cutouts'));
      t.oncomplete = () => resolve(request.result); t.onerror = t.onabort = () => reject(t.error || new Error('Lageret kunne ikke åbnes'));
    }));
  }
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Billedet kunne ikke hentes')); image.src = src;
    });
  }
  async function imageFor(id) {
    const revision = state.custom[id] || 0, key = id + ':' + revision;
    if (images.has(key)) return images.get(key);
    const promise = (async () => {
      if (revision) {
        try {
          const own = await assetStore('readonly', s => s.get(id + ':' + revision));
          if (own?.png) return await loadImage(own.png);
        } catch { /* The built lesson cutout remains available if IDB is unavailable. */ }
      }
      const lesson=lessonFor(id);if(!lesson?.dir)throw Error('Dit udklip kunne ikke åbnes. Det oprindelige foto er stadig i tegnebogen.');return loadImage(lesson.dir+'sticker.png');
    })();
    images.set(key, promise);
    promise.catch(() => { if (images.get(key) === promise) images.delete(key); });
    // Limit decoded bitmaps retained while exploring the book.
    if (images.size > 24) images.delete(images.keys().next().value);
    return promise;
  }
  // Small alpha-aware rigs: preprocessing is once per decoded cutout, never per frame.
  // LBS uses two local bones per vertex. No model download, generated art or server.
  const rigCache = new WeakMap();
  const TAU = Math.PI * 2;
  let meshRenderer = null, drawingMesh = false, renderMode = 'canvas2d';
  const timing=[];
  const smooth = x => { x = clamp(x, 0, 1); return x*x*(3-2*x); };
  function rigKind(id, preset) {
    const source = state?.own?.[id]?.lessonId || id;
    if (preset === 'portrait') return 'portrait';
    if (/snegl/.test(source)) return 'crawler';
    if (preset === 'butterfly') return 'butterfly';
    if (preset === 'swim') return 'fish';
    if (preset === 'sway' && !/papegoeje/.test(source)) return 'plant';
    if (['fly'].includes(preset) || /fugl|ugle|oern|kylling|pingvin|papegoeje/.test(source)) return 'bird';
    if (['walk','hop','crawl','climb'].includes(preset)) return 'quadruped';
    return 'still';
  }
  function buildRig(image, kind, id = '') {
    let cached = rigCache.get(image);
    if (cached?.kind === kind) return cached;
    const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
    const texture = document.createElement('canvas'), scale = Math.min(1, 384 / Math.max(iw, ih));
    texture.width = Math.max(1, Math.round(iw*scale)); texture.height = Math.max(1, Math.round(ih*scale));
    const tc = texture.getContext('2d'); tc.drawImage(image,0,0,texture.width,texture.height);
    // An explicit mask also works for journal cutouts: the scan flow already removed paper.
    const size=64, maskCanvas=document.createElement('canvas'); maskCanvas.width=maskCanvas.height=size;
    const mc=maskCanvas.getContext('2d'); mc.drawImage(texture,0,0,size,size);
    const pixels=mc.getImageData(0,0,size,size).data, mask=new Uint8Array(size*size), distance=new Float32Array(size*size);
    let minX=63,minY=63,maxX=0,maxY=0;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const n=y*size+x, on=pixels[n*4+3]>40;
      mask[n]=on?1:0; distance[n]=on?64:0;
      if(on){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    }
    // Close one-pixel breaks, then flood the exterior. Enclosed pencil outlines
    // become an anatomical silhouette while gaps between limbs stay outside.
    const closed=new Uint8Array(mask),outside=new Uint8Array(4096),holes=new Uint8Array(4096),queue=new Uint16Array(4096);let head=0,tail=0;
    for(let y=1;y<63;y++)for(let x=1;x<63;x++){const n=y*64+x;if(mask[n-1]&&mask[n+1]||mask[n-64]&&mask[n+64])closed[n]=1;}
    const push=n=>{if(!closed[n]&&!outside[n]){outside[n]=1;queue[tail++]=n;}};
    for(let i=0;i<64;i++){push(i);push(4032+i);push(i*64);push(i*64+63);}
    while(head<tail){const n=queue[head++],x=n%64,y=(n/64)|0;if(x)push(n-1);if(x<63)push(n+1);if(y)push(n-64);if(y<63)push(n+64);}
    for(let n=0;n<4096;n++){if(!outside[n]&&!closed[n])holes[n]=1;if(!outside[n])mask[n]=1;distance[n]=mask[n]?64:0;}
    // Chamfer distance transform supplies the thick medial ridge, even for hollow ink.
    for(let y=1;y<63;y++)for(let x=1;x<63;x++){const n=y*64+x;if(mask[n])distance[n]=Math.min(distance[n],distance[n-1]+1,distance[n-64]+1,distance[n-65]+1.414,distance[n-63]+1.414);}
    for(let y=62;y>0;y--)for(let x=62;x>0;x--){const n=y*64+x;if(mask[n])distance[n]=Math.min(distance[n],distance[n+1]+1,distance[n+64]+1,distance[n+65]+1.414,distance[n+63]+1.414);}
    if(maxX<minX){minX=minY=1;maxX=maxY=62;}
    const bx=minX/64, by=minY/64, bw=(maxX-minX+1)/64, bh=(maxY-minY+1)/64;
    const at=(x,y,ridge=false)=>{
      const tx=(bx+x*bw)*64,ty=(by+y*bh)*64;let best=Infinity,result=[tx/64,ty/64];
      for(let yy=Math.max(1,Math.floor(ty-12));yy<Math.min(63,ty+13);yy++)for(let xx=Math.max(1,Math.floor(tx-12));xx<Math.min(63,tx+13);xx++){
        const n=yy*64+xx;if(!mask[n])continue;
        const cost=(xx-tx)**2+(yy-ty)**2-(ridge?distance[n]*2:0);
        if(cost<best){best=cost;result=[(xx+.5)/64,(yy+.5)/64];}
      }return result;
    };
    const bones=[];
    const bone=(name,start,end,parent=0)=>{const a=at(...start,true),b=at(...end);bones.push({name,x:a[0],y:a[1],ex:b[0],ey:b[1],parent,angle:0,dx:0,dy:0,sx:1,sy:1});return bones.length-1;};
    bone('body',[.5,.55],[.5,.3],-1);
    const source=state?.own?.[id]?.lessonId||id;
    // View is art metadata, never inferred from the image's aspect ratio.
    // Narrow standing elephants, deer and wolves remain independently mobile.
    const seated=['e_hund','e_kat','panda','s_panda_baby','e_kanin','kanin','e_frø','egern'].includes(source);
    const frontal=kind==='quadruped'&&(['e_hund','e_kat','panda','s_panda_baby','e_kanin','kanin','e_frø','e_ulv','s_ulv'].includes(source));
    // Drawing perspective matters: front-facing seated animals retain their seated pose.
    let left=/^(ulv|s_ulv|e_ulv|raev|e_ræv|e_puma|puma|elefant|hjort|hest|egern)/.test(source);
    if(kind==='fish'){let mass=0,center=0;for(let y=1;y<63;y++)for(let x=1;x<63;x++){const m=distance[y*64+x]**3;mass+=m;center+=m*x;}left=mass?center/mass<(minX+maxX)/2:/e_fisk/.test(source);}
    const headX=frontal?.5:left?.2:.8, tailX=left?.92:.08;
    if(kind==='quadruped'){
      bone('head',[headX,.42],[headX,.18]);
      bone('tail',[tailX,.56],[tailX,.78]);
      if(source==='egern'){bone('handL',[.4,.60],[.16,.53]);bone('handR',[.38,.56],[.16,.50]);}
      // Find feet as lower silhouette lobes (runs in the bottom third).
      const runs=[];let run=null;
      for(let x=minX;x<=maxX;x++){
        let foot=0;for(let y=Math.floor(minY+(maxY-minY)*.73);y<=maxY;y++)if(mask[y*64+x])foot=y;
        if(foot){if(!run)run={x0:x,x1:x,y:foot};run.x1=x;run.y=Math.max(run.y,foot);}
        else if(run){runs.push(run);run=null;}
      }if(run)runs.push(run);
      const footXs=runs.filter(r=>r.x1-r.x0>=1).map(r=>[(r.x0+r.x1+1)/128,(r.y+.5)/64]);
      const defaults=frontal?[.32,.44,.56,.68]:[.22,.35,.65,.79];
      for(let i=0;i<4;i++){
        const target=defaults[i],near=footXs.reduce((a,b)=>Math.abs(b[0]-(bx+target*bw))<Math.abs(a[0]-(bx+target*bw))?b:a,[bx+target*bw,by+bh*.96]);
        const hip=[(near[0]-bx)/bw,frontal?.74:.58],knee=[hip[0],.8];
        const upper=bone('leg'+i,hip,knee);bone('shin'+i,knee,[(near[0]-bx)/bw,(near[1]-by)/bh],upper);
      }
      bone('earL',[headX-.10,.23],[headX-.14,.02],1);bone('earR',[headX+.10,.23],[headX+.14,.02],1);
    }else if(kind==='bird'||kind==='butterfly'){
      bone('wingL',[.46,.48],[.05,.20]);bone('wingR',[.54,.48],[.95,.20]);
      bone('head',[.5,.38],[.5,.16]);bone('tail',[.5,.68],[.5,.95]);
      if(kind==='bird'&&!['fly'].includes(presetFor(id))){for(let i=0;i<2;i++){const x=i?.62:.38,upper=bone('leg'+i,[x,.79],[x,.88]);bone('shin'+i,[x,.88],[x,.99],upper);}}
    }else if(kind==='crawler'){
      bone('head',[.75,.60],[.86,.42]);bone('tail',[.35,.80],[.08,.86]);
      bone('earL',[.82,.4],[.78,.17],1);bone('earR',[.88,.4],[.96,.20],1);
    }else if(kind==='fish'){
      for(let i=0;i<4;i++)bone(i===3?'fin':'spine'+i,[left?.25+i*.17:.75-i*.17,.53],[left?.42+i*.17:.58-i*.17,.53],i===0?0:i);
      bone('head',[left?.22:.78,.48],[left?.08:.92,.48]);
    }else if(kind==='plant'){
      for(let i=0;i<4;i++)bone('stem'+i,[.5,.98-i*.22],[.5,.76-i*.22],i===0?0:i);
      bone('leafL',[.48,.65],[.15,.52],2);bone('leafR',[.52,.54],[.85,.39],3);
    }else if(kind==='portrait'){
      bone('head',[.5,.65],[.5,.28]);bone('earL',[.25,.28],[.18,.07],1);bone('earR',[.75,.28],[.82,.07],1);
      if(/loeve|hest/.test(source)){bone('maneL',[.3,.52],[.12,.76],1);bone('maneR',[.7,.52],[.88,.76],1);}
    }
    // Clipped regular triangulation: discard fully transparent cells, preserve concavities
    // and disconnected ink with a one-cell guard. The texture supplies the exact contour.
    const cols=18,rows=20,rest=[],uv=[],indices=[];
    for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){rest.push(x/cols,y/rows);uv.push(x/cols,y/rows);}
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      let occupied=false;
      for(let yy=Math.max(0,Math.floor(y*64/rows)-1);yy<=Math.min(63,Math.ceil((y+1)*64/rows)+1)&&!occupied;yy++)
        for(let xx=Math.max(0,Math.floor(x*64/cols)-1);xx<=Math.min(63,Math.ceil((x+1)*64/cols)+1);xx++)if(mask[yy*64+xx]){occupied=true;break;}
      if(occupied){const a=y*(cols+1)+x,b=a+cols+1;indices.push(a,b,a+1,a+1,b,b+1);}
    }
    const coarse=[];
    for(let y=0;y<rows;y+=2)for(let x=0;x<cols;x+=3){const a=y*(cols+1)+x,b=(y+2)*(cols+1)+x;coarse.push(a,b,a+3,a+3,b,b+3);}
    const weights=[], segmentDistance=(x,y,b)=>{const vx=b.ex-b.x,vy=b.ey-b.y,t=clamp(((x-b.x)*vx+(y-b.y)*vy)/(vx*vx+vy*vy||1),0,1);return Math.hypot(x-b.x-t*vx,y-b.y-t*vy);};
    for(let i=0;i<rest.length;i+=2){
      const x=rest[i],y=rest[i+1],rx=(x-bx)/bw,ry=(y-by)/bh;
      const candidates=bones.map((b,n)=>{
        let d=segmentDistance(x,y,b);
        // Body is rigid; restrict limb influence to the part of the silhouette it owns.
        if(n===0)d*=.85;
        if(/^leg|^shin/.test(b.name)&&ry<.60)d+=2;
        if(b.name==='head'&&kind==='quadruped'&&ry>.56)d+=2;
        if(b.name==='tail'&&kind==='quadruped'&&Math.abs(rx-tailX)>.22)d+=2;
        if(/^ear/.test(b.name)&&ry>.26)d+=2;
        if(/^hand/.test(b.name)&&(rx>.43||ry<.44||ry>.65))d+=2;
        if(/^wing/.test(b.name)&&Math.abs(rx-.5)<.12)d+=1;
        if(kind==='fish'&&n===0)d+=.25;
        if(kind==='plant'&&n===0)d+=.5;
        return {n,d:Math.max(.009,d)};
      }).sort((a,b)=>a.d-b.d);
      const a=candidates[0],b=candidates[1]||a,wa=1/a.d**4,wb=1/b.d**4;
      weights.push([a.n,b.n,wa/(wa+wb)]);
    }
    const eyes=[];
    if(kind==='portrait'||frontal){
      for(const side of [.36,.64]){
        const tx=bx+bw*side,ty=by+bh*(kind==='portrait'?.43:.28);let score=Infinity,eye=[tx,ty];
        for(let y=Math.floor((ty-.065*bh)*64);y<Math.min(63,(ty+.065*bh)*64);y++)for(let x=Math.max(0,Math.floor((tx-.075*bw)*64));x<Math.min(63,(tx+.075*bw)*64);x++){
          const n=(y*64+x)*4;if(y<0||pixels[n+3]<200)continue;
          const value=(pixels[n]+pixels[n+1]+pixels[n+2])/3+Math.hypot(x/64-tx,y/64-ty)*250;
          if(value<score){score=value;eye=[(x+.5)/64,(y+.5)/64];}
        }if(score<165)eyes.push(eye);
      }
    }
    // A small baked die-cut edge, contact-independent paper shadow and restrained sheen.
    const paper=document.createElement('canvas');paper.width=texture.width;paper.height=texture.height;
    const pc=paper.getContext('2d');pc.fillStyle='#fff';
    for(let i=0;i<8;i++){const a=i*TAU/8;pc.drawImage(texture,Math.cos(a)*1.1,Math.sin(a)*1.1);}
    pc.globalCompositeOperation='source-in';pc.fillRect(0,0,paper.width,paper.height);
    pc.globalCompositeOperation='source-over';
    const core=document.createElement('canvas');core.width=core.height=64;const cc=core.getContext('2d'),fill=cc.createImageData(64,64);
    for(let n=0;n<4096;n++)if(holes[n]){fill.data[n*4]=fill.data[n*4+1]=fill.data[n*4+2]=255;fill.data[n*4+3]=255;}
    cc.putImageData(fill,0,0);pc.drawImage(core,0,0,paper.width,paper.height);pc.drawImage(texture,0,0);
    const sheen=pc.createLinearGradient(0,0,paper.width,paper.height);sheen.addColorStop(0,'#ffffff12');sheen.addColorStop(.48,'#ffffff00');sheen.addColorStop(1,'#46385907');
    pc.globalCompositeOperation='source-atop';pc.fillStyle=sheen;pc.fillRect(0,0,paper.width,paper.height);
    cached={kind,texture:paper,rest:new Float32Array(rest),vertices:new Float32Array(rest.length),uv:new Float32Array(uv),indices:new Uint16Array(indices),coarse:new Uint16Array(coarse),weights,bones,eyes,frontal,seated,left,bounds:{bx,by,bw,bh},mask,distance};
    if(source==='s_sportsvogn')cached.wheels=[[.654,.66,.052,.193],[.944,.50,.021,.145]].map(([x,y,rx,ry])=>{
      const c=document.createElement('canvas');c.width=c.height=80;const ctx=c.getContext('2d');
      ctx.beginPath();ctx.arc(40,40,40,0,TAU);ctx.clip();
      ctx.drawImage(paper,(x-rx)*paper.width,(y-ry)*paper.height,2*rx*paper.width,2*ry*paper.height,0,0,80,80);
      return {x,y,rx,ry,image:c};
    });
    rigCache.set(image,cached);return cached;
  }
  function makeActor(id,image,phase=0,born=-10,preset=presetFor(id)) {
    const rig=buildRig(image,rigKind(id,preset),id);
    return {image,...dimensions(id,image),rig,phase,born,reaction:-10,preset,time:0,gait:phase,
      velocity:0,velocityY:0,drift:0,lift:0,liftVelocity:0,secondary:0,secondaryVelocity:0,facing:1,activity:'idle'};
  }
  function poseRig(a) {
    const r=a.rig,t=a.time||0,walk=a.walkAmount||0,cycle=a.gait||t*4,react=Math.max(0,1-(elapsed-a.reaction)/1.05);
    const wave=(speed,offset=0)=>Math.sin(a.cyclePhase===undefined?t*speed+offset:a.cyclePhase*Math.max(1,Math.round(speed/a.cycleFrequency))+offset);
    const idle=a.activity||'idle', breathe=wave(1.9)*.004;
    for(const b of r.bones){b.angle=0;b.dx=b.dy=0;b.sx=b.sy=1;}
    for(const b of r.bones){
      if(b.name==='body'){
        b.sy=1+breathe;
        if(idle==='sit'&&!r.frontal&&r.kind==='quadruped'){b.sy-=.025;b.dy+=.012;}
        if(idle==='stretch'){b.sx+=.025*wave(1.5);b.sy-=.012;}
      }
      if(b.name==='head'){
        b.angle=wave(.8)*.025+(idle==='look'?wave(1.7)*.085:0)+(idle==='sniff'?wave(7)*.026:0);
        b.dy=idle==='sniff'?.013:0;b.angle+=react*wave(12)*.055;
      }
      if(b.name==='tail'){b.angle=wave(3.2)*.15+a.secondary*.4+react*wave(15)*.2;}
      if(/^ear/.test(b.name)){b.angle=a.secondary*.22+wave(2.4,b.name==='earL'?0:1)*.028;}
      if(/^mane/.test(b.name))b.angle=a.secondary*.32+wave(2.4,b.name==='maneL'?0:1)*.012;
      if(/^leg|^shin/.test(b.name)){
        const leg=Number(b.name.slice(-1)),phase=(cycle/TAU+leg*.5+(leg>1?.25:0))%1;
        // Stance occupies 62% of a stride: foot moves back at ground speed, then
        // lifts in a smooth swing. The stride is tied to distance travelled below.
        const stance=.62, u=phase<stance?phase/stance:(phase-stance)/(1-stance);
        const stride=.093*Math.min(1,walk),dx=phase<stance?stride*(.5-u):stride*(-.5+smooth(u));
        const dy=phase<stance?0:-Math.sin(u*Math.PI)*.042*walk;
        b.dx=dx*(r.left?-1:1);b.dy=dy+(a.bodyBob||0)/a.h;
        if(b.name.startsWith('leg')){b.dx*=.38;b.dy*=.3;}
        else {b.angle=phase<stance?0:Math.sin(u*Math.PI)*.12*walk;}
      }
      if(idle==='climb'&&/^hand|^shin|^leg/.test(b.name)){
        const limb=/R|1|3/.test(b.name)?Math.PI:0,u=((cycle+limb)/TAU%1+1)%1;
        b.dy=(u<.62?(.5-u/.62)*.075:(-.5+smooth((u-.62)/.38))*.075);
        b.dx=Math.sin(u*Math.PI)*.009;b.angle=0;
      }
      if(/^wing/.test(b.name)){
        const sign=b.name==='wingL'?-1:1,flap=wave(r.kind==='butterfly'?9:6);
        b.angle=sign*flap*(a.preset==='fly'?.23:.045);
        b.sx=r.kind==='butterfly'?.38+.62*(.5+.5*flap):1;
        b.dy=r.kind==='butterfly'?0:flap*.015;
      }
      if(/^spine|^fin/.test(b.name)){
        const n=b.name==='fin'?3:Number(b.name.slice(-1));
        b.angle=wave(4.2,-n*.65)*(.025+n*.034)+a.secondary*.1;
        b.dy=wave(4.2,-n*.65)*(.003+n*.004);
      }
      if(/^stem/.test(b.name)){
        const n=Number(b.name.slice(-1));b.angle=wave(1.25,-n*.25)*(.022+n*.012)+a.secondary*.05;
        b.dx=wave(1.25,-n*.25)*n*.003;
      }
      if(/^leaf/.test(b.name))b.angle=wave(2.1)*.055+a.secondary*.2;
      // Parent rotations are propagated around the parent's rest origin.
      const parent=r.bones[b.parent];
      if(parent&&b.parent>0){b.angle+=parent.angle*.65;b.dx+=parent.dx;b.dy+=parent.dy;}
      b.c=Math.cos(b.angle);b.s=Math.sin(b.angle);
    }
    // Live mesh stance contacts are kept in page coordinates. The sole stays
    // planted while the root approaches/recedes and releases during swing.
    if(a.root&&!r.seated&&!navigation(a.root).climb&&walk>.04&&['quadruped','bird'].includes(r.kind)){
      const p=a.root,depth=depthAt(scene(),p,a.preset),mirror=r.frontal?1:(p.dir<0?-1:1)*(r.left?-1:1);
      a.contacts ||= [];
      for(const b of r.bones.filter(b=>b.name.startsWith('shin'))){
        const leg=Number(b.name.slice(-1)),phase=((cycle/TAU+leg*.5+(leg>1?.25:0))%1+1)%1;
        if(phase>=.62){a.contacts[leg]=null;continue;}
        let contact=a.contacts[leg];
        if(!contact||contact.mirror!==mirror){contact={x:p.x*W+(b.ex-.5)*a.w*depth*mirror,y:p.y*H+(b.ey-1)*a.h*depth,mirror};a.contacts[leg]=contact;}
        const dx=(contact.x-p.x*W)/(a.w*depth*mirror)+.5-b.ex,dy=(contact.y-p.y*H)/(a.h*depth)+1-b.ey;
        // An emergency replant bounds the heuristic rig's reach after a drag or
        // a large speed change, preserving the original drawing's joint closure.
        if(Math.abs(dx)>.11||Math.abs(dy)>.065){a.contacts[leg]=null;continue;}
        b.dx=dx;b.dy=dy+(a.bodyBob||0)/a.h;
      }
    }else if(a.root)a.contacts=[];

    // Two-bone inverse kinematics: pin stance feet, bend the knee on swing.
    if(r.kind==='quadruped'&&walk>.01&&idle!=='climb'){for(let leg=0;leg<4;leg++){
      const upper=r.bones.find(b=>b.name==='leg'+leg),shin=r.bones.find(b=>b.name==='shin'+leg);
      const fx=shin.ex+shin.dx,fy=shin.ey+shin.dy,l1=Math.hypot(upper.ex-upper.x,upper.ey-upper.y),l2=Math.hypot(shin.ex-shin.x,shin.ey-shin.y);
      if(l1<.015||l2<.015)continue;
      const dx=fx-upper.x,dy=fy-upper.y,d=clamp(Math.hypot(dx,dy),Math.abs(l1-l2)+.0001,l1+l2-.0001);
      const bend=Math.acos(clamp((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1));
      const angle=Math.atan2(dy,dx)+(r.left?1:-1)*bend;
      upper.angle=angle-Math.atan2(upper.ey-upper.y,upper.ex-upper.x);upper.dx=upper.dy=0;
      const kx=upper.x+Math.cos(angle)*l1,ky=upper.y+Math.sin(angle)*l1;
      shin.angle=Math.atan2(fy-ky,fx-kx)-Math.atan2(shin.ey-shin.y,shin.ex-shin.x);shin.dx=kx-shin.x;shin.dy=ky-shin.y;
      for(const b of [upper,shin]){b.c=Math.cos(b.angle);b.s=Math.sin(b.angle);}
    }}
    const bones=r.bones,blinkPhase=(t+a.phase*.3)%5.3,blink=blinkPhase<.16?Math.sin(blinkPhase/.16*Math.PI):0;
    for(let n=0,i=0;i<r.rest.length;i+=2,n++){
      const x=r.rest[i],y=r.rest[i+1],[ia,ib,w]=r.weights[n],a=bones[ia],b=bones[ib];
      const ax=(x-a.x)*a.sx,ay=(y-a.y)*a.sy,bx=(x-b.x)*b.sx,by=(y-b.y)*b.sy;
      r.vertices[i]=(a.x+ax*a.c-ay*a.s+a.dx)*w+(b.x+bx*b.c-by*b.s+b.dx)*(1-w);
      r.vertices[i+1]=(a.y+ax*a.s+ay*a.c+a.dy)*w+(b.y+bx*b.s+by*b.c+b.dy)*(1-w);
      if(blink&&r.eyes.length){for(const eye of r.eyes){const dx=(x-eye[0])/(r.bounds.bw*.085),dy=(y-eye[1])/(r.bounds.bh*.065),falloff=Math.exp(-3*(dx*dx+dy*dy));r.vertices[i+1]-=(y-eye[1])*falloff*blink*.9;}}

    }
  }
  function createMeshRenderer() {
    try {
    const canvas=document.createElement('canvas');
    const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false});
    if(!gl||typeof gl.createShader!=='function')return null;
    const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const program=gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 position;attribute vec2 uv;uniform mat3 transform;varying vec2 texcoord;void main(){vec3 p=transform*vec3(position,1.0);gl_Position=vec4(p.xy,0.,1.);texcoord=uv;}'));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;uniform sampler2D image;uniform vec3 light;uniform float opacity;varying vec2 texcoord;void main(){vec4 c=texture2D(image,texcoord);gl_FragColor=vec4(c.rgb*light,c.a)*opacity;}'));
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))return null;
    const positions=gl.createBuffer(),uvs=gl.createBuffer(),elements=gl.createBuffer(),textures=new Map();
    const pa=gl.getAttribLocation(program,'position'),ua=gl.getAttribLocation(program,'uv'),matrix=gl.getUniformLocation(program,'transform'),light=gl.getUniformLocation(program,'light'),opacityUniform=gl.getUniformLocation(program,'opacity');
    let lost=false;
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;requestPaint();});
    canvas.addEventListener('webglcontextrestored',()=>{meshRenderer=null;requestPaint();});
    return {
      begin(w,h){if(lost||gl.isContextLost())return false;if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);return true;},
      draw(r,x,y,w,h,sx,sy,angle,depth,opacity=1){
        gl.uniform1f(opacityUniform,opacity);
        let texture=textures.get(r);
        if(!texture){texture=gl.createTexture();textures.set(r,texture);gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,r.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}
        else gl.bindTexture(gl.TEXTURE_2D,texture);
        const c=Math.cos(angle),s=Math.sin(angle),ax=w*sx*c,ay=w*sx*s,bx=-h*sy*s,by=h*sy*c;
        gl.uniformMatrix3fv(matrix,false,new Float32Array([2*ax/W,-2*ay/H,0,2*bx/W,-2*by/H,0,2*(x-ax*.5-bx)/W-1,1-2*(y-ay*.5-by)/H,1]));
        const theme=state?.page,back=(1-depth)*.035;
        gl.uniform3f(light,theme==='ocean'?.93+back:theme==='night'?.88+back:1+back,(theme==='night'?.92:theme==='savanna'?.96:1)+back,(theme==='ocean'?1.035:theme==='savanna'?.91:1)+back);
        gl.bindBuffer(gl.ARRAY_BUFFER,positions);gl.bufferData(gl.ARRAY_BUFFER,r.vertices,gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(pa);gl.vertexAttribPointer(pa,2,gl.FLOAT,false,0,0);
        gl.bindBuffer(gl.ARRAY_BUFFER,uvs);gl.bufferData(gl.ARRAY_BUFFER,r.uv,gl.STATIC_DRAW);gl.enableVertexAttribArray(ua);gl.vertexAttribPointer(ua,2,gl.FLOAT,false,0,0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,elements);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,r.indices,gl.STATIC_DRAW);gl.drawElements(gl.TRIANGLES,r.indices.length,gl.UNSIGNED_SHORT,0);
      },
      end(ctx){ctx.drawImage(canvas,0,0,W,H);},
      clear(){for(const texture of textures.values())gl.deleteTexture(texture);textures.clear();}
    };
    }catch{return null;}
  }
  // Software Canvas has no efficient textured triangles. Cache a bounded, on-device
  // cycle of the same skinned mesh, with up to 48 poses per cycle.
  // Warming is spread over tasks; main-page movement and springs remain at rAF speed.
  function paintMesh2D(ctx,r,w,h) {
    const v=r.vertices,uv=r.rest,ix=r.coarse,tw=r.texture.width,th=r.texture.height;
    for(let i=0;i<ix.length;i+=3){
      const a=ix[i]*2,b=ix[i+1]*2,c=ix[i+2]*2,x0=uv[a]*tw,y0=uv[a+1]*th,x1=uv[b]*tw,y1=uv[b+1]*th,x2=uv[c]*tw,y2=uv[c+1]*th;
      const X0=(v[a]-.5)*w,Y0=(v[a+1]-1)*h,X1=(v[b]-.5)*w,Y1=(v[b+1]-1)*h,X2=(v[c]-.5)*w,Y2=(v[c+1]-1)*h;
      const det=(x1-x0)*(y2-y0)-(x2-x0)*(y1-y0);if(!det)continue;
      const A=((X1-X0)*(y2-y0)-(X2-X0)*(y1-y0))/det,B=((Y1-Y0)*(y2-y0)-(Y2-Y0)*(y1-y0))/det,C=((X2-X0)*(x1-x0)-(X1-X0)*(x2-x0))/det,D=((Y2-Y0)*(x1-x0)-(Y1-Y0)*(x2-x0))/det;
      ctx.save();ctx.beginPath();const cx=(X0+X1+X2)/3,cy=(Y0+Y1+Y2)/3;
      for(const [n,x,y]of [[0,X0,Y0],[1,X1,Y1],[2,X2,Y2]]){const dx=x-cx,dy=y-cy,k=.65/(Math.hypot(dx,dy)||1);if(n)ctx.lineTo(x+dx*k,y+dy*k);else ctx.moveTo(x+dx*k,y+dy*k);}
      ctx.closePath();ctx.clip();ctx.transform(A,B,C,D,X0-A*x0-C*y0,Y0-B*x0-D*y0);ctx.drawImage(r.texture,0,0);ctx.restore();
    }
  }
  const warmQueue=[];let warming=false;
  function queueWarm(job){warmQueue.push(job);if(warming)return;warming=true;
    const work=()=>{warming=false;const next=warmQueue.shift();if(next)next();if(warmQueue.length&&!warming){warming=true;schedule(work);}};
    const schedule=fn=>typeof requestIdleCallback==='function'?requestIdleCallback(fn,{timeout:500}):setTimeout(fn,16);
    schedule(work);
  }
  function fallbackCycle(a,walking) {
    const r=a.rig,key=(a.activity==='climb'?'climb':walking?'walk':'idle')+':'+Math.round(a.h);r.cycles ||= {};
    if(r.cycles[key]){const c=r.cycles[key];if(c.resume&&!document.hidden){const warm=c.resume;c.resume=null;queueWarm(warm);}return c;}
    const frames=[],count=48,w=a.w,h=a.h,pad=12,k=Math.min(1,160/Math.max(w+pad*2,h+pad*2));
    const cycle={frames,count,w,h,pad};r.cycles[key]=cycle;
    const frequency=r.kind==='butterfly'?9:r.kind==='bird'?6:r.kind==='fish'?4.2:r.kind==='plant'?1.25:TAU/5.3;
    const sample={...a,root:null,contacts:null,phase:0,secondary:0,reaction:-10,activity:a.activity==='climb'?'climb':walking?'walk':'look',walkAmount:walking?1:0};
    const make=n=>{
      const u=n/count;sample.time=u*TAU/frequency;sample.cyclePhase=u*TAU;sample.cycleFrequency=walking?4.8:frequency;
      if(!walking&&n===0&&r.eyes.length)sample.time=.08;
      sample.gait=u*TAU;sample.bodyBob=walking?Math.sin(u*TAU*2)*1.2:0;poseRig(sample);
      const c=document.createElement('canvas');c.width=Math.ceil((w+pad*2)*k);c.height=Math.ceil((h+pad*2)*k);
      const ctx=c.getContext('2d');ctx.scale(c.width/(w+pad*2),c.height/(h+pad*2));ctx.translate(w/2+pad,h+pad);paintMesh2D(ctx,r,w,h);
      ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='source-atop';ctx.globalAlpha=.035;
      ctx.fillStyle=state?.page==='ocean'?'#8bbfcf':state?.page==='savanna'?'#ebc697':state?.page==='night'?'#9998be':'#f4f0de';ctx.fillRect(0,0,c.width,c.height);
      frames[n]=c;
    };
    // An immediate first pose avoids a blank sticker while the remaining poses warm.
    let next=0;
    const warm=()=>{if(next>=count||r.cycles?.[key]!==cycle)return;if(document.hidden||reducedMotion.matches){cycle.resume=warm;return;}make(next++);if(next<count)queueWarm(warm);};queueWarm(warm);
    return cycle;
  }
  function paintFallback(ctx,a,w,h) {
    const r=a.rig,quiet=reducedMotion.matches||motionPaused;
    if(quiet){ctx.drawImage(r.texture,-w/2,-h,w,h);return;}
    const walking=a.walkAmount>.08&&['quadruped','bird'].includes(r.kind),cycle=fallbackCycle(a,walking),{frames,count,pad}=cycle;
    const frequency=r.kind==='butterfly'?9:r.kind==='bird'?6:r.kind==='fish'?4.2:r.kind==='plant'?1.25:TAU/5.3;
    
    const position=((walking?(a.gait||0):a.time*frequency)/TAU%1+1)%1*count,lo=Math.floor(position),hi=(lo+1)%count,f=position-lo;
    const image=frames[(Math.round(position))%count]||frames[lo]||frames[0];
    if(image)ctx.drawImage(image,-w/2-pad,-h-pad,w+pad*2,h+pad*2);
    else ctx.drawImage(r.texture,-w/2,-h,w,h);
  }
  function dimensions(id, image) {
    let h = id === 'eg' ? 215 : presetFor(id) === 'sway' ? 165 : 142;
    let w = h * ((image.naturalWidth || image.width || 600) / (image.naturalHeight || image.height || 600));
    if (w > 230) { h *= 230 / w; w = 230; }
    return { w, h };
  }
  async function prepareActors() {
    prepareFeatures();
    const version = ++pageVersion; for(const a of actors.values())a.rig.cycles={}; actors.clear(); meshRenderer?.clear?.();
    await Promise.all(placements().map(async p => {
      try {
        const image = await imageFor(p.id);
        if (version !== pageVersion || !active) return;
        const seed = [...p.id].reduce((s, c) => s + c.charCodeAt(0), 0);
        const a=makeActor(p.id,image,seed%19);a.facing=p.dir;actors.set(p.id,a);
        requestPaint();
      } catch { if (version === pageVersion) setHint('Et motiv kunne ikke hentes. Åbn siden igen, når du er online.'); }
    }));
  }
  function setHint(text) { q('bookHint').textContent = text; }
  function updateSelection() {
    const valid = selected && earned(selected) && unlocked(scene());
    q('bookSelection').hidden = !valid;
    if (valid) {
      q('bookSelectedName').textContent = lessonFor(selected).title;
      q('bookOriginal').hidden = !state.custom[selected] || !lessonFor(selected)?.dir;
      q('bookReturn').hidden = !placements().some(p => p.id === selected);
    }
    for (const b of q('bookDrawer').querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.lesson === selected ? 'true' : 'false');
  }
  function renderDrawer() {
    const drawer = q('bookDrawer'), previousScroll = drawer.scrollLeft; drawer.replaceChildren();
    const list = [...Object.values(state.own||{}),...LESSONS].sort((a, b) => Number(earned(b.id)) - Number(earned(a.id)));
    const count = list.filter(l => earned(l.id)).length;
    q('bookEarnedCount').textContent = `${count} motiver i din samling`;
    if(!count){const invite=document.createElement('button');invite.className='drawer-invitation';invite.textContent='Vælg en tegning';invite.onclick=()=>show('explore');drawer.append(invite);}
    for (const lesson of list.filter((l,i)=>earned(l.id)||i<4)) {
      const has = earned(lesson.id), placed = placements().some(p => p.id === lesson.id);
      const b = document.createElement('button'); b.className = 'drawer-sticker' + (!has ? ' unearned' : '') + (placed ? ' placed' : '');
      b.dataset.lesson = lesson.id;
      b.setAttribute('aria-label', has ? `${lesson.title}${placed ? ', på siden' : ', sæt på siden'}` : `${lesson.title}. Tegn den for at få klistermærket`);
      const img = document.createElement('img'); img.src = lesson.dir ? lesson.dir+'sticker.png' : 'icon.svg'; img.alt = ''; img.loading = 'lazy'; img.width = img.height = 86; img.draggable = false;
      if (has && state.custom[lesson.id]) imageFor(lesson.id).then(image => { if (img.isConnected) img.src = image.src; }).catch(() => {});
      const title = document.createElement('strong'); title.textContent = lesson.title;
      const label = document.createElement('span'); label.textContent = !has ? 'Tegn og få motivet' : placed ? 'På siden ✓' : 'Sæt ind +';
      b.append(img, title, label);
      b.onclick = () => {
        if(!has){if(lessonUnlocked(lesson))openLessonPreview(lesson);else show('shop');return;}
        if (!unlocked(scene())) { toast('Lås først denne side op i butikken.'); return; }
        selected = lesson.id;
        if (placed) { react(lesson.id); updateSelection(); requestPaint(); }
        else place(lesson.id);
      };
      drawer.appendChild(b);
    }
    drawer.scrollLeft = previousScroll; updateSelection();
  }
  function renderScenes() {
    const container = q('bookScenes'); container.replaceChildren();
    for (const s of SCENES) {
      const b = document.createElement('button'); b.className = 'book-scene-chip'; b.setAttribute('aria-pressed', s.id === state.page ? 'true' : 'false');
      b.setAttribute('aria-label', s.title + (unlocked(s) ? '' : `, låst, ${s.price} stjerner`));
      const img = document.createElement('img'); img.src = s.art; img.alt = ''; img.loading = 'lazy';
      const name = document.createElement('span'); name.textContent = s.title + (unlocked(s) ? '' : ` · ${s.price} ★`);
      b.append(img, name); b.onclick = () => goTo(s.id); container.appendChild(b);
    }
  }
  function updatePage() {
    openPages=new Set(SCENES.filter(unlocked).map(s=>s.id));
    const s = scene(), open = openPages.has(s.id), at = SCENES.indexOf(s);
    q('bookSceneTitle').textContent = s.title;
    q('bookPageNumber').textContent = `Side ${at + 1} af ${SCENES.length}`;
    q('bookBackdrop').src = s.art; q('bookBackdrop').alt = s.description;
    q('bookLocked').hidden = open; q('bookCanvas').style.pointerEvents = open ? '' : 'none';
    q('bookLockedText').textContent = `Denne side koster ${s.price} stjerner i butikken. Du beholder den for altid.`;
    q('bookEmpty').hidden = !open || placements().length > 0;
    const collectionReady=LESSONS.some(l=>earned(l.id))||Object.keys(state.own||{}).length>0;
    q('bookEmpty').querySelector('strong').textContent = collectionReady ? 'Hvem skal bo her?' : 'Her begynder din historie';
    q('bookEmpty').querySelector('span:last-child').textContent = collectionReady ? 'Vælg et klistermærke i din samling nedenfor.' : 'Tegn et motiv. Sæt det ind. Se det leve!';
    q('bookCount').textContent = placements().length + ' / ' + LIMIT;
    q('bookPrev').disabled = at === 0; q('bookNext').disabled = at === SCENES.length - 1;
    renderScenes(); renderDrawer(); renderDots();
  }
  function open() {
    active = true; last = 0;
    updatePage(); prepareActors(); resize(); resume();
    if (pendingLesson) {
      const id = pendingLesson; pendingLesson = null;
      if (!unlocked(scene())) goTo('meadow');
      // prepareActors yields while decoding. place updates the model synchronously.
      place(id, true);
    }
  }
  function fromLesson(id) {
    if (!earned(id)) return;
    pendingLesson = id;
    if (!unlocked(scene()) || (placements().length >= LIMIT && !placements().some(p => p.id === id))) {
      const available = SCENES.find(s => unlocked(s) && ((state.pages[s.id] || []).some(p => p.id === id) || (state.pages[s.id] || []).length < LIMIT));
      state.page = available?.id || 'meadow'; dirty = true;
    }
    show('stickerbook');
  }
  function goTo(id) {
    if (!SCENES.some(s => s.id === id) || id === state.page) return;
    cancelPointer(); save();
    const forward = SCENES.findIndex(s => s.id === id) > SCENES.findIndex(s => s.id === state.page);
    // Capture the outgoing painted page so the fold carries its stickers with it.
    const page = q('bookPage'); page.querySelector('.book-flip')?.remove(); clearTimeout(flipTimer);
    if (active && !reducedMotion.matches) {
      const fold = document.createElement('div'); fold.className = 'book-flip' + (forward ? '' : ' reverse');
      const bg = q('bookBackdrop').cloneNode(); bg.removeAttribute('id'); bg.alt = ''; fold.appendChild(bg);
      const c = document.createElement('canvas'); c.width = q('bookCanvas').width; c.height = q('bookCanvas').height;
      c.getContext('2d').drawImage(q('bookCanvas'), 0, 0); fold.appendChild(c); fold.setAttribute('aria-hidden', 'true'); page.appendChild(fold);
      flipTimer = setTimeout(() => fold.remove(), 650);
    }
    state.page = id; dirty = true; save(); selected = null; particles.length = 0;
    setHint(unlocked(scene()) ? 'Træk for at flytte · Tryk for at lege · Hold nede for at lægge tilbage' : 'Lås siden op i butikken, eller vælg en anden side.');
    if (active) { updatePage(); prepareActors(); requestPaint(); }
  }
  function place(id, celebration = false) {
    if (!earned(id) || !lessonFor(id)) return false;
    if (!unlocked(scene())) { toast('Lås først siden op i butikken.'); return false; }
    const existing = placements().find(p => p.id === id);
    selected = id;
    if (existing) { react(id, celebration); updateSelection(); if (celebration) burst(existing.x, existing.y - .12, true); return false; }
    if (placements().length >= LIMIT) { toast('Siden har 12 klistermærker. Læg ét tilbage, eller vælg en anden side.'); updateSelection(); return false; }
    const preset = presetFor(id);
    const slots=[.15,.38,.62,.85].flatMap(x=>[.18,.55,.88].map(u=>{
      const [lo,hi]=habitat(scene(),preset,x);return {x,y:lo+(hi-lo)*u};
    })).filter(slot=>!(FEATURES[state.page]||[]).some(f=>f.rx&&Math.hypot((slot.x-f.x)/(f.rx+.06),(slot.y-f.y)/(f.ry+.035))<1));
    const separation=slot=>Math.min(...placements().map(p=>Math.hypot(slot.x-p.x,(slot.y-p.y)*H/W)),2);
    const spot=slots.reduce((best,slot)=>separation(slot)>separation(best)?slot:best,slots[0]||{x:.5,y:.93});
    const p = { id, uid:uid(), ...spot, dir: 1 };
    placements().push(p); dirty = true;
    if (!save()) { placements().pop(); updateSelection(); return false; }
    updatePage();
    const version = pageVersion, pageId = state.page;
    imageFor(id).then(image => {
      if (!active || state.page !== pageId || version !== pageVersion || !placements().some(item => item.id === id)) return;
      actors.set(id, makeActor(id,image,Math.random()*7,elapsed,preset));
      burst(p.x, p.y - .12, celebration); happySound(); requestPaint();
    }).catch(() => { if(active && state.page===pageId && version===pageVersion) setHint('Dit klistermærke er gemt. Åbn siden igen for at hente billedet.'); });
    setHint(`${lessonFor(id).title} er flyttet ind! Tryk på motivet og se, hvad der sker.`);
    return true;
  }
  function putBack(id) {
    const at = placements().findIndex(p => p.id === id); if (at < 0) return;
    const [p] = placements().splice(at, 1); dirty = true;
    if (!save()) { placements().splice(at, 0, p); return; }
    actors.delete(id); selected = id; updatePage(); requestPaint();
    setHint(`${lessonFor(id).title} ligger i skuffen igen. Din tegning er stadig gemt.`);
  }
  function react(id, celebration = false) {
    const a = actors.get(id), p = placements().find(p => p.id === id); if (!p) return;
    selected = id;
    if (a) { a.reaction = elapsed; a.reactions = (a.reactions || 0) + 1; a.spin = false; }
    burst(p.x, p.y - .13, celebration); happySound(); updateSelection(); requestPaint();
  }
  function burst(x, y, confetti = false) {
    if (reducedMotion.matches) return;
    const n = confetti ? 28 : 10;
    while (particles.length > 70 - n) particles.shift();
    for (let i = 0; i < n; i++) particles.push({ x: x * W, y: y * H, vx: (Math.random() - .5) * 160, vy: -35 - Math.random() * 130,
      life: 0, end: .7 + Math.random() * .5, size: 4 + Math.random() * 4, heart: !confetti && i % 3 === 0, color: ['#e99aba', '#ffdf88', '#b8a1ee', '#96d8b7'][i % 4] });
  }
  function happySound() {
    const now = performance.now();
    if (!soundEnabled || document.hidden || now < mutedUntil) return;
    mutedUntil = now + 220;
    try {
      const Context = window.AudioContext || window.webkitAudioContext; if (!Context) return;
      soundContext ||= new Context(); const ctx = soundContext;
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      for (let i = 0; i < 3; i++) {
        const start = ctx.currentTime + i * .055, osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime([523.25, 659.25, 783.99][i], start);
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.035, start + .008); gain.gain.exponentialRampToValueAtTime(.001, start + .12);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(start); osc.stop(start + .13);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      }
    } catch { /* Silent play is still a complete book experience. */ }
  }
  function setSound(enabled) {
    soundEnabled = !!enabled; writeLocal('ts_sticker_sound', soundEnabled);
    q('bookSound').setAttribute('aria-pressed', String(soundEnabled));
    UI.controlIcon(q('bookSound'), soundEnabled ? 'sound' : 'mute');
    q('bookSound').setAttribute('aria-label', soundEnabled ? 'Slå klistermærkelyd fra' : 'Slå klistermærkelyd til');
    q('settingStickerSound').checked = soundEnabled;
  }
  function requestPaint() { if (active && !document.hidden && !photo && !frame) frame = requestAnimationFrame(tick); }
  const landscapeBook = () => window.innerWidth > window.innerHeight && (window.innerWidth >= 900 || (window.innerWidth >= 700 && window.innerHeight <= 550));
  function resize(event) {
    if (!active) return;
    // Selection reveals its toolbar and resizes the page during pointerdown.
    // Keep that gesture and its original coordinate space until release; only
    // an actual viewport resize (including rotation) interrupts the gesture.
    if (pointer && event?.type === 'resize') { cancelPointer(); save(); }
    const space=q('bookPage').parentElement.getBoundingClientRect();
    q('bookPage').style.width=landscapeBook()?Math.max(1,Math.min(space.width,space.height*1.6))+'px':'';
    const r = q('bookCanvas').getBoundingClientRect();
    const width = clamp(Math.round(r.width * Math.min(window.devicePixelRatio || 1, 2)), 480, 1440);
    if (q('bookCanvas').width !== width) { q('bookCanvas').width = width; q('bookCanvas').height = Math.round(width * H / W); }
    requestPaint();
  }
  function tick(now) {
    frame = 0; if (!active || document.hidden || photo) return;
    const started=performance.now();let posed=started;
    const dt = last ? clamp((now - last) / 1000, 0, .05) : 0; last = now;
    if (!reducedMotion.matches && !motionPaused) elapsed += dt;
    const canvas = q('bookCanvas'), ctx = canvas.getContext('2d');
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0); ctx.clearRect(0, 0, W, H);
    // Unlock state changes in updatePage/storage handlers, never poll the wallet
    // from the 60 fps renderer (a mature wallet can contain hundreds of claims).
    const pageOpen = q('bookLocked').hidden;
    if (pageOpen) {
      // Paint in depth order, without changing the persisted drawer order.
      roamBook(reducedMotion.matches||motionPaused?0:dt);
      settleNeighbours(reducedMotion.matches||motionPaused?0:dt);
      const sorted = [...placements()].sort((a, b) => drawDepth(a)-drawDepth(b));
      if(meshRenderer===null)meshRenderer=createMeshRenderer()||false;
      drawingMesh = !!meshRenderer && meshRenderer.begin(canvas.width,canvas.height);renderMode=drawingMesh?'webgl':'canvas2d';
      for (const p of sorted) {
        const a = actors.get(p.id); if (!a) continue;
        animate(p, a, reducedMotion.matches || motionPaused ? 0 : dt);
      }
      if(drawingMesh)for(const p of sorted){const a=actors.get(p.id);if(a)paintShadow(ctx,p,a,actorPose(p,a));}
      posed=performance.now();
      paintSceneActors(ctx,sorted);
      paintHold(ctx);
      drawingMesh=false;
      if(selected){const a=actors.get(selected),h=a?.hit;if(h){ctx.save();ctx.strokeStyle='#ffffffb8';ctx.lineWidth=1.5;ctx.setLineDash([3,6]);ctx.beginPath();ctx.ellipse(h.x,h.y+4,h.w*.4,5,0,0,TAU);ctx.stroke();ctx.restore();}}
      paintParticles(ctx, dt);
    }
    timing.push({total:performance.now()-started,pose:posed-started});if(timing.length>180)timing.shift();
    if (dirty && elapsed - savedAt > 5 && !pointer) save();
    if (!reducedMotion.matches && !motionPaused && pageOpen && (actors.size || particles.length || Object.values(state.pages).some(list=>list.some(p=>mobilePreset(presetFor(p.id)))))) requestPaint();
  }
  function prepareFeatures() {
    const page=state.page;
    for(const key of featureImages.keys())if(!key.startsWith(page+':'))featureImages.delete(key);
    for(const f of FEATURES[page]||[]){
      if(!f.rect)continue;const key=page+':'+f.key;
      if(featureImages.has(key))continue;
      const slot={image:null};featureImages.set(key,slot);
      loadImage(`assets/vector/scene-${page}-${f.key}.svg`).then(image=>{slot.image=image;if(active&&state.page===page)requestPaint();}).catch(()=>{});
    }
  }
  function paintSceneActors(ctx,sorted) {
    const layers=[...sorted.map(p=>({y:drawDepth(p),p})),...(FEATURES[state.page]||[]).filter(f=>f.rect).map(f=>({y:f.y,f}))].sort((a,b)=>a.y-b.y);
    let pending=false;
    for(const layer of layers){
      if(layer.p){const a=actors.get(layer.p.id);if(a){paintActor(ctx,layer.p,a);pending=true;}continue;}
      const image=featureImages.get(state.page+':'+layer.f.key)?.image;if(!image)continue;
      // Flush only at real foreground layers. Both GPU and Canvas obey exactly
      // the same depth order; an animal in front never disappears behind a fence.
      if(drawingMesh&&pending){meshRenderer.end(ctx);meshRenderer.begin(q('bookCanvas').width,q('bookCanvas').height);pending=false;}
      ctx.drawImage(image,...layer.f.rect);
    }
    if(drawingMesh&&pending)meshRenderer.end(ctx);
  }
  function paintHold(ctx){
    if(!pointer?.id||pointer.moved)return;
    const h=actors.get(pointer.id)?.hit;if(!h)return;
    const progress=clamp((performance.now()-pointer.stamp)/1100,0,1);
    ctx.save();ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.beginPath();ctx.arc(h.x,h.y-h.h/2,Math.max(h.w,h.h)*.55,-Math.PI/2,-Math.PI/2+TAU*progress);ctx.stroke();ctx.restore();
  }

  function drawDepth(p){const n=navigation(p);if(airPreset(presetFor(p.id))||presetFor(p.id)==='swim'&&!scene().water)return rear(scene(),p.x)+(.97-rear(scene(),p.x))*(n.depth??.5);return n.climb?(FEATURES[state.page]||[]).find(f=>f.key===n.climb)?.y+.001||p.y:p.y;}
  function animate(p, a, dt) {
    const t=elapsed+a.phase,dragging=pointer?.id===p.id,quiet=reducedMotion.matches||motionPaused;
    a.time=quiet?0:t;
    if(quiet){a.walkAmount=0;a.bodyBob=0;a.lift=0;a.secondary=0;a.drift=0;a.rig.vertices.set(a.rig.rest);return;}
    const n=navigation(p),r=a.rig,old=a.velocity;
    a.activity=n.climb?'climb':n.activity||'look';
    a.velocity=n.vx;a.velocityY=n.vy;
    const speed=Math.hypot(n.vx,n.vy),depth=depthAt(scene(),p,a.preset);
    if(!dragging&&dt){
      if(Math.abs(n.vx)>.006){const direction=Math.sign(n.vx);if(direction!==p.dir){a.turnWait=(a.turnWait||0)+dt;if(a.turnWait>.18){a.previousDir=p.dir;p.dir=direction;a.facing=direction;a.turnAt=elapsed;a.contacts=[];a.turnWait=0;}}else a.turnWait=0;}
      a.drift*=Math.exp(-dt*6);
      a.gait+=speed*W/(Math.max(45,a.w)*depth*.15)*TAU*dt;
      a.walkAmount=clamp(speed/.028,0,1.35);
      a.bodyBob=groundPreset(a.preset)&&!r.seated?Math.sin(a.gait*2)*.8*a.walkAmount:0;
      // Stable, bounded secondary springs after slow frames and pointer release.
      const steps=Math.max(1,Math.ceil(dt/.012)),h=dt/steps;
      for(let i=0;i<steps;i++){
        a.secondaryVelocity+=(-55*a.secondary-9*a.secondaryVelocity-clamp((a.velocity-old)/Math.max(.001,dt),-.2,.2)*22)*h;
        a.secondary+=a.secondaryVelocity*h;
        a.liftVelocity+=(-110*a.lift-12*a.liftVelocity)*h;a.lift+=a.liftVelocity*h;
      }
    }else if(dragging){a.walkAmount=0;a.bodyBob=0;}
    a.root=p;
    poseRig(a);
  }
  const contactShadow=(()=>{
    let canvas;return ()=>{if(canvas)return canvas;canvas=document.createElement('canvas');canvas.width=128;canvas.height=32;
      const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,0,64,64,64);
      gradient.addColorStop(0,'#27333355');gradient.addColorStop(.45,'#27333324');gradient.addColorStop(1,'#27333300');
      ctx.scale(1,.25);ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);return canvas;};
  })();
  function actorPose(p,a) {
    const t=a.time||0,moving=!reducedMotion.matches&&!motionPaused,dragging=pointer?.id===p.id;
    const n=navigation(p),feature=n.climb?(FEATURES[state?.page]||[]).find(f=>f.key===n.climb):null;
    const depth=depthAt(scene(),feature?{...p,y:feature.y}:p,a.preset),r=a.rig;
    let x=p.x*W,y=p.y*H,sy=1,sx=1,angle=0,height=0;
    if(moving){
      if(!dragging){
        if((a.preset==='hop'||a.preset==='climb'&&!n.climb)&&a.walkAmount>.05){const u=(a.gait/TAU)%1,hop=u<.28?0:Math.sin((u-.28)/.72*Math.PI);height+=hop*22;sy=1+hop*.035-(u<.28?Math.sin(u/.28*Math.PI)*.035:0);}
        if(['fly','butterfly'].includes(a.preset))height+=8+Math.sin(t*1.8)*7;
        if(a.preset==='swim'){height+=Math.sin(t*1.9)*5;angle=Math.sin(t*1.9)*.025;}
        height+=(a.bodyBob||0)+a.lift;angle+=a.secondary*.065;
        const reaction=elapsed-a.reaction;
        if(reaction>=0&&reaction<1.05){const u=reaction/1.05,jump=Math.sin(u*Math.PI);height+=jump*32;angle+=Math.sin(u*TAU*2)*.045*(1-u);sy+=jump*.035;}
        const pop=elapsed-a.born;
        if(pop>=0&&pop<.5){const grow=1-Math.pow(2,-10*pop)*Math.cos(pop*12);sx*=Math.max(.1,grow);sy*=Math.max(.1,grow);}
      }else {height=0;angle=0;}
      if(airPreset(a.preset)&&!dragging)angle+=Math.sin(n.heading||0)*.12;
      if(feature)angle+=n.climbDir>0?-.16:.12;
    }
    if(!r.frontal&&['quadruped','fish'].includes(r.kind)){
      const turn=quietFacing(a,p),mirror=r.left?-1:1;sx*=turn*mirror;
    }
    if(!dragging&&Number.isFinite(a.released))height*=smooth((elapsed-a.released)/.7);
    if(dragging&&!pointer.moved)y=pointer.drawnY;
    y-=height*depth;
    return {x,y,sx,sy,angle,depth,height,dragging};
  }
  function quietFacing(a,p){
    // A single-view paper drawing keeps its full width during a curved turn.
    return p.dir<0?-1:1;
  }
  function paintShadow(ctx,p,a,pose) {
    const {x,depth,height,dragging,sx}=pose,air=airPreset(a.preset)||a.preset==='swim'&&!scene().water,water=a.preset==='swim'&&scene().water;
    const lift=Math.max(0,height),spread=1+Math.min(60,lift)*.006;
    const n=navigation(p),climb=(FEATURES[state.page]||[]).find(f=>f.key===n.climb),floor=air?drawDepth(p)*H:water?.88*H:climb?climb.y*H:p.y*H,altitude=(air||water||climb)?Math.max(0,floor-p.y*H):lift;
    const feet=a.rig.bones.filter(b=>b.name.startsWith('shin'));
    ctx.save();ctx.globalAlpha=(air?.12:water?.10:feet.length?.32:.72)*Math.max(.16,1-(altitude+lift)/250)*(dragging?.55:1);
    const w=a.w*depth*.80*spread,h=14*depth*spread;
    ctx.drawImage(contactShadow(),x-w/2,floor-h/2+2,w,h);
    if(!air&&!water&&!climb&&feet.length){for(const b of feet){
      const u=b.x+(b.ex-b.x)*(b.c??1)-(b.ey-b.y)*(b.s||0)+b.dx;
      const footX=x+(u-.5)*a.w*depth*sx,fw=Math.max(9,a.w*.115)*depth*spread;
      ctx.globalAlpha=.32*Math.max(.15,1-lift/38)*(dragging?.4:1);ctx.drawImage(contactShadow(),footX-fw/2,floor-2,fw,5*depth*spread);
    }}
    ctx.restore();
  }
  function paintActor(ctx, p, a) {
    // preview() and the book use the exact same cutout rig and deformation path.
    a.rig ||= buildRig(a.image,rigKind(p.id,a.preset),p.id);
    const pose=actorPose(p,a),{x,y,sx,sy,angle,depth}=pose,r=a.rig;
    if(!drawingMesh)paintShadow(ctx,p,a,pose);
    a.hit={x,y,w:Math.max(48,a.w*depth*Math.abs(sx)),h:a.h*depth*sy};
    const turning=!r.frontal&&['quadruped','fish'].includes(r.kind)&&Number.isFinite(a.turnAt)&&elapsed-a.turnAt<.20;
    const blend=turning?smooth((elapsed-a.turnAt)/.20):1;
    const variants=turning?[{sx:-sx,alpha:1-blend},{sx,alpha:blend}]:[{sx,alpha:1}];
    for(const variant of variants){
      if(variant.alpha<.001)continue;
      if(drawingMesh)meshRenderer.draw(r,x,y,a.w*depth,a.h*depth,variant.sx,sy,angle,depth,variant.alpha);
      else {ctx.save();ctx.globalAlpha=variant.alpha*clamp(.96+(depth-.7)*.14,.96,1);ctx.translate(x,y);ctx.rotate(angle);ctx.scale(variant.sx*depth,sy*depth);paintFallback(ctx,a,a.w,a.h);paintWheels(ctx,a);ctx.restore();}
    }
    if(drawingMesh&&r.wheels){meshRenderer.end(ctx);meshRenderer.begin(q('bookCanvas').width,q('bookCanvas').height);
      ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(sx*depth,sy*depth);paintWheels(ctx,a);ctx.restore();}

  }

  function paintWheels(ctx,a){
    for(const wheel of a.rig.wheels||[]){
      ctx.save();ctx.translate((wheel.x-.5)*a.w,(wheel.y-1)*a.h);ctx.scale(wheel.rx*a.w,wheel.ry*a.h);
      ctx.beginPath();ctx.arc(0,0,1,0,TAU);ctx.clip();
      if(!reducedMotion.matches&&!motionPaused)ctx.rotate(-(a.gait||0)*a.w*.15/(wheel.ry*a.h)*(a.root?.dir||1));
      ctx.drawImage(wheel.image,-1,-1,2,2);ctx.restore();
    }
  }
  function paintParticles(ctx, dt) {
    for (let i = particles.length-1; i >= 0; i--) {
      const p = particles[i]; p.life += dt;
      if (p.life > p.end) { particles.splice(i, 1); continue; }
      p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 100*dt;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1-p.life/p.end); ctx.translate(p.x, p.y); ctx.rotate(p.life*2); ctx.scale(p.size, p.size); ctx.fillStyle = p.color;
      ctx.beginPath();
      if (p.heart) { ctx.moveTo(0, .8); ctx.bezierCurveTo(-2,-.4,-.7,-1.8,0,-.7); ctx.bezierCurveTo(.7,-1.8,2,-.4,0,.8); }
      else { ctx.moveTo(0,-1); ctx.lineTo(.25,-.25); ctx.lineTo(1,0); ctx.lineTo(.25,.25); ctx.lineTo(0,1); ctx.lineTo(-.25,.25); ctx.lineTo(-1,0); ctx.lineTo(-.25,-.25); }
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }
  function point(e) {
    const r = pointer?.rect || q('bookCanvas').getBoundingClientRect();
    return { x: clamp((e.clientX-r.left)/r.width, 0, 1), y: clamp((e.clientY-r.top)/r.height, 0, 1) };
  }
  function hitTest(pt) {
    const rect = q('bookCanvas').getBoundingClientRect();
    const touchWidth = 48 * W / Math.max(1, rect.width), touchHeight = 48 * H / Math.max(1, rect.height);
    return [...placements()].sort((a,b) => drawDepth(b)-drawDepth(a)).find(p => {
      const h = actors.get(p.id)?.hit; if (!h) return false;
      return Math.abs(pt.x*W-h.x) <= Math.max(h.w + 24, touchWidth)/2 &&
        Math.abs(pt.y*H-(h.y-h.h/2)) <= Math.max(h.h + 24, touchHeight)/2;
    });
  }
  function cancelPointer() {
    clearTimeout(holdTimer);
    const gesture = pointer; pointer = null;
    if (gesture) {
      if (gesture.moved) dirty = true;
      try { q('bookCanvas').releasePointerCapture(gesture.pid); } catch {}
    }
    q('bookCanvas').classList.remove('dragging'); q('bookBackdrop').style.transform = '';
  }
  function pointerDown(e) {
    if (pointer || !unlocked(scene()) || (e.button !== undefined && e.button !== 0)) return;
    const rect=q('bookCanvas').getBoundingClientRect(),pt=point(e),p=hitTest(pt);if(!p){selected=null;updateSelection();pointer={pid:e.pointerId,rect,swipe:true,clientX:e.clientX,clientY:e.clientY};q('bookCanvas').setPointerCapture(e.pointerId);requestPaint();return;}
    e.preventDefault(); selected = p.id; updateSelection();
    const drawn = actors.get(p.id)?.hit;
    pointer = { pid: e.pointerId, rect, id: p.id, start: pt, clientX:e.clientX, clientY:e.clientY, origin: { x: p.x, y: p.y, roam:JSON.parse(JSON.stringify(navigation(p))) },stamp:performance.now(), offset: { x: pt.x-p.x, y: pt.y-p.y }, moved: false };
    // A sticker freezes under the finger, rather than walking out of the gesture.
    if (drawn) { pointer.offset.x=pt.x-drawn.x/W;pointer.offset.y=pt.y-drawn.y/H;pointer.drawnY=drawn.y; }
    q('bookCanvas').setPointerCapture(e.pointerId);
    holdTimer = setTimeout(() => { if (pointer && !pointer.moved) { const id = pointer.id; cancelPointer(); putBack(id); } }, 1100);
    happySound(); requestPaint();
  }
  function pointerMove(e) {
    if (!pointer || pointer.pid !== e.pointerId || pointer.swipe) return;
    const pt = point(e), p = placements().find(p => p.id === pointer.id); if (!p) return;
    if (Math.hypot(e.clientX-pointer.clientX,e.clientY-pointer.clientY)>9) { pointer.moved = true; clearTimeout(holdTimer); }
    if (!pointer.moved) return;
    const actor=actors.get(p.id),stamp=performance.now(),delta=Math.max(.008,(stamp-(pointer.stamp||stamp-16))/1000);
    if(actor){actor.drift=clamp((pt.x-pointer.offset.x-p.x)/delta,-.22,.22);actor.secondary=clamp(actor.drift*-.7,-.25,.25);actor.velocity=0;}
    pointer.stamp=stamp;
    const preset = presetFor(p.id);
    p.x = clamp(pt.x-pointer.offset.x, 0, 1);
    p.y = clamp(pt.y-pointer.offset.y, 0, 1);
    const n=navigation(p);n.vx=n.vy=0;n.portal=0;n.arriving=0;delete n.climb;delete n.tx;n.rest=0;
    q('bookCanvas').classList.add('dragging');
    if (!reducedMotion.matches) q('bookBackdrop').style.transform = `scale(1.012) translate(${(pt.x-.5)*2}px, ${(pt.y-.5)*2}px)`;
    requestPaint();
  }
  function pointerUp(e) {
    if (!pointer || pointer.pid !== e.pointerId) return;
    const gesture=pointer;if(gesture.swipe){const dx=e.clientX-gesture.clientX,dy=e.clientY-gesture.clientY;cancelPointer();if(e.type!=='pointercancel'&&Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.4){const at=SCENES.indexOf(scene());goTo(SCENES[clamp(at+(dx<0?1:-1),0,SCENES.length-1)].id);}return;}const p=placements().find(p=>p.id===gesture.id);
    if (e.type === 'pointercancel' && p) {Object.assign(p, gesture.origin);const a=actors.get(p.id);if(a){a.drift=0;a.lift=a.liftVelocity=0;}}
    else if(gesture.moved){const a=actors.get(gesture.id);if(a){a.contacts=[];a.released=elapsed;a.lift=0;a.liftVelocity=-10;a.secondaryVelocity+=a.drift*2;}if(p){const n=navigation(p);n.vx=clamp((a?.drift||0)*.12,-.026,.026);n.vy=0;if(Math.abs(n.vx)>.003)n.heading=n.vx<0?Math.PI:0;delete n.tx;delete n.climb;n.portal=0;n.arriving=0;n.rest=0;n.crossIn=25;}}
    cancelPointer();
    if (gesture.moved) { dirty = true; save(); }
    else if (e.type !== 'pointercancel') react(gesture.id);
    requestPaint();
  }
  function suspend() {
    cancelPointer(); cancelAnimationFrame(frame); frame = 0; last = 0; save();
    if (soundContext?.state === 'running') soundContext.suspend().catch(() => {});
  }
  function resume() { if (active && !document.hidden) { last = 0; requestPaint(); } }
  function leave() {
    suspend(); active = false; ++pageVersion; for(const a of actors.values())a.rig.cycles={}; actors.clear(); meshRenderer?.clear?.(); particles.length = 0;
    clearTimeout(flipTimer); q('bookPage').querySelector('.book-flip')?.remove();
    if (photo) closePhoto();
  }
  function renderShop() {
    const grid = q('sceneShopGrid'); grid.replaceChildren();
    for (const s of SCENES.filter(s => s.price)) {
      const open = unlocked(s), card = document.createElement('article'); card.className = 'scene-shop-card';
      const img = document.createElement('img'); img.src = s.art; img.alt = s.description; img.loading = 'lazy'; img.width = 400; img.height = 250;
      const title = document.createElement('h3'); title.textContent = s.title;
      const p = document.createElement('p'); p.textContent = open?'Din verden':'En ny side i din bog';
      const price=document.createElement('button');price.className='world-price';price.innerHTML=UI.icon(open?'check':'lock');price.append(document.createTextNode(' '+s.price+' stjerner'));price.onclick=()=>open?(goTo(s.id),show('stickerbook')):askUnlock(sceneProduct(s));
      const b = document.createElement('button'); b.className = 'btn' + (open || balance() >= s.price ? ' primary' : '');
      UI.label(b, open ? 'next' : 'star', open ? 'Åbn siden' : balance() >= s.price ? `Lås op · ${s.price}` : 'Se verdenen');
      b.disabled = false;
      b.onclick = () => { if (open) { goTo(s.id); show('stickerbook'); } else askUnlock(sceneProduct(s)); };
      card.append(img, price, title, p, b); grid.appendChild(card);
    }
  }

  /* Local photo extraction: adaptive paper test -> edge-connected flood fill ->
     tiny speck cleanup -> soft boundary -> crop -> white die-cut rim and shadow. */
  function cutPhoto(image,sensitivity=20){const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height,k=Math.min(1,1600/Math.max(w,h)),c=document.createElement('canvas');c.width=Math.round(w*k);c.height=Math.round(h*k);const ctx=c.getContext('2d');ctx.drawImage(image,0,0,c.width,c.height);const r=DrawingScan.extract(ctx.getImageData(0,0,c.width,c.height).data,c.width,c.height,{strength:sensitivity/20});c.width=r.width;c.height=r.height;const out=c.getContext('2d'),p=out.createImageData(r.width,r.height);p.data.set(r.data);out.putImageData(p,0,0);return ScanFlow.rim(c);}

  async function openPhoto() {
    if (!selected || !earned(selected)) return;
    const version = ++photoVersion;
    photo = { id: selected, focus: document.activeElement, source: null, png: null, entries: [] };
    q('stickerPhotoTitle').textContent = 'Din ' + lessonFor(selected).title.toLowerCase() + ' får liv';
    q('stickerPhotoChoices').replaceChildren(); q('stickerPhotoPreview').hidden = true;
    q('stickerPhotoStatus').hidden = false; q('stickerPhotoStatus').textContent = 'Henter dine tegninger…';
    q('stickerPhotoUse').disabled = true; q('stickerPhotoRetry').disabled = true; q('stickerPhotoSensitivity').value = 20;
    q('stickerPhotoModal').hidden = false; modalInert(true); q('stickerPhotoClose').focus({ preventScroll: true });
    // Pause continuous scene work behind the modal, retaining the displayed page.
    cancelAnimationFrame(frame); frame = 0; last = 0;
    try {
      const entries = (await dbAll()).filter(e => e.lessonId === photo?.id && e.kind !== 'sticker').sort((a,b)=>b.created-a.created);
      if (!photo || version !== photoVersion) return;
      photo.entries = entries;
      q('stickerPhotoHelp').textContent = entries.length ? 'Vælg din tegning. Justér papiret, hvis du har brug for det.' : 'Tag et foto af din tegning på lyst papir. Fotoet gemmes også i din tegnebog.';
      renderPhotoChoices();
      if (entries.length) await previewPhoto(entries[0].img);
      else q('stickerPhotoStatus').textContent = 'Dit næste foto kan blive dit helt eget klistermærke.';
    } catch { if (photo && version === photoVersion) q('stickerPhotoStatus').textContent = 'Tegnebogen kunne ikke åbnes. Luk og prøv igen.'; }
  }
  function renderPhotoChoices() {
    const box=q('stickerPhotoChoices');box.replaceChildren();
    for(const e of photo.entries){const b=document.createElement('button'),img=document.createElement('img');b.setAttribute('aria-label','Brug tegning fra '+fmtDate(e.created));img.src=e.img;img.alt='';b.appendChild(img);b.onclick=()=>previewPhoto(e.img);box.appendChild(b);}
  }
  async function previewPhoto(src) {
    if (!photo) return;
    const session = photo, version = ++photoVersion; session.source = src; session.png = null;
    q('stickerPhotoStatus').hidden = false; q('stickerPhotoStatus').textContent = 'Klipper forsigtigt papiret væk…';
    q('stickerPhotoUse').disabled = true; q('stickerPhotoRetry').disabled = true;
    try {
      const image = await loadImage(src);
      await new Promise(resolve=>setTimeout(resolve,20));
      if (photo !== session || version !== photoVersion) return;
      session.png = cutPhoto(image, Number(q('stickerPhotoSensitivity').value));
      q('stickerPhotoPreview').src = session.png; q('stickerPhotoPreview').hidden = false;
      q('stickerPhotoStatus').hidden = true; q('stickerPhotoUse').disabled = false;
    } catch(error) {
      if (photo !== session || version !== photoVersion) return;
      q('stickerPhotoPreview').hidden = true; q('stickerPhotoStatus').textContent = error.message || 'Prøv et andet foto i jævnt lys.';
    } finally { if (photo === session && version === photoVersion) q('stickerPhotoRetry').disabled = false; }
  }
  function closePhoto() {
    const focus=photo?.focus; ++photoVersion; photo=null;q('stickerPhotoModal').hidden=true;modalInert(false);focus?.focus({preventScroll:true});resume();
  }
  async function usePhoto() {
    const session=photo;if(!session?.png)return;
    q('stickerPhotoUse').disabled=true;
    try {
      // Store large PNG data in IndexedDB; localStorage holds only the revision.
      const revision=Date.now();
      await assetStore('readwrite',s=>s.put({id:session.id+':'+revision,png:session.png,updated:revision}));
      const previous=state.custom[session.id];state.custom[session.id]=revision;dirty=true;
      if(!save()){if(previous)state.custom[session.id]=previous;else delete state.custom[session.id];q('stickerPhotoUse').disabled=false;return;}
      if(photo!==session)return;
      if(previous)await assetStore('readwrite',store=>store.delete(session.id+':'+previous)).catch(()=>{});
      closePhoto();renderDrawer();await prepareActors();react(session.id,true);setHint('Nu leger din helt egen tegning med!');
    } catch { if(photo===session){q('stickerPhotoStatus').hidden=false;q('stickerPhotoStatus').textContent='Klistermærket kunne ikke gemmes. Frigør plads og prøv igen.';q('stickerPhotoUse').disabled=false;} }
  }
  async function original() {
    if (!selected || !state.custom[selected]) return;
    const previous=state.custom[selected];delete state.custom[selected];dirty=true;
    if(!save()){state.custom[selected]=previous;return;}
    await assetStore('readwrite',store=>store.delete(selected+':'+previous)).catch(()=>{});
    renderDrawer();await prepareActors();requestPaint();setHint('Lektionsmotivet er tilbage. Dit foto er stadig i tegnebogen.');
  }
  function renderDots(){const box=q('bookDots');box.replaceChildren();for(const [i,page]of SCENES.entries()){const b=document.createElement('button');b.className='book-dot';b.setAttribute('aria-label',`Side ${i+1}: ${page.title}`);b.setAttribute('aria-pressed',String(page.id===state.page));b.onclick=()=>goTo(page.id);box.append(b);}}
  async function addOwn({entryId,png,lessonId,targetId,motion='idle',title='Min figur'}){
    const id=targetId&&lessonFor(targetId)?targetId:'scan_'+String(entryId),revision=Date.now(),old=state.custom[id],before=state.own?.[id];state.own||={};
    await assetStore('readwrite',s=>s.put({id:id+':'+revision,png,updated:revision}));
    if(!LESSONS.some(l=>l.id===id))state.own[id]={id,title,motion,lessonId,entryId,cat:'dyr'};state.custom[id]=revision;dirty=true;
    if(!save()){if(before)state.own[id]=before;else delete state.own[id];if(old)state.custom[id]=old;else delete state.custom[id];await assetStore('readwrite',s=>s.delete(id+':'+revision));throw Error('Ikke gemt endnu');}
    if(old)await assetStore('readwrite',s=>s.delete(id+':'+old)).catch(()=>{});return id;
  }
  function fromOwn(id){if(LESSONS.some(l=>l.id===id)){pendingLesson=id;show('stickerbook');return;}if(!state.own?.[id])return;const preset=presetFor(id),preferred=preset==='swim'?'ocean':['fly','butterfly'].includes(preset)?'jungle':state.own[id].lessonId?.includes('ulv')?'forest':'meadow';goTo(preferred);pendingLesson=id;show('stickerbook');}
  function preview(canvas,image,preset,time){
    const ctx=canvas.getContext('2d');ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);ctx.clearRect(0,0,W,H);
    const a=makeActor('preview',image,0,-10,preset),p={id:'preview',x:.5,y:.82,dir:1};
    a.h*=2.1;a.w*=2.1;a.time=reducedMotion.matches?0:time;a.gait=a.time*4;a.walkAmount=reducedMotion.matches?0:.7;poseRig(a);paintActor(ctx,p,a);
  }
  function diagnostics(){return {renderer:renderMode,page:state?.page,placements:state?JSON.parse(JSON.stringify(state.pages)):{},textureCap:384,canvasCap:1440,elapsed,timing:timing.slice(),
    actors:[...actors].map(([id,a])=>({id,kind:a.rig.kind,frontal:a.rig.frontal,seated:a.rig.seated,position:placements().find(p=>p.id===id),depth:actorPose(placements().find(p=>p.id===id),a).depth,bones:a.rig.bones.map(b=>b.name),triangles:a.rig.indices.length/3,texture:[a.rig.texture.width,a.rig.texture.height],activity:a.activity,velocity:a.velocity,gait:a.gait,lift:a.lift,secondary:a.secondary,hit:a.hit,vertices:Array.from(a.rig.vertices)}))};}
  function updateMotionControl() {
    q('bookMotion').setAttribute('aria-pressed',String(motionPaused));
    q('bookMotion').setAttribute('aria-label',motionPaused?'Sæt liv i gang':'Sæt liv på pause');
    UI.controlIcon(q('bookMotion'),motionPaused?'play':'pause');
  }
  function init() {
    motionPaused = readLocal('ts_book_paused') === true;
    q('bookDrawer').parentElement.insertBefore(q('bookSelection'),q('bookDrawer'));
    state=readState();updateMotionControl();q('bookMotion').onclick=()=>{motionPaused=!motionPaused;writeLocal('ts_book_paused',motionPaused);updateMotionControl();cancelAnimationFrame(frame);frame=0;last=0;requestPaint();};setSound(readLocal('ts_sticker_sound')!==false);
    q('bookPrev').onclick=()=>goTo(SCENES[Math.max(0,SCENES.indexOf(scene())-1)].id);
    q('bookNext').onclick=()=>goTo(SCENES[Math.min(SCENES.length-1,SCENES.indexOf(scene())+1)].id);
    q('bookUnlock').onclick=()=>{const s=scene();show('shop');document.querySelector('[data-shop-kind="worlds"]').click();if(balance()>=s.price)askUnlock(sceneProduct(s));else q('sceneShopGrid').scrollIntoView({block:'start',behavior:reducedMotion.matches?'auto':'smooth'});};
    q('bookSound').onclick=()=>setSound(!soundEnabled);q('settingStickerSound').onchange=e=>setSound(e.target.checked);
    q('bookOwn').onclick=async()=>{const targetId=selected,selectedLesson=lessonFor(targetId);if(!selectedLesson)return;try{const entries=(await dbAll()).filter(e=>e.lessonId===(selectedLesson.lessonId||selectedLesson.id)&&e.kind!=='sticker').sort((a,b)=>b.created-a.created);ScanFlow.open({targetId,lesson:LESSONS.find(l=>l.id===(selectedLesson.lessonId||selectedLesson.id)),src:entries[0]?.img,entryId:entries[0]?.id});}catch{ScanFlow.open({targetId,lesson:selectedLesson});}};q('bookOriginal').onclick=original;q('bookReturn').onclick=()=>putBack(selected);
    const c=q('bookCanvas');c.addEventListener('pointerdown',pointerDown);c.addEventListener('pointermove',pointerMove);
    c.addEventListener('pointerup',pointerUp);c.addEventListener('pointercancel',pointerUp);
    c.addEventListener('lostpointercapture',()=>{if(pointer){cancelPointer();dirty=true;save();requestPaint();}});
    c.addEventListener('contextmenu',e=>e.preventDefault());
    q('stickerPhotoClose').onclick=closePhoto;q('stickerPhotoUse').onclick=usePhoto;
    q('stickerPhotoRetry').onclick=()=>{if(!photo?.source)return;const slider=q('stickerPhotoSensitivity');slider.value=Number(slider.value)>=32?12:Number(slider.value)+6;previewPhoto(photo.source);};
    q('stickerPhotoSensitivity').onchange=()=>{if(photo?.source)previewPhoto(photo.source);};
    q('stickerPhotoNew').onchange=e=>{const file=e.target.files[0];e.target.value='';const lesson=lessonFor(photo?.id);closePhoto();if(file)ScanFlow.open({lesson,file});};
    window.addEventListener('resize',resize);new ResizeObserver(resize).observe(q('bookPage').parentElement);
    window.addEventListener('pageshow',resume);
    document.addEventListener('visibilitychange',()=>document.hidden?suspend():resume());
    const motionChange=()=>{particles.length=0;cancelAnimationFrame(frame);frame=0;last=0;requestPaint();};
    if(reducedMotion.addEventListener)reducedMotion.addEventListener('change',motionChange);else reducedMotion.addListener(motionChange);
    window.addEventListener('storage',e=>{
      if(e.key===KEY){cancelPointer();state=readState();dirty=false;if(active){updatePage();prepareActors();requestPaint();}}
      if(e.key==='ts_wallet_v1'&&active){updatePage();requestPaint();}
      if(e.key==='ts_progress'&&active)renderDrawer();
      if(e.key==='ts_sticker_sound')setSound(readLocal('ts_sticker_sound')!==false);
    });
  }
  return { init, open, leave, suspend, resume, fromLesson, goTo, renderShop, closePhoto,
    // Exposed model actions also support focused integration checks.
    place, putBack, cutPhoto, presetFor, addOwn, fromOwn, preview, diagnostics };
})();
