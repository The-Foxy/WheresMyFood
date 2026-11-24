// Local product grouping, independent of the selected vendor service/cuisine.
// These are our display groups, not claimed to be universal Snappfood tag IDs.
export const PRODUCT_CATEGORIES = Object.freeze([
  {id:'all',label:'همه'}, {id:'food',label:'غذای اصلی'},
  {id:'drinks',label:'نوشیدنی'}, {id:'salad',label:'سالاد'},
  {id:'starters',label:'پیش‌غذا',description:'پیش‌غذا و مخلفات'},
  {id:'dessert',label:'دسر و شیرینی'}, {id:'other',label:'سایر'},
].map(Object.freeze));
const clean = value => String(value ?? '').toLowerCase().replace(/[يى]/g,'ی').replace(/ك/g,'ک')
  .replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/\u200c/g,' ').replace(/\s+/g,' ').trim();
const words = pattern => new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${pattern})(?=$|[^\\p{L}\\p{N}])`,'u');
const rules = {
  food: words('غذای اصلی|غذاهای اصلی|غذای ایرانی|غذاهای ایرانی|غذای فرنگی|غذای گیاهی|غذاهای گیاهی|پیتزا|برگر|همبرگر|ساندویچ|پنینی|پاستا|لازانیا|کباب|چلوکباب|جوجه|چلو|پلو|برنج|زرشک پلو|عدس پلو|چلوگوشت|چلو گوشت|خورشت|خورش|خوراک|سوخاری|استیک|هات داگ|هاتداگ|فلافل|املت|نیمرو|صبحانه|بشقاب|کمبو|دیزی|آبگوشت|سوشی|pizza|burger|sandwich|pasta|steak|kebab|main course|breakfast'),
  drinks: words('نوشیدنی|نوشیدنیها|نوشیدنی های|بار سرد|بار گرم|بارسرد|بارگرم|قهوه|چای|دمنوش|آبمیوه|آب میوه|آب پرتقال|آب انار|آب هویج|آب سیب|آب کرفس|آب طالبی|آب هندوانه|آب آناناس|شیک|میلک شیک|میلکشیک|اسموتی|موکتل|کوکتل|ماکتل|موهیتو|شربت|ماچا|لاته|کافه گلاسه|نوشابه|دوغ|آب معدنی|آب آشامیدنی|سودا|دلستر|اسپرسو|کاپوچینو|آمریکانو|آیس کافی|آیس تی|کولد برو|فراپه|فرپه|آفوگاتو|هات چاکلت|شکلات داغ|نسکافه|شیر کاکائو|شیر موز|شیرموز|لیموناد|milkshake|smoothie|coffee|tea|juice|beverage|beverages|drink|drinks|latte|espresso|mojito|hot chocolate'),
  salad: words('سالاد(?:ها|های)?|salad|salads'),
  starters: words('پیش غذا|پیشغذا|مخلفات|دورچین|دور چین|افزودنی|سرویس اضافه|سرویس اضافی|نان اضافه|سس|دیپ|سوپ|زیتون|ترشی|ماست|سیب زمینی|سیبزمینی|سیب زمینی سرخ کرده|قارچ سوخاری|نان سیر|حلقه پیاز|پیاز سوخاری|appetizer|appetizers|starter|starters|sides|side dish|sauce|soup|fries'),
  dessert: words('دسر|کیک|شیرینی|کوکی|بیسکویت|بستنی|ژله|وافل|پنکیک|براونی|چیزکیک|چیز کیک|تیرامیسو|شله زرد|شلهزرد|فرنی|باقلوا|dessert|desserts|cake|cookie|cookies|ice cream|waffle|pancake|brownie|cheesecake'),
};
const promotional = words('پرطرفدار|پرطرفدارها|پرفروش|پرفروشها|پرفروش ترین|محبوب|محبوب ترین|تخفیف|تخفیفدار|تخفیف دار|تخفیف دارها|پیشنهاد|پیشنهاد ویژه|منتخب|popular|bestsellers|offers|discounts|specials');
const generic=/^(?:ویژه|محصول|محصولات|منو|همه|سایر)$/u;
const sidePrefix=/^(?:سس|دیپ|ماست|ترشی|زیتون|سوپ|نان سیر|قارچ سوخاری|سیب زمینی|سیبزمینی|sauce|soup|fries)(?=$|[^\p{L}\p{N}])/u;
const dessertPrefix=/^(?:کیک|کوکی|دسر|بستنی|چیزکیک|چیز کیک|براونی|تیرامیسو|cake|cookie|dessert|ice cream|cheesecake)(?=$|[^\p{L}\p{N}])/u;
const saladWord=words('سالاد(?:ها|های)?|salad');
const saladPrefix=/^(?:سالاد(?:ها|های)?|salad)(?=$|[^\p{L}\p{N}])/u;
const wholeMeal=words('پیتزا|برگر|ساندویچ|چلو|پلو|کباب|جوجه|pizza|burger|sandwich');
export function isPromotionalCategory(id,title) {
  return (id !== null && id !== undefined && id !== '' && Number.isFinite(Number(id)) && Number(id)<0) || promotional.test(clean(title)) || generic.test(clean(title));
}
function hits(text) { const result=[];for(const [id,pattern] of Object.entries(rules))if(pattern.test(text))result.push(id);return result; }
function fromTitle(text) {
  // A complete meal may mention a drink/side: "پیتزا + نوشابه" stays a meal.
  // Sauce/salad and named sides precede the words used in their flavours.
  if (sidePrefix.test(text)) return 'starters';
  if (dessertPrefix.test(text)) return 'dessert';
  if (saladPrefix.test(text) || (saladWord.test(text) && !wholeMeal.test(text))) return 'salad';
  if (rules.food.test(text)) return 'food';
  if (rules.drinks.test(text)) return 'drinks';
  if (rules.dessert.test(text)) return 'dessert';
  if (rules.starters.test(text)) return 'starters';
  return 'other';
}
export function classifyProduct({category='',categoryId=null,title='',variation=''}={}) {
  const name=clean(`${title} ${variation}`), source=clean(category);
  const byName=fromTitle(name);
  const groups=isPromotionalCategory(categoryId,source) ? [] : hits(source);
  if(groups.length===1) {
    // Broad starter menus often include salads as their own product kind.
    if(groups[0]==='starters' && byName==='salad')return 'salad';
    return groups[0];
  }
  return byName;
}
export function categoryLabel(id) { return PRODUCT_CATEGORIES.find(x=>x.id===id)?.label ?? 'سایر'; }
export function groupResults(rows,active='all') {
  const counts=Object.fromEntries(PRODUCT_CATEGORIES.map(x=>[x.id,0]));counts.all=rows.length;
  const group=row=>PRODUCT_CATEGORIES.some(x=>x.id!=='all' && x.id===row.productCategory) ? row.productCategory : classifyProduct(row);
  for(const row of rows)counts[group(row)]++;
  return {counts,rows:active==='all' ? rows : rows.filter(row=>group(row)===active)};
}
