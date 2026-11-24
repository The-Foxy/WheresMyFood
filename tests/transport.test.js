import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { pageContext, pageRead, requestParameters, requestTarget } from '../src/background.js';
import { APP_VERSION } from '../src/core.js';

test('transport targets the observed current menu gateway and passes only public menu flags', () => {
  const value = { code: '0gg74q', context: { lat: 35.7, long: 51.4, client: { appVersion: '6.0.1' }, menuQuery: { membership: 'pro', segments: '["a"]', token: 'never-forward' } } };
  assert.equal(requestTarget('menu', value), 'https://apigw.snappfood.ir/menu-read-model/0gg74q');
  const params = requestParameters('menu', value);
  assert.equal(params.membership, 'pro'); assert.equal(params.segments, '["a"]'); assert.equal(params.appVersion, '6.0.1');
  assert.equal(params.token, undefined); assert.equal(params.vendorCode, undefined); assert.equal(params.Bonyan, 'true');
});

test('context recognizes current gateway resources without reading cookies or site storage', async () => {
  const sandbox = { URL, location: { origin: 'https://snappfood.ir', href: 'https://snappfood.ir/' },
    performance: { getEntriesByType: () => [{ name: 'https://apigw.snappfood.ir/menu-read-model/0gg74q?lat=35.7&long=51.4&membership=pro&segments=%5B%22a%22%5D&client=PWA' }] },
    document: { querySelectorAll: () => { throw Error('DOM fallback must not run'); } } };
  Object.defineProperty(sandbox.document, 'cookie', { get() { throw Error('Cookie access forbidden'); } });
  const result = await vm.runInNewContext(`(${pageContext.toString()})()`, sandbox);
  assert.equal(result.lat, 35.7); assert.equal(result.menuQuery.membership, 'pro'); assert.equal(result.client.client, 'PWA');
});

function mockPage(t, fetcher) {
  const oldLocation = globalThis.location;
  globalThis.location = { origin: 'https://snappfood.ir' };
  t.after(() => { if (oldLocation === undefined) delete globalThis.location; else globalThis.location = oldLocation; });
  return t.mock.method(globalThis, 'fetch', fetcher);
}
test('actual read uses a GET with browser credentials for the current gateway', async t => {
  const fetch = mockPage(t, async () => Response.json({ data: { categories: [] } }));
  const result = await pageRead('https://apigw.snappfood.ir/menu-read-model/0gg74q', { lat: 35.7, long: 51.4 });
  assert.deepEqual(result.data, { data: { categories: [] } });
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(new URL(url).origin, 'https://apigw.snappfood.ir'); assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'include');
  assert.equal(options.headers.Authorization, undefined);
});
test('legacy, account, unrelated-host and URL-userinfo reads are rejected before network', async t => {
  const fetch = mockPage(t, async () => { throw Error('Must not call'); });
  for (const url of [
    'https://snappfood.ir/mobile/v2/restaurant/details/dynamic',
    'https://apigw.snappfood.ir/menu-read-model/vendor-rewards/0gg74q',
    'https://apigw.snappfood.ir/user/load',
    'https://evil.example/menu-read-model/0gg74q',
    'https://user:password@apigw.snappfood.ir/menu-read-model/0gg74q',
  ]) assert.equal((await pageRead(url, {})).fatal, true);
  assert.equal(fetch.mock.callCount(), 0);
});
test('HTTP 400 exposes validation field names and service code but never raw error contents', async t => {
  mockPage(t, async () => Response.json({ error: { code: 1002 }, errors: { lat: ['invalid'], 'bad sensitive field': ['secret'] }, message: 'private-upstream-message', token: 'secret-value' }, { status: 400 }));
  const result = await pageRead('https://apigw.snappfood.ir/menu-read-model/0gg74q', {});
  assert.equal(result.status, 400); assert.match(result.error, /1002/); assert.match(result.error, /lat/);
  assert.ok(!JSON.stringify(result).includes('secret')); assert.ok(!JSON.stringify(result).includes('private-upstream-message'));
});
test('Retry-After is preserved for throttled menu reads', async t => {
  const before = Date.now();
  mockPage(t, async () => new Response('', { status: 429, headers: { 'Retry-After': '180' } }));
  const result = await pageRead('https://apigw.snappfood.ir/menu-read-model/0gg74q', {});
  assert.equal(result.status, 429); assert.ok(result.retryAt >= before + 180000); assert.equal(result.fatal, true);
});
test('response size guard and malformed JSON do not become empty successful menus', async t => {
  const fetch = mockPage(t, async () => new Response('{}', { headers: { 'content-length': '7000000' } }));
  assert.ok((await pageRead('https://apigw.snappfood.ir/menu-read-model/0gg74q', {})).error);
  fetch.mock.mockImplementation(async () => new Response('<html>challenge</html>'));
  const result = await pageRead('https://apigw.snappfood.ir/menu-read-model/0gg74q', {});
  assert.equal(result.fatal, true); assert.equal(result.data, undefined);
});
test('visible version matches the manifest and package for reliable Reload checks', () => {
  assert.equal(JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url))).version, APP_VERSION);
  assert.equal(JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version, APP_VERSION);
});
