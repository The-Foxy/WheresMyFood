import { test } from 'node:test';
import assert from 'node:assert/strict';
import { number, stars, eta, vendorPage, menuItems, matches, defaults, validateFilters, sorted, safeImage } from '../src/core.js';
import { requestParameters, requestTarget } from '../src/background.js';
const vendor = { code: 'test1', title: 'نمونه', rating: 4.5, eta: 25 };
const menu = products => ({ data: { vendor: { isOpenNow: true }, menus: [{ categoryId: 1, category: 'غذای ایرانی', products }] } });

test('Persian numbers, separators and unknown values are distinct from zero', () => {
  assert.equal(number('۲۵۰٬۰۰۰'), 250000); assert.equal(number('۴٫۵'), 4.5);
  for (const x of [null, undefined, '', false, 'unknown']) assert.equal(number(x), null);
  assert.equal(number(0), 0); assert.equal(stars(9.2), 4.6); assert.equal(stars(0), null);
  assert.equal(eta('۳۰'), 30); assert.equal(eta('۲۵ تا ۴۰ دقیقه'), null); assert.equal(eta(0), null);
});
test('food-only price uses explicit/amount discount, not delivery or packaging', () => {
  const rows = menuItems(menu([{ id: 1, title: 'الف', price: 400000, discount: 100000, containerPrice: 50000, deliveryFee: 100000 }, { id: 2, title: 'ب', price: 400000, priceAfterDiscount: 250000 }]), vendor);
  assert.equal(rows[0].price, 300000); assert.equal(rows[1].price, 250000);
  assert.ok(matches(rows[0], { ...defaults, minPrice: 300000, maxPrice: 300000 }));
});
test('unknown prices are not free and unavailable items are discarded', () => {
  assert.equal(menuItems(menu([{ id: 1, title: 'unknown' }, { id: 2, price: 100, stock: 0 }, { id: 3, price: 100, available: false }]), vendor).length, 0);
});
test('size variations remain independent and repeated categories do not duplicate items', () => {
  const product = { id: 10, title: 'پیتزا', variations: [{ id: 11, title: 'کوچک', price: 200000 }, { id: 12, title: 'بزرگ', price: 400000 }] };
  const data = menu([product]); data.data.menus.push({ categoryId: -1, category: 'پرطرفدارها', products: [product] });
  const rows = menuItems(data, vendor); assert.equal(rows.length, 2); assert.deepEqual(rows.map(r => r.variation), ['کوچک', 'بزرگ']);
});
test('missing rating is excluded by a minimum and never silently becomes zero', () => {
  const row = menuItems(menu([{ id: 1, price: 200000, title: 'غذا' }]), { ...vendor, rating: null })[0];
  assert.equal(matches(row, defaults), false); assert.equal(matches(row, { ...defaults, minRating: 0 }), true);
});
test('Persian letter differences match and extras are excluded only when selected', () => {
  const row = menuItems(menu([{ id: 1, title: 'كباب', price: 250000 }]), vendor)[0]; assert.equal(matches(row, { ...defaults, query: 'کباب' }), true);
  const drink = { ...row, category: 'نوشیدنی' }; assert.equal(matches(drink, defaults), false); assert.equal(matches(drink, { ...defaults, hideExtras: false }), true);
});
test('price, time and rating sorting preserve independent priorities', () => {
  const rows = [{ id: 'a', price: 300000, eta: 20, rating: 4 }, { id: 'b', price: 200000, eta: 35, rating: 4.7 }];
  assert.equal(sorted(rows, 'price')[0].id, 'b'); assert.equal(sorted(rows, 'rating')[0].id, 'b'); assert.equal(sorted(rows, 'time')[0].id, 'a'); assert.equal(rows[0].id, 'a');
});
test('invalid filters cannot start a scan', () => {
  for (const change of [{ minPrice: 500000 }, { maxTime: 0 }, { minRating: 6 }, { maxPrice: '' }]) assert.throws(() => validateFilters({ ...defaults, ...change }));
});
test('pagination accepts only explicit end, empty raw pages, and validates source shape', () => {
  const page = vendorPage({ data: { finalResult: [{ type: 'BANNER', data: {} }, { type: 'VENDOR', data: { code: 'test1', title: 'test', rating: 9, eta: 30 } }] } });
  assert.equal(page.vendors.length, 1); assert.equal(page.explicitlyFinished, false); assert.equal(page.empty, false);
  assert.throws(() => vendorPage({ data: {} })); assert.equal(vendorPage({ data: { finalResult: [] } }).empty, true);
});
test('images and background operations cannot target unrelated hosts or account endpoints', () => {
  assert.equal(safeImage('javascript:alert(1)'), null); assert.equal(safeImage('https://evil.example/x'), null);
  assert.equal(safeImage('https://cdn.snappfood.ir/photo.jpg'), 'https://cdn.snappfood.ir/photo.jpg');
  const context = { lat: 35.7, long: 51.4 };
  assert.throws(() => requestParameters('order', { context })); assert.throws(() => requestParameters('menu', { context, code: '../user/load' }));
  assert.throws(() => requestParameters('vendors', { context, page: -1 })); assert.throws(() => requestParameters('vendors', { context, page: 100 }));
  assert.equal(requestParameters('vendors', { context, page: 2 }).page, 2);
  assert.equal(requestTarget('menu', { context, code: 'test1' }), 'https://apigw.snappfood.ir/menu-read-model/test1');
  assert.equal(requestParameters('menu', { context, code: 'test1' }).vendorCode, undefined);
  assert.equal(requestTarget('vendors', { context, page: 2 }), 'https://snappfood.ir/search/api/v1/desktop/vendors-list');
  assert.throws(() => requestTarget('menu', { code: '../vendor-rewards/user' }));
});

test('current gateway category/product/variation and discount envelopes normalize food prices', () => {
  const payload = { data: { categories: [{ id: 7, title: 'پاستا', products: [{ id: 10, title: 'پاستا آلفردو', images: [{ imageSrc: 'https://cdn.snappfood.ir/al.jpg' }], variations: [{ id: 11, title: 'یک نفره', price: 400000, discount: { amount: 80000, ratio: 20 } }, { id: 12, title: 'دو نفره', price: 700000, discount: { amount: 0 } }] }] }] } };
  const rows = menuItems(payload, vendor);
  assert.equal(rows.length, 2); assert.equal(rows[0].title, 'پاستا آلفردو'); assert.equal(rows[0].variation, 'یک نفره'); assert.equal(rows[0].price, 320000); assert.equal(rows[1].price, 700000);
  assert.equal(rows[0].image, 'https://cdn.snappfood.ir/al.jpg'); assert.equal(rows[0].category, 'پاستا');
});
test('unknown gateway envelope pauses instead of declaring all menus checked', () => {
  assert.throws(() => menuItems({ data: { changedSchema: [] } }, vendor), e => e.fatal === true && e.message.includes('changedSchema'));
});
