import { getService, searchScope, vendorService } from './categories.js';
import { classifyProduct, isPromotionalCategory } from './product-categories.js';
export class SourceError extends Error {
  constructor(message, options = {}) {
    super(message); this.name = 'SourceError'; Object.assign(this, options);
  }
}
export const APP_VERSION = '1.1.0';
export const APP_NAME = 'غذام کو؟';

export function number(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const text = String(value).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[٬,\s]/g, '').replace('٫', '.');
  const n = Number(text); return Number.isFinite(n) ? n : null;
}
export function normalized(value) { return String(value ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(); }
export function stars(value) { const n = number(value); return n !== null && n > 0 && n <= 10 ? Math.round(n * 5) / 10 : null; }
export function eta(value) {
  if (typeof value === 'string' && !/^\s*[\d۰-۹٠-٩.٫]+\s*$/.test(value)) return null;
  const n = number(value); return n !== null && n > 0 && n <= 1440 ? n : null;
}
export function validCode(value) { return typeof value === 'string' && /^[a-zA-Z0-9]{3,12}$/.test(value); }
export function numericId(value) { return value !== null && value !== undefined && /^[1-9]\d{0,17}$/.test(String(value)) ? String(value) : null; }
export function foodLink(vendorCode, parentProductId, variationId, title, service = 'restaurant') {
  if (!validCode(vendorCode) || !getService(service)) return { url: 'https://snappfood.ir/', linkKind: 'unavailable' };
  const base = `https://snappfood.ir/${service}/menu/${vendorCode}/`;
  const parent = numericId(parentProductId), variation = numericId(variationId);
  if (parent && variation) {
    const slug = String(title ?? '').replace(/[^\p{L}\p{N}\s_]/gu, '').trim().replace(/\s+/g, '_').slice(0, 160) || 'غذا';
    const url = new URL(`${base}product/${encodeURIComponent(slug)}-pp:${parent}/`);
    url.searchParams.set('product_id', variation);
    return { url: url.href, linkKind: 'product' };
  }
  return { url: variation ? base + '#sf-food=' + variation : base, linkKind: variation ? 'menu-position' : 'restaurant' };
}
export function safeImage(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && (u.hostname === 'snappfood.ir' || u.hostname.endsWith('.snappfood.ir')) ? u.href : null; } catch { return null; }
}
export function validateFilters(input) {
  const scope = searchScope(input.service ?? 'restaurant', input.foodType ?? '');
  const f = { ...scope, minPrice: number(input.minPrice), maxPrice: number(input.maxPrice), maxTime: number(input.maxTime), minRating: number(input.minRating), query: String(input.query ?? '').trim().slice(0, 80), hideExtras: scope.service === 'restaurant' && input.hideExtras !== false, sort: ['rating', 'price', 'time'].includes(input.sort) ? input.sort : 'rating' };
  if (f.minPrice === null || f.maxPrice === null || f.minPrice < 0 || f.maxPrice <= 0 || f.minPrice > f.maxPrice || f.maxPrice > 100000000) throw new SourceError('محدودهٔ قیمت رو درست وارد کن؛ سقف قیمت باید از کفش کمتر نباشه.');
  if (f.maxTime === null || f.maxTime < 5 || f.maxTime > 180) throw new SourceError('حداکثر زمان رو بین ۵ تا ۱۸۰ دقیقه وارد کن.');
  if (f.minRating === null || f.minRating < 0 || f.minRating > 5) throw new SourceError('امتیاز باید بین صفر تا پنج باشه.');
  return f;
}
export const defaults = Object.freeze({ service:'restaurant', foodType:'', minPrice: 150000, maxPrice: 400000, maxTime: 40, minRating: 4, query: '', hideExtras: true, sort: 'rating' });

export function deliveryQuote(value) {
  const nonnegative = v => { const n = number(v); return n !== null && n >= 0 ? n : null; };
  const original = nonnegative(value.deliveryFee ?? value.delivery_fee);
  const flag = value.isDeliveryFeeHasDiscount;
  const discounted = flag === true || flag === 1 || flag === '1' || flag === 'true';
  const fee = discounted ? nonnegative(value.deliveryFeeAfterDiscount ?? value.delivery_fee_after_discount) : original;
  return { deliveryFee: fee, originalDeliveryFee: original };
}

