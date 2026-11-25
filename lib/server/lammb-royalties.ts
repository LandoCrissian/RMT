import {keccak_256} from '@noble/hashes/sha3';
import {bytesToHex,utf8ToBytes} from '@noble/hashes/utils';
import {GENESIS_CONTRACT,ASSETS,type RoyaltyReceipt,type Asset,type AssetTotals} from '../lammb-vault';
import {InputError} from '../submission-validation';
import {addressWord,isAddress,parseBlock,quantity,royaltyAt,safeNumber,tag,txPattern,vaultChain} from './lammb-rpc';

const eventTopic=(signature:string)=>'0x'+bytesToHex(keccak_256(utf8ToBytes(signature)));
export const SEAPORT='0x0000000000000068f116a894984e2db1123eb395';
const ENTRY_POINT_V07='0x0000000071727de22e5e9d8baf0edac6f37da032';
export const FULFILL=eventTopic('OrderFulfilled(bytes32,address,address,address,(uint8,address,uint256,uint256)[],(uint8,address,uint256,uint256,address)[])');
export const TRANSFER=eventTopic('Transfer(address,address,uint256)');
const ZERO=ASSETS.ETH.address,MINED_RECEIPT_LIMIT=12;
const unsupported=(message='This transaction is not an unambiguous single LAMMB Genesis sale with a matching creator payment.')=>new InputError(message,422);
type Log={address:string;topics:string[];data:string};
type Item={kind:number;token:string;id:bigint;amount:bigint;receiver?:string};
type Payment=Item&{receiver:string};

