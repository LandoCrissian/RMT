'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import type {PrivateProfile, ProfileArtworkKind, ProfileInput, UploadedProfileArtwork} from '../profiles';
import {prepareArtworkUpload} from './project-artwork';
import {privateProfileResponse, profileArtworkList, profileResponseData, ProfileRequestError, uploadedProfileArtwork} from './profiles';

type Session = {authenticated: boolean; userId: string | null};
type State = {key: string | null; profile: PrivateProfile | null; artwork: UploadedProfileArtwork[]; loading: boolean;
  ready: boolean; busy: 'save' | ProfileArtworkKind | null; error: string; artworkError: string; artworkLoading: boolean;
  accountChanged: boolean; needsRefresh: boolean; uploadNeedsRefresh: boolean};
const fresh = (key: string | null): State => ({key, profile: null, artwork: [], loading: Boolean(key), ready: false,
  busy: null, error: '', artworkError: '', artworkLoading: false, accountChanged: false, needsRefresh: false, uploadNeedsRefresh: false});

export function useProfile(session: Session) {
  const key = session.authenticated ? session.userId : null;
  const current = useRef(key); current.current = key;
  const controllers = useRef(new Set<AbortController>());
  const mutation = useRef(false);
  const generation = useRef(0);
  const [state, setState] = useState<State>(() => fresh(key));
  const active = state.key === key ? state : fresh(key);

  const invalidate = useCallback((error: ProfileRequestError) => {
    for (const controller of controllers.current) controller.abort();
    controllers.current.clear(); generation.current++; mutation.current = false;
    setState({...fresh(key), loading: false, accountChanged: true, error: error.message});
  }, [key]);

  const reload = useCallback(async () => {
    if (!key || mutation.current) return null;
    for (const request of controllers.current) request.abort();
    controllers.current.clear(); const sequence = ++generation.current;
    const controller = new AbortController(); controllers.current.add(controller);
    setState(previous => ({...(previous.key === key ? previous : fresh(key)), loading: true, ready: false, error: ''}));
    try {
      const data = await profileResponseData(await fetch('/api/profile', {credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: {'X-RMT-Account': key}, signal: controller.signal}));
      const profile = privateProfileResponse(data);
      if (controller.signal.aborted || current.current !== key || sequence !== generation.current) return null;
      setState(previous => ({...previous, key, profile, loading: false, ready: true, error: '', accountChanged: false, needsRefresh: false}));
      return {profile};
    } catch (cause) {
      if (controller.signal.aborted || current.current !== key || sequence !== generation.current) return null;
      if (cause instanceof ProfileRequestError && cause.accountChanged) { invalidate(cause); return null; }
      setState(previous => ({...previous, loading: false, ready: false, error: cause instanceof Error ? cause.message : 'Your profile could not be loaded. Please try again.'}));
      return null;
    } finally { controllers.current.delete(controller); }
  }, [key, invalidate]);

  const reloadArtwork = useCallback(async () => {
    if (!key || mutation.current) return;
    const sequence = generation.current;
    const controller = new AbortController(); controllers.current.add(controller);
    setState(previous => ({...previous, artworkLoading: true, artworkError: ''}));
    try {
      const data = await profileResponseData(await fetch('/api/profile-artwork', {credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: {'X-RMT-Account': key}, signal: controller.signal}));
      const artwork = profileArtworkList(data);
      if (controller.signal.aborted || current.current !== key || sequence !== generation.current) return;
      setState(previous => ({...previous, artwork, artworkLoading: false, artworkError: '', uploadNeedsRefresh: false}));
    } catch (cause) {
      if (controller.signal.aborted || current.current !== key || sequence !== generation.current) return;
      if (cause instanceof ProfileRequestError && cause.accountChanged) { invalidate(cause); return; }
      setState(previous => ({...previous, artworkLoading: false, artworkError: 'Your saved images could not be loaded. Reload images to try again.'}));
    } finally { controllers.current.delete(controller); }
  }, [key, invalidate]);

  useEffect(() => {
    mutation.current = false; generation.current++;
    setState(fresh(key));
    void reload().then(result => {if (result) void reloadArtwork();});
    return () => { for (const request of controllers.current) request.abort(); controllers.current.clear(); generation.current++; };
  }, [key, reload, reloadArtwork]);

  async function save(input: ProfileInput): Promise<PrivateProfile | null> {
    if (!key || mutation.current || !active.ready || active.needsRefresh || active.accountChanged || input.expectedRevision !== (active.profile?.revision ?? 0)) return null;
    mutation.current = true; const sequence = ++generation.current;
    for (const request of controllers.current) request.abort(); controllers.current.clear();
    const controller = new AbortController(); controllers.current.add(controller);
    setState(previous => ({...previous, busy: 'save', error: '', artworkLoading: false}));
    try {
      const data = await profileResponseData(await fetch('/api/profile', {method: 'PATCH', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: {'Content-Type': 'application/json', 'X-RMT-Account': key}, body: JSON.stringify(input)}), true);
      const profile = privateProfileResponse(data);
      if (!profile || profile.revision !== input.expectedRevision + 1) throw new ProfileRequestError('We couldn’t confirm the saved version. Reload your profile before saving again.', true);
      if (controller.signal.aborted || current.current !== key || sequence !== generation.current) return null;
      setState(previous => ({...previous, profile, error: '', needsRefresh: false}));
      return profile;
    } catch (cause) {
      if (controller.signal.aborted || current.current !== key || sequence !== generation.current) return null;
      const error = cause instanceof ProfileRequestError ? cause : new ProfileRequestError('The connection was interrupted. Your changes may have saved. Reload your saved profile to check.', true);
      if (error.accountChanged) invalidate(error);
      else setState(previous => ({...previous, error: error.message, needsRefresh: error.needsRefresh}));
      return null;
    } finally {
      controllers.current.delete(controller);
      if (current.current === key && sequence === generation.current) { mutation.current = false; setState(previous => ({...previous, busy: null})); }
    }
  }

  async function upload(kind: ProfileArtworkKind, file: File): Promise<UploadedProfileArtwork | null> {
    if (!key || mutation.current || !active.ready || active.needsRefresh || active.accountChanged || active.uploadNeedsRefresh) return null;
    mutation.current = true; const sequence = ++generation.current;
    for (const request of controllers.current) request.abort(); controllers.current.clear();
    const controller = new AbortController(); controllers.current.add(controller); let sent = false;
    setState(previous => ({...previous, busy: kind, artworkError: '', artworkLoading: false}));
    try {
      const prepared = await prepareArtworkUpload(file, kind === 'avatar' ? 'logo' : 'banner', controller.signal);
      sent = true;
      const data = await profileResponseData(await fetch('/api/profile-artwork?kind=' + kind, {method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: {'Content-Type': 'image/png', 'X-RMT-Account': key}, body: prepared}), true);
      const image = uploadedProfileArtwork(data.artwork, kind);
      if (controller.signal.aborted || current.current !== key || sequence !== generation.current) return null;
      setState(previous => ({...previous, artwork: [image, ...previous.artwork.filter(item => item.id !== image.id)]}));
      return image;
    } catch (cause) {
      if (controller.signal.aborted || current.current !== key || sequence !== generation.current) return null;
      const error = cause instanceof ProfileRequestError ? cause : new ProfileRequestError(sent
        ? 'We couldn’t confirm this upload. Reload your saved images before uploading again.'
        : cause instanceof Error ? cause.message.replace('square logo', 'square avatar') : 'This image could not be prepared. Try a PNG, JPEG, or WebP.', sent);
      if (error.accountChanged) invalidate(error);
      else setState(previous => ({...previous, artworkError: error.message, uploadNeedsRefresh: error.needsRefresh}));
      return null;
    } finally {
      controllers.current.delete(controller);
      if (current.current === key && sequence === generation.current) { mutation.current = false; setState(previous => ({...previous, busy: null})); }
    }
  }

  return {...active, reload, reloadArtwork, save, upload};
}