export function vendorPage(payload, service = 'restaurant') {
  if (payload?.success === false || !Array.isArray(payload?.data?.finalResult)) throw new SourceError('ساختار فهرست رستوران‌ها تغییر کرده؛ جستجو کامل حساب نشد.', { fatal: true });
  const raw = payload.data.finalResult;
  const cards = raw.filter(x => x?.type === 'VENDOR').map(x => x.data);
  // v1 uses code/is_open; the native v4 response uses vendorCode/isOpen.
  // Never silently drop a vendor whose new schema we cannot understand.
  const vendors = cards.map(v => {
    const code = validCode(v?.code) ? v.code : v?.vendorCode;
    if (!validCode(code)) throw new SourceError('شناسهٔ یکی از فروشگاه‌های فهرست قابل خواندن نیست؛ این صفحه کامل حساب نشد.', { fatal: true });
    const open = v.is_open ?? v.isOpen;
    const rate = number(v.rate);
    return {
      service: vendorService({...v,code},service), code, title: String(v.title ?? '').slice(0, 250),
      rating: stars(v.normalized_rating ?? v.rating) ?? (rate > 0 && rate <= 5 ? rate : null),
      reviews: number(v.commentCount), ...deliveryQuote(v), eta: eta(v.eta),
      open: open === false || open === 0 || open === '0' ? false : open === true || open === 1 || open === '1' ? true : null,
      delivers: v.deliver === false || v.deliver === 0 || v.deliver === '0' ? false : null,
    };
  });
  const flag = payload.data.hasNext ?? payload.data.has_next ?? payload.data.pagination?.hasNext;
  const details = payload.data.count_details;
  const index = n => Number.isSafeInteger(n) && n >= 0 && n <= 10000000;
  const cursor = index(details?.vendor_index) && index(details?.item_index)
    ? {vendor_index:details.vendor_index,item_index:details.item_index} : null;
  const signature = vendors.length ? vendors.map(v=>v.code).sort().join(',')
    : JSON.stringify(raw.map(x=>[x?.type,x?.data?.id ?? '']));
  return { vendors, cursor, signature, empty: raw.length === 0, explicitlyFinished: flag === false };
}
export function eligible(vendor, filters) {
  return vendor.open !== false && vendor.delivers !== false && vendor.eta !== null && vendor.eta <= filters.maxTime &&
    (filters.minRating === 0 || (vendor.rating !== null && vendor.rating >= filters.minRating));
}
function unavailable(p, stamp) {
  if (p.stock === 0 || p.stock === '0' || p.available === false || p.isAvailable === false || p.is_active === false) return true;
  if (!p.disabledUntil) return false;
  const end = Date.parse(p.disabledUntil); return Number.isNaN(end) || end > stamp;
}
function finalPrice(p) {
  const explicit = number(p.priceAfterDiscount ?? p.price_after_discount);
  if (explicit !== null && explicit >= 0) return explicit;
  const base = number(p.price), off = number(p.discount);
  if (base === null || base < 0 || (off !== null && (off < 0 || off > base))) return null;
  return Math.round((base - (off ?? 0)) * 100) / 100;
}