function parseLog(value:unknown):Log{
  const log=value as Partial<Log>|null;
  if(!log||!isAddress(log.address)||!Array.isArray(log.topics)||log.topics.length>4||
    !log.topics.every(t=>typeof t==='string'&&txPattern.test(t))||
    typeof log.data!=='string'||!/^0x(?:[0-9a-f]{2})*$/i.test(log.data))throw unsupported();
  return {address:log.address.toLowerCase(),topics:log.topics.map(t=>t.toLowerCase()),data:log.data.toLowerCase()};
}
function parseAddress(word:string){
  if(!/^0{24}[0-9a-f]{40}$/.test(word))throw unsupported();
  return '0x'+word.slice(24);
}
function decodeOrder(log:Log) {
  if(log.topics.length!==3||log.data.length>8194)throw unsupported();
  const words=log.data.slice(2).match(/.{64}/g)??[];
  if(log.data.length!==2+64*words.length||words.length<8)throw unsupported();
  const integer=(i:number)=>{if(!words[i])throw unsupported();return BigInt('0x'+words[i]);};
  const offset=(value:bigint)=>{if(value%BigInt(32)!==BigInt(0)||value>BigInt(words.length*32))throw unsupported();return Number(value/BigInt(32));};
  const array=(at:number,len:number,withReceiver:boolean)=>{
    const width=withReceiver?5:4,out:Item[]=[];
    for(let i=0;i<len;i++){
      const p=at+1+i*width,kind=integer(p);
      if(kind>BigInt(5))throw unsupported();
      out.push({kind:Number(kind),token:parseAddress(words[p+1]),id:integer(p+2),amount:integer(p+3),
        ...(withReceiver?{receiver:parseAddress(words[p+4])}:{})});
    }
    return out;
  };
  const start=offset(integer(2)),end=offset(integer(3));
  const offered=integer(start),received=integer(end);
  if(start!==4||offered!==BigInt(1)||end!==9||received<BigInt(1)||received>BigInt(16)||end+1+Number(received)*5!==words.length)throw unsupported();
  return {offerer:parseAddress(log.topics[1].slice(2)),recipient:parseAddress(words[1]),
    offer:array(start,Number(offered),false)[0],consideration:array(end,Number(received),true) as Payment[]};
}
function assetFor(item:Item):Asset|null{
  if(item.id!==BigInt(0)||item.amount<=BigInt(0))return null;
  if(item.kind===0&&item.token===ZERO)return 'ETH';
  if(item.kind===1&&item.token===ASSETS.WETH.address)return 'WETH';
  if(item.kind===1&&item.token===ASSETS.USDG.address)return 'USDG';
  return null;
}
const isNft=(item:Item)=>item.kind===2&&item.token===GENESIS_CONTRACT&&item.amount===BigInt(1);
function genuineTransfer(log:Log,id:bigint) {
  if(log.address!==GENESIS_CONTRACT||log.topics.length!==4||log.topics[0]!==TRANSFER||log.data!=='0x'||BigInt(log.topics[3])!==id)return null;
  const from=parseAddress(log.topics[1].slice(2)),to=parseAddress(log.topics[2].slice(2));
  return isAddress(from)&&isAddress(to)&&from!==to?{from,to}:null;
}
export function saleFromReceipt(value:unknown,hash:string) {
  const receipt=value as {to?:unknown;status?:unknown;blockHash?:unknown;blockNumber?:unknown;transactionHash?:unknown;logs?:unknown}|null;
  if(!receipt)throw unsupported('No confirmed Robinhood Chain receipt was found for that hash.');
  if(typeof receipt.to!=='string'||![SEAPORT,ENTRY_POINT_V07].includes(receipt.to.toLowerCase())||receipt.status!=='0x1'||
    typeof receipt.transactionHash!=='string'||receipt.transactionHash.toLowerCase()!==hash||
    typeof receipt.blockHash!=='string'||!txPattern.test(receipt.blockHash)||!Array.isArray(receipt.logs)||receipt.logs.length>100)throw unsupported();
  const logs=receipt.logs.map(parseLog),fills=logs.filter(l=>l.address===SEAPORT&&l.topics[0]===FULFILL);
  if(fills.length!==1)throw unsupported();
  const {offerer,recipient,offer,consideration}=decodeOrder(fills[0]);
  const nfts=consideration.filter(isNft);
  const listing=isNft(offer),nft=listing?offer:nfts[0],asset=assetFor(listing?consideration[0]:offer);
  if(!asset||!nft||(listing?nfts.length!==0:nfts.length!==1||asset==='ETH'))throw unsupported();
  const transfers=logs.map(l=>genuineTransfer(l,nft.id)).filter(t=>t!==null);
  // Reject bundles, mints and receipts whose order does not match the actual NFT transfer.
  if(transfers.length!==1||logs.filter(l=>l.topics[0]===TRANSFER&&l.topics.length===4).length!==1)throw unsupported();
  const {from:seller,to:buyer}=transfers[0];
  if(listing?(seller!==offerer||buyer!==recipient):(buyer!==offerer||buyer!==nfts[0].receiver))throw unsupported();
  const payments=consideration.filter(p=>!isNft(p));
  if(!payments.length||payments.some(p=>!isAddress(p.receiver)||assetFor(p)!==asset))throw unsupported();
  const price=listing?payments.reduce((acc,p)=>acc+p.amount,BigInt(0)):offer.amount;
  if(price>=(BigInt(1)<<BigInt(256))||(!listing&&payments.reduce((acc,p)=>acc+p.amount,BigInt(0))>=price))throw unsupported();
  return {seller,buyer,payments,asset,price,tokenId:nft.id,block:safeNumber(quantity(receipt.blockNumber)),
    blockHash:receipt.blockHash.toLowerCase(),logs};
}
export async function verifyRoyaltyReceipt(hash:string):Promise<RoyaltyReceipt&{blockHash:string}> {
  if(!txPattern.test(hash))throw new InputError('Enter a full Robinhood Chain transaction hash.');
  hash=hash.toLowerCase();
  return vaultChain(async(rpc,head)=>{
    const [receipt,end]=await Promise.all([rpc('eth_getTransactionReceipt',[hash]),rpc('eth_getBlockByNumber',['finalized',false])]);
    const sale=saleFromReceipt(receipt,hash),finalized=parseBlock(end);
    if(sale.block>Math.min(finalized.number,head.number))throw unsupported('This sale is not finalized yet. Try its hash again later.');
    // Read both sides of the sale block. If royalty terms changed in the same block, do not assign a payout.
    if(sale.block<2)throw unsupported();
    const [block,before,after]=await Promise.all([
      rpc('eth_getBlockByNumber',[tag(sale.block),false]).then(parseBlock),
      royaltyAt(rpc,sale.tokenId,sale.price,tag(sale.block-1)),
      royaltyAt(rpc,sale.tokenId,sale.price,tag(sale.block)),
    ]);
    if(block.number!==sale.block||block.hash!==sale.blockHash)throw unsupported('The sale does not match the canonical Robinhood Chain block.');
    const {receiver,amount}=after;
    const potential=sale.payments.filter(payment=>payment.receiver===receiver);
    if(!isAddress(receiver)||receiver===sale.seller||receiver===sale.buyer||amount<=BigInt(0)||amount>sale.price||
      before.receiver!==receiver||before.amount!==amount||potential.length!==1||potential[0].amount!==amount)
      throw unsupported('No distinct creator payment matching this collection’s on-chain royalty terms was found.');
    if(sale.asset!=='ETH'){
      const matches=sale.logs.filter(l=>l.address===ASSETS[sale.asset].address&&l.topics.length===3&&l.topics[0]===TRANSFER&&
        [sale.buyer,sale.seller].some(payer=>l.topics[1]==='0x'+addressWord(payer))&&l.topics[2]==='0x'+addressWord(receiver)&&/^0x[0-9a-f]{64}$/.test(l.data)&&BigInt(l.data)===amount);
      if(matches.length!==1)throw unsupported('The creator payment did not match a transfer of the expected token.');
    }
    return {hash,tokenId:sale.tokenId.toString(),recipient:receiver,asset:sale.asset,amount:amount.toString(),
      block:sale.block,blockHash:block.hash,timestamp:block.timestamp};
  },true);
}
const receiptColumns='hash,token_id AS tokenId,recipient,asset,amount,block_number AS block,block_timestamp AS timestamp';
export async function importRoyalty(db:D1Database,value:unknown) {
  if(typeof value!=='string'||!txPattern.test(value.trim()))throw new InputError('Enter a full Robinhood Chain transaction hash.');
  const hash=value.trim().toLowerCase();
  const existing=await db.prepare('SELECT '+receiptColumns+' FROM lammb_vault_receipts WHERE hash=?').bind(hash).first<RoyaltyReceipt>();
  if(existing)return {receipt:existing,added:false};
  const {blockHash,...receipt}=await verifyRoyaltyReceipt(hash);
  const result=await db.prepare(`INSERT INTO lammb_vault_receipts
    (hash,token_id,recipient,asset,amount,block_number,block_hash,block_timestamp,created_at) VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(hash) DO NOTHING`)
    .bind(hash,receipt.tokenId,receipt.recipient,receipt.asset,receipt.amount,receipt.block,blockHash,receipt.timestamp,Date.now()).run();
  return {receipt,added:result.meta.changes===1};
}
export async function royaltySummary(db:D1Database,address?:string|null) {
  const {results}=await db.prepare('SELECT asset,amount FROM lammb_vault_receipts'+(address?' WHERE recipient=?':''))
    .bind(...(address?[address]:[])).all<{asset:Asset;amount:string}>();
  const totals:AssetTotals={};
  for(const {asset,amount} of results)totals[asset]=(BigInt(totals[asset]??'0')+BigInt(amount)).toString();
  return {totals,count:results.length};
}
export async function royaltyLedger(db:D1Database,address:string|null) {
  const [latest,summary]=await Promise.all([
    db.prepare('SELECT '+receiptColumns+' FROM lammb_vault_receipts ORDER BY block_number DESC,hash DESC LIMIT ?')
      .bind(MINED_RECEIPT_LIMIT).all<RoyaltyReceipt>(),
    address?royaltySummary(db,address):{totals:{},count:0},
  ]);
  return {receipts:latest.results,treasuryReceipts:summary.totals,count:summary.count};
}
