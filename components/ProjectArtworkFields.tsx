'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, LoaderCircle, RotateCcw, Trash2, Upload } from 'lucide-react';
import type { Project, PublicArtwork } from '@/lib/catalog';
import { prepareArtworkUpload } from '@/lib/client/project-artwork';
import { readApiResponse } from './studio-shared';
import './project-artwork.css';

type Kind = 'logo' | 'banner';
type UploadedArtwork = {id: string; kind: Kind; width: number; height: number; mime: string; byteSize: number; createdAt: number};
export type ArtworkSelection = {logoAssetId: string | null; bannerAssetId: string | null};

/** Private previews use the existing authenticated session and temporary local image URLs. */
export function ArtworkPreview({assetId,publicImage,kind,emptyLabel = 'No uploaded image'}: {
  assetId?: string | null; publicImage?: PublicArtwork; kind: Kind; emptyLabel?: string;
}) {
  const [preview,setPreview] = useState<{id: string; url: string; failed: boolean}>({id: '',url: '',failed: false});
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = '';
    if (!assetId) { setPreview({id: '',url: '',failed: false}); return; }
    if (publicImage?.id === assetId) {
      setPreview({id: assetId,url: publicImage.url,failed: false}); return;
    }
    setPreview({id: assetId,url: '',failed: false});
    void (async () => {
      try {
        const response = await fetch('/api/project-artwork/' + encodeURIComponent(assetId),{cache: 'no-store',credentials: 'same-origin',redirect: 'error',signal: controller.signal});
        if (!response.ok || !/^image\/(png|jpeg|webp)$/.test(response.headers.get('content-type') ?? '')) throw new Error('Preview unavailable');
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({id: assetId,url: objectUrl,failed: false});
      } catch {
        if (!controller.signal.aborted) setPreview({id: assetId,url: '',failed: true});
      }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  },[assetId,publicImage?.id,publicImage?.url]);
  const active = preview.id === assetId ? preview : {url: '',failed: false};
  return <div className={`pa-preview pa-preview-${kind}`}>
    {assetId && active.url && !active.failed ? <img src={active.url} alt={`Proposed project ${kind}`} decoding="async" onError={() => setPreview(previous => ({...previous,failed: true}))} />
      : assetId && !active.failed ? <span className="pa-preview-message"><LoaderCircle size={20} className="st-spin" /> Loading image…</span>
      : <span className="pa-preview-message"><ImagePlus size={24} />{active.failed ? 'Image preview unavailable. Refresh to try again.' : emptyLabel}</span>}
  </div>;
}

