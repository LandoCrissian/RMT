import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import sharp from 'sharp';
import { deflateSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiled = await build({
  stdin: {contents: `export * from './lib/project-artwork-validation'; export {InputError} from './lib/submission-validation';`, resolveDir: root, loader: 'ts'},
  absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24',
});
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const rejection = status => error => error instanceof api.InputError && error.status === status;
const make = (width = 256, height = 256) => sharp({create: {width, height, channels: 4, background: {r: 130, g: 218, b: 80, alpha: 0.8}}});
const fixtures = {
  'image/png': await make().png().toBuffer(),
  'image/jpeg': await make().jpeg().toBuffer(),
  'image/webp': await make().webp().toBuffer(),
};

function checksum(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, content) {
  const body = Buffer.from(content);
  const chunk = Buffer.alloc(body.length + 12);
  chunk.writeUInt32BE(body.length, 0); chunk.write(type, 4, 4, 'ascii'); body.copy(chunk, 8);
  chunk.writeUInt32BE(checksum(chunk.subarray(4, -4)), chunk.length - 4);
  return chunk;
}
function pngChunks(bytes) {
  const chunks = [];
  for (let at = 8; at < bytes.length;) {
    const end = at + 12 + bytes.readUInt32BE(at);
    chunks.push({type: bytes.toString('ascii', at + 4, at + 8), bytes: bytes.subarray(at, end), data: bytes.subarray(at + 8, end - 4)});
    at = end;
  }
  return chunks;
}
function pngWithExtra(bytes, extra) { return Buffer.concat([bytes.subarray(0, 33), extra, bytes.subarray(33)]); }
function riff(chunks) {
  const body = Buffer.concat([Buffer.from('WEBP'), ...chunks]);
  const bytes = Buffer.alloc(body.length + 8);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(body.length, 4); body.copy(bytes, 8);
  return bytes;
}
function webpChunk(type, payload) {
  const body = Buffer.from(payload), bytes = Buffer.alloc(8 + body.length + body.length % 2);
  bytes.write(type, 0); bytes.writeUInt32LE(body.length, 4); body.copy(bytes, 8);
  return bytes;
}

function minimalPng({color = 3,depth = 1,palette = Buffer.from([30,50,80]),transparency,before = [],after = [],pixels,tail = Buffer.alloc(0)} = {}) {
  const header = Buffer.alloc(13); header.writeUInt32BE(128,0); header.writeUInt32BE(128,4); header[8] = depth; header[9] = color;
  const channels = {0: 1,2: 3,3: 1,4: 2,6: 4}[color];
  const rows = pixels ?? Buffer.alloc((1 + Math.ceil(128 * channels * depth / 8)) * 128);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),...before,
    ...(palette ? [pngChunk('PLTE',palette)] : []),...(transparency ? [pngChunk('tRNS',transparency)] : []),...after,
    pngChunk('IDAT',Buffer.concat([deflateSync(rows),tail])),pngChunk('IEND',Buffer.alloc(0))]);
}

test('PNG palette, transparency, reserved-bit and decoded palette bounds are strict',async () => {
  const valid = minimalPng();
  assert.equal((await api.validateArtworkImage(valid,'image/png','logo')).width,128);
  const invalidImages = [
    minimalPng({depth: 1,palette: Buffer.alloc(9)}),
    minimalPng({color: 0,depth: 8}),
    minimalPng({color: 4,depth: 8}),
    minimalPng({transparency: Buffer.from([255,0])}),
    minimalPng({before: [pngChunk('tRNS',Buffer.from([255]))]}),
    minimalPng({transparency: Buffer.from([255]),after: [pngChunk('tRNS',Buffer.from([255]))]}),
    minimalPng({color: 0,depth: 1,palette: null,transparency: Buffer.from([0,2])}),
    minimalPng({color: 0,depth: 8,palette: null,transparency: Buffer.from([0])}),
    minimalPng({color: 2,depth: 8,palette: null,transparency: Buffer.from([0,0])}),
    minimalPng({color: 2,depth: 8,palette: null,transparency: Buffer.from([1,0,0,0,0,0])}),
    minimalPng({color: 6,depth: 8,palette: null,transparency: Buffer.from([0,0])}),
    minimalPng({color: 2,depth: 8,palette: null,before: [pngChunk('tRNS',Buffer.alloc(6)),pngChunk('PLTE',Buffer.alloc(3))]}),
    pngWithExtra(valid,pngChunk('abca',Buffer.alloc(0))),
  ];
  const badPixels = Buffer.alloc(17 * 128); badPixels[1] = 128;
  invalidImages.push(minimalPng({pixels: badPixels}));
  for (const image of invalidImages) await assert.rejects(api.validateArtworkImage(image,'image/png','logo'),rejection(400));
});

