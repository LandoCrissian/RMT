import { InputError } from './submission-validation';

export type ArtworkKind = 'logo' | 'banner';
export type ArtworkMime = 'image/png' | 'image/jpeg' | 'image/webp';
export const ARTWORK_BYTE_LIMIT = 2 * 1024 * 1024;
export const ARTWORK_PIXEL_LIMIT = 8_000_000;
export const ARTWORK_SIDE_LIMIT = 4096;
export const ARTWORK_UPLOAD_LIMIT = 8;
export const ARTWORK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export type ValidatedArtwork = {bytes: Uint8Array; mime: ArtworkMime; width: number; height: number};

function invalid(message = 'This image is incomplete or unsupported. Export a fresh PNG, JPEG, or WebP and try again.'): never { throw new InputError(message); }
function u16(data: Uint8Array, at: number) { return (data[at] << 8) | data[at + 1]; }
function u32(data: Uint8Array, at: number) { return ((data[at] * 0x1000000) + (data[at + 1] << 16) + (data[at + 2] << 8) + data[at + 3]) >>> 0; }
function le24(data: Uint8Array, at: number) { return data[at] | (data[at + 1] << 8) | (data[at + 2] << 16); }
function le32(data: Uint8Array, at: number) { return (data[at] + data[at + 1] * 256 + data[at + 2] * 65536 + data[at + 3] * 16777216) >>> 0; }
function ascii(data: Uint8Array, start: number, end: number) { return String.fromCharCode(...data.subarray(start, end)); }
function combine(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
function bounds(width: number, height: number, kind: ArtworkKind) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > ARTWORK_SIDE_LIMIT || height > ARTWORK_SIDE_LIMIT || width * height > ARTWORK_PIXEL_LIMIT) invalid('Use an image no larger than 4096 pixels on either side and 8 million pixels in total.');
  if (kind === 'logo' && (width !== height || width < 128)) invalid('Use a square logo at least 128 × 128 pixels.');
  if (kind === 'banner' && (width < 600 || height < 300 || width / height < 1.5 || width / height > 4)) invalid('Use a landscape banner at least 600 × 300 pixels, between 1.5:1 and 4:1. We recommend 1200 × 630.');
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index; for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Uint8Array) { let value = 0xffffffff; for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0; }

