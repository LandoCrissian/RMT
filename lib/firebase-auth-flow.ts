import {supportsSameOriginFirebaseAuth} from './firebase-config';

export type FirebaseAuthEnvironment = {
  origin: string;
  userAgent: string;
  maxTouchPoints?: number;
  framed?: boolean;
  sessionWritable?: boolean;
  localWritable?: boolean;
  cookiesEnabled?: boolean;
};

export function googleRestriction(environment: FirebaseAuthEnvironment) {
  if (environment.framed || isKnownEmbeddedAuthBrowser(environment.userAgent)) return 'embedded';
  if (environment.cookiesEnabled === false) return 'cookies';
  if (environment.sessionWritable === false) return 'session-storage';
  return null;
}

export function isMobileAuthBrowser({userAgent, maxTouchPoints = 0}: FirebaseAuthEnvironment) {
  return /Android|iPhone|iPad|iPod/i.test(userAgent)
    || (/Macintosh|MacIntel/i.test(userAgent) && maxTouchPoints > 1);
}

export function googleSignInFlow(environment: FirebaseAuthEnvironment, requestSamePage = false): 'popup' | 'redirect' {
  // Never fall back to a cross-origin redirect: it reintroduces the storage
  // partitioning dependency this release removes from the production hosts.
  return supportsSameOriginFirebaseAuth(environment.origin)
    && (requestSamePage || isMobileAuthBrowser(environment)) ? 'redirect' : 'popup';
}

export function isKnownEmbeddedAuthBrowser(userAgent: string) {
  // Safari and SFSafariViewController do not imply an unsupported embedded
  // browser. Show guidance only for a known app UA or a reported auth error.
  return /FBAN|FBAV|Instagram|MicroMessenger|\bLine\/|TikTok|Bytedance|\bTwitter|Snapchat|LinkedInApp|\bChatGPT\/|MetaMaskMobile|MetaMask\/|CoinbaseWallet|TrustWallet|;\s*wv\)/i.test(userAgent);
}

export type FirebaseAuthProblem = {
  message: string;
  retryOnSamePage: boolean;
  needsBrowser: boolean;
  reconnect: boolean;
};

export function firebaseAuthProblem(error: unknown): FirebaseAuthProblem {
  const details = error && typeof error === 'object' ? error as {code?: unknown; message?: unknown} : {};
  const code = typeof details.code === 'string' ? details.code : '';
  const message = typeof details.message === 'string' ? details.message : '';
  const problem = (message: string, extra: Partial<FirebaseAuthProblem> = {}): FirebaseAuthProblem => ({message, retryOnSamePage: false, needsBrowser: false, reconnect: false, ...extra});

  if (code === 'rmt/session-unavailable') return problem('Your sign-in succeeded, but RMT could not connect your account. Try reconnecting below.', {reconnect: true});
  if (code === 'rmt/cookie-session') return problem('Your browser did not keep the RMT session. Reconnect here or open the sign-in link in your regular browser.', {needsBrowser:true,reconnect:true});
  if (code === 'auth/popup-blocked') return problem('This browser did not open the Google sign-in window. Try again or use email below.', {retryOnSamePage: true});
  if (code === 'auth/popup-closed-by-user') return problem('Google sign-in was closed before it finished. You can try again or use email below.');
  if (code === 'auth/cancelled-popup-request') return problem('Another sign-in attempt replaced this one. Finish the most recent attempt, or try again.');
  if (code === 'auth/redirect-cancelled-by-user') return problem('Google sign-in was cancelled. You can try again or use email below.');
  if (code === 'auth/operation-not-supported-in-this-environment' || /disallowed_useragent/i.test(message)) return problem('Google cannot finish sign-in inside this app. Open this RMT page in Safari or Chrome, or use email below.', {needsBrowser: true});
  if (code === 'rmt/cookies') return problem('This browser is blocking the cookies RMT needs to keep you signed in. Open the link in your regular browser.', {needsBrowser:true});
  if (code === 'rmt/embedded') return problem('Open RMT in your regular browser to continue with Google, or sign in with email here.', {needsBrowser:true});
  if (/missing initial state|sessionStorage|storage.*(?:inaccessible|unavailable|partition)/i.test(message) || ['auth/web-storage-unsupported', 'auth/missing-initial-state','rmt/session-storage','rmt/recovery'].includes(code)) return problem('Google sign-in could not recover this browser session. Open RMT in your regular browser or sign in with email below.', {needsBrowser: true});
  if (['auth/unauthorized-domain', 'auth/operation-not-allowed', 'auth/invalid-api-key', 'auth/app-not-authorized', 'auth/invalid-oauth-client-id', 'auth/invalid-oauth-provider'].includes(code) || /redirect_uri_mismatch|origin_mismatch/i.test(message)) return problem('Google sign-in is not available on this address right now. You can sign in with email below.');
  if (code === 'auth/network-request-failed') return problem('The sign-in service could not be reached. Check your connection and try again.');
  if (code === 'auth/account-exists-with-different-credential') return problem('This email already uses another sign-in method. Sign in with that method to keep your existing account.');
  if (code === 'auth/weak-password') return problem('Use a password with at least 8 characters.');
  if (code === 'auth/email-already-in-use') return problem('Try signing in or resetting your password.');
  if (['auth/invalid-email', 'auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(code)) return problem('Check your email and password, or use password recovery.');
  if (code === 'auth/too-many-requests') return problem('Too many attempts. Please try again later.');
  if (code === 'auth/user-disabled') return problem('Sign-in is unavailable for this account. Contact RMT for help.');
  if (code === 'auth/user-token-expired' || code === 'auth/requires-recent-login') return problem('Your sign-in has expired. Sign in again to continue.');
  return problem('Could not complete this request. Try again or use email below.');
}
