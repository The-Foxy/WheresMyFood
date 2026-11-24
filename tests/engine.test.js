import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scanner } from '../src/engine.js';
import { defaults, SourceError } from '../src/core.js';
const ctx = { lat: 35.7, long: 51.4 };
const v = code => ({ code, title: code, rating: 9, eta: 25, is_open: true, deliver: true });
const page = (codes, more) => ({ data: { finalResult: codes.map(code => ({ type: 'VENDOR', data: v(code) })), ...(more === undefined ? {} : { hasNext: more }) } });
const menu = code => ({ data: { menus: [{ categoryId: 1, category: 'غذا', products: [{ id: code, title: code, price: 250000 }] }] } });

test('short pages keep advancing until the source actually ends', async () => {
  const seen = [], updates = [];
  const scanner = new Scanner({ context: async () => ctx, read: async (op, val) => { seen.push([op, val.page ?? val.code]); return op === 'menu' ? menu(val.code) : val.page === 0 ? page(['abc']) : val.page === 1 ? page(['def']) : page([]); } }, u => updates.push(u), { pause: 0 });
  await scanner.run(defaults);
  assert.deepEqual(seen.filter(x => x[0] === 'vendors').map(x => x[1]), [0, 1, 2]);
  assert.equal(updates.at(-1).rows.length, 2); assert.equal(updates.at(-1).state, 'complete');
});
test('repeated source pages and page cap cannot masquerade as complete coverage', async () => {
  const states = [];
  const scanner = new Scanner({ context: async () => ctx, read: async op => op === 'vendors' ? page(['abc']) : menu('abc') }, u => states.push(u), { pause: 0 });
  await scanner.run(defaults); assert.equal(states.at(-1).state, 'partial'); assert.ok(states.at(-1).notes[0].includes('تکراری'));
  const limited = new Scanner({ context: async () => ctx, read: async (op, x) => op === 'vendors' ? page(['abc' + x.page]) : menu(x.code) }, u => states.push(u), { pause: 0, maxPages: 1 });
  await limited.run(defaults); assert.equal(states.at(-1).state, 'partial');
});
test('403 pauses globally instead of hammering every restaurant', async () => {
  let menus = 0; const updates = [];
  const scanner = new Scanner({ context: async () => ctx, read: async op => { if (op === 'vendors') return page(['abc', 'def'], false); menus++; throw new SourceError('403 blocked', { fatal: true }); } }, u => updates.push(u), { pause: 0 });
  await scanner.run(defaults); assert.equal(menus, 1); assert.equal(updates.at(-1).state, 'paused');
});
test('repeated HTTP 400 menu rejection trips after three attempts, not every restaurant', async () => {
  let calls = 0; const updates = [];
  const scanner = new Scanner({ context: async () => ctx, read: async op => { if (op === 'vendors') return page(['abc', 'def', 'ghi', 'jkl', 'mno'], false); calls++; throw new SourceError('HTTP 400', { status: 400 }); } }, u => updates.push(u), { pause: 0 });
  await scanner.run(defaults); assert.equal(calls, 3); assert.equal(updates.at(-1).state, 'paused'); assert.equal(updates.at(-1).errors.length, 3);
});
test('stop retains results and resume visits only unfinished menus', async () => {
  const seen = [], updates = []; let scanner;
  scanner = new Scanner({ context: async () => ctx, read: async (op, x) => { if (op === 'vendors') return page(['abc', 'def'], false); seen.push(x.code); return menu(x.code); } }, u => { updates.push(u); if (u.checked === 1 && u.state === 'menus') scanner.stop(); }, { pause: 0 });
  await scanner.run(defaults); assert.equal(updates.at(-1).state, 'stopped'); assert.deepEqual(seen, ['abc']);
  scanner.emit = u => updates.push(u); await scanner.run(defaults, true);
  assert.deepEqual(seen, ['abc', 'def']); assert.equal(updates.at(-1).state, 'complete'); assert.equal(updates.at(-1).rows.length, 2);
});
test('failed menus are reported and may be retried without rescanning successes', async () => {
  const seen = [], updates = []; let fail = true;
  const scanner = new Scanner({ context: async () => ctx, read: async (op, x) => { if (op === 'vendors') return page(['abc', 'def'], false); seen.push(x.code); if (x.code === 'def' && fail) throw new SourceError('timeout'); return menu(x.code); } }, u => updates.push(u), { pause: 0 });
  await scanner.run(defaults); assert.equal(updates.at(-1).state, 'partial'); fail = false;
  await scanner.run(defaults, true); assert.deepEqual(seen, ['abc', 'def', 'def']); assert.equal(updates.at(-1).state, 'complete'); assert.equal(updates.at(-1).errors.length, 0);
});
test('new address discards old results and does not continue old-location requests', async () => {
  let location = ctx, menus = 0; const updates = [];
  const scanner = new Scanner({ context: async () => location, read: async (op, x) => { if (op === 'vendors') return page(['abc', 'def'], false); menus++; location = { lat: 36, long: 52 }; return menu(x.code); } }, u => updates.push(u), { pause: 0 });
  await scanner.run(defaults); assert.equal(menus, 1); assert.equal(updates.at(-1).state, 'location-changed'); assert.equal(updates.at(-1).rows.length, 0); assert.equal(scanner.checkpoint, null);
});
test('429 retry window survives a click and is not shortened', async () => {
  const retryAt = Date.now() + 60000; let calls = 0; const updates = [];
  const scanner = new Scanner({ context: async () => ctx, read: async () => { calls++; throw new SourceError('429', { retryAt, fatal: true }); } }, u => updates.push(u), { pause: 0 });
  await scanner.run(defaults); assert.equal(updates.at(-1).retryAt, retryAt);
  await assert.rejects(scanner.run(defaults, true)); assert.equal(calls, 1);
});
test('simultaneous starts cannot create two scans', async () => {
  let calls = 0;
  const scanner = new Scanner({ context: async () => { await new Promise(r => setTimeout(r, 5)); return ctx; }, read: async () => { calls++; return page([]); } }, () => {}, { pause: 0 });
  await Promise.all([scanner.run(defaults), scanner.run(defaults)]); assert.equal(calls, 1);
});
