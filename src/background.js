import { searchScope } from './categories.js';
import { readRenderedMenu } from './rendered-menu.js';
import { installAutoUpdater } from './auto-update.js';
const renderJobs = new Map();
let activeReads=0;
import { validCode } from './core.js';

const SITE = 'https://snappfood.ir';
const GATEWAY = 'https://apigw.snappfood.ir';

export function requestTarget(operation, value) {
  if (operation === 'vendors') { const scope=searchScope(value?.service,value?.foodType); return SITE + (scope.service==='restaurant' && !scope.foodType ? '/search/api/v1/desktop/vendors-list' : '/search/api/v4/restaurant/vendors-list'); }
  if (operation === 'menu' && validCode(value?.code)) return GATEWAY + '/menu-read-model/' + value.code;
  throw new Error('این مسیر در افزونه مجاز نیست.');
}

// Runs in the user's existing Snappfood page. No cookies/tokens/storage are read
// or copied; the browser attaches its normal site cookies to allowlisted GETs.
export async function pageContext() {
  const candidates = [];
  const paths = ['/search/api/', '/mobile/v2/restaurant/'];
  const menuTemplates = [];
  for (const entry of performance.getEntriesByType('resource')) {
    try {
      const u = new URL(entry.name);
      if (u.origin === location.origin && paths.some(p => u.pathname.startsWith(p))) candidates.push(u);
      if (u.origin === 'https://apigw.snappfood.ir' && /^\/menu-read-model\/[a-zA-Z0-9]{3,12}$/.test(u.pathname)) { candidates.push(u); menuTemplates.push(u); }
    } catch { /* Not a URL. */ }
  }
  if (!candidates.length) {
    for (const a of document.querySelectorAll('a[href]')) { try { const u = new URL(a.href); if (u.origin === location.origin && u.searchParams.has('lat') && u.searchParams.has('long')) candidates.push(u); } catch { /* Ignore. */ } }
  }
  if (!candidates.length) { const u = new URL(location.href); if (u.searchParams.has('lat')) candidates.push(u); }
  const latest = [...candidates].reverse().find(u => u.searchParams.has('lat') && u.searchParams.has('long'));
  if (!latest) return { error: 'اول توی خود اسنپ‌فود وارد شو و آدرس تحویل رو انتخاب کن؛ بعد صفحه رو تازه کن.' };
  const lat = Number(latest.searchParams.get('lat')), long = Number(latest.searchParams.get('long'));
  if (!Number.isFinite(lat) || !Number.isFinite(long) || lat < -90 || lat > 90 || long < -180 || long > 180) return { error: 'موقعیت انتخاب‌شده قابل خواندن نیست؛ آدرس رو دوباره داخل اسنپ‌فود انتخاب کن.' };
  const client = {};
  for (const key of ['optionalClient', 'client', 'deviceType', 'appVersion']) { const value = latest.searchParams.get(key); if (value && value.length < 80) client[key] = value; }
  // Public menu-selection flags stay in memory; no auth headers or site storage.
  const menuQuery = {}, template = menuTemplates.at(-1);
  for (const key of ['membership', 'segments']) { const value = template?.searchParams.get(key); if (value !== null && value !== undefined && value.length <= 2048) menuQuery[key] = value; }
  return { lat, long, client, menuQuery };
}

