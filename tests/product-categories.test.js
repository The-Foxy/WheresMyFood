import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyProduct,groupResults} from '../src/product-categories.js';
import {menuItems,defaults,sorted} from '../src/core.js';
import {Scanner} from '../src/engine.js';
import {SERVICES} from '../src/categories.js';
const vendor={code:'abc',title:'نمونه',rating:4.5,eta:25};

test('real menu section titles group hot/cold bars, salads, mains and desserts across services',()=>{
  for(const [category,expected] of [
    ['بار سرد','drinks'],['ماچا بار گرم','drinks'],['قهوه سرد با شیر گیاهی','drinks'],
    ['چای و دمنوش','drinks'],['نوشيدني‌های سرد','drinks'],['سالادهای رژیمی','salad'],
    ['غذای ایرانی','food'],['برگر','food'],['پیش غذا','starters'],['کیک و دسر','dessert'],
  ])assert.equal(classifyProduct({category,title:'نمونه'}),expected,category);
});
test('generic/promotional categories fall back to product names; uncertain items remain other',()=>{
  for(const [title,expected] of [['آیس لاته','drinks'],['سالاد سزار با مرغ','salad'],['پیتزا مخصوص','food'],['کیک قهوه','dessert'],['سس سالاد','starters'],['شیرین‌پلو','food'],['بستهٔ ویژهٔ شماره ۳','other']]){
    assert.equal(classifyProduct({category:'پرطرفدارها',categoryId:-1,title}),expected,title);
  }
  assert.equal(classifyProduct({category:'قهوه‌های ویژه',title:'نمونه'}),'drinks');
  assert.equal(classifyProduct({category:'غذا',title:'چاى سبز'}),'drinks');
  assert.equal(classifyProduct({category:'منو',title:'Iced Coffee'}),'drinks');
});
test('mixed sections use product names and meal/side/drink mentions do not blindly override product type',()=>{
  for(const [title,category,expected] of [
    ['آب پرتقال','نوشیدنی و دسر','drinks'],['کیک شکلاتی','نوشیدنی و دسر','dessert'],
    ['پیتزا + نوشابه','پرطرفدارها','food'],['برگر با سس قارچ','پرطرفدارها','food'],
    ['سس پیتزا','پرطرفدارها','starters'],['سالاد سزار','پیش غذا','salad'],
    ['سالاد با جوجه','پرطرفدارها','salad'],['جوجه + سالاد','پرطرفدارها','food'],
    ['ساندویچ سالاد','ساندویچ','food'],['بستنی قهوه','منو','dessert'],
  ])assert.equal(classifyProduct({title,category}),expected,title);
});
test('the cheapest promotional duplicate keeps its original menu category and native food links',()=>{
  const p={id:100,title:'محصول ویژه',variations:[{id:101,title:'بزرگ',price:250000}]};
  const payload={data:{menuCategories:[
    {id:-1,title:'پرطرفدارها',products:[{...p,menuCategoryID:-1,menuCategoryTitle:'پرطرفدارها',variations:[{id:101,title:'بزرگ',price:180000}]}]},
    {id:2660880,title:'بار سرد',products:[p]},
  ]}};
  const rows=menuItems(payload,vendor);assert.equal(rows.length,1);
  const row=rows[0];assert.equal(row.price,180000);assert.equal(row.category,'بار سرد');
  assert.equal(row.categoryId,2660880);assert.equal(row.productCategory,'drinks');
  assert.equal(row.parentProductId,'100');assert.ok(row.url.includes('-pp:100/'));
  assert.equal(rows.stats.totalOptions,1);
});
test('explicit product menuCategoryTitle/ID works when the surrounding section is promotional',()=>{
  const rows=menuItems({data:{menuCategories:[{id:-2,title:'تخفیف‌دارها',products:[{
    id:100,title:'گزینهٔ مخصوص',menuCategoryID:333,menuCategoryTitle:'سالاد',
    variations:[{id:101,title:'یک نفره',price:200000}],
  }]}]}},vendor);
  assert.equal(rows[0].category,'سالاد');assert.equal(rows[0].categoryId,333);assert.equal(rows[0].productCategory,'salad');
});
test('normal metadata is retained even when that occurrence has no usable price',()=>{
  const rows=menuItems({data:{menus:[
    {categoryId:10,category:'دسر',products:[{id:1,title:'ویژه'}]},
    {categoryId:-1,category:'پرطرفدارها',products:[{id:1,title:'ویژه',price:200000}]},
  ]}},vendor);
  assert.equal(rows[0].category,'دسر');assert.equal(rows[0].productCategory,'dessert');
  assert.equal(rows.stats.unknownPrice,0);assert.equal(rows.stats.availableOptions,1);
});
test('category counts are disjoint, respect the already-applied price filters and preserve sorting/data',()=>{
  const rows=[{id:1,productCategory:'drinks',price:200000},{id:2,productCategory:'salad',price:250000},{id:3,title:'نامشخص',category:'محصول',price:180000}];
  const {counts,rows:drinks}=groupResults(rows,'drinks');
  assert.equal(counts.all,3);assert.equal(counts.drinks,1);assert.equal(counts.salad,1);assert.equal(counts.other,1);
  assert.equal(Object.entries(counts).filter(([id])=>id!=='all').reduce((sum,[,n])=>sum+n,0),counts.all);
  assert.deepEqual(drinks.map(x=>x.id),[1]);assert.deepEqual(groupResults(rows,'food').rows,[]);
  assert.deepEqual(sorted(groupResults(rows).rows,'price').map(x=>x.id),[3,1,2]);
  assert.deepEqual(rows.map(x=>x.id),[1,2,3]);
});
test('all supported service scans retain drinks/salads and local category changes make no requests',async()=>{
  const products=[['پیتزا','پیتزا'],['قهوه','بار گرم'],['سالاد سزار','سالاد'],['سوپ','پیش غذا'],['کیک','دسر'],['محصول جدید','محصول']];
  for(const service of SERVICES){
    let state,calls=0;
    const scanner=new Scanner({context:async()=>({lat:35.7,long:51.4}),read:async op=>{
      calls++;return op==='vendors'?{data:{finalResult:[{type:'VENDOR',data:{code:'abc',rating:9,eta:25}}],hasNext:false}}
        :{data:{menuCategories:products.map(([title,category],i)=>({id:i+1,title:category,products:[{id:100+i,title,price:200000}]}))}};
    }},value=>{state=value;},{pause:0});
    await scanner.run({...defaults,service:service.id,hideExtras:false});assert.equal(state.rows.length,6,service.id);
    const before=calls;
    for(const category of ['food','drinks','salad','starters','dessert','other'])assert.equal(groupResults(state.rows,category).rows.length,1,category);
    assert.equal(calls,before);assert.equal(state.audit.matched,6);assert.equal(state.state,'complete');
  }
});
