import { SERVICES, FOOD_TYPES, getService, getFoodType } from './categories.js';
import { defaults, sorted, validateFilters, number, APP_VERSION, APP_NAME } from './core.js';
import { Scanner } from './engine.js';
import { PRODUCT_CATEGORIES, categoryLabel, groupResults } from './product-categories.js';
import { updateText } from './auto-update.js';

const fa = value => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(value);
const icons = {
  fork: '<path d="M6 4v5M3 4v5c0 4 6 4 6 0V4M6 12v8M14 7a4 4 0 0 1 8 0c0 3-4 3-4 6v1"/><circle cx="18" cy="19" r="1.5" fill="currentColor" stroke="none"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
  arrow: '<path d="M6 18 18 6M7 6h11v11"/>',
};
function icon(name) { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); if (name === 'fork') s.classList.add('sf-brand-symbol'); s.innerHTML = icons[name]; return s; }
function element(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }

export function mountApp(root, transport, { demo = false, loadPreferences = async () => ({}), savePreferences = async () => {}, onClose = null, imageFor = row => row.image, canStart=()=>true, onIdle=()=>{}, updater=null } = {}) {
  root.innerHTML = `
    <div class="sf-app" dir="rtl">
      <header class="sf-header">
        <div class="sf-brand"><span class="sf-mark"></span><div><h1>${APP_NAME}</h1><p>یه انتخاب خوشمزه، با حساب و کتاب خودت.</p></div></div>
        <div class="sf-header-tools"><span class="sf-local"><i></i>${demo ? 'پیش‌نمایش لوکال' : 'داخل مرورگر خودت'} <small dir="ltr">v${APP_VERSION}</small></span>${onClose ? '<button class="sf-close" type="button" aria-label="بستن پنل">×</button>' : ''}</div>
      </header>
      ${demo ? '<div class="sf-demo-note"><b>حالت نمایشی</b><span>داده‌های این صفحه نمونه‌ان. جستجوی واقعی با افزونه، داخل تب اسنپ‌فود انجام می‌شه.</span><a href="../install.html">نصب نسخهٔ واقعی ↗</a></div>' : ''}
      <div class="sf-layout">
        <aside class="sf-sidebar">
          <div class="sf-intro"><span class="sf-eyebrow">انتخاب با تو، گشتن با ما</span><h2>امروز چی بهت می‌چسبه؟</h2><p>محدوده‌ات رو مشخص کن؛ منوهای مناسب رو برات می‌گردیم.</p></div>
          <form class="sf-form">
            <div class="sf-pair sf-categories"><label>بخش اسنپ‌فود<select name="service" aria-label="بخش اسنپ‌فود">${SERVICES.map(x=>`<option value="${x.id}">${x.label}</option>`).join('')}</select></label><label class="sf-food-type-field">نوع غذا<select name="foodType" aria-label="نوع غذا">${FOOD_TYPES.map(x=>`<option value="${x.id}">${x.label}</option>`).join('')}</select></label></div>
            <fieldset><legend>قیمت خود غذا <span>تومان</span></legend><div class="sf-price-fields"><label>از<input name="minPrice" type="text" inputmode="numeric" autocomplete="off" required></label><span class="sf-range-line">—</span><label>تا<input name="maxPrice" type="text" inputmode="numeric" autocomplete="off" required></label></div></fieldset>
            <div class="sf-pair"><label>حداکثر زمان تحویل<div class="sf-unit-input"><input name="maxTime" type="number" min="5" max="180" required><span>دقیقه</span></div></label><label>حداقل امتیاز فروشگاه<select name="minRating"><option value="0">فرقی نداره</option><option value="3">۳ به بالا</option><option value="3.5">۳٫۵ به بالا</option><option value="4">۴ به بالا</option><option value="4.3">۴٫۳ به بالا</option><option value="4.5">۴٫۵ به بالا</option><option value="4.7">۴٫۷ به بالا</option></select></label></div>
            <label class="sf-query-label">غذای خاصی تو ذهنته؟ <span>اختیاری</span><input name="query" placeholder="مثلاً پیتزا، کباب، سالاد…" maxlength="80" autocomplete="off"></label>
            <details class="sf-price-options"><summary>بررسی دقیق‌تر قیمت</summary><label class="sf-checkbox"><input type="checkbox" name="verifyPrices"><span>تطبیق با صفحهٔ اسنپ‌فود — کندتر</span></label><p>با فعال‌کردنش، برای هر رستوران یه تب موقت باز و بسته می‌شه تا قیمت خود صفحه خونده بشه. حالت سریع قیمت پاسخ منو رو می‌گیره؛ ممکنه کوپن‌های شرطی سفارش توش نباشن.</p></details>
            <details class="sf-update-options" ${updater?'':'hidden'}><summary>به‌روزرسانی ابزار</summary><p class="sf-update-status" aria-live="polite"></p><button class="sf-check-update" type="button">بررسی نسخهٔ جدید</button></details>
            <button class="sf-start" type="submit"><span class="sf-search-icon"></span><span>غذامو پیدا کن</span></button>
            <div class="sf-run-actions" hidden><button class="sf-stop" type="button">توقف جستجو</button><button class="sf-resume" type="button" hidden>ادامه از همین‌جا</button></div>
            <p class="sf-form-error" role="alert" hidden></p>
          </form>
          <div class="sf-location"><span class="sf-location-dot">⌖</span><div><b>همون آدرس اسنپ‌فودت</b><p>${demo ? 'در نسخهٔ واقعی، آدرس از تب انتخاب‌شدهٔ خودت گرفته می‌شه.' : 'ورود و انتخاب آدرس رو داخل خود اسنپ‌فود انجام بده.'}</p></div></div>
          <p class="sf-scope">فیلتر قیمت فقط برای خود غذاست؛ ارسال، بسته‌بندی و مالیات توی این محدوده حساب نمی‌شن.</p>
        </aside>
        <main class="sf-main">
          <section class="sf-progress-box" aria-live="polite" hidden>
            <div class="sf-progress-title"><b></b><span></span></div>
            <progress max="100" aria-label="پیشرفت بررسی منوها"></progress>
            <div class="sf-counters"></div>
            <details class="sf-audit"><summary>این عددها چطور حساب شدن؟</summary><div class="sf-audit-rows"></div><p>سایزهای مختلف جدا حساب می‌شن. این عددها مربوط به همهٔ دسته‌ها و بعد از فیلتر قیمت، زمان، امتیاز و عبارت جستجو هستن؛ انتخاب دسته فقط نمایش رو عوض می‌کنه.</p></details>
          </section>
          <div class="sf-results-heading"><div><span class="sf-eyebrow">گزینه‌های روی میز</span><h2>گزینه‌های پیشنهادی <span class="sf-count">۰</span></h2></div><label>مرتب‌سازی<select name="sort"><option value="rating">بالاترین امتیاز</option><option value="price">کمترین قیمت</option><option value="time">سریع‌ترین تحویل</option></select></label></div>
          <p class="sf-result-scope"></p>
          <section class="sf-product-filters" aria-label="دسته‌بندی محصولات" hidden><div class="sf-product-tabs" role="group" aria-label="نمایش نوع محصول"></div><p class="sf-category-summary" aria-live="polite"></p></section>
          <div class="sf-notices" aria-live="polite"></div>
          <div class="sf-grid"></div>
          <div class="sf-empty"><div class="sf-empty-symbol"></div><h3>بذار منوها رو بگردیم</h3><p>قیمت، زمان و امتیاز رو انتخاب کن.<br>چند پیشنهاد مناسب همین‌جا منتظرت می‌مونن.</p><div class="sf-empty-pills"><span>قیمت دلخواه</span><span>انتظار کمتر</span><span>انتخاب بهتر</span></div></div>
          <button class="sf-more" type="button" hidden>نمایش گزینه‌های بیشتر</button>
          <details class="sf-errors" hidden><summary></summary><ul></ul></details>
          <footer class="sf-footer"><span>قیمت و موجودی مربوط به زمان بررسی‌ان.</span><span>امتیاز معیار: فروشگاه، از ۵</span></footer>
        </main>
      </div>
    </div>`;
  const $ = selector => root.querySelector(selector), form = $('.sf-form');
  $('.sf-mark').append(icon('fork')); $('.sf-search-icon').append(icon('search')); $('.sf-empty-symbol').append(icon('fork'));
  if (onClose) $('.sf-close').onclick = onClose;
  let busy = false, current = null, shown = 36, uiTimer = null, startedFilters = null, resultCategory = 'all';
  const scanner = new Scanner(transport, onUpdate, { pause: demo ? 60 : 450 });
  const fields = ['service','foodType','minPrice', 'maxPrice', 'maxTime', 'minRating', 'query', 'verifyPrices'];
  const input = name => form.elements.namedItem(name);
  function values() { const result = Object.fromEntries(fields.map(name => [name, name==='verifyPrices' ? input(name).checked : input(name).value])); return { ...result, hideExtras:false, sort: $('[name="sort"]').value }; }
  function syncCategories() { const restaurant=input('service').value==='restaurant'; $('.sf-food-type-field').hidden=!restaurant; $('.sf-categories').classList.toggle('sf-single',!restaurant); input('foodType').disabled=busy||!restaurant; }
  input('service').onchange=()=>{input('foodType').value='';syncCategories();};
  function setValues(v) { for (const name of fields) if (v[name] !== undefined) { if (name==='verifyPrices') input(name).checked = v[name]; else input(name).value = name === 'minPrice' || name === 'maxPrice' ? new Intl.NumberFormat('en-US').format(v[name]) : String(v[name]); } if (v.sort) $('[name="sort"]').value = v.sort; syncCategories(); }
  for (const name of ['minPrice', 'maxPrice']) input(name).addEventListener('blur', () => { const n = number(input(name).value); if (n !== null) input(name).value = new Intl.NumberFormat('en-US').format(n); });
  setValues(defaults);
  loadPreferences().then(v => { if (!busy && !current) { try { setValues(validateFilters({ ...defaults, ...v, verifyPrices:false })); } catch { setValues(defaults); } } }).catch(() => {});
  function setBusy(value) { busy = value; $('.sf-start').disabled = value; for (const name of fields) input(name).disabled = value; syncCategories(); $('.sf-stop').hidden = !value; $('.sf-resume').hidden = value || !current || !['stopped', 'paused', 'partial'].includes(current.state); $('.sf-run-actions').hidden = !value && $('.sf-resume').hidden; }
  async function run(resume) {
    if (busy) return;
    if(!canStart()){$('.sf-form-error').textContent='آپدیت ابزار در حال انجامه؛ چند لحظه صبر کن.';$('.sf-form-error').hidden=false;return;}
    $('.sf-form-error').hidden = true;
    try {
      const f = validateFilters(values()); startedFilters = f; shown = 36;
      if(!resume)resultCategory=f.service==='restaurant' && !f.query ? 'food' : 'all';
      setBusy(true); await savePreferences(f);
      await scanner.run(f, resume);
    } catch (e) { $('.sf-form-error').textContent = e.message || 'ارتباط با افزونه کامل نشد؛ صفحه رو تازه کن.'; $('.sf-form-error').hidden = false; }
    finally { setBusy(false); refreshRetry(); onIdle(); }
  }
  form.onsubmit = event => { event.preventDefault(); void run(false); };
  $('.sf-stop').onclick = () => scanner.stop();
  $('.sf-resume').onclick = () => void run(true);
  $('[name="sort"]').onchange = () => { renderResults(); if (!busy) savePreferences(validateFilters(values())).catch(() => {}); };
  $('.sf-more').onclick = () => { shown += 36; renderResults(); };
  function setUpdateStatus(status){$('.sf-update-status').textContent=updateText(status);}
  if(updater){
    void updater.status().then(setUpdateStatus).catch(()=>setUpdateStatus({code:'native_unavailable'}));
    $('.sf-check-update').onclick=async()=>{
      $('.sf-check-update').disabled=true;
      try{setUpdateStatus(await updater.check());}catch{setUpdateStatus({code:'native_unavailable'});}
      finally{$('.sf-check-update').disabled=false;}
    };
  }
  const categoryButtons=new Map();
  for(const category of PRODUCT_CATEGORIES) {
    const button=element('button','sf-product-tab'),count=element('span','sf-product-tab-count','۰');
    button.type='button';button.dataset.category=category.id;button.title=category.description ?? category.label;
    button.append(element('span','',category.label),count);
    button.onclick=()=>{resultCategory=category.id;shown=36;renderResults();};
    categoryButtons.set(category.id,{button,count});$('.sf-product-tabs').append(button);
  }
  function refreshRetry() {
    clearInterval(uiTimer);
    const show = () => {
      const remaining = Math.max(0, Math.ceil(((current?.retryAt ?? 0) - Date.now()) / 1000));
      $('.sf-resume').disabled = remaining > 0; $('.sf-start').disabled = busy || remaining > 0;
      $('.sf-resume').textContent = remaining ? `تلاش دوباره، ${fa(remaining)} ثانیه دیگه` : current?.state === 'partial' ? 'تلاش دوباره برای منوهای ناقص' : 'ادامه از همین‌جا';
      if (!remaining) clearInterval(uiTimer);
    };
    show(); if ((current?.retryAt ?? 0) > Date.now()) uiTimer = setInterval(show, 1000);
  }
  function onUpdate(value) {
    current = value;
    const box = $('.sf-progress-box'), active = ['listing', 'menus'].includes(value.state); box.hidden = false;
    const labels = { listing: 'داریم فروشگاه‌های این بخش رو پیدا می‌کنیم…', menus: 'منوهای مناسب رو بررسی می‌کنیم…', complete: 'بررسی این نوبت تموم شد', partial: 'بررسی با چند مورد ناقص تموم شد', paused: 'جستجو فعلاً مکث کرده', stopped: 'جستجو متوقف شد؛ نتیجه‌ها همین‌جا موندن', 'location-changed': 'آدرس عوض شد؛ یه جستجوی تازه لازمه' };
    $('.sf-progress-title b').textContent = value.priceChecking ? `قیمت‌های منوی ${value.priceChecking} رو می‌خونیم…` : labels[value.state];
    $('.sf-progress-title span').textContent = value.state === 'listing' ? `صفحهٔ ${fa(value.page + 1)}` : `${fa(value.checked)} از ${fa(value.eligible)} منو`;
    const progress = $('progress');
    if (value.state === 'listing') progress.removeAttribute('value'); else progress.value = value.eligible ? Math.min(100, 100 * value.checked / value.eligible) : value.state === 'complete' ? 100 : 0;
    box.classList.toggle('is-active', active);
    $('.sf-counters').textContent = `${fa(value.vendors)} فروشگاه پیدا شد · ${fa(value.eligible)} فروشگاه مناسب زمان و امتیاز · ${fa(value.rows.length)} گزینه مطابق فیلترها، در همهٔ دسته‌ها`;
    const audit = value.audit ?? {};
    const auditLines = [['منوهای خوانده‌شده', value.checked], ['گزینه‌های یکتای محصول/سایز در این منوها', audit.totalOptions ?? 0], ['ناموجود یا غیرفعال', audit.unavailable ?? 0], ['قیمت نامشخص یا نامعتبر', audit.unknownPrice ?? 0], ['حذف به‌خاطر محدودهٔ قیمت', audit.price ?? 0], ['حذف به‌خاطر عبارت جستجو', audit.query ?? 0], ['فروشگاه‌هایی که موقع دریافت منو بسته شدن', audit.closedMenu ?? 0], ['محصول/سایز مطابق همهٔ فیلترها', value.rows.length]];
    if (audit.missingIds) auditLines.splice(-1, 0, ['موارد ناقص منبع، بدون شناسه', audit.missingIds]);
    $('.sf-audit-rows').replaceChildren(...auditLines.map(([label, count]) => { const line = element('div'); line.append(element('span', '', label), element('b', '', fa(count))); return line; }));
    const notices = $('.sf-notices'); notices.replaceChildren();
    for (const message of [...value.notes, ...(value.message ? [value.message] : [])]) notices.append(element('p', 'sf-warning', message));
    const errors = $('.sf-errors'); errors.hidden = !value.errors.length;
    $('.sf-errors summary').textContent = `${fa(value.errors.length)} منو یا قیمت کامل دریافت نشد؛ جزئیات`;
    $('.sf-errors ul').replaceChildren(...value.errors.map(e => element('li', '', `${e.title}: ${e.message}`)));
    setBusy(active); refreshRetry(); renderResults();
  }
  function renderResults() {
    const allRows=current?.rows ?? [], grouped=groupResults(allRows,resultCategory);
    const list = sorted(grouped.rows, $('[name="sort"]').value), grid = $('.sf-grid'); grid.replaceChildren(); $('.sf-count').textContent = fa(list.length);
    $('.sf-product-filters').hidden=!current;
    for(const [id,{button,count}] of categoryButtons) {
      count.textContent=fa(grouped.counts[id]);button.setAttribute('aria-pressed',String(id===resultCategory));
      button.disabled=grouped.counts[id]===0 && id!=='all' && id!==resultCategory;
    }
    $('.sf-category-summary').textContent=`${resultCategory==='all' ? 'همهٔ دسته‌ها' : categoryLabel(resultCategory)} · نمایش ${fa(list.length)} از ${fa(allRows.length)} گزینه · بدون جستجوی دوباره`;
    $('.sf-more').hidden = list.length <= shown;
    $('.sf-more').textContent = `نمایش ${fa(Math.min(36, list.length - shown))} گزینهٔ بیشتر`;
    $('.sf-empty').hidden = list.length > 0;
    if (current && !list.length && allRows.length) {
      $('.sf-empty h3').textContent='توی این دسته هنوز گزینه‌ای نداریم';
      $('.sf-empty p').textContent='یه دستهٔ دیگه یا «همه» رو انتخاب کن؛ قیمت، زمان و امتیاز همچنان اعمال می‌شن.';
    } else if (current && !list.length) {
      $('.sf-empty h3').textContent = ['listing', 'menus'].includes(current.state) ? 'هنوز داریم می‌گردیم…' : current.state === 'complete' ? 'با این محدوده، غذایی پیدا نشد' : 'هنوز نتیجهٔ قابل نمایش نداریم';
      $('.sf-empty p').textContent = current.state === 'complete' ? 'می‌تونی سقف قیمت یا زمان رو بیشتر کنی، یا حداقل امتیاز رو کمی پایین بیاری.' : 'نتیجه‌های بررسی‌شده همین‌جا اضافه می‌شن؛ وضعیت جستجو رو از بالای صفحه ببین.';
    }
    const scope = [];
    if (current && startedFilters) {
      scope.push(getService(startedFilters.service)?.label ?? 'رستوران');
      if (startedFilters.foodType) scope.push(getFoodType(startedFilters.foodType)?.label ?? '');
      scope.push(`${fa(startedFilters.minPrice)} تا ${fa(startedFilters.maxPrice)} تومان`, `تا ${fa(startedFilters.maxTime)} دقیقه`, startedFilters.minRating ? 'امتیاز ' + fa(startedFilters.minRating) + ' به بالا' : 'بدون محدودیت امتیاز');
      if (startedFilters.query) scope.push(`عبارت: «${startedFilters.query}»`);
      scope.push(startedFilters.verifyPrices ? 'تطبیق قیمت با صفحه' : 'جستجوی سریع، بدون تب اضافه');
    }
    $('.sf-result-scope').textContent = scope.join(' · ');
    for (const row of list.slice(0, shown)) {
      const card = element('article', 'sf-card');
      const media = element('div', 'sf-card-media');
      const imageUrl = imageFor(row);
      if (imageUrl) { const image = element('img'); image.src = imageUrl; image.alt = row.title; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.onerror = () => { image.remove(); media.classList.add('sf-image-missing'); media.append(icon('fork')); }; media.append(image); }
      else { media.classList.add('sf-image-missing'); media.append(icon('fork')); }
      media.append(element('span', 'sf-food-type', categoryLabel(row.productCategory)));
      const body = element('div', 'sf-card-body'), title = element('h3', '', row.title);
      body.append(title);
      if (row.variation) body.append(element('p', 'sf-variation', row.variation));
      if(row.category)body.append(element('p','sf-menu-category',`منو: ${row.category}`));
      body.append(element('p', 'sf-vendor', row.vendor));
      const badges = element('div', 'sf-badges');
      const rating = element('span', 'sf-rating'); rating.append(icon('star'), document.createTextNode(row.rating === null ? 'بدون امتیاز' : fa(row.rating)));
      const time = element('span', 'sf-time'); time.append(icon('clock'), document.createTextNode(`${fa(row.eta)} دقیقه`)); badges.append(rating, time); body.append(badges);
      if (row.proApplied) body.append(element('span', 'sf-pro', row.proLabel));
      if (row.proOffer) body.append(element('p', 'sf-pro-condition', row.proOffer));
      if (row.foodRating !== null && row.foodRating !== undefined) body.append(element('small', 'sf-food-rating', `امتیاز خود غذا: ${fa(row.foodRating)}`));
      const delivery = element('div', 'sf-delivery'), fee = element('span', 'sf-delivery-value');
      if (row.deliveryFee !== null && row.deliveryFee !== undefined && Number.isFinite(row.deliveryFee)) {
        if (row.originalDeliveryFee !== null && row.originalDeliveryFee > row.deliveryFee) fee.append(element('del', '', fa(row.originalDeliveryFee)));
        fee.append(document.createTextNode(row.deliveryFee === 0 ? 'رایگان' : `${fa(row.deliveryFee)} تومان`));
        if (row.deliveryFee === 0) fee.classList.add('is-free');
      } else fee.textContent = 'نامشخص';
      delivery.append(element('span', '', 'هزینهٔ پیک'), fee); body.append(delivery);
      const bottom = element('div', 'sf-card-bottom'), price = element('div', 'sf-price');
      if (row.originalPrice !== null && row.originalPrice > row.price) price.append(element('del', '', fa(row.originalPrice)));
      const actual = element('p'); actual.append(element('b', '', fa(row.price)), element('span', '', 'تومان')); price.append(actual);
      const link = element('a', 'sf-open', demo ? 'نمونهٔ لینک' : row.linkKind === 'menu-position' ? 'همین غذا در منو' : row.linkKind === 'restaurant' ? 'منوی رستوران' : 'مشاهدهٔ همین غذا'); link.href = demo ? 'https://snappfood.ir/' : row.menuUrl ?? row.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.append(icon('arrow'));
      bottom.append(price, link); body.append(bottom);
      body.append(element('small', 'sf-checked', `بررسی‌شده ساعت ${new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }).format(new Date(row.checkedAt))} تهران`));
      card.append(media, body); grid.append(card);
    }
  }
  return { scanner, start: () => run(false), stop: () => scanner.stop(), setValues, setUpdateStatus,
    get busy(){return busy || scanner.controller!==null;},dispose: () => { scanner.stop(); clearInterval(uiTimer); } };
}