export async function pageRead(target, params) {
  let url;
  try { url = new URL(target); } catch { return { error: 'مسیر درخواست مجاز نیست.', fatal: true }; }
  const listAllowed = url.origin === 'https://snappfood.ir' && ['/search/api/v1/desktop/vendors-list','/search/api/v4/restaurant/vendors-list'].includes(url.pathname);
  const menuAllowed = url.origin === 'https://apigw.snappfood.ir' && /^\/menu-read-model\/[a-zA-Z0-9]{3,12}$/.test(url.pathname);
  if (location.origin !== 'https://snappfood.ir' || (!listAllowed && !menuAllowed) || url.search || url.hash || url.username || url.password) return { error: 'مسیر درخواست مجاز نیست.', fatal: true };
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 22000);
  try {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetch(url.href, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' }, signal: controller.signal, redirect: 'error' });
    if (!response.ok) {
      const wait = response.headers.get('Retry-After');
      let retryAt = wait && /^\d+$/.test(wait) ? Date.now() + Number(wait) * 1000 : Date.parse(wait ?? '');
      if (!Number.isFinite(retryAt) && response.status === 429) retryAt = Date.now() + 60000;
      // Return only a service code and validation-field names, never a raw body.
      let detail = '';
      if (response.status === 400 && /json/i.test(response.headers.get('content-type') ?? '')) {
        const reader = response.body?.getReader(); let size = 0; const chunks = [];
        if (reader) {
          while (size <= 4096) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 4096) { await reader.cancel(); break; } chunks.push(part.value); }
          if (size <= 4096) {
            const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
            try {
              const body = JSON.parse(new TextDecoder().decode(bytes));
              const code = body.error?.code ?? body.code;
              const errors = body.errors ?? body.error?.errors;
              const fields = errors && typeof errors === 'object' && !Array.isArray(errors) ? Object.keys(errors).filter(x => /^[a-zA-Z_][\w.]{0,40}$/.test(x)).slice(0, 5) : [];
              if (typeof code === 'number' || (typeof code === 'string' && /^[\w-]{1,50}$/.test(code))) detail += ` کد سرویس: ${code}.`;
              if (fields.length) detail += ` فیلدها: ${fields.join(', ')}.`;
            } catch { /* Error body is deliberately not echoed. */ }
          }
        }
      }
      return { status: response.status, retryAt: Number.isFinite(retryAt) ? retryAt : null,
        fatal: [401, 403, 429].includes(response.status), error: response.status === 400 ? `درخواست ${menuAllowed ? 'منو از درگاه فعلی' : 'فهرست'} پذیرفته نشد (HTTP 400).${detail}` : response.status === 403 ? 'اسنپ‌فود درخواست افزونه رو نپذیرفت (403). صفحه رو تازه کن و ورود و آدرس رو داخل خود سایت بررسی کن.' : response.status === 401 ? 'ورود اسنپ‌فود نیاز به بررسی داره؛ خودت داخل سایت وارد شو.' : response.status === 429 ? 'اسنپ‌فود فعلاً سرعت درخواست‌ها رو محدود کرده؛ تا زمان مجاز تلاش دوباره صبر کن.' : `این درخواست با HTTP ${response.status} انجام نشد.` };
    }
    const max = 6 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > max) return { error: 'حجم پاسخ از سقف امن بیشتر شد؛ کامل حسابش نمی‌کنیم.' };
    const reader = response.body.getReader(); let bytes = 0; const chunks = [];
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > max) { await reader.cancel(); return { error: 'حجم پاسخ از سقف امن بیشتر شد؛ کامل حسابش نمی‌کنیم.' }; } chunks.push(part.value); }
    const body = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    try { return { data: JSON.parse(new TextDecoder().decode(body)) }; } catch { return { error: 'اسنپ‌فود به‌جای دادهٔ منو یک پاسخ غیرقابل‌خواندن فرستاد؛ صفحه رو داخل سایت بررسی کن.', fatal: true }; }
  } catch (e) { return { error: e.name === 'AbortError' ? 'پاسخ اسنپ‌فود بیشتر از ۲۲ ثانیه طول کشید؛ می‌تونی از همین‌جا ادامه بدی.' : 'این درخواست از داخل تب اسنپ‌فود کامل نشد؛ اتصال مرورگر رو بررسی کن.' }; }
  finally { clearTimeout(timer); }
}

