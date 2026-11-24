import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import sharp from 'sharp';

// This adapter exercises the conversion orchestration with real image decoding.
// It does not claim to reproduce browser rendering or replace browser UI testing.
const root = fileURLToPath(new URL('../',import.meta.url));
const compiled = await build({stdin: {contents: `export * from './lib/client/project-artwork'; export {validateArtworkImage,ARTWORK_BYTE_LIMIT} from './lib/project-artwork-validation';`,resolveDir: root,loader: 'ts'},absWorkingDir: root,bundle: true,write: false,platform: 'node',format: 'esm',target: 'node24'});
const api = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const logo = await sharp({create: {width: 256,height: 256,channels: 4,background: '#bdf74a'}}).png().toBuffer();

function browserAdapter(t,{holdDecode = false,failDecode = false,wrongDimensions = false,failCanvas = false} = {}) {
  const original = {Image: globalThis.Image,document: globalThis.document,create: URL.createObjectURL,revoke: URL.revokeObjectURL};
  const objects = new Map(),state = {created: [],revoked: [],draws: [],decodes: 0};
  let releaseDecode,started;
  const gate = new Promise(resolve => {releaseDecode = resolve;});
  state.decodeStarted = new Promise(resolve => {started = resolve;});
  state.releaseDecode = releaseDecode;
  URL.createObjectURL = blob => {const url = 'blob:local-artwork-' + state.created.length; objects.set(url,blob); state.created.push(url); return url;};
  URL.revokeObjectURL = url => {objects.delete(url); state.revoked.push(url);};
  globalThis.Image = class {
    naturalWidth = 0; naturalHeight = 0; onload = null; onerror = null;
    set src(url) {
      this.currentUrl = url;
      if (!url) return;
      void (async () => {
        try {
          const blob = objects.get(url); assert.ok(blob);
          this.bytes = Buffer.from(await blob.arrayBuffer());
          const decoded = await sharp(this.bytes).raw().toBuffer({resolveWithObject: true});
          state.decodes++; started();
          if (holdDecode) await gate;
          if (this.currentUrl !== url) return;
          if (failDecode) {this.onerror?.(); return;}
          this.naturalWidth = decoded.info.width + (wrongDimensions ? 1 : 0);
          this.naturalHeight = decoded.info.height;
          this.onload?.();
        } catch {started(); this.onerror?.();}
      })();
    }
  };
  globalThis.document = {createElement(tag) {
    assert.equal(tag,'canvas');
    const canvas = {width: 0,height: 0,image: null,getContext(kind) {
      assert.equal(kind,'2d');
      return {drawImage(image,_x,_y,width,height) {canvas.image = image; state.draws.push({width,height});}};
    },toBlob(callback,mime) {
      assert.equal(mime,'image/png');
      if (failCanvas) {queueMicrotask(() => callback(null)); return;}
      void sharp(canvas.image.bytes).resize(canvas.width,canvas.height,{fit: 'fill'}).png().toBuffer().then(bytes => callback(new Blob([bytes],{type: mime}))).catch(() => callback(null));
    }};
    return canvas;
  }};
  t.after(() => {
    releaseDecode();
    URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke;
    if (original.Image === undefined) delete globalThis.Image; else globalThis.Image = original.Image;
    if (original.document === undefined) delete globalThis.document; else globalThis.document = original.document;
  });
  return state;
}

test('JPEG and WebP uploads become genuine validated PNGs and release the temporary image URL',async t => {
  const state = browserAdapter(t);
  for (const [mime,bytes] of [['image/jpeg',await sharp(logo).jpeg().toBuffer()],['image/webp',await sharp(logo).webp().toBuffer()]]) {
    const output = await api.prepareArtworkUpload(new File([bytes],'project-logo',{type: mime}),'logo');
    assert.equal(output.type,'image/png');
    const normalized = new Uint8Array(await output.arrayBuffer());
    assert.deepEqual([...normalized.slice(0,8)],[137,80,78,71,13,10,26,10]);
    const verified = await api.validateArtworkImage(normalized,'image/png','logo');
    assert.equal(verified.width,256); assert.equal(verified.height,256);
    assert.equal((await sharp(normalized).metadata()).format,'png');
  }
  assert.equal(state.decodes,2);
  assert.deepEqual(state.revoked,state.created);
});

test('validated PNG needs no browser decoding and pre-cancelled work cannot create a preview',async t => {
  const state = browserAdapter(t),file = new File([logo],'logo.png',{type: 'image/png'});
  const output = await api.prepareArtworkUpload(file,'logo');
  assert.equal(output.type,'image/png'); assert.equal(state.decodes,0); assert.equal(state.created.length,0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api.prepareArtworkUpload(file,'logo',controller.signal),{name: 'AbortError'});
  assert.equal(state.created.length,0);
});

test('cancelling an in-progress decode rejects the upload and releases its object URL',async t => {
  const state = browserAdapter(t,{holdDecode: true}),controller = new AbortController();
  const file = new File([await sharp(logo).jpeg().toBuffer()],'logo.jpg',{type: 'image/jpeg'});
  const pending = api.prepareArtworkUpload(file,'logo',controller.signal);
  await state.decodeStarted;
  controller.abort();
  await assert.rejects(pending,{name: 'AbortError'});
  state.releaseDecode();
  assert.equal(state.draws.length,0);
  assert.deepEqual(state.revoked,state.created);
});

for (const scenario of [
  {name: 'a decoder failure',options: {failDecode: true},message: /could not be opened/},
  {name: 'mismatched decoded dimensions',options: {wrongDimensions: true},message: /dimensions are inconsistent/},
  {name: 'a failed PNG encoding',options: {failCanvas: true},message: /could not be prepared/},
]) test(scenario.name + ' never returns uploadable bytes',async t => {
  const state = browserAdapter(t,scenario.options);
  const file = new File([await sharp(logo).webp().toBuffer()],'logo.webp',{type: 'image/webp'});
  await assert.rejects(api.prepareArtworkUpload(file,'logo'),scenario.message);
  assert.deepEqual(state.revoked,state.created);
});

test('a detailed JPEG is reduced until the normalized PNG fits the upload limit',async t => {
  const state = browserAdapter(t),width = 2048,height = 1024;
  const raw = Buffer.alloc(width * height * 3); let random = 1;
  for (let index = 0; index < raw.length; index++) {random = (Math.imul(random,1664525) + 1013904223) >>> 0; raw[index] = random >>> 24;}
  const bytes = await sharp(raw,{raw: {width,height,channels: 3}}).jpeg({quality: 65}).toBuffer();
  assert.ok(bytes.length < api.ARTWORK_BYTE_LIMIT);
  const output = await api.prepareArtworkUpload(new File([bytes],'detailed-banner.jpg',{type: 'image/jpeg'}),'banner');
  assert.ok(output.size <= api.ARTWORK_BYTE_LIMIT);
  assert.ok(state.draws.length > 1,'conversion must try a smaller resolution after the first PNG exceeds the limit');
  const verified = await api.validateArtworkImage(new Uint8Array(await output.arrayBuffer()),'image/png','banner');
  assert.ok(verified.width >= 600); assert.ok(verified.height >= 300);
  assert.ok(verified.width < state.draws[0].width);
  assert.deepEqual(state.revoked,state.created);
});
