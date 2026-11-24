import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foodLink, menuItems } from '../src/core.js';
import { targetVariation, installFoodFocus } from '../src/food-focus.js';
const vendor = { code: '0gg74q', title: 'test', rating: 4.6, eta: 25 };

test('native route uses the food parent ID and the selected variation independently', () => {
  const result = foodLink('0gg74q', 180, 7075157, 'آش رشته');
  assert.equal(result.url, 'https://snappfood.ir/restaurant/menu/0gg74q/product/%D8%A2%D8%B4_%D8%B1%D8%B4%D8%AA%D9%87-pp:180/?product_id=7075157');
  assert.equal(result.linkKind, 'product');
});
test('grouped menus preserve parent ID and separate portion links', () => {
  const payload = { data: { categories: [{ id: 1, products: [{ id: 180, title: 'آش رشته', variations: [{ id: 7075157, title: '550 گرم', price: 385000 }, { id: 7075156, title: 'یک کیلو', price: 700000 }] }] }] } };
  const rows = menuItems(payload, vendor);
  assert.equal(rows[0].parentProductId, '180'); assert.equal(rows[0].variationId, '7075157');
  for (const row of rows) { assert.ok(new URL(row.url).pathname.endsWith('-pp:180/')); assert.equal(new URL(row.url).searchParams.get('product_id'), row.variationId); }
  assert.notEqual(rows[0].url, rows[1].url);
});
test('flat variations with explicit parent IDs also get native detail links', () => {
  const payload = { data: { menus: [{ categoryId: 1, products: [{ id: 7075157, productId: 180, productTitle: 'آش رشته', title: '550 گرم', price: 385000 }] }] } };
  const row = menuItems(payload, vendor)[0]; assert.equal(row.parentProductId, '180'); assert.equal(row.variation, '550 گرم'); assert.equal(row.linkKind, 'product');
});
test('missing parent ID never guesses it from a variation ID', () => {
  const result = foodLink('0gg74q', null, 7075157, 'آش رشته');
  assert.equal(result.linkKind, 'menu-position'); assert.ok(!result.url.includes('-pp:7075157')); assert.ok(result.url.endsWith('#sf-food=7075157'));
});
test('untrusted IDs and title punctuation cannot inject a foreign destination or route', () => {
  assert.equal(foodLink('../evil', 1, 2, 'name').linkKind, 'unavailable');
  assert.equal(foodLink('abc', 'javascript:1', 2, 'name').linkKind, 'menu-position');
  const u = new URL(foodLink('abc', 1, 2, '../../other?x=<script>').url);
  assert.equal(u.origin, 'https://snappfood.ir'); assert.ok(u.pathname.startsWith('/restaurant/menu/abc/product/')); assert.equal(u.searchParams.size, 1);
});
test('menu focus hash is restricted to Snappfood menu pages and numeric variation IDs', () => {
  const location = { origin: 'https://snappfood.ir', pathname: '/restaurant/menu/0gg74q/', hash: '#sf-food=7075157' };
  assert.equal(targetVariation(location), '7075157');
  assert.equal(targetVariation({ ...location, origin: 'https://evil.example' }), null);
  assert.equal(targetVariation({ ...location, pathname: '/checkout/' }), null);
  assert.equal(targetVariation({ ...location, hash: '#sf-food=button.add' }), null);
});
test('fallback scrolls and highlights the exact DOM element without clicking anything', () => {
  let clicked = 0, scrolled = 0;
  const style = { outline: '', outlineOffset: '', borderRadius: '', scrollMarginTop: '' };
  const item = { style, scrollIntoView(options) { scrolled++; assert.equal(options.block, 'center'); }, click() { clicked++; } };
  const win = { location: { origin: 'https://snappfood.ir', pathname: '/restaurant/menu/0gg74q/', hash: '#sf-food=7075157' }, addEventListener() {}, removeEventListener() {}, matchMedia() { return { matches: true }; } };
  const doc = { getElementById(id) { assert.equal(id, '7075157'); return item; } };
  const stop = installFoodFocus(win, doc); assert.equal(scrolled, 1); assert.equal(clicked, 0); assert.match(style.outline, /3px/);
  stop(); assert.equal(style.outline, ''); assert.equal(clicked, 0);
});
