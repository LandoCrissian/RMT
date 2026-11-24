'use client';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, getRedirectResult, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, type UserCredential } from 'firebase/auth';
import { firebaseConfigForOrigin, supportsSameOriginFirebaseAuth } from './firebase-config';
import {firebaseAuthProblem, googleSignInFlow, type FirebaseAuthEnvironment, type FirebaseAuthProblem} from './firebase-auth-flow';

export function firebaseAuthEnvironment(): FirebaseAuthEnvironment {
  return typeof window === 'undefined'
    ? {origin: '', userAgent: '', maxTouchPoints: 0}
    : {origin: window.location.origin, userAgent: window.navigator.userAgent, maxTouchPoints: window.navigator.maxTouchPoints};
}

export function firebaseAuth() {
  return getAuth(getApps().find(app => app.name === 'rmt') ?? initializeApp(firebaseConfigForOrigin(firebaseAuthEnvironment().origin), 'rmt'));
}

type FirebaseAuthFlowStatus = {checkingRedirect: boolean; problem: FirebaseAuthProblem | null};
const initialFlowStatus: FirebaseAuthFlowStatus = {checkingRedirect: false, problem: null};
let flowStatus = initialFlowStatus;
const flowListeners = new Set<() => void>();
function updateFlowStatus(next: Partial<FirebaseAuthFlowStatus>) {
  flowStatus = {...flowStatus, ...next};
  for (const listener of flowListeners) listener();
}
export const getFirebaseAuthFlowStatus = () => flowStatus;
export const getFirebaseAuthFlowServerStatus = () => initialFlowStatus;
export function subscribeFirebaseAuthFlow(listener: () => void) {
  flowListeners.add(listener);
  return () => {flowListeners.delete(listener);};
}
export function clearFirebaseAuthProblem() {updateFlowStatus({problem: null});}
export function reportFirebaseAuthProblem(error: unknown) {updateFlowStatus({problem: firebaseAuthProblem(error)});}

let sessionWrites: Promise<unknown> = Promise.resolve();
const pendingSessionWrites = new Map<string, Promise<void>>();
export function syncFirebaseSession(idToken: string, expectedUid = firebaseAuth().currentUser?.uid) {
  const owner = firebaseAuth().currentUser;
  if (!owner || owner.uid !== expectedUid) return Promise.resolve();
  const key = owner.uid + ':' + idToken;
  const pending = pendingSessionWrites.get(key);
  if (pending) return pending;
  const write = sessionWrites.catch(() => {}).then(async () => {
    // A queued token from the previous user must not create a session after
    // sign-out or an account switch. All writes and deletion remain ordered.
    if (firebaseAuth().currentUser?.uid !== owner.uid) return;
    try {
      const response = await fetch('/api/auth/session', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({idToken})});
      if (!response.ok) throw new Error('Session request failed');
      if (flowStatus.problem?.reconnect) updateFlowStatus({problem: null});
    } catch {
      const error = Object.assign(new Error('RMT could not connect the signed-in account.'), {code: 'rmt/session-unavailable'});
      reportFirebaseAuthProblem(error);
      throw error;
    }
  });
  pendingSessionWrites.set(key, write);
  void write.then(() => pendingSessionWrites.delete(key), () => pendingSessionWrites.delete(key));
  sessionWrites = write;
  return write;
}

let redirectCompletion: Promise<UserCredential | null> | undefined;
export function completeFirebaseRedirect() {
  // React remounts and multiple consumers must observe the same result/error.
  // getRedirectResult consumes an OAuth result; it is called once per page.
  if (!redirectCompletion) {
    if (!supportsSameOriginFirebaseAuth(firebaseAuthEnvironment().origin)) {
      redirectCompletion = Promise.resolve(null);
    } else {
      updateFlowStatus({checkingRedirect: true});
      redirectCompletion = Promise.resolve().then(() => getRedirectResult(firebaseAuth())).then(async result => {
        if (result) await syncFirebaseSession(await result.user.getIdToken(true), result.user.uid);
        return result;
      }).catch(error => {reportFirebaseAuthProblem(error); throw error;}).finally(() => {updateFlowStatus({checkingRedirect: false});});
    }
  }
  return redirectCompletion;
}

export function startGoogleSignIn(requestSamePage = false): Promise<void> {
  clearFirebaseAuthProblem();
  const auth = firebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  // The popup call stays on the click's call stack, without a preceding fetch,
  // dynamic import, or persistence await. Mobile production uses one tab.
  if (googleSignInFlow(firebaseAuthEnvironment(), requestSamePage) === 'redirect') {
    return signInWithRedirect(auth, provider).catch(error => {reportFirebaseAuthProblem(error); throw error;});
  }
  return signInWithPopup(auth, provider).then(async result => {
    await syncFirebaseSession(await result.user.getIdToken(true), result.user.uid);
  }).catch(error => {reportFirebaseAuthProblem(error); throw error;});
}

export function clearFirebaseSession() {
  const write = sessionWrites.catch(() => {}).then(async () => {
    const response = await fetch('/api/auth/session', {method: 'DELETE', headers: {'content-type': 'application/json'}, body: '{}'});
    if (!response.ok) throw new Error('Sign out failed. Try again.');
  });
  sessionWrites = write;
  return write;
}

/** End the SDK identity before the ordered server deletion, including legacy sessions. */
export async function signOutRmt() {
  await signOut(firebaseAuth());
  await clearFirebaseSession();
}
