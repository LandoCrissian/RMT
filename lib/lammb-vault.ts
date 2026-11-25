export const VAULT_PATH='/lammb-vault';
export const GENESIS_CONTRACT='0x7a543c61c021e9a5c7949fabdc2f4e0a58088daf';
export const GENESIS_OPENSEA='https://opensea.io/collection/lammbs-59693791';
export const ROBINHOOD_CHAIN_ID=4663;
export const ROBINHOOD_RPC='https://rpc.mainnet.chain.robinhood.com';
export const ROBINHOOD_EXPLORER='https://robinhoodchain.blockscout.com';
export const VAULT_MINIMUM=5;
export const ROYALTY_SAMPLE_IDS=[1,16,372,720] as const;
export const ALLOCATION_PLAN=[
  {label:'Mining expansion',weight:50},
  {label:'Treasury reserve',weight:30},
  {label:'Development & operations',weight:20},
] as const;
export const ASSETS={
  ETH:{address:'0x0000000000000000000000000000000000000000',decimals:18},
  WETH:{address:'0x0bd7d308f8e1639fab988df18a8011f41eacad73',decimals:18},
  USDG:{address:'0x5fc5360d0400a0fd4f2af552add042d716f1d168',decimals:6},
} as const;
export type Asset=keyof typeof ASSETS;
export type AssetTotals=Partial<Record<Asset,string>>;
export type RoyaltySnapshot={block:number;receiver:string;rateBps:number;sampleIds:readonly number[]};
export type TreasurySnapshot={address:string;block:number|null;balances:AssetTotals};
export type VaultPublic={royalty:RoyaltySnapshot|null;treasury:TreasurySnapshot|null;tracked:AssetTotals;count:number};
export type RoyaltyReceipt={
  hash:string;tokenId:string;recipient:string;asset:Asset;amount:string;block:number;timestamp:number;
};
export type VaultMember={
  address:string;balance:number;eligible:boolean;checkedAt:number;block:number;
  member?:{receipts:RoyaltyReceipt[];treasuryReceipts:AssetTotals;count:number};
};
export function formatUnits(amount:string,asset:Asset) {
  const decimals=ASSETS[asset].decimals;
  const padded=amount.padStart(decimals+1,'0');
  const whole=padded.slice(0,-decimals),fraction=padded.slice(-decimals).replace(/0+$/,'');
  return whole+(fraction?'.'+fraction:'');
}
