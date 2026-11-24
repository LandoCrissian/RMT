// Firebase's browser helpers must share the application's origin so their
// authentication state does not depend on third-party browser storage.
import { firebaseConfigForOrigin } from '../firebase-config';

const FIREBASE_HELPER_ORIGIN = 'https://rmt-launch-auth-20261124.firebaseapp.com';
const HELPER_PATHS = new Set([
  '/__/auth/handler',
  '/__/auth/handler.js',
  '/__/auth/experiments.js',
  '/__/auth/iframe',
  '/__/auth/iframe.js',
  '/__/auth/links',
  '/__/auth/links.js',
]);
const REQUEST_HEADERS = ['accept', 'accept-language', 'content-type', 'origin', 'user-agent'];
const RESPONSE_HEADERS = [
  'content-type', 'content-language', 'content-security-policy',
  'content-security-policy-report-only', 'cross-origin-opener-policy',
  'cross-origin-embedder-policy', 'cross-origin-resource-policy',
  'x-frame-options', 'x-content-type-options',
];
const MAX_POST_BYTES = 64 * 1024;
const RECOVERY_URL = '/?authRecovery=handler#account';
const RECOVERY_SCRIPT_PATH = '/__/auth/rmt-recovery.js';
const RECOVERY_LINK = `<a href="${RECOVERY_URL}" rel="noreferrer">Return to RMT for email sign-in or help opening your browser</a>`;

// The hosted Firebase widget renders a terminal error inside its own document.
// It does not deliver that error to getRedirectResult or signInWithPopup.
// Observe only the screen's presence. Never inspect callback parameters,
// message text, helper storage, the opener, or the user's OAuth credentials.
const RECOVERY_SCRIPT = `(() => {
  const help = document.getElementById('rmt-auth-help');
  if (!help) return;
  function recover() {
    observer.disconnect();
    help.hidden = false;
    console.info('[RMT auth] handler_recovery');
    window.location.replace('${RECOVERY_URL}');
  }
  function check() {
    if (document.getElementById('error-screen')) recover();
  }
  const observer = new MutationObserver(check);
  if (!window.fireauth?.oauthhelper?.widget?.initialize || document.getElementById('error-screen')) {
    recover();
    return;
  }
  help.hidden = true;
  observer.observe(document.body, {childList: true, subtree: true});
  // A delayed provider remains free to complete. Give a stalled browser a
  // manual exit even if Firebase later changes its terminal-error markup.
  window.setTimeout(() => { help.hidden = false; }, 12000);
})();`;

function addRecoveryToHandler(html: string) {
  const fallback = `<aside id="rmt-auth-help">${RECOVERY_LINK}</aside><script defer src="${RECOVERY_SCRIPT_PATH}"></script>`;
  const end = html.lastIndexOf('</body>');
  return end < 0 ? html + fallback : html.slice(0, end) + fallback + html.slice(end);
}

function privateHeaders(headers = new Headers()) {
  headers.set('cache-control', 'private, no-store, max-age=0');
  headers.set('cdn-cache-control', 'no-store');
  headers.set('cloudflare-cdn-cache-control', 'no-store');
  headers.set('pragma', 'no-cache');
  headers.set('expires', '0');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-content-type-options', 'nosniff');
  return headers;
}

function failure(status: number, message: string, head = false) {
  const headers = privateHeaders();
  headers.set('content-type', 'text/plain; charset=utf-8');
  return new Response(head ? null : message, {status, headers});
}

