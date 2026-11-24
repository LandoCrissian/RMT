import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiled = await build({
  stdin: {contents: `export * from './lib/firebase-client';`, resolveDir: root, loader: 'ts'},
  absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24',
  plugins: [{name: 'firebase-adapter', setup(build) {
    build.onResolve({filter: /^firebase\/(app|auth)$/}, args => ({path: args.path, namespace: 'firebase-adapter'}));
    build.onLoad({filter: /.*/, namespace: 'firebase-adapter'}, args => ({contents: args.path === 'firebase/app' ? `
      const state = globalThis.__RMT_FIREBASE_CLIENT_TEST__;
      export function getApps() {return state.apps;}
      export function initializeApp(config, name) {const app = {options: config, name}; state.apps.push(app); return app;}
    ` : `
      const state = globalThis.__RMT_FIREBASE_CLIENT_TEST__;
      export function getAuth() {return state.auth;}
      export class GoogleAuthProvider {providerId = 'google.com'; setCustomParameters(value){state.googleParameters=value;}}
      export function getRedirectResult() {state.calls.push('complete-redirect'); return state.redirectResult();}
      export function signInWithPopup() {state.calls.push('popup'); return state.popup();}
      export function signInWithRedirect() {state.calls.push('redirect'); return state.redirect();}
      export async function signOut(){state.calls.push('sign-out'); if(state.signOutError)throw state.signOutError;state.auth.currentUser=null;}
    `}));
  }}],
});
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64');
let moduleNumber = 0;
function deferred() {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};}

async function setup(t, {origin = 'https://rmtlaunch.fun', userAgent = 'Desktop Chrome', maxTouchPoints = 0, href = origin + '/?continue=%2F%23claim%2Fvamps#account'} = {}) {
  const previous = {window: globalThis.window, fetch: globalThis.fetch, state: globalThis.__RMT_FIREBASE_CLIENT_TEST__};
  const state = {apps: [], auth: {currentUser: null}, calls: [], requests: []};
  state.user = {uid: 'member-one', getIdToken: async () => 'member-one-token'};
  state.popup = async () => {state.auth.currentUser = state.user; return {user: state.user};};
  state.redirect = async () => {};
  state.redirectResult = async () => null;
  state.fetch = async () => new Response('{}', {status: 200});
  globalThis.window = {location: {origin, href}, navigator: {userAgent, maxTouchPoints}};
  globalThis.__RMT_FIREBASE_CLIENT_TEST__ = state;
  globalThis.fetch = async (url, options) => {state.requests.push({url, ...options}); return state.fetch(url, options);};
  const api = await import(moduleUrl + '#test-' + (++moduleNumber));
  t.after(() => {
    if (previous.window === undefined) delete globalThis.window; else globalThis.window = previous.window;
    if (previous.state === undefined) delete globalThis.__RMT_FIREBASE_CLIENT_TEST__; else globalThis.__RMT_FIREBASE_CLIENT_TEST__ = previous.state;
    globalThis.fetch = previous.fetch;
  });
  return {api, state};
}

test('mobile sign-in uses the same-origin helper without rewriting the claim return URL', async t => {
  const {api, state} = await setup(t, {userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27 like Mac OS X)'});
  const before = window.location.href;
  await api.startGoogleSignIn();
  assert.deepEqual(state.calls, ['redirect']);
  assert.equal(state.apps[0].options.authDomain, 'rmtlaunch.fun');
  assert.equal(window.location.href, before);
  assert.equal(state.requests.length, 0);
  assert.deepEqual(state.googleParameters,{prompt:'select_account'});
});

test('desktop popup starts synchronously on the click path, then connects the signed-in account', async t => {
  const {api, state} = await setup(t);
  const attempt = api.startGoogleSignIn();
  assert.deepEqual(state.calls, ['popup'], 'no preceding network or import await loses the click activation');
  assert.equal(state.requests.length, 0);
  await attempt;
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].url, '/api/auth/session');
  assert.equal(state.requests[0].method, 'POST');
  assert.deepEqual(state.googleParameters,{prompt:'select_account'});
  assert.deepEqual(JSON.parse(state.requests[0].body), {idToken: 'member-one-token'});
});

