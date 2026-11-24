import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiled = await build({stdin: {contents: `export * from './lib/server/firebase-auth-proxy';`, resolveDir: root, loader: 'ts'}, absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24'});
const {proxyFirebaseAuth} = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const base = 'https://rmtlaunch.fun';

test('Firebase helper preserves the exact query at its fixed upstream and strips application credentials', async () => {
  let call;
  const request = new Request(base + '/__/auth/handler?state=a%2Bb%2Fc&redirectUrl=https%3A%2F%2Frmtlaunch.fun%2F%3Fcontinue%3D%252F%2523claim%252Fvamps%23account&url=https%3A%2F%2Fevil.example', {headers: {
    Cookie: '__Host-rmt-session=private-token', Authorization: 'Bearer private-token',
    'oai-authenticated-user-id': 'private-owner', 'oai-authenticated-user-email': 'owner@example.com',
    'X-Forwarded-Host': 'evil.example', Referer: base + '/?private=something',
    Accept: 'text/html', 'Accept-Language': 'en-US', 'User-Agent': 'Browser',
  }});
  const result = await proxyFirebaseAuth(request, async (url, init) => {call = {url, init}; return new Response('<html>helper</html>', {headers: {'content-type': 'text/html'}});});
  assert.equal(call.url, 'https://rmt-launch-auth-20261124.firebaseapp.com' + new URL(request.url).pathname + new URL(request.url).search);
  assert.equal(call.init.method, 'GET');
  assert.equal(call.init.credentials, 'omit');
  assert.equal(call.init.redirect, 'manual');
  assert.equal(call.init.cache, 'no-store');
  for (const name of ['cookie', 'authorization', 'oai-authenticated-user-id', 'oai-authenticated-user-email', 'x-forwarded-host', 'referer', 'host']) assert.equal(call.init.headers.get(name), null, name);
  assert.equal(call.init.headers.get('accept'), 'text/html');
  assert.equal(call.init.headers.get('accept-language'), 'en-US');
  const html = await result.text();
  assert.match(html, /<html>helper<\/html>/);
  assert.match(html, /href="\/\?authRecovery=handler#account"/);
  assert.doesNotMatch(html, /evil\.example|private-token|state=/);
});

test('Firebase callback forwards POST bytes and form content type without rewriting OAuth data', async () => {
  const body = 'state=a%2Bb&code=opaque%2Fcode&duplicate=1&duplicate=2';
  let seen;
  const result = await proxyFirebaseAuth(new Request(base + '/__/auth/handler?eventId=1', {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded', origin: 'https://accounts.google.com', cookie: 'private=secret'}, body}), async (url, init) => {
    seen = {url, init};
    return new Response('complete', {headers: {'content-type': 'text/html; charset=utf-8'}});
  });
  assert.equal(seen.init.method, 'POST');
  assert.equal(new TextDecoder().decode(seen.init.body), body);
  assert.equal(seen.init.headers.get('content-type'), 'application/x-www-form-urlencoded');
  assert.equal(seen.init.headers.get('origin'), 'https://accounts.google.com');
  assert.equal(seen.init.headers.get('cookie'), null);
  assert.equal(result.status, 200);
});

test('Recovery is added only to the handler document, without replacing SDK initialization or encoded POST data', async () => {
  const sdk = '<script src="handler.js"></script><script nonce="firebase-auth-helper">var POST_BODY = "example\\u0026value";fireauth.oauthhelper.widget.initialize();</script>';
  const original = '<html><head>' + sdk + '</head><body></body></html>';
  for (const path of ['handler','iframe','links','handler.js']) {
    const response = await proxyFirebaseAuth(new Request(base+'/__/auth/'+path), async () => new Response(original, {headers:{'content-type':'text/html'}}));
    const body = await response.text();
    if (path === 'handler') {
      assert.ok(body.includes(sdk));
      assert.match(body, /\/__\/auth\/rmt-recovery\.js/);
      assert.match(body, /id="rmt-auth-help"/);
    } else assert.equal(body, original);
  }
});

test('Handler recovery waits for a terminal screen, never reads callback data, and leaves slow or successful flows alone', async () => {
  const upstream = async () => {throw new Error('Recovery script must be local');};
  const scriptUrl = base + '/__/auth/rmt-recovery.js';
  const result = await proxyFirebaseAuth(new Request(scriptUrl), upstream);
  assert.equal(result.status, 200);
  assert.match(result.headers.get('content-type'), /javascript/);
  const script = await result.text();
  for (const outcome of ['success', 'slow', 'early-error', 'later-error', 'script-failed']) {
    let observed, disconnected = false, delayed, redirected;
    const help = {hidden:false};
    let terminal = outcome === 'early-error';
    const diagnostics = [];
    const window = {
      fireauth:outcome === 'script-failed' ? undefined : {oauthhelper:{widget:{initialize() {}}}},
      location:{replace: url => {redirected=url;}},
      setTimeout: fn => {delayed=fn;},
    };
    const document = {body:{}, getElementById: id => id === 'rmt-auth-help' ? help : (terminal ? {} : null)};
    class MutationObserver {
      constructor(fn) { this.fn=fn; }
      observe() {observed=this.fn;}
      disconnect() {disconnected=true;}
    }
    runInNewContext(script, {document,window,MutationObserver,console:{info:message => diagnostics.push(message)}});
    if (outcome === 'later-error') {terminal=true;observed();}
    if (outcome === 'success' || outcome === 'slow') {
      observed();
      assert.equal(redirected, undefined);
      assert.equal(help.hidden, true);
      if (outcome === 'slow') {delayed();assert.equal(help.hidden, false);assert.equal(redirected, undefined);}
      assert.deepEqual(diagnostics, []);
    } else {
      assert.equal(redirected, '/?authRecovery=handler#account');
      assert.equal(disconnected, true);
      assert.equal(help.hidden, false);
      assert.deepEqual(diagnostics, ['[RMT auth] handler_recovery']);
    }
  }
  assert.equal(await (await proxyFirebaseAuth(new Request(scriptUrl,{method:'HEAD'}),upstream)).text(),'');
  assert.equal((await proxyFirebaseAuth(new Request(scriptUrl,{method:'POST'}),upstream)).status,405);
});

test('Only the documented helper routes are proxied, and unsupported verbs never reach Firebase', async () => {
  const paths = ['handler', 'handler.js', 'experiments.js', 'iframe', 'iframe.js', 'links', 'links.js'];
  let calls = 0;
  const upstream = async () => {calls++; return new Response('helper',{headers:{'content-type':'text/html'}});};
  for (const name of paths) assert.equal((await proxyFirebaseAuth(new Request(base + '/__/auth/' + name), upstream)).status, 200);
  assert.equal((await proxyFirebaseAuth(new Request(base + '/__/firebase/init.json'), upstream)).status, 200);
  assert.equal(calls, 7);
  for (const path of ['/__/auth', '/__/auth/unknown', '/__/auth/handler/extra', '/__/auth/%68andler', '/__/auth//handler']) assert.equal((await proxyFirebaseAuth(new Request(base + path), upstream)).status, 404, path);
  for (const path of ['/', '/api/auth/session', '/api/auth/link', '/projects/vamps', '/__/firebase/another.json']) assert.equal(proxyFirebaseAuth(new Request(base + path), upstream), null, path);
  for (const method of ['PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await proxyFirebaseAuth(new Request(base + '/__/auth/handler', {method}), upstream);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD, POST');
  }
  assert.equal(calls, 7);
});

test('Public Firebase init config is local, keeps project identity, and uses only approved same-origin auth domains', async () => {
  let calls = 0;
  const upstream = async () => {calls++; throw new Error('Init config must not fetch upstream');};
  for (const origin of [base, 'https://www.rmtlaunch.fun', 'https://rmt-hub.wise-elf-8473.chatgpt.site', 'https://unapproved.example', 'http://rmtlaunch.fun']) {
    const response = await proxyFirebaseAuth(new Request(origin + '/__/firebase/init.json?apiKey=ignored'), upstream);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^application\/json/);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const config = await response.json();
    assert.deepEqual(Object.keys(config).sort(), ['apiKey', 'appId', 'authDomain', 'projectId']);
    assert.equal(config.projectId, 'rmt-launch-auth-20261124');
    assert.equal(config.appId, '1:719694340242:web:399b13786cf403b3be064b');
    assert.equal(config.apiKey, 'AIzaSyDxzd7IG2ntLP1Y7R13EiKrXx8ez63KsPQ');
    assert.equal(config.authDomain, origin === 'https://unapproved.example' || origin === 'http://rmtlaunch.fun' ? 'rmt-launch-auth-20261124.firebaseapp.com' : new URL(origin).hostname);
  }
  const head = await proxyFirebaseAuth(new Request(base + '/__/firebase/init.json', {method: 'HEAD'}), upstream);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await proxyFirebaseAuth(new Request(base + '/__/firebase/init.json', {method}), upstream);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
  }
  assert.equal(calls, 0);
});

test('Helper responses retain script/frame policies but cannot set app cookies or be cached', async () => {
  const csp = "script-src 'self' https://apis.google.com; frame-ancestors 'self'";
  const result = await proxyFirebaseAuth(new Request(base + '/__/auth/iframe'), async () => new Response('helper', {headers: {
    'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp,
    'x-frame-options': 'SAMEORIGIN', 'cross-origin-opener-policy': 'same-origin-allow-popups',
    'set-cookie': '__Host-rmt-session=overwritten; Secure; Path=/',
    'cache-control': 'public, max-age=86400', etag: 'cached-auth-state',
    location: 'https://evil.example',
  }}));
  assert.equal(result.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(result.headers.get('content-security-policy'), csp);
  assert.equal(result.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(result.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
  for (const name of ['set-cookie', 'etag', 'location']) assert.equal(result.headers.get(name), null, name);
  assert.equal(result.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(result.headers.get('cdn-cache-control'), 'no-store');
  assert.equal(result.headers.get('cloudflare-cdn-cache-control'), 'no-store');
  assert.equal(result.headers.get('referrer-policy'), 'no-referrer');
});

test('Unexpected redirects and upstream failures disclose neither code/state nor upstream details', async () => {
  for (const status of [301, 302, 307, 308, 400, 404, 500, 503]) {
    const response = await proxyFirebaseAuth(new Request(base + '/__/auth/handler?code=secret-code'), async (_, init) => {
      assert.equal(init.redirect, 'manual');
      return new Response('private upstream diagnostics secret-code', {status, headers: {location: 'https://evil.example/?code=secret-code'}});
    });
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('location'), null);
    const html = await response.text();
    assert.doesNotMatch(html, /secret-code|diagnostics|evil\.example/);
    assert.match(html, /href="\/\?authRecovery=handler#account"/);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
  const response = await proxyFirebaseAuth(new Request(base + '/__/auth/handler'), async () => {throw new Error('code=secret-code');});
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /secret-code/);
  for (const upstream of [new Response('private upstream diagnostics'), new Response(null,{status:204})]) {
    const error = await proxyFirebaseAuth(new Request(base + '/__/auth/handler'), async () => upstream);
    const html = await error.text();
    assert.equal(error.status, 502);
    assert.match(html, /Return to RMT for email sign-in/);
    assert.doesNotMatch(html, /private upstream diagnostics/);
  }
});

test('Oversized POST bodies are rejected before forwarding, including without Content-Length', async () => {
  let calls = 0;
  const upstream = async () => {calls++; return new Response('helper',{headers:{'content-type':'text/html'}});};
  const oversized = 'x'.repeat(65_537);
  for (const headers of [{}, {'content-length': String(oversized.length)}]) {
    const response = await proxyFirebaseAuth(new Request(base + '/__/auth/handler', {method: 'POST', body: oversized, headers}), upstream);
    assert.equal(response.status, 413);
  }
  assert.equal(calls, 0);
  assert.equal((await proxyFirebaseAuth(new Request(base + '/__/auth/handler', {method: 'POST', body: 'x'.repeat(65_536)}), upstream)).status, 200);
  assert.equal(calls, 1);
});

test('HEAD reaches the same helper but returns no response body, including on errors', async () => {
  const request = new Request(base + '/__/auth/iframe', {method: 'HEAD'});
  const result = await proxyFirebaseAuth(request, async (_, init) => {assert.equal(init.method, 'HEAD'); return new Response(null, {headers: {'content-type': 'text/html'}});});
  assert.equal(result.status, 200);
  assert.equal(await result.text(), '');
  const failed = await proxyFirebaseAuth(request, async () => {throw new Error('network');});
  assert.equal(failed.status, 502);
  assert.equal(await failed.text(), '');
});
