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
    { id:'savanna', title:'Savanne', ground:.81, price:15, description:'Gylden savanne med akacietræer og varmt aftenslys' },
    { id:'space', title:'Rummet', ground:.83, price:20, description:'Planeter, stjerner og et stille månelandskab' },
    { id:'snow', title:'Is og sne', ground:.82, price:20, description:'Isbjerge, snefnug og nordlys i blå og lilla farver' },
    { id: 'sky', title: 'Oppe i skyerne', ground: .84, price: 15, description: 'En lys himmel med en regnbue og bløde, hvide skyer' },
    { id: 'farm', title: 'Bondegård', ground: .80, price: 20, description: 'En hyggelig gård med rød lade og grønne græsgange' },
    { id: 'night', title: 'Natten', ground: .80, price: 25, description: 'En fredelig nat med gyldne stjerner og en lysende måne' },
  ].map(s => ({ ...s, art: `assets/vector/scene-${s.id}.svg` }));
  // Explicit presets take precedence over category defaults. Portraits stay still.
  const PRESETS = {
    e_fisk: 'swim', delfin: 'swim', s_haj: 'swim', e_hval: 'swim', skildpadde: 'swim',
    sommerfugl: 'butterfly', e_bi: 'fly', papegoeje: 'sway', e_fugl: 'idle', e_ugle: 'idle', ugle: 'idle', s_oern: 'fly', s_ugle_flyv: 'fly', s_drage: 'fly',
    e_kanin: 'hop', kanin: 'hop', egern: 'hop', s_panda_baby: 'idle',
    e_kat: 'walk', e_hund: 'walk', raev: 'walk', kat: 'walk', hvalp: 'walk', hest: 'portrait', panda: 'walk',
    elefant: 'walk', e_snegl: 'crawl', e_skildpadde: 'crawl', e_marienhone: 'crawl', s_trex: 'walk', s_ulv: 'walk', s_enhjoerning: 'walk',
    e_kylling: 'walk', e_mus: 'crawl', e_pingvin: 'walk', e_gris: 'walk', pindsvin: 'crawl', hjort: 'walk',
    e_frø:'hop', e_ræv:'walk', e_puma:'walk', e_ulv:'walk', puma:'walk', ulv:'walk', puma_svaer:'portrait', ulv_svaer:'portrait',
    loeve: 'portrait', s_tiger: 'portrait',
    e_tulipan: 'sway', rose: 'sway', solsikke: 'sway', fluesvamp: 'sway', eg: 'sway', e_kaktus: 'sway', blomsterbuket: 'sway',
    e_regnbue: 'idle', fyrtaarn: 'idle',
    e_aeble: 'idle', e_hus: 'idle', s_sportsvogn: 'roll',
  };
  const q = id => document.getElementById(id);
  const lessonFor = id => LESSONS.find(l=>l.id===id) || state?.own?.[id];
  const presetFor = id => state?.own?.[id]?.motion || PRESETS[id] || (lessonFor(id)?.cat === 'natur' ? 'sway' : 'idle');
  const groundPreset = p => ['walk', 'hop', 'crawl', 'roll', 'sway', 'portrait', 'idle'].includes(p);
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
    for(const [id,item] of Object.entries(objectMap(value.own))) if(/^scan_[a-z0-9:_-]+$/i.test(id)&&item&&typeof item.title==='string'&&['walk','swim','fly','idle','hop','crawl','sway','portrait','roll','butterfly'].includes(item.motion))next.own[id]={id,title:item.title.slice(0,100),motion:item.motion,lessonId:item.lessonId,entryId:item.entryId,cat:'dyr'};
    next.page = SCENES.some(s => s.id === value.page) ? value.page : 'meadow';
    for (const scene of SCENES) {
      const seen = new Set();
      next.pages[scene.id] = (Array.isArray(value.pages?.[scene.id]) ? value.pages[scene.id] : []).filter(p => {
        if (!p || !(LESSONS.some(l=>l.id===p.id)||next.own[p.id]) || seen.has(p.id)) return false;
        seen.add(p.id); return true;
      }).slice(0, LIMIT).map(p => ({ id: p.id, x: Number.isFinite(p.x) ? clamp(p.x, .13, .87) : .5,
        y: Number.isFinite(p.y) ? clamp(p.y, .22, .92) : scene.ground, dir: p.dir === -1 ? -1 : 1 }));
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
  function dimensions(id, image) {
    let h = id === 'eg' ? 215 : presetFor(id) === 'sway' ? 165 : 142;
    let w = h * ((image.naturalWidth || image.width || 600) / (image.naturalHeight || image.height || 600));
    if (w > 230) { h *= 230 / w; w = 230; }
    return { w, h };
  }
  async function prepareActors() {
    const version = ++pageVersion; actors.clear();
    await Promise.all(placements().map(async p => {
      try {
        const image = await imageFor(p.id);
        if (version !== pageVersion || !active) return;
        const seed = [...p.id].reduce((s, c) => s + c.charCodeAt(0), 0);
        actors.set(p.id, { image, ...dimensions(p.id, image), phase: seed % 19, born: -10, reaction: -10, preset: presetFor(p.id) });
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
    for (const lesson of list) {
      const has = earned(lesson.id), placed = placements().some(p => p.id === lesson.id);
      const b = document.createElement('button'); b.className = 'drawer-sticker' + (!has ? ' unearned' : '') + (placed ? ' placed' : '');
      b.dataset.lesson = lesson.id;
      b.setAttribute('aria-label', has ? `${lesson.title}${placed ? ', på siden' : ', sæt på siden'}` : `${lesson.title}. Tegn den for at få klistermærket`);
      const img = document.createElement('img'); img.src = lesson.dir ? lesson.dir+'sticker.png' : 'icon.svg'; img.alt = ''; img.loading = 'lazy'; img.width = img.height = 86; img.draggable = false;
      if (has && state.custom[lesson.id]) imageFor(lesson.id).then(image => { if (img.isConnected) img.src = image.src; }).catch(() => {});
      const title = document.createElement('strong'); title.textContent = lesson.title;
      const label = document.createElement('span'); label.textContent = !has ? 'Tegn den først' : placed ? 'På siden ✓' : 'Sæt ind +';
      b.append(img, title, label);
      b.onclick = () => {
        if(!has){if(lessonUnlocked(lesson))openLesson(lesson);else show('shop');return;}
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
    const s = scene(), open = unlocked(s), at = SCENES.indexOf(s);
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
    if (active) { updatePage(); prepareActors(); requestPaint(); }
  }
  function place(id, celebration = false) {
    if (!earned(id) || !lessonFor(id)) return false;
    if (!unlocked(scene())) { toast('Lås først siden op i butikken.'); return false; }
    const existing = placements().find(p => p.id === id);
    selected = id;
    if (existing) { react(id, celebration); updateSelection(); if (celebration) burst(existing.x, existing.y - .12, true); return false; }
    if (placements().length >= LIMIT) { toast('Siden har 12 klistermærker. Læg ét tilbage, eller vælg en anden side.'); updateSelection(); return false; }
    const preset = presetFor(id), ground = groundPreset(preset);
    // Stagger deeper rows so new animals do not hide faces on the same four
    // vertical tracks. Leave room for the full 142px motifs on a 625px page.
    const slots=[0,1,2].flatMap(row=>[.16,.38,.62,.84].map(x=>({x:clamp(x+(row===1?.04:row===2?-.03:0),.13,.87),y:ground?scene().ground-row*.18:.35+row*.20})));
    const separation=slot=>Math.min(...placements().map(p=>Math.hypot(slot.x-p.x,(slot.y-p.y)*1.3)),2);
    const spot=slots.reduce((best,slot)=>separation(slot)>separation(best)?slot:best);
    const p = { id, ...spot, dir: 1 };
    placements().push(p); dirty = true;
    if (!save()) { placements().pop(); updateSelection(); return false; }
    updatePage();
    const version = pageVersion, pageId = state.page;
    imageFor(id).then(image => {
      if (!active || state.page !== pageId || version !== pageVersion || !placements().some(item => item.id === id)) return;
      actors.set(id, { image, ...dimensions(id, image), phase: Math.random() * 7, born: elapsed, reaction: -10, preset });
      burst(p.x, p.y - .12, celebration); happySound(); requestPaint();
    }).catch(() => setHint('Dit klistermærke er gemt. Åbn siden igen for at hente billedet.'));
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
    const width = clamp(Math.round(r.width * Math.min(window.devicePixelRatio || 1, 2)), 480, 2048);
    if (q('bookCanvas').width !== width) { q('bookCanvas').width = width; q('bookCanvas').height = Math.round(width * H / W); }
    requestPaint();
  }
  function tick(now) {
    frame = 0; if (!active || document.hidden || photo) return;
    const dt = last ? clamp((now - last) / 1000, 0, .05) : 0; last = now;
    if (!reducedMotion.matches && !motionPaused) elapsed += dt;
    const canvas = q('bookCanvas'), ctx = canvas.getContext('2d');
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0); ctx.clearRect(0, 0, W, H);
    // Unlock state changes in updatePage/storage handlers, never poll the wallet
    // from the 60 fps renderer (a mature wallet can contain hundreds of claims).
    const pageOpen = q('bookLocked').hidden;
    if (pageOpen) {
      // Paint in depth order, without changing the persisted drawer order.
      const sorted = [...placements()].sort((a, b) => a.y - b.y);
      for (const p of sorted) {
        const a = actors.get(p.id); if (!a) continue;
        animate(p, a, reducedMotion.matches || motionPaused ? 0 : dt);
        paintActor(ctx, p, a);
      }
      paintParticles(ctx, dt);
    }
    if (dirty && elapsed - savedAt > 5 && !pointer) save();
    if (!reducedMotion.matches && !motionPaused && pageOpen && (actors.size || particles.length)) requestPaint();
  }
  function animate(p, a, dt) {
    if (pointer?.id === p.id) return;
    const t = elapsed + a.phase, margin = Math.max(.12, a.w / W / 2 + .025);
    // Retain the chosen depth row and the child's vertical placement.
    const moving = ['walk', 'hop', 'crawl', 'roll', 'fly', 'butterfly'].includes(a.preset) || (a.preset === 'swim' && scene().water);
    if (dt && moving && selected!==p.id) {
      const speed = a.preset === 'crawl' ? .008 : a.preset === 'roll' ? .045 : a.preset === 'fly' ? .032 : .020;
      p.x += speed * dt * p.dir;
      if (p.x > 1 - margin || p.x < margin) { p.x = clamp(p.x, margin, 1 - margin); p.dir *= -1; }
      if (a.preset === 'swim') p.y = clamp(p.y, .3, .78);
      dirty = true;
    }
    a.time = reducedMotion.matches || motionPaused || selected===p.id ? 0 : t;
  }
  function paintActor(ctx, p, a) {
    const t = a.time || 0, moving = !reducedMotion.matches && !motionPaused, dragging = pointer?.id === p.id;
    let x = p.x * W, y = p.y * H, sx = p.dir, sy = 1, angle = 0;
    // In the source fish and dolphin face left. Other subjects face forward/right.
    if (['e_fisk'].includes(state.own?.[p.id]?.lessonId||p.id)) sx *= -1;
    const reaction = elapsed - a.reaction, pop = elapsed - a.born;
    if (moving && !dragging) {
      if (['walk', 'crawl', 'roll'].includes(a.preset)) {
        const gait = Math.sin(t * (a.preset === 'crawl' ? 3 : 8)); y -= Math.abs(gait) * (a.preset === 'crawl' ? 1.5 : 5);
        sy = 1 + gait * .025; sx *= 1 - gait * .018; angle = gait * .025;
      } else if (a.preset === 'hop') {
        const hop = Math.max(0, Math.sin(t * 5)); y -= hop * 32;
        sy = 1 + hop * .10 - (1 - hop) * .045; sx *= 1 - hop * .07;
      } else if (['fly', 'butterfly'].includes(a.preset)) {
        y += Math.sin(t * 1.8) * 17; x += Math.sin(t * .9) * 9; angle = Math.sin(t * 1.8) * .045;
        if (a.preset === 'butterfly') sx *= .28 + Math.abs(Math.cos(t * 6.5)) * .72;
      } else if (a.preset === 'swim') { y += Math.sin(t * 2) * (scene().water ? 12 : 6); angle = Math.sin(t * 2) * .04; }
      else if (a.preset === 'sway') angle = Math.sin(t * 1.6) * .055;
      else { sy = 1 + Math.sin(t * 2) * .018; sx *= 1 - Math.sin(t * 2) * .008; }
      if (reaction >= 0 && reaction < .85) {
        const r = reaction / .85; y -= Math.sin(r * Math.PI) * 48;
        angle += a.spin ? r * Math.PI * 2 : Math.sin(r * Math.PI * 2) * .24; sx *= 1 + Math.sin(r * Math.PI) * .08;
      }
      if (pop >= 0 && pop < .6) {
        const r = pop / .6, grow = r === 1 ? 1 : 1 - Math.pow(2, -8*r) * Math.cos(r * 11);
        sx *= Math.max(.05, grow); sy *= Math.max(.05, grow);
      }
    }
    a.hit = { x, y, w: Math.max(48, a.w * Math.abs(sx)), h: a.h * sy };
    if (selected === p.id) {
      ctx.save(); ctx.strokeStyle = '#ffffffd9'; ctx.lineWidth = 2; ctx.setLineDash([3, 6]);
      ctx.beginPath(); ctx.ellipse(x, p.y * H + 3, a.w * .42, 9, 0, 0, Math.PI*2); ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(sx, sy);
    if (dragging) { ctx.shadowColor = '#35284838'; ctx.shadowBlur = 15; ctx.shadowOffsetY = 9; }
    const image = a.image, iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
    if (moving && a.preset === 'swim') {
      // A narrow strip mesh bends the whole fish, with a stronger tail wave.
      const strips = 24;
      for (let i = 0; i < strips; i++) {
        const u = i / strips, sw = iw / strips, shift = Math.sin(t * 5 + u * Math.PI * 2) * (3 + u * 5);
        ctx.drawImage(image, i * sw, 0, Math.min(iw - i*sw, sw + .5), ih,
          -a.w/2 + u*a.w, -a.h + shift, a.w/strips + .6, a.h);
      }
    } else if (moving && a.preset === 'sway') {
      const strips = 18;
      for (let i = 0; i < strips; i++) {
        const u = i / strips, shift = Math.sin(t * 1.6 + u) * (1-u) * 3;
        ctx.drawImage(image, 0, i*ih/strips, iw, ih/strips, -a.w/2 + shift, -a.h + i*a.h/strips, a.w, a.h/strips + .5);
      }
    } else ctx.drawImage(image, -a.w/2, -a.h, a.w, a.h);
    ctx.restore();
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
    return [...placements()].sort((a,b) => b.y-a.y).find(p => {
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
    pointer = { pid: e.pointerId, rect, id: p.id, start: pt, clientX:e.clientX, clientY:e.clientY, origin: { x: p.x, y: p.y }, offset: { x: pt.x-p.x, y: pt.y-p.y }, moved: false };
    // A sticker freezes under the finger, rather than walking out of the gesture.
    if (drawn) { pointer.offset.x = pt.x - drawn.x/W; }
    q('bookCanvas').setPointerCapture(e.pointerId);
    holdTimer = setTimeout(() => { if (pointer && !pointer.moved) { const id = pointer.id; cancelPointer(); putBack(id); } }, 1100);
    happySound(); requestPaint();
  }
  function pointerMove(e) {
    if (!pointer || pointer.pid !== e.pointerId || pointer.swipe) return;
    const pt = point(e), p = placements().find(p => p.id === pointer.id); if (!p) return;
    if (Math.hypot(e.clientX-pointer.clientX,e.clientY-pointer.clientY)>9) { pointer.moved = true; clearTimeout(holdTimer); }
    if (!pointer.moved) return;
    const preset = presetFor(p.id);
    p.x = clamp(pt.x-pointer.offset.x, .13, .87);
    p.y = clamp(pt.y-pointer.offset.y, groundPreset(preset)?Math.max(.35,scene().ground-.36):.26, groundPreset(preset)?scene().ground:preset === 'swim' && scene().water ? .78 : .90);
    q('bookCanvas').classList.add('dragging');
    if (!reducedMotion.matches) q('bookBackdrop').style.transform = `scale(1.012) translate(${(pt.x-.5)*2}px, ${(pt.y-.5)*2}px)`;
    requestPaint();
  }
  function pointerUp(e) {
    if (!pointer || pointer.pid !== e.pointerId) return;
    const gesture=pointer;if(gesture.swipe){const dx=e.clientX-gesture.clientX,dy=e.clientY-gesture.clientY;cancelPointer();if(e.type!=='pointercancel'&&Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.4){const at=SCENES.indexOf(scene());goTo(SCENES[clamp(at+(dx<0?1:-1),0,SCENES.length-1)].id);}return;}const p=placements().find(p=>p.id===gesture.id);
    if (e.type === 'pointercancel' && p) Object.assign(p, gesture.origin);
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
    suspend(); active = false; ++pageVersion; actors.clear(); particles.length = 0;
    clearTimeout(flipTimer); q('bookPage').querySelector('.book-flip')?.remove();
    if (photo) closePhoto();
  }
  function renderShop() {
    const grid = q('sceneShopGrid'); grid.replaceChildren();
    for (const s of SCENES.filter(s => s.price)) {
      const open = unlocked(s), card = document.createElement('article'); card.className = 'scene-shop-card';
      const img = document.createElement('img'); img.src = s.art; img.alt = s.description; img.loading = 'lazy'; img.width = 400; img.height = 250;
      const title = document.createElement('h3'); title.textContent = s.title;
      const p = document.createElement('p'); p.textContent = 'En ny side i din levende klistermærkebog';
      const b = document.createElement('button'); b.className = 'btn' + (open || balance() >= s.price ? ' primary' : '');
      UI.label(b, open ? 'next' : 'star', open ? 'Åbn siden' : balance() >= s.price ? `Lås op · ${s.price}` : `Spar ${s.price-balance()} mere op`);
      b.disabled = !open && balance() < s.price;
      b.onclick = () => { if (open) { goTo(s.id); show('stickerbook'); } else askUnlock(sceneProduct(s)); };
      card.append(img, title, p, b); grid.appendChild(card);
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
  function preview(canvas,image,preset,time){const ctx=canvas.getContext('2d');ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);ctx.clearRect(0,0,W,H);const dim=dimensions('preview',image),p={id:'preview',x:.5,y:.82,dir:1},a={image,...dim,preset,time,phase:0,born:-10,reaction:-10};a.h*=2.1;a.w*=2.1;paintActor(ctx,p,a);}
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
    place, putBack, cutPhoto, presetFor, addOwn, fromOwn, preview };
})();
