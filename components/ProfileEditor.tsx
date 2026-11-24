'use client';

import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {ArrowUpRight, Check, CheckCircle2, CircleAlert, Eye, Globe2, ImagePlus, Link as LinkIcon, LoaderCircle, LockKeyhole, Plus, RefreshCw, Save, Trash2, Upload, UserRound, X} from 'lucide-react';
import {validateProfileInput, type ProfileArtwork, type ProfileArtworkKind, type ProfileInput, type PublicProfile as PublicProfileData} from '@/lib/profiles';
import {profileForm} from '@/lib/client/profiles';
import {useProfile} from '@/lib/client/use-profile';
import {signInHref} from '@/lib/account-navigation';
import type {StudioSession} from './studio-shared';
import PublicProfile from './PublicProfile';
import './profiles.css';

type Props = {session: StudioSession; onToast?: (message: string) => void; onRetrySession?: () => void};
type Confirmation = 'publish' | 'reload' | null;

export default function ProfileEditor(props: Props) {
  if (!props.session.authenticated || !props.session.userId) return <section className="profile-feedback"><UserRound size={25} /><h2>Your space on RMT.</h2><p>Sign in to create an optional profile. You decide what to share.</p><a href={signInHref('/#profile')} target="_top" className="button button-lime">Sign in to create a profile <ArrowUpRight size={16} /></a></section>;
  return <ProfileEditorForAccount key={props.session.userId} {...props} />;
}

