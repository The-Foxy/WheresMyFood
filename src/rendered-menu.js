import { getService } from './categories.js';
// Serialized into a temporary Snappfood menu tab. Read only public rendered
// food prices; never inspect account storage, cookies, basket or app state.
export function renderedMenuStep(move = false, code = null, service = 'restaurant') {
  if (code && (location.origin !== 'https://snappfood.ir' || !new RegExp('/'+service+'/menu/(?:'+code+'|[^/]+-r-'+code+')/?$').test(location.pathname))) return {quotes:[],height:0,top:0,viewport:0,atBottom:false};
  const parse = value => {
    if (value == null || value === '') return null;
    const n = Number(String(value).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[,٬\s]/g,''));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const quotes = [];
  for (const el of document.querySelectorAll('[data-variation-id][data-discounted-price]')) {
    const id = el.getAttribute('data-variation-id');
    const price = parse(el.getAttribute('data-discounted-price'));
    const box = el.getBoundingClientRect();
    if (!/^[1-9]\d{0,17}$/.test(id ?? '') || price === null || !box.width || !box.height) continue;
    const originalPrice = parse(el.getAttribute('data-product-price') ?? el.getAttribute('data-product-fee'));
    if (originalPrice !== null && price > originalPrice) continue;
    const proPercent = parse(el.getAttribute('data-pro-discount-percent'));
    quotes.push({ id, price: Math.round(price), originalPrice, proPercent: proPercent !== null && proPercent <= 100 ? proPercent : null });
  }
  const main = document.getElementById('main-container');
  const root = main && main.scrollHeight > main.clientHeight + 8 ? main : document.scrollingElement;
  const height = root?.scrollHeight ?? 0, viewport = root?.clientHeight ?? 0, top = root?.scrollTop ?? 0;
  const atBottom = viewport > 0 && top + viewport >= height - 8;
  if (move && root && !atBottom) root.scrollTo({ top: top + Math.max(240, Math.round(viewport * .7)), behavior: 'instant' });
  return { quotes, height, top, viewport, atBottom };
}
export async function readRenderedMenu(api, code, signal, pause = ms => new Promise(resolve => setTimeout(resolve, ms)), service = 'restaurant') {
  if (!getService(service)) throw Error('این بخش پشتیبانی نمی‌شه.');
  if (!/^[a-zA-Z0-9]{3,12}$/.test(code)) throw Error('شناسهٔ رستوران معتبر نیست.');
  let tab, last = '', stable = 0, count = 0;
  const prices = new Map(), deadline=Date.now()+45000;
  const abort = () => { if (tab?.id) void api.tabs.remove(tab.id).catch(() => {}); };
  signal?.addEventListener('abort', abort, {once:true});
  try {
    signal?.throwIfAborted();
    tab = await api.tabs.create({ url: `https://snappfood.ir/${service}/menu/${code}/`, active: false });
    signal?.throwIfAborted();
    for (let step = 0; step < 90 && Date.now()<deadline; step++) {
      await pause(500); signal?.throwIfAborted();
      let value;
      try { value = (await api.scripting.executeScript({ target: {tabId:tab.id}, world:'MAIN', func:renderedMenuStep, args:[true,code,service] }))[0]?.result; }
      catch (e) { signal?.throwIfAborted(); if (!prices.size && step < 25) continue; throw Error('خواندن صفحهٔ منوی رستوران قطع شد؛ می‌تونی دوباره تلاش کنی.'); }
      if (!value) continue;
      for (const q of value.quotes ?? []) { const old = prices.get(q.id); if (!old || q.price < old.price) prices.set(q.id,q); }
      const signature = `${value.height}:${value.top}:${prices.size}`;
      stable = prices.size && value.atBottom && signature === last && prices.size === count ? stable+1 : 0;
      last = signature; count = prices.size;
      if (stable >= 4) return { quotes:[...prices.values()], complete:true };
    }
    if (!prices.size) throw Error('قیمت‌های صفحهٔ منوی رستوران بارگذاری نشدن؛ این منو کامل حساب نشد.');
    return {quotes:[...prices.values()],complete:false};
  } finally {
    signal?.removeEventListener('abort',abort);
    if (tab?.id) await api.tabs.remove(tab.id).catch(() => {});
  }
}
