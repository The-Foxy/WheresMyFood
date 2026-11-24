import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {renderedMenuStep,readRenderedMenu} from '../src/rendered-menu.js';
import {Scanner} from '../src/engine.js';
const card=(attrs,width=100)=>({getAttribute:k=>attrs[k]??null,getBoundingClientRect:()=>({width,height:100})});
test('uses the actual DOM final price, not a reconstructed Pro percentage',()=>{
 const node=card({'data-variation-id':'27475147','data-discounted-price':'509362.5','data-product-price':'799000','data-pro-discount-percent':'15'});
 const value=vm.runInNewContext(`(${renderedMenuStep.toString()})(false)`,{document:{querySelectorAll:()=>[node],getElementById:()=>null,scrollingElement:{clientHeight:800,scrollHeight:800,scrollTop:0}}});
 assert.equal(value.quotes[0].price,509363);assert.equal(value.quotes[0].proPercent,15);
});
test('invalid/missing prices, invisible cards and invalid variation IDs are never free quotes',()=>{
 const rows=[card({'data-variation-id':'123','data-discounted-price':'', 'data-product-price':'1000'}),card({'data-variation-id':'123','data-discounted-price':'2000','data-product-price':'1000'}),card({'data-variation-id':'../x','data-discounted-price':'100'}),card({'data-variation-id':'123','data-discounted-price':'100'},0)];
 const q=vm.runInNewContext(`(${renderedMenuStep.toString()})(false)`,{document:{querySelectorAll:()=>rows,getElementById:()=>null}});assert.equal(q.quotes.length,0);
});
test('rendering advances the nested main-container, not window scroll',()=>{
 let moved;const root={clientHeight:800,scrollHeight:6000,scrollTop:400,scrollTo:o=>{moved=o.top;}};
 vm.runInNewContext(`(${renderedMenuStep.toString()})(true)`,{document:{querySelectorAll:()=>[],getElementById:()=>root}});assert.equal(moved,960);
});
test('script ignores redirected pages outside the requested menu',()=>{
 const q=vm.runInNewContext(`(${renderedMenuStep.toString()})(true,'abc')`,{location:{origin:'https://snappfood.ir',pathname:'/checkout/'}});assert.equal(q.quotes.length,0);
});
function browser(steps){let reads=0,removed=0;return {get removed(){return removed;},tabs:{create:async o=>{assert.equal(o.active,false);assert.equal(o.url,'https://snappfood.ir/restaurant/menu/abc/');return{id:12};},remove:async()=>{removed++;}},scripting:{executeScript:async()=>[{result:steps(reads++)}]}};}
test('temporary menu closes after stable bottom and retains lower duplicate quote',async()=>{
 const api=browser(i=>({quotes:[{id:'123',price:i?90:100}],height:1000,top:200,viewport:800,atBottom:true}));
 const r=await readRenderedMenu(api,'abc',null,async()=>{});assert.equal(r.complete,true);assert.equal(r.quotes[0].price,90);assert.equal(api.removed,1);
});
test('abort closes the temporary menu; no account check or private API is needed',async()=>{
 const c=new AbortController(),api=browser(()=>({quotes:[]}));
 await assert.rejects(readRenderedMenu(api,'abc',c.signal,async()=>c.abort()),{name:'AbortError'});assert.ok(api.removed>=1);
});
test('a never-loaded menu fails explicitly rather than returning a successful empty price list',async()=>{
 const api=browser(()=>({quotes:[],atBottom:false}));await assert.rejects(readRenderedMenu(api,'abc',null,async()=>{}),/بارگذاری/);assert.equal(api.removed,1);
});
test('scan filters on rendered price; missing price excluded, no account gate',async()=>{
 let last;
 const scan=new Scanner({context:async()=>({lat:35,long:51}),read:async op=>op==='vendors'?{data:{finalResult:[{type:'VENDOR',data:{code:'abc',title:'test',eta:20,rating:9}}],hasNext:false}}:{data:{menus:[{products:[{id:123,title:'برگر',price:799000},{id:124,title:'پاستا',price:300000}]}]}},renderMenu:async()=>({quotes:[{id:'123',price:509363,originalPrice:799000,proPercent:15}],complete:true})},s=>{last=s;},{pause:0});
 await scan.run({verifyPrices:true,minPrice:500000,maxPrice:550000,maxTime:40,minRating:0,hideExtras:false});
 assert.equal(last.rows.length,1);assert.equal(last.rows[0].price,509363);assert.equal(last.rows[0].priceSource,'rendered');assert.equal(last.audit.unknownPrice,1);assert.ok(last.rows[0].menuUrl.endsWith('#sf-food=123'));
});
test('a partially rendered menu remains retryable and a complete retry replaces old filtered results',async()=>{
 let last,complete=false;
 const scan=new Scanner({context:async()=>({lat:35,long:51}),read:async op=>op==='vendors'?{data:{finalResult:[{type:'VENDOR',data:{code:'abc',title:'test',eta:20,rating:9}}],hasNext:false}}:{data:{menus:[{products:[{id:123,title:'غذا',price:300000}]}]}},renderMenu:async()=>({quotes:[{id:'123',price:complete?600000:300000}],complete})},s=>{last=s;},{pause:0});
 const filters={verifyPrices:true,minPrice:100000,maxPrice:400000,maxTime:40,minRating:0,hideExtras:false};
 await scan.run(filters);assert.equal(last.state,'partial');assert.equal(last.rows.length,1);assert.equal(last.checked,0);
 complete=true;await scan.run(filters,true);assert.equal(last.state,'complete');assert.equal(last.rows.length,0);assert.equal(last.checked,1);assert.equal(last.errors.length,0);
});
test('default fast search does not open or call the menu-rendering worker at all',async()=>{
 let rendered=0,last;
 const scan=new Scanner({context:async()=>({lat:35,long:51}),read:async op=>op==='vendors'?{data:{finalResult:[{type:'VENDOR',data:{code:'abc',title:'test',eta:20,rating:9}}],hasNext:false}}:{data:{menus:[{products:[{id:123,title:'غذا',price:350000,priceAfterDiscount:250000}]}]}},renderMenu:async()=>{rendered++;throw Error('Must not render');}},s=>{last=s;},{pause:0});
 await scan.run({minPrice:100000,maxPrice:400000,maxTime:40,minRating:0,hideExtras:false});
 assert.equal(rendered,0);assert.equal(last.state,'complete');assert.equal(last.rows[0].price,250000);assert.equal(last.rows[0].priceSource,'api');
});