function ProfileEditorForAccount({session, onToast, onRetrySession}: Props) {
  const profile = useProfile(session);
  const [form, setForm] = useState<ProfileInput>(() => profileForm(null));
  const [initialized, setInitialized] = useState(false);
  const [localError, setLocalError] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishConsent, setPublishConsent] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const formElement = useRef<HTMLFormElement>(null);
  const identity = useRef(session.userId); identity.current = session.userId;
  const mounted = useRef(true);
  const id = useId();
  const savedForm = profileForm(profile.profile);
  const dirty = initialized && JSON.stringify(form) !== JSON.stringify(savedForm);
  const verificationRequired = session.emailVerified === false;
  const disabled = Boolean(profile.busy) || !profile.ready || profile.needsRefresh || verificationRequired;

  useEffect(() => { if (profile.ready && !initialized) { setForm(profileForm(profile.profile)); setInitialized(true); } }, [profile.ready, profile.profile, initialized]);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {if (dirty || profile.busy) {event.preventDefault(); event.returnValue = '';}};
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, profile.busy]);
  useEffect(() => {
    if (confirmation && dialog.current && !dialog.current.open) dialog.current.showModal();
    if (!confirmation && dialog.current?.open) dialog.current.close();
  }, [confirmation]);

  function edit<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) {
    setForm(previous => ({...previous, [key]: value})); setLocalError(''); setSavedNotice('');
  }
  function selectedImage(kind: ProfileArtworkKind): ProfileArtwork | null {
    const chosen = form[`${kind}AssetId`];
    return profile.artwork.find(image => image.id === chosen) ?? (profile.profile?.[kind]?.id === chosen ? profile.profile[kind] : null);
  }
  const preview: PublicProfileData = {handle: form.handle, displayName: form.displayName, bio: form.bio,
    links: form.links, avatar: selectedImage('avatar'), banner: selectedImage('banner'),
    managedProjects: form.showManagedProjects ? profile.profile?.managedProjects ?? [] : [],
    isBuilder: form.showManagedProjects && (profile.profile?.isBuilder ?? false)};

  async function save() {
    if (disabled) return;
    let validated: ProfileInput;
    try {validated = validateProfileInput(form);} catch (cause) {setLocalError(cause instanceof Error ? cause.message : 'Check your profile details.'); return;}
    const account = session.userId;
    setConfirmation(null); setLocalError(''); setSavedNotice('');
    const saved = await profile.save(validated);
    if (!saved || !mounted.current || identity.current !== account) return;
    setForm(profileForm(saved));
    const message = saved.visibility === 'public' ? 'Your profile is public. Your latest changes are live.' : 'Your profile is saved privately.';
    setSavedNotice(message); onToast?.(message);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
    try {validateProfileInput(form);} catch (cause) {setLocalError(cause instanceof Error ? cause.message : 'Check your profile details.'); return;}
    if (form.visibility === 'public' && !profile.profile?.handleLocked) {setPublishConsent(false); setConfirmation('publish');}
    else void save();
  }

  async function reload() {
    setConfirmation(null);
    const account = session.userId;
    const result = await profile.reload();
    if (!result || !mounted.current || identity.current !== account) return;
    setForm(profileForm(result.profile)); setInitialized(true); setLocalError(''); setSavedNotice('Saved profile reloaded.');
    void profile.reloadArtwork();
  }

  async function upload(kind: ProfileArtworkKind, file?: File) {
    if (!file || disabled) return;
    const account = session.userId;
    const image = await profile.upload(kind, file);
    if (!image || !mounted.current || identity.current !== account) return;
    edit(`${kind}AssetId`, image.id);
    setSavedNotice('Image uploaded privately. Save your profile to use it.');
  }

  if (profile.accountChanged) return <section className="profile-feedback" role="alert"><LockKeyhole size={25} /><h2>Your account or access changed.</h2><p>Refresh your account before opening private profile details.</p><button type="button" className="button button-lime" onClick={() => {onRetrySession?.(); window.location.reload();}}><RefreshCw size={16} /> Refresh RMT</button></section>;
  if (!initialized) return <section className="profile-feedback" aria-live="polite">{profile.loading ? <><LoaderCircle size={26} className="rmt-spin" /><h2>Opening your profile…</h2><p>Loading your saved details.</p></> : <><CircleAlert size={26} /><h2>Your profile couldn’t be loaded.</h2><p>{profile.error || 'Please try again.'}</p><button type="button" className="button button-outline" onClick={() => void reload()}><RefreshCw size={16} /> Try again</button></>}</section>;

  return <div className="profile-editor">
    <header className="profile-editor-heading"><div><span className="profile-eyebrow">YOUR SPACE ON RMT</span><h1>Make it yours.</h1><p>A home for you and what you’re building. Share as much or as little as you like.</p></div><span className={'profile-saved-visibility ' + (profile.profile?.visibility === 'public' ? 'is-public' : '')}>{profile.profile?.visibility === 'public' ? <Globe2 size={14} /> : <LockKeyhole size={14} />}{profile.profile?.visibility === 'public' ? 'Public profile' : 'Private profile'}</span></header>
    {verificationRequired && <div className="profile-inline-feedback"><LockKeyhole size={18} /><div><p>Verify your email before saving your profile or uploading artwork.</p><a className="profile-text-action" href="/#account">Open account settings <ArrowUpRight size={14} /></a></div></div>}
    <div className="profile-editor-layout"><form ref={formElement} className="profile-form" onSubmit={submit}>
      <section className="profile-form-section"><div className="profile-section-title"><span><UserRound size={18} /></span><div><h2>A name to know you by.</h2><p>These details come from you. Your sign-in information stays separate.</p></div></div>
        <div className="profile-fields-two"><label className="profile-field" htmlFor={id + '-name'}>Display name<input id={id + '-name'} value={form.displayName} maxLength={48} autoComplete="off" disabled={disabled} onChange={event => edit('displayName', event.target.value)} placeholder="What should we call you?" /><small>Up to 48 characters.</small></label>
          <label className="profile-field" htmlFor={id + '-handle'}>Your handle<span className="profile-handle-input"><span aria-hidden="true">@</span><input id={id + '-handle'} value={form.handle} maxLength={24} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} readOnly={Boolean(profile.profile?.handleLocked)} disabled={disabled} aria-describedby={id + '-handle-help'} onChange={event => edit('handle', event.target.value.toLowerCase())} placeholder="your-handle" />{profile.profile?.handleLocked && <LockKeyhole size={14} aria-label="Handle is permanent" />}</span><small id={id + '-handle-help'}>{profile.profile?.handleLocked ? 'Your permanent handle. It stays yours when your profile is private.' : '3–24 letters, numbers, hyphens or underscores. Fixed after first publication.'}</small></label></div>
        <label className="profile-field" htmlFor={id + '-bio'}><span className="profile-label-row">A little about you <small>{form.bio.length}/280</small></span><textarea id={id + '-bio'} value={form.bio} rows={4} maxLength={280} disabled={disabled} onChange={event => edit('bio', event.target.value)} placeholder="What are you into? What are you working on?" /></label>
      </section>

      <section className="profile-form-section"><div className="profile-section-title"><span><ImagePlus size={18} /></span><div><h2>Put a face to the name.</h2><p>Optional artwork, chosen by you. Uploads stay private until your profile is public.</p></div></div>
        <div className="profile-artwork-grid">{(['avatar', 'banner'] as const).map(kind => {
          const image = selectedImage(kind); const images = profile.artwork.filter(item => item.kind === kind);
          return <div className={'profile-artwork-field profile-artwork-' + kind} key={kind}><div className="profile-artwork-title"><h3>{kind === 'avatar' ? 'Avatar' : 'Profile banner'}</h3><span>Optional</span></div><div className="profile-artwork-preview">{image ? <img src={image.url} alt={`Selected profile ${kind}`} decoding="async" /> : <span><ImagePlus size={22} />{kind === 'avatar' ? 'Your square image' : 'Your creative backdrop'}</span>}</div><p className="profile-artwork-size">{kind === 'avatar' ? 'Square · at least 128 × 128 px' : 'Wide · recommended 1200 × 630 px'}</p>
            <label className={'profile-upload button button-outline' + ((disabled || profile.uploadNeedsRefresh) ? ' is-disabled' : '')}>{profile.busy === kind ? <LoaderCircle className="rmt-spin" size={15} /> : <Upload size={15} />}{profile.busy === kind ? 'Uploading…' : image ? 'Replace image' : 'Upload image'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled || profile.uploadNeedsRefresh} aria-label={`Upload profile ${kind}`} onChange={event => {const file = event.target.files?.[0]; event.target.value = ''; void upload(kind, file);}} /></label>
            {images.length > 0 && <label className="profile-field profile-reuse">Use a saved image<select value={images.some(item => item.id === form[`${kind}AssetId`]) ? form[`${kind}AssetId`] ?? '' : ''} disabled={disabled} onChange={event => {if (event.target.value) edit(`${kind}AssetId`, event.target.value);}}><option value="">Choose an upload</option>{images.map((item, index) => <option value={item.id} key={item.id}>Image {index + 1} · {item.width} × {item.height}</option>)}</select></label>}
            {image && <button type="button" className="profile-text-action" disabled={disabled} onClick={() => edit(`${kind}AssetId`, null)}><Trash2 size={14} /> Remove from profile</button>}
          </div>;
        })}</div><p className="profile-guidance">PNG, JPEG, or WebP · up to 2 MB each · still images only. Banners need at least 600 × 300 px; all images must fit within 4096 px per side and 8 million pixels. Up to 8 uploads per day; saved images can be reused.</p>
        {profile.artworkError && <div className="profile-inline-feedback" role="alert"><p>{profile.artworkError}</p><button type="button" className="profile-text-action" disabled={Boolean(profile.busy) || profile.artworkLoading} onClick={() => void profile.reloadArtwork()}><RefreshCw size={14} />{profile.artworkLoading ? 'Reloading images…' : 'Reload saved images'}</button></div>}
      </section>

      <section className="profile-form-section"><div className="profile-section-title"><span><LinkIcon size={18} /></span><div><h2>Connect the dots.</h2><p>Share your website, creative work, or social pages.</p></div><span className="profile-section-count">{form.links.length}/4</span></div>
        {form.links.length === 0 && <p className="profile-links-empty">Your links can live here. Add one when you’re ready.</p>}
        <div className="profile-link-fields">{form.links.map((link, index) => <div className="profile-link-row" key={index}><span className="profile-link-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><label className="profile-field">Link label<input value={link.label} maxLength={32} disabled={disabled} onChange={event => edit('links', form.links.map((item, at) => at === index ? {...item, label: event.target.value} : item))} placeholder="My website" aria-label={`Link ${index + 1} label`} /></label><label className="profile-field">HTTPS address<input type="url" value={link.url} maxLength={2048} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={disabled} onChange={event => edit('links', form.links.map((item, at) => at === index ? {...item, url: event.target.value} : item))} placeholder="https://" aria-label={`Link ${index + 1} address`} /></label><button type="button" className="profile-remove-link" aria-label={`Remove link ${index + 1}`} disabled={disabled} onClick={() => edit('links', form.links.filter((_, at) => at !== index))}><X size={17} /></button></div>)}</div>
        {form.links.length < 4 && <button type="button" className="profile-text-action" disabled={disabled} onClick={() => edit('links', [...form.links, {label: '', url: ''}])}><Plus size={16} /> Add a link</button>}
      </section>

      <section className="profile-form-section profile-sharing-section"><div className="profile-section-title"><span><Eye size={18} /></span><div><h2>Choose what’s visible.</h2><p>Your saved library always stays private.</p></div></div>
        <fieldset className="profile-visibility-options" disabled={disabled}><legend className="sr-only">Profile visibility</legend>{(['private', 'public'] as const).map(visibility => <label key={visibility} className={'profile-visibility-option' + (form.visibility === visibility ? ' is-selected' : '')}><input type="radio" name={id + '-visibility'} value={visibility} checked={form.visibility === visibility} onChange={() => edit('visibility', visibility)} /><span className="profile-choice-icon">{visibility === 'private' ? <LockKeyhole size={19} /> : <Globe2 size={19} />}</span><span><strong>{visibility === 'private' ? 'Keep it private' : 'Make it public'}</strong><small>{visibility === 'private' ? 'Only you can see your profile.' : 'Anyone with your link can visit.'}</small></span><span className="profile-radio-mark" aria-hidden="true">{form.visibility === visibility && <Check size={12} />}</span></label>)}</fieldset>
        <label className="profile-project-opt-in"><input type="checkbox" checked={form.showManagedProjects} disabled={disabled} onChange={event => edit('showManagedProjects', event.target.checked)} /><span><strong>Show the projects I manage</strong><small>Include your public RMT projects after ownership is confirmed. Your builder label follows those projects.</small></span></label>
        {form.showManagedProjects && preview.managedProjects.length === 0 && <p className="profile-guidance">{profile.profile ? 'Your confirmed projects will appear here when they’re public on RMT.' : 'Your confirmed public projects will be added after your first save.'}</p>}
        {!profile.profile?.handleLocked && form.visibility === 'public' && <p className="profile-handle-note"><LockKeyhole size={15} /><span>Your handle becomes permanent the first time you publish. You can hide your profile later.</span></p>}
      </section>

      {(localError || profile.error) && <div className="profile-inline-feedback profile-error" role="alert"><CircleAlert size={18} /><div><p>{localError || profile.error}</p>{profile.needsRefresh && <p>Your edits are still shown. Reload the saved profile to check its latest version before saving again.</p>}{(profile.needsRefresh || !profile.ready) && <button type="button" className="profile-text-action" disabled={Boolean(profile.busy) || profile.loading} onClick={() => dirty ? setConfirmation('reload') : void reload()}><RefreshCw size={14} /> Reload saved profile</button>}</div></div>}
      {savedNotice && <p className="profile-success" role="status"><CheckCircle2 size={17} />{savedNotice}</p>}
      <div className="profile-save-bar"><span>{profile.busy === 'save' ? 'Saving your profile…' : dirty ? 'You have unsaved changes' : 'Your saved profile is up to date'}</span><button type="submit" className="button button-lime" disabled={disabled || (!dirty && profile.profile !== null)}>{profile.busy === 'save' ? <LoaderCircle size={16} className="rmt-spin" /> : form.visibility === 'public' && profile.profile?.visibility !== 'public' ? <Globe2 size={16} /> : <Save size={16} />}{profile.busy === 'save' ? 'Saving…' : form.visibility === 'public' ? profile.profile?.visibility === 'public' ? 'Save public profile' : 'Publish profile' : profile.profile?.visibility === 'public' ? 'Make profile private' : 'Save private profile'}</button></div>
    </form>

    <aside className={'profile-preview-pane' + (previewOpen ? ' is-open' : '')}><div className="profile-preview-heading"><div><span className="profile-eyebrow">A LOOK AHEAD</span><h2>Your profile preview</h2></div><span><Eye size={14} /> Preview</span></div><button type="button" className="profile-preview-toggle" aria-expanded={previewOpen} aria-controls={id + '-preview'} onClick={() => setPreviewOpen(value => !value)}><Eye size={16} />{previewOpen ? 'Hide profile preview' : 'Show profile preview'}</button><div className="profile-preview-content" id={id + '-preview'}><PublicProfile profile={preview} preview /><p className="profile-preview-note">{form.visibility === 'private' ? 'Only you can see this preview. Publish when you’re ready.' : 'This is what you’re choosing to share after saving.'}</p>{profile.profile?.visibility === 'public' && <a className="profile-public-link" href={'/u/' + encodeURIComponent(profile.profile.handle)} target="_blank" rel="noopener noreferrer">Open your saved public profile <ArrowUpRight size={15} /><span className="sr-only"> (opens in a new tab)</span></a>}</div></aside></div>

    <dialog ref={dialog} className="profile-confirmation" onCancel={() => setConfirmation(null)} aria-labelledby={id + '-confirm-heading'}><button type="button" className="profile-dialog-close" aria-label="Close confirmation" onClick={() => setConfirmation(null)}><X size={19} /></button>{confirmation === 'publish' ? <><span className="profile-confirmation-icon"><Globe2 size={26} /></span><span className="profile-eyebrow">YOUR PUBLIC HOME</span><h2 id={id + '-confirm-heading'}>Ready to be known as @{form.handle}?</h2><p>Your profile will be visible to anyone at <strong>rmtlaunch.fun/u/{form.handle}</strong>.</p><label className="profile-project-opt-in"><input type="checkbox" checked={publishConsent} onChange={event => setPublishConsent(event.target.checked)} /><span>I understand that this handle is permanent. It can’t be renamed, even if I make my profile private later.</span></label><div className="profile-confirmation-actions"><button type="button" className="button button-outline" onClick={() => setConfirmation(null)}>Keep editing</button><button type="button" className="button button-lime" disabled={!publishConsent || disabled} onClick={() => void save()}><Globe2 size={16} /> Publish profile</button></div></> : <><span className="profile-confirmation-icon"><RefreshCw size={26} /></span><h2 id={id + '-confirm-heading'}>Reload your saved profile?</h2><p>{profile.needsRefresh ? 'The saved result needs to be checked. Reloading replaces these local edits with the version saved to your account.' : 'Reloading replaces your unsaved edits with the version saved to your account.'}</p><p>You can keep this view to copy any changes you want to keep first.</p><div className="profile-confirmation-actions"><button type="button" className="button button-outline" onClick={() => setConfirmation(null)}>Keep this view</button><button type="button" className="button button-lime" disabled={Boolean(profile.busy)} onClick={() => void reload()}>Reload saved profile</button></div></>}</dialog>
  </div>;
}
