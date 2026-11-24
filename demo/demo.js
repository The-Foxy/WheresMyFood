import { mountApp } from '../src/app.js';
const vendors = [
  { code: 'green1', title: 'کافه‌رستوران نمونه سبز', rating: 9.2, eta: 25, is_open: true, deliver: true, commentCount: 1200, deliveryFee: 34000 },
  { code: 'pizza1', title: 'پیتزای نمونه تنوری', rating: 9, eta: 35, is_open: true, deliver: true, commentCount: 870, deliveryFee: 50000, isDeliveryFeeHasDiscount: true, deliveryFeeAfterDiscount: 5000 },
  { code: 'burger1', title: 'برگر نمونه', rating: 8.6, eta: 30, is_open: true, deliver: true, commentCount: 650, deliveryFee: 0 },
  { serviceAlias:'caffe', code: 'salad1', title: 'کافهٔ نمونه باغچه', rating: 9.6, eta: 20, is_open: true, deliver: true, commentCount: 300 },
  { code: 'slow1', title: 'رستوران نمونه دور', rating: 9.6, eta: 70, is_open: true, deliver: true },
  { code: 'low1', title: 'رستوران نمونه کم‌امتیاز', rating: 6, eta: 20, is_open: true, deliver: true },
];
const menus = {
  green1: [{ id: 101, title: 'زرشک‌پلو با مرغ', price: 380000, discount: 38000, category: 'غذای ایرانی' }, { id: 102, title: 'چلوکباب کوبیده', price: 395000, category: 'غذای ایرانی' }, { id: 103, title: 'عدس‌پلو با کشمش', price: 230000, category: 'غذای ایرانی' }, { id: 104, title: 'دوغ', price: 35000, category: 'نوشیدنی' }],
  pizza1: [{ id: 201, title: 'پیتزا مارگاریتا', price: 360000, discount: 36000, category: 'پیتزا', normalized_rating: 9.2 }, { id: 202, title: 'پیتزا سبزیجات', price: 390000, category: 'پیتزا' }, { id: 203, title: 'پیتزا مخصوص', price: 550000, category: 'پیتزا' }],
  burger1: [{ id: 301, hasProDiscount:true, proDiscountRatio:15, title: 'چیزبرگر مخصوص', price: 350000, discount: 35000, category: 'برگر', normalized_rating: 8.8 }, { id: 302, title: 'چیکن برگر', price: 285000, category: 'برگر' }],
  salad1: [{ id: 401, title: 'سالاد سزار با مرغ', price: 295000, category: 'سالاد', normalized_rating: 9.4 }, { id: 402, title: 'بشقاب سبزیجات گریل', price: 245000, category: 'غذای گیاهی' }],
};
menus.green1.push(
  {id:105,title:'آیس لاته',price:180000,category:'بار سرد'},
  {id:106,title:'سالاد سزار با مرغ',price:210000,category:'سالاد'},
  {id:107,title:'سوپ روز',price:170000,category:'پیش غذا'},
  {id:108,title:'کیک قهوه',price:190000,category:'کیک و دسر'},
  {id:109,title:'محصول مخصوص روز',price:220000,category:'محصول'},
);
const extras = [
  {code:'sweet1',serviceAlias:'confectionery',title:'شیرینی نمونه',rating:9,eta:25,deliveryFee:20000},
  {code:'bread1',serviceAlias:'bakery',title:'نانوایی نمونه',rating:9,eta:20,deliveryFee:0},
  {code:'juice1',serviceAlias:'juice',title:'آبمیوه نمونه',rating:9,eta:25,deliveryFee:15000},
  {code:'fruit1',serviceAlias:'grocery',title:'میوه‌فروشی نمونه',rating:9,eta:30,deliveryFee:25000},
  {code:'meat1',serviceAlias:'protein',title:'پروتئینی نمونه',rating:9,eta:30,deliveryFee:30000},
  {code:'veg1',serviceAlias:'produce-market',title:'تره‌بار نمونه',rating:9,eta:25,deliveryFee:10000},
];
const demoTitles=['کیک شکلاتی','بستهٔ نان تازه','آب‌پرتقال','بستهٔ میوه','فیلهٔ مرغ','سبزی تازه'];
extras.forEach((v,i)=>{vendors.push({...v,is_open:true,deliver:true});menus[v.code]=[{id:501+i,title:demoTitles[i],price:180000+i*10000,category:i===2?'نوشیدنی':'محصول'}];});
const transport = {
  context: async () => ({ lat: 35.7, long: 51.4, client: {}, demo: true }),
  read: async (operation, value) => {
    await new Promise(resolve => setTimeout(resolve, 280));
    if (operation === 'vendors') {
      const scoped=vendors.filter(v=>(v.serviceAlias??'restaurant')===(value.service??'restaurant')).filter(v=>!value.foodType || (value.foodType==='7' ? ['pizza1','burger1'].includes(v.code) : value.foodType==='1' ? v.code==='green1' : false));
      return {data:{finalResult:scoped.slice(value.page*3,value.page*3+3).map(data=>({type:'VENDOR',data})),hasNext:(value.page+1)*3<scoped.length}};
    }
    return { data: { vendor: { isOpenNow: true }, menus: (menus[value.code] ?? []).map(p => ({ categoryId: p.id, category: p.category, products: [p] })) } };
  },
};
mountApp(document.getElementById('app'), transport, {
  demo: true,
  // Explicit sample status: the demo never contacts GitHub or a native host.
  updater:{status:async()=>({state:'up_to_date'}),check:async()=>({state:'up_to_date'})},
  loadPreferences: async () => { try { return JSON.parse(localStorage.getItem('demoFoodFilters') ?? '{}'); } catch { return {}; } },
  savePreferences: async value => localStorage.setItem('demoFoodFilters', JSON.stringify(value)),
  imageFor: row => `assets/${row.productCategory==='drinks' ? 'drink' : row.category === 'پیتزا' ? 'pizza' : row.category === 'برگر' ? 'burger' : row.category === 'غذای ایرانی' ? 'rice' : 'salad'}.svg`,
});