async function png(data: Uint8Array, kind: ArtworkKind): Promise<ValidatedArtwork> {
  if (data.length < 45 || ![137,80,78,71,13,10,26,10].every((byte, i) => data[i] === byte)) invalid();
  let at = 8, width = 0, height = 0, depth = 0, channels = 0, color = -1, indexed = false, palette = false, paletteEntries = 0, transparency = false, ended = false, idatEnded = false;
  const clean = [data.subarray(0, 8)], compressed: Uint8Array[] = [];
  while (at < data.length) {
    if (at + 12 > data.length) invalid();
    const length = u32(data, at), type = ascii(data, at + 4, at + 8), end = at + 12 + length;
    if (end > data.length || !/^[A-Za-z]{4}$/.test(type) || type[2] !== type[2].toUpperCase() || crc32(data.subarray(at + 4, end - 4)) !== u32(data, end - 4)) invalid();
    if (['acTL','fcTL','fdAT'].includes(type)) invalid('Use a still image. Animated artwork is not supported.');
    if (at === 8 && type !== 'IHDR') invalid();
    if (type === 'IHDR') {
      if (at !== 8 || length !== 13) invalid();
      width = u32(data, at + 8); height = u32(data, at + 12); depth = data[at + 16];
      color = data[at + 17]; indexed = color === 3;
      const depths: Record<number, number[]> = {0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
      channels = ({0:1,2:3,3:1,4:2,6:4} as Record<number, number>)[color];
      if (!channels || !depths[color]?.includes(depth) || data[at + 18] !== 0 || data[at + 19] !== 0 || data[at + 20] !== 0) invalid('Export a standard, non-interlaced PNG, JPEG, or WebP.');
      bounds(width, height, kind);
    } else if (type === 'PLTE') {
      if (palette || transparency || compressed.length || ![2,3,6].includes(color) || !length || length % 3 || length > 768 || (indexed && length / 3 > 2 ** depth)) invalid();
      palette = true; paletteEntries = length / 3;
    } else if (type === 'IDAT') {
      if (idatEnded || (indexed && !palette)) invalid();
      compressed.push(data.subarray(at + 8, end - 4));
    } else if (type === 'IEND') {
      if (length || !compressed.length || end !== data.length) invalid();
      ended = true;
    } else {
      if (compressed.length) idatEnded = true;
      // Unknown critical chunks affect decoding; metadata is deliberately discarded.
      if (type[0] === type[0].toUpperCase()) invalid();
      if (type === 'tRNS') {
        if (transparency || compressed.length || ![0,2,3].includes(color)) invalid();
        if (indexed ? !palette || !length || length > paletteEntries : length !== (color === 0 ? 2 : 6)) invalid();
        if (!indexed) for (let sample = at + 8; sample < end - 4; sample += 2) if (u16(data,sample) >= 2 ** depth) invalid();
        transparency = true;
      }
    }
    if (['IHDR','PLTE','tRNS','IDAT','IEND'].includes(type)) clean.push(data.subarray(at, end));
    at = end;
  }
  if (!ended) invalid();
  const scanline = 1 + Math.ceil(width * channels * depth / 8), expected = scanline * height;
  // Stream inflation rather than allocating a decompressed multi-megabyte image.
  const inflated = new Blob([combine(compressed)]).stream().pipeThrough(new DecompressionStream('deflate'));
  const reader = inflated.getReader(); let count = 0, rowFill = 0;
  // Indexed PNGs also need valid palette references after reversing row filters.
  // Keep at most two scanlines in memory, never an entire decoded bitmap.
  const row = indexed ? new Uint8Array(scanline) : null;
  const previous = indexed ? new Uint8Array(scanline - 1) : null;
  function inspectIndexedRow() {
    if (!row || !previous) return;
    const filter = row[0];
    for (let index = 0; index < previous.length; index++) {
      const left = index ? row[index] : 0, above = previous[index], diagonal = index ? previous[index - 1] : 0;
      const predictor = left + above - diagonal;
      const a = Math.abs(predictor - left), b = Math.abs(predictor - above), c = Math.abs(predictor - diagonal);
      const paeth = a <= b && a <= c ? left : b <= c ? above : diagonal;
      const adjustment = filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : filter === 4 ? paeth : 0;
      row[index + 1] = (row[index + 1] + adjustment) & 255;
    }
    const mask = 2 ** depth - 1;
    for (let pixel = 0; pixel < width; pixel++) {
      const bit = pixel * depth, index = (row[1 + Math.floor(bit / 8)] >>> (8 - depth - bit % 8)) & mask;
      if (index >= paletteEntries) invalid();
    }
    previous.set(row.subarray(1));
  }
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      if (count + value.length > expected) { await reader.cancel(); invalid(); }
      for (let index = (scanline - count % scanline) % scanline; index < value.length; index += scanline) if (value[index] > 4) { await reader.cancel(); invalid(); }
      if (row) {
        let offset = 0;
        while (offset < value.length) {
          const length = Math.min(scanline - rowFill,value.length - offset);
          row.set(value.subarray(offset,offset + length),rowFill); rowFill += length; offset += length;
          if (rowFill === scanline) { inspectIndexedRow(); rowFill = 0; }
        }
      }
      count += value.length;
    }
  } catch { await reader.cancel().catch(() => {}); invalid(); }
  if (count !== expected) invalid();
  return {bytes: combine(clean), mime: 'image/png', width, height};
}

function jpeg(data: Uint8Array, kind: ArtworkKind): ValidatedArtwork {
  if (data.length < 20 || data[0] !== 255 || data[1] !== 216) invalid();
  let at = 2, width = 0, height = 0, sawFrame = false, sawScan = false, ended = false;
  const clean = [data.subarray(0, 2)];
  while (at < data.length) {
    const start = at;
    if (data[at++] !== 255) invalid();
    while (data[at] === 255) at++;
    const marker = data[at++];
    if (marker === 217) {
      if (at !== data.length || !sawFrame || !sawScan) invalid();
      clean.push(new Uint8Array([255,217])); ended = true; break;
    }
    if (at + 2 > data.length) invalid();
    const length = u16(data, at), end = at + length;
    if (length < 2 || end > data.length) invalid();
    const metadata = (marker >= 224 && marker <= 239) || marker === 254;
    if (marker === 192 || marker === 194) {
      if (sawFrame || length < 8 || data[at + 2] !== 8 || ![1,3].includes(data[at + 7]) || length !== 8 + data[at + 7] * 3) invalid();
      height = u16(data, at + 3); width = u16(data, at + 5); bounds(width, height, kind); sawFrame = true;
    } else if (![218,219,196,221].includes(marker) && !metadata) invalid();
    if (!metadata) clean.push(data.subarray(start, end));
    at = end;
    if (marker === 218) {
      if (!sawFrame || length < 6) invalid();
      sawScan = true; const scanStart = at;
      while (at < data.length) {
        if (data[at] !== 255) { at++; continue; }
        const next = data[at + 1];
        if (next === 0 || (next >= 208 && next <= 215)) { at += 2; continue; }
        break;
      }
      if (at === scanStart) invalid();
      clean.push(data.subarray(scanStart, at));
    }
  }
  if (!ended) invalid();
  return {bytes: combine(clean), mime: 'image/jpeg', width, height};
}

