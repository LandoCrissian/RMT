import {accountContinuation, continuationFromSearch, signInHref} from './account-navigation';

// Only an allowlisted navigation target and short-lived UI state. Firebase
// exclusively owns the OAuth state and credential storage.
const key = 'rmt.auth.attempt.v1';
const lifetime = 20 * 60 * 1000;
// A fresh callback tab can lose sessionStorage. This host-only hint can
// restore a public destination, but cannot complete or authenticate a login.
const routeCookie = '__Host-rmt-auth-route';
function savedRoute() {
  try {
    const pair = document.cookie.split('; ').find(value=>value.startsWith(routeCookie+'='));
    return pair ? decodeURIComponent(pair.slice(routeCookie.length+1)) : '';
  } catch {return '';}
}
function rememberRoute(target:string, duration:number) {
  try {document.cookie = routeCookie+'='+encodeURIComponent(target)+'; Secure; SameSite=Lax; Path=/; Max-Age='+duration;} catch { /* The tab may still hold its own route. */ }
}
type Attempt = {expires: number; target: string; phase: 'redirect' | 'popup' | 'recovery'};

export function readAttempt(): Attempt | null {
  try {
    const item = JSON.parse(window.sessionStorage.getItem(key) ?? 'null');
    if (!item || !Number.isFinite(item.expires) || item.expires <= Date.now() || item.expires > Date.now() + lifetime ||
        !['redirect','popup','recovery'].includes(item.phase)) return null;
    return {expires:item.expires, target:accountContinuation(item.target)?.href ?? '', phase:item.phase};
  } catch {return null;}
}
export function writeAttempt(phase: Attempt['phase']) {
  try {
    const target = authContinuation(window.location.search)?.href ?? (phase === 'recovery' ? readAttempt()?.target : '') ?? '';
    if (phase !== 'recovery') {
      const previous = savedRoute();
      // Simultaneous attempts with different targets must pick in the new tab.
      rememberRoute(previous && previous !== target ? 'multiple' : target || 'account', lifetime/1000);
    }
    window.sessionStorage.setItem(key, JSON.stringify({target, phase, expires:Date.now()+lifetime}));
  } catch { /* Recovery still works with a clean link. */ }
}
export function clearAttempt() {
  try {window.sessionStorage.removeItem(key);} catch { /* Storage can disappear mid-flow. */ }
  rememberRoute('',0);
}
export function handlerRecovery(search: string) {
  return new URLSearchParams(search).get('authRecovery') === 'handler';
}
export function authContinuation(search: string) {
  return continuationFromSearch(search) ?? (handlerRecovery(search) ? accountContinuation(readAttempt()?.target || savedRoute()) : null);
}
export function externalAuthLink() {
  return window.location.origin + signInHref(authContinuation(window.location.search)?.href);
}
export function storageWritable(kind: 'sessionStorage' | 'localStorage') {
  try {
    const store = window[kind];
    const probe = 'rmt.auth.probe.' + Math.random().toString(36).slice(2);
    store.setItem(probe, '1');
    try {return store.getItem(probe) === '1';} finally {store.removeItem(probe);}
  } catch {return false;}
}
// Visible locally for support. Never pass browser strings, error objects,
// destinations, storage contents, user IDs or OAuth parameters to diagnostics.
export function authEvent(event: 'embedded'|'session-storage'|'local-storage'|'cookies'|'popup'|'redirect'|'recovery'|'no-result'|'session-failed'|'session-exchanged'|'popup-blocked') {
  console.info('[RMT auth]',event);
}