test('cancelled and blocked popups never trigger automatic redirect; recovery needs an explicit request', async t => {
  const {api, state} = await setup(t);
  const cancelled = Object.assign(new Error('Closed'), {code: 'auth/popup-closed-by-user'});
  state.popup = async () => {throw cancelled;};
  await assert.rejects(api.startGoogleSignIn(), cancelled);
  assert.deepEqual(state.calls, ['popup']);
  assert.equal(api.getFirebaseAuthFlowStatus().problem.retryOnSamePage, false);
  const blocked = Object.assign(new Error('Blocked'), {code: 'auth/popup-blocked'});
  state.popup = async () => {throw blocked;};
  await assert.rejects(api.startGoogleSignIn(), blocked);
  assert.deepEqual(state.calls, ['popup', 'popup']);
  assert.equal(api.getFirebaseAuthFlowStatus().problem.retryOnSamePage, true);
  await api.startGoogleSignIn(true);
  assert.deepEqual(state.calls, ['popup', 'popup', 'redirect']);
  assert.equal(api.getFirebaseAuthFlowStatus().problem, null);
});

test('unknown mobile origins stay popup-only and do not consume a redirect result', async t => {
  const {api, state} = await setup(t, {origin: 'http://localhost:4173', userAgent: 'iPhone'});
  assert.equal(await api.completeFirebaseRedirect(), null);
  await api.startGoogleSignIn(true);
  assert.deepEqual(state.calls, ['popup']);
  assert.equal(state.apps[0].options.authDomain, 'rmt-launch-auth-20261124.firebaseapp.com');
});

test('redirect completion is consumed once across concurrent callers and repeated mounts', async t => {
  const {api, state} = await setup(t);
  const waiting = deferred();
  state.redirectResult = () => waiting.promise;
  const first = api.completeFirebaseRedirect(), second = api.completeFirebaseRedirect();
  assert.equal(first, second);
  assert.equal(api.getFirebaseAuthFlowStatus().checkingRedirect, true);
  state.auth.currentUser = state.user;
  waiting.resolve({user: state.user});
  assert.equal((await first).user.uid, state.user.uid);
  assert.equal((await second).user.uid, state.user.uid);
  assert.equal(api.completeFirebaseRedirect(), first);
  assert.deepEqual(state.calls, ['complete-redirect']);
  assert.equal(state.requests.length, 1);
  assert.equal(api.getFirebaseAuthFlowStatus().checkingRedirect, false);
});

test('redirect failure stays visible for Account and is not retried or mistaken for a signed-out visit', async t => {
  const {api, state} = await setup(t);
  const failure = Object.assign(new Error('missing initial state: sessionStorage inaccessible'), {code: 'auth/internal-error'});
  state.redirectResult = async () => {throw failure;};
  let updates = 0;
  const unsubscribe = api.subscribeFirebaseAuthFlow(() => updates++);
  await assert.rejects(api.completeFirebaseRedirect(), failure);
  await assert.rejects(api.completeFirebaseRedirect(), failure);
  assert.deepEqual(state.calls, ['complete-redirect']);
  assert.equal(state.requests.length, 0);
  assert.match(api.getFirebaseAuthFlowStatus().problem.message, /recover this browser session/);
  assert.equal(api.getFirebaseAuthFlowStatus().checkingRedirect, false);
  assert.ok(updates >= 2);
  unsubscribe();
  const afterUnsubscribe = updates;
  api.clearFirebaseAuthProblem();
  assert.equal(updates, afterUnsubscribe);
});

test('a failed session exchange is surfaced and a later reconnect can recover', async t => {
  const {api, state} = await setup(t);
  state.auth.currentUser = state.user;
  state.fetch = async () => new Response('{}', {status: 503});
  await assert.rejects(api.syncFirebaseSession('token'), error => error.code === 'rmt/session-unavailable');
  assert.equal(api.getFirebaseAuthFlowStatus().problem.reconnect, true);
  state.fetch = async () => new Response('{}', {status: 200});
  await api.syncFirebaseSession('token');
  assert.equal(state.requests.length, 2);
  assert.equal(api.getFirebaseAuthFlowStatus().problem, null);
});

