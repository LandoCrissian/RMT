'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createUserWithEmailAndPassword, onIdTokenChanged, reload, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import {firebaseAuth, firebaseAuthEnvironment, syncFirebaseSession, startGoogleSignIn, completeFirebaseRedirect, reportFirebaseAuthProblem, clearFirebaseAuthProblem, subscribeFirebaseAuthFlow, getFirebaseAuthFlowStatus, getFirebaseAuthFlowServerStatus} from '@/lib/firebase-client';
import {firebaseAuthProblem, isKnownEmbeddedAuthBrowser, type FirebaseAuthEnvironment} from '@/lib/firebase-auth-flow';
import {supportsSameOriginFirebaseAuth} from '@/lib/firebase-config';

export function FirebaseSessionBridge({onChange}: {onChange: () => void}) {
  useEffect(() => {
    let active = true;
    try {
      const auth = firebaseAuth();
      const failed = (error: unknown) => {if (!active) return; reportFirebaseAuthProblem(error); onChange();};
      const stop = onIdTokenChanged(auth, user => {
        if (user) void user.getIdToken().then(token => syncFirebaseSession(token, user.uid)).then(() => {if (active) onChange();}).catch(failed);
      }, failed);
      // The result is consumed once even if React remounts the bridge. Callback
      // failures remain visible when the user opens Account, rather than being
      // silently treated as an ordinary signed-out visit.
      void completeFirebaseRedirect().then(result => {if (result && active) onChange();}).catch(() => {if (active) onChange();});
      const refresh = () => {if (auth.currentUser) void auth.currentUser.getIdToken(true).catch(failed);};
      const timer = setInterval(refresh, 50 * 60 * 1000);
      window.addEventListener('focus', refresh);
      return () => {active = false; stop(); clearInterval(timer); window.removeEventListener('focus', refresh);};
    } catch (error) {
      reportFirebaseAuthProblem(error);
      onChange();
    }
  // The callback reads the current app session, but the subscription is per mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function FirebaseAccount({authenticated, emailVerified, allowAccountLinking=true, onChange}: {authenticated: boolean; emailVerified?: boolean; allowAccountLinking?: boolean; onChange: () => void}) {
  const [mode, setMode] = useState<'signin' | 'register' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [environment, setEnvironment] = useState<FirebaseAuthEnvironment>({origin: '', userAgent: ''});
  const flow = useSyncExternalStore(subscribeFirebaseAuthFlow, getFirebaseAuthFlowStatus, getFirebaseAuthFlowServerStatus);
  useEffect(() => {setEnvironment(firebaseAuthEnvironment());}, []);
  const controlsBusy = busy || flow.checkingRedirect;
  const displayedNotice = notice || flow.problem?.message;
  async function run(operation: () => Promise<void>) {
    setBusy(true); setNotice(''); clearFirebaseAuthProblem();
    try {await operation(); onChange();}
    catch (error) {
      setNotice(firebaseAuthProblem(error).message);
    } finally {setBusy(false);}
  }
  async function connect() {
    const user = firebaseAuth().currentUser;
    if (!user) throw Object.assign(new Error('Sign in again.'), {code: 'auth/user-token-expired'});
    await syncFirebaseSession(await user.getIdToken(true), user.uid);
  }
  if(authenticated&&emailVerified&&!allowAccountLinking&&!displayedNotice)return null;
  return <section className="firebase-account" aria-label="RMT sign-in">
    {authenticated ? <>
      {!emailVerified && <><p>Verify your email to save your library, submit projects, or make claims.</p><button disabled={controlsBusy} className="button button-outline" onClick={() => void run(async () => {const user = firebaseAuth().currentUser; if (user) {await sendEmailVerification(user); setNotice('Verification email sent. Check your inbox and spam folder.');}})}>Send verification email</button><button disabled={controlsBusy} className="button button-outline" onClick={() => void run(async () => {const user = firebaseAuth().currentUser; if (user) {await reload(user); await connect(); setNotice(user.emailVerified ? 'Email verified.' : 'Email is not verified yet. Open the link in your email first.');}})}>I verified my email</button></>}
      {emailVerified && allowAccountLinking && <details><summary>Bring over an existing RMT account</summary><p>If you used RMT before Firebase, verify your original account once, then link it. Your existing library, claims and reviewer access will stay with that account.</p><a className="text-link" href="/signin-with-chatgpt?return_to=%2F%23account" target="_top">Verify original account</a><button disabled={controlsBusy} className="button button-outline" onClick={() => void run(async () => {const user = firebaseAuth().currentUser; if (!user) throw new Error('Sign in first'); const response = await fetch('/api/auth/link', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({idToken: await user.getIdToken(true)})}); const data = await response.json() as {error?: string}; if (!response.ok) {setNotice(data.error || 'Linking failed.'); return;} setNotice('Your original RMT account is linked. Your saved records and access are preserved.');})}>Link verified accounts</button></details>}
    </> : <>
      <h3>{mode === 'register' ? 'Create your free RMT account' : mode === 'reset' ? 'Recover your password' : 'Sign in to RMT'}</h3>
      {mode !== 'reset' && <button className="button button-outline" disabled={controlsBusy} onClick={() => void run(() => startGoogleSignIn())}>{flow.checkingRedirect ? 'Finishing sign-in…' : 'Continue with Google'}</button>}
      {mode !== 'reset' && isKnownEmbeddedAuthBrowser(environment.userAgent) && !flow.problem?.needsBrowser && <p className="inline-notice">Google may not finish sign-in inside this app. Open this RMT page in Safari or Chrome, or use email below.</p>}
      <form onSubmit={event => {event.preventDefault(); void run(async () => {
        const auth = firebaseAuth();
        if (mode === 'reset') {await sendPasswordResetEmail(auth, email); setNotice('If an account uses this email, a recovery link will arrive shortly.'); return;}
        const result = mode === 'register' ? await createUserWithEmailAndPassword(auth, email, password) : await signInWithEmailAndPassword(auth, email, password);
        if (mode === 'register') {await sendEmailVerification(result.user); setNotice('Account created. Check your email to verify your address.');}
        setPassword(''); await connect();
      });}}>
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} maxLength={254} /></label>
        {mode !== 'reset' && <label>Password<input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 8 : undefined} required value={password} onChange={event => setPassword(event.target.value)} /></label>}
        <button className="button button-lime" disabled={controlsBusy}>{controlsBusy ? 'Please wait…' : mode === 'register' ? 'Create free account' : mode === 'reset' ? 'Send recovery link' : 'Sign in with email'}</button>
      </form>
      <div className="firebase-modes"><button disabled={controlsBusy} onClick={() => {setMode(mode === 'register' ? 'signin' : 'register'); setNotice(''); clearFirebaseAuthProblem();}}>{mode === 'register' ? 'Already have an account? Sign in' : 'Create an account'}</button><button disabled={controlsBusy} onClick={() => {setMode(mode === 'reset' ? 'signin' : 'reset'); setNotice(''); clearFirebaseAuthProblem();}}>{mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}</button></div>
      <p>Any valid email provider is welcome. Registration and project listings are free. You can also keep browsing as a guest.</p>
    </>}
    {displayedNotice && <p role="status" className="inline-notice">{displayedNotice}</p>}
    {flow.problem?.retryOnSamePage && supportsSameOriginFirebaseAuth(environment.origin) && <button type="button" disabled={controlsBusy} className="button button-outline" onClick={() => void run(() => startGoogleSignIn(true))}>Continue with Google in this tab</button>}
    {flow.problem?.reconnect && <button type="button" disabled={controlsBusy} className="button button-outline" onClick={() => void run(connect)}>Reconnect account</button>}
  </section>;
}
