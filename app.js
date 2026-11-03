'use strict';
const $ = s => document.querySelector(s);
const ACCENT = '#6435cf';
// Avoid invalidating layout and live regions with identical playback values.
function setText(el, text) { if (el.textContent !== text) el.textContent = text; }
function setHidden(el, hidden) { if (el.hidden !== hidden) el.hidden = hidden; }
function setAttr(el, name, value) { if (el.getAttribute(name) !== value) el.setAttribute(name, value); }

// Lageret kan være fuldt eller slået fra.
function readLocal(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
let localSaveFailed = false;
function writeLocal(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { localSaveFailed = true; const el = document.getElementById('saveStatus'); if (el) el.hidden = false; return false; } }
const objectMap = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
function validPadStrokes(value) { return (Array.isArray(value) ? value : []).filter(st => st && ['pen','eraser'].includes(st.t) && /^#[0-9a-f]{6}$/i.test(st.c) && Number.isFinite(st.s) && st.s > 0 && st.s <= 100 && Array.isArray(st.p) && st.p.length && st.p.length < 100000 && st.p.every(p => p && [p.x,p.y,p.p].every(Number.isFinite) && p.x>=0 && p.x<=1 && p.y>=0 && p.y<=1 && p.p>=0 && p.p<=1)); }
function removeLocal(key) { try { localStorage.removeItem(key); } catch {} }

/* ---------------- fremskridt ---------------- */
const store = {
  get() { const p = objectMap(readLocal('ts_progress')); return { done: objectMap(p.done), days: (Array.isArray(p.days) ? p.days : []).filter(x => typeof x === 'string') }; },
  set(v) { writeLocal('ts_progress', v); },
};
const lessonKey = id => 'ts_lesson_' + id;
function lessonState(lesson) {
  const saved = readLocal(lessonKey(lesson.id));
  if (!saved || !Number.isInteger(saved.step)) return null;
  if(saved.revision && lesson.revision && saved.revision!==lesson.revision)return {...saved,step:Math.max(0,Math.min(saved.step,lesson.steps.length-1)),elapsed:0,waiting:false,revision:lesson.revision};
  return {
    ...saved, updated: Number.isFinite(saved.updated) ? saved.updated : 0, elapsed: Math.max(0, Number(saved.elapsed) || 0),
    step: Math.max(0, Math.min(saved.step, lesson.steps.length - 1)),
    mode: ['paper', 'side', 'trace'].includes(saved.mode) ? saved.mode : 'paper',
  };
}
function clearLessonDrawings(id) {
  removeLocal(lessonKey(id) + '_side');
  removeLocal(lessonKey(id) + '_trace');
  DraftStore.remove(lessonKey(id) + '_side').catch(() => {}); DraftStore.remove(lessonKey(id) + '_trace').catch(() => {});
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
function markActive() {
  const p = store.get();
  if (!p.days.includes(today())) { p.days.push(today()); p.days = p.days.slice(-400); store.set(p); }
  awardStars('daily:' + today(), 2, 'Du tegnede i dag');
}
function streak() {
  const days = new Set(store.get().days);
  const d = new Date(); let n = 0;
  const key = x => `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
  if (!days.has(key(d))) d.setDate(d.getDate() - 1);
  while (days.has(key(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ---------------- skærme ---------------- */
let current = 'home';
if(!readLocal('ts_completion_repaired_v27')){
  for(const lesson of LESSONS){const saved=lessonState(lesson);
    if(store.get().done[lesson.id]&&saved&&!saved.complete&&saved.step===lesson.steps.length-1&&saved.waiting)
      writeLocal(lessonKey(lesson.id),{...saved,complete:true});
  }
  writeLocal('ts_completion_repaired_v27',true);
}

/* ---------------- hold skærmen tændt ---------------- */
let screenLock = null, screenLockRequest = null, awakeVersion = 0;
let awakeVideo = null, lessonTapped = false;
let keepScreenOn = readLocal('ts_keep_awake') !== false;
let detailZoom = readLocal('ts_detail_zoom') !== false;

function stopAwakeVideo() {
  if (!awakeVideo) return;
  awakeVideo.pause();
  awakeVideo.removeAttribute('src');
  awakeVideo.load();
  awakeVideo.remove(); awakeVideo = null;
}

function startAwakeVideo() {
  if (!keepScreenOn || document.hidden || !lessonTapped) return;
  try {
    if (!awakeVideo) {
      const video = document.createElement('video');
      video.muted = video.defaultMuted = video.loop = video.playsInline = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.setAttribute('aria-hidden', 'true');
      video.disablePictureInPicture = true;
      // Bliv i dokumentet, så Safari kan afspille videoen inline.
      video.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:1px;opacity:.01;pointer-events:none';
      // Egen 16 × 16 H.264-video, to sekunder uden lyd. Virker også offline.
      video.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMybW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAl10cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAHVbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABgG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAUBzdGJsAAAAuHN0c2QAAAAAAAAAAQAAAKhhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MS4xOS4xMDAgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAALmF2Y0MBQsAK/+EAFmdCwArZHsBEAAADAAQAAAMAEDxImSABAAVoy4PLIAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAAqAAAAKgAAAABhzdHRzAAAAAAAAAAEAAAAEAAAgAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAAEAAAAAQAAACRzdHN6AAAAAAAAAAAAAAAEAAACgwAAAAoAAAAKAAAACQAAABRzdGNvAAAAAAAAAAEAAANiAAAAYXVkdGEAAABZbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAsaWxzdAAAACSpdG9vAAAAHGRhdGEAAAABAAAAAExhdmY2MS43LjEwMAAAAAhmcmVlAAACqG1kYXQAAAJwBgX//2zcRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY0IHIzMTkwIDdlZDc1M2IgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDI0IC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MCByZWY9MyBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgxOjB4MTExIG1lPWhleCBzdWJtZT03IHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTEgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0xIDh4OGRjdD0wIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PS0yIHRocmVhZHM9MSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTAgd2VpZ2h0cD0wIGtleWludD0yNTAga2V5aW50X21pbj0yIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAC2WIhAU8mKAAP7+AAAAABkGaOAp6gAAAAAZBmlQCnqAAAAAFQZpgEvU=';
      document.body.appendChild(video);
      awakeVideo = video;
    }
    const playing = awakeVideo.play();
    if (playing) playing.catch(() => {});
  } catch {}
}

function releaseScreenLock(lock) {
  try { const released = lock.release(); if (released) released.catch(() => {}); } catch {}
}

function stopLessonAwake(resetTap = true) {
  awakeVersion++;
  screenLockRequest = null;
  const lock = screenLock; screenLock = null;
  if (lock) releaseScreenLock(lock);
  stopAwakeVideo();
  if (resetTap) lessonTapped = false;
}

function keepLessonAwake(userTap = false) {
  if (!keepScreenOn || document.hidden || !['lesson', 'techniques'].includes(current)) return;
  if (userTap) lessonTapped = true;
  if (screenLock && !screenLock.released) return;
  // Start under selve trykket, mens Safari stadig tillader video.play().
  // Videoen stoppes straks, hvis den native skærmlås lykkes.
  if (lessonTapped) startAwakeVideo();
  if (!navigator.wakeLock?.request || screenLockRequest) return;
  const version = awakeVersion;
  const request = (async () => {
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (version !== awakeVersion || !keepScreenOn || document.hidden) {
        releaseScreenLock(lock); return;
      }
      screenLock = lock;
      stopAwakeVideo();
      lock.addEventListener('release', () => {
        if (screenLock !== lock) return;
        screenLock = null;
        startAwakeVideo();
      });
    } catch {
      if (version === awakeVersion) startAwakeVideo();
    }
  })();
  screenLockRequest = request;
  request.finally(() => { if (screenLockRequest === request) screenLockRequest = null; });
}

// Første tryk starter også videoen på ældre iOS.
document.addEventListener('pointerup', () => keepLessonAwake(true), { capture: true });
document.addEventListener('touchend', () => keepLessonAwake(true), { capture: true, passive: true });
document.addEventListener('click', () => keepLessonAwake(true), { capture: true });

function show(id) {
  if (typeof flushEntryNote === 'function') flushEntryNote().catch(() => toast('Noten er ikke gemt endnu. Prøv igen.'));
  if (current === 'lesson') saveLesson();
  if (current === 'stickerbook' && id !== 'stickerbook') StickerBook.leave();
  if (current === 'lesson' && id !== 'lesson') {
    sidePad.finishStroke(); tracePad.finishStroke(); stopStep();
  }
  if (current === 'done' && id !== 'done') { cancelStepSpeech(); }
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id));
  const tabbed = $('#' + id).classList.contains('tabbed');
  $('#tabbar').classList.toggle('hide', !tabbed);
  document.querySelectorAll('#tabbar button').forEach(b => {b.classList.toggle('on', b.dataset.tab===id);if(b.dataset.tab===id)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  if(current!==id&&historyReady)history.pushState({screen:id},'', '#'+id);
  current = id;
  if (id === 'done') $('#done').scrollTop = 0;
  if (id !== 'lesson') closeTechnique(false);
  if (id !== 'done' && id !== 'lesson') cancelStepSpeech();
  if (['lesson', 'techniques'].includes(id)) keepLessonAwake(); else { stopLessonAwake(); pencilSound.stop(); pencilSound.context?.suspend?.().catch(() => {}); }
  writeLocal('ts_screen', id === 'lesson' ? { screen: id, lessonId: L.id } : {
    screen: id === 'done' ? 'home' : id === 'entry' ? 'journal' : id,
  });
  if (id === 'home') renderHome();
  if (id === 'journal') renderJournal();
  if (id === 'shop') renderShop();
  if (id === 'stickerbook') StickerBook.open();
  updateWalletCounters();
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}
document.querySelectorAll('#tabbar button').forEach(b => b.onclick = () => show(b.dataset.tab));

let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = UI.plain(msg); t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800);
}

/* ---------------- forside ---------------- */
const LEVELS = [
  { id: 1, name: 'Let', heading: 'Let · kom godt i gang' },
  { id: 2, name: 'Mellem', heading: 'Mellem · prøv lidt mere' },
  { id: 3, name: 'Svær', heading: 'Svær · klar til en udfordring?' },
];
const savedFilters = readLocal('ts_filters');
let cat = CATEGORIES.some(c => c.id === savedFilters?.cat) ? savedFilters.cat : 'alle';
let level = LEVELS.some(l => l.id === savedFilters?.level) ? savedFilters.level : 'alle';
function saveFilters() { writeLocal('ts_filters', { cat, level }); }
function renderHome() {
  const h = new Date().getHours();
  $('#hello').textContent = h < 10 ? 'Godmorgen!' : h < 17 ? 'Hej igen!' : 'Godaften!';
  const prog = store.get();
  UI.label($('#streak'), 'flame', String(streak()));
  $('#streak').setAttribute('aria-label', streak() + ' dage i træk');
  updateWalletCounters();
  renderLearningPath();

  const chips = $('#chips'); chips.innerHTML = '';
  [{ id: 'alle', name: 'Alle', emoji: '✨' }, ...CATEGORIES].forEach(c => {
    const b = document.createElement('button');
    b.className = 'chip' + (c.id === cat ? ' on' : '');
    b.setAttribute('aria-pressed', c.id === cat);
    UI.label(b, { alle: 'sparkle', dyr: 'paw', natur: 'leaf' }[c.id] || 'shapes', c.name);
    b.onclick = () => { cat = c.id; saveFilters(); renderHome(); };
    chips.appendChild(b);
  });

  const levelChips = $('#levelChips'); levelChips.innerHTML = '';
  [{ id: 'alle', name: 'Alle' }, ...LEVELS].forEach(l => {
    const b = document.createElement('button');
    b.className = 'chip' + (l.id === level ? ' on' : '');
    b.setAttribute('aria-pressed', l.id === level);
    UI.label(b, l.id === 'alle' ? 'shapes' : 'star', l.name);
    b.onclick = () => { level = l.id; saveFilters(); renderHome(); };
    levelChips.appendChild(b);
  });

  const grid = $('#lessonGrid'); grid.innerHTML = '';
  const lessons = LESSONS.filter(l => lessonUnlocked(l) && (cat === 'alle' || l.cat === cat) && (level === 'alle' || l.level === level));
  if (!lessons.length) {
    const empty = document.createElement('div'); empty.className = 'catalog-empty';
    empty.innerHTML = UI.mascot('think');
    const hint = document.createElement('p'); hint.className = 'hint';
    hint.textContent = 'Prøv et andet valg, så finder vi noget at tegne.';
    const reset = document.createElement('button'); reset.textContent = 'Vis alle tegninger'; reset.className = 'btn';
    reset.onclick = () => { cat = level = 'alle'; saveFilters(); renderHome(); };
    empty.append(hint, reset); grid.append(empty);
  }
  let previousLevel = null;
  lessons.forEach(l => {
    if (level === 'alle' && previousLevel !== l.level) {
      const heading = document.createElement('h2'); heading.className = 'level-heading';
      UI.label(heading, 'star', LEVELS.find(item => item.id === l.level).heading);
      grid.appendChild(heading);
    }
    previousLevel = l.level;
    const saved = lessonState(l);
    const card = document.createElement('button');
    card.className = 'card';
    const img = document.createElement('img');
    img.src = l.dir + 'thumb.jpg'; img.alt = l.title; img.loading = 'lazy';
    img.width = img.height = 400;
    card.appendChild(img);
    for (const [cls, text] of [
      ['t', l.title],
      ['level level-' + l.level, LEVELS.find(item => item.id === l.level).name],
      ['m', l.goal || `${l.steps.length} trin`],
      ...(prog.done[l.id] ? [['done', 'Gennemført ✓']] :
        saved ? [['inprogress', `Trin ${saved.step + 1} af ${l.steps.length}`]] : []),
    ]) {
      const div = document.createElement('div'); div.className = cls; div.textContent = text;
      card.appendChild(div);
    }
    if (wallet.newLessons[l.id]) { const badge = document.createElement('span'); badge.className = 'new-badge'; badge.textContent = 'Ny!'; card.appendChild(badge); }
    card.onclick = () => openLesson(l);
    grid.appendChild(card);
  });
}

/* ---------------- tegneflade ---------------- */
const COLORS = ['#1a1a1a', '#4a4a4a', '#7a7a7a', '#b0b0b0', '#e63946', '#ffd43b', '#51cf66', '#4dabf7', '#6c3cf0', '#8d6346'];
const SIZES = [3, 7, 14, 28];

class Pad {
  constructor(canvas, { persistKey = null, onTap = null } = {}) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.color = COLORS[0]; this.size = SIZES[1]; this.tool = 'pen';
    this.strokes = []; this.redo = []; this.cur = null; this.penSeen = false;
    this.onTap = onTap; this.tap = null;
    this.onchange = () => {};
    this.setKey(persistKey);
    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup', e => this.up(e));
    canvas.addEventListener('pointercancel', e => this.up(e));
    canvas.addEventListener('lostpointercapture', () => this.finishStroke());
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }
  setKey(key) {
    this.finishStroke();
    this.persistKey = key;
    const saved = key ? readLocal(key) : null;
    this.strokes = validPadStrokes(saved);
    const generation = this.generation = (this.generation || 0) + 1;
    if (key) DraftStore.get(key).then(record => { if (this.generation !== generation || this.persistKey !== key || this.cur || this.changedSinceLoad) return; if (record) { this.strokes = validPadStrokes(record.strokes); this.redraw(); this.onchange(); } }).catch(() => { if (saved) DraftStore.queue(key, this.strokes); });
    this.changedSinceLoad = false;
    this.redo = []; this.penSeen = false;
    this.redraw();
  }
  resize() {
    const r = this.c.getBoundingClientRect();
    if (!r.width) return;
    if (this.cur && (Math.abs(r.width-this.w) > .5 || Math.abs(r.height-this.h) > .5)) this.finishStroke();
    const dpr = Math.min(window.devicePixelRatio || 1, 2, 1200 / Math.max(r.width, r.height));
    this.w = r.width; this.h = r.height;
    this.c.width = Math.round(r.width * dpr); this.c.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redraw();
  }
  pt(e) { const r = this.rect; return { x: Math.max(0, Math.min(1,(e.clientX-r.left)/this.w)), y: Math.max(0, Math.min(1,(e.clientY-r.top)/this.w)), p: e.pointerType === 'pen' ? Math.max(.05,Math.min(1,e.pressure || .5)) : .5 }; }
  down(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.pointerType === 'pen') this.penSeen = true;
    if (this.cur && this.pointerType === 'pen' && e.pointerType === 'touch') return; // håndfladeafvisning når Apple Pencil bruges
    if (this.cur) return;
    e.preventDefault();
    if (!this.w || this.c.width !== Math.round(this.c.getBoundingClientRect().width * Math.min(window.devicePixelRatio || 1, 2, 1200 / Math.max(this.w || 1, this.h || 1)))) this.resize();
    try { this.c.setPointerCapture(e.pointerId); } catch {}
    this.pid = e.pointerId; this.pointerType = e.pointerType;
    this.rect = this.c.getBoundingClientRect();
    this.cur = { c: this.color, s: this.size, t: this.tool, p: [this.pt(e)] };
    // Et kort fingertryk på sporarket styrer videoen. Pennen tegner altid.
    this.tap = this.onTap && e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY } : null;
    this.strokeBase = document.createElement('canvas');
    this.strokeBase.width = this.c.width; this.strokeBase.height = this.c.height;
    this.strokeBase.getContext('2d').drawImage(this.c, 0, 0);
    if (!this.tap) this.drawDot(this.cur);
  }
  move(e) {
    if (!this.cur || e.pointerId !== this.pid) return;
    if (this.tap) {
      if (Math.hypot(e.clientX - this.tap.x, e.clientY - this.tap.y) < 6) return;
      this.tap = null; this.drawDot(this.cur);
    }
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) {
      this.cur.p.push(this.pt(ev));
      this.paintCurrent();
    }
  }
  up(e) {
    if (!this.cur || e.pointerId !== this.pid) return;
    if (this.tap && e.type !== 'pointercancel') {
      this.tap = this.cur = null; this.onTap(); return;
    }
    if (e.type !== 'pointercancel' && Number.isFinite(e.clientX)) { const pt = this.pt(e), last = this.cur.p[this.cur.p.length-1]; if (Math.hypot(pt.x-last.x,pt.y-last.y)>.0001) { this.cur.p.push(pt); this.paintCurrent(); } }
    this.finishStroke();
  }
  finishStroke() {
    if (!this.cur) return;
    if (this.tap) { this.drawDot(this.cur); this.tap = null; }
    this.paintCurrent();
    this.strokeBase = null;
    this.strokes.push(this.cur); this.cur = null; this.redo = [];
    this.save(); this.onchange();
  }
  style(st, p) {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = st.t === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ctx.fillStyle = st.c; ctx.globalAlpha = st.t === 'eraser' ? 1 : .35 + p * .6;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.lineWidth = st.s * (this.w / 400) * (st.t === 'eraser' ? 2.5 : 0.6 + p * 0.8);
  }
  drawDot(st) {
    const p = st.p[0]; this.style(st, p.p);
    this.ctx.beginPath(); this.ctx.arc(p.x * this.w, p.y * this.w, this.ctx.lineWidth / 2, 0, Math.PI * 2); this.ctx.fill();
  }
  drawSeg(st, i) {
    const P = st.p, W = this.w;
    if (i < 1) return;
    const a = P[i - 2] || P[i - 1], b = P[i - 1], c = P[i];
    const m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, m2 = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
    this.style(st, b.p);
    const ctx = this.ctx;
    ctx.beginPath(); ctx.moveTo(m1.x * W, m1.y * W); ctx.quadraticCurveTo(b.x * W, b.y * W, m2.x * W, m2.y * W); ctx.stroke();
  }
  drawEnd(st) {
    const P=st.p, b=P[P.length-1], a=P[P.length-2] || b; this.style(st,b.p); const ctx=this.ctx;
    ctx.beginPath();ctx.moveTo((a.x+b.x)/2*this.w,(a.y+b.y)/2*this.w);ctx.lineTo(b.x*this.w,b.y*this.w);ctx.stroke();
  }
  drawStroke(st) {
    const P = st.p;
    if (P.some(p => Math.abs(p.p-P[0].p) > .001)) {
      this.drawDot(st); for (let i=1;i<P.length;i++) this.drawSeg(st,i); this.drawEnd(st); return;
    }
    if (P.length === 1) { this.drawDot(st); return; }
    this.style(st,P[0].p);
    const ctx=this.ctx,W=this.w;
    ctx.beginPath();ctx.moveTo(P[0].x*W,P[0].y*W);
    for(let i=1;i<P.length;i++){const a=P[i-1],b=P[i];ctx.quadraticCurveTo(a.x*W,a.y*W,(a.x+b.x)/2*W,(a.y+b.y)/2*W);}
    ctx.lineTo(P.at(-1).x*W,P.at(-1).y*W);ctx.stroke();
  }
  paintCurrent() {
    const ctx=this.ctx;
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='copy';ctx.drawImage(this.strokeBase,0,0);ctx.restore();
    this.drawStroke(this.cur);
  }
  redraw() {
    if (!this.w || !this.h) return;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.w, this.h);
    for (const st of this.strokes) this.drawStroke(st);
    ctx.globalCompositeOperation = 'source-over';
  }
  undo() { if (this.strokes.length) { this.redo.push(this.strokes.pop()); this.redraw(); this.save(); this.onchange(); } }
  redoOne() { if (this.redo.length) { this.strokes.push(this.redo.pop()); this.redraw(); this.save(); this.onchange(); } }
  clear() { this.strokes = []; this.redo = []; this.redraw(); this.save(); this.onchange(); }
  save() { this.changedSinceLoad = true; if (this.persistKey) DraftStore.queue(this.persistKey, this.strokes); }
  empty() { return !this.strokes.length; }
  toImage() {
    const out = document.createElement('canvas');
    // Render the stroke model independently of layout: a restored hidden pad
    // has never acquired a CSS size or painted its display canvas.
    out.width = out.height = 1200;
    const ink = document.createElement('canvas'); ink.width = ink.height = 1200;
    const renderer = Object.create(Pad.prototype);
    Object.assign(renderer, {ctx:ink.getContext('2d'), w:1200, h:1200, strokes:this.strokes});
    renderer.redraw();
    const o = out.getContext('2d');
    o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height);
    o.drawImage(ink, 0, 0);
    return out.toDataURL('image/jpeg', 0.9);
  }
}

function buildTools(box, pad, { undo = true } = {}) {
  box.innerHTML = '';
  const add = (cls, html, fn, label = 'Tegneredskab') => { const b = document.createElement('button'); b.className = cls; b.innerHTML = html; b.onclick = fn; b.setAttribute('aria-label', label); box.appendChild(b); return b; };
  const sep = () => box.appendChild(Object.assign(document.createElement('div'), { className: 'sep' }));
  const refresh = () => {
    box.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', pad.tool === 'pen' && b.dataset.c === pad.color));
    box.querySelectorAll('.sz').forEach(b => b.classList.toggle('on', +b.dataset.s === pad.size));
    box.querySelector('.eraser').classList.toggle('on', pad.tool === 'eraser');
    box.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.classList.contains('on'))));
  };
  if (undo) { add('tool', UI.icon('undo'), () => pad.undo(), 'Fortryd seneste streg'); add('tool', UI.icon('replay'), () => pad.redoOne(), 'Gendan seneste streg'); sep(); }
  add('tool eraser', UI.icon('eraser'), () => { pad.tool = pad.tool === 'eraser' ? 'pen' : 'eraser'; refresh(); }, 'Viskelæder');
  sep();
  SIZES.forEach(s => { const b = add('sz', `<i style="width:${Math.min(28, s + 3)}px;height:${Math.min(28, s + 3)}px"></i>`, () => { pad.size = s; refresh(); }); b.dataset.s = s; b.setAttribute('aria-label', 'Stregtykkelse ' + s); });
  sep();
  COLORS.forEach(c => { const b = add('sw', '', () => { pad.color = c; pad.tool = 'pen'; refresh(); }); b.style.background = c; b.dataset.c = c; b.setAttribute('aria-label', 'Farve ' + ['Grafit','Mørkegrå','Grå','Lysegrå','Rød','Gul','Grøn','Blå','Lilla','Brun'][COLORS.indexOf(c)]); });
  refresh();
}

/* ---------------- lektion ---------------- */
let L = null, step = 0, mode = 'paper', attemptId = null, assessment = null, resumeState = null, attemptComplete = false;
const sidePad = new Pad($('#sideCanvas'));
const tracePad = new Pad($('#traceCanvas'));
const stepImages = new Map();
let stepVersion = 0;
let stepPlayer = null, stepFrame = 0;
const stepSpeeds = [0.25, 0.5, 0.75, 1, 1.5, 2];
let stepSpeed = readLocal('ts_step_speed');
if (!stepSpeeds.includes(stepSpeed)) stepSpeed = 1;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const TINT_FADE = 0;

// Stregdata og billeder hentes sammen, kun for åbne/næste trin.
const strokeFiles = new Map();
let handAsset = null, handRequest = null;
// One-time reset: previous beginner defaults enabled speech and forced pauses.
if (!readLocal('ts_child_control_v32')) {
  writeLocal('ts_auto_read', false); writeLocal('ts_wait_for_me', false);
  writeLocal('ts_child_control_v32', true);
}
// Narration is requested per clip with a speaker button, including old opt-ins.
removeLocal('ts_auto_read');
let waitForMe = readLocal('ts_wait_for_me') === true;
const cheers = ['Du tog dig tid til at prøve! ✨', 'Ét skridt mere på dit tegneeventyr! 🌟', 'Du øver dig med blyanten! ✏️', 'Du gav plads til et nyt forsøg! 💜'];
function doneMessage(lesson) { return 'Flot klaret – din tegning er færdig!'; }
let cheerIndex = 0;

function assetURL(src){return /^(lessons|assets)\//.test(src)&&!src.includes('?')?src+'?v=1793715603':src;}
async function fetchTimed(src, timeout=45000) {
  src=assetURL(src);
  const controller = new AbortController(), timer=setTimeout(()=>controller.abort(),timeout);
  try{const r=await fetch(src,{signal:controller.signal});if(!r.ok)throw Error('Kunne ikke hente '+src);return r;}finally{clearTimeout(timer);}
}
function trimAssets(lesson,index){for(const map of [stepImages,strokeFiles])for(const key of map.keys())if(![index-1,index,index+1].some(i=>key===`${lesson.dir}${map===stepImages?'step':'strokes'}${i+1}.${map===stepImages?'jpg':'json'}`))map.delete(key);}
const playbackIndex = fetchTimed('assets/playback-index.json').then(r=>r.json()).catch(()=>({steps:{}}));
function validStrokePlan(data){
  if(data?.v===3)return data.size===1024&&Number.isFinite(data.duration)&&data.duration>0&&data.duration<=PlaybackTiming.LIMIT&&Array.isArray(data.atlases)&&Array.isArray(data.groups)&&data.groups.length>0&&data.groups.every(g=>g.bounds&&Array.isArray(g.rect)&&g.rect.length===4&&g.rect.every(Number.isFinite)&&g.weight>0&&Number.isInteger(g.atlas)&&g.atlas>=0&&g.atlas<data.atlases.length);
  return [1,2].includes(data?.v)&&data.size===1024&&Array.isArray(data.strokes)&&data.strokes.every(raw=>raw&&Array.isArray(raw.p)&&raw.p.length>=4&&raw.p.length%2===0&&raw.p.every(n=>Number.isFinite(n)&&n>=0&&n<=1024)&&Number.isFinite(raw.w)&&raw.w>0&&raw.w<=128)&&(!(data.v===2)||Array.isArray(data.segments)&&data.segments.every(g=>Array.isArray(g.actions)&&g.actions.every(a=>a&&Array.isArray(a.p)&&a.p.every(Number.isFinite))));
}
function loadPlanImage(src){return new Promise((resolve,reject)=>{const im=new Image(),timer=setTimeout(()=>reject(Error('Forbindelsen er langsom. Prøv igen.')),45000);im.onload=async()=>{clearTimeout(timer);try{await im.decode?.();}catch{}resolve(im);};im.onerror=()=>{clearTimeout(timer);reject(Error('Masken kunne ikke hentes'));};im.src=assetURL(src);});}
function loadStrokes(lesson,index){
  const src=`${lesson.dir}strokes${index+1}.json`;
  if(!strokeFiles.has(src)){
    const promise=(async()=>{
      const compact=(await playbackIndex).steps?.[`${lesson.id}/${index+1}`];
      if(compact&&compact.revision===lesson.revision){try{
        const data=await fetchTimed(lesson.dir+compact.file).then(r=>r.json());
        if(!validStrokePlan(data)||data.imageRevision!==lesson.revision)throw Error('Forældet animation');
        data.atlasImages=await Promise.all(data.atlases.map(f=>loadPlanImage(lesson.dir+f)));return data;
      }catch{throw Error('Animationen kunne ikke hentes. Prøv igen.');}}
      const data=await fetchTimed(src).then(r=>r.json());
      if(!validStrokePlan(data)||(data.imageRevision&&lesson.revision&&data.imageRevision!==lesson.revision))throw Error('Animationen passer ikke til tegningen.');return data;
    })().catch(()=>{strokeFiles.delete(src);return null;});strokeFiles.set(src,promise);
  }return strokeFiles.get(src);
}

const handVariants = new Map();
let handWidthFraction = .34, handView = null;

function handOverlay() {
  if (handView) return handView;
  // Keep the hand overlay and its clipping styles together.
  const style = document.createElement('style');
  style.id = 'handV2Styles';
  style.textContent = `
    #drawingHand { position:absolute; inset:0; width:100%; max-width:none; height:100%;
      overflow:hidden; border-radius:inherit; pointer-events:none; transform:none;
      filter:none; transition:none; will-change:auto; }
    #drawingHand::before, #drawingHand::after { content:none !important; display:none !important; }
    #drawingHand canvas { display:block; width:100%; height:100%; }
  `;
  document.head.appendChild(style);
  const hand = $('#drawingHand'), canvas = document.createElement('canvas');
  canvas.id = 'handCanvas';
  hand.replaceChildren(canvas); // Also remove the old SVG/photograph and its arm.
  $('#guideWrap').insertBefore(hand, $('#graphiteFX'));
  handView = { hand, canvas, ctx: canvas.getContext('2d'), frame: 0, last: 0,
    rotation: 0, height: 0, weights: {}, target: null };
  return handView;
}

function featherHandLayer(image, meta) {
  const layer = playerCanvas(meta.w), ctx = layer.getContext('2d');
  layer.height = meta.h;
  ctx.drawImage(image, 0, 0, meta.w, meta.h);
  // These finite photographs contain the entire forearm: never extend it with
  // another piece. Feather only its two cropped exits, leaving fingers/tip crisp.
  ctx.globalCompositeOperation = 'destination-in';
  for (const [w, h] of [[meta.w, 0], [0, meta.h]]) {
    const fade = ctx.createLinearGradient(w * .88, h * .88, w, h);
    fade.addColorStop(0, '#fff'); fade.addColorStop(1, '#fff0');
    ctx.fillStyle = fade; ctx.fillRect(0, 0, meta.w, meta.h);
  }
  return layer;
}

function loadHand() {
  if (handVariants.size === 4) return Promise.resolve();
  if (handRequest) return handRequest;
  handOverlay();
  const imageAt = src => loadPlanImage(src);
  TechniqueDemo.setToolRenderer((ctx,x,y,side,erase)=>{if(side)return false;const asset=handVariants.get(erase?'erase':'draw');if(!asset)return false;paintHandPose(ctx,asset,x,y,200,0,0,1,true);paintHandPose(ctx,asset,x,y,200,0,0,1,false);return true;});
  handRequest = (async () => {
    const response = await fetchTimed('hand/hands.json');
    if (!response.ok) return;
    const config = await response.json();
    if (Number.isFinite(config.recommendedWidthFraction) && config.recommendedWidthFraction > 0 && config.recommendedWidthFraction <= 1)
      handWidthFraction = config.recommendedWidthFraction;
    await Promise.all(['draw', 'press', 'lift', 'erase'].map(async pose => {
      if (handVariants.has(pose)) return;
      try {
        const meta = config.poses?.[pose];
        if (!meta || ![meta.w, meta.h, meta.tipX, meta.tipY].every(Number.isFinite) || meta.w <= 0 || meta.h <= 0 ||
          meta.tipX < 0 || meta.tipX > meta.w || meta.tipY < 0 || meta.tipY > meta.h || !/^hand_[a-z]+\.png$/.test(meta.file)) return;
        const [image, shadow] = await Promise.all([imageAt('hand/' + meta.file), imageAt(`hand/shadow_${pose}.png`)]);
        const asset = { ...meta, pose, image: featherHandLayer(image, meta), shadow: featherHandLayer(shadow, meta) };
        handVariants.set(pose, asset);
        if (pose === 'draw') handAsset = asset;
      } catch {} // A missing pose falls back to the loaded drawing pose.
    }));
  })().catch(() => {}).finally(() => { handRequest = null; if (stepPlayer) paintStep(); });
  return handRequest;
}

function paintHandPose(ctx, asset, x, y, width, rotation, height, opacity, shadow = false) {
  const k = width / asset.w;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation * Math.PI / 180);
  // Lift's image already contains a raised tip (12.5 source pixels). Preserve
  // its registered wrist instead of snapping that raised tip onto the paper.
  const tipY = asset.tipY + (asset.pose === 'lift' ? 12.5 : 0);
  ctx.globalAlpha = opacity * (shadow ? 1 - height * .22 : 1);
  const dx = shadow ? height * 3 : 0, dy = shadow ? height * 6 : 0;
  ctx.drawImage(shadow ? asset.shadow : asset.image,
    -asset.tipX * k + dx, -tipY * k + dy, asset.w * k, asset.h * k);
  ctx.restore();
}

function paintHand(now = performance.now()) {
  const view = handView;
  if (view.frame) cancelAnimationFrame(view.frame);
  view.frame = 0;
  if (view.hand.hidden || !view.target || document.hidden) return;
  const { width, height } = view.size || $('#guideWrap').getBoundingClientRect();
  if (!width || !height) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1, 1024 / Math.max(width,height)), canvas = view.canvas, ctx = view.ctx;
  const w = Math.round(width * dpr), h = Math.round(height * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  const dt = Math.min(64, Math.max(0, now - view.last)); view.last = now;
  const ease = reducedMotion.matches ? 1 : 1 - Math.exp(-dt / 65), target = view.target;
  view.rotation += (target.rotation - view.rotation) * ease;
  view.height += (target.height - view.height) * ease;
  for (const pose of handVariants.keys()) {
    view.weights[pose] = (view.weights[pose] || 0) + ((pose === target.pose ? 1 : 0) - (view.weights[pose] || 0)) * ease;
  }
  // Only the contact follows the camera. A close-up must not enlarge the hand
  // into the oversized foreground object that obscured the demonstration.
  const x = (.5 + (target.x - camera.x) * camera.z) * width;
  const y = (.5 + (target.y - camera.y) * camera.z) * height;
  if(target.pose==='eraseFallback'||target.pose==='drawFallback'){TechniqueDemo.drawTool(ctx,x,y,stepPlayer?.currentTool==='graphiteSide',target.pose==='eraseFallback',Math.max(.6,width/450));if(!stepPlayer?.playing)view.frame=requestAnimationFrame(paintHand);return;}
  if(stepPlayer?.currentTool==='graphiteSide'){TechniqueDemo.drawTool(ctx,x,y,true,false,Math.max(.6,width/450));if(!stepPlayer?.playing)view.frame=requestAnimationFrame(paintHand);return;}
  for (const shadow of [true, false]) for (const [pose, asset] of handVariants) {
    const opacity = view.weights[pose] || 0;
    if (opacity > .001) paintHandPose(ctx, asset, x, y, width * handWidthFraction, view.rotation, view.height, opacity, shadow);
  }
  // Fade the overlay alone at the paper's bottom/right clip; drawing stays sharp.
  ctx.globalCompositeOperation = 'destination-in';
  const fadeSize = Math.max(4, Math.min(10, width * .018));
  for (const [x0, y0, x1, y1] of [[width - fadeSize, 0, width, 0], [0, height - fadeSize, 0, height]]) {
    const fade = ctx.createLinearGradient(x0, y0, x1, y1);
    fade.addColorStop(0, '#fff'); fade.addColorStop(1, '#fff0');
    ctx.fillStyle = fade; ctx.fillRect(0, 0, width, height);
  }
  ctx.globalCompositeOperation = 'source-over';
  // Active playback paints the hand at its exact new contact in stepTick.
  // A second independent hand loop would redraw the same full canvas again.
  if (!stepPlayer?.playing) view.frame = requestAnimationFrame(paintHand);
}

/* ---------------- dansk oplæsning ---------------- */
// Genbrug samme element: Safari knytter tilladelsen til det element, barnet
// starter med lydknappen. Blokeret tale kan kun genstartes fra lydknappen.
const voiceAudio = new Audio();
voiceAudio.preload = 'auto';
voiceAudio.setAttribute('playsinline', '');
let voiceUnlocked = false, voiceRequest = null;
let voiceSource = '', voiceVersion = 0, phraseFiles = {};
fetch('voice/index.json?v=1793715603').then(r => r.ok ? r.json() : {}).then(index => { phraseFiles = index; }).catch(() => {});

function phraseFile(text) {
  // Identisk med slug() i tools/build_voice.py. Virker også før index er hentet.
  const slug = text.toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'oe').normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return phraseFiles[text] || `voice/phrase_${slug}.m4a`;
}
function prepareVoice(src) {
  src = voiceFile(src);
  if (voiceSource === src && !voiceAudio.error) return;
  voiceSource = src;
  voiceAudio.src = src;
  voiceAudio.load();
}
// Some Android builds support MP3 but have no AAC decoder.
function voiceFile(src) {
  if (!/\.(m4a|mp3)(\?|$)/.test(src)) return src;
  const aac = voiceAudio.canPlayType?.('audio/mp4; codecs="mp4a.40.2"');
  const mp3 = voiceAudio.canPlayType?.('audio/mpeg');
  return src.replace(/\.(m4a|mp3)(?=\?|$)/, aac || !mp3 ? '.m4a' : '.mp3') + (src.includes('?') ? '' : '?v=1793715603');
}
function validVoice(request) {
  return voiceRequest === request && current === request.screen && !document.hidden;
}
function voiceEnded(request) {
  if (!validVoice(request)) return;
  // Et allerede kølagt ended-event kan ankomme efter et tryk på pause.
  if (request.paused) { request.ended = true; return; }
  request.onComplete?.(); voiceRequest = null;

}
function cancelStepSpeech() {
  voiceVersion++;
  voiceRequest = null;
  voiceAudio.onended = voiceAudio.onerror = null;
  voiceAudio.pause();
  try { voiceAudio.currentTime = 0; } catch {}
  try { window.speechSynthesis?.cancel(); } catch {}
}
function fallbackVoice(request) {
  if (!validVoice(request) || request.fallback) return;
  request.fallback = true; request.pending = false;
  voiceAudio.pause();
  if (request.paused) return;
  speakFallback(request);
}
function speakFallback(request) {
  try {
    const synth = window.speechSynthesis;
    if (!synth || !validVoice(request)) return;
    synth.cancel();
    synth.resume();
    const utterance = new SpeechSynthesisUtterance(request.text.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').trim());
    utterance.lang = 'da-DK'; utterance.rate = 0.9;
    const voice = synth.getVoices().find(v => /^da([-_]|$)/i.test(v.lang));
    if (voice) utterance.voice = voice;
    utterance.onend = () => voiceEnded(request);
    utterance.onerror = () => { if (validVoice(request)) { voiceRequest = null; } };
    request.utterance = utterance;
    synth.speak(utterance);
  } catch {}
}
function playVoice(request) {
  if (!validVoice(request) || request.paused || request.fallback) return;
  request.pending = false;
  const failed = error => {
    if (!validVoice(request)) return;
    if (['NotAllowedError','AbortError'].includes(error.name)) {
      $('#voiceStatus').hidden = false; $('#voiceStatus').textContent = 'Tryk for at høre';
      // En afspilningsblokering er ikke en manglende fil: prøv ved næste tryk.
      request.pending = true; voiceUnlocked = false;
      request.onComplete?.();
    } else fallbackVoice(request);
  };
  try {
    const playing = voiceAudio.play();
    if (playing) playing.then(() => {
      if (!validVoice(request)) return;
      voiceUnlocked = true; $('#voiceStatus').hidden = true;
      if (request.paused) voiceAudio.pause();
    }).catch(failed);
  } catch (error) { failed(error); }
}
function retryVoice() {
  if (voiceRequest?.paused && !voiceRequest.pending) { resumeStepSpeech(); return; }
  if (voiceRequest?.pending) {
    // A copy pause may have happened while autoplay was blocked. This labelled
    // tap explicitly asks for narration without advancing the drawing.
    voiceRequest.paused = false; playVoice(voiceRequest);
  } else readStepAloud();
}
// Unrelated gestures never prime or start narration.
function readAloud(text, src) {
  cancelStepSpeech();
  if (document.hidden) return;
  $('#voiceStatus').hidden=true;
  const request = voiceRequest = { text, screen: current, paused: false, pending: false, fallback: false };
  voiceAudio.onended = () => voiceEnded(request);
  // Uneksisterende, utilgængelig eller ikke-understøttet lyd bruger enhedens stemme.
  voiceAudio.onerror = () => fallbackVoice(request);
  prepareVoice(src);
  if (voiceAudio.error) fallbackVoice(request);
  else playVoice(request);
}
function readStepAloud() {
  if (techniqueSession) { readAloud(techniqueSession.technique.text, phraseFile(techniqueSession.technique.text)); return; }
  if (L && current === 'lesson') { const g = stepPlayer?.groups?.[stepPlayer.groupAt]; if (g?.spokenText) readSegment(g); else readAloud(L.steps[step], `${L.dir}voice${step+1}.m4a`); }
}
function pauseStepSpeech() {
  if (!voiceRequest) return;
  voiceRequest.paused = true;
  voiceAudio.pause();
  try { if (voiceRequest.fallback) window.speechSynthesis?.pause(); } catch {}
}
function resumeStepSpeech() {
  const request = voiceRequest;
  if (!request?.paused || !validVoice(request)) return;
  request.paused = false;
  if (request.ended) { voiceEnded(request); return; }
  if (request.fallback) {
    if (!request.utterance) speakFallback(request);
    else try { window.speechSynthesis?.resume(); } catch {}
  } else playVoice(request);
}

function setLessonPlaybackDefaults() {
  const beginner = readLocal('ts_support') !== 'self';
  const savedSpeed = readLocal('ts_step_speed');
  stepSpeed = stepSpeeds.includes(savedSpeed) ? savedSpeed : beginner ? 0.75 : 1;
  waitForMe = readLocal('ts_wait_for_me') === true;
  $('#waitForMe').checked = waitForMe;
}

/* ---------------- blyant og teknikker ---------------- */
// Rene tekster deles med den lokale lydbuilder.
const GUIDANCE_TIPS = {
  construction: 'Tryk helt let – det er en hjælpelinje',
  contour: 'Tryk lidt hårdere på omridset',
  light: 'Tryk let og lad blyanten glide roligt',
  hard: 'Gør feltet mørkere med flere rolige lag',
  fill: 'Fyld øjet med små cirkler og flere lette lag',
  fillDark: 'Byg mørket op med små cirkler i flere lag',
  circles: 'Fyld ud med små cirkler',
  fur: 'Korte hurtige streger i pelsens retning',
  feather: 'Korte hurtige streger i fjerenes retning',
  shading: 'Læg blyanten skråt og skyg blødt',
  hatch: 'Tegn parallelle streger tæt sammen',
  cross: 'Tegn streger på kryds for mørkere skygge',
  detail: 'Tegn de små detaljer stille og roligt',
  offlineDownload: 'Lektionen kunne ikke gemmes endnu. Prøv igen, når der er internet.',
};
const TECHNIQUES = [
  { id: 'construction', icon: '🪶', name: 'Hjælpelinjer', text: 'Tryk let og tegn simple former. De hjælper dig med at finde plads til hoved og krop. Du kan viske dem væk bagefter.' },
  { id: 'contour', icon: '✏️', name: 'Omrids', text: 'Følg kanten med en rolig, sammenhængende streg. Lad hånden glide langsomt, og løft blyanten, når du har brug for en pause.' },
  { id: 'fill', icon: '⚫', name: 'Detaljer', text: 'Tegn øjne og næse med små bevægelser. Fyld de mørke felter med små cirkler. Tryk lidt mere, når feltet skal være mørkt.' },
  { id: 'fur', icon: '🪶', name: 'Pelsstreger/fjer', text: 'Tegn korte streger i hårets eller fjerenes retning. Løft blyanten mellem stregerne, og lad lidt hvidt papir være imellem dem.' },
  { id: 'hatch', icon: '▨', name: 'Skravering', text: 'Tegn parallelle streger tæt sammen. Hold dem i samme retning. Flere streger tæt ved hinanden gør skyggen mørkere.' },
  { id: 'cross', icon: '▩', name: 'Krydsskravering', text: 'Lav først en række parallelle streger. Tegn så et nyt lag på kryds af dem. Nu bliver skyggen mørkere.' },
  { id: 'shading', icon: '🌗', name: 'Blød skygge', text: 'Læg blyanten skråt, og brug siden af spidsen. Tryk let med små cirkelbevægelser. Byg skyggen langsomt op, så den bliver blød.' },
  { id: 'highlight', icon: '✨', name: 'Glanspunkt', text: 'Lad et lille hvidt felt være i øjet. Tegn mørkt rundt om det. Så ser øjet blankt og levende ud.' },
  { id: 'eraser', icon: '🧽', name: 'Viskelæder', text: 'Visk forsigtigt hjælpelinjerne væk, når omridset er klar. Du kan også lave lyse striber i skyggen. Børst krummerne væk med hånden.' },
];
let techniqueSession = null, techniqueFrame = 0, techniqueQueue = [], techniqueAfter = null;
let techniqueFocus = null;

function inkSample(image, size = 1024) {
  const canvas = playerCanvas(size), ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size); ctx.drawImage(image, 0, 0, size, size);
  const rgba = ctx.getImageData(0, 0, size, size).data, ink = new Float32Array(size * size);
  let bounds = null;
  for (let i = 0; i < ink.length; i++) {
    ink[i] = 1 - (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 765;
    if (ink[i] > .12) {
      const x = i % size, y = Math.floor(i / size);
      if (!bounds) bounds = { x0: x, y0: y, x1: x, y1: y };
      else { bounds.x0 = Math.min(bounds.x0, x); bounds.y0 = Math.min(bounds.y0, y); bounds.x1 = Math.max(bounds.x1, x); bounds.y1 = Math.max(bounds.y1, y); }
    }
  }
  return { ink, size, bounds };
}
function inkAt(sample, x, y) {
  const n = sample.size;
  return sample.ink[Math.max(0, Math.min(n - 1, Math.round(y))) * n + Math.max(0, Math.min(n - 1, Math.round(x)))];
}
function strokeBounds(s) {
  let x0 = 1024, y0 = 1024, x1 = 0, y1 = 0;
  for (let i = 0; i < s.points.length; i += 2) {
    x0 = Math.min(x0, s.points[i]); y0 = Math.min(y0, s.points[i + 1]);
    x1 = Math.max(x1, s.points[i]); y1 = Math.max(y1, s.points[i + 1]);
  }
  const pad = s.w / 2;
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}
function joinBounds(a, b) {
  if (!a) return { ...b };
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}
function dominant(items, field) {
  const weights = {};
  for (const s of items) weights[s[field]] = (weights[s[field]] || 0) + Math.max(8, s.length);
  return Object.keys(weights).sort((a, b) => weights[b] - weights[a])[0];
}
function analyseStrokes(strokes, image, previous, text) {
  const sample = inkSample(image), words = text.toLowerCase();
  const texture = /pels|pelshår|hår|fjer(?!n)|bark|struktur/.test(words), shade = /skyg|skrav|blyantsstrøg/.test(words);
  const filledStep = /mørk|pupil|fyld|farv/.test(words) && /øje|øjn|næse/.test(words) && !shade && !texture;
  for (const s of strokes) {
    s.bounds = strokeBounds(s);
    const a = pointOnStroke(s, 0), b = pointOnStroke(s, s.length);
    s.angle = Math.atan2(b.y - a.y, b.x - a.x);
    s.smooth = s.length / Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) < 2.4;
    s.straight = s.length > 2 && s.length / Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) < 1.18;
    let darkness = 0, width = 0;
    const count = Math.min(72, Math.max(4, Math.ceil(s.length / 8)));
    for (let j = 0; j < count; j++) {
      const p = pointOnStroke(s, s.length * (j + .5) / count), q = pointOnStroke(s, Math.min(s.length, s.length * (j + .5) / count + 3));
      const angle = Math.atan2(q.y - p.y, q.x - p.x), nx = -Math.sin(angle), ny = Math.cos(angle);
      let centre = 0;
      // Smal stribe langs midten tåler JPEG og små forskydninger.
      for (let d = -2; d <= 2; d++) centre = Math.max(centre, inkAt(sample, p.x + nx * d, p.y + ny * d));
      darkness += centre;
      const threshold = Math.max(.07, centre * .42), radius = Math.min(40, Math.max(10, s.w * 1.5));
      let measured = 1;
      for (const sign of [-1, 1]) for (let d = 1; d <= radius; d++) {
        if (inkAt(sample, p.x + nx * d * sign, p.y + ny * d * sign) < threshold) break;
        measured++;
      }
      width += measured;
    }
    s.darkness = darkness / count; s.inkWidth = width / count;
    s.pressure = /hjælpe|grundform|let|lys|skyg/.test(words) ? 'let' : 'mellem';
    const span = Math.max(s.bounds.x1 - s.bounds.x0, s.bounds.y1 - s.bounds.y0);
    s.type = (filledStep && span < 100) || (span < 42 && (s.length < 65 || s.length > span * 2.5) && s.pressure === 'hårdt') ? 'fill' :
      shade && s.length < 200 ? 'shading' : texture && !shade && s.length < 130 ? 'fur' :
      (s.pressure !== 'hårdt' && /hjælpe|grundform/.test(words) && !/visk|fjern/.test(words)) ||
        (s.pressure === 'let' && /simple former|cirkel|oval|trekant/.test(words)) ? 'construction' :
      s.length > 85 && s.smooth ? 'contour' : 'detail';
  }
  // Lokale nabostreger afslører parallelle og krydsende strøg.
  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i];
    if (s.length > 180 || !s.straight || s.type === 'fill' || s.type === 'fur' || s.type === 'construction') continue;
    let parallel = 0, crossing = 0;
    for (let j = Math.max(0, i - 18); j < Math.min(strokes.length, i + 19); j++) {
      const t = strokes[j];
      if (t === s || t.length > 180 || !t.straight || Math.hypot(s.points[0] - t.points[0], s.points[1] - t.points[1]) > 95) continue;
      const alignment = Math.abs(Math.cos(s.angle - t.angle));
      if (alignment > .91) parallel++; else if (alignment < .65) crossing++;
    }
    if (shade || !texture) {
      if (parallel >= 3 && crossing >= 3) s.type = 'cross';
      else if (parallel >= 4 && s.smooth) s.type = 'hatch';
    }
  }
  let erased = false;
  if (previous) {
    const old = inkSample(previous, 512), fresh = inkSample(image, 512);
    let removed = 0, before = 0;
    for (let y = 2; y < 510; y++) for (let x = 2; x < 510; x++) {
      const dark = inkAt(old, x, y);
      if (dark < .05) continue;
      before++;
      let remains = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) remains = Math.max(remains, inkAt(fresh, x + dx, y + dy));
      if (dark - remains > .055 && remains < dark * .55) removed++;
    }
    erased = removed > Math.max(24, before * .06);
  }
  const ids = new Set();
  if (/visk|fjern.*hjælpe/.test(words) || erased) ids.add('eraser');
  if (/hjælpe|grundform/.test(words) && !/visk|fjern/.test(words)) ids.add('construction');
  if (/hvid|lys(?:glimt|punkt)|glans/.test(words) && /øje|øjn|pupil/.test(words)) ids.add('highlight');
  if (texture && !shade) ids.add('fur');
  if (/kryds.*skrav|skrav.*kryds/.test(words)) ids.add('cross');
  else if (/skrav/.test(words)) ids.add('hatch');
  if (shade && !/skrav/.test(words)) ids.add('shading');
  if (/øje|øjn|pupil|næse|mund|tæer|tåstreger/.test(words)) ids.add('fill');
  const types = new Map();
  for (const s of strokes) types.set(s.type, (types.get(s.type) || 0) + Math.max(8, s.length));
  const total = [...types.values()].reduce((a, b) => a + b, 0);
  for (const [type, weight] of types) if (weight > total * .16 && type !== 'detail') ids.add(type);
  if (!ids.size) ids.add('contour');
  const plan = L?.stepMeta?.[step];
  if (plan) { for (const s of strokes) { s.pressure = plan.pressure || 'let'; s.type = plan.skillIds?.[0] || 'contour'; } ids.clear(); for (const id of plan.skillIds || ['contour']) ids.add(id); }
  return { pressure: dominant(strokes, 'pressure') || 'mellem', techniques: [...ids], erased, drawingBounds: sample.bounds };
}

function guidanceGroups(p) {
  let group = null;
  const groups = [];
  for (const s of p.strokes) {
    const joint = joinBounds(group?.bounds, s.bounds);
    const small = s.length < 130;
    const far = group && Math.hypot((s.bounds.x0 + s.bounds.x1 - group.bounds.x0 - group.bounds.x1) / 2,
      (s.bounds.y0 + s.bounds.y1 - group.bounds.y0 - group.bounds.y1) / 2) > 190;
    if (!group || far || (small && group.items.length > 2 && Math.max(joint.x1 - joint.x0, joint.y1 - joint.y0) > 320) ||
      (group.items.length && (s.type !== group.items[0].type || s.pressure !== group.items[0].pressure)) || s.preview - group.start > 6500) {
      group = { start: s.preview, end: s.end, bounds: { ...s.bounds }, items: [] }; groups.push(group);
    }
    group.items.push(s); group.bounds = joinBounds(group.bounds, s.bounds); group.end = s.end;
  }
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    g.end = groups[i + 1]?.start ?? p.duration;
    g.pressure = dominant(g.items, 'pressure'); g.type = dominant(g.items, 'type');
    g.tip = tipFor(g, L?.steps[step] || '');
  }
  return groups;
}
function tipFor(g, text) {
  if (g.instruction) return g.instruction;
  const plan = L?.stepMeta?.[step]; if (plan?.tip) return mode === 'paper' ? plan.tip : (plan.screenTip || plan.tip);
  if (g.type === 'fill') return g.pressure === 'hårdt' ? (/øje|øjn|pupil/.test(text) ? GUIDANCE_TIPS.fill : GUIDANCE_TIPS.fillDark) : GUIDANCE_TIPS.circles;
  if (g.type === 'fur') return /fjer/.test(text) ? GUIDANCE_TIPS.feather : GUIDANCE_TIPS.fur;
  if (g.type === 'hatch' && /skyg/.test(text) && !/skrav/.test(text)) return GUIDANCE_TIPS.shading;
  if (['construction', 'shading', 'hatch', 'cross'].includes(g.type)) return GUIDANCE_TIPS[g.type];
  if (g.pressure === 'let') return GUIDANCE_TIPS.light;
  if (g.pressure === 'hårdt') return GUIDANCE_TIPS.hard;
  return GUIDANCE_TIPS[g.type] || GUIDANCE_TIPS.detail;
}

function showStepGuidance(p, image, previous) {
  if (p.kind === 'static') p.groups=[];
  else if (p.kind !== 'strokes') {
    // Samme analyse på korte dele af reservesporet, hvis stregfilen mangler.
    const strokes = [];
    for (let i = 0; i < p.count; i += 12) {
      const points = [], lengths = [];
      let length = 0;
      for (let j = i; j < Math.min(p.count, i + 12); j++) {
        const at = p.order[j], x = p.x[at] * 4, y = p.y[at] * 4;
        if (points.length) length += Math.hypot(x - points[points.length - 2], y - points[points.length - 1]);
        points.push(x, y); lengths.push(length);
      }
      if (points.length === 2) { points.push(...points); lengths.push(0); }
      strokes.push({ points, lengths, length, w: p.cell * 4, preview: i ? p.times[i - 1] : 0,
        start: p.times[i], end: p.times[Math.min(p.count - 1, i + 11)] });
    }
    p.guideStrokes = strokes;
    p.analysis = analyseStrokes(strokes, image, previous, L.steps[step]);
    p.groups = guidanceGroups({ ...p, strokes });
  } else p.groups = p.segments?.length ? p.segments : guidanceGroups(p);
  p.groupAt = -1; p.tipChanged = -Infinity; p.tipKey = ''; p.cameraChanged = -Infinity;
  $('#pressureBadge').textContent = '';
  $('#lightSource').hidden = !p.analysis.techniques.some(id => ['shading','hatch','cross','fur','highlight'].includes(id));
  $('#techniqueChips').replaceChildren();
  for (const id of p.analysis.techniques) {
    const t = TECHNIQUES.find(t => t.id === id);
    if (!t) continue;
    const b = document.createElement('button'); b.className = 'technique-chip'; UI.label(b, UI.techniqueIcons[t.id], t.name);
    b.onclick = () => openTechnique(t); $('#techniqueChips').appendChild(b);
  }
  fitStage(); updateGuidance(p, true);
}

function updateGuidance(p, seek = false) {
  if (!p.groups?.length) return;
  const time = p.waiting ? Math.max(0, p.elapsed - .01) : p.elapsed;
  const found=p.groups.findIndex(g=>time<g.end);const at=found<0?p.groups.length-1:found;
  const g = p.groups[at], now = performance.now(), boundary = at !== p.groupAt;
  if (boundary) p.pendingTip = at;
  if (seek || !p.tipKey || (p.pendingTip === at && now - p.tipChanged >= 1500)) {
    const key = g.id || g.pressure + '/' + g.type;
    if (p.tipKey !== key || seek) {
      $('#liveTip').textContent = mode!=='paper'?(L?.stepMeta?.[step]?.screenTip||g.tip):g.tip;
      p.tipChanged = now;
      p.tipKey = key;
    }
    p.pendingTip = null;
  }
  // Måleren følger altid den aktuelle streg; teksten får tid til at blive læst.
  const s = g;
  document.querySelectorAll('[data-pressure]').forEach(e => {
    const active = e.dataset.pressure === s.pressure;
    if(e.classList.contains('on')!==active)e.classList.toggle('on', active); setAttr(e, 'aria-current', active ? 'true' : 'false');
    if(e.dataset.pressure==='let'&&e.lastChild?.nodeType===3){const text=g.type==='construction'?' Let hjælpelinje':' Let';if(e.lastChild.nodeValue!==text)e.lastChild.nodeValue=text;}
  });
  updateCameraTarget(p, g, seek);
  p.groupAt = at;
}

const camera = { x: .5, y: .5, z: 1, target: { x: .5, y: .5, z: 1 }, from: null, started: 0, frame: 0, tip: null };
function setCamera(target, immediate = false) {
  if (mode === 'trace' || !detailZoom) { target = { x:.5,y:.5,z:1 }; immediate = true; }
  if (!gentleCamera) immediate = true;
  if (!immediate && ['x', 'y', 'z'].every(k => Math.abs(camera.target[k] - target[k]) < .001)) return;
  camera.from = { x: camera.x, y: camera.y, z: camera.z }; camera.target = target;
  camera.started = performance.now();
  if (immediate || reducedMotion.matches) { Object.assign(camera, target); camera.from = null; }
  if (!camera.frame) camera.frame = requestAnimationFrame(paintCamera);
}
function paintCamera(now) {
  camera.frame = 0;
  const t = Math.min(1, Math.max(0, (now - camera.started) / 300)), ease = t * t * (3 - 2 * t);
  if (camera.from) for (const key of ['x', 'y', 'z']) camera[key] = camera.from[key] + (camera.target[key] - camera.from[key]) * ease;
  const half = .5 / camera.z;
  camera.x = Math.max(half, Math.min(1 - half, camera.x)); camera.y = Math.max(half, Math.min(1 - half, camera.y));
  $('#guideCamera').style.transform = `translate(${(0.5 - camera.x * camera.z) * 100}%, ${(0.5 - camera.y * camera.z) * 100}%) scale(${camera.z})`;
  $('#zoomIndicator').hidden = camera.z < 1.05 || mode === 'trace';
  paintOverview();
  if (handView?.target && !handView.hand.hidden && !stepPlayer?.playing) paintHand(now);
  if (t >= 1) camera.from = null;
  if (!document.hidden && camera.from) camera.frame = requestAnimationFrame(paintCamera);
}
function updateCameraTarget(p, group, seek = false) {
  if (mode === 'trace' || reducedMotion.matches || !detailZoom || p.cameraOverview || p.unreliableFocus || step === 0) { setCamera({x:.5,y:.5,z:1}); return; }
  if (!seek && p.focusGroup === group.id) return;
  const b = group.focusBounds || group.bounds, width = b.x1-b.x0, height=b.y1-b.y0;
  const z = Math.min(1.8, 1024/(Math.max(400,width,height)+150)), half=.5/z;
  setCamera({x:Math.max(half,Math.min(1-half,(b.x0+b.x1)/2048)),y:Math.max(half,Math.min(1-half,(b.y0+b.y1)/2048)),z});p.focusGroup=group.id;
}
function paintOverview() {
  const c=$('#cameraOverview'); if (!c) return; c.hidden=camera.z<1.05 || mode==='trace'; if(c.hidden||!stepPlayer)return;
  const ctx=c.getContext('2d');ctx.clearRect(0,0,88,88);ctx.drawImage(stepPlayer.image,0,0,88,88);ctx.strokeStyle=ACCENT;ctx.lineWidth=2;ctx.strokeRect((camera.x-.5/camera.z)*88,(camera.y-.5/camera.z)*88,88/camera.z,88/camera.z);
}

function markTechnique(id) { const seen = objectMap(readLocal('ts_techniques_global')); seen[id] = true; writeLocal('ts_techniques_global', seen); }

function openTechnique(technique, automatic = false) {
  const playing = !!stepPlayer?.playing;
  if (!techniqueSession && !techniqueFocus) techniqueFocus = document.activeElement;
  if (current === 'lesson') pauseStep();
  cancelStepSpeech(); loadHand();
  techniqueSession = { technique, playing, automatic, started: performance.now() };
  UI.label($('#techniqueTitle'), UI.techniqueIcons[technique.id], technique.name);
  $('#techniqueExplanation').textContent = technique.text;
  $('#techniqueDemo').setAttribute('aria-label', 'Eksempel: ' + technique.name);
  UI.label($('#techniqueContinue'), current === 'lesson' ? 'play' : 'back', current === 'lesson' ? 'Fortsæt til tegningen' : 'Tilbage til teknikker');
  UI.label($('#practiceHint'), 'pencil', UI.plain(practiceFor(technique.id)));
  $('#practiceComplete').disabled = false; UI.label($('#practiceComplete'), 'star', latestWallet().claims['practice:'+technique.id+':'+today()]?'Øv igen · Jeg har prøvet':'Jeg har øvet mig · +1');
  $('#techniqueModal').hidden = false; modalInert(true); $('#techniqueClose').focus({ preventScroll: true });
  cancelAnimationFrame(techniqueFrame); techniqueFrame = requestAnimationFrame(drawTechniqueDemo);
}
function closeTechnique(proceed = true) {
  const session = techniqueSession;
  if (!session) return;
  pencilSound.stop(); cancelStepSpeech(); cancelAnimationFrame(techniqueFrame); techniqueFrame = 0;
  techniqueSession = null; $('#techniqueModal').hidden = true; modalInert(false);
  if (!proceed) { techniqueQueue = []; techniqueAfter = null; techniqueFocus = null; return; }
  if (techniqueQueue.length) { openTechnique(techniqueQueue.shift(), true); return; }
  markTechnique(session.technique.id);
  const after = techniqueAfter; techniqueAfter = null;
  const focus = techniqueFocus?.isConnected && techniqueFocus.closest('.screen')?.classList.contains('on') ? techniqueFocus :
    current === 'lesson' ? $('#readStepBtn') : $('#techniquesBack');
  focus.focus({ preventScroll: true });
  techniqueFocus = null;
  if (after) after();
  else if (session.playing && current === 'lesson') playStep();
}
function introduceTechniques(p, start) {
  // Technique cards remain available from Help; entering a step never gates it.
  techniqueQueue=[]; start();
}

function drawTechniqueDemo(now){
  if(!techniqueSession||document.hidden)return;const progress=reducedMotion.matches?1:Math.min(1,(now-techniqueSession.started)/6500);
  TechniqueDemo.draw($('#techniqueDemo'),techniqueSession.technique.id,progress);
  if(progress<1)techniqueFrame=requestAnimationFrame(drawTechniqueDemo);else{pencilSound.stop();markTechnique(techniqueSession.technique.id);}
}
$('#techniqueReplay').onclick=()=>{if(!techniqueSession)return;techniqueSession.started=performance.now();techniqueFrame=requestAnimationFrame(drawTechniqueDemo);};
$('#techniqueProject').onclick=()=>{const id=techniqueSession?.technique.id,lesson=LESSONS.find(l=>lessonUnlocked(l)&&lessonSkills(l).includes(id)&&!store.get().done[l.id])||LESSONS.find(l=>lessonUnlocked(l)&&lessonSkills(l).includes(id));closeTechnique(false);if(lesson)openLesson(lesson);};
$('#practiceRead').onclick=()=>{const text=practiceFor(techniqueSession?.technique.id);if(text)readAloud(text,phraseFile(text));};

function updateLessonHelpBounds() {
  if (!document.body.classList.contains('lesson-help-open')) return;
  const top = $('#stage').getBoundingClientRect().top;
  const bottom = $('#videoControls').getBoundingClientRect().top;
  document.body.style.setProperty('--lesson-help-top', `${Math.max(0,top)}px`);
  document.body.style.setProperty('--lesson-help-bottom', `${Math.max(0,innerHeight-bottom)}px`);
}
function modalInert(open) {
  const lessonHelp = open && current === 'lesson' && (!$('#techniqueModal').hidden || !$('#warmupModal').hidden);
  document.body.classList.toggle('lesson-help-open', lessonHelp);
  if (lessonHelp) { $('#lesson .playback-details').open = false; fitStage(); updateLessonHelpBounds(); }
  document.querySelectorAll('.screen, #tabbar').forEach(e => { e.inert = open && !(lessonHelp && e.id === 'lesson'); });
}
$('#techniqueClose').onclick = $('#techniqueContinue').onclick = () => closeTechnique();
$('#practiceComplete').onclick = () => {
  if (!techniqueSession) return;
  const id = techniqueSession.technique.id;
  const count = (readLocal('ts_practice_' + id) || 0) + 1;
  awardStars(`practice:${id}:${today()}`, 1, 'Du prøvede en teknik'); writeLocal('ts_practice_' + id, count); markTechnique(id); markActive(); $('#practiceComplete').disabled = true; $('#practiceComplete').textContent = 'Du gav dig tid til at øve ✓'; renderLearningPath();
};
$('#techniquesBtn').onclick = () => show('techniques');
$('#techniquesBack').onclick = () => show('home');
for (const technique of TECHNIQUES) {
  const button = document.createElement('button'); button.className = 'technique-item';
  const name = document.createElement('strong'); UI.label(name, UI.techniqueIcons[technique.id], technique.name);
  const text = document.createElement('span'); text.textContent = technique.text.split('. ')[0] + '.';
  button.append(name, text); button.onclick = () => openTechnique(technique); $('#techniqueList').appendChild(button);
}
let settingsFocus = null;
function closeSettings() {
  $('#settingsModal').hidden = true; modalInert(false); settingsFocus?.focus({ preventScroll: true });
}
$('#settingsBtn').onclick = () => {
  settingsFocus = document.activeElement;
  $('#supportMode').value = readLocal('ts_support') === 'self' ? 'self' : 'guided';
  $('#settingHelpers').checked = showHelpers;
  $('#settingAwake').checked = keepScreenOn; $('#settingZoom').checked = detailZoom;
  $('#settingPencilSound').checked = pencilSound.enabled; $('#settingCamera').checked = gentleCamera;
  $('#settingWait').checked = waitForMe; $('#settingSpeed').value = stepSpeed;
  $('#settingsModal').hidden = false; modalInert(true); $('#settingsClose').focus({ preventScroll: true });
};
$('#settingsClose').onclick = closeSettings;
$('#settingAwake').onchange = e => {
  keepScreenOn = e.target.checked; writeLocal('ts_keep_awake', keepScreenOn);
  if (keepScreenOn) keepLessonAwake(true); else stopLessonAwake();
};
function updateCameraControl() {
  const label=stepPlayer?.cameraOverview?'Tilbage til detaljen':'Hele arket';
  setText($('#cameraReset'),label);setAttr($('#cameraReset'),'aria-label',label);
}
$('#cameraReset').onclick=()=>{if(!stepPlayer)return;stepPlayer.cameraOverview=!stepPlayer.cameraOverview;updateCameraControl();stepPlayer.focusGroup=null;updateGuidance(stepPlayer,true);};
$('#settingPencilSound').onchange = e => { pencilSound.enabled = e.target.checked; writeLocal('ts_pencil_sound', pencilSound.enabled); if (!pencilSound.enabled) pencilSound.stop(); };
$('#settingCamera').onchange = e => { gentleCamera = e.target.checked; writeLocal('ts_gentle_camera', gentleCamera); if (stepPlayer) updateGuidance(stepPlayer, true); };
$('#settingZoom').onchange = e => {
  detailZoom = e.target.checked; writeLocal('ts_detail_zoom', detailZoom);
  if (stepPlayer) updateGuidance(stepPlayer, true);
};
$('#settingWait').onchange = e => setWaitForMe(e.target.checked);
$('#settingSpeed').onchange = e => { stepSpeed = Number(e.target.value); writeLocal('ts_step_speed', stepSpeed); $('#stepSpeed').value = stepSpeed; };
document.addEventListener('keydown', e => {
  const modal = [...document.querySelectorAll('.modal')].find(m => !m.hidden);
  if (!modal) return;
  if (e.key === 'Escape') { e.preventDefault(); if(modal.id==='scanModal')ScanFlow.close();else if (modal.id === 'stickerPhotoModal') StickerBook.closePhoto(); else if (modal.id === 'modeModal') closeModePicker(); else if (modal.id === 'warmupModal') closeWarmup(); else if (modal.id === 'unlockModal') closeUnlock(); else if (techniqueSession) closeTechnique(); else closeSettings(); }
  if (e.key === 'Tab') {
    const elements = [...modal.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')].filter(e => !e.disabled && !e.hidden && !e.closest('[hidden]')), first = elements[0], last = elements[elements.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// Cosinus-rampen giver blød start/stop og konstant fart midt på stregen.
function strokeEase(t) {
  t = Math.max(0, Math.min(1, t));
  const ramp = 0.12;
  if (t < ramp) return (t / 2 - ramp * Math.sin(Math.PI * t / ramp) / (2 * Math.PI)) / (1 - ramp);
  if (t > 1 - ramp) return 1 - strokeEase(1 - t);
  return (t - ramp / 2) / (1 - ramp);
}

function prepareStrokes(data,image,previous,text){
  if(!validStrokePlan(data))return null;
  if(data.v===3){
    const plan=PlaybackTiming.batches(data),meta=L?.stepMeta?.[step];
    // Pixel differences can contain incidental erasures across the whole figure.
    // They cannot authorise a child to erase or identify a trustworthy close-up.
    const unreliableFocus=!!plan.analysis.erased && meta?.action!=='erase';
    const tip=meta?.tip||text;
    if(meta) for(const g of plan.segments){
      g.tip=g.instruction=g.spokenText=tip; g.audioSrc=undefined;
      if(unreliableFocus){g.type=meta.skillIds?.[0]||'contour';g.pressure=meta.pressure||'let';}
    }
    return {...plan,kind:'strokes',batchPlan:true,unreliableFocus,atlasImages:data.atlasImages};
  }
  const meta=L?.stepMeta?.[step],plan=PlaybackTiming.raw(data,meta,text);
  // Incidental pixel removals cannot prescribe an eraser exercise. Apply the
  // same metadata rule to raw plans as compact plans.
  const unreliableFocus=!!plan.teachingGuide || (plan.analysis.erased && meta?.action!=='erase');
  if(meta)for(const g of plan.segments){
    // Generated raster regions describe repairs as well as the new feature.
    // Only authored guidance can tell the child where and what to draw.
    g.tip=g.instruction=meta.tip||text;g.spokenText=text;
    g.audioSrc=`${L.dir}voice${step+1}.m4a`;
    if(meta.action!=='erase'&&!/visk/i.test(text)&&g.items?.some(s=>s.action==='erase')){
      g.type=meta?.skillIds?.[0]||'contour';
    }
  }
  return {...plan,batchPlan:!!plan.teachingGuide,unreliableFocus};
}

function pointOnStroke(s, distance) {
  distance = Math.max(0, Math.min(s.length, distance));
  let lo = 1, hi = s.lengths.length - 1;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (s.lengths[mid] < distance) lo = mid + 1; else hi = mid; }
  const i = lo, before = s.lengths[i - 1], span = s.lengths[i] - before;
  const t = span ? (distance - before) / span : 0;
  return { x: s.points[i * 2 - 2] + (s.points[i * 2] - s.points[i * 2 - 2]) * t,
    y: s.points[i * 2 - 1] + (s.points[i * 2 + 1] - s.points[i * 2 - 1]) * t, i };
}

function strokeDistance(s, elapsed) { return s.length * strokeEase((elapsed - s.start) / s.drawDuration); }
function brushStroke(ctx, s, from, to, width) {
  const a = pointOnStroke(s, from), b = pointOnStroke(s, to);
  ctx.lineWidth = width; ctx.lineCap = ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(a.x, a.y);
  for (let i = a.i; i < b.i; i++) ctx.lineTo(s.points[i * 2], s.points[i * 2 + 1]);
  ctx.lineTo(b.x, b.y); ctx.stroke();
  if (to === from) { ctx.beginPath(); ctx.arc(a.x, a.y, width / 2, 0, Math.PI * 2); ctx.fill(); }
}

function playerCanvas(size) {
  const c = document.createElement('canvas'); c.width = c.height = size; return c;
}
function playbackSize() {
  return Math.max(256, Math.min(1024, Math.round(($('#guideWrap').getBoundingClientRect().width || 600) * (window.devicePixelRatio || 1))));
}

// Kun fjernet grafit slettes fra det tidligere lag under viskelæderets spor.
function makeErasePlan(image, previous, outputSize) {
  const n = 256, old = inkSample(previous, n), fresh = inkSample(image, n);
  const removal = playerCanvas(n), ctx = removal.getContext('2d'), pixels = ctx.createImageData(n, n), path = [];
  for (let top = 0; top < n; top += 8) {
    let left = n, right = -1;
    for (let y = top; y < Math.min(n, top + 8); y++) for (let x = 0; x < n; x++) {
      const before = inkAt(old, x, y); if (before < .06) continue;
      let remains = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) remains = Math.max(remains, inkAt(fresh, x + dx, y + dy));
      if (before - remains < .05 || remains > before * .6) continue;
      const at = (y * n + x) * 4; pixels.data[at + 3] = 255;
      left = Math.min(left, x); right = Math.max(right, x);
    }
    if (right >= left) {
      const reverse = path.length % 4 === 2;
      path.push((reverse ? right + 3 : left - 3) * 4, (top + 4) * 4,
        (reverse ? left - 3 : right + 3) * 4, (top + 4) * 4);
    }
  }
  if (!path.length) return null;
  ctx.putImageData(pixels, 0, 0);
  const points = Float32Array.from(path), lengths = new Float32Array(points.length / 2);
  for (let i = 1; i < lengths.length; i++) lengths[i] = lengths[i - 1] + Math.hypot(points[i * 2] - points[i * 2 - 2], points[i * 2 + 1] - points[i * 2 - 1]);
  return { removal, sweep: playerCanvas(outputSize), points, lengths, length: lengths[lengths.length - 1], tip: { x: points[0], y: points[1] } };
}
function paintErasing(p, ctx) {
  const plan = p.erasePlan, size = ctx.canvas.width, sweep = plan.sweep.getContext('2d');
  sweep.globalCompositeOperation = 'source-over'; sweep.clearRect(0, 0, size, size);
  const distance = plan.length * Math.min(1, p.elapsed / 2200);
  sweep.save(); sweep.scale(size / 1024, size / 1024); sweep.strokeStyle = sweep.fillStyle = '#fff';
  brushStroke(sweep, plan, 0, distance, 48); sweep.restore();
  sweep.globalCompositeOperation = 'destination-in'; sweep.drawImage(plan.removal, 0, 0, size, size);
  ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(plan.sweep, 0, 0); ctx.globalCompositeOperation = 'source-over';
  plan.tip = pointOnStroke(plan, distance);
}

function createStrokePlayer(image,previous,prepared){
  const size=playbackSize(),canvas=$('#stepDrawing'),tint=$('#stepHighlight');canvas.width=canvas.height=tint.width=tint.height=size;
  const masks=Array.from({length:prepared.toneLayers},()=>playerCanvas(size).getContext('2d'));
  // The lesson master already contains graphite texture. Preserve its complete
  // pixels; another grain alpha weakens narrow lines on small/high-DPR screens.
  return {kind:'strokes',...prepared,count:prepared.count||prepared.strokes.length,image,previous,ctx:canvas.getContext('2d'),tintCtx:tint.getContext('2d'),maskCtx:playerCanvas(size).getContext('2d'),layers:masks,eraseMask:playerCanvas(size).getContext('2d'),compositeCtx:playerCanvas(size).getContext('2d'),elapsed:0,painted:-1,playing:false,last:0,stopsPassed:new Set(),waiting:false,celebrated:false};
}

function createStaticPlayer(image,previous){const ctx=$('#stepDrawing').getContext('2d');return {kind:'static',image,previous,ctx,count:0,duration:1,elapsed:1,playing:false,waiting:false,stops:[],stopsPassed:new Set(),groups:[],analysis:{pressure:'let',techniques:L?.stepMeta?.[step]?.skillIds||['contour']}};}

function strokeAt(p, time) {
  let lo = 0, hi = p.strokes.length - 1;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (p.strokes[mid].preview <= time) lo = mid; else hi = mid - 1; }
  return lo;
}

function showHandAt(x, y, space, lift = 0, angle = 0, pressure = 'mellem', erasing = false) {
  const view = handOverlay(), hand = view.hand;
  const variant = erasing ? 'erase' : lift > .3 ? 'lift' : pressure === 'hårdt' ? 'press' : 'draw';
  const pose = handVariants.has(variant) ? variant : erasing ? 'eraseFallback' : 'drawFallback';
  const hover = pressure === 'let' ? .35 : pressure === 'hårdt' ? 0 : .15;
  const target = { x: x / space, y: y / space, pose, height: Math.max(lift, hover),
    rotation: reducedMotion.matches ? 0 : Math.max(-10, Math.min(10, angle)) };
  if (hand.hidden || !view.target) {
    view.rotation = target.rotation; view.height = target.height;
    view.weights = { [pose]: 1 }; view.last = performance.now();
  }
  view.target = target; if(hand.dataset.pose!==pose)hand.dataset.pose = pose; setHidden(hand, false);
  // Position is exact; only the wrist and pose blend are eased, never the tip.
  // Missing photographs must not disable the camera, sound or drawing effects.
  paintHand();
  camera.tip = { x: x / space, y: y / space };
  const p = stepPlayer;
  if (p) {
    const time = p.elapsed, prev = p.inkPoint;
    const speed = prev && time > prev.time ? Math.hypot(x / space - prev.x, y / space - prev.y) * 1024 / (time - prev.time) * 1000 * stepSpeed : 0;
    pencilSound.update(p.playing && p.contact ? speed : 0, pressure, erasing);
    p.inkPoint = { x: x / space, y: y / space, time };
    paintGraphiteFX(p, x / space, y / space, lift, pressure, erasing);
  }
}
function paintGraphiteFX(){ $('#graphiteFX').getContext('2d').clearRect(0,0,512,512); }

// Dense plans reveal pre-rendered original masks in narrow, alternating bands.
// Work per frame depends on teaching regions, never on the number of microstrokes.
// Rebuilding these few masks also makes backwards/forwards seeking deterministic.
function paintContourGuide(p){
  p.batchCompleted=undefined;
  const size=p.ctx.canvas.width,scale=size/1024,now=p.elapsed;
  const reveal=p.maskCtx;reveal.clearRect(0,0,size,size);reveal.save();reveal.scale(scale,scale);reveal.strokeStyle=reveal.fillStyle='#fff';
  let st=p.strokes[0];for(const s of p.strokes){if(now<s.preview)break;st=s;if(now>=s.start)brushStroke(reveal,s,0,strokeDistance(s,now),p.guideWidth||s.w+6);}
  reveal.restore();
  // Raster registration/texture corrections settle together after the teaching
  // paths. They never consume the drawing budget or light up detached dashes.
  if(p.teachingGuide&&now>p.guideDuration){
    reveal.globalAlpha=Math.min(1,(now-p.guideDuration)/(p.duration-p.guideDuration));
    reveal.fillRect(0,0,size,size);reveal.globalAlpha=1;
  }
  const comp=p.compositeCtx;comp.globalCompositeOperation='source-over';comp.clearRect(0,0,size,size);comp.drawImage(p.graphiteImage||p.image,0,0,size,size);comp.globalCompositeOperation='destination-in';comp.drawImage(reveal.canvas,0,0);comp.globalCompositeOperation='source-over';
  const ctx=p.ctx;ctx.clearRect(0,0,size,size);ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);if(p.previous)ctx.drawImage(p.graphitePrevious||p.previous,0,0,size,size);ctx.drawImage(comp.canvas,0,0);p.tintCtx.clearRect(0,0,size,size);
  const distance=strokeDistance(st,now);let tip=pointOnStroke(st,distance),lift=0;
  if(now<st.start){const index=p.strokes.indexOf(st),last=p.strokes[index-1];if(last){const from=pointOnStroke(last,last.length),t=Math.max(0,Math.min(1,(now-st.preview)/(st.start-st.preview))),u=t*t*(3-2*t);tip={x:from.x+(tip.x-from.x)*u,y:from.y+(tip.y-from.y)*u};lift=Math.sin(Math.PI*t);}else lift=.7;}
  p.contact=now>=st.start&&now<st.end;p.currentTool=st.tool;
  if(p.playing&&now<p.duration)showHandAt(tip.x,tip.y,1024,lift,0,st.pressure,st.action==='erase');else{setHidden($('#drawingHand'),true);pencilSound.stop();}setHidden($('#strokeArrow'),true);p.painted=now;
}

function paintBatches(p){
  if(p.contourGuide||p.primaryDuration&&p.elapsed<p.primaryDuration){p.batchPaintState=null;return paintContourGuide(p);}
  const segments=p.batchSegments||p.segments;
  const now=p.elapsed,size=p.ctx.canvas.width,scale=size/1024;
  const reset=p.batchCompleted===undefined||now<p.painted||!p.batchPaintState;
  if(!p.batchMaster){p.batchMaster=playerCanvas(size);p.batchMaster.getContext('2d').drawImage(p.graphiteImage||p.image,0,0,size,size);}
  if(p.previous&&!p.batchPrevious){p.batchPrevious=playerCanvas(size);p.batchPrevious.getContext('2d').drawImage(p.graphitePrevious||p.previous,0,0,size,size);}
  const changed=[];
  if(reset){for(const layer of [...p.layers,p.eraseMask])layer.clearRect(0,0,size,size);p.batchCompleted=0;if(p.primaryDuration){const layer=p.layers[0];layer.save();layer.scale(scale,scale);layer.strokeStyle=layer.fillStyle='#fff';for(const s of p.strokes)brushStroke(layer,s,0,s.length,s.w+6);layer.restore();}}
  const fullGroup=g=>{changed.push(g.bounds);const [x,y,w,h]=g.rect,layer=g.action==='erase'?p.eraseMask:p.layers[g.layer];layer.drawImage(p.atlasImages[g.atlas],x,y,w,h,g.bounds.x0*scale,g.bounds.y0*scale,w*scale,h*scale);};
  while(p.batchCompleted<segments.length&&segments[p.batchCompleted].end<=now)fullGroup(segments[p.batchCompleted++]);
  let active=segments[Math.min(p.batchCompleted,segments.length-1)],fraction=1,tip={x:512,y:512},partial=null;
  if(p.batchCompleted<segments.length){const g=active,glide=g===segments[0]?0:Math.min(350,(g.end-g.start)*.4);fraction=Math.max(0,Math.min(1,(now-g.start-glide)/(g.end-g.start-glide)));
  }
  const old=p.batchPaintState,bounds=active.bounds;
  if(!reset){
    const bands=Math.ceil(active.rect[3]/24),from=old?.active===active?Math.floor(old.fraction*bands)*24:0;
    changed.push({x0:bounds.x0,y0:bounds.y0+from,x1:bounds.x1,y1:Math.min(bounds.y1,bounds.y0+(Math.floor(fraction*bands)+1)*24)});
  }
  const dirty=reset?{x0:0,y0:0,x1:1024,y1:1024}:changed.reduce((r,b)=>({x0:Math.min(r.x0,b.x0),y0:Math.min(r.y0,b.y0),x1:Math.max(r.x1,b.x1),y1:Math.max(r.y1,b.y1)}),{x0:1024,y0:1024,x1:0,y1:0});
  // Cover resampling at sweep boundaries; all masks/master pixels are retained.
  const x=Math.max(0,Math.floor(dirty.x0*scale)-2),y=Math.max(0,Math.floor(dirty.y0*scale)-2),right=Math.min(size,Math.ceil(dirty.x1*scale)+2),bottom=Math.min(size,Math.ceil(dirty.y1*scale)+2);
  const clip=ctx=>{ctx.save();ctx.beginPath();ctx.rect(x,y,Math.max(0,right-x),Math.max(0,bottom-y));ctx.clip();};
  if(p.batchCompleted<segments.length){const g=active,b=g.bounds,[ax,ay,w,h]=g.rect;
    partial=p.partialCtx ||= playerCanvas(size).getContext('2d');clip(partial);partial.clearRect(0,0,size,size);partial.drawImage((g.action==='erase'?p.eraseMask:p.layers[g.layer]).canvas,0,0);
    const bands=Math.ceil(h/24),amount=fraction*bands,full=Math.floor(amount),part=amount-full;
    partial.save();partial.scale(scale,scale);
    if(full){const height=Math.min(h,full*24);partial.drawImage(p.atlasImages[g.atlas],ax,ay,w,height,b.x0,b.y0,w,height);}
    if(part&&full<bands){const height=Math.min(24,h-full*24),width=w*part,offset=full%2?w-width:0;partial.drawImage(p.atlasImages[g.atlas],ax+offset,ay+full*24,width,height,b.x0+offset,b.y0+full*24,width,height);}
    partial.restore();partial.restore();
  }
  const b=active.bounds,h=b.y1-b.y0,w=b.x1-b.x0,bands=Math.ceil(h/24),sweep=Math.min(bands-.00001,fraction*bands),row=Math.floor(sweep),part=sweep-row;
  const target={x:b.x0+w*(row%2?1-part:part),y:Math.min(b.y1,b.y0+row*24+12)};
  // Lift and glide to the next area over 350ms, instead of teleporting the hand.
  const index=segments.indexOf(active),previous=segments[index-1],enter=now-active.start;
  let lift=0;
  const glide=previous?Math.min(350,(active.end-active.start)*.4):0;
  if(previous&&enter<glide){const old=previous.bounds,rows=Math.ceil((old.y1-old.y0)/24),from={x:(rows-1)%2?old.x0:old.x1,y:old.y1-12},t=Math.max(0,enter/glide),u=t*t*(3-2*t);tip={x:from.x+(target.x-from.x)*u,y:from.y+(target.y-from.y)*u};lift=Math.sin(Math.PI*t);}
  else tip=target;
  const mask=p.maskCtx;clip(mask);mask.globalCompositeOperation='source-over';mask.globalAlpha=1;mask.clearRect(0,0,size,size);mask.drawImage(partial&&active.action==='erase'?partial.canvas:p.eraseMask.canvas,0,0);mask.globalCompositeOperation='lighter';mask.globalAlpha=1/p.layers.length;for(let i=0;i<p.layers.length;i++)mask.drawImage(partial&&active.action!=='erase'&&i===active.layer?partial.canvas:p.layers[i].canvas,0,0);mask.globalAlpha=1;mask.globalCompositeOperation='source-over';mask.restore();
  const comp=p.compositeCtx;clip(comp);comp.globalCompositeOperation='source-over';comp.clearRect(0,0,size,size);comp.drawImage(p.batchMaster,0,0);comp.globalCompositeOperation='destination-in';comp.drawImage(mask.canvas,0,0);comp.globalCompositeOperation='source-over';comp.restore();
  const ctx=p.ctx;clip(ctx);ctx.clearRect(0,0,size,size);ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);if(p.batchPrevious)ctx.drawImage(p.batchPrevious,0,0);ctx.drawImage(comp.canvas,0,0);ctx.restore();
  p.tintCtx.clearRect(0,0,size,size);
  if(enter<700&&['shading','hatch','cross','fur'].includes(active.type)){const c=p.tintCtx;c.save();c.scale(scale,scale);c.strokeStyle='#75648655';c.fillStyle='#b2a2c112';c.lineWidth=3;c.beginPath();c.roundRect(b.x0,b.y0,w,h,16);c.fill();c.stroke();c.restore();}
  p.contact=lift<.1&&fraction<1;p.currentTool=active.tool;
  if(p.playing&&now<p.duration)showHandAt(tip.x,tip.y,1024,lift,0,active.pressure,active.action==='erase');else{setHidden($('#drawingHand'),true);pencilSound.stop();}
  setHidden($('#strokeArrow'),true);p.painted=now;p.batchPaintState={active,fraction};
}

function paintStrokes(p){
  if(p.batchPlan)return paintBatches(p);
  const now=p.elapsed,ctx=p.ctx,size=ctx.canvas.width,scale=size/1024,at=strokeAt(p,now);
  if(now<p.painted){for(const layer of [...p.layers,p.eraseMask])layer.clearRect(0,0,size,size);p.painted=-1;}
  const first=strokeAt(p,Math.max(0,p.painted));
  for(let i=first;i<=at;i++){const st=p.strokes[i];if(now<st.start||p.painted>=st.end)continue;const layer=st.action==='erase'?p.eraseMask:p.layers[Math.min(p.layers.length-1,st.layer)];layer.save();layer.scale(scale,scale);layer.strokeStyle=layer.fillStyle='#fff';brushStroke(layer,st,strokeDistance(st,Math.max(st.start,p.painted)),strokeDistance(st,now),st.w+6);layer.restore();}
  p.painted=now;const mask=p.maskCtx;mask.globalCompositeOperation='source-over';mask.globalAlpha=1;mask.clearRect(0,0,size,size);mask.drawImage(p.eraseMask.canvas,0,0);
  mask.globalCompositeOperation='lighter';mask.globalAlpha=1/p.layers.length;for(const layer of p.layers)mask.drawImage(layer.canvas,0,0);mask.globalAlpha=1;mask.globalCompositeOperation='source-over';
  // Reveal the real master through a continuous, round-capped brush mask.
  const comp=p.compositeCtx;comp.globalCompositeOperation='source-over';comp.clearRect(0,0,size,size);comp.drawImage(p.graphiteImage||p.image,0,0,size,size);comp.globalCompositeOperation='destination-in';comp.drawImage(mask.canvas,0,0);comp.globalCompositeOperation='source-over';
  ctx.globalAlpha=1;ctx.clearRect(0,0,size,size);ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);if(p.previous)ctx.drawImage(p.graphitePrevious||p.previous,0,0,size,size);ctx.drawImage(comp.canvas,0,0);
  const tint=p.tintCtx;tint.clearRect(0,0,size,size);
  const st=p.strokes[at];let point=pointOnStroke(st,strokeDistance(st,now)),lift=0;
  if(now<st.start){const target=pointOnStroke(st,0);if(st.glide){const old=p.strokes[at-1],from=pointOnStroke(old,old.length),t=Math.max(0,Math.min(1,(now-st.preview)/(st.start-st.preview))),u=t*t*(3-2*t);point={x:from.x+(target.x-from.x)*u,y:from.y+(target.y-from.y)*u};lift=.35+.65*Math.sin(Math.PI*t);}else{point=target;lift=.7;}}
  const contact=now>=st.start&&now<st.end;
  const a=pointOnStroke(st,Math.max(0,strokeDistance(st,now)-6)),b=pointOnStroke(st,Math.min(st.length,strokeDistance(st,now)+6));if(Math.hypot(b.x-a.x,b.y-a.y)>.01)p.lastTangent=Math.atan2(b.y-a.y,b.x-a.x);
  p.contact=contact;p.currentTool=st.tool;
  if(p.playing&&now<p.duration)showHandAt(point.x,point.y,1024,lift,Math.sin(p.lastTangent||0)*5,st.pressure,st.action==='erase');else{setHidden($('#drawingHand'),true);pencilSound.stop();}
  const arrow=$('#strokeArrow');setHidden(arrow,!p.playing||!showHelpers||reducedMotion.matches||!contact||st.length<100);
  if(!arrow.hidden){const ahead=pointOnStroke(st,Math.min(st.length,strokeDistance(st,now)+75));arrow.style.left=ahead.x/1024*100+'%';arrow.style.top=ahead.y/1024*100+'%';arrow.style.transform=`rotate(${p.lastTangent||0}rad)`;}
  const group=p.groups?.[p.groupAt];if(group&&now-group.start<700&&['shading','hatch','cross','fur'].includes(group.type)){
    const c=p.tintCtx,b=group.bounds;c.save();c.scale(scale,scale);c.strokeStyle='#75648655';c.fillStyle='#b2a2c112';c.lineWidth=3;c.beginPath();c.roundRect?.(b.x0,b.y0,b.x1-b.x0,b.y1-b.y0,20);c.fill();c.stroke();c.restore();
  }
}

function celebrateStep(p) {
  if (p?.celebrated) return;
  if (p) p.celebrated = true;
  $('#stepCheer').replaceChildren();
  const mascot = document.createElement('span'); mascot.innerHTML = UI.mascot('calm'); mascot.setAttribute('aria-hidden', 'true');
  $('#stepCheer').append(mascot, 'Din tur! Prøv på papiret, og vælg næste, når du er klar.');
  $('#stepCheer').hidden = false; fitStage();
}
function setCopyPause(p, waiting) {
  p.waiting = waiting;
  $('#copyPause').hidden = !waiting;
  if (waiting) { p.playing = false; p.state=p.elapsed>=p.duration?'stepComplete':'drawing'; pencilSound.stop(); pauseStepSpeech(); $('#lessonState').textContent='Din tur'; $('#readyBtn').textContent=p.elapsed>=p.duration?(step<L.steps.length-1?'Jeg har prøvet · Næste trin':'Jeg er færdig!'):'Jeg har prøvet · Vis næste del'; $('#readyBtn').focus({preventScroll:true});saveLesson(); }
  $('#nextBtn').hidden=false;$('#nextBtn').disabled=false;$('#lessonState').textContent=waiting?'Din tur':'Se med';
  fitStage();
}


function stopStep() {
  cancelLessonIntro(); pencilSound.stop();
  closeTechnique(false);
  cancelStepSpeech();
  $('#copyPause').hidden = $('#stepCheer').hidden = true; $('#nextBtn').hidden = false;
  if(stepPlayer)clearTimeout(stepPlayer.speechTimer);
  stepVersion++;
  cancelAnimationFrame(stepFrame); stepFrame = 0; stepPlayer = null;
  $('#drawingHand').hidden = true;
  $('#graphiteFX').getContext('2d').clearRect(0, 0, 512, 512);
  $('#strokeArrow').hidden = true;
  $('#pressureBadge').textContent = ''; $('#techniqueChips').replaceChildren();
  $('#liveTip').textContent = 'Følg blyanten med på dit papir.';
  camera.tip = null; setCamera({ x: .5, y: .5, z: 1 }, true);
  document.querySelectorAll('[data-pressure]').forEach(e => e.classList.remove('on'));
  updateVideoControls();
}

// Beholder kun den åbne lektions billeder i hukommelsen.
function loadStep(lesson, index) {
  const src = `${lesson.dir}step${index + 1}.jpg`;
  if (!stepImages.has(src)) {
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      const timer=setTimeout(()=>reject(new Error('Forbindelsen er langsom. Prøv igen.')),45000);
      img.onload = async () => { clearTimeout(timer);
        try { if (img.decode) await img.decode(); } catch {}
        resolve(img);
      };
      img.onerror = () => {clearTimeout(timer);reject(new Error('Billedet kunne ikke hentes'));};
      img.src = assetURL(src);
    });
    stepImages.set(src, promise);
    promise.catch(() => {
      if (stepImages.get(src) === promise) stepImages.delete(src);
    });
  }
  return stepImages.get(src);
}

// Samme minimumfilter og tærskel som før, nu ved halv opløsning.
function highlightStep(image, previous) {
  const canvas = document.createElement('canvas'), size = 256;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.drawImage(image, 0, 0, size, size);
  const pixels = ctx.getImageData(0, 0, size, size);
  ctx.fillRect(0, 0, size, size);
  let old = null;
  if (previous) {
    const sample = document.createElement('canvas'); sample.width = sample.height = size;
    const sampleCtx = sample.getContext('2d');
    sampleCtx.fillStyle = '#fff'; sampleCtx.fillRect(0, 0, size, size);
    sampleCtx.drawImage(previous, 0, 0, size, size);
    ctx.globalCompositeOperation = 'darken';
    // ±2 her svarer til ±4 ved den gamle opløsning på 512 px.
    for (let x = -2; x <= 2; x++) ctx.drawImage(sample, x, 0);
    sampleCtx.drawImage(canvas, 0, 0);
    for (let y = -2; y <= 2; y++) ctx.drawImage(sample, 0, y);
    old = ctx.getImageData(0, 0, size, size).data;
  }
  const rgb = ACCENT.slice(1).match(/../g).map(hex => parseInt(hex, 16));
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const grey = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const before = old ? (old[i] + old[i + 1] + old[i + 2]) / 3 : 255;
    const added = previous ? before - grey > 45 : grey < 245;
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2];
    data[i + 3] = added ? Math.min(230, (255 - grey) * 2) : 0;
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.putImageData(pixels, 0, 0);
  return { canvas, pixels, size };
}

// Cellerne ligger i små spande, så nærmeste nabo findes uden et fuldt gennemløb.
function drawingOrder(mask) {
  const { size, pixels } = mask, data = pixels.data;
  let cell = 3, grid, cols, count;
  do {
    cols = Math.ceil(size / cell); grid = new Uint8Array(cols * cols); count = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (!data[(y * size + x) * 4 + 3]) continue;
      const id = Math.floor(y / cell) * cols + Math.floor(x / cell);
      if (!grid[id]) { grid[id] = 1; count++; }
    }
    if (count <= 6000) break;
    cell++; // Større celler bevarer alle streger ved meget tætte billeder.
  } while (true);

  const x = new Float32Array(count), y = new Float32Array(count);
  const bucketSize = 16, buckets = Math.ceil(size / bucketSize);
  const heads = new Int32Array(buckets * buckets).fill(-1);
  const next = new Int32Array(count).fill(-1), prev = new Int32Array(count).fill(-1);
  const bucketOf = new Uint16Array(count);
  let n = 0;
  for (let id = 0; id < grid.length; id++) {
    if (!grid[id]) continue;
    const left = (id % cols) * cell, top = Math.floor(id / cols) * cell;
    x[n] = left + Math.min(cell, size - left) / 2;
    y[n] = top + Math.min(cell, size - top) / 2;
    const b = Math.floor(y[n] / bucketSize) * buckets + Math.floor(x[n] / bucketSize);
    bucketOf[n] = b; next[n] = heads[b];
    if (heads[b] !== -1) prev[heads[b]] = n;
    heads[b] = n++;
  }

  const order = new Uint16Array(count), jumps = new Uint8Array(count);
  let at = 0; // Første celle er øverst til venstre.
  for (let i = 0; i < count; i++) {
    order[i] = at;
    const b = bucketOf[at], p = prev[at], q = next[at];
    if (p === -1) heads[b] = q; else next[p] = q;
    if (q !== -1) prev[q] = p;
    if (i === count - 1) break;
    const bx = b % buckets, by = Math.floor(b / buckets);
    let best = -1, distance = Infinity;
    for (let r = 0; r < buckets; r++) {
      const left = Math.max(0, bx - r), right = Math.min(buckets - 1, bx + r);
      const top = Math.max(0, by - r), bottom = Math.min(buckets - 1, by + r);
      for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
        if (r && Math.abs(col - bx) !== r && Math.abs(row - by) !== r) continue;
        for (let j = heads[row * buckets + col]; j !== -1; j = next[j]) {
          const d = (x[j] - x[at]) ** 2 + (y[j] - y[at]) ** 2;
          if (d < distance || (d === distance && j < best)) { best = j; distance = d; }
        }
      }
      // Intet uden for den besøgte firkant kan være tættere på.
      const edge = Math.min(x[at] - (bx - r) * bucketSize, (bx + r + 1) * bucketSize - x[at],
        y[at] - (by - r) * bucketSize, (by + r + 1) * bucketSize - y[at]);
      if (best !== -1 && distance <= edge * edge) break;
    }
    jumps[i + 1] = distance > (cell * 4) ** 2 ? 1 : 0;
    at = best;
  }
  return { x, y, order, jumps, cell, count };
}

function createStepPlayer(image, mask) {
  const path = drawingOrder(mask), { count, order, x, y, jumps, cell } = path;
  const duration = Math.min(8000, Math.max(2500, 2000 + count * 5));
  const times = new Float32Array(count);
  let weight = count;
  for (let i = 0; i < count; i++) weight += jumps[i] * 10;
  let elapsed = 0;
  for (let i = 0; i < count; i++) {
    elapsed += 1 + jumps[i] * 10;
    times[i] = elapsed / weight * (duration - TINT_FADE);
  }

  // Hver maskepixel husker, hvornår den først rammes af en lille skive.
  const { size, pixels } = mask, radius = cell * Math.SQRT1_2 + 0.5;
  const owner = new Uint16Array(size * size).fill(65535);
  for (let i = 0; i < count; i++) {
    const cx = x[order[i]], cy = y[order[i]];
    for (let py = Math.max(0, Math.floor(cy - radius)); py < Math.min(size, Math.ceil(cy + radius)); py++) {
      for (let px = Math.max(0, Math.floor(cx - radius)); px < Math.min(size, Math.ceil(cx + radius)); px++) {
        const id = py * size + px;
        if (owner[id] === 65535 && pixels.data[id * 4 + 3] &&
          (px + 0.5 - cx) ** 2 + (py + 0.5 - cy) ** 2 <= radius * radius) owner[id] = i;
      }
    }
  }
  const tinted = new Uint32Array(size * size);
  let tintCount = 0;
  for (let i = 0; i < owner.length; i++) if (owner[i] !== 65535) tinted[tintCount++] = i;
  const highlight = $('#stepHighlight'); highlight.width = highlight.height = size;
  const tintCtx = highlight.getContext('2d'), tintPixels = tintCtx.createImageData(size, size);
  tintPixels.data.set(pixels.data);
  for (let i = 3; i < tintPixels.data.length; i += 4) tintPixels.data[i] = 0;
  const canvas = $('#stepDrawing'); canvas.width = canvas.height = playbackSize();
  return { ...path, image, mask, times, duration, radius, owner, tinted: tinted.subarray(0, tintCount),
    stops: Array.from(times).filter((t, i) => i === count - 1 || (i && jumps[i + 1] && t - times[Math.max(0, i - 80)] >= 700)),
    stopsPassed: new Set(), waiting: false, celebrated: false,
    tintCtx, tintPixels, ctx: canvas.getContext('2d'), elapsed: 0, drawn: 0, playing: false, last: 0, hand: null };
}

function updateVideoControls() {
  const p = stepPlayer, playing = p && p.playing;
  const disabled = !p || !p.count || p.kind==='static';
  for(const control of [$('#playPauseBtn'),$('#stepScrubber')])if(control.disabled!==disabled)control.disabled=disabled;
  UI.controlIcon($('#playPauseBtn'), playing ? 'pause' : 'play');
  if($('#showWholeStep').disabled!==!p)$('#showWholeStep').disabled=!p;
  setHidden($('#copyPause'), !p?.waiting);
  setAttr($('#playPauseBtn'), 'aria-label', playing ? 'Sæt tegningen på pause' : 'Afspil tegningen');
  const duration = p && Number.isFinite(p.duration) ? Math.max(0, p.duration) : 0;
  const elapsed = p ? Math.max(0, Math.min(p.elapsed, duration)) : 0;
  const progress = duration ? elapsed / duration : 0;
  const time = ms => { const seconds = Math.floor(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
  const timeText = `${time(elapsed)} / ${time(duration)}`;
  // This changes every frame; keep it out of live regions to avoid repeated speech.
  if ($('#stepTime').textContent !== timeText) $('#stepTime').textContent = timeText;
  $('#stepScrubber').value = Math.round(progress * 1000);
  $('#stepScrubber').style.setProperty('--played', `${progress * 100}%`);
  setAttr($('#stepScrubber'), 'aria-valuetext', `${time(elapsed)} af ${time(duration)}`);
  if($('#stepSpeed').value!==String(stepSpeed))$('#stepSpeed').value=stepSpeed;
}

function drawnCount(p) {
  let low = 0, high = p.count;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (p.times[mid] <= p.elapsed) low = mid + 1; else high = mid;
  }
  return low;
}

function paintStep(){const p=stepPlayer;if(!p)return;
  setHidden($('#stepImage'),p.kind!=='static');setHidden($('#stepDrawing'),p.kind==='static');if($('#stepHighlight').style.opacity!=='1')$('#stepHighlight').style.opacity='1';
  if(p.kind==='static'){$('#drawingHand').hidden=true;pencilSound.stop();$('#guideStatus').textContent='Stillbillede · Animationen kunne ikke hentes';$('#guideStatus').hidden=false;$('#retryStep').hidden=false;$('#nextBtn').disabled=false;$('#lessonState').textContent='Se eksemplet · Prøv selv';updateVideoControls();return;}
  updateGuidance(p);paintStrokes(p);
  const done=p.elapsed>=p.duration;
  if(done){p.ctx.globalCompositeOperation='source-over';p.ctx.globalAlpha=1;p.ctx.clearRect(0,0,p.ctx.canvas.width,p.ctx.canvas.height);p.ctx.drawImage(p.image,0,0,p.ctx.canvas.width,p.ctx.canvas.height);p.tintCtx.clearRect(0,0,p.tintCtx.canvas.width,p.tintCtx.canvas.height);p.playing=false;$('#drawingHand').hidden=true;$('#strokeArrow').hidden=true;pencilSound.stop();if(!p.waiting)setCopyPause(p,true);}
  if($('#nextBtn').disabled)$('#nextBtn').disabled=false;setText($('#lessonState'),p.explaining?'Hør og se området':p.waiting?'Din tur':p.playing?'Se med':'Klar til at fortsætte');updateVideoControls();
}

function positionHand(p, count) {
  const hand = $('#drawingHand'), next = Math.min(count, p.count - 1);
  if (!p.playing || !p.count || count === p.count) { hand.hidden = true; p.hand = null; return; }
  const a = p.order[Math.max(0, next - 1)], b = p.order[next];
  const start = next ? p.times[next - 1] : 0;
  const t = Math.min(1, (p.elapsed - start) / (p.times[next] - start));
  const x = p.x[a] + (p.x[b] - p.x[a]) * t, y = p.y[a] + (p.y[b] - p.y[a]) * t;
  // Keep the fallback contact on the revealed line too; easing the position
  // made the pencil lag behind the drawing point.
  p.hand = { x, y };
  showHandAt(p.hand.x, p.hand.y, p.mask.size, p.jumps[next] ? Math.sin(Math.PI * t) : 0,
    Math.sin(Math.atan2(p.y[b] - p.y[a], p.x[b] - p.x[a])) * 9 + Math.sin(p.elapsed / 137) * .28, p.groups?.[p.groupAt]?.pressure);
}

function advanceStep(now) {
  const p = stepPlayer;
  if (!p || !p.playing || p.explaining) { if(p)p.last=now;return; }
  p.frameDelta = Math.max(0, now - p.last);
  const target = Math.min(p.duration, p.elapsed + Math.min(100, p.frameDelta) * stepSpeed);
  const stop = waitForMe ? p.stops.find(t => t > p.elapsed && t <= target && !p.stopsPassed.has(t)) : undefined;
  p.elapsed = stop ?? target; p.last = now;
  if (typeof stop === 'number') { p.stopsPassed.add(stop); setCopyPause(p, true); }
  else if(p.elapsed>=p.duration)setCopyPause(p,true);
}

function stepTick(now) {
  stepFrame = 0;
  advanceStep(now); paintStep();
  if (stepPlayer && stepPlayer.playing) stepFrame = requestAnimationFrame(stepTick);
}

function pauseStep() {
  advanceStep(performance.now());
  cancelAnimationFrame(stepFrame); stepFrame = 0;
  if (stepPlayer) stepPlayer.playing = false;
  pencilSound.stop();
  pauseStepSpeech();
  camera.from=null; cancelAnimationFrame(camera.frame);camera.frame=0;
  saveLesson();paintStep();
}

function playStep(fromStart = false) {
  if (techniqueSession || introAfter) return;
  const p = stepPlayer;
  if (!p) return;
  if (!p.count) { p.elapsed = p.duration; paintStep(); return; }
  const restarting = fromStart || p.elapsed >= p.duration;
  if (restarting) {
    p.elapsed = 0; p.drawn = 0; p.hand = null;
    p.stopsPassed.clear(); p.celebrated = false;
    p.groupAt = -1; p.tipKey = ''; p.tipChanged = p.cameraChanged = -Infinity;
    camera.tip = null;
    $('#stepCheer').hidden = true;
    p.ctx.clearRect(0, 0, p.ctx.canvas.width, p.ctx.canvas.height);
  }
  $('#shadowCompare').hidden = true;
  setCopyPause(p, false);
  p.playing = !document.hidden; p.last = performance.now();
  paintStep();
  if (p.playing && !stepFrame) stepFrame = requestAnimationFrame(stepTick);
}

function toggleStepPlayback() {
  if (!stepPlayer) return;
  if (stepPlayer.playing) pauseStep(); else playStep();
}

function openLesson(lesson) {
  if (!lessonUnlocked(lesson)) { show('shop'); toast('Lås først tegningen op med dine stjerner ⭐'); return; }
  if (wallet.newLessons[lesson.id]) { const next = cloneWallet(); delete next.newLessons[lesson.id]; saveWallet(next); }
  // En afsluttet lektion begynder på et nyt ark.
  if (current === 'done') show('home');
  if (current === 'lesson') { saveLesson(); stopStep(); }
  let saved = lessonState(lesson);
  if(saved?.complete){
    if(!confirm('Du har gennemført '+lesson.title+'. Vil du starte et nyt forsøg? Kladderne fra lektionen bliver slettet. Gemte billeder og stjerner bliver bevaret.'))return;
    clearLessonDrawings(lesson.id); removeLocal(lessonKey(lesson.id)); saved=null;
  }
  attemptComplete=false;
  L = lesson; step = saved ? saved.step : 0; mode = saved ? saved.mode : 'paper';
  introPending = !saved; introLessonId = lesson.id; resumeState = saved; attemptId = saved?.attemptId || crypto.randomUUID?.() || String(Date.now()); assessment = saved?.assessment || null;
  // Existing drafts are kept until an explicit restart or successful archive.
  stepImages.clear(); strokeFiles.clear();
  setLessonPlaybackDefaults(); loadHand();
  sidePad.setKey(lessonKey(L.id) + '_side');
  tracePad.setKey(lessonKey(L.id) + '_trace');
  const bar = $('#progress'); bar.innerHTML = '';
  bar.setAttribute('aria-valuemax', L.steps.length);
  for (let i = 0; i < L.steps.length; i++) bar.appendChild(document.createElement('i'));
  show('lesson');
  applyMode();
  renderStep();
}
function saveLesson() {
  if (!L) return false;
  return writeLocal(lessonKey(L.id), { step, mode, updated:Date.now(), attemptId, assessment, elapsed:stepPlayer?.elapsed ?? resumeState?.elapsed ?? 0, timingVersion:stepPlayer?PlaybackTiming.VERSION:resumeState?.timingVersion, waiting:!!(stepPlayer?.waiting??resumeState?.waiting), segmentId:stepPlayer?.groups?.[stepPlayer.groupAt]?.id||resumeState?.segmentId, complete:attemptComplete, revision:L.revision });
}
async function renderStep() {
  stopStep();
  updateCameraControl();
  saveLesson();
  const version = stepVersion, lesson = L, index = step;
  const n = L.steps.length;
  updateOfflineDownload();
  $('#stepNum').textContent = `Trin ${step + 1} af ${n}`;
  $('#progress').setAttribute('aria-valuenow', step + 1);
  $('#progress').setAttribute('aria-valuetext', `Trin ${step + 1} af ${n}`);
  $('#stepText').textContent = L.steps[step];
  $('#finishBasic').hidden=!(L.stepMeta?.[step]?.optionalDetails||L.level>1);
  $('#stepSelfCheck').textContent=L.stepMeta?.[step]?.selfCheck||'Prøv på din egen måde. Du kan altid vise denne del igen.';
  [...$('#progress').children].forEach((d, i) => d.classList.toggle('on', i <= step));
  $('#prevBtn').disabled = false;
  UI.label($('#nextBtn'), step < n - 1 ? 'next' : 'check', step < n - 1 ? 'Næste trin' : 'Jeg er færdig!');
  $('#nextBtn').disabled = false;$('#lessonState').textContent='Henter tegningen…';
  $('#replayBtn').disabled = true;
  $('#videoControls').hidden = false;
  prepareVoice(`${L.dir}voice${step + 1}.m4a`);
  fitStage();
  $('#previousStep').hidden = $('#stepReveal').hidden = true;
  const status = $('#guideStatus');
  status.textContent = 'Henter tegningen…'; status.hidden = false;
  $('#guideArt').setAttribute('aria-busy', 'true');
  trimAssets(lesson,index);$('#retryStep').hidden=true;$('#stepDemo').hidden=true;$('#shadowCompare').hidden=true;
  const images = Promise.all([loadStep(lesson, index), index ? loadStep(lesson, index - 1) : null, loadStrokes(lesson, index)]);

  try {
    const [image, previous, strokes] = await images;
    if (version !== stepVersion) return;
    if (index + 1 < n) { loadStep(lesson, index + 1).catch(() => {}); loadStrokes(lesson, index + 1); }
    const under = $('#previousStep');
    if (previous) under.src = previous.src;
    under.hidden = !previous;
    $('#stepImage').src = image.src;
    $('#stepImage').alt = `${lesson.title} – trin ${index + 1}`;
    $('#stepReveal').hidden = false;
    status.hidden = true;
    await loadHand(); if (version !== stepVersion) return;
    const validStrokes = strokes && prepareStrokes(strokes, image, previous, lesson.steps[index]);
    stepPlayer = (validStrokes?.count || validStrokes?.strokes.length) ? createStrokePlayer(image, previous, validStrokes) :
      createStaticPlayer(image, previous);
    // Stregafspilleren sammensætter selv det gamle lag, også under viskning.
    if (stepPlayer.kind === 'strokes') under.hidden = true;
    const player = stepPlayer;
    $('#cameraReset').hidden=mode==='trace'||!!player.unreliableFocus;
    showStepGuidance(player, image, previous);
    paintStep();
    const saved = resumeState; resumeState = null;
    if (saved && saved.step===index) { const group=player.groups?.find(g=>g.id===saved.segmentId||g.sourceIds?.includes(saved.segmentId));player.elapsed=saved.timingVersion===PlaybackTiming.VERSION?Math.min(player.duration,saved.elapsed||0):(group?.start||0);player.stopsPassed=new Set(player.stops.filter(t=>t<=player.elapsed));paintStep();if(saved.waiting)setCopyPause(player,true); $('#lessonState').textContent='Klar til at fortsætte';return; }
    startLessonIntro(player, () => introduceTechniques(player, () => {
      if (version !== stepVersion || document.hidden) return;
      if (player.count && !reducedMotion.matches) startSegment(player); 
      else { player.elapsed = player.duration; paintStep(); }
    }));
  } catch {
    if (version !== stepVersion) return;
    status.textContent = navigator.onLine ? 'Forbindelsen er langsom, eller tegningen kunne ikke hentes. Vælg Hent igen.' : 'Du er offline. Hent lektionen, når du er online igen.'; status.hidden=false;
    $('#lessonState').textContent='Kunne ikke hente · Prøv igen'; $('#retryStep').hidden = false;
    toast('Tegningen er ikke hentet endnu. Prøv Hent igen.');
  } finally {
    if (version === stepVersion) {
      $('#replayBtn').disabled = false;
      $('#guideArt').setAttribute('aria-busy', 'false');
    }
  }
}
function applyMode() {
  sidePad.finishStroke(); tracePad.finishStroke();
  saveLesson();
  const st = $('#stage');
  st.classList.toggle('side', mode === 'side');
  st.classList.toggle('trace', mode === 'trace');
  if(mode==='trace')setCamera({x:.5,y:.5,z:1},true);
  $('#cameraReset').hidden=mode==='trace'||!!stepPlayer?.unreliableFocus;
  if(mode==='side' && window.innerWidth<700) { pauseStep(); st.classList.add('my-paper'); } else st.classList.remove('my-paper');
  $('#sideSwitch').hidden=mode!=='side';
  UI.controlIcon($('#modeBtn'), { paper: 'paper', side: 'pencil', trace: 'trace' }[mode]);
  $('#modeBtn').setAttribute('aria-label', 'Vælg tegnemåde. Nu: ' + { paper: 'På papir', side: 'Ved siden af', trace: 'Spor' }[mode]);
  const tools = $('#lessonTools');
  tools.classList.toggle('on', mode !== 'paper');
  if (mode !== 'paper') buildTools(tools, mode === 'side' ? sidePad : tracePad);
  fitStage();
}
// Holder vejledningen kvadratisk og så stor som muligt
function fitStage() {
  if (current !== 'lesson') return;
  const st = $('#stage'), r = st.getBoundingClientRect();
  const layout = getComputedStyle(st);
  const W = Math.max(0, r.width - parseFloat(layout.paddingLeft || 0) - parseFloat(layout.paddingRight || 0));
  const H = Math.max(0, r.height - parseFloat(layout.paddingTop || 0) - parseFloat(layout.paddingBottom || 0));
  const gap = parseFloat(layout.gap) || 12;
  const stacked = layout.flexDirection === 'column';
  let size;
  if (mode === 'side' && window.innerWidth<700) size=Math.min(W,H);
  else if (mode === 'side') size = stacked ? Math.min(W, (H - gap) / 2) : Math.min(H, (W - gap) / 2);
  else size = Math.min(W, H);
  for (const e of [$('#guideWrap'), $('#sidePadWrap')]) { e.style.width = e.style.height = Math.max(0, size) + 'px'; }
  if (handView) handView.size = { width: Math.max(0,size), height: Math.max(0,size) };
  updateLessonHelpBounds();
}
window.addEventListener('resize', fitStage);
new ResizeObserver(fitStage).observe($('#stage'));
let modeFocus = null, modeWasPlaying = false;
function closeModePicker(resume = true) {
  $('#modeModal').hidden = true; modalInert(false); modeFocus?.focus({ preventScroll: true });
  if (resume && modeWasPlaying) playStep(); modeWasPlaying = false;
}
$('#modeBtn').onclick = () => {
  modeFocus = document.activeElement; modeWasPlaying = !!stepPlayer?.playing; pauseStep();
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode ? 'true' : 'false'));
  $('#modeModal').hidden = false; modalInert(true); $('#modeClose').focus({ preventScroll: true });
};
$('#modeClose').onclick = () => closeModePicker();
for (const b of document.querySelectorAll('[data-mode]')) b.onclick = () => {
  mode = b.dataset.mode; applyMode(); closeModePicker();
  toast({ paper: '📄 Tegn på papir', side: '✏️ Tegn ved siden af', trace: '👻 Tegn oven i (spor)' }[mode]);
};
$('#lessonClose').onclick = () => { dismissLessonHelp(); show('home'); };
$('#lessonRestart').onclick = () => {
  if (!confirm('Vil du starte lektionen forfra? Tegningerne i lektionen bliver slettet. Dine stjerner bliver gemt.')) return;
  sidePad.finishStroke(); tracePad.finishStroke();
  show('home');
  removeLocal(lessonKey(L.id));
  clearLessonDrawings(L.id);
  openLesson(L);
};
$('#prevBtn').onclick = () => { dismissLessonHelp(); if (step > 0) { step--; renderStep(); } else show('home'); };
$('#replayBtn').onclick = () => { if (stepPlayer) replaySegment(); else renderStep(); };
$('#playPauseBtn').onclick = toggleStepPlayback;
$('#guideWrap').addEventListener('click', e => {
  if (e.target !== $('#traceCanvas') && !e.target.closest('button') && !introAfter) toggleStepPlayback();
});
$('#stepScrubber').addEventListener('input', e => {
  if (!stepPlayer) return;
  const progress = Number(e.target.value) / 1000;
  pauseStep();
  setCopyPause(stepPlayer, false);
  stepPlayer.elapsed = progress * stepPlayer.duration;
  stepPlayer.stopsPassed = new Set(stepPlayer.stops.filter(t => t <= stepPlayer.elapsed));
  if (progress < 1) $('#stepCheer').hidden = true;
  camera.tip = null;
  updateGuidance(stepPlayer, true);
  paintStep();
});
$('#stepSpeed').onchange = e => {
  advanceStep(performance.now());
  const speed = Number(e.target.value);
  if (stepSpeeds.includes(speed)) { stepSpeed = speed; writeLocal('ts_step_speed', stepSpeed); }
  paintStep(); updateVideoControls();
};
function setWaitForMe(value){waitForMe=!!value;writeLocal('ts_wait_for_me',waitForMe);$('#waitForMe').checked=$('#settingWait').checked=waitForMe;if(!waitForMe&&stepPlayer?.waiting&&stepPlayer.elapsed<stepPlayer.duration)playStep();}
$('#waitForMe').onchange=e=>setWaitForMe(e.target.checked);
$('#readStepBtn').onclick = readStepAloud;
$('#readyBtn').onclick = () => { const p=stepPlayer; if(!p?.waiting)return; if(p.elapsed>=p.duration) { confirmStep(); return; } setCopyPause(p,false); startSegment(p); };
$('#showWholeStep').onclick = () => {
  if (!stepPlayer) return;
  pauseStep(); setCopyPause(stepPlayer, false);
  stepPlayer.elapsed = stepPlayer.duration; updateGuidance(stepPlayer,true); paintStep();
};
const motionChanged = () => { if (current === 'lesson') renderStep(); };
if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', motionChanged);
else reducedMotion.addListener(motionChanged);
function dismissLessonHelp() {
  cancelLessonIntro(); closeTechnique(false);
  if(warmupSession)closeWarmup(false);
  $('#stepDemo').hidden = $('#shadowCompare').hidden = true;
  modalInert(false);
}
function confirmStep() {
  if(current!=='lesson'||!L)return;
  dismissLessonHelp();
  if (!stepPlayer?.skipped) { awardStars(`step:${L.id}:${step}`,1,'Du prøvede et nyt trin'); markActive(); }
  if(step<L.steps.length-1){step++;renderStep();}else finishLesson();
}
$('#nextBtn').onclick = confirmStep;


let showHelpers = readLocal('ts_helpers')===true;
function readSegment(g){if(!g)return;const meta=L?.stepMeta?.[step],screen=mode!=='paper'&&meta?.screenTip,text=screen||g.spokenText||g.tip;readAloud(text,screen?phraseFile(text):g.audioSrc||phraseFile(text));}
function startSegment(p){
  if(!p||p!==stepPlayer)return;
  p.groupAt=-1;playStep();

}
function replaySegment(){const p=stepPlayer;if(!p)return;pauseStep();const current=p.groups?.[p.groupAt]||p.groups?.[0];if(!current){renderStep();return;}p.elapsed=current.start;p.painted=Infinity;p.stopsPassed=new Set(p.stops.filter(t=>t<=p.elapsed));setCopyPause(p,false);startSegment(p);}
function showStepDemo(id,after){pauseStep();const panel=$('#stepDemo');panel.querySelector('strong').textContent='Se, sådan gør du';panel.hidden=false;panel.dataset.technique=id;const version=stepVersion,start=performance.now();let frame;const draw=now=>{if(version!==stepVersion||panel.hidden)return;TechniqueDemo.draw($('#stepDemoCanvas'),id,reducedMotion.matches?1:Math.min(1,(now-start)/6500));if(now-start<6500&&!document.hidden)frame=requestAnimationFrame(draw);else{panel.hidden=true;if(!document.hidden&&version===stepVersion)after();else{stepPlayer.demoSeen=false;}}};requestAnimationFrame(draw);$('#stepDemoContinue').onclick=()=>{cancelAnimationFrame(frame);panel.hidden=true;if(version===stepVersion)after();};}
function showShadowComparison(p){if(p.compared||!p.previous||!p.analysis.techniques.some(id=>['shading','hatch','cross','fur'].includes(id)))return;p.compared=true;$('#shadowBefore').src=p.graphitePrevious?.toDataURL()||p.previous.src;$('#shadowAfter').src=p.ctx?.canvas.toDataURL()||p.image.src;$('#shadowCompare').hidden=false;}
$('#shadowCompareClose').onclick=()=>$('#shadowCompare').hidden=true;
$('#retryStep').onclick=()=>{strokeFiles.delete(`${L.dir}strokes${step+1}.json`);stepImages.delete(`${L.dir}step${step+1}.jpg`);renderStep();};
$('#introReady').onclick=finishLessonIntro;
$('#voiceStatus').onclick=retryVoice;
$('#sideSwitch').onclick=()=>{pauseStep();$('#stage').classList.toggle('my-paper');$('#sideSwitch').textContent=$('#stage').classList.contains('my-paper')?'Se læreren':'Mit ark';fitStage();};
$('#stepHow').onclick=()=>{const text=L?.stepMeta?.[step]?.how||stepPlayer?.groups?.[stepPlayer.groupAt]?.tip;if(text)toast(text);};
$('#wholeReplay').onclick=()=>playStep(true);
$('#skipDemo').onclick=()=>{if(!stepPlayer)return;pauseStep();stepPlayer.skipped=true;stepPlayer.elapsed=stepPlayer.duration;paintStep();};
$('#settingHelpers').onchange=e=>{showHelpers=e.target.checked;writeLocal('ts_helpers',showHelpers);};
$('#supportMode').onchange=e=>{writeLocal('ts_support',e.target.value);};
$('#saveRetry').onclick=async()=>{const ok=await DraftStore.flush();if(ok){localSaveFailed=false;if(L)saveLesson();$('#saveStatus').hidden=localSaveFailed;}toast(ok?'Din tegning er gemt':'Ikke gemt endnu. Prøv at gemme billedet.');};
$('#saveExport').onclick=()=>downloadImage(([sidePad,tracePad].find(p=>!p.empty())||sidePad).toImage(),'min-tegning.jpg');
for(const button of document.querySelectorAll('[data-support-skill]'))button.onclick=()=>openTechnique(TECHNIQUES.find(t=>t.id===button.dataset.supportSkill));
/* ---------------- færdig ---------------- */
function finishLesson() {
  $('#doneKind').textContent='HELE LEKTIONEN GENNEMFØRT';$('#doneSticker').hidden=false;
  awardStars('lesson:' + L.id, 3, 'Du gennemførte lektionen');
  const p = store.get(); p.done[L.id] = 3; store.set(p); markActive();
  $('#doneReward').textContent = 'Stjernerne er for din indsats. Gem et foto og få 2 ekstra stjerner første gang.';
  $('#ownChallenge').textContent = challengeFor(L);
  $('#ownTried').disabled = !!readLocal('ts_variation_' + L.id);
  assessment=null; $('#assessmentTip').hidden = true; $('#supportChoices').hidden=true;
  document.querySelectorAll('[data-assess]').forEach(b => b.setAttribute('aria-pressed', 'false'));
  sidePad.finishStroke(); tracePad.finishStroke(); attemptComplete=true; saveLesson();
  $('#doneTitle').textContent = doneMessage(L);
  const own = [sidePad,tracePad].find(p=>!p.empty());
  $('#doneArt').src = own ? own.toImage() : `${L.dir}step${L.steps.length}.jpg`;
  $('#doneCaption').textContent=own?'Din egen tegning':'Vores eksempel · Scan din tegning herunder';
  $('#doneArt').alt = L.title + ' – færdig tegning';
  $('#doneSaveScreen').hidden = !own; $('#doneSaveScreen').disabled = false;
  show('done');
  confetti();
}
function confetti() {
  const box = $('#confetti'); box.innerHTML = '';
  const cols = ['#6435cf', '#f18d83', '#ffd36c', '#79bfa6'];
  if (reducedMotion.matches) return;
  for (let i = 0; i < 12; i++) {
    const c = document.createElement('i');
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = cols[i % cols.length];
    c.style.animationDuration = .7 + Math.random() * .2 + 's';
    c.style.animationDelay = Math.random() * 0.1 + 's';
    box.appendChild(c);
  }
  setTimeout(() => box.innerHTML = '', 1100);
}
$('#finishBasic').onclick=()=>{
  if(!L)return;sidePad.finishStroke();tracePad.finishStroke();assessment=null;attemptComplete=false;saveLesson();markActive();
  document.querySelectorAll('[data-assess]').forEach(b=>b.setAttribute('aria-pressed','false'));
  const own=[sidePad,tracePad].find(p=>!p.empty());$('#doneKind').textContent='DIT EGET FORSØG';$('#doneTitle').textContent='Din grundform er klar!';$('#doneArt').src=own?own.toImage():`${L.dir}step${Math.max(1,step)}.jpg`;$('#doneCaption').textContent=own?'Din egen tegning':'Vores eksempel · Din udgave må gerne være enkel';$('#doneReward').textContent='Du har øvet grundformen. Du kan fortsætte med de ekstra detaljer senere.';$('#doneSaveScreen').hidden=!own;$('#doneSaveScreen').disabled=false;$('#doneSticker').hidden=!store.get().done[L.id];$('#ownChallenge').textContent=challengeFor(L);$('#assessmentTip').hidden=true;$('#supportChoices').hidden=true;show('done');
};
$('#layoutPlan').onclick=async()=>{
  if(!L)return;const lesson=L,version=stepVersion;pauseStep();const im=await loadStep(lesson,lesson.steps.length-1).catch(()=>null);if(!im||version!==stepVersion)return;
  const panel=$('#stepDemo'),canvas=$('#stepDemoCanvas'),ctx=canvas.getContext('2d');panel.hidden=false;panel.querySelector('strong').textContent='Markér let top og bund. Gem plads til hele motivet.';ctx.clearRect(0,0,600,300);ctx.fillStyle='#fffdf8';ctx.fillRect(0,0,600,300);ctx.drawImage(im,150,0,300,300);
  const bounds=lesson.stepMeta?.[0]?.layoutBounds||[.12,.1,.88,.9];ctx.strokeStyle='#8b7b9f';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.strokeRect(150+bounds[0]*300,bounds[1]*300,(bounds[2]-bounds[0])*300,(bounds[3]-bounds[1])*300);ctx.setLineDash([]);for(const y of [bounds[1],bounds[3]]){ctx.beginPath();ctx.arc(150+(bounds[0]+bounds[2])*150,y*300,5,0,Math.PI*2);ctx.stroke();}
  $('#stepDemoContinue').onclick=()=>{panel.hidden=true;};
};
$('#doneHome').onclick = () => show('home');
$('#doneSticker').onclick = () => StickerBook.fromLesson(L.id);
$('#donePhoto').onchange = async e => { const file=e.target.files[0];e.target.value='';if(file)await ScanFlow.open({lesson:L,file,attemptId,assessment}); };
let archiving = false;
$('#doneSaveScreen').onclick = async () => {
  if(archiving)return;archiving=true;$('#doneSaveScreen').disabled=true;
  const lesson=L,attempt=attemptId;try { for(const [kind,pad] of [['side',sidePad],['trace',tracePad]]) if(!pad.empty()) {
    const img=pad.toImage();await addEntry(img,lesson.title,{id:`attempt:${attempt}:${kind}`,lessonId:lesson.id,attemptId:attempt,mode:kind,kind:'screen',skillIds:lessonSkills(lesson),selfAssessment:assessment});
  } await DraftStore.flush(); $('#doneCaption').textContent='Din tegning · Gemt i tegnebogen';toast('Dine ark er gemt i tegnebogen'); }
  catch{toast('Ikke gemt endnu. Din kladde er stadig her.');$('#saveStatus').hidden=false;}finally{archiving=false;$('#doneSaveScreen').disabled=false;}
};

/* ---------------- tegnebog (IndexedDB) ---------------- */
let dbP;
function db() {
  return dbP ||= new Promise((res,rej)=>{let r;try{r=indexedDB.open('tegneskolen',1);}catch(e){rej(e);return;}
    r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('entries'))r.result.createObjectStore('entries',{keyPath:'id',autoIncrement:true});};
    r.onsuccess=()=>{const d=r.result;d.onversionchange=()=>{d.close();dbP=null;};res(d);};r.onerror=r.onblocked=()=>rej(r.error||Error('Luk andre appvinduer og prøv igen.'));
  }).catch(e=>{dbP=null;throw e;});
}
async function tx(mode,fn){const d=await db();return new Promise((res,rej)=>{const t=d.transaction('entries',mode),r=fn(t.objectStore('entries'));t.oncomplete=()=>res(r?.result);t.onerror=t.onabort=()=>rej(t.error||Error('Tegnebogen kunne ikke gemme.'));});}
const dbAll = () => tx('readonly', s => s.getAll());
const dbGet = id => tx('readonly', s => s.get(id));
const dbPut = v => tx('readwrite', s => s.put(v));
const dbDel = id => tx('readwrite', s => s.delete(id));
async function addEntry(img, title, metadata = {}) {
  const id = await dbPut({ img, title, note: '', created: Date.now(), ...metadata });
  markActive(); return id;
}

function shrink(file, max = 1200) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Billedet kunne ikke åbnes')); }; img.src = url;
  });
}
const fmtDate = t => new Date(t).toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' });

async function renderJournal() {
  await renderDrafts();
  const g=$('#jgrid');g.replaceChildren();g.hidden=false;$('#jempty').classList.remove('on');g.textContent='Henter dine tegninger…';
  try { const items=(await dbAll()).filter(it=>it && typeof it.img==='string').sort((a,b)=>b.created-a.created); if(current!=='journal')return;g.replaceChildren();g.hidden=!items.length;$('#jempty').classList.toggle('on',!items.length);
    for(const it of items.slice(0,journalLimit)){const b=document.createElement('button');b.className='jitem';const ph=document.createElement('div');ph.className='ph';const img=document.createElement('img');img.src=it.img;img.alt=it.title||'Min tegning';img.loading='lazy';ph.append(img);const d=document.createElement('div');d.className='d';d.textContent=`${it.title} · ${fmtDate(it.created)}`;b.append(ph,d);b.onclick=()=>openEntry(it.id);g.append(b);}
    if(items.length>journalLimit){const more=document.createElement('button');more.className='btn';more.textContent='Vis flere tegninger';more.onclick=()=>{journalLimit+=24;renderJournal();};g.append(more);}
  } catch { g.textContent='Tegnebogen kunne ikke åbnes. Dine tegninger er ikke slettet.';const b=document.createElement('button');b.textContent='Prøv igen';b.className='btn';b.onclick=renderJournal;g.append(b); }
}
async function renderDrafts(){const box=$('#journalDrafts');box.replaceChildren();for(const lesson of LESSONS){const saved=lessonState(lesson);if(!saved)continue;const values=await Promise.all(['side','trace'].map(kind=>DraftStore.get(lessonKey(lesson.id)+'_'+kind).catch(()=>null)));if(!values.some(v=>validPadStrokes(v?.strokes).length))continue;const button=document.createElement('button');button.textContent='Gem kladden · '+lesson.title;button.onclick=async()=>{openLesson(lesson);await Promise.all(['side','trace'].map(kind=>DraftStore.get(lessonKey(lesson.id)+'_'+kind).catch(()=>null)));if(L.id===lesson.id)finishLesson();};box.append(button);}}
let journalLimit=24;
$('#journalAdd').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file)ScanFlow.open({file});};
let entry=null,noteT,pendingNote=null;const deletedEntries=new Set();
async function flushEntryNote(){clearTimeout(noteT);const change=pendingNote;if(!change)return;pendingNote=null;if(deletedEntries.has(change.id))return;try{await tx('readwrite',store=>{const r=store.get(change.id);r.onsuccess=()=>{if(r.result&&!deletedEntries.has(change.id))store.put({...r.result,note:change.note});};return r;});}catch(e){pendingNote=change;throw e;}}
async function openEntry(id){
  try{await flushEntryNote();const found=await dbGet(id);if(!found){toast('Tegningen findes ikke længere.');show('journal');return;}entry=found;$('#entryTitle').textContent=entry.title;$('#entryImg').src=entry.img;$('#entryNote').value=entry.note||'';$('#entryDate').textContent=fmtDate(entry.created)+(entry.skillIds?.length?' · Du prøvede: '+entry.skillIds.map(id=>TECHNIQUES.find(t=>t.id===id)?.name||id).join(', '):'');show('entry');await renderAttempts();}
  catch{toast('Tegningen kunne ikke åbnes. Prøv igen.');show('journal');}
}
async function renderAttempts(){const box=$('#entryAttempts');box.replaceChildren();if(!entry?.lessonId)return;const list=(await dbAll()).filter(it=>it.lessonId===entry.lessonId).sort((a,b)=>a.created-b.created);if(list.length<2)return;const label=document.createElement('p');label.textContent='Mine forsøg · Vælg din favorit';box.append(label);for(const it of list){const b=document.createElement('button');b.className='small-control';b.textContent=fmtDate(it.created);b.onclick=()=>openEntry(it.id);box.append(b);}}
$('#entryNote').oninput=()=>{if(!entry)return;pendingNote={id:entry.id,note:$('#entryNote').value};clearTimeout(noteT);noteT=setTimeout(()=>flushEntryNote().catch(()=>toast('Noten er ikke gemt endnu.')),400);};
$('#entryBack').onclick=async()=>{try{await flushEntryNote();show('journal');}catch{toast('Noten er ikke gemt. Prøv igen.');}};
$('#entryDelete').onclick=async()=>{if(!entry||!confirm('Vil du slette denne tegning?'))return;const id=entry.id;clearTimeout(noteT);pendingNote=null;deletedEntries.add(id);try{await dbDel(id);entry=null;show('journal');}catch{deletedEntries.delete(id);toast('Tegningen kunne ikke slettes. Prøv igen.');}};
function downloadImage(src,name){const a=document.createElement('a');a.href=src;a.download=name;a.click();}
$('#entryExport').onclick=()=>{if(entry)downloadImage(entry.img,'min-tegning.jpg');};
$('#entryScan').onclick=()=>{if(entry)ScanFlow.open({src:entry.img,entryId:entry.id,lesson:LESSONS.find(l=>l.id===entry.lessonId)});};
/* ---------------- stjerner, læringssti og butik ---------------- */
// En handling får en fast nøgle. Gentagelser ændrer aldrig tidligere belønninger.
function initialWallet() {
  const claims = {}, progress = store.get(); let earned = 0;
  for (const [id, stars] of Object.entries(progress.done || {})) {
    earned += Math.max(0, Number(stars) || 0); claims['lesson:' + id] = true;
    const lesson = LESSONS.find(l => l.id === id);
    lesson?.steps.forEach((_, i) => { claims[`step:${id}:${i}`] = true; });
  }
  return { version: 1, earned, spent: 0, claims, unlocked: {}, newLessons: {} };
}
function validWallet(value) {
  return value?.version === 1 && Number.isFinite(value.earned) && Number.isFinite(value.spent) &&
    value.earned >= value.spent && value.spent >= 0 && [value.claims,value.unlocked,value.newLessons].every(v=>v && typeof v==='object' && !Array.isArray(v));
}
let wallet = readLocal('ts_wallet_v1');
if (!validWallet(wallet)) { wallet = initialWallet(); writeLocal('ts_wallet_v1', wallet); }
function latestWallet() { const saved = readLocal('ts_wallet_v1'); if (validWallet(saved)) wallet = saved; return wallet; }
function cloneWallet() { return JSON.parse(JSON.stringify(latestWallet())); }
function balance() { latestWallet(); return Math.max(0, Math.floor(wallet.earned - wallet.spent)); }
function saveWallet(next) {
  try { localStorage.setItem('ts_wallet_v1', JSON.stringify(next)); wallet = next; return true; }
  catch { toast('Stjernerne kunne ikke gemmes. Der skal være plads på enheden.'); return false; }
}
function updateWalletCounters() {
  const amount = balance();
  for (const e of document.querySelectorAll('[data-wallet], #starsTotal')) {
    if (e.dataset.amount !== String(amount) || !e.querySelector('.ui-icon')) { UI.label(e, 'star', String(amount)); e.dataset.amount = String(amount); }
    e.setAttribute('aria-label', `${amount} stjerner i din pung`);
  }
}
function awardStars(key, amount, reason) {
  const next = cloneWallet();
  if (next.claims[key] || !Number.isInteger(amount) || amount <= 0) return false;
  next.claims[key] = true; next.earned += amount;
  if (!saveWallet(next)) return false;
  updateWalletCounters(); animateStars(amount, reason); return true;
}
function animateStars(amount, reason) {
  $('#rewardStatus').textContent = `${reason}. Plus ${amount} stjerner.`;
  const counter = [...document.querySelectorAll('[data-wallet], #starsTotal')].find(e => e.closest('.screen.on'));
  const badge = document.createElement('div'); badge.className = 'star-flight'; UI.label(badge, 'star', `+${amount}`);
  badge.setAttribute('aria-hidden', 'true'); document.body.appendChild(badge);
  const end = counter?.getBoundingClientRect();
  if (!reducedMotion.matches && badge.animate) badge.animate([
    { transform: 'translate(-50%, 0) scale(1)', opacity: 1 },
    { transform: 'translate(-50%, -35px) scale(1.15)', opacity: 1, offset: .3 },
    { transform: `translate(${end ? end.left + end.width / 2 - window.innerWidth / 2 : 0}px, ${end ? end.top - window.innerHeight * .62 : -180}px) scale(.4)`, opacity: 0 }
  ], { duration: 1100, easing: 'ease-in-out' });
  setTimeout(() => badge.remove(), reducedMotion.matches ? 1100 : 1150);
}
function completedStepCount(lesson) { latestWallet(); return lesson.steps.filter((_, i) => wallet.claims[`step:${lesson.id}:${i}`]).length; }
function lessonUnlocked(lesson) { return !lesson.shop || !!latestWallet().unlocked[lesson.id]; }
window.addEventListener('storage', e => {
  if (e.key !== 'ts_wallet_v1') return;
  latestWallet(); updateWalletCounters(); if (current === 'home') renderHome(); if (current === 'shop') renderShop();
});
const COURSES = [
  { id:'forms', practiceLessonIds:['e_fisk','e_skildpadde'], goal:'Find og placér en enkel grundform', name: 'Former', icon: '◯', technique: 'construction', lesson: 'e_fisk', own: 'Find en ting med en oval form. Tegn den med lette streger.' },
  { id:'tone', practiceLessonIds:['e_aeble','e_fisk'], goal:'Samme form med lyse og mørkere lag', name: 'Let og mørkt', icon: '✏️', technique: 'contour', lesson: 'e_aeble', own: 'Tegn en anden frugt med en let hjælpelinje og et mørkere omrids.' },
  { id:'light', practiceLessonIds:['e_aeble','e_tulipan'], goal:'Find lyset og skyg på den modsatte side', name: 'Lys og skygge', icon: '🌗', technique: 'shading', lesson: 'e_aeble', own: 'Læg en lille ting på bordet. Find lyset, og tegn skyggen på den anden side.' },
  { id:'texture', practiceLessonIds:['kanin','raev'], goal:'Korte strøg der følger dyrets form', name: 'Pels og tekstur', icon: '🪶', technique: 'fur', lesson: 'kanin', own: 'Opfind et dyr med korte pelsstreger eller lange fjer.' }
];
let recommendedAction = null;
function renderLearningPath() {
  const path=$('#learningPath'),resumeBox=$('#learningResume');path.replaceChildren();resumeBox.replaceChildren();resumeBox.hidden=true;recommendedAction=null;
  const interrupted=LESSONS.filter(lessonUnlocked).filter(l=>lessonState(l)&&!lessonState(l).complete).sort((a,b)=>lessonState(b).updated-lessonState(a).updated)[0];
  let suggested=interrupted,label=interrupted?`Fortsæt ${interrupted.title} · trin ${lessonState(interrupted).step+1}`:'';
  if(interrupted){const resume=document.createElement('button');resume.className='resume-card';resume.textContent=label;resume.onclick=()=>openLesson(interrupted);resumeBox.append(resume);resumeBox.hidden=false;recommendedAction=resume.onclick;}
  for(const [i,course]of COURSES.entries()){
    const lesson=LESSONS.find(l=>l.id===course.lesson);if(!lesson)continue;
    const practised=readLocal('ts_practice_'+course.technique)>0,drawn=!!store.get().done[lesson.id],own=!!readLocal('ts_course_own_'+course.id)||!!readLocal('ts_course_own_'+i);
    const card=document.createElement('div');card.className='path-card';card.dataset.complete=String(practised&&drawn&&own);
    const title=document.createElement('strong');UI.label(title,UI.techniqueIcons[course.technique],`${i+1}. ${course.name}`);card.append(title);
    const goal=document.createElement('p');goal.textContent=course.goal;card.append(goal);
    for(const [name,complete,action]of [['Øv',practised,()=>{show('techniques');openTechnique(TECHNIQUES.find(t=>t.id===course.technique));}],['Tegn',drawn,()=>openLesson(lesson)],['Prøv selv',own,()=>openWarmup(course.own,i)]]){
      const button=document.createElement('button');button.className=complete?'path-node complete':'path-node';if(complete)UI.label(button,'check',name);else button.textContent=name;button.onclick=action;card.append(button);
      if(!complete&&!recommendedAction){recommendedAction=action;suggested=lesson;label=name==='Øv'?'Øv '+course.name:name==='Tegn'?'Tegn '+lesson.title:'Prøv din egen idé · '+course.name;}
    }
    for(const id of course.practiceLessonIds||[]){const extra=LESSONS.find(l=>l.id===id);if(!extra||extra.id===lesson.id)continue;const button=document.createElement('button');button.className='small-control';button.textContent='Prøv også '+extra.title;button.onclick=()=>openLesson(extra);card.append(button);}
    path.append(card);
  }
  if(!recommendedAction){suggested=LESSONS.find(l=>lessonUnlocked(l)&&!store.get().done[l.id])||LESSONS[0];label='Næste tegning · '+suggested.title;recommendedAction=()=>openLesson(suggested);}
  if(!interrupted&&!Object.keys(store.get().done).length&&!TECHNIQUES.some(t=>readLocal('ts_practice_'+t.id)>0)){suggested=LESSONS.find(l=>l.id==='e_fisk');label='Start med din fisk';recommendedAction=()=>openLesson(suggested);}
  const active=[...path.querySelectorAll('.path-card')].find(c=>c.dataset.complete!=='true');active?.classList.add('current-course');
  $('#heroArt').src=(suggested||LESSONS[0]).dir+'thumb.jpg';$('#pathContinue').textContent=label;
}
$('#pathContinue').onclick = () => recommendedAction?.();
function lessonSkills(lesson) { return lesson.skillIds || [...new Set((lesson.stepMeta || []).flatMap(m=>m.skillIds||[]))]; }
function challengeFor(lesson) {
  return COURSES.find(c => c.lesson === lesson.id)?.own || (lesson.cat === 'dyr' ?
    'Giv dyret et sted at bo. Tilføj tre ting i baggrunden, som du selv finder på.' :
    'Tegn en ny ting ved siden af. Brug en form eller en skygge, du lige har øvet.');
}
function practiceFor(id) {
  return ({ construction: '✏️ Tegn tre lette cirkler og tre ovaler på papiret.', contour: '✏️ Tegn en oval let. Følg kanten med et mørkere omrids.',
    shading: '✏️ Lav tre felter: lyst, mellem og mørkt. Brug flere lette lag.', fur: '✏️ Lav tre små totter pels. Løft blyanten mellem stregerne.',
    hatch: '✏️ Tegn seks parallelle streger. Prøv igen med mindre mellemrum.', cross: '✏️ Tegn seks parallelle streger. Læg seks på tværs.',
    eraser: '✏️ Tegn en let hjælpelinje. Visk midten væk med små bevægelser.', highlight: '✏️ Tegn et mørkt øje, men lad en lille plet være hvid.',
    fill: '✏️ Fyld en lille cirkel med små cirkelbevægelser.' })[id];
}
let warmupSession = null;
function openWarmup(challenge = null, course = null) {
  const focus = document.activeElement, playing = !!stepPlayer?.playing;
  if (current === 'lesson') pauseStep(); cancelStepSpeech();
  warmupSession = { focus, playing, challenge, course };
  $('#warmupTitle').textContent = challenge ? 'Prøv selv · Din egen idé' : 'Varm hånden op';
  $('#warmupModal ol').hidden = !!challenge; $('#warmupModal .warmup-samples').hidden = !!challenge;
  $('#warmupModal .warmup-card > p').textContent = 'Find papir og blyant. Der er ingen tid, du skal nå det på.';
  UI.label($('#warmupComplete'), challenge ? 'check' : 'star', challenge ? 'Jeg har prøvet min idé' : latestWallet().claims['warmup:'+today()]?'Øv igen · Jeg har prøvet':'Jeg har øvet mig · +1');
  warmupSession.exercise=0; renderWarmupExercise();
  $('#warmupModal').hidden = false; modalInert(true); $('#warmupClose').focus({ preventScroll: true });
}
let warmupFrame=0;
const WARMUP_TEXTS=['Tegn tre store, lette cirkler med hele armen.','Tegn seks rolige bølger. Løft blyanten imellem.','Lav tre felter: lyst, mellem og mørkt. Byg skyggen op i lag.'];
function renderWarmupExercise(){if(!warmupSession)return;const session=warmupSession,text=session.challenge||WARMUP_TEXTS[session.exercise];$('#warmupTask').textContent=text;$('#warmupModal ol').hidden=true;$('#warmupModal .warmup-samples').hidden=true;const id=['construction','waves','shading'][session.exercise],start=performance.now();cancelAnimationFrame(warmupFrame);const draw=now=>{if(warmupSession!==session)return;const p=reducedMotion.matches?1:Math.min(1,(now-start)/6500);TechniqueDemo.draw($('#warmupDemo'),id,p);if(p<1&&!document.hidden)warmupFrame=requestAnimationFrame(draw);};warmupFrame=requestAnimationFrame(draw);$('#warmupNext').hidden=!!session.challenge;$('#warmupNext').textContent=session.exercise<2?'Næste lille øvelse':'Vis første øvelse';}
$('#warmupRead').onclick=()=>{if(warmupSession){const text=warmupSession.challenge||WARMUP_TEXTS[warmupSession.exercise];readAloud(text,phraseFile(text));}};
$('#warmupNext').onclick=()=>{if(warmupSession){warmupSession.exercise=(warmupSession.exercise+1)%3;renderWarmupExercise();}};
function closeWarmup(resume = true) {
  const session = warmupSession; warmupSession = null;
  $('#warmupModal').hidden = true; modalInert(false); session?.focus?.focus({ preventScroll: true });
  cancelStepSpeech();cancelAnimationFrame(warmupFrame);
  if (resume && session?.playing && current === 'lesson') playStep();
}
$('#warmupBtn').onclick = $('#lessonWarmup').onclick = () => openWarmup();
$('#lessonSettings').onclick = () => { pauseStep(); $('#settingsBtn').onclick(); }; $('#warmupClose').onclick = () => closeWarmup();
$('#warmupComplete').onclick = () => {
  if (!warmupSession) return;
  if (warmupSession.challenge) completeOwnTask(COURSES[warmupSession.course]);
  else {
    const count = (readLocal('ts_warmups') || 0) + 1;
    if (awardStars('warmup:' + today(), 1, 'Din hånd er varmet op')) writeLocal('ts_warmups', count);
  }
  markActive(); closeWarmup(); if (current === 'home') renderLearningPath();
};
for (const b of document.querySelectorAll('[data-assess]')) b.onclick = () => {
  assessment=b.dataset.assess;saveLesson();
  document.querySelectorAll('[data-assess]').forEach(e => e.setAttribute('aria-pressed', e === b ? 'true' : 'false'));
  $('#assessmentTip').hidden = false;
  $('#supportChoices').hidden=b.dataset.assess!=='help';
  const skills=lessonSkills(L);for(const choice of document.querySelectorAll('[data-support-skill]'))choice.hidden=!['construction','contour',...skills].includes(choice.dataset.supportSkill);
  const attempt=attemptId,answer=assessment;dbAll().then(items=>Promise.all(items.filter(it=>it.attemptId===attempt).map(it=>dbPut({...it,selfAssessment:answer})))).catch(()=>toast('Vurderingen er ikke gemt endnu.')); 
  $('#assessmentTip').textContent = ({ easy: 'Du valgte “Det gik let”. Prøv din egen variation nedenfor.', practice: 'Du valgte mere øvelse. Prøv samme motiv igen med lettere hjælpelinjer.', help: 'Hvad vil du øve? Vælg en lille øvelse herunder.' })[b.dataset.assess];
};
function completeOwnTask(course){if(!course)return;writeLocal('ts_course_own_'+course.id,true);writeLocal('ts_variation_'+course.lesson,true);renderLearningPath();}
$('#ownTried').onclick = () => { COURSES.filter(c=>c.lesson===L.id).forEach(completeOwnTask); writeLocal('ts_variation_' + L.id, true); $('#ownTried').disabled = true; toast('Du prøvede din egen idé ✨'); };
let pendingUnlock = null, unlockFocus = null;
function renderShop() {
  updateWalletCounters(); const grid = $('#shopGrid'); grid.replaceChildren();
  const lessons = LESSONS.filter(l => l.shop); $('#shopEmpty').hidden = !!lessons.length;
  for (const l of lessons) {
    const unlocked = lessonUnlocked(l), card = document.createElement('article'); card.className = 'shop-card' + (unlocked ? ' unlocked' : ' locked');
    const art = document.createElement('div'); art.className = 'shop-art';
    const img = document.createElement('img'); img.src = `${l.dir}step${l.steps.length}.jpg`; img.alt = l.title; img.loading = 'lazy'; img.width = img.height = 400;
    art.appendChild(img);
    if (!unlocked) { const lock = document.createElement('span'); lock.className = 'shop-lock'; UI.label(lock, 'lock', l.price + ' stjerner'); art.appendChild(lock); }
    const name = document.createElement('h2'); name.textContent = l.title;
    const meta = document.createElement('p'); meta.textContent = `${LEVELS.find(x => x.id === l.level).name} · ${l.steps.length} trin`;
    const button = document.createElement('button'); button.className = 'btn' + (unlocked || balance() >= l.price ? ' primary' : '');
    UI.label(button, unlocked ? 'next' : 'star', unlocked ? 'Tegn nu' : balance() >= l.price ? `Lås op · ${l.price}` : `Spar ${l.price - balance()} mere op`);
    button.disabled = !unlocked && balance() < l.price;
    button.onclick = () => unlocked ? openLesson(l) : askUnlock(l);
    card.append(art, name, meta, button); grid.appendChild(card);
  }
  StickerBook.renderShop();
}
function askUnlock(lesson) {
  if (!lesson.shop || lessonUnlocked(lesson)) return;
  pendingUnlock = lesson; unlockFocus = document.activeElement;
  $('#unlockTitle').textContent = lesson.stickerScene ? 'Lås siden op?' : 'Lås tegningen op?';
  $('#unlockArt').src = lesson.stickerScene ? lesson.art : `${lesson.dir}step${lesson.steps.length}.jpg`;
  $('#unlockArt').alt = lesson.title;
  $('#unlockText').textContent = `Brug ${lesson.price} stjerner på ${lesson.title.toLowerCase()}? Så har du ${Math.max(0, balance() - lesson.price)} stjerner tilbage.`;
  $('#unlockConfirm').disabled = balance() < lesson.price;
  $('#unlockModal').hidden = false; modalInert(true); $('#unlockCancel').focus({ preventScroll: true });
}
function closeUnlock() { pendingUnlock = null; $('#unlockModal').hidden = true; modalInert(false); unlockFocus?.focus({ preventScroll: true }); }
$('#unlockClose').onclick = $('#unlockCancel').onclick = closeUnlock;
$('#unlockConfirm').onclick = () => {
  const lesson = pendingUnlock; if (!lesson) return;
  const next = cloneWallet();
  if (next.unlocked[lesson.id] || !Number.isInteger(lesson.price) || lesson.price < 1 || next.earned - next.spent < lesson.price) { closeUnlock(); renderShop(); return; }
  next.spent += lesson.price; next.unlocked[lesson.id] = Date.now();
  if (!lesson.stickerScene) next.newLessons[lesson.id] = true;
  if (!saveWallet(next)) return;
  closeUnlock(); renderShop();
  if (lesson.stickerScene) { StickerBook.goTo(lesson.sceneId); show('stickerbook'); toast(`${lesson.title} er klar i din bog!`); }
  else toast(`${lesson.title} er låst op! Find den på forsiden ✨`);
  confetti();
};

/* ---------------- lektionens lille introduktion ---------------- */
let introPending = false, introLessonId = '', introTimer = 0, introAfter = null;
function startLessonIntro(player,start){
  introPending=false; introAfter=null; $('#lessonIntro').hidden=true;
  if(!document.hidden)start();
}
function finishLessonIntro(){
  if(document.hidden)return;const start=introAfter;introAfter=null;$('#lessonIntro').hidden=true;$('#nextBtn').disabled=false;if(start&&current==='lesson')start();
}
function cancelLessonIntro() { clearTimeout(introTimer); introTimer = 0; introAfter = null; $('#lessonIntro').hidden = true; $('#introArt').onload = $('#introArt').onerror = null; }

/* ---------------- rolig, syntetisk blyantslyd ---------------- */
const pencilSound = {
  enabled: readLocal('ts_pencil_sound') !== false, context: null, gain: null, filter: null, timer: 0,
  unlock() {
    if (!this.enabled || document.hidden || !['lesson','techniques'].includes(current)) return;
    try {
      if (!this.context) {
        const Context = window.AudioContext || window.webkitAudioContext; if (!Context) return;
        const ctx = this.context = new Context(), buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource(); noise.buffer = buffer; noise.loop = true;
        this.filter = ctx.createBiquadFilter(); this.filter.type = 'bandpass'; this.filter.frequency.value = 1800; this.filter.Q.value = .65;
        this.gain = ctx.createGain(); this.gain.gain.value = 0;
        noise.connect(this.filter); this.filter.connect(this.gain); this.gain.connect(ctx.destination); noise.start();
      }
      if (this.context.state !== 'running') this.context.resume().catch(() => {});
    } catch {}
  },
  update(speed, pressure = 'mellem', erasing = false) {
    if (!this.gain || !this.enabled || document.hidden || speed <= .01) { this.stop(); return; }
    const ctx = this.context, force = { let: .3, mellem: .6, hårdt: 1 }[pressure] || .6;
    const speaking = voiceRequest && !voiceRequest.paused ? .3 : 1;
    const volume = Math.min(.018, speed / 180 * .012) * force * speaking * (erasing ? .7 : 1);
    this.filter.frequency.setTargetAtTime(erasing ? 650 : 1600 + Math.min(900, speed * 3), ctx.currentTime, .06);
    this.gain.gain.setTargetAtTime(volume, ctx.currentTime, .035);
    clearTimeout(this.timer); this.timer = setTimeout(() => this.stop(), 130);
  },
  stop() { clearTimeout(this.timer); if (this.gain) this.gain.gain.setTargetAtTime(0, this.context.currentTime, .025); }
};
document.addEventListener('pointerdown', () => pencilSound.unlock(), { capture: true, passive: true });
document.addEventListener('touchend', () => pencilSound.unlock(), { capture: true, passive: true });
document.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') pencilSound.unlock(); });
let gentleCamera = readLocal('ts_gentle_camera') !== false;

// Lille gentaget papirstruktur beregnes én gang, aldrig i afspilningssløjfen.
function makePaper() {
  const c = playerCanvas(128), ctx = c.getContext('2d'), pixels = ctx.createImageData(128, 128);
  let seed = 7919;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0; const grain = seed % 5;
    pixels.data[i] = 255 - grain; pixels.data[i + 1] = 253 - grain; pixels.data[i + 2] = 248 - grain; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0); $('#guideCamera').style.backgroundImage = `url(${c.toDataURL()})`;
}
makePaper();

// Offline is an explicit verified lesson package, independent of decorative assets.
const lessonDownloads = new Map();
function updateOfflineDownload() {
  if (!L) return;
  const task=lessonDownloads.get(L.id),saved=readLocal('ts_offline_'+L.id);
  $('#downloadLesson').disabled=!!task?.pending;
  $('#offlineStatus').textContent=task?.status || (saved?.revision===L.revision && saved?.build==='1793715603' ? 'Klar uden internet ✓' : '');
}
$('#downloadLesson').onclick=async()=>{
  const lesson=L;if(!lesson||lessonDownloads.get(lesson.id)?.pending)return;
  const task={pending:true,status:'Gør hele lektionen klar…'};lessonDownloads.set(lesson.id,task);updateOfflineDownload();
  const status=text=>{task.status=text;if(L?.id===lesson.id)updateOfflineDownload();};
  let port;
  try {
    if(!navigator.serviceWorker)throw Error('Åbn appen over HTTPS for at gemme uden internet.');
    const registration=await navigator.serviceWorker.ready,worker=navigator.serviceWorker.controller||registration.active;
    if(!worker)throw Error('Prøv igen om lidt.');
    const channel=new MessageChannel();port=channel.port1;
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Download tog for lang tid. Prøv igen.')),180000);
      port.onmessage=e=>{const result=e.data;
        if(result.error){clearTimeout(timer);reject(Error(result.error));}
        else if(result.complete){clearTimeout(timer);writeLocal('ts_offline_'+lesson.id,{revision:result.revision,build:'1793715603',updated:Date.now()});status('Klar uden internet ✓');resolve();}
        else status(`Gemmer ${result.progress} af ${result.total} filer`);
      };
      worker.postMessage({type:'DOWNLOAD_LESSON',id:lesson.id,revision:lesson.revision},[channel.port2]);
    });
  } catch(error) { status(error.message); }
  finally { port?.close();task.pending=false;if(L?.id===lesson.id)updateOfflineDownload(); }
};
for(const button of document.querySelectorAll('[data-shop-kind]'))button.onclick=()=>{const worlds=button.dataset.shopKind==='worlds';$('#shop').classList.toggle('show-worlds',worlds);for(const other of document.querySelectorAll('[data-shop-kind]'))other.setAttribute('aria-pressed',String(other===button));};
// A self-contained placeholder also works when the shell is offline.
const imagePlaceholder='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><rect width="160" height="120" rx="12" fill="#f1edfd"/><path d="m57 78 8-23 30-30 12 12-30 30-20 11Z" fill="none" stroke="#756486" stroke-width="5" stroke-linejoin="round"/></svg>');
document.addEventListener('error',e=>{
  const image=e.target;
  if(image.tagName!=='IMG'||!image.src||image.dataset.fallback)return;
  image.dataset.retrySrc=image.src;image.dataset.retryAlt=image.alt;image.dataset.fallback='true';
  image.src=imagePlaceholder;
},true);
window.addEventListener('online',()=>{
  for(const image of document.querySelectorAll('img[data-retry-src]')){
    const src=image.dataset.retrySrc;
    image.alt=image.dataset.retryAlt||'';
    delete image.dataset.fallback;delete image.dataset.retrySrc;delete image.dataset.retryAlt;
    image.src=src;
  }
});
let historyReady=false;
window.addEventListener('popstate',e=>{
  // Android's Back button can navigate while the document behind a dialog is
  // inert. Tear down overlays (and camera tracks) before restoring the screen.
  ScanFlow.close(); StickerBook.closePhoto();
  if (!$('#settingsModal').hidden) closeSettings();
  if (!$('#warmupModal').hidden) closeWarmup();
  if (!$('#unlockModal').hidden) closeUnlock();
  if (!$('#modeModal').hidden) closeModePicker(false);
  if (techniqueSession) closeTechnique(false);
  historyReady=false;const screen=e.state?.screen;
  if(screen&&document.getElementById(screen)?.classList.contains('screen'))show(screen);else show('home');
  historyReady=true;
});
/* ---------------- start ---------------- */
// Gem også en streg, hvis appen lukkes midt i tegningen.
function saveBeforeHide() {
  StickerBook.suspend();
  pencilSound.stop();
  clearTimeout(introTimer); DraftStore.flush(); flushEntryNote().catch(()=>{});
  if(current==='lesson')saveLesson();
  if (current === 'lesson') { sidePad.finishStroke(); tracePad.finishStroke(); pauseStep(); cancelStepSpeech(); }
  else cancelStepSpeech();
  stopLessonAwake(false);
  cancelAnimationFrame(camera.frame); camera.frame = 0;
  cancelAnimationFrame(techniqueFrame); techniqueFrame = 0;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveBeforeHide();
  else {
    if (current === 'stickerbook') StickerBook.resume();
    keepLessonAwake();
    if (techniqueSession) techniqueFrame = requestAnimationFrame(drawTechniqueDemo);
    if (current === 'lesson') camera.frame = requestAnimationFrame(paintCamera);
  }
});
window.addEventListener('pagehide', saveBeforeHide);
window.addEventListener('pageshow', () => keepLessonAwake());
// Browserzoom er tilladt; kun tegnefladerne reserverer berøringer.
if ('serviceWorker' in navigator && window.isSecureContext) {
  // Keep an existing page running safely; new navigations use one complete shell.
  navigator.serviceWorker.register('sw.js', {updateViaCache:'none'}).then(reg=>{
    const activate=()=>reg.waiting?.postMessage({type:'SKIP_WAITING'});
    activate();reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')activate();});});
    reg.update().catch(()=>{});
  }).catch(() => {});
}
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch {}
const savedScreen = readLocal('ts_screen');
StickerBook.init();
ScanFlow.init();
const savedLesson = savedScreen && savedScreen.screen === 'lesson' && LESSONS.find(l => l.id === savedScreen.lessonId);
if (savedLesson) openLesson(savedLesson);
else show(savedScreen && ['home', 'shop', 'journal', 'entry', 'stickerbook'].includes(savedScreen.screen) ?
  (savedScreen.screen === 'entry' ? 'journal' : savedScreen.screen) : 'home');

history.replaceState({screen:current},'', '#'+current);historyReady=true;
