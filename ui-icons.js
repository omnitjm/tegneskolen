'use strict';

// Original, local vector artwork. Every control uses this 24 px / 2 px icon set.
const UI = (() => {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10H3Z M9 20v-7h6v7"/>',
    pencil: '<path d="m4 16-1 5 5-1L20 8l-4-4Z M13 7l4 4 M4 16l4 4 M16 4l2-2 4 4-2 2"/>',
    play: '<path d="m8 4 13 8-13 8Z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M7 5v14M17 5v14" stroke-width="4"/>',
    speed: '<path d="M4 18a9 9 0 1 1 16 0 M12 13l5-6 M6 15h1 M5 9l1 1 M11 4v2 M18 14h1"/><circle cx="12" cy="13" r="2"/>',
    sound: '<path d="m11 4-5 5H3v6h3l5 5Z M15 8c3 2 3 6 0 8 M18 4c6 4 6 12 0 16"/>',
    mute: '<path d="m11 4-5 5H3v6h3l5 5Z M16 9l6 6 M22 9l-6 6"/>',
    settings: '<path d="m10 3-1 3-3 1-3 3 2 2-1 3 3 3 3-1 2 3 4-1 1-3 3-1v-4l-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
    shop: '<path d="M4 8h16l1 13H3Z M8 8V6a4 4 0 0 1 8 0v2"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3 M12 15v2"/>',
    journal: '<path d="M5 3h14v18H5Z M3 7h4 M3 12h4 M3 17h4 M10 7h5 M10 11h5"/>',
    stickers: '<path d="M20 14V4H4v16h10Z M14 20v-6h6"/><path d="m8 8 1 2 2-1 M9 14h1"/>',
    techniques: '<path d="m3 17 5-5 4 4 9-9 M15 7h6v6 M3 4h5 M3 8h3 M17 20h4"/>',
    back: '<path d="m14 5-7 7 7 7"/>',
    next: '<path d="m10 5 7 7-7 7"/>',
    close: '<path d="m6 6 12 12 M18 6 6 18"/>',
    replay: '<path d="M4 9a8 8 0 1 1 0 6 M4 3v6h6"/>',
    undo: '<path d="m8 4-5 5 5 5 M3 9h11a6 6 0 0 1 0 12"/>',
    eraser: '<path d="m3 15 10-12 8 7-9 11H9Z M8 9l8 7 M12 21h9"/>',
    camera: '<path d="M3 7h5l2-3h4l2 3h5v14H3Z"/><circle cx="12" cy="13" r="4"/>',
    save: '<path d="M4 3h13l4 4v14H4Z M8 3v6h8V3 M8 21v-7h9v7"/>',
    plus: '<path d="M12 4v16 M4 12h16"/>',
    trash: '<path d="M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14q4 5 8 0 M8 9h.01 M16 9h.01"/>',
    help: '<path d="M21 11a9 9 0 0 1-9 9H4l1-5a9 9 0 1 1 16-4Z M9 8a3 3 0 1 1 4 3v2 M13 16h.01"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M19 5l-1 1 M6 18l-1 1"/>',
    zoom: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6 M7 10h6 M10 7v6"/>',
    video: '<rect x="3" y="6" width="12" height="13" rx="3"/><path d="m15 10 6-4v13l-6-4"/>',
    wait: '<path d="M7 12V5a2 2 0 0 1 4 0v6 M11 5V3a2 2 0 0 1 4 0v8 M15 6a2 2 0 0 1 4 0v7 M7 10 5 9q-3-1-2 2l4 8q1 2 4 2h4q5-1 5-6v-4"/>',
    paper: '<path d="M5 3h10l5 5v13H5Z M15 3v5h5 M9 12h7 M9 16h5"/>',
    trace: '<path d="M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5 M8 12h8 M12 8v8"/>',
    shapes: '<circle cx="8" cy="8" r="5"/><path d="m13 10 8 11H6Z"/>',
    feather: '<path d="M4 21 17 5 M7 17q-6-9 4-13 7-3 10-1 1 11-8 14Z M10 13V8 M10 13h6"/>',
    shade: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none"/>',
    hatch: '<path d="m3 10 7-7 M3 17 17 3 M7 21 21 7 M14 21l7-7"/>',
    cross: '<path d="m4 10 6-6 M4 18 18 4 M12 20l8-8 M4 12l8 8 M4 4l16 16 M12 4l8 8"/>',
    sparkle: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',
    dot: '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>',
    leaf: '<path d="M3 20 18 5 M5 17C-2 6 9 2 21 3c0 11-4 20-16 14Z M11 12h6 M11 12V7"/>',
    paw: '<ellipse cx="12" cy="16" rx="6" ry="5"/><path d="M5 6v2 M10 3v3 M15 3v3 M20 6v2" stroke-width="4"/>',
    flame: '<path d="M12 2c1 6 7 7 7 13a7 7 0 0 1-14 0c0-3 2-5 4-7v5c3-3 3-7 3-11Z"/>',
    wave: '<path d="M2 8q3-6 6 0t6 0 6 0 M2 16q3-6 6 0t6 0 6 0"/>',
    pressure: '<path d="M4 6h16 M4 12h16 M4 19h16"/><path d="M4 19h16" stroke-width="4"/>',
  };
  const techniqueIcons = { construction: 'shapes', contour: 'pencil', fill: 'dot', fur: 'feather', hatch: 'hatch', cross: 'cross', shading: 'shade', highlight: 'sparkle', eraser: 'eraser' };
  function icon(name, className = '') {
    return `<svg class="ui-icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.pencil}</svg>`;
  }
  function label(element, name, text) {
    element.innerHTML = icon(name);
    element.appendChild(document.createTextNode(text));
    if (name === 'star' && /\d/.test(text) && !/stjerner?/.test(text)) {
      const unit = document.createElement('span'); unit.className = 'sr-only';
      unit.textContent = /(?:^|\D)1$/.test(text) ? ' stjerne' : ' stjerner';
      element.appendChild(unit);
    }
  }
  function controlIcon(element, name) {
    if (element.dataset.uiIcon === name) return;
    element.innerHTML = icon(name);
    element.dataset.uiIcon = name;
  }
  // Spoken phrases keep their exact filenames; only transient UI text is cleaned.
  function plain(text) {
    return text.replace(/⭐/g, 'stjerner').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').trim();
  }
  // Blyant-Bo: an original golden pencil, four expressions, no generated imagery.
  function mascot(pose = 'wave') {
    const arms = {
      wave: 'M48 91Q22 87 27 55 M98 94q23 3 22 20',
      cheer: 'M48 91 24 62 M98 91l25-29',
      think: 'M48 96q-18 22 1 26 M98 99q24 14-8 20',
      calm: 'M48 97q-18 4-20 24 M98 97q18 4 20 24',
    };
    const eyes = pose === 'cheer' ? '<path d="m60 85 5-4 5 4 M82 85l5-4 5 4"/>' : '<path d="M64 82v5 M86 82v5"/>';
    const mouth = pose === 'think' ? '<path d="M73 100h6"/>' : '<path d="M68 98q7 10 15 0"/>';
    return `<svg class="mascot-art" viewBox="0 0 152 200" aria-hidden="true" focusable="false"><g fill="none" stroke="#25233D" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="${arms[pose] || arms.wave}"/><path d="m61 161-8 16H41 M85 161l9 16h12"/></g><path d="M48 52h50v88l-25 30-25-30Z" fill="#FFD36C"/><path d="M48 52h13v88l12 30-25-30Z" fill="#EDB94D"/><path d="M48 140h50l-25 30Z" fill="#F6E8CB"/><path d="m63 158 10 12 10-12Z" fill="#25233D"/><path d="M48 52V36q0-12 12-12h26q12 0 12 12v16Z" fill="#F18D83"/><path d="M48 48h50v12H48Z" fill="#E9E5F7"/><g fill="none" stroke="#25233D" stroke-width="4" stroke-linecap="round">${eyes}${mouth}</g>${pose === 'think' ? '<path d="M112 34q15-8 16 3 0 6-7 8v5 M121 58v1" fill="none" stroke="#6435CF" stroke-width="4" stroke-linecap="round"/>' : ''}${pose === 'cheer' ? '<path d="m24 28 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z M120 17l3 6 6 3-6 3-3 6-3-6-6-3 6-3Z" fill="#6435CF"/>' : ''}</svg>`;
  }
  function mount() {
    document.querySelectorAll('[data-icon]').forEach(el => {
      // Keep tab highlight / empty-state containers, remove needless text wrappers.
      if (el.tagName === 'SPAN' && !el.className && !el.parentElement.matches('.tabbar button')) el.outerHTML = icon(el.dataset.icon);
      else el.innerHTML = icon(el.dataset.icon);
    });
    document.querySelectorAll('[data-mascot]').forEach(el => { el.innerHTML = mascot(el.dataset.mascot); });
  }
  mount();
  return { icon, label, controlIcon, plain, mascot, techniqueIcons };
})();
