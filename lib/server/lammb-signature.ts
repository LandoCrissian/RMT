import {secp256k1} from '@noble/curves/secp256k1';
import {keccak_256} from '@noble/hashes/sha3';
import {bytesToHex,hexToBytes,concatBytes,utf8ToBytes} from '@noble/hashes/utils';
import {chainUnavailable,hexWord,type VaultRpc} from './lammb-rpc';

export const vaultSignaturePattern=/^0x(?:[\da-f]{2}){1,4096}$/i;
const magic='1626ba7e', magicResponse='0x'+magic.padEnd(64,'0');
export function checksumAddress(address:string) {
  const lower=address.slice(2).toLowerCase(),hash=bytesToHex(keccak_256(utf8ToBytes(lower)));
  return '0x'+Array.from(lower,(c,i)=>parseInt(hash[i],16)>=8?c.toUpperCase():c).join('');
}
export function personalDigest(message:string) {
  const bytes=utf8ToBytes(message);
  return keccak_256(concatBytes(utf8ToBytes('\x19Ethereum Signed Message:\n'+bytes.length),bytes));
}
function eoaMatches(address:string,digest:Uint8Array,signature:string) {
  if(signature.length!==132&&signature.length!==130)return false;
  try{
    const bytes=hexToBytes(signature.slice(2));
    const compact=bytes.slice(0,64);
    // ERC-2098 compact signatures carry y-parity in the high bit of s.
    const v=bytes.length===64?compact[32]>>>7:bytes[64];
    if(bytes.length===64)compact[32]&=127;
    const recovery=v>=27?v-27:v;
    if(recovery!==0&&recovery!==1)return false;
    const sig=secp256k1.Signature.fromCompact(compact);
    if(sig.hasHighS())return false;
    const key=sig.addRecoveryBit(recovery).recoverPublicKey(digest).toBytes(false);
    return '0x'+bytesToHex(keccak_256(key.subarray(1)).subarray(12))===address;
  }catch{return false;}
}
function signatureCall(digest:Uint8Array,signature:string){
  const bytes=signature.slice(2),size=bytes.length/2;
  return '0x'+magic+bytesToHex(digest)+hexWord(64)+hexWord(size)+bytes.padEnd(Math.ceil(size/32)*64,'0');
}
export async function verifyVaultSignature(rpc:VaultRpc,address:string,message:string,signature:string,blockTag:string) {
  if(!vaultSignaturePattern.test(signature))return false;
  const digest=personalDigest(message);
  const code=await rpc('eth_getCode',[address,blockTag]);
  if(typeof code!=='string'||!/^0x(?:[0-9a-f]{2})*$/i.test(code))throw chainUnavailable();
  if(code==='0x'||/^0xef0100[\da-f]{40}$/i.test(code)){
    if(eoaMatches(address,digest,signature))return true;
    if(code==='0x')return false;
  }
  const check=(hash:Uint8Array)=>rpc('eth_call',[{to:address,data:signatureCall(hash,signature),gas:'0x7a120'},blockTag],true);
  const result=await check(digest);
  if(typeof result!=='string'||result.toLowerCase()!==magicResponse)return false;
  const unrelated=await check(personalDigest('Unrelated RMT Vault challenge:\n'+message));
  return unrelated===null||(typeof unrelated==='string'&&/^0x[\da-f]{64}$/i.test(unrelated)&&unrelated.toLowerCase()!==magicResponse);
}