export function requestParameters(operation, value) {
  const c = value?.context;
  if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.long) || Math.abs(c.lat) > 90 || Math.abs(c.long) > 180) throw new Error('موقعیت معتبر نیست.');
  const p = { optionalClient: 'PWA', client: 'PWA', deviceType: 'PWA', appVersion: '6.0.0', Bonyan: 'true', lat: c.lat, long: c.long };
  for (const key of ['optionalClient', 'client', 'deviceType', 'appVersion']) if (typeof c.client?.[key] === 'string' && /^[\w.-]{1,80}$/.test(c.client[key])) p[key] = c.client[key];
  if (operation === 'vendors') {
    if (!Number.isInteger(value.page) || value.page < 0 || value.page > 99) throw new Error('شمارهٔ صفحه معتبر نیست.');
    const scope=searchScope(value.service,value.foodType);
    const legacy=scope.service==='restaurant' && !scope.foodType;
    Object.assign(p, {page:value.page,page_size:legacy?30:10,sp_alias:scope.service,filters:'{}',query:''});
    if (legacy) p.superType='[1]';
    else {
      // Native v4 pagination counts vendor cards and other list items separately.
      const cursor=value.cursor;
      const index=n=>Number.isSafeInteger(n) && n>=0 && n<=10000000;
      if (cursor && (!index(cursor.vendor_index) || !index(cursor.item_index))) throw new Error('نقطهٔ ادامهٔ فهرست معتبر نیست.');
      p.vendor_index=cursor?.vendor_index ?? 0;
      p.item_index=cursor?.item_index ?? 0;
    }
    if (scope.foodType) p.category=JSON.stringify({value:Number(scope.foodType),sub:[]});
  } else if (operation === 'menu') {
    if (!validCode(value.code)) throw new Error('شناسهٔ رستوران معتبر نیست.');
    // The current gateway puts the code in the URL, not in vendorCode.
    for (const key of ['membership', 'segments']) if (typeof c.menuQuery?.[key] === 'string' && c.menuQuery[key].length <= 2048) p[key] = c.menuQuery[key];
  } else throw new Error('این عملیات در افزونه مجاز نیست.');
  return p;
}

if (globalThis.chrome?.runtime?.onMessage) {
  const updater=installAutoUpdater(chrome,{hasActiveRequests:()=>activeReads>0 || renderJobs.size>0});
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || !sender.tab?.id || !sender.tab.url?.startsWith(SITE + '/') || !['SF_CONTEXT', 'SF_READ', 'SF_RENDER', 'SF_RENDER_CANCEL','SF_UPDATER_STATUS','SF_UPDATER_CHECK','SF_UPDATER_IDLE'].includes(message?.type)) return false;
    (async () => {
      if(message.type==='SF_UPDATER_STATUS'){reply(await updater.status());return;}
      if(message.type==='SF_UPDATER_CHECK'){void updater.check();reply({state:'checking'});return;}
      if(message.type==='SF_UPDATER_IDLE'){await updater.idle();reply({ok:true});return;}
      const target = { tabId: sender.tab.id };
      if (message.type === 'SF_RENDER_CANCEL') { renderJobs.get(sender.tab.id)?.abort(); reply({ok:true}); return; }
      if(updater.isApplying()){reply({error:'نسخهٔ جدید ابزار در حال آماده‌شدنه؛ چند لحظه صبر کن.',fatal:true});return;}
      if (message.type === 'SF_RENDER') {
        if (renderJobs.has(sender.tab.id)) { reply({error:'این منو هنوز در حال بررسیه.'}); return; }
        const controller = new AbortController(); renderJobs.set(sender.tab.id,controller);
        try { reply(await readRenderedMenu(chrome,message.code,controller.signal,undefined,message.service ?? 'restaurant')); }
        catch (e) { reply({error:controller.signal.aborted ? 'بررسی قیمت متوقف شد.' : e.message}); }
        finally { renderJobs.delete(sender.tab.id); }
        return;
      }
      activeReads++;
      try{
        const result = message.type === 'SF_CONTEXT'
          ? await chrome.scripting.executeScript({ target, world: 'MAIN', func: pageContext })
          : await chrome.scripting.executeScript({ target, world: 'MAIN', func: pageRead, args: [requestTarget(message.operation, message.value), requestParameters(message.operation, message.value)] });
        const value = result[0]?.result;
        reply(value ?? { error: 'ارتباط با تب قطع شد؛ صفحه رو تازه کن.' });
      }finally{activeReads--;}
    })().catch(() => reply({ error: 'افزونه به این تب دسترسی پیدا نکرد؛ صفحهٔ اسنپ‌فود رو تازه کن.' }));
    return true;
  });
  chrome.tabs.onRemoved?.addListener(id => renderJobs.get(id)?.abort());
  chrome.action.onClicked.addListener(async tab => {
    if (tab.url?.startsWith(SITE + '/')) { try { await chrome.tabs.sendMessage(tab.id, { type: 'SF_TOGGLE' }); } catch { await chrome.tabs.reload(tab.id); } }
    else await chrome.tabs.create({ url: SITE + '/' });
  });
}