export default function ProjectArtworkFields({projectId,currentArtwork,value,onChange,onBusyChange,disabled = false}: {
  projectId: string; currentArtwork?: Project['artwork']; value: ArtworkSelection;
  onChange: (value: ArtworkSelection) => void; onBusyChange: (busy: boolean) => void; disabled?: boolean;
}) {
  const [uploads,setUploads] = useState<UploadedArtwork[]>([]);
  const [busy,setBusy] = useState<Kind | null>(null);
  const [error,setError] = useState('');
  const [listError,setListError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);
  const selectionRef = useRef(value); selectionRef.current = value;
  useEffect(() => {
    onBusyChange(Boolean(busy));
    return () => onBusyChange(false);
  },[busy,onBusyChange]);
  useEffect(() => {
    const controller = new AbortController();
    setUploads([]); setError(''); setListError('');
    void fetch('/api/project-artwork?projectId=' + encodeURIComponent(projectId),{cache: 'no-store',credentials: 'same-origin',redirect: 'error',signal: controller.signal})
      .then(readApiResponse).then(data => { if (!controller.signal.aborted) setUploads(Array.isArray(data.artwork) ? data.artwork as UploadedArtwork[] : []); })
      .catch(() => { if (!controller.signal.aborted) setListError('Previously uploaded images could not be loaded. You can retry by reopening this project.'); });
    return () => { controller.abort(); controllerRef.current?.abort(); };
  },[projectId]);

  async function upload(kind: Kind, file?: File) {
    if (!file || busy || disabled) return;
    setError('');
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) { setError('Choose a PNG, JPEG, or WebP image. Animated images are not supported.'); return; }
    if (file.size > 2 * 1024 * 1024) { setError('Choose an image smaller than 2 MB.'); return; }
    const controller = new AbortController(); controllerRef.current = controller; setBusy(kind);
    try {
      const prepared = await prepareArtworkUpload(file,kind,controller.signal);
      const query = new URLSearchParams({projectId,kind});
      const data = await readApiResponse(await fetch('/api/project-artwork?' + query,{method: 'POST',credentials: 'same-origin',redirect: 'error',headers: {'Content-Type': prepared.type},body: prepared,signal: controller.signal}));
      const artwork = data.artwork as UploadedArtwork | undefined;
      if (!artwork?.id || artwork.kind !== kind) throw new Error('The image could not be confirmed. Try again.');
      if (controller.signal.aborted) return;
      setUploads(previous => [artwork,...previous.filter(item => item.id !== artwork.id)]);
      onChange({...selectionRef.current,[`${kind}AssetId`]: artwork.id});
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'This image could not be uploaded.');
    } finally {
      if (!controller.signal.aborted) setBusy(null);
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  return <section className="pa-fields" aria-busy={Boolean(busy)} aria-labelledby="project-artwork-heading">
    <div className="st-section-heading st-section-divider"><div><h2 id="project-artwork-heading">Make it yours</h2></div><span className="pa-free">Free · reviewed before publishing</span></div>
    <p className="st-panel-intro">Give your project a clear identity. Your approved banner appears on your RMT page and on new links shared to 𝕏. Uploading saves a private preview; submit your changes below to send it for review.</p>
    <div className="pa-grid">{(['logo','banner'] as const).map(kind => {
      const key = `${kind}AssetId` as const, id = value[key], published = currentArtwork?.[kind];
      const selected = uploads.find(item => item.id === id);
      const changed = id !== (published?.id ?? null);
      return <section className={`pa-field pa-field-${kind}`} key={kind} aria-label={`Project ${kind}`}>
        <div className="pa-field-heading"><h3>{kind === 'logo' ? 'Project logo' : 'Project & share banner'}</h3><span>{changed ? 'Needs review' : published ? 'Published' : 'Optional'}</span></div>
        <ArtworkPreview assetId={id} publicImage={published} kind={kind} emptyLabel={published && !id ? 'Remove this uploaded image after approval' : kind === 'logo' ? 'A square mark for your project' : 'Your project, ready to share'} />
        <p className="pa-dimensions">{selected ? `${selected.width} × ${selected.height} · ${Math.ceil(selected.byteSize / 1024)} KB` : published && id === published.id ? `${published.width} × ${published.height}` : kind === 'logo' ? 'Square · at least 128 × 128 px' : 'Recommended 1200 × 630 px'}</p>
        <label className={`st-button st-secondary pa-upload ${(busy || disabled) ? 'pa-disabled' : ''}`}>
          {busy === kind ? <LoaderCircle size={15} className="st-spin" /> : <Upload size={15} />}{busy === kind ? 'Uploading…' : id ? 'Replace image' : 'Upload image'}
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(busy) || disabled} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void upload(kind,file); }} aria-label={`Upload project ${kind}`} />
        </label>
        {uploads.some(item => item.kind === kind && item.id !== id) && <label className="st-field pa-reuse">Use a previous upload<select value={uploads.some(item => item.id === id) ? id ?? '' : ''} disabled={Boolean(busy) || disabled} onChange={event => { if (event.target.value) onChange({...value,[key]: event.target.value}); }}><option value="">Choose an uploaded image</option>{uploads.filter(item => item.kind === kind).map(item => <option value={item.id} key={item.id}>{item.width} × {item.height} · {new Date(item.createdAt).toLocaleDateString()} · {item.id.slice(0,6)}</option>)}</select></label>}
        <div className="pa-image-actions">{id && <button type="button" className="st-text-button" disabled={Boolean(busy) || disabled} onClick={() => onChange({...value,[key]: null})}><Trash2 size={13} /> Remove upload</button>}{changed && <button type="button" className="st-text-button" disabled={Boolean(busy) || disabled} onClick={() => onChange({...value,[key]: published?.id ?? null})}><RotateCcw size={13} /> Undo change</button>}</div>
      </section>;
    })}</div>
    <p className="pa-guidance">PNG, JPEG, or WebP · up to 2 MB each · still images only. Images are prepared for the preview before upload. Banners need at least 600 × 300 px with a wide aspect ratio. Maximum 4096 px per side. You can upload 8 images per day; reuse any of your recent uploads.</p>
    {listError && <p className="st-hint">{listError}</p>}{error && <p className="st-error" role="alert">{error}</p>}
  </section>;
}
