'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudioSession } from './studio-shared';

const DEVICE_KEY = 'rmt-library-v1';
const LIMIT = 200;
export type SessionStatus = 'loading' | 'ready' | 'error';
type CloudState = { userId: string | null; ids: string[]; status: 'loading' | 'ready' | 'error'; error: string };
type LibraryResponse = { projectIds: string[]; importedCount?: number; skippedCount?: number };
class AccountChangedError extends Error {}

function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw new Error('Your library could not be read. Please try again.');
  return [...new Set(value as string[])].filter(id => /^[a-z0-9][a-z0-9-]{0,119}$/.test(id)).slice(0, LIMIT);
}

async function libraryResponse(response: Response): Promise<LibraryResponse> {
  let data: Record<string, unknown>;
  try { data = await response.json(); } catch { throw new Error('We couldn’t reach your library. Refresh to check its latest saved state.'); }
  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : 'Your library could not be updated. Refresh to check its latest saved state.';
    if (data.code === 'account_changed') throw new AccountChangedError(message);
    throw new Error(message);
  }
  return { projectIds: cleanIds(data.projectIds), importedCount: typeof data.importedCount === 'number' ? data.importedCount : undefined, skippedCount: typeof data.skippedCount === 'number' ? data.skippedCount : undefined };
}

export function useProjectLibrary(session: StudioSession, sessionStatus: SessionStatus, onAccountChanged: () => void) {
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [deviceReady, setDeviceReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [cloud, setCloud] = useState<CloudState>({ userId: null, ids: [], status: 'loading', error: '' });
  const [busy, setBusy] = useState(false);
  const [importHandled, setImportHandled] = useState<string | null>(null);
  const ownerId = sessionStatus === 'ready' && session.authenticated ? session.userId : null;
  const identityKey = sessionStatus !== 'ready' ? sessionStatus : ownerId ? 'user:' + ownerId : 'device';
  const identityRef = useRef(identityKey);
  identityRef.current = identityKey;
  const requestRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const requestSequence = useRef(0);
  const accountChangedRef = useRef(onAccountChanged);
  accountChangedRef.current = onAccountChanged;

  useEffect(() => {
    function readDevice() {
      try {
        setDeviceIds(cleanIds(JSON.parse(localStorage.getItem(DEVICE_KEY) || '[]')));
        setStorageAvailable(true);
      } catch { setStorageAvailable(false); }
      setDeviceReady(true);
    }
    readDevice();
    const changed = (event: StorageEvent) => { if (event.key === DEVICE_KEY || event.key === null) readDevice(); };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);

  const refresh = useCallback(async () => {
    if (!ownerId || busyRef.current) return;
    const key = 'user:' + ownerId;
    const sequence = ++requestSequence.current;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setCloud({ userId: ownerId, ids: [], status: 'loading', error: '' });
    try {
      const data = await libraryResponse(await fetch('/api/library', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal, headers: { 'X-RMT-Account': ownerId } }));
      if (identityRef.current === key && sequence === requestSequence.current) setCloud({ userId: ownerId, ids: data.projectIds, status: 'ready', error: '' });
    } catch (error) {
      if (controller.signal.aborted || identityRef.current !== key || sequence !== requestSequence.current) return;
      setCloud({ userId: ownerId, ids: [], status: 'error', error: error instanceof Error ? error.message : 'Your account library is unavailable. Please try again.' });
      if (error instanceof AccountChangedError) accountChangedRef.current();
    }
  }, [ownerId]);

  useEffect(() => {
    requestRef.current?.abort();
    requestSequence.current++;
    busyRef.current = false;
    setBusy(false);
    setImportHandled(null);
    setCloud({ userId: ownerId, ids: [], status: 'loading', error: '' });
    if (ownerId) void refresh();
    return () => { requestRef.current?.abort(); requestSequence.current++; };
  }, [identityKey, ownerId, refresh]);

  const cloudMatches = Boolean(ownerId && cloud.userId === ownerId);
  const status = sessionStatus === 'error' ? 'error' : sessionStatus === 'loading' || !deviceReady ? 'loading' : ownerId ? cloudMatches ? cloud.status : 'loading' : 'ready';
  const saved = sessionStatus !== 'ready' ? [] : ownerId ? cloudMatches && cloud.status === 'ready' ? cloud.ids : [] : deviceIds;
  const pendingImportIds = ownerId && status === 'ready' && importHandled !== ownerId ? deviceIds.filter(id => !saved.includes(id)) : [];
  const error = sessionStatus === 'error' ? 'We couldn’t check your account. Retry before changing your library.' : cloudMatches && cloud.status === 'error' ? cloud.error : '';

  async function mutate(path: string, method: string, body: object) {
    if (!ownerId || status !== 'ready' || busyRef.current) return null;
    const key = 'user:' + ownerId;
    const sequence = ++requestSequence.current;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    busyRef.current = true; setBusy(true);
    try {
      const data = await libraryResponse(await fetch(path, {
        method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-RMT-Account': ownerId }, body: JSON.stringify(body),
      }));
      if (identityRef.current !== key || sequence !== requestSequence.current) return null;
      setCloud({ userId: ownerId, ids: data.projectIds, status: 'ready', error: '' });
      return data;
    } catch (error) {
      if (controller.signal.aborted || identityRef.current !== key || sequence !== requestSequence.current) return null;
      setCloud({ userId: ownerId, ids: [], status: 'error', error: 'We couldn’t confirm your last change. Refresh to check what was saved.' });
      if (error instanceof AccountChangedError) { accountChangedRef.current(); return null; }
      throw error;
    } finally {
      if (identityRef.current === key && sequence === requestSequence.current) { busyRef.current = false; setBusy(false); }
    }
  }

  async function toggle(projectId: string): Promise<{ removed: boolean; storage: 'cloud' | 'device' | 'visit' } | null> {
    if (status !== 'ready' || busyRef.current) return null;
    const removed = saved.includes(projectId);
    if (ownerId) {
      const result = await mutate('/api/library/' + encodeURIComponent(projectId), removed ? 'DELETE' : 'PUT', {});
      return result ? { removed, storage: 'cloud' } : null;
    }
    if (!removed && saved.length >= LIMIT) throw new Error('Your library holds up to 200 projects. Remove a project to make room.');
    const next = removed ? saved.filter(id => id !== projectId) : [...saved, projectId];
    setDeviceIds(next);
    try { localStorage.setItem(DEVICE_KEY, JSON.stringify(next)); setStorageAvailable(true); return { removed, storage: 'device' }; }
    catch { setStorageAvailable(false); return { removed, storage: 'visit' }; }
  }

  async function importDevice() {
    const result = await mutate('/api/library/import', 'POST', { projectIds: pendingImportIds });
    if (result && ownerId) setImportHandled(ownerId);
    return result;
  }

  return { saved, status, busy, error, storageAvailable, isCloud: Boolean(ownerId), pendingImportCount: pendingImportIds.length,
    refresh, toggle, importDevice, dismissImport: () => setImportHandled(ownerId), canSave: status === 'ready' && !busy };
}

export type ProjectLibrary = ReturnType<typeof useProjectLibrary>;