test('PNG rejects junk and extra zlib streams inside otherwise valid IDAT chunks',async () => {
  for (const tail of [Buffer.from('trailing payload'),deflateSync(Buffer.from('extra image')),deflateSync(Buffer.alloc(0))]) {
    await assert.rejects(api.validateArtworkImage(minimalPng({tail}),'image/png','logo'),rejection(400));
  }
});

test('real PNG, JPEG and WebP files retain their actual dimensions and decode after validation', async () => {
  for (const [mime, bytes] of Object.entries(fixtures)) {
    const image = await api.validateArtworkImage(bytes, mime, 'logo');
    assert.equal(image.mime, mime);
    assert.equal(image.width, 256); assert.equal(image.height, 256);
    const decoded = await sharp(image.bytes, {failOn: 'warning'}).raw().toBuffer({resolveWithObject: true});
    assert.equal(decoded.info.width, 256); assert.equal(decoded.info.height, 256);
  }
  const progressive = await make().jpeg({progressive: true}).toBuffer();
  assert.equal((await api.validateArtworkImage(progressive, 'image/jpeg', 'logo')).width, 256);
  const lossless = await make().webp({lossless: true}).toBuffer();
  assert.equal((await api.validateArtworkImage(lossless, 'image/webp', 'logo')).height, 256);
  const banner = await make(1200, 630).png().toBuffer();
  assert.equal((await api.validateArtworkImage(banner, 'image/png', 'banner')).width, 1200);
});

test('declared MIME types cannot disguise another format, SVG, HTML or a GIF', async () => {
  for (const [mime, bytes] of Object.entries(fixtures)) {
    for (const other of Object.keys(fixtures).filter(value => value !== mime)) {
      await assert.rejects(api.validateArtworkImage(bytes, other, 'logo'), rejection(400));
    }
    for (const value of ['image/svg+xml', 'image/gif', 'text/html', 'image/png; charset=utf-8']) {
      await assert.rejects(api.validateArtworkImage(bytes, value, 'logo'), rejection(415));
    }
  }
  for (const body of ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', '<!doctype html><script>alert(1)</script>', 'GIF89a']) {
    for (const mime of Object.keys(fixtures)) await assert.rejects(api.validateArtworkImage(Buffer.from(body), mime, 'logo'), rejection(400));
  }
});

test('byte limits, logo proportions and banner dimensions are enforced before storage', async () => {
  await assert.rejects(api.validateArtworkImage(Buffer.alloc(0), 'image/png', 'logo'), rejection(413));
  await assert.rejects(api.validateArtworkImage(Buffer.alloc(api.ARTWORK_BYTE_LIMIT + 1), 'image/png', 'logo'), rejection(413));
  await assert.rejects(api.validateArtworkImage(fixtures['image/png'], 'image/png', 'other'), rejection(400));
  for (const [width, height, kind] of [[127,127,'logo'], [256,255,'logo'], [599,300,'banner'], [600,299,'banner'], [600,500,'banner'], [1500,300,'banner'], [4097,1025,'banner'], [3000,3000,'logo']]) {
    const image = await make(width, height).png().toBuffer();
    await assert.rejects(api.validateArtworkImage(image, 'image/png', kind), rejection(400), `${width}x${height} ${kind}`);
  }
});

test('container truncation, declared chunk corruption and trailing polyglot data are rejected', async () => {
  for (const [mime, bytes] of Object.entries(fixtures)) {
    for (const cut of [1, 7, Math.floor(bytes.length / 2), bytes.length - 1]) {
      await assert.rejects(api.validateArtworkImage(bytes.subarray(0, cut), mime, 'logo'), rejection(400));
    }
    const withScript = Buffer.concat([bytes, Buffer.from('<script>alert("trailing")</script>')]);
    await assert.rejects(api.validateArtworkImage(withScript, mime, 'logo'), rejection(400));
  }
  const png = Buffer.from(fixtures['image/png']); png.writeUInt32BE(0xffffffff, 8);
  await assert.rejects(api.validateArtworkImage(png, 'image/png', 'logo'), rejection(400));
  const webp = Buffer.from(fixtures['image/webp']); webp.writeUInt32LE(0xffffffff, 4);
  await assert.rejects(api.validateArtworkImage(webp, 'image/webp', 'logo'), rejection(400));
  const jpeg = Buffer.from(fixtures['image/jpeg']); jpeg.writeUInt16BE(0xffff, 4);
  await assert.rejects(api.validateArtworkImage(jpeg, 'image/jpeg', 'logo'), rejection(400));
});

