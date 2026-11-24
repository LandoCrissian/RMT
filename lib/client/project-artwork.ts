'use client';

import { ARTWORK_BYTE_LIMIT, validateArtworkImage, type ArtworkKind } from '@/lib/project-artwork-validation';

/** Keep JPEG/WebP decoders in the browser. The server stores fully validated PNG only. */
export async function prepareArtworkUpload(file: File, kind: ArtworkKind, signal?: AbortSignal): Promise<Blob> {
  signal?.throwIfAborted();
  const source = await validateArtworkImage(new Uint8Array(await file.arrayBuffer()),file.type,kind);
  signal?.throwIfAborted();
  if (source.mime === 'image/png') return new Blob([Uint8Array.from(source.bytes).buffer],{type: 'image/png'});

  const sourceUrl = URL.createObjectURL(new Blob([Uint8Array.from(source.bytes).buffer],{type: source.mime}));
  const image = new Image();
  try {
    await new Promise<void>((resolve,reject) => {
      const finish = (error?: Error) => { image.onload = null; image.onerror = null; signal?.removeEventListener('abort',abort); error ? reject(error) : resolve(); };
      const abort = () => finish(new DOMException('Image processing cancelled.','AbortError'));
      image.onload = () => finish();
      image.onerror = () => finish(new Error('This image could not be opened. Export a fresh PNG, JPEG, or WebP and try again.'));
      signal?.addEventListener('abort',abort,{once: true});
      image.src = sourceUrl;
    });
    signal?.throwIfAborted();
    if (image.naturalWidth !== source.width || image.naturalHeight !== source.height) throw new Error('This image’s dimensions are inconsistent. Export a fresh image and try again.');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare this image. Try a PNG file or another browser.');
    const minimumScale = kind === 'logo' ? 128 / source.width : Math.max(600 / source.width,300 / source.height);
    let scale = Math.max(minimumScale,Math.min(1,(kind === 'logo' ? 512 : 1600) / source.width,1000 / source.height));
    for (let attempt = 0; attempt < 10; attempt++) {
      signal?.throwIfAborted();
      canvas.width = Math.round(source.width * scale); canvas.height = Math.round(source.height * scale);
      if (kind === 'banner') {
        canvas.width = Math.max(600,canvas.width); canvas.height = Math.max(300,canvas.height);
        if (canvas.width / canvas.height < 1.5) canvas.width = Math.ceil(canvas.height * 1.5);
        if (canvas.width / canvas.height > 4) canvas.height = Math.ceil(canvas.width / 4);
      }
      context.drawImage(image,0,0,canvas.width,canvas.height);
      const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('This image could not be prepared. Try a PNG file.')),'image/png'));
      signal?.throwIfAborted();
      if (blob.size <= ARTWORK_BYTE_LIMIT) {
        const verified = await validateArtworkImage(new Uint8Array(await blob.arrayBuffer()),'image/png',kind);
        return new Blob([Uint8Array.from(verified.bytes).buffer],{type: 'image/png'});
      }
      if (scale <= minimumScale) break;
      scale = Math.max(minimumScale,scale * .8);
    }
    throw new Error('This image is too detailed to fit. Export a smaller image and try again.');
  } finally { image.src = ''; URL.revokeObjectURL(sourceUrl); }
}