function webp(data: Uint8Array, kind: ArtworkKind): ValidatedArtwork {
  if (data.length < 20 || ascii(data, 0, 4) !== 'RIFF' || ascii(data, 8, 12) !== 'WEBP' || le32(data, 4) + 8 !== data.length) invalid();
  let at = 12, width = 0, height = 0, declaredWidth = 0, declaredHeight = 0, imageCount = 0;
  const clean: Uint8Array[] = [];
  while (at < data.length) {
    if (at + 8 > data.length) invalid();
    const type = ascii(data, at, at + 4), length = le32(data, at + 4), end = at + 8 + length, paddedEnd = end + (length % 2);
    if (paddedEnd > data.length || (length % 2 && data[end] !== 0)) invalid();
    const chunk = data.subarray(at + 8, end);
    if (['ANIM','ANMF'].includes(type)) invalid('Use a still image. Animated artwork is not supported.');
    if (type === 'VP8X') {
      if (at !== 12 || length !== 10 || chunk[0] & 0x02 || (chunk[0] & 0xc1) || chunk[1] || chunk[2] || chunk[3]) invalid('Use a still PNG, JPEG, or WebP image.');
      declaredWidth = 1 + le24(chunk, 4); declaredHeight = 1 + le24(chunk, 7); bounds(declaredWidth, declaredHeight, kind);
      const normalized = data.slice(at, paddedEnd); normalized[8] &= 0x10; clean.push(normalized);
    } else if (type === 'VP8 ' || type === 'VP8L') {
      if (++imageCount !== 1) invalid();
      if (type === 'VP8 ') {
        if (length < 11 || (chunk[0] & 1) || chunk[3] !== 0x9d || chunk[4] !== 1 || chunk[5] !== 0x2a || (le24(chunk,0) >>> 5) > length - 3) invalid();
        width = (chunk[6] | chunk[7] << 8) & 0x3fff; height = (chunk[8] | chunk[9] << 8) & 0x3fff;
      } else {
        if (length < 6 || chunk[0] !== 0x2f || (chunk[4] & 0xe0)) invalid();
        const bits = le32(chunk,1); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
      }
      bounds(width, height, kind); clean.push(data.subarray(at, paddedEnd));
    } else if (type === 'ALPH') {
      if (!declaredWidth || imageCount || length < 2 || chunk[0] & 0xc0) invalid();
      clean.push(data.subarray(at, paddedEnd));
    } else if (!['ICCP','EXIF','XMP '].includes(type)) invalid();
    at = paddedEnd;
  }
  if (imageCount !== 1 || (declaredWidth && (width !== declaredWidth || height !== declaredHeight))) invalid();
  const bytes = combine([data.subarray(0,12), ...clean]);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  return {bytes, mime: 'image/webp', width, height};
}

/** Parse complete containers; remove non-render metadata and never trust a file extension. */
export async function validateArtworkImage(data: Uint8Array, mime: string, kind: ArtworkKind): Promise<ValidatedArtwork> {
  if (!['logo','banner'].includes(kind)) invalid('Choose a logo or banner.');
  if (!data.length || data.length > ARTWORK_BYTE_LIMIT) throw new InputError('Use an image smaller than 2 MB.', 413);
  if (mime === 'image/png') return png(data,kind);
  if (mime === 'image/jpeg') return jpeg(data,kind);
  if (mime === 'image/webp') return webp(data,kind);
  throw new InputError('Upload a PNG, JPEG, or WebP image. SVG and animated images are not supported.', 415);
}