test('PNG verifies CRCs, zlib image content and still-image chunk restrictions', async () => {
  const bytes = fixtures['image/png'];
  const badCrc = Buffer.from(bytes); badCrc[29] ^= 1;
  await assert.rejects(api.validateArtworkImage(badCrc, 'image/png', 'logo'), rejection(400));
  const chunks = pngChunks(bytes);
  const badZlib = Buffer.concat([bytes.subarray(0, 8), ...chunks.map(chunk => chunk.type === 'IDAT' ? pngChunk('IDAT', Buffer.from([0,0,0,0])) : chunk.bytes)]);
  await assert.rejects(api.validateArtworkImage(badZlib, 'image/png', 'logo'), rejection(400));
  const animationControl = Buffer.alloc(8); animationControl.writeUInt32BE(2, 0);
  for (const chunk of [pngChunk('acTL', animationControl), pngChunk('fcTL', Buffer.alloc(26)), pngChunk('fdAT', Buffer.alloc(10))]) {
    await assert.rejects(api.validateArtworkImage(pngWithExtra(bytes, chunk), 'image/png', 'logo'), rejection(400));
  }
  const critical = pngWithExtra(bytes, pngChunk('FAKE', Buffer.from('critical-data')));
  await assert.rejects(api.validateArtworkImage(critical, 'image/png', 'logo'), rejection(400));
});

test('animated WebP and incompatible declared canvas sizes are rejected', async () => {
  const pixels = Buffer.alloc(128 * 256 * 3);
  for (let index = 0; index < pixels.length; index += 3) pixels[index < pixels.length / 2 ? index : index + 1] = 200;
  const animated = await sharp(pixels, {raw: {width:128, height:256, channels:3, pageHeight:128}}).webp({loop:0, delay:[100,100]}).toBuffer();
  assert.equal((await sharp(animated, {animated: true}).metadata()).pages, 2);
  await assert.rejects(api.validateArtworkImage(animated, 'image/webp', 'logo'), rejection(400));
  const encoded = await make().removeAlpha().webp().toBuffer();
  const extended = Buffer.alloc(10); extended.writeUIntLE(255, 4, 3); extended.writeUIntLE(255, 7, 3);
  const animatedFlag = Buffer.from(extended); animatedFlag[0] = 2;
  await assert.rejects(api.validateArtworkImage(riff([webpChunk('VP8X', animatedFlag), encoded.subarray(12)]), 'image/webp', 'logo'), rejection(400));
  const wrongCanvas = Buffer.from(extended); wrongCanvas.writeUIntLE(511, 4, 3); wrongCanvas.writeUIntLE(511, 7, 3);
  await assert.rejects(api.validateArtworkImage(riff([webpChunk('VP8X', wrongCanvas), encoded.subarray(12)]), 'image/webp', 'logo'), rejection(400));
});

test('private textual metadata is stripped while the returned files remain decodable', async () => {
  const marker = 'rmt-private-metadata-marker';
  const png = pngWithExtra(fixtures['image/png'], pngChunk('tEXt', Buffer.from('Comment\0' + marker)));
  const app1 = Buffer.from('Exif\0\0' + marker), segment = Buffer.alloc(app1.length + 4);
  segment[0] = 255; segment[1] = 225; segment.writeUInt16BE(app1.length + 2, 2); app1.copy(segment, 4);
  const jpeg = Buffer.concat([fixtures['image/jpeg'].subarray(0,2), segment, fixtures['image/jpeg'].subarray(2)]);
  const encoded = await make().removeAlpha().webp().toBuffer();
  const canvas = Buffer.alloc(10); canvas[0] = 4; canvas.writeUIntLE(255, 4, 3); canvas.writeUIntLE(255, 7, 3);
  const webp = riff([webpChunk('VP8X', canvas), encoded.subarray(12), webpChunk('XMP ', Buffer.from(marker))]);
  for (const [mime, data] of [['image/png',png], ['image/jpeg',jpeg], ['image/webp',webp]]) {
    assert.equal(data.includes(marker), true);
    const checked = await api.validateArtworkImage(data, mime, 'logo');
    assert.equal(Buffer.from(checked.bytes).includes(marker), false, mime);
    const decoded = await sharp(checked.bytes, {failOn: 'warning'}).raw().toBuffer({resolveWithObject: true});
    assert.equal(decoded.info.width, 256); assert.equal(decoded.info.height, 256);
  }
});
