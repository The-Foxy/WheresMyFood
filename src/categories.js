// Service aliases and category IDs observed in Snappfood's own links, category
// data attributes and public resource URLs, 2026-11-22. Supermarket is excluded.
export const SERVICES = Object.freeze([
  {id:'restaurant',label:'رستوران',superType:1},
  {id:'caffe',label:'کافه',superType:2},
  {id:'confectionery',label:'شیرینی',superType:3},
  {id:'bakery',label:'نانوایی',superType:5},
  {id:'juice',label:'آبمیوه و بستنی',superType:8},
  {id:'grocery',label:'میوه',superType:6},
  {id:'protein',label:'پروتئین',superType:11},
  {id:'produce-market',label:'تره‌بار',superType:28},
].map(Object.freeze));
export const FOOD_TYPES = Object.freeze([
  {id:'',label:'همهٔ غذاها'}, {id:'7',label:'فست‌فود'},
  {id:'1',label:'ایرانی'}, {id:'16',label:'کباب'},
  {id:'99',label:'رژیمی'}, {id:'100',label:'گیاهی'},
  {id:'107',label:'آش و حلیم'}, {id:'106',label:'طباخی'},
  {id:'33',label:'صبحانه و میان‌وعده'}, {id:'101',label:'سالاد'},
  {id:'42',label:'دریایی'}, {id:'14',label:'بین‌الملل'},
].map(Object.freeze));
export const getService = (id='restaurant') => SERVICES.find(x=>x.id===id) ?? null;
export const getFoodType = (id='') => FOOD_TYPES.find(x=>x.id===id) ?? null;
export function searchScope(service='restaurant',foodType='') {
  if (!getService(service)) throw Error('این بخش در ابزار پشتیبانی نمی‌شه.');
  if (service!=='restaurant') foodType='';
  if (!getFoodType(foodType)) throw Error('این نوع غذا معتبر نیست؛ دوباره انتخابش کن.');
  return {service,foodType};
}
export function vendorService(v, fallback='restaurant') {
  for (const raw of [v.menuUrl,v.menu_url,v.url,v.fullLink]) {
    if (typeof raw!=='string') continue;
    try {
      const url=new URL(raw,'https://snappfood.ir');
      const route=/^\/([a-z-]+)\/menu\/([^/]+)\/?$/.exec(url.pathname);
      if (url.origin==='https://snappfood.ir' && !url.username && !url.password && route && getService(route[1]) && (route[2]===v.code || route[2].endsWith('-r-'+v.code))) return route[1];
    } catch { /* Unknown merchant link is ignored. */ }
  }
  for (const value of [v.serviceAlias,v.superTypeAlias,v.superType?.alias,v.vendorSuperType?.alias]) {
    const alias=typeof value==='string' ? value.toLowerCase() : null;
    if (alias && getService(alias)) return alias;
  }
  for (const value of [v.superTypeId,v.vendorSuperTypeId,v.vendor_super_type_id,v.superType?.id,v.vendorSuperType?.id,v.superType,v.vendorSuperType]) {
    if (typeof value!=='number' && typeof value!=='string') continue;
    const match=SERVICES.find(x=>String(x.superType)===String(value));if(match)return match.id;
  }
  return getService(fallback)?.id ?? 'restaurant';
}
