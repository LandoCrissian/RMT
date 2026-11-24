import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiled = await build({stdin: {contents: `export * from './lib/firebase-config'; export * from './lib/firebase-auth-flow';`, resolveDir: root, loader: 'ts'}, absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24'});
const api = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const productionOrigins = ['https://rmtlaunch.fun', 'https://www.rmtlaunch.fun', 'https://rmt-hub.wise-elf-8473.chatgpt.site'];
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 Version/27.2 Mobile/15E148 Safari/604.1';
const desktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 Version/27.0 Safari/605.1.15';

test('all production origins use their own helper while preserving the Firebase project identity', () => {
  const before = structuredClone(api.firebaseConfig);
  for (const origin of productionOrigins) {
    assert.equal(api.supportsSameOriginFirebaseAuth(origin), true);
    assert.deepEqual(api.firebaseConfigForOrigin(origin), {...before, authDomain: new URL(origin).hostname});
  }
  assert.deepEqual(api.firebaseConfig, before);
  assert.equal(before.projectId, 'rmt-launch-auth-20261124');
});

test('HTTP, preview, malformed and lookalike origins never become trusted auth domains', () => {
  for (const origin of ['', 'http://rmtlaunch.fun', 'https://rmtlaunch.fun.evil.example', 'https://evil-rmtlaunch.fun', 'https://rmtlaunch.fun@evil.example', 'https://evil.example@rmtlaunch.fun', 'https://rmtlaunch.fun:444', 'https://rmtlaunch.fun/__/auth/handler', 'https://rmtlaunch.fun.', 'https://preview.rmtlaunch.fun', 'http://localhost:4173', 'https://localhost', 'null']) {
    assert.equal(api.supportsSameOriginFirebaseAuth(origin), false, origin);
    assert.equal(api.firebaseConfigForOrigin(origin).authDomain, api.firebaseConfig.authDomain, origin);
    assert.equal(api.googleSignInFlow({origin, userAgent: iphone}, true), 'popup', origin);
  }
});

test('mobile and iPad desktop-mode browsers use one-tab sign-in only on production origins', () => {
  const mobileEnvironments = [
    {userAgent: iphone},
    {userAgent: 'Mozilla/5.0 (iPad; CPU OS 27_2 like Mac OS X) Mobile Safari/604.1'},
    {userAgent: 'Mozilla/5.0 (Linux; Android 16) Chrome/143 Mobile Safari/537.36'},
    {userAgent: desktop, maxTouchPoints: 5},
    {userAgent: 'MacIntel', maxTouchPoints: 2},
  ];
  for (const origin of productionOrigins) for (const environment of mobileEnvironments) {
    assert.equal(api.googleSignInFlow({origin, ...environment}), 'redirect');
  }
  assert.equal(api.googleSignInFlow({origin: productionOrigins[0], userAgent: desktop, maxTouchPoints: 0}), 'popup');
  assert.equal(api.googleSignInFlow({origin: productionOrigins[0], userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/143', maxTouchPoints: 10}), 'popup');
});

test('desktop same-page recovery is explicit and cannot enable unsafe preview redirects', () => {
  assert.equal(api.googleSignInFlow({origin: productionOrigins[0], userAgent: desktop}), 'popup');
  assert.equal(api.googleSignInFlow({origin: productionOrigins[0], userAgent: desktop}, true), 'redirect');
  assert.equal(api.googleSignInFlow({origin: 'http://localhost:4173', userAgent: iphone}, true), 'popup');
});

test('embedded browser guidance distinguishes known app agents from ordinary Safari', () => {
  assert.equal(api.isKnownEmbeddedAuthBrowser(iphone), false);
  assert.equal(api.isKnownEmbeddedAuthBrowser(desktop), false);
  for (const userAgent of [iphone + ' Instagram 370.0', iphone + ' [FBAN/FBIOS;FBAV/500]', iphone + ' Line/15.0', iphone + ' ChatGPT/1.2026.315']) {
    assert.equal(api.isKnownEmbeddedAuthBrowser(userAgent), true);
  }
});

test('auth problems distinguish cancellation, lost state, networking, configuration and session connection', () => {
  const cancelled = api.firebaseAuthProblem({code: 'auth/popup-closed-by-user'});
  const blocked = api.firebaseAuthProblem({code: 'auth/popup-blocked'});
  const lost = api.firebaseAuthProblem({message: 'Unable to process request due to missing initial state. browser sessionStorage is inaccessible'});
  const network = api.firebaseAuthProblem({code: 'auth/network-request-failed'});
  const configuration = api.firebaseAuthProblem({code: 'auth/unauthorized-domain'});
  const session = api.firebaseAuthProblem({code: 'rmt/session-unavailable'});
  assert.equal(cancelled.retryOnSamePage, false);
  assert.equal(blocked.retryOnSamePage, true);
  assert.equal(lost.retryOnSamePage, true);
  assert.match(network.message, /connection/);
  assert.match(configuration.message, /this address/);
  assert.equal(session.reconnect, true);
  assert.equal(api.firebaseAuthProblem({message: 'disallowed_useragent'}).needsBrowser, true);
  assert.equal(new Set([cancelled, blocked, lost, network, configuration, session].map(item => item.message)).size, 6);
  for (const error of [null, undefined, 'secret-token', {message: 'secret-token'}, {code: 'unknown'}]) {
    assert.doesNotMatch(api.firebaseAuthProblem(error).message, /secret-token|disable.*privacy|allow.*cookies/i);
  }
});
