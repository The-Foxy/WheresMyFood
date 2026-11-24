import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, deliveryQuote, vendorPage, menuItems, matches, exclusionReason } from '../src/core.js';
import { Scanner } from '../src/engine.js';
const context = { lat: 35.7, long: 51.4 };
const vendor = { code: 'test1', title: 'test', rating: 4.5, eta: 25 };
const payload = products => ({ data: { menus: [{ categoryId: 1, category: 'غذا', products }] } });

test('delivery distinguishes true zero, missing and negative/invalid quotes', () => {
  assert.equal(deliveryQuote({ deliveryFee: 0 }).deliveryFee, 0);
  assert.equal(deliveryQuote({ deliveryFee: '۳۴٬۰۰۰' }).deliveryFee, 34000);
  for (const value of [{}, { deliveryFee: null }, { deliveryFee: -1 }, { deliveryFee: 'unknown' }]) assert.equal(deliveryQuote(value).deliveryFee, null);
});
test('discounted courier quotes apply only when the source discount flag is active', () => {
  assert.deepEqual(deliveryQuote({ deliveryFee: 50000, isDeliveryFeeHasDiscount: true, deliveryFeeAfterDiscount: 5000 }), { deliveryFee: 5000, originalDeliveryFee: 50000 });
  assert.equal(deliveryQuote({ deliveryFee: 50000, isDeliveryFeeHasDiscount: false, deliveryFeeAfterDiscount: 0 }).deliveryFee, 50000);
  assert.equal(deliveryQuote({ deliveryFee: 50000, isDeliveryFeeHasDiscount: true, deliveryFeeAfterDiscount: 0 }).deliveryFee, 0);
  assert.equal(deliveryQuote({ deliveryFee: 50000, isDeliveryFeeHasDiscount: true }).deliveryFee, null);
});
test('courier quote travels from source vendor to every dish without changing its price or filtering', () => {
  const source = { data: { finalResult: [{ type: 'VENDOR', data: { code: 'test1', title: 'test', rating: 9, eta: 25, deliveryFee: 100000 } }] } };
  const v = vendorPage(source).vendors[0];
  const row = menuItems(payload([{ id: 1, title: 'غذا', price: 300000 }]), v)[0];
  assert.equal(row.deliveryFee, 100000); assert.equal(row.price, 300000);
  assert.equal(matches(row, { ...defaults, minPrice: 300000, maxPrice: 300000 }), true);
});
test('menu audit deduplicates repeated rails while keeping unavailable and unknown-price records visible in totals', () => {
  const products = [{ id: 1, title: 'ok', price: 200000 }, { id: 2, title: 'sold out', price: 200000, stock: 0 }, { id: 3, title: 'no price' }];
  const data = payload(products); data.data.menus.push({ categoryId: -1, category: 'پرطرفدار', products });
  const rows = menuItems(data, vendor);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows.stats, { totalOptions: 3, availableOptions: 1, unavailable: 1, unknownPrice: 1, missingIds: 0, closedMenu: 0 });
});
test('filter audit uses one first rejection per option and retains optional keyword/extras filters', () => {
  const row = { title: 'پاستا', variation: '', category: 'غذا', price: 500000, eta: 20, rating: 4.5 };
  assert.equal(exclusionReason(row, { ...defaults, query: 'پیتزا' }), 'price');
  assert.equal(exclusionReason({ ...row, price: 200000 }, { ...defaults, query: 'پیتزا' }), 'query');
  assert.equal(exclusionReason({ ...row, price: 200000, category: 'نوشیدنی' }, defaults), 'extras');
  assert.equal(exclusionReason({ ...row, price: undefined }, defaults), 'unknownPrice');
});
test('105 qualifying restaurants can legitimately produce only 3 matching food/portion options', async () => {
  const vendors = Array.from({ length: 105 }, (_, index) => ({ type: 'VENDOR', data: { code: `v${String(index).padStart(3, '0')}`, title: `test ${index}`, rating: 9, eta: 20, is_open: true, deliver: true } }));
  let latest;
  const scan = new Scanner({ context: async () => context, read: async (op, value) => op === 'vendors' ? { data: { finalResult: vendors, hasNext: false } } : payload([{ id: 1, title: 'غذا', price: Number(value.code.slice(1)) < 3 ? 250000 : 500000 }]) }, state => { latest = state; }, { pause: 0 });
  await scan.run(defaults);
  assert.equal(latest.state, 'complete'); assert.equal(latest.eligible, 105); assert.equal(latest.checked, 105); assert.equal(latest.rows.length, 3);
  assert.equal(latest.audit.totalOptions, 105); assert.equal(latest.audit.price, 102); assert.equal(latest.audit.matched, 3);
});
test('resume replaces per-menu audit rather than counting a successful menu twice', async () => {
  let fail = true, latest;
  const vendors = ['abc', 'def'].map(code => ({ type: 'VENDOR', data: { code, rating: 9, eta: 20 } }));
  const scan = new Scanner({ context: async () => context, read: async (op, value) => {
    if (op === 'vendors') return { data: { finalResult: vendors, hasNext: false } };
    if (value.code === 'def' && fail) throw Error('timeout');
    return payload([{ id: 1, title: 'غذا', price: 250000 }]);
  } }, state => { latest = state; }, { pause: 0 });
  await scan.run(defaults); assert.equal(latest.audit.totalOptions, 1); assert.equal(latest.state, 'partial');
  fail = false; await scan.run(defaults, true);
  assert.equal(latest.state, 'complete'); assert.equal(latest.audit.totalOptions, 2); assert.equal(latest.audit.matched, 2);
});