test('concurrent bridge and callback writes for the same token share one session request', async t => {
  const {api, state} = await setup(t);
  state.auth.currentUser = state.user;
  const gate = deferred();
  state.fetch = () => gate.promise;
  const first = api.syncFirebaseSession('same-token'), second = api.syncFirebaseSession('same-token');
  assert.equal(first, second);
  gate.resolve(new Response('{}', {status: 200}));
  await Promise.all([first, second]);
  assert.equal(state.requests.length, 1);
});

test('queued tokens from a previous user are skipped and sign-out deletion remains ordered', async t => {
  const {api, state} = await setup(t);
  const gate = deferred(), started = deferred();
  state.auth.currentUser = state.user;
  state.fetch = async () => {if (state.requests.length === 1) {started.resolve(); return gate.promise;} return new Response('{}', {status: 200});};
  const inFlight = api.syncFirebaseSession('first-user-in-flight');
  await started.promise;
  const stale = api.syncFirebaseSession('first-user-queued');
  state.auth.currentUser = {...state.user, uid: 'member-two'};
  const current = api.syncFirebaseSession('second-user-token');
  gate.resolve(new Response('{}', {status: 200}));
  await Promise.all([inFlight, stale, current]);
  assert.deepEqual(state.requests.map(request => JSON.parse(request.body).idToken), ['first-user-in-flight', 'second-user-token']);
  state.auth.currentUser = null;
  await api.clearFirebaseSession();
  assert.equal(state.requests.at(-1).method, 'DELETE');
});

test('a delayed token from a completed popup cannot connect a different current user', async t => {
  const {api, state} = await setup(t);
  const token = deferred(), requested = deferred();
  state.user.getIdToken = () => {requested.resolve(); return token.promise;};
  const attempt = api.startGoogleSignIn();
  await requested.promise;
  state.auth.currentUser = {uid: 'another-user'};
  token.resolve('old-user-token');
  await attempt;
  assert.equal(state.requests.length, 0);
});

test('switching away from an ambient legacy identity deletes the server session even without an SDK user',async t=>{
  const {api,state}=await setup(t);
  assert.equal(state.auth.currentUser,null);
  await api.signOutRmt();
  assert.deepEqual(state.calls,['sign-out']);
  assert.equal(state.requests.length,1);
  assert.equal(state.requests[0].method,'DELETE');
  assert.equal(state.requests[0].url,'/api/auth/session');
});

test('sign-out ends the SDK identity before queued token writes and waits for the final server deletion',async t=>{
  const {api,state}=await setup(t),gate=deferred(),started=deferred();
  state.auth.currentUser=state.user;
  state.fetch=async()=>{if(state.requests.length===1){started.resolve();return gate.promise;}return new Response('{}',{status:200});};
  const inFlight=api.syncFirebaseSession('in-flight-token');await started.promise;
  const queued=api.syncFirebaseSession('queued-token');
  const signOut=api.signOutRmt();
  assert.equal(state.auth.currentUser,null);
  gate.resolve(new Response('{}',{status:200}));
  await Promise.all([inFlight,queued,signOut]);
  assert.deepEqual(state.requests.map(request=>request.method),['POST','DELETE']);
  assert.equal(JSON.parse(state.requests[0].body).idToken,'in-flight-token');
});

test('failed SDK or server sign-out is reported instead of pretending an account switch completed',async t=>{
  const {api,state}=await setup(t);
  state.signOutError=new Error('SDK unavailable');
  await assert.rejects(api.signOutRmt(),/SDK unavailable/);
  assert.equal(state.requests.length,0);
  state.signOutError=null;state.fetch=async()=>new Response('{}',{status:503});
  await assert.rejects(api.signOutRmt(),/Sign out failed/);
});

test('server rendering and missing browser storage globals do not break public initialization', async t => {
  const {api, state} = await setup(t);
  delete globalThis.window;
  assert.deepEqual(api.firebaseAuthEnvironment(), {origin: '', userAgent: '', maxTouchPoints: 0});
  assert.equal(await api.completeFirebaseRedirect(), null);
  assert.equal(api.firebaseAuth(), state.auth);
  assert.equal(state.apps[0].options.authDomain, 'rmt-launch-auth-20261124.firebaseapp.com');
});