function helperFailure(path: string, status: number, message: string, head = false) {
  if (path !== '/__/auth/handler') return failure(status, message, head);
  const headers = privateHeaders();
  headers.set('content-type', 'text/html; charset=utf-8');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RMT sign-in help</title><main><h1>Google sign-in could not finish</h1><p>${message}</p><p>${RECOVERY_LINK}</p></main></html>`;
  return new Response(head ? null : html, {status, headers});
}

async function readPostBody(request: Request): Promise<ArrayBuffer | null> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_POST_BYTES)) return null;
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_POST_BYTES) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}

async function forwardHelper(request: Request, url: URL, upstreamFetch: typeof fetch): Promise<Response> {
  const head = request.method === 'HEAD';
  if (!['GET', 'HEAD', 'POST'].includes(request.method)) {
    const response = helperFailure(url.pathname, 405, 'This sign-in helper does not support that request.');
    response.headers.set('allow', 'GET, HEAD, POST');
    return response;
  }
  try {
    const body = request.method === 'POST' ? await readPostBody(request) : undefined;
    if (body === null) return helperFailure(url.pathname, 413, 'This sign-in request is too large.');
    // Build a fresh request. App sessions, authorization, forwarding metadata,
    // and Sites identity headers must never leave RMT through this proxy.
    const headers = new Headers();
    for (const name of REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    headers.set('accept-encoding', 'identity');
    headers.set('cache-control', 'no-cache');
    headers.set('pragma', 'no-cache');
    const target = new URL(url.pathname + url.search, FIREBASE_HELPER_ORIGIN);
    const upstream = await upstreamFetch(target.href, {
      method: request.method, headers, body, credentials: 'omit',
      redirect: 'manual', cache: 'no-store', referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(10_000),
    });
    // The helper endpoints serve documents/scripts directly. Never follow a
    // redirect with OAuth state or a POST body, or expose an upstream error body.
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return helperFailure(url.pathname, 502, 'Google sign-in is temporarily unavailable.', head);
    }
    const responseHeaders = new Headers();
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value !== null) responseHeaders.set(name, value);
    }
    const handlerDocument = url.pathname === '/__/auth/handler';
    if (handlerDocument && !head && (!upstream.body || !/^text\/html\b/i.test(responseHeaders.get('content-type') || ''))) {
      await upstream.body?.cancel();
      return helperFailure(url.pathname, 502, 'The sign-in page could not load.');
    }
    const responseBody = head ? null : handlerDocument ? addRecoveryToHandler(await upstream.text()) : upstream.body;
    return new Response(responseBody, {
      status: upstream.status, headers: privateHeaders(responseHeaders),
    });
  } catch {
    // Do not log upstream errors: they may include authorization codes/state.
    return helperFailure(url.pathname, 502, 'Google sign-in is temporarily unavailable.', head);
  }
}

/** Returns null for ordinary app routes; no route can choose another upstream. */
export function proxyFirebaseAuth(request: Request, upstreamFetch: typeof fetch = fetch): Promise<Response> | null {
  const url = new URL(request.url);
  if (url.pathname === RECOVERY_SCRIPT_PATH) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const response = failure(405, 'This sign-in helper does not support that request.');
      response.headers.set('allow', 'GET, HEAD');
      return Promise.resolve(response);
    }
    const headers = privateHeaders();
    headers.set('content-type', 'application/javascript; charset=utf-8');
    return Promise.resolve(new Response(request.method === 'HEAD' ? null : RECOVERY_SCRIPT, {headers}));
  }
  if (url.pathname === '/__/firebase/init.json') {
    if (!['GET', 'HEAD'].includes(request.method)) {
      const response = failure(405, 'This sign-in configuration does not support that request.');
      response.headers.set('allow', 'GET, HEAD');
      return Promise.resolve(response);
    }
    // RMT is not hosted on Firebase Hosting, so that optional endpoint does not
    // exist upstream. Return only the public web config already shipped by RMT.
    const headers = privateHeaders();
    headers.set('content-type', 'application/json; charset=utf-8');
    return Promise.resolve(new Response(request.method === 'HEAD' ? null : JSON.stringify(firebaseConfigForOrigin(url.origin)), {headers}));
  }
  if (!HELPER_PATHS.has(url.pathname)) {
    if (url.pathname === '/__/auth' || url.pathname.startsWith('/__/auth/')) {
      return Promise.resolve(failure(404, 'This sign-in helper was not found.', request.method === 'HEAD'));
    }
    return null;
  }
  return forwardHelper(request, url, upstreamFetch);
}
