import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { vendorPage, eligible, defaults } from '../src/core.js';
import { requestParameters } from '../src/background.js';
import { Scanner } from '../src/engine.js';

// Sanitized public v4 schema observed live: synthetic merchant data, no account
// identifiers, real user coordinates or response bodies are checked in.
const fixture = JSON.parse(readFileSync(new URL('fixtures/vendors-v4.json', import.meta.url)));
const context = {lat:35.7,long:51.4};
const menu = {data:{menus:[{category:'نوشیدنی',products:[{id:123,title:'قهوه',price:200000}]}]}};
const empty = {data:{finalResult:[]}};

test('native v4 vendorCode/isOpen cards survive parsing with correct rating, service and delivery fee',()=>{
  const page=vendorPage(fixture,'caffe');
  assert.deepEqual(page.vendors.map(v=>v.code),['abc101','def202']);
  assert.equal(page.vendors[0].rating,4.7);
  assert.equal(page.vendors[0].service,'caffe');
  assert.equal(page.vendors[0].deliveryFee,42500);
  assert.equal(page.vendors[1].open,false);
  assert.equal(eligible(page.vendors[1],defaults),false);
  assert.deepEqual(page.cursor,{vendor_index:2,item_index:4});
  assert.equal(page.empty,false);
});
test('unreadable vendor IDs pause explicitly rather than pretending there were no vendors',()=>{
  assert.throws(()=>vendorPage({data:{finalResult:[{type:'VENDOR',data:{vendorCode:'../user'}}]}}),e=>e.fatal===true);
  const noRating=structuredClone(fixture);delete noRating.data.finalResult[2].data.normalized_rating;delete noRating.data.finalResult[2].data.rating;
  assert.equal(vendorPage(noRating).vendors[0].rating,4.7); // rate is already on a 5-point scale.
});
test('v4 cursor uses separate vendor/item indexes and rejects malformed values',()=>{
  const input={context,page:1,service:'caffe',cursor:{vendor_index:2,item_index:4}};
  const p=requestParameters('vendors',input);
  assert.equal(p.vendor_index,2);assert.equal(p.item_index,4);
  assert.equal(p.sp_alias,'caffe');
  const first=requestParameters('vendors',{context,page:0,foodType:'7'});
  assert.equal(first.vendor_index,0);assert.equal(first.item_index,0);
  assert.equal(requestParameters('vendors',{context,page:1,cursor:input.cursor}).vendor_index,undefined);
  for(const cursor of [{vendor_index:-1,item_index:4},{vendor_index:'2',item_index:4},{vendor_index:2,item_index:Infinity}]) {
    assert.throws(()=>requestParameters('vendors',{...input,cursor}));
    assert.equal(vendorPage({data:{...fixture.data,count_details:cursor}}).cursor,null);
  }
});
test('actual v4-shaped listing reaches menu search, keeps scope and skips closed merchants',async()=>{
  const calls=[];let last;
  const scan=new Scanner({context:async()=>context,read:async(op,v)=>{
    calls.push([op,v]);return op==='vendors'?(v.page===0?fixture:empty):menu;
  }},u=>{last=u;},{pause:0});
  await scan.run({...defaults,service:'caffe'});
  assert.equal(last.state,'complete');assert.equal(last.vendors,2);assert.equal(last.checked,1);
  assert.equal(last.rows.length,1);assert.equal(last.rows[0].vendorCode,'abc101');
  assert.equal(last.rows[0].service,'caffe');
  assert.deepEqual(calls.filter(([op])=>op==='menu').map(([,v])=>v.code),['abc101']);
  assert.deepEqual(calls[1][1].cursor,{vendor_index:2,item_index:4});
});
test('a text/banner-only first page advances to merchants instead of stopping as an empty list',async()=>{
  const pages=[{data:{finalResult:fixture.data.finalResult.slice(0,2),count_details:{vendor_index:0,item_index:2}}},fixture,empty];
  const seen=[];let last;
  const scan=new Scanner({context:async()=>context,read:async(op,v)=>{
    if(op==='menu')return menu;seen.push(v);return pages[v.page];
  }},u=>{last=u;},{pause:0});
  await scan.run({...defaults,service:'caffe'});
  assert.equal(last.state,'complete');assert.equal(last.rows.length,1);
  assert.deepEqual(seen.map(v=>v.page),[0,1,2]);
  assert.deepEqual(seen[1].cursor,{vendor_index:0,item_index:2});
});
test('resume after a listing failure retains the v4 continuation cursor and retries the same page',async()=>{
  let fail=true,last;const calls=[];
  const scan=new Scanner({context:async()=>context,read:async(op,v)=>{
    if(op==='menu')return menu;calls.push(v);
    if(v.page===0)return fixture;
    if(fail)throw Error('network timeout');
    return empty;
  }},u=>{last=u;},{pause:0});
  await scan.run({...defaults,service:'caffe'});assert.equal(last.state,'paused');
  fail=false;await scan.run({...defaults,service:'caffe'},true);
  assert.equal(last.state,'complete');assert.equal(last.rows.length,1);
  assert.deepEqual(calls.map(v=>v.page),[0,1,1]);
  assert.deepEqual(calls[2].cursor,{vendor_index:2,item_index:4});
});
