const encoder = new TextEncoder();
const magic = encoder.encode('RMTREC1\n');
export const archiveFrameMax = 512 * 1024;
export type RecoveryKind = 'database' | 'artwork';
export type RecoveryFrame = { type:number; bytes:Uint8Array<ArrayBuffer> };
export const frame = (type:number, value:unknown):RecoveryFrame => ({type,bytes:encoder.encode(JSON.stringify(value))});
const toBase64 = (bytes:Uint8Array) => btoa(String.fromCharCode(...bytes));

function buffer(size:number) { return new Uint8Array(new ArrayBuffer(size)); }

export async function recoveryPublicKey(encoded:string) {
  if (encoded.length>1_500 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Invalid recovery public key');
  const bytes = Uint8Array.from(atob(encoded),ch=>ch.charCodeAt(0));
  const key=await crypto.subtle.importKey('spki',bytes,{name:'RSA-OAEP',hash:'SHA-256'},false,['wrapKey']);
  if ((key.algorithm as RsaHashedKeyAlgorithm).modulusLength<3072) throw new Error('Recovery public key is too small');
  return key;
}

export async function encryptedRecoveryStream(publicKey:CryptoKey, captureId:string, kind:RecoveryKind,
  frames:AsyncGenerator<RecoveryFrame>, active:()=>boolean) {
  const aes=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);
  const wrapped=new Uint8Array(await crypto.subtle.wrapKey('raw',aes,publicKey,'RSA-OAEP'));
  const nonce=crypto.getRandomValues(buffer(8));
  const header=encoder.encode(JSON.stringify({captureId,kind,wrap:'RSA-OAEP-SHA256',cipher:'AES-256-GCM',
    nonce:toBase64(nonce),key:toBase64(wrapped)}));
  const preamble=buffer(magic.length+4+header.length);
  preamble.set(magic);
  new DataView(preamble.buffer).setUint32(magic.length,header.length);
  preamble.set(header,magic.length+4);
  const aad=buffer(preamble.length+4);
  aad.set(preamble);
  let counter=0;
  return new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(preamble); },
    async pull(controller) {
      try {
        if (!active() || counter>=0xffff_ffff) throw new Error('Recovery transfer window ended');
        const next=await frames.next();
        if (!active()) throw new Error('Recovery transfer window ended');
        if (next.done) { controller.close(); return; }
        if (next.value.bytes.length>archiveFrameMax) throw new Error('Recovery frame exceeded limit');
        const iv=buffer(12);
        iv.set(nonce);
        new DataView(iv.buffer).setUint32(8,counter);
        new DataView(aad.buffer).setUint32(preamble.length,counter++);
        const plain=buffer(next.value.bytes.length+1);
        plain[0]=next.value.type;
        plain.set(next.value.bytes,1);
        const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},aes,plain));
        if (!active()) throw new Error('Recovery transfer window ended');
        const encrypted=buffer(ciphertext.length+4);
        new DataView(encrypted.buffer).setUint32(0,ciphertext.length);
        encrypted.set(ciphertext,4);
        controller.enqueue(encrypted);
      } catch {
        controller.error(new Error('Recovery transfer did not complete'));
        try { await frames.return(undefined); } catch {}
      }
    },
    async cancel() { try { await frames.return(undefined); } catch {} },
  });
}
