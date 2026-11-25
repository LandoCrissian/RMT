import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MONEY_LAB_PATH,MODEL_DEFAULT,MODEL_SCENARIOS,modelMoney} from '../lib/lammb-money-lab.ts';

test('base assumptions keep royalties, gross ads, net ads and actual mining P&L separate',()=>{
  const row=modelMoney(MODEL_DEFAULT);
  assert.equal(MONEY_LAB_PATH,'/lammb-vault/money-lab');
  assert.equal(row.volume,23500);
  assert.equal(row.royalties,2350);
  assert.equal(row.grossAds,8500);
  assert.equal(row.netAds,7500);
  assert.equal(row.royaltyMining,0);
  assert.equal(row.miningFunding,7500);
  assert.equal(row.gross,2003);
  assert.equal(row.fee,50);
  assert.equal(row.returned,1953);
  assert.equal(row.miningProfit,-47);
  assert.equal(row.distribution,0);
});
test('twenty modeled sponsors make $300 gross and royalties respect volume coverage',()=>{
  const row=modelMoney({...MODEL_SCENARIOS[1].values,coverage:80,royaltyToMining:50});
  assert.equal(row.sponsoredCount,20);
  assert.equal(row.grossAds,30000);
  assert.equal(row.netAds,25500);
  assert.equal(row.royalties,6000);
  assert.equal(row.royaltyMining,3000);
  assert.equal(row.retainedRoyalties,3000);
  assert.equal(row.miningFunding,28500);
  assert.equal(row.adsShare,255/285);
});
test('an ad shortfall never creates mining funding and transfer cost comes out of P&L',()=>{
  const row=modelMoney({...MODEL_SCENARIOS[2].values,otherCosts:1,holderShare:100});
  assert.equal(row.netAds,-500);
  assert.equal(row.miningFunding,0);
  assert.equal(row.fundingGap,2100);
  assert.equal(row.miningProfit,-147);
  assert.equal(row.distribution,0);
  assert.equal(row.walletShare,0);
  assert.equal(modelMoney({...MODEL_DEFAULT,poolFee:100}).breakEvenGross,null);
});
test('a theoretical wallet ceiling is not an observed count, and only qualifying NFTs participate',()=>{
  const positive={...MODEL_DEFAULT,spend:20,grossRate:105,poolFee:0,holderShare:50};
  const first=modelMoney(positive);
  const ten=modelMoney({...positive,gate:10});
  assert.equal(first.miningProfit,100);
  assert.equal(first.distribution,50);
  assert.equal(first.walletShare,.5);
  assert.equal(ten.walletShare,0);
  assert.deepEqual(first.thresholds.map(({gate,entryCost,maxWallets})=>[gate,entryCost,maxWallets]),
    [[1,235,720],[5,1175,144],[10,2350,72],[25,5875,28]]);
  assert.equal(modelMoney({...positive,yourNfts:20,eligibleNfts:10}).walletShare,0);
  assert.equal(modelMoney({...positive,eligibleNfts:0}).eligibleModel,false);
});
test('bad, negative, or extremely large input is bounded and cannot produce a NaN or misleading payout',()=>{
  const row=modelMoney({...MODEL_DEFAULT,salePrice:NaN,sales:Infinity,spend:-8,grossRate:99,adCosts:-1,royalty:999,gate:0});
  for(const [k,value] of Object.entries(row))if(typeof value==='number')assert.ok(Number.isFinite(value),k);
  assert.equal(row.royalties,0);
  assert.equal(row.spend,0);
  assert.equal(row.gate,1);
  assert.equal(row.walletShare,0);
});
