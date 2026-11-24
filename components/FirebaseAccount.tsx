'use client';
import { useEffect, useState } from 'react';
import { GoogleAuthProvider, createUserWithEmailAndPassword, onIdTokenChanged, reload, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import { firebaseAuth, syncFirebaseSession, clearFirebaseSession } from '@/lib/firebase-client';

export function FirebaseSessionBridge({onChange}: {onChange: () => void}) {
  useEffect(() => {
    let active = true;
    const auth = firebaseAuth();
    const stop = onIdTokenChanged(auth, user => {
      if (user) void user.getIdToken().then(syncFirebaseSession).then(() => {if (active) onChange();}).catch(() => {if (active) onChange();});
    });
    // Refresh while the app is open, including after mobile suspension.
    const refresh = () => { if (auth.currentUser) void auth.currentUser.getIdToken(true).catch(() => {}); };
    const timer = setInterval(refresh, 50 * 60 * 1000);
    window.addEventListener('focus', refresh);
    return () => {active = false; stop(); clearInterval(timer); window.removeEventListener('focus', refresh);};
  // The callback reads the current app session, but the subscription is per mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function FirebaseAccount({authenticated, emailVerified, onChange}: {authenticated: boolean; emailVerified?: boolean; onChange: () => void}) {
  const [mode, setMode] = useState<'signin' | 'register' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  async function run(operation: () => Promise<void>) {
    setBusy(true); setNotice('');
    try {await operation(); onChange();}
    catch (error) {
      const code = (error as {code?: string}).code;
      setNotice(code === 'auth/popup-closed-by-user' ? 'Sign-in was closed. You can try again.' : code === 'auth/popup-blocked' ? 'Allow the Google sign-in popup, then try again.' : code === 'auth/weak-password' ? 'Use a password with at least 8 characters.' : code === 'auth/email-already-in-use' ? 'Try signing in or resetting your password.' : code === 'auth/too-many-requests' ? 'Too many attempts. Please try again later.' : 'Could not complete this request. Check your details and try again.');
    } finally {setBusy(false);}
  }
  async function connect() {
    const user = firebaseAuth().currentUser;
    if (user) await syncFirebaseSession(await user.getIdToken(true));
  }
  return <section className="firebase-account" aria-label="RMT sign-in">
    {authenticated ? <>
      {!emailVerified && <><p>Verify your email to save your library, submit projects, or make claims.</p><button disabled={busy} className="button button-outline" onClick={() => void run(async () => {const user = firebaseAuth().currentUser; if (user) {await sendEmailVerification(user); setNotice('Verification email sent. Check your inbox and spam folder.');}})}>Send verification email</button><button disabled={busy} className="button button-outline" onClick={() => void run(async () => {const user = firebaseAuth().currentUser; if (user) {await reload(user); await connect(); setNotice(user.emailVerified ? 'Email verified.' : 'Email is not verified yet. Open the link in your email first.');}})}>I verified my email</button></>}
      <button disabled={busy} className="button button-outline" onClick={() => void run(async () => {await signOut(firebaseAuth()); await clearFirebaseSession(); location.assign('/#account'); location.reload();})}>Sign out</button>
      {emailVerified && <details><summary>Bring over an existing RMT account</summary><p>If you used RMT before Firebase, verify your original account once, then link it. Your existing library, claims and reviewer access will stay with that account.</p><a className="text-link" href="/signin-with-chatgpt?return_to=%2F%23account" target="_top">Verify original account</a><button disabled={busy} className="button button-outline" onClick={() => void run(async () => {const user = firebaseAuth().currentUser; if (!user) throw new Error('Sign in first'); const response = await fetch('/api/auth/link', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({idToken: await user.getIdToken(true)})}); const data = await response.json() as {error?: string}; if (!response.ok) {setNotice(data.error || 'Linking failed.'); return;} setNotice('Your original RMT account is linked. Your saved records and access are preserved.');})}>Link verified accounts</button></details>}
    </> : <>
      <h3>{mode === 'register' ? 'Create your free RMT account' : mode === 'reset' ? 'Recover your password' : 'Sign in to RMT'}</h3>
      {mode !== 'reset' && <button className="button button-outline" disabled={busy} onClick={() => void run(async () => {await signInWithPopup(firebaseAuth(), new GoogleAuthProvider()); await connect();})}>Continue with Google</button>}
      <form onSubmit={event => {event.preventDefault(); void run(async () => {
        const auth = firebaseAuth();
        if (mode === 'reset') {await sendPasswordResetEmail(auth, email); setNotice('If an account uses this email, a recovery link will arrive shortly.'); return;}
        const result = mode === 'register' ? await createUserWithEmailAndPassword(auth, email, password) : await signInWithEmailAndPassword(auth, email, password);
        if (mode === 'register') {await sendEmailVerification(result.user); setNotice('Account created. Check your email to verify your address.');}
        setPassword(''); await connect();
      });}}>
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} maxLength={254} /></label>
        {mode !== 'reset' && <label>Password<input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 8 : undefined} required value={password} onChange={event => setPassword(event.target.value)} /></label>}
        <button className="button button-lime" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create free account' : mode === 'reset' ? 'Send recovery link' : 'Sign in with email'}</button>
      </form>
      <div className="firebase-modes"><button disabled={busy} onClick={() => {setMode(mode === 'register' ? 'signin' : 'register'); setNotice('');}}>{mode === 'register' ? 'Already have an account? Sign in' : 'Create an account'}</button><button disabled={busy} onClick={() => {setMode(mode === 'reset' ? 'signin' : 'reset'); setNotice('');}}>{mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}</button></div>
      <p>Any valid email provider is welcome. Registration and project listings are free. You can also keep browsing as a guest.</p>
    </>}
    {notice && <p role="status" className="inline-notice">{notice}</p>}
  </section>;
}
