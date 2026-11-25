import {createHash,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {getAddress,recoverMessageAddress} from 'viem';
import {createSiweMessage} from 'viem/siwe';

export const digest=s=>createHash('sha256').update(s).digest('hex');
const random=()=>randomBytes(24).toString('hex');
export const origin='http://127.0.0.1:5240';
export class Pilot {
  constructor({clock=Date.now,code,allowedChain=4663}){
    if(![4663,46630].includes(allowedChain))throw Error('Unsupported network.');
    this.clock=clock;this.code=code;this.chain=allowedChain;
    this.db=new DatabaseSync(':memory:');
    this.db.exec(`CREATE TABLE challenges (nonce TEXT PRIMARY KEY, browser TEXT, uid TEXT, address TEXT, purpose TEXT, message TEXT, expires INTEGER);
      CREATE TABLE links (id TEXT PRIMARY KEY,uid TEXT UNIQUE,address TEXT,chain INTEGER,UNIQUE(chain,address));
      CREATE TABLE usage (bucket TEXT,period INTEGER,total INTEGER,PRIMARY KEY(bucket,period));
      CREATE TABLE controls (enabled INTEGER); INSERT INTO controls VALUES (1);`);
  }
  enabled(){return !!this.db.prepare('SELECT enabled FROM controls').get().enabled;}
  disable(){this.db.exec('UPDATE controls SET enabled=0; DELETE FROM challenges');}
  count(kind,scope,limit,period){
    const slot=Math.floor(this.clock()/period);
    this.db.prepare('DELETE FROM usage WHERE bucket=? AND period<?').run(kind+scope,slot);
    if(!this.db.prepare('INSERT INTO usage VALUES(?,?,1) ON CONFLICT(bucket,period) DO UPDATE SET total=total+1 WHERE total<? RETURNING total').get(kind+scope,slot,limit))throw Error('Pilot request limit reached.');
  }
  fresh(member){if(!member||member.protected||!member.verified||!['password','google.com'].includes(member.method)||member.at>this.clock()||this.clock()-member.at>=300000)throw Error('Reauthenticate with the original account.');}
  issue(browser,member,purpose,account,chain){
    if(!this.enabled()||chain!==this.chain||!['link','login'].includes(purpose))throw Error('Wallet method unavailable.');
    if(purpose==='link')this.fresh(member);
    this.count('issue',digest(browser),8,300000);this.count('all-issue','',80,3600000);
    this.db.prepare('DELETE FROM challenges WHERE expires<=?').run(this.clock());
    const address=getAddress(account),nonce=random(),expires=this.clock()+300000;
    const message=createSiweMessage({address,chainId:chain,domain:new URL(origin).host,uri:origin+'/wallet/'+purpose,version:'1',nonce,issuedAt:new Date(this.clock()),expirationTime:new Date(expires),
      statement:purpose==='link'?'Link this wallet to your verified RMT pilot account.':'Sign in to your linked RMT pilot account.'});
    this.db.prepare('INSERT INTO challenges VALUES(?,?,?,?,?,?,?)').run(digest(nonce),digest(browser),purpose==='link'?member.uid:'',address,purpose,digest(message),expires);
    return {nonce,message};
  }
  async verify(browser,member,{nonce,message,signature,purpose,address,chain}){
    this.count('verify',digest(browser),12,300000);this.count('all-verify','',100,3600000);
    if(!this.enabled()||chain!==this.chain||typeof nonce!=='string'||typeof message!=='string'||!/^0x[0-9a-f]{130}$/i.test(signature))throw Error('Wallet proof unavailable.');
    const key=digest(nonce),row=this.db.prepare('SELECT * FROM challenges WHERE nonce=?').get(key);
    if(!row||row.browser!==digest(browser)||row.message!==digest(message)||row.purpose!==purpose||row.address!==getAddress(address)||row.expires<=this.clock())throw Error('Wallet proof expired or invalid.');
    if(purpose==='link'){this.fresh(member);if(row.uid!==member.uid)throw Error('Account changed.');}
    if(await recoverMessageAddress({message,signature})!==row.address)throw Error('Signature did not match.');
    this.count('rpc','',40,3600000);
    if(await this.code(row.address)!=='0x')throw Error('Only verified externally owned wallets are supported.');
    // All writes following the network read are synchronous in the same transaction.
    this.db.exec('BEGIN IMMEDIATE');
    try{
      if(!this.enabled()||!this.db.prepare('DELETE FROM challenges WHERE nonce=? AND expires>? RETURNING nonce').get(key,this.clock()))throw Error('Wallet proof expired or consumed.');
      if(purpose==='link'){
        this.fresh(member);
        this.db.prepare('INSERT INTO links VALUES(?,?,?,?)').run(random(),row.uid,row.address,chain);
      }
      const link=this.db.prepare('SELECT * FROM links WHERE address=? AND chain=?').get(row.address,chain);
      if(!link)throw Error('Wallet sign-in unavailable.');
      this.db.exec('COMMIT');return link;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  active(uid,id){return this.enabled()&&!!this.db.prepare('SELECT id FROM links WHERE uid=? AND id=?').get(uid,id);}
  unlink(member){this.fresh(member);this.db.prepare('DELETE FROM links WHERE uid=?').run(member.uid);this.db.prepare('DELETE FROM challenges WHERE uid=?').run(member.uid);}
}
