import {sha256} from '@noble/hashes/sha256';
import {bytesToHex} from '@noble/hashes/utils';
import {archiveFrameMax, frame, type RecoveryFrame} from './recovery-archive';
import type {captureDatabase} from './recovery-snapshot';

const encoder=new TextEncoder();
const blockSize=192 * 1024;
const maxObjects=256;
const maxArtworkBytes=128 * 1024 * 1024;
const maxObjectBytes=12 * 1024 * 1024;

export async function* databaseFrames(snapshot:Awaited<ReturnType<typeof captureDatabase>>):AsyncGenerator<RecoveryFrame> {
  const {startedAt,completedAt,schema,tables}=snapshot;
  yield frame(1,{startedAt,completedAt,schema,tables:tables.map(({name,columns,rowidAlias,rows})=>({name,columns,rowidAlias,count:rows.length}))});
  for (const table of tables) {
    yield frame(2,{name:table.name});
    const lines=encoder.encode(table.rows.length ? table.rows.join('\n')+'\n' : '');
    for(let offset=0;offset<lines.length;offset+=blockSize) yield {type:3,bytes:lines.subarray(offset,offset+blockSize)};
  }
  yield frame(255,{tables:tables.length,rows:tables.reduce((sum,table)=>sum+table.rows.length,0)});
}

type Listed={key:string;version:string;etag:string;size:number};
function sameObject(a:Listed,b:Listed) {
  return a.key===b.key && a.version===b.version && a.etag===b.etag && a.size===b.size;
}
async function inventory(bucket:R2Bucket,active:()=>boolean) {
  const objects=new Map<string,Listed>();
  const cursors=new Set<string>();
  let cursor:string|undefined;
  let bytes=0;
  do {
    if(!active() || cursors.size>maxObjects) throw new Error('R2 inventory incomplete');
    const page:R2Objects=await bucket.list({limit:64,cursor});
    for (const object of page.objects) {
      if (!object.key || !object.version || !object.etag || !Number.isSafeInteger(object.size) || object.size<0 ||
          object.size>maxObjectBytes || objects.has(object.key)) throw new Error('Invalid or changed R2 inventory');
      const {key,version,etag,size}=object;
      objects.set(key,{key,version,etag,size});
      bytes+=size;
      if(objects.size>maxObjects || bytes>maxArtworkBytes) throw new Error('Artwork exceeds bounded transfer capacity');
    }
    cursor=page.truncated ? page.cursor : undefined;
    if (page.truncated && (!cursor || cursors.has(cursor))) throw new Error('R2 inventory cursor is incomplete');
    if (cursor) cursors.add(cursor);
  } while(cursor);
  return {objects,bytes};
}

export async function prepareArtwork(bucket:R2Bucket,active:()=>boolean) {
  const startedAt=new Date().toISOString();
  const head=await inventory(bucket,active);
  return async function* artworkFrames():AsyncGenerator<RecoveryFrame> {
    yield frame(10,{startedAt,objects:head.objects.size,bytes:head.bytes});
    for(const expected of head.objects.values()) {
      if(!active()) throw new Error('Artwork transfer window ended');
      const object=await bucket.get(expected.key,{onlyIf:{etagMatches:expected.etag}});
      if(!object || !('body' in object) || !sameObject(expected,object)) {
        if(object && 'body' in object) await object.body.cancel();
        throw new Error('Artwork changed during transfer');
      }
      const header=frame(11,{...expected,uploaded:object.uploaded.toISOString(),httpMetadata:object.httpMetadata,customMetadata:object.customMetadata});
      if (header.bytes.length>archiveFrameMax) {
        await object.body.cancel();
        throw new Error('Artwork metadata exceeds bounded transfer capacity');
      }
      const hash=sha256.create();
      const reader=object.body.getReader();
      let size=0;
      let complete=false;
      try {
        yield header;
        for(;;) {
          if(!active()) throw new Error('Artwork transfer window ended');
          const chunk=await reader.read();
          if(chunk.done){complete=true;break;}
          size+=chunk.value.length;
          if(size>expected.size) throw new Error('Artwork bytes do not match inventory');
          hash.update(chunk.value);
          for(let offset=0;offset<chunk.value.length;offset+=blockSize) {
            const bytes=new Uint8Array(new ArrayBuffer(Math.min(blockSize,chunk.value.length-offset)));
            bytes.set(chunk.value.subarray(offset,offset+blockSize));
            yield {type:12,bytes};
          }
        }
      } finally {
        try {if(!complete) await reader.cancel();} finally {reader.releaseLock();}
      }
      if(size!==expected.size) throw new Error('Artwork bytes do not match inventory');
      yield frame(13,{size,sha256:bytesToHex(hash.digest())});
    }
    const tail=await inventory(bucket,active);
    if(tail.bytes!==head.bytes || tail.objects.size!==head.objects.size ||
       [...head.objects.values()].some(entry=>!tail.objects.has(entry.key) || !sameObject(entry,tail.objects.get(entry.key)!))) {
      throw new Error('Artwork inventory changed during transfer');
    }
    yield frame(255,{completedAt:new Date().toISOString(),objects:head.objects.size,bytes:head.bytes});
  };
}