export function menuData(payload) {
  const raw = payload?.data ?? payload;
  if (payload?.success === false || !raw || typeof raw !== 'object') throw new SourceError('پاسخ منوی درگاه کامل نیست؛ این نوبت رو مکث کردیم.', { fatal: true });
  const categories = Array.isArray(raw) ? raw : [raw.menus, raw.menu, raw.categories, raw.menuCategories, raw.menu_categories, raw.menu?.categories, raw.menu?.menus].find(Array.isArray);
  if (!categories) {
    const fields = Object.keys(raw).filter(k => /^[a-zA-Z_][\w]{0,40}$/.test(k)).slice(0, 8).join(', ');
    throw new SourceError(`قالب منوی درگاه قابل شناسایی نیست؛ بررسی بیشتر لازمه.${fields ? ' کلیدهای پاسخ: ' + fields : ''}`, { fatal: true });
  }
  const image = p => p.image ?? p.imageUrl ?? p.images?.[0]?.imageSrc ?? p.images?.[0]?.url ?? p.images?.[0]?.src ?? (typeof p.images?.[0] === 'string' ? p.images[0] : undefined);
  const product = p => {
    const price = p.price && typeof p.price === 'object' ? p.price : null;
    const discount = p.discount && typeof p.discount === 'object' ? p.discount : null;
    const variations = p.variations ?? p.productVariations ?? p.product_variations;
    return { ...p, id: p.id ?? p.productVariationId, title: p.productTitle ?? p.title ?? p.name,
      portionTitle: p.productTitle && p.title !== p.productTitle ? p.title : p.portionTitle,
      price: price ? price.amount ?? price.value ?? price.price : p.price,
      priceAfterDiscount: p.priceAfterDiscount ?? p.price_after_discount ?? p.discountedPrice ?? price?.priceAfterDiscount ?? price?.finalPrice,
      discount: discount ? discount.amount : p.discount,
      image: image(p), ...(Array.isArray(variations) ? { variations: variations.map(product) } : {}),
    };
  };
  return { vendor: raw.vendor, menus: categories.map(category => {
    const products = category.products ?? category.items ?? category.productVariations ?? category.product_variations;
    if (!Array.isArray(products)) throw new SourceError('ساختار دسته‌های منو با قالب فعلی فرق داره؛ این نوبت رو مکث کردیم.', { fatal: true });
    return { categoryId: category.categoryId ?? category.id, category: category.category ?? category.title ?? category.name,
      products: products.map(product) };
  }) };
}
export function menuItems(payload, vendor, stamp = Date.now()) {
  const data = menuData(payload);
  const states = new Map(), rows = []; let missingIds = 0;
  const finish = (closedMenu = false) => Object.defineProperty(rows, 'stats', { value: {
    totalOptions: states.size, availableOptions: rows.length,
    unavailable: [...states.values()].filter(v => v === 'unavailable').length,
    unknownPrice: [...states.values()].filter(v => v === 'unknownPrice').length,
    missingIds, closedMenu: closedMenu ? 1 : 0,
  } });
  if (data.vendor?.isOpenNow === false || data.vendor?.isOpenNow === 0) return finish(true);
  const menus = [...data.menus].sort((a, b) => Number((a.categoryId ?? 0) < 0) - Number((b.categoryId ?? 0) < 0));
  // Category provenance is independent of which duplicate carries the best price.
  // Read all occurrences first so a cheaper promotional rail cannot replace the
  // actual menu section (also works when a normal occurrence has no price).
  const categories = new Map();
  for (const menu of menus) for (const p of menu.products) {
    const variants = Array.isArray(p.variations) && p.variations.length ? p.variations : [p];
    for (const value of variants) {
      const id=String(value.id ?? p.id);
      const candidates=[
        {categoryId:menu.categoryId,category:String(menu.category ?? '')},
        {categoryId:value.menuCategoryID ?? value.menuCategoryId ?? p.menuCategoryID ?? p.menuCategoryId,
          category:String(value.menuCategoryTitle ?? value.categoryTitle ?? p.menuCategoryTitle ?? p.categoryTitle ?? '')},
      ];
      for(const candidate of candidates) {
        if(!candidate.category.trim())continue;
        const rank=isPromotionalCategory(candidate.categoryId,candidate.category) ? 0 : candidate.categoryId!=null && Number(candidate.categoryId)>=0 ? 3 : 2;
        if(!categories.has(id) || rank>categories.get(id).rank)categories.set(id,{...candidate,rank});
      }
    }
  }
  for (const menu of menus) {
    if (!Array.isArray(menu.products)) throw new SourceError('بخشی از منو ناقص بود؛ این رستوران کامل حساب نشد.');
    for (const p of menu.products) {
      const variants = Array.isArray(p.variations) && p.variations.length ? p.variations : Array.isArray(p.productVariations) && p.productVariations.length ? p.productVariations : [p];
      // A variation ID is not the parent ID used by Snappfood's -pp: route.
      const parentProductId = numericId(p.productId ?? p.product_id) ?? (variants[0] !== p ? numericId(p.id) : null);
      for (const variation of variants) {
        const value = variation === p ? p : { ...p, ...variation };
        const id = value.id;
        if (id === undefined || id === null) { missingIds++; continue; }
        // Repeated rails may carry a different current deal for the same portion.
        if (unavailable(p, stamp) || unavailable(value, stamp)) { if (!states.has(String(id))) states.set(String(id), 'unavailable'); continue; }
        const price = finalPrice(value);
        if (price === null) { if (!states.has(String(id))) states.set(String(id), 'unknownPrice'); continue; }
        states.set(String(id), 'available');
        const existingIndex = rows.findIndex(row => row.variationId === String(id));
        if (existingIndex >= 0 && rows[existingIndex].price <= price) continue;
        const parentId = parentProductId ?? numericId(value.productId ?? value.product_id);
        const row = { id: `${vendor.code}:${id}`, productId: String(id), variationId: String(id), parentProductId: parentId, vendorCode: vendor.code, vendor: vendor.title, service: vendor.service ?? 'restaurant',
          title: String(p.title ?? value.title ?? '').slice(0, 400), variation: variation !== p ? String(variation.title ?? '') : String(value.portionTitle ?? ''),
          category: categories.get(String(id))?.category ?? String(value.menuCategoryTitle ?? value.categoryTitle ?? menu.category ?? ''),
          categoryId: categories.get(String(id))?.categoryId ?? null, price, originalPrice: number(value.price),
          rating: vendor.rating, foodRating: stars(value.normalized_rating), eta: vendor.eta, reviews: vendor.reviews,
          deliveryFee: vendor.deliveryFee ?? null, originalDeliveryFee: vendor.originalDeliveryFee ?? null,
          image: safeImage(value.image ?? value.imageUrl ?? p.image), checkedAt: new Date(stamp).toISOString(),
          ...foodLink(vendor.code, parentId, id, p.title ?? value.title, vendor.service ?? 'restaurant'),
          menuUrl: numericId(id) ? `https://snappfood.ir/${vendor.service ?? 'restaurant'}/menu/${vendor.code}/#sf-food=${id}` : null,
        };
        row.productCategory=classifyProduct(row);
        if (existingIndex >= 0) {
          const previous = rows[existingIndex];
          if (!row.parentProductId && previous.parentProductId) Object.assign(row, {parentProductId: previous.parentProductId, ...foodLink(vendor.code, previous.parentProductId, id, previous.title, previous.service ?? vendor.service ?? 'restaurant')});
          rows[existingIndex] = row;
        } else rows.push(row);
      }
    }
  }
  return finish();
}
const extras = /نوشیدنی|سرویس اضافه|سرویس اضافی|افزودنی|مخلفات|دورچین|سس|نان اضافه/;
export function exclusionReason(row, f) {
  if (!Number.isFinite(row.eta) || row.eta <= 0 || row.eta > f.maxTime) return 'time';
  if (f.minRating !== 0 && (!Number.isFinite(row.rating) || row.rating < f.minRating)) return 'rating';
  if (!Number.isFinite(row.price) || row.price < 0) return 'unknownPrice';
  if (row.price < f.minPrice || row.price > f.maxPrice) return 'price';
  if (f.query && !normalized(row.title + ' ' + row.variation).includes(normalized(f.query))) return 'query';
  if ((f.service ?? 'restaurant') === 'restaurant' && f.hideExtras && extras.test(normalized(row.category))) return 'extras';
  return null;
}
export function matches(row, f) {
  return exclusionReason(row, f) === null;
}
export function sorted(rows, sort) {
  const compare = sort === 'price' ? (a, b) => a.price - b.price || a.eta - b.eta : sort === 'time' ? (a, b) => a.eta - b.eta || (b.rating ?? -1) - (a.rating ?? -1) : (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.eta - b.eta || a.price - b.price;
  return [...rows].sort(compare);
}
