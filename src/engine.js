import { SourceError, vendorPage, eligible, menuItems, exclusionReason, validateFilters } from './core.js';

export function contextKey(c) { return `${c.lat}:${c.long}`; }
export function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Stopped', 'AbortError')); return; }
    const stop = () => { clearTimeout(timer); reject(new DOMException('Stopped', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, ms);
    signal?.addEventListener('abort', stop, { once: true });
  });
}

export class Scanner {
  constructor(transport, emit, { pause = 450, maxPages = 100 } = {}) { this.transport = transport; this.emit = emit; this.pause = pause; this.maxPages = maxPages; this.controller = null; this.checkpoint = null; }
  stop() { this.controller?.abort(); }
  async run(input, resume = false) {
    if (this.controller) return;
    const filters = validateFilters(input);
    this.controller = new AbortController(); const signal = this.controller.signal;
    let context;
    try { context = await this.transport.context(); signal.throwIfAborted(); } catch (e) { this.controller = null; throw e; }
    const { sort, ...searchFilters } = filters;
    const identity = JSON.stringify([contextKey(context), searchFilters]);
    if (!resume || this.checkpoint?.identity !== identity) this.checkpoint = { identity, context, filters, page: 0, vendors: new Map(), seenPages: new Set(), listed: false, done: new Set(), rows: new Map(), menuStats: new Map(), errors: [], notes: [], requests: 0, started: Date.now() };
    const c = this.checkpoint;
    if (c.retryAt && c.retryAt > Date.now()) { this.controller = null; throw new SourceError('هنوز زمان مجاز تلاش دوباره نرسیده.', { retryAt: c.retryAt }); }
    c.lastError = ''; let rejectedMenus = 0;
    let state = 'listing';
    const update = () => {
      const audit = { totalOptions: 0, availableOptions: 0, unavailable: 0, unknownPrice: 0, missingIds: 0, closedMenu: 0, price: 0, query: 0, extras: 0, time: 0, rating: 0, matched: 0 };
      for (const stats of c.menuStats.values()) for (const key of Object.keys(audit)) audit[key] += stats[key] ?? 0;
      this.emit({ state, page: c.page, vendors: c.vendors.size, eligible: [...c.vendors.values()].filter(v => eligible(v, filters)).length,
        checked: c.done.size, rows: [...c.rows.values()], audit, errors: [...c.errors], notes: [...c.notes], message: c.lastError, requests: c.requests, elapsed: Date.now() - c.started, retryAt: c.retryAt ?? null });
    };
    const checkLocation = async () => {
      signal.throwIfAborted(); const live = await this.transport.context();
      if (contextKey(live) !== contextKey(context)) throw new SourceError('آدرس اسنپ‌فود عوض شد؛ دوباره جستجو کن.', { locationChanged: true, fatal: true });
    };
    const read = async (operation, values) => {
      signal.throwIfAborted(); await abortableDelay(this.pause, signal);
      c.requests++; const result = await this.transport.read(operation, { ...values, context, service:filters.service, foodType:filters.foodType }); signal.throwIfAborted(); return result;
    };
    try {
      update();
      while (!c.listed && c.page < this.maxPages) {
        await checkLocation();
        const page = vendorPage(await read('vendors', { page: c.page, cursor:c.cursor ?? null }), filters.service);
        if (page.empty) { c.listed = true; break; }
        const signature = page.signature;
        if (c.seenPages.has(signature)) { c.notes.push('منبع یک صفحهٔ تکراری فرستاد؛ پوشش فهرست قابل تأیید نیست.'); c.listed = true; break; }
        c.seenPages.add(signature);
        for (const v of page.vendors) c.vendors.set(v.code, v);
        c.cursor = page.cursor;
        c.page++; update();
        if (page.explicitlyFinished) c.listed = true;
      }
      if (!c.listed) { c.notes.push('به سقف محافظتی ۱۰۰ صفحه رسیدیم؛ همهٔ رستوران‌ها بررسی نشده‌ان.'); c.listed = true; }
      state = 'menus'; update();
      // Sequential, bounded requests keep this personal helper gentle on the site.
      for (const vendor of c.vendors.values()) {
        if (!eligible(vendor, filters) || c.done.has(vendor.code)) continue;
        await checkLocation();
        try {
          const menu = await read('menu', { code: vendor.code });
          const items = menuItems(menu, vendor);
          const stats = {...items.stats,matched:0};
          for (const [id,row] of c.rows) if (row.vendorCode===vendor.code) c.rows.delete(id);
          for (const item of items) {
            const reason = exclusionReason(item, filters);
            if (reason) stats[reason] = (stats[reason] ?? 0) + 1;
            else { c.rows.set(item.id, item); stats.matched++; }
          }
          c.menuStats.set(vendor.code, stats);
          c.done.add(vendor.code);
          rejectedMenus = 0;
          c.errors = c.errors.filter(e => e.code !== vendor.code);
        } catch (e) {
          if (e.name === 'AbortError' || e.fatal || e.retryAt || e.locationChanged) throw e;
          c.errors = c.errors.filter(x => x.code !== vendor.code);
          c.errors.push({ code: vendor.code, title: vendor.title, message: e.message });
          if (e.status === 400) {
            rejectedMenus++;
            if (rejectedMenus >= 3) throw new SourceError('سه درخواست منو پشت‌سرهم با HTTP 400 رد شد؛ برای جلوگیری از درخواست‌های تکراری مکث کردیم. نسخهٔ افزونه و جزئیات سه خطای پایین رو بررسی کن.', { fatal: true, status: 400 });
          } else rejectedMenus = 0;
        }
        update();
      }
      await checkLocation();
      state = c.errors.length || c.notes.length ? 'partial' : 'complete'; c.retryAt = null; update();
    } catch (e) {
      if (e.locationChanged) { c.rows.clear(); c.menuStats.clear(); c.notes.push(e.message); state = 'location-changed'; this.checkpoint = null; }
      else if (e.name === 'AbortError') state = 'stopped';
      else { state = 'paused'; c.retryAt = e.retryAt ?? null; c.lastError = e.message; }
      update();
    } finally { this.controller = null; }
  }
}
