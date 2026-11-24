import { getService } from './categories.js';
export function targetVariation(location) {
  const route = /^\/([a-z-]+)\/menu\/[^/]+\/?$/.exec(location.pathname);
  if (location.origin !== 'https://snappfood.ir' || !route || !getService(route[1])) return null;
  return /^#sf-food=([1-9]\d{0,17})$/.exec(location.hash)?.[1] ?? null;
}

// Scroll through lazy menu sections without clicking categories or order controls.
export function installFoodFocus(win = window, doc = document) {
  let observer = null, deadline = null, stepTimer = null, highlightTimer = null, cleanup = null, cancelSeek = null;
  const clear = () => {
    observer?.disconnect(); observer = null;
    clearTimeout(deadline); clearTimeout(stepTimer); clearTimeout(highlightTimer);
    cancelSeek?.(); cancelSeek = null; cleanup?.(); cleanup = null;
  };
  let pendingVisibility = false;
  const start = () => {
    clear(); const id = targetVariation(win.location); if (!id) return;
    if (doc.hidden) { pendingVisibility=true; return; }
    pendingVisibility=false;
    let finished = false, steps = 0, stableBottom = 0, lastHeight = 0;
    const stopSeek = () => {
      finished = true; observer?.disconnect(); observer = null;
      clearTimeout(deadline); clearTimeout(stepTimer); cancelSeek?.(); cancelSeek = null;
    };
    const focus = () => {
      if (finished || targetVariation(win.location) !== id) return false;
      if (doc.hidden) return false;
      const candidates = doc.querySelectorAll?.(`[id="${id}"],[data-variation-id="${id}"]`) ?? [doc.getElementById(id)];
      const item = [...candidates].find(el => el && (!el.getBoundingClientRect || (el.getBoundingClientRect().width>0 && el.getBoundingClientRect().height>0)));
      if (!item) return false;
      stopSeek();
      const reduceMotion = win.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const previous = { outline: item.style.outline, offset: item.style.outlineOffset, radius: item.style.borderRadius, margin: item.style.scrollMarginTop };
      item.style.outline = '3px solid #548c63'; item.style.outlineOffset = '7px'; item.style.borderRadius = '10px'; item.style.scrollMarginTop = '100px';
      item.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'center' });
      cleanup = () => { item.style.outline = previous.outline; item.style.outlineOffset = previous.offset; item.style.borderRadius = previous.radius; item.style.scrollMarginTop = previous.margin; };
      highlightTimer = setTimeout(() => { cleanup?.(); cleanup = null; }, 12000);
      return true;
    };
    if (focus()) return;
    const cancel = event => { if (!event || event.type !== 'keydown' || ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Escape'].includes(event.key)) stopSeek(); };
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) win.addEventListener(type, cancel, { passive: true });
    cancelSeek = () => { for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) win.removeEventListener(type, cancel); };
    const seek = () => {
      if (finished) return;
      if (doc.hidden) { stopSeek(); pendingVisibility=true; return; }
      if (targetVariation(win.location) !== id || ++steps > 55) { stopSeek(); return; }
      if (focus()) return;
      const main = doc.getElementById('main-container');
      const root = main && main.scrollHeight > main.clientHeight + 8 ? main : doc.scrollingElement ?? doc.documentElement;
      if (root && (root.scrollTo || win.scrollBy)) {
        const height = root.scrollHeight, top = root.scrollTop ?? win.scrollY ?? 0;
        const viewport = root.clientHeight || win.innerHeight || 700;
        stableBottom = top + viewport >= height - 8 && height === lastHeight ? stableBottom + 1 : 0;
        lastHeight = height;
        if (stableBottom >= 6) { stopSeek(); return; }
        // Overlap retains intersection-observer sentinels between steps.
        if (root.scrollTo) root.scrollTo({top:top+Math.max(240,Math.round(viewport*.65)),behavior:'instant'});
        else win.scrollBy({ top: Math.max(240, Math.round(viewport * .65)), behavior: 'instant' });
      }
      stepTimer = setTimeout(seek, 700);
    };
    const Observer = win.MutationObserver ?? globalThis.MutationObserver;
    if (Observer) { observer = new Observer(focus); observer.observe(doc.documentElement, { childList: true, subtree: true }); }
    deadline = setTimeout(stopSeek, 45000);
    stepTimer = setTimeout(seek, 1200);
  };
  const onVisible=()=>{if (!doc.hidden && pendingVisibility) start();};
  doc.addEventListener?.('visibilitychange',onVisible);
  win.addEventListener('hashchange', start); win.addEventListener('popstate', start); start();
  return () => { clear(); doc.removeEventListener?.('visibilitychange',onVisible); win.removeEventListener('hashchange', start); win.removeEventListener('popstate', start); };
}
