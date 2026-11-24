import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFoodFocus } from '../src/food-focus.js';
function fixture() {
  const events = new Map(); let found = false, steps = 0, focused = 0;
  const item = { style: {}, scrollIntoView() { focused++; } };
  const win = { location: { origin: 'https://snappfood.ir', pathname: '/restaurant/menu/abc/', hash: '#sf-food=123' }, innerHeight: 800,
    addEventListener(k, fn) { events.set(k, fn); }, removeEventListener(k) { events.delete(k); }, matchMedia() { return { matches: true }; },
    scrollBy() { steps++; doc.scrollingElement.scrollTop += 520; if (steps === 3) found = true; } };
  const doc = { getElementById() { return found ? item : null; }, documentElement: {}, scrollingElement: { scrollHeight: 15000, scrollTop: 0 } };
  return {win,doc,events,item,get steps(){return steps;},get focused(){return focused;}};
}
test('lazy menu search scrolls until the exact food is mounted, then highlights and stops', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(), stop = installFoodFocus(f.win,f.doc);
  for (let i=0;i<6;i++) t.mock.timers.tick(1200);
  assert.equal(f.steps,3); assert.equal(f.focused,1); assert.match(f.item.style.outline,/3px/);
  t.mock.timers.tick(10000); assert.equal(f.steps,3); stop();
});
test('manual wheel input cancels automatic menu scrolling', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f=fixture(),stop=installFoodFocus(f.win,f.doc);
  t.mock.timers.tick(1200); assert.equal(f.steps,1);
  f.events.get('wheel')({type:'wheel'}); t.mock.timers.tick(10000);
  assert.equal(f.steps,1); assert.equal(f.focused,0);stop();
});
test('navigation away cancels seeking and never scrolls a different page', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f=fixture(),stop=installFoodFocus(f.win,f.doc);
  f.win.location.hash='';t.mock.timers.tick(1200);assert.equal(f.steps,0);stop();
});
test('unmount cancels pending lazy scrolling',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture(),stop=installFoodFocus(f.win,f.doc);stop();t.mock.timers.tick(50000);assert.equal(f.steps,0);
});
test('focus seeking scrolls the actual nested menu container', t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture();let moved=0;
 const root={scrollHeight:15000,clientHeight:600,scrollTop:0,scrollTo(o){moved++;this.scrollTop=o.top;}};
 const original=f.doc.getElementById;f.doc.getElementById=id=>id==='main-container'?root:original(id);
 const stop=installFoodFocus(f.win,f.doc);t.mock.timers.tick(1200);assert.equal(moved,1);assert.equal(f.steps,0);stop();
});
test('a background-opened target waits for visibility rather than abandoning the food',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture();f.doc.hidden=true;let onVisible;
 f.doc.addEventListener=(name,fn)=>{onVisible=fn;};f.doc.removeEventListener=()=>{};
 const stop=installFoodFocus(f.win,f.doc);t.mock.timers.tick(50000);assert.equal(f.steps,0);
 f.doc.hidden=false;onVisible();t.mock.timers.tick(1200);assert.equal(f.steps,1);stop();
});
