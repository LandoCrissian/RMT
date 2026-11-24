'use client';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { firebaseConfig } from './firebase-config';

export function firebaseAuth() {
  return getAuth(getApps().find(app => app.name === 'rmt') ?? initializeApp(firebaseConfig, 'rmt'));
}
let sessionWrites: Promise<unknown> = Promise.resolve();
export function syncFirebaseSession(idToken: string) {
  const write = sessionWrites.catch(() => {}).then(async () => {
    if (!firebaseAuth().currentUser) return;
    const response = await fetch('/api/auth/session', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({idToken})});
    if (!response.ok) throw new Error('Your account could not connect. Try signing in again.');
  });
  sessionWrites = write;
  return write;
}
export function clearFirebaseSession() {
  const write = sessionWrites.catch(() => {}).then(async () => {
    const response = await fetch('/api/auth/session', {method: 'DELETE', headers: {'content-type': 'application/json'}, body: '{}'});
    if (!response.ok) throw new Error('Sign out failed. Try again.');
  });
  sessionWrites = write;
  return write;
}
