import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { openDatabase } from '../src/db.js';
import { buildApp } from '../src/app.js';

const TOKEN = 'integration-test-token';
const TOKEN_HASH = createHash('sha256').update(TOKEN).digest('hex');
const AUTH = { authorization: `Bearer ${TOKEN}` };

function testConfig() {
  return {
    bindAddress: '127.0.0.1',
    port: 0,
    shortDomain: 'link.desolic.com',
    defaultRedirect: 'https://desolic.com/',
    authTokenHash: TOKEN_HASH,
    databasePath: ':memory:',
    trustProxy: false,
    publicBaseUrl: 'https://link.desolic.com/',
  };
}

async function makeApp(t) {
  const store = openDatabase(':memory:');
  const app = await buildApp(testConfig(), store);
  t.after(async () => {
    await app.close();
    store.close();
  });
  return app;
}

test('shorten requires authentication', async (t) => {
  const app = await makeApp(t);
  const res = await app.inject({
    method: 'POST',
    url: '/api/shorten',
    payload: { url: 'https://example.com/' },
  });
  assert.equal(res.statusCode, 401);
});

test('an invalid bearer token is rejected', async (t) => {
  const app = await makeApp(t);
  const res = await app.inject({
    method: 'POST',
    url: '/api/shorten',
    headers: { authorization: 'Bearer wrong-token' },
    payload: { url: 'https://example.com/' },
  });
  assert.equal(res.statusCode, 401);
});

test('shorten creates a slug that resolves to the target', async (t) => {
  const app = await makeApp(t);
  const created = await app.inject({
    method: 'POST',
    url: '/api/shorten',
    headers: AUTH,
    payload: { url: 'https://example.com/page' },
  });
  assert.equal(created.statusCode, 201);

  const { slug, shortUrl } = created.json();
  assert.match(slug, /^[A-Za-z0-9]+$/);
  assert.equal(shortUrl, `https://link.desolic.com/${slug}`);

  const redirect = await app.inject({ method: 'GET', url: `/${slug}` });
  assert.equal(redirect.statusCode, 303);
  assert.equal(redirect.headers.location, 'https://example.com/page');
});

test('non-https targets are rejected', async (t) => {
  const app = await makeApp(t);
  for (const url of [
    'http://example.com/',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'ftp://example.com/file',
    'not a url',
  ]) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/shorten',
      headers: AUTH,
      payload: { url },
    });
    assert.equal(res.statusCode, 400, `expected 400 for ${url}`);
  }
});

test('non-public redirect targets are rejected', async (t) => {
  const app = await makeApp(t);
  for (const url of [
    'https://localhost/admin',
    'https://127.0.0.1/',
    'https://10.0.0.5/',
    'https://192.168.1.1/',
    'https://169.254.1.1/',
    'https://[::1]/',
  ]) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/shorten',
      headers: AUTH,
      payload: { url },
    });
    assert.equal(res.statusCode, 400, `expected 400 for ${url}`);
  }
});

test('a custom slug is honoured and duplicates return 409', async (t) => {
  const app = await makeApp(t);
  const first = await app.inject({
    method: 'POST',
    url: '/api/shorten',
    headers: AUTH,
    payload: { url: 'https://example.com/', slug: 'desolic1' },
  });
  assert.equal(first.statusCode, 201);
  assert.equal(first.json().slug, 'desolic1');

  const dup = await app.inject({
    method: 'POST',
    url: '/api/shorten',
    headers: AUTH,
    payload: { url: 'https://example.com/other', slug: 'desolic1' },
  });
  assert.equal(dup.statusCode, 409);
});

test('invalid and reserved custom slugs are rejected', async (t) => {
  const app = await makeApp(t);
  for (const slug of ['has space', 'with-dash', 'api', 'healthz']) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/shorten',
      headers: AUTH,
      payload: { url: 'https://example.com/', slug },
    });
    assert.equal(res.statusCode, 400, `expected 400 for slug "${slug}"`);
  }
});

test('an unknown slug redirects to the default target', async (t) => {
  const app = await makeApp(t);
  const res = await app.inject({ method: 'GET', url: '/doesnotexist' });
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.location, 'https://desolic.com/');
});

test('the catch-all redirects unknown paths to the default target', async (t) => {
  const app = await makeApp(t);
  for (const url of ['/', '/some/deep/path']) {
    const res = await app.inject({ method: 'GET', url });
    assert.equal(res.statusCode, 303);
    assert.equal(res.headers.location, 'https://desolic.com/');
  }
});

test('healthz reports ok', async (t) => {
  const app = await makeApp(t);
  const res = await app.inject({ method: 'GET', url: '/healthz' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: 'ok' });
});
