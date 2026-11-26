import {constants,createDecipheriv,createHash,generateKeyPairSync,privateDecrypt} from 'node:crypto';
import {chmodSync,closeSync,mkdirSync,openSync,readSync,rmSync,writeFileSync,writeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

const magic=Buffer.from('RMTREC1\n');
const cap=512*1024;
const fail=()=>{throw new Error('Invalid or incomplete recovery archive');};
const objectJSON=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ident=name=>'"'+name.replaceAll('"','""')+'"';
const shaPattern=/^[a-f0-9]{64}$/;

export function createRecoveryKey(privatePath) {
  const keys=generateKeyPairSync('rsa',{modulusLength:3072,
    publicKeyEncoding:{type:'spki',format:'der'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  writeFileSync(privatePath,keys.privateKey,{flag:'wx',mode:0o600});
  return {publicKey:keys.publicKey.toString('base64'),fingerprint:createHash('sha256').update(keys.publicKey).digest('hex')};
}

function* frames(path, privateKey, kind, headerRead) {
  const fd=openSync(path,'r');
  const exact=(n,allowEnd=false)=>{
    const bytes=Buffer.alloc(n);
    let used=0;
    while(used<n){
      const got=readSync(fd,bytes,used,n-used,null);
      if(!got) {if(!used&&allowEnd) return null;fail();}
      used+=got;
    }
    return bytes;
  };
  try {
    if(!exact(magic.length).equals(magic)) fail();
    const count=exact(4);
    const n=count.readUInt32BE();
    if(n<1||n>4096) fail();
    const rawHeader=exact(n);
    const header=objectJSON(rawHeader);
    const nonce=Buffer.from(header.nonce??'','base64');
    if(header.kind!==kind||header.cipher!=='AES-256-GCM'||header.wrap!=='RSA-OAEP-SHA256'||nonce.length!==8||
       typeof header.captureId!=='string'||!/^[-a-f0-9]{36}$/.test(header.captureId)) fail();
    const key=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(header.key,'base64'));
    if(key.length!==32) fail();
    try {
      headerRead(header.captureId);
      const aad=Buffer.concat([magic,count,rawHeader,Buffer.alloc(4)]);
      let i=0;
      for (;;) {
        const length=exact(4,true);
        if(!length||i>=0xffff_ffff) fail();
        const size=length.readUInt32BE();
        if(size<17||size>cap+17) fail();
        const cipher=exact(size);
        const iv=Buffer.concat([nonce,Buffer.alloc(4)]);
        iv.writeUInt32BE(i,8);
        aad.writeUInt32BE(i++,aad.length-4);
        const decrypt=createDecipheriv('aes-256-gcm',key,iv);
        decrypt.setAAD(aad);
        decrypt.setAuthTag(cipher.subarray(-16));
        const plain=Buffer.concat([decrypt.update(cipher.subarray(0,-16)),decrypt.final()]);
        if(plain[0]===255&&exact(1,true)!==null) fail();
        yield {type:plain[0],bytes:plain.subarray(1)};
        if(plain[0]===255) break;
      }
    } finally {key.fill(0);}
  } finally {closeSync(fd);}
}

function sqlValue(value){
  if(value===null) return {value:null,cast:false};
  if(typeof value!=='string'||!value.length) fail();
  const v=value.slice(1);
  if(value[0]==='i'&&/^-?\d+$/.test(v)) return {value:BigInt(v),cast:false};
  if(value[0]==='r') {
    const n=v==='Inf'?Infinity:v==='-Inf'?-Infinity:Number(v);
    if(v && !Number.isNaN(n)) return {value:n,cast:false};
  }
  if((value[0]==='t'||value[0]==='b')&&/^(?:[a-fA-F0-9]{2})*$/.test(v)) {
    return {value:Buffer.from(v,'hex'),cast:value[0]==='t'};
  }
  return fail();
}

function rowEncoding(column){
  const q=ident(column);
  return `json_quote(CASE typeof(${q}) WHEN 'null' THEN NULL WHEN 'integer' THEN 'i'||CAST(${q} AS TEXT) WHEN 'real' THEN 'r'||printf('%!.26g',${q}) WHEN 'text' THEN 't'||hex(CAST(${q} AS BLOB)) WHEN 'blob' THEN 'b'||hex(${q}) END)`;
}

function verifyDdl(db,entry) {
  if(!entry||!['table','index','view','trigger'].includes(entry.type)||typeof entry.sql!=='string') fail();
  const start=entry.type==='index'?/^CREATE\s+(?:UNIQUE\s+)?INDEX\s/i:new RegExp('^CREATE\\s+'+entry.type+'\\s','i');
  if(!start.test(entry.sql)) fail();
  const stmt=db.prepare(entry.sql);
  if(stmt.sourceSQL!==entry.sql) fail();
  stmt.run();
}

function restoreDatabase(path,privateKey,root,headerRead){
  const output=join(root,'rmt.sqlite');
  closeSync(openSync(output,'wx',0o600));
  const db=new DatabaseSync(output,{enableForeignKeyConstraints:false,allowExtension:false});
  let metadata,current,tableIndex=0,completed=false,total=0;
  const seen=new Set();
  const ledgers={};
  let appTables=0;
  try{
    db.exec('PRAGMA trusted_schema=OFF; BEGIN IMMEDIATE');
    const flush=()=>{
      if(!current) return;
      const {plan,blocks,columns}=current;
      const bytes=Buffer.concat(blocks);
      if(bytes.length&&bytes.at(-1)!==10) fail();
      const all=bytes.length?bytes.toString('ascii').slice(0,-1).split('\n'):[];
      if(all.length!==plan.count) fail();
      if(plan.name==='sqlite_sequence') db.exec('DELETE FROM sqlite_sequence');
      const inserts=new Map();
      for(const row of all){
        const cells=JSON.parse(row);
        if(!Array.isArray(cells)||cells.length!==columns.length) fail();
        const decoded=cells.map(sqlValue);
        const placeholders=decoded.map(cell=>cell.cast?'CAST(? AS TEXT)':'?').join(',');
        let stmt=inserts.get(placeholders);
        if(!stmt){stmt=db.prepare(`INSERT INTO ${ident(plan.name)}(${columns.map(ident).join(',')}) VALUES(${placeholders})`);inserts.set(placeholders,stmt);}
        stmt.run(...decoded.map(cell=>cell.value));
      }
      const query="'['||"+columns.map(rowEncoding).join("||','||")+"||']'";
      const actual=db.prepare(`SELECT ${query} AS wire FROM ${ident(plan.name)}`).all().map(row=>row.wire);
      // SQLite versions can print different trailing digits for the same IEEE-754 value.
      // Compare the Float64 bits, and retain exact encodings for all other storage classes.
      const normalize=row=>JSON.stringify(JSON.parse(row).map(value=>{
        if(typeof value!=='string'||value[0]!=='r') return value;
        const bits=Buffer.alloc(8);
        bits.writeDoubleBE(sqlValue(value).value);
        return 'r'+bits.toString('hex');
      }));
      if(!same(actual.map(normalize).sort(),all.map(normalize).sort())) throw new Error('Restored row content or storage type differs');
      if(['d1_migrations','__drizzle_migrations','__appgarden_migrations'].includes(plan.name)) ledgers[plan.name]=actual.length;
      else if(plan.name!=='sqlite_sequence') appTables++;
      total+=all.length;
      current=undefined;
    };

    for(const {type,bytes} of frames(path,privateKey,'database',headerRead)){
      if(type===1&&!metadata){
        metadata=objectJSON(bytes);
        if(!Array.isArray(metadata.schema)||!Array.isArray(metadata.tables)||!metadata.tables.length) fail();
        for(const entry of metadata.schema.filter(x=>x?.type==='table'&&x.name!=='sqlite_sequence')) verifyDdl(db,entry);
        continue;
      }
      if(!metadata) fail();
      if(type===2) {
        flush();
        const plan=metadata.tables[tableIndex++];
        if(!plan||plan.name!==objectJSON(bytes).name||typeof plan.name!=='string'||seen.has(plan.name)||
           !Number.isInteger(plan.count)||plan.count<0||plan.count>10_000||
           (plan.rowidAlias!==null&&!['_rowid_','rowid','oid'].includes(plan.rowidAlias))||
           !Array.isArray(plan.columns)||!plan.columns.length||plan.columns.some(name=>typeof name!=='string')) fail();
        seen.add(plan.name);
        current={plan,blocks:[],bytes:0,columns:plan.rowidAlias?[plan.rowidAlias,...plan.columns]:plan.columns};
      } else if(type===3&&current) {
        current.bytes+=bytes.length;
        if(current.bytes>9*1024*1024) fail();
        current.blocks.push(bytes);
      } else if(type===255){
        flush();
        const footer=objectJSON(bytes);
        if(tableIndex!==metadata.tables.length||footer.tables!==tableIndex||footer.rows!==total) fail();
        const tables=metadata.schema.filter(entry=>entry.type==='table').map(entry=>entry.name);
        if(!same([...seen].sort(),tables.sort())) fail();
        for(const entry of metadata.schema.filter(x=>x.type!=='table').sort((a,b)=>['index','view','trigger'].indexOf(a.type)-['index','view','trigger'].indexOf(b.type))) verifyDdl(db,entry);
        const actualSchema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type,name").all();
        if(!same(actualSchema,metadata.schema)) fail();
        if(db.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').get()) fail();
        completed=true;
      } else fail();
    }
    if(!completed) fail();
    db.exec('COMMIT');
    const references=[];
    for(const table of ['project_artwork','profile_artwork','control_project_artwork']){
      const columns=new Set(db.prepare(`PRAGMA table_info(${ident(table)})`).all().map(row=>row.name));
      if(!['object_key','digest','status','byte_size'].every(name=>columns.has(name))) fail();
      references.push(...db.prepare(`SELECT object_key AS key, digest AS sha256, byte_size AS size FROM ${ident(table)} WHERE status='ready'`).all());
    }
    const settings=db.prepare("SELECT payload_json FROM control_settings WHERE id='site'").get();
    if(settings){
      const value=JSON.parse(settings.payload_json)?.homepageArtwork;
      if(typeof value==='string' && /^\/media\/homepage-art\/[a-f0-9]{64}\.png$/.test(value)) {
        references.push({key:value.slice('/media/'.length),sha256:value.slice(-68,-4)});
      }
    }
    return {stats:{startedAt:metadata.startedAt,completedAt:metadata.completedAt,applicationTables:appTables,
      rowCount:total,ledgers,sequences:seen.has('sqlite_sequence')},references};
  } finally {db.close();}
}

function restoreArtwork(path,privateKey,root,headerRead){
  const dest=join(root,'artwork');
  mkdirSync(dest,{mode:0o700});
  const manifest=new Map();
  let head,current,footer,total=0;
  try{
    for(const {type,bytes} of frames(path,privateKey,'artwork',headerRead)){
      if(type===10&&!head){head=objectJSON(bytes);continue;}
      if(!head) fail();
      if(type===11&&!current){
        const meta=objectJSON(bytes);
        if(typeof meta.key!=='string'||!meta.key||manifest.has(meta.key)||manifest.size>=256||
          !Number.isSafeInteger(meta.size)||meta.size<0||meta.size>12*1024*1024||
          typeof meta.etag!=='string'||typeof meta.version!=='string') fail();
        const file=String(manifest.size+1).padStart(4,'0')+'.bin';
        current={meta,file,fd:openSync(join(dest,file),'wx',0o600),hash:createHash('sha256'),size:0};
      }else if(type===12&&current){
        current.size+=bytes.length;
        if(current.size>current.meta.size) fail();
        current.hash.update(bytes);
        for(let offset=0;offset<bytes.length;) offset+=writeSync(current.fd,bytes,offset,bytes.length-offset);
      }else if(type===13&&current){
        const end=objectJSON(bytes);
        const sha256=current.hash.digest('hex');
        if(!shaPattern.test(end.sha256)||end.sha256!==sha256||end.size!==current.size||current.size!==current.meta.size) fail();
        closeSync(current.fd);
        manifest.set(current.meta.key,{...current.meta,file:current.file,sha256});
        total+=current.size;
        current=undefined;
      }else if(type===255&&!current){
        footer=objectJSON(bytes);
        if(head.objects!==manifest.size||footer.objects!==manifest.size||head.bytes!==total||footer.bytes!==total) fail();
      }else fail();
    }
    if(!footer) fail();
    writeFileSync(join(dest,'inventory.json'),JSON.stringify([...manifest.values()],null,2)+'\n',{mode:0o600,flag:'wx'});
    return {manifest,stats:{startedAt:head.startedAt,completedAt:footer.completedAt,objects:manifest.size,bytes:total}};
  }finally{if(current)closeSync(current.fd);}
}

export function restoreRecovery(privateKey,dbArchive,artArchive,output){
  const root=resolve(output);
  mkdirSync(root,{mode:0o700});
  try{
    let captureId;
    const database=restoreDatabase(dbArchive,privateKey,root,id=>{captureId=id;});
    const art=restoreArtwork(artArchive,privateKey,root,id=>{if(id!==captureId)fail();});
    for(const ref of database.references){
      const restored=art.manifest.get(ref.key);
      if(!restored||(ref.sha256!==undefined&&restored.sha256!==ref.sha256)||(ref.size!==undefined&&restored.size!==ref.size)) fail();
    }
    const receipt={captureId,database:database.stats,artwork:art.stats,
      verifiedArtworkReferences:database.references.length,
      commonRecoveryPointVerified:false,firebaseRecoveryVerified:false};
    // On Windows use an access-restricted directory and device encryption; POSIX modes are not ACLs.
    chmodSync(join(root,'rmt.sqlite'),0o600);
    writeFileSync(join(root,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});
    return receipt;
  }catch(error){rmSync(root,{recursive:true,force:true});throw error;}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [command,...args]=process.argv.slice(2);
  try{
    if(command==='keygen'&&args.length===1) console.log(JSON.stringify(createRecoveryKey(args[0]),null,2));
    else if(command==='restore'&&args.length===4){
      const {readFileSync}=await import('node:fs');
      console.log(JSON.stringify(restoreRecovery(readFileSync(args[0]),args[1],args[2],args[3]),null,2));
    } else {
      console.error('Usage: node scripts/recovery-transfer.mjs keygen <new-private.pem> | restore <private.pem> <database.rmtenc> <artwork.rmtenc> <new-directory>');
      process.exitCode=2;
    }
  }catch{console.error('Recovery command failed. No verified restore was written.');process.exitCode=1;}
}
