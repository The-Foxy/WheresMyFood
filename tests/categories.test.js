import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SERVICES,searchScope,vendorService} from '../src/categories.js';
import {defaults,validateFilters,vendorPage,foodLink} from '../src/core.js';
import {requestTarget,requestParameters,pageRead} from '../src/background.js';
import {targetVariation} from '../src/food-focus.js';
import {readRenderedMenu} from '../src/rendered-menu.js';
import {Scanner} from '../src/engine.js';
const context={lat:35.7,long:51.4};
test('known service list excludes supermarket and rejects arbitrary destinations',()=>{
 assert.equal(SERVICES.length,8);assert.ok(!SERVICES.some(x=>/market$/.test(x.id)&&x.id!=='produce-market'));
 for(const id of ['supermarket','express','../user','https://evil.example','__proto__'])assert.throws(()=>searchScope(id));
});
test('legacy settings still default to all restaurants; stale food type clears outside restaurant',()=>{
 assert.deepEqual(searchScope(),{service:'restaurant',foodType:''});
 assert.equal(validateFilters({...defaults,service:'caffe',foodType:'7'}).foodType,'');
 assert.throws(()=>validateFilters({...defaults,foodType:'999999'}));
 assert.equal(validateFilters({...defaults,foodType:'7'}).foodType,'7');
});
test('fast-food is filtered in the upstream native request, not by merchant-name guessing',()=>{
 const value={context,page:0,service:'restaurant',foodType:'7'};
 assert.equal(requestTarget('vendors',value),'https://snappfood.ir/search/api/v4/restaurant/vendors-list');
 const p=requestParameters('vendors',value);
 assert.equal(p.sp_alias,'restaurant');assert.equal(p.category,'{"value":7,"sub":[]}');assert.equal(p.superType,undefined);
 assert.equal(p.page_size,10);
});
test('each main section scopes the native vendor request; default restaurant endpoint stays compatible',()=>{
 for(const service of SERVICES){const v={context,page:0,service:service.id};const p=requestParameters('vendors',v);assert.equal(p.sp_alias,service.id);assert.equal(p.category,undefined);assert.match(requestTarget('vendors',v),/snappfood\.ir\/search\/api\/(v1\/desktop|v4\/restaurant)\/vendors-list$/);}
 const v={context,page:2};assert.ok(requestTarget('vendors',v).includes('/v1/desktop/'));assert.equal(requestParameters('vendors',v).superType,'[1]');
});
test('merchant menu route follows explicit vendor service, with the selected section as fallback',()=>{
 assert.equal(vendorService({},'caffe'),'caffe');assert.equal(vendorService({superTypeId:11},'produce-market'),'protein');
 const rows=vendorPage({data:{finalResult:[{type:'VENDOR',data:{code:'abc',title:'test'}}]}},'bakery');assert.equal(rows.vendors[0].service,'bakery');
});
test('food links and menu focus preserve supported service paths',()=>{
 for(const service of SERVICES){
  const link=foodLink('abc',1,2,'test',service.id);assert.equal(new URL(link.url).pathname,`/${service.id}/menu/abc/product/test-pp:1/`);
  assert.equal(targetVariation({origin:'https://snappfood.ir',pathname:`/${service.id}/menu/abc/`,hash:'#sf-food=2'}),'2');
 }
 assert.equal(targetVariation({origin:'https://snappfood.ir',pathname:'/checkout/menu/abc/',hash:'#sf-food=2'}),null);
 assert.equal(foodLink('abc',1,2,'test','supermarket').linkKind,'unavailable');
});
test('category is forwarded on every page; switching section invalidates a completed checkpoint',async()=>{
 let state;const calls=[];
 const scan=new Scanner({context:async()=>context,read:async(op,value)=>{
  calls.push([op,value.service,value.foodType]);return op==='vendors'?{data:{finalResult:[{type:'VENDOR',data:{code:'abc',title:'test',rating:9,eta:20}}],hasNext:false}}:{data:{menus:[{products:[{id:123,title:'غذا',price:200000}]}]}};
 }},s=>{state=s;},{pause:0});
 await scan.run({...defaults,foodType:'7'});assert.equal(state.rows.length,1);assert.equal(calls[0][2],'7');
 await scan.run({...defaults,service:'caffe'},true);assert.equal(calls.filter(c=>c[0]==='menu').length,2);assert.equal(state.rows.length,1);assert.equal(state.rows[0].service,'caffe');assert.ok(state.rows[0].menuUrl.includes('/caffe/menu/'));
});
test('optional rendered price verification opens the chosen service route',async()=>{
 let removed=0;const api={tabs:{create:async v=>{assert.equal(v.url,'https://snappfood.ir/caffe/menu/abc/');return{id:1};},remove:async()=>{removed++;}},scripting:{executeScript:async v=>{assert.equal(v.args[2],'caffe');return[{result:{quotes:[{id:'123',price:100}],height:800,top:0,viewport:800,atBottom:true}}];}}};
 await readRenderedMenu(api,'abc',null,async()=>{},'caffe');assert.equal(removed,1);
 await assert.rejects(readRenderedMenu(api,'abc',null,async()=>{},'supermarket'));
});
test('serialized browser transport permits only the exact native v4 endpoint',async t=>{
 const old=globalThis.location;globalThis.location={origin:'https://snappfood.ir'};t.after(()=>{if(old===undefined)delete globalThis.location;else globalThis.location=old;});
 const fetch=t.mock.method(globalThis,'fetch',async()=>Response.json({data:{finalResult:[]}}));
 const v=await pageRead('https://snappfood.ir/search/api/v4/restaurant/vendors-list',{sp_alias:'caffe',category:'{"value":7,"sub":[]}'});assert.ok(v.data);assert.equal(fetch.mock.callCount(),1);
 for(const path of ['/search/api/v4/user/vendors-list','/search/api/v4/restaurant/orders'])assert.equal((await pageRead('https://snappfood.ir'+path,{})).fatal,true);
 assert.equal(fetch.mock.callCount(),1);
});
test('a matching native merchant URL takes precedence for mixed service collections',()=>{
 assert.equal(vendorService({code:'abc',url:'https://snappfood.ir/protein/menu/test-r-abc/'},'produce-market'),'protein');
 assert.equal(vendorService({code:'abc',url:'https://evil.example/protein/menu/test-r-abc/'},'produce-market'),'produce-market');
 assert.equal(vendorService({code:'abc',url:'/protein/menu/test-r-def/'},'produce-market'),'produce-market');
});
test('restaurant extras filter does not discard the main products of juice shops or cafes',async()=>{
 const {matches}=await import('../src/core.js');
 const f=validateFilters({...defaults,service:'juice',hideExtras:true});assert.equal(f.hideExtras,false);
 assert.ok(matches({price:200000,eta:25,rating:4.5,title:'آب پرتقال',variation:'',category:'نوشیدنی'},f));
});
