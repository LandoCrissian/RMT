export const MONEY_LAB_PATH='/lammb-vault/money-lab';
export const LAMMB_SUPPLY=720;
export const SPOTLIGHT_TIERS=[
  {id:'featured',name:'Featured',price:5},
  {id:'spotlight',name:'Spotlight',price:15},
  {id:'premier',name:'Premier',price:30},
] as const;
export const HOLDER_GATES=[1,5,10,25] as const;

export type MoneyInputs={
  salePrice:number;sales:number;royalty:number;coverage:number;
  featured:number;spotlight:number;premier:number;adCosts:number;royaltyToMining:number;
  spend:number;grossRate:number;poolFee:number;otherCosts:number;holderShare:number;
  gate:number;eligibleNfts:number;yourNfts:number;
};
export const MODEL_DEFAULT:MoneyInputs={
  salePrice:2.35,sales:100,royalty:10,coverage:100,
  featured:2,spotlight:3,premier:1,adCosts:10,royaltyToMining:0,
  spend:20,grossRate:100.15,poolFee:2.5,otherCosts:0,holderShare:0,
  gate:5,eligibleNfts:500,yourNfts:5,
};
export const MODEL_SCENARIOS=[
  {id:'baseline',label:'Starting point',note:'100 sales · 6 sponsors',values:MODEL_DEFAULT},
  {id:'traction',label:'Ad traction',note:'150 sales · 20 sponsors',values:{...MODEL_DEFAULT,salePrice:5,sales:150,featured:3,spotlight:15,premier:2,adCosts:45}},
  {id:'slow',label:'Quiet month',note:'25 sales · no sponsors',values:{...MODEL_DEFAULT,sales:25,coverage:75,featured:0,spotlight:0,premier:0,adCosts:5}},
] as const;
const cents=(amount:number)=>Math.round(amount*100);
const basis=(pct:number)=>Math.round(pct*100);
const roundFraction=(number:number,first:number,second=10000)=>{
  const divisor=BigInt(100_000_000);
  return Number((BigInt(number)*BigInt(first)*BigInt(second)+divisor/BigInt(2))/divisor);
};
const bounded=(x:number,min:number,max:number)=>Number.isFinite(x)?Math.min(max,Math.max(min,x)):min;
const integer=(x:number,min:number,max:number)=>Math.round(bounded(x,min,max));
export function modelMoney(raw:MoneyInputs){
  const salePrice=cents(bounded(raw.salePrice,0,10000)),sales=integer(raw.sales,0,10000);
  const royaltyPct=basis(bounded(raw.royalty,0,100)),coverage=basis(bounded(raw.coverage,0,100));
  const volume=salePrice*sales,royalties=roundFraction(volume,royaltyPct,coverage);
  const sponsorRows=SPOTLIGHT_TIERS.map(t=>({...t,slots:integer(raw[t.id],0,100)}));
  const sponsoredCount=sponsorRows.reduce((sum,r)=>sum+r.slots,0);
  const grossAds=sponsorRows.reduce((sum,r)=>sum+r.slots*cents(r.price),0);
  const adCosts=cents(bounded(raw.adCosts,0,100000));
  const netAds=grossAds-adCosts;
  const royaltyMining=roundFraction(royalties,basis(bounded(raw.royaltyToMining,0,100)));
  const miningFunding=Math.max(0,netAds)+royaltyMining;
  const retainedRoyalties=royalties-royaltyMining;
  const spend=cents(bounded(raw.spend,0,100000)),costs=cents(bounded(raw.otherCosts,0,100000));
  const feeBps=basis(bounded(raw.poolFee,0,100));
  const gross=spend?roundFraction(spend,basis(bounded(raw.grossRate,0,500))):0;
  const fee=roundFraction(gross,feeBps),returned=gross-fee;
  const miningProfit=returned-spend-costs;
  const loss=Math.max(0,-miningProfit);
  const distribution=roundFraction(Math.max(0,miningProfit),basis(bounded(raw.holderShare,0,100)));
  const gate=integer(raw.gate,1,LAMMB_SUPPLY),wallet=integer(raw.yourNfts,0,LAMMB_SUPPLY);
  const eligibleNfts=integer(raw.eligibleNfts,0,LAMMB_SUPPLY);
  const eligibleModel=eligibleNfts>=gate&&wallet>=gate&&wallet<=eligibleNfts;
  // Divide in fractional cents for display. This tool never creates rounded payouts.
  const walletShare=eligibleModel?distribution*wallet/eligibleNfts:0;
  const fundingGap=Math.max(0,spend+costs-miningFunding);
  const breakEvenGross=spend>0&&feeBps<10000?(spend+costs)/(1-feeBps/10000):null;
  return {volume,royalties,retainedRoyalties,grossAds,adCosts,netAds,royaltyMining,miningFunding,sponsoredCount,
    sponsorRows,gross,fee,returned,spend,costs,miningProfit,loss,distribution,gate,wallet,eligibleNfts,walletShare,
    eligibleModel,fundingGap,breakEvenGross,
    adsShare:miningFunding>0?Math.max(0,netAds)/miningFunding:0,
    thresholds:HOLDER_GATES.map(g=>({gate:g,entryCost:salePrice*g,maxWallets:Math.floor(LAMMB_SUPPLY/g)})),
  };
}
