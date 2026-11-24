'use client';

import { useEffect, useRef } from 'react';
import { ArrowUpRight, Copy, MousePointer2, X } from 'lucide-react';

type LinkOptionsProps = {
  href: string;
  label: string;
  onCopy: (value: string, message: string) => Promise<void>;
};

export function LinkOptions({ href, label, onCopy }: LinkOptionsProps) {
  return <div className="link-options" role="group" aria-label={label + ' link options'}>
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={'Open ' + label + ' in a new tab'}><ArrowUpRight size={13} aria-hidden="true" /> New tab</a>
    <button type="button" onClick={() => void onCopy(href, 'Destination link copied.')} aria-label={'Copy ' + label + ' link'}><Copy size={12} aria-hidden="true" /> Copy</button>
  </div>;
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
