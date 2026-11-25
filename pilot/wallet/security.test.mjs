import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {Pilot} from './core.mjs';
function fixture(){
 let clock=1000000000000;const member={uid:'qa1',verified:true,at:clock,method:'password',protected:false};
 const account=privateKeyToAccount(generatePrivateKey());
 const pilot=new Pilot({clock:()=>clock,code:async()=> '0x'});
 async function proof(purpose='link',browser='qa',actor=member){
  const challenge=pilot.issue(browser,actor,purpose,account.address,4663);
  return {...challenge,purpose,address:account.address,chain:4663,signature:await account.signMessage({message:challenge.message})};
 }
 return {member,account,pilot,proof,advance:ms=>clock+=ms};
}
test('one concurrent link wins; existing Firebase UID is preserved; unlink and disable invalidate sessions',async()=>{
 const {member,pilot,proof}=fixture(),p=await proof();
 const results=await Promise.allSettled([pilot.verify('qa',member,p),pilot.verify('qa',member,p)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const link=await pilot.verify('qa',null,await proof('login'));assert.equal(link.uid,member.uid);assert.ok(pilot.active(member.uid,link.id));
 const other={...member,uid:'qa2'};await assert.rejects(pilot.verify('qa',other,await proof('link','qa',other)));
 pilot.unlink(member);assert.equal(pilot.active(member.uid,link.id),false);
 await assert.rejects(pilot.verify('qa',null,await proof('login')));
 const newLink=await pilot.verify('qa',member,await proof());assert.notEqual(link.id,newLink.id);
 pilot.disable();assert.equal(pilot.active(member.uid,newLink.id),false);assert.throws(()=>pilot.issue('qa',null,'login',p.address,4663));
});
test('browser, account, purpose, chain, domain, signature, expiry and contract-code failures close the flow',async()=>{
 const {member,pilot,proof,advance}=fixture(),p=await proof();
 for(const [browser,actor,change] of [['other',member,{}],['qa',{...member,uid:'other'},{}],['qa',member,{purpose:'login'}],['qa',member,{chain:46630}],['qa',member,{message:p.message.replace('127.0.0.1','other.test')}],['qa',member,{signature:'0x00'}]]){
  await assert.rejects(pilot.verify(browser,actor,{...p,...change}));
 }
 const wrong=privateKeyToAccount(generatePrivateKey());await assert.rejects(pilot.verify('qa',member,{...p,signature:await wrong.signMessage({message:p.message})}));
 pilot.code=async()=> '0x1234';await assert.rejects(pilot.verify('qa',member,p));pilot.code=async()=>{throw Error('timeout')};await assert.rejects(pilot.verify('qa',member,p));advance(300000);await assert.rejects(pilot.verify('qa',member,p));
});
test('no protected, unverified, stale or wallet-origin link; bound challenge issuance',()=>{
 const {member,pilot,account}=fixture();for(const changes of [{protected:true},{verified:false},{at:member.at-300000},{method:'custom'}])assert.throws(()=>pilot.issue('browser',{...member,...changes},'link',account.address,4663));
 for(let i=0;i<8;i++)pilot.issue('browser',null,'login',account.address,4663);assert.throws(()=>pilot.issue('browser',null,'login',account.address,4663));
});
