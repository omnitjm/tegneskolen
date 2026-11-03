'use strict';
// Progressive enhancements: all teaching works without installation or haptics.
const AppPlatform = (() => {
  // The app uses a single corner radius; keep those teaching paths working on
  // older iPads whose Canvas 2D implementation predates roundRect.
  if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x,y,width,height,radius=0) {
      if (width < 0) { x += width; width = -width; }
      if (height < 0) { y += height; height = -height; }
      const r = Math.max(0,Math.min(Number(Array.isArray(radius)?radius[0]:radius)||0,width/2,height/2));
      this.moveTo(x+r,y); this.lineTo(x+width-r,y); this.quadraticCurveTo(x+width,y,x+width,y+r);
      this.lineTo(x+width,y+height-r); this.quadraticCurveTo(x+width,y+height,x+width-r,y+height);
      this.lineTo(x+r,y+height); this.quadraticCurveTo(x,y+height,x,y+height-r);
      this.lineTo(x,y+r); this.quadraticCurveTo(x,y,x+r,y); this.closePath();
    };
  }
  document.querySelectorAll('label').forEach(label => {
    const file = label.querySelector('input[type="file"]');
    if (!file) return;
    label.tabIndex = 0; label.setAttribute('role', 'button');
    label.addEventListener('keydown', event => {
      if (event.target === label && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault(); file.click();
      }
    });
  });
  let installPrompt = null, haptics = false;
  try { haptics = JSON.parse(localStorage.getItem('ts_haptics')) === true; } catch {}
  const install = document.getElementById('installApp');
  const help = document.getElementById('installHelp');
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  function updateInstall() { install.hidden = !!standalone(); help.hidden = !!standalone(); }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event; updateInstall();
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; install.hidden = help.hidden = true; });
  install.onclick = async () => {
    if (!installPrompt) {
      help.hidden = false;
      help.textContent = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
        ? 'Tryk på Del i Safari, og vælg “Føj til hjemmeskærm”.'
        : 'Åbn browserens menu ⋮, og vælg “Føj til startskærm” eller “Installer app”.';
      return;
    }
    const prompt = installPrompt; installPrompt = null;
    try { await prompt.prompt(); await prompt.userChoice; } catch {}
    updateInstall();
  };
  const toggle = document.getElementById('settingHaptics');
  toggle.closest('label').hidden = typeof navigator.vibrate !== 'function';
  toggle.checked = haptics;
  toggle.onchange = () => {
    haptics = toggle.checked;
    try { localStorage.setItem('ts_haptics', JSON.stringify(haptics)); } catch {}
    feedback();
  };
  function feedback() {
    if (!haptics || document.hidden) return;
    try { navigator.vibrate?.(12); } catch {}
  }
  document.addEventListener('click', event => {
    if (event.target.closest('button:not(:disabled), label.btn')) feedback();
  }, { passive: true });
  updateInstall();
  return { feedback };
})();
