'use client';

import { useEffect, useRef } from 'react';
import { ArrowUpRight, Copy, Ellipsis, MousePointer2, X } from 'lucide-react';

export type DestinationLink = {href: string; label: string};

export function LinkOptions({ href, label, onOpen }: DestinationLink & {onOpen: (link: DestinationLink) => void}) {
  return <button type="button" className="link-options-trigger" aria-haspopup="dialog"
    aria-label={'Link options for ' + label} onClick={() => onOpen({href, label})}>
    <Ellipsis size={19} aria-hidden="true" />
  </button>;
}

export function DestinationDialog({ link, onClose, onCopy, onNavigate }: {
  link: DestinationLink | null;
  onNavigate?: (link:DestinationLink)=>void;
  onClose: () => void;
  onCopy: (value: string, message: string) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (link && !ref.current?.open) ref.current?.showModal();
    else if (!link && ref.current?.open) ref.current.close();
  }, [link]);

  return <dialog ref={ref} className="destination-dialog" aria-labelledby="link-options-title"
    onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    {link && <div>
      <button type="button" className="dialog-close" aria-label="Close link options" onClick={onClose}><X size={18} /></button>
      <h2 id="link-options-title">{link.label}</h2>
      <p>{link.href}</p>
      <a className="button button-outline" href={link.href} target="_blank" rel="noopener noreferrer" onClick={()=>{onNavigate?.(link);onClose();}}><ArrowUpRight size={16} /> Open in new tab</a>
      <button className="button button-outline" onClick={() => {onClose(); void onCopy(link.href, 'Destination link copied.');}}><Copy size={16} /> Copy link</button>
    </div>}
  </dialog>;
}

export function ManualCopyDialog({ value, onClose }: { value: string | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const linkRef = useRef<HTMLTextAreaElement>(null);

  function selectLink() {
    linkRef.current?.focus();
    linkRef.current?.select();
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (value) {
      if (!dialog.open) dialog.showModal();
      selectLink();
    } else if (dialog.open) dialog.close();
  }, [value]);

  return <dialog ref={dialogRef} className="copy-link-dialog" aria-labelledby="copy-link-title" aria-describedby="copy-link-description" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <button type="button" className="dialog-close" onClick={onClose} aria-label="Close copy link"><X size={19} /></button>
    <span className="copy-link-icon" aria-hidden="true"><Copy size={22} /></span>
    <h2 id="copy-link-title">Take the link with you.</h2>
    <p id="copy-link-description">This browser couldn’t copy automatically. Copy the selected link with your keyboard, or press and hold it on your phone. You can paste it into your browser.</p>
    <label htmlFor="manual-copy-url">LINK TO COPY</label>
    <textarea ref={linkRef} id="manual-copy-url" value={value || ''} readOnly rows={3} spellCheck={false} onFocus={event => event.currentTarget.select()} />
    <div className="copy-link-actions">
      <button type="button" className="button button-outline" onClick={selectLink}><MousePointer2 size={15} /> Select link</button>
      {value && <a className="button button-lime" href={value} target="_top" rel="noopener noreferrer">Open link <ArrowUpRight size={16} /></a>}
    </div>
  </dialog>;
}
