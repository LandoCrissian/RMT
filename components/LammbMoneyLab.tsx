'use client';

import {useState} from 'react';
import {ArrowDownRight,ArrowLeft,ArrowRight,ArrowUpRight,BarChart3,Coins,Copy,FlaskConical,Layers3,RotateCcw,ShieldCheck,Sparkles,Telescope} from 'lucide-react';
import {LAMMB_SUPPLY,MODEL_DEFAULT,MODEL_SCENARIOS,SPOTLIGHT_TIERS,modelMoney,type MoneyInputs} from '@/lib/lammb-money-lab';
import {VAULT_MINIMUM,VAULT_PATH} from '@/lib/lammb-vault';
import './lammb-vault.css';
import './lammb-money-lab.css';

const dollars=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2});
const precise=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:5});
const money=(cents:number)=>dollars.format(cents/100);
const fine=(cents:number)=>precise.format(cents/100);
const signed=(cents:number)=>(cents>0?'+':'')+money(cents);
type Field={key: keyof MoneyInputs;label:string;min?:number;max:number;step?:number;unit?:string;hint?:string};
const collectionFields:Field[]=[
  {key:'salePrice',label:'Average sale price',max:10000,step:.01,unit:'USD'},
  {key:'sales',label:'Completed sales per month',max:10000},
  {key:'royalty',label:'Creator royalty rate',max:100,step:.1,unit:'%'},
  {key:'coverage',label:'Sales paying the modeled fee',max:100,step:1,unit:'%',hint:'Share of modeled sale volume paying the full fee.'},
];
const miningFields:Field[]=[
  {key:'spend',label:'Hashpower rental spend',max:100000,step:.01,unit:'USD'},
  {key:'grossRate',label:'Gross recovery of rental spend',max:500,step:.01,unit:'%',hint:'100% means the pool credits back the rental cost before fees.'},
  {key:'poolFee',label:'Pool fee',max:100,step:.1,unit:'%'},
  {key:'otherCosts',label:'Other mining costs',max:100000,step:.01,unit:'USD',hint:'Conversion, transfer and payout costs, if applicable.'},
];
function ModelInput({field,value,set}:{field:Field;value:number;set:(key:keyof MoneyInputs,value:number)=>void}){
  const {key,label,min=0,max,step=1,unit,hint}=field;
  const id='lm-'+key;
  return <label className="lm-field" htmlFor={id}>
    <span>{label}</span>
    <div className="lm-input-wrap">
      <input id={id} type="number" inputMode={step<1?'decimal':'numeric'} value={value} min={min} max={max} step={step}
        aria-describedby={hint?id+'-hint':undefined}
        onChange={e=>{const next=e.target.valueAsNumber;if(Number.isFinite(next))set(key,Math.max(min,Math.min(max,next)));else set(key,min);}}/>
      {unit&&<span className="lm-unit">{unit}</span>}
    </div>
    {hint&&<small id={id+'-hint'}>{hint}</small>}
  </label>;
}
function LedgerLine({label,value,emphasis=false}:{label:string;value:string;emphasis?:boolean}){
  return <div className={'lm-ledger-line'+(emphasis?' lm-ledger-total':'')}><dt>{label}</dt><dd>{value}</dd></div>;
}
export default function LammbMoneyLab(){
  const [input,setInput]=useState<MoneyInputs>({...MODEL_DEFAULT});
  const [scenario,setScenario]=useState<string>('baseline');
  const [copyState,setCopyState]=useState('');
  const output=modelMoney(input);
  const change=(key:keyof MoneyInputs,value:number)=>{setInput(current=>({...current,[key]:value}));setScenario('custom');setCopyState('');};
  const preset=(id:string,values:MoneyInputs)=>{setInput({...values});setScenario(id);setCopyState('');};
  const field=(config:Field)=><ModelInput key={config.key} field={config} value={input[config.key]} set={change}/>;
  async function copy(){
    const message=[
      'LAMMB Money Lab — hypothetical scenario',
      'Monthly royalties '+money(output.royalties)+' · Gross RMT ads '+money(output.grossAds)+' · Net RMT ads '+signed(output.netAds),
      'Monthly mining budget '+money(output.miningFunding)+' · Modeled pilot P&L '+signed(output.miningProfit),
      'Modeled holder pool '+money(output.distribution)+' · Threshold '+output.gate+' NFTs · Live gate '+VAULT_MINIMUM+' NFTs',
      'No live ads, spending, changes to access, or payouts are enabled by these inputs.'
    ].join('\n');
    try{await navigator.clipboard.writeText(message);setCopyState('Scenario copied.');}
    catch{setCopyState('Copy is unavailable in this browser.');}
  }
  return <main className="lv-shell lm-shell">
    <nav className="lv-top" aria-label="Money Lab navigation"><a className="lv-brand" href="/">RMT<span>.</span></a>
      <a href={VAULT_PATH}><ArrowLeft size={16}/> Back to LAMMB Vault</a></nav>
    <header className="lm-hero">
      <div className="lm-hero-copy"><div className="lv-eyebrow"><FlaskConical size={15}/> RMT × LAMMBs Genesis</div>
        <h1>Money <em>Lab.</em></h1><p>See how much royalties and RMT ads could fund, then find out whether mining would put more money back than it took out.</p></div>
      <div className="lm-hero-inset"><div><span className="lm-dot"/> SIMULATION ONLY</div>
        <p>Real math. Editable assumptions. No orders, fees, gate changes or payouts.</p>
        <a href="#scenarios">Run a scenario <ArrowRight size={15}/></a></div>
    </header>

    <section className="lm-scenarios" id="scenarios" aria-labelledby="lm-scenarios">
      <div><h2 id="lm-scenarios">Pick a starting point</h2><p>Every assumption stays editable.</p></div>
      <div className="lm-presets">{MODEL_SCENARIOS.map(s=><button key={s.id} type="button" aria-pressed={s.id===scenario} onClick={()=>preset(s.id,s.values)}>
        <strong>{s.label}</strong><small>{s.note}</small></button>)}</div>
    </section>
    <section className="lm-kpis" aria-label="Model results" aria-live="polite">
      <article><span><Coins size={17}/> Monthly royalties</span><strong>{money(output.royalties)}</strong><small>{money(output.volume)} modeled sale volume</small></article>
      <article><span><Sparkles size={17}/> Net monthly RMT ads</span><strong className={output.netAds<0?'lm-down':''}>{signed(output.netAds)}</strong><small>{output.sponsoredCount} proposed paid slots</small></article>
      <article className="lm-kpi-primary"><span><Layers3 size={17}/> Monthly mining budget</span><strong>{money(output.miningFunding)}</strong><small>Available in the model, not spent</small></article>
      <article><span>{output.miningProfit<0?<ArrowDownRight size={17}/>:<ArrowUpRight size={17}/>} Pilot profit / loss</span><strong className={output.miningProfit<0?'lm-down':''}>{signed(output.miningProfit)}</strong><small>After modeled costs</small></article>
    </section>

    <section className="lm-module" aria-labelledby="lm-funding">
      <header className="lm-section-title"><span>01 / FUNDING</span><h2 id="lm-funding">Where the money comes from</h2><p>Creator earnings follow completed trades. Sponsors are a separate revenue stream.</p></header>
      <div className="lm-grid">
        <div className="lm-panel"><h3>Creator royalties</h3><div className="lm-fields">{collectionFields.map(field)}</div>
          <p className="lm-note">The $2.35 starting point comes from the planning scenario. Floor price is an asking price, not a guarantee that a sale clears there.</p>
        </div>
        <div className="lm-panel"><h3>RMT sponsored placements</h3>
          <div className="lm-tiers">{SPOTLIGHT_TIERS.map(t=><div className="lm-tier" key={t.id}>
            <div><strong>{t.name}</strong><span>${t.price} / month</span></div>
            {field({key:t.id,label:t.name+' sponsors',max:100})}
          </div>)}</div>
          <div className="lm-fields">{field({key:'adCosts',label:'Monthly ad costs and reserves',max:100000,step:.01,unit:'USD',hint:'Payment fees, refunds, ad delivery costs and any cash you set aside.'})}</div>
          <p className="lm-note">Three proposed prices. No paid placements are for sale here.</p>
        </div>
      </div>
      <div className="lm-waterline">
        <div><h3>Mining budget bridge</h3><div className="lm-fields">
          {field({key:'royaltyToMining',label:'Royalties earmarked for mining',max:100,unit:'%'})}
        </div><p className="lm-note">The model sends 100% of positive net ad proceeds to the mining budget. An ad shortfall stays visible and is not counted as funding.</p></div>
        <div>
          <dl className="lm-ledger">
            <LedgerLine label="Gross ads" value={money(output.grossAds)}/>
            <LedgerLine label="Ad costs and reserves" value={output.adCosts?'−'+money(output.adCosts):money(0)}/>
            <LedgerLine label="Net ads available for mining" value={money(Math.max(0,output.netAds))}/>
            <LedgerLine label="Royalties available for mining" value={money(output.royaltyMining)}/>
            <LedgerLine label="Royalties kept outside mining" value={money(output.retainedRoyalties)}/>
            <LedgerLine emphasis label="Total monthly mining budget" value={money(output.miningFunding)}/>
          </dl>
          {output.miningFunding>0&&<><div className="lm-composition" aria-hidden="true"><i style={{width:(output.adsShare*100)+'%'}}/></div><div className="lm-legend"><span>RMT ads · {Math.round(output.adsShare*100)}%</span><span>Royalties · {100-Math.round(output.adsShare*100)}%</span></div></>}
          {output.netAds<0&&<p className="lm-note lm-down">Separate ad shortfall of {money(-output.netAds)}.</p>}
        </div>
      </div>
    </section>

    <section className="lm-module" aria-labelledby="lm-pilot">
      <header className="lm-section-title"><span>02 / MINING</span><h2 id="lm-pilot">Budget is not profit</h2><p>Model one rental cycle in dollars. Nothing here quotes a live rate or projects a recurring return.</p></header>
      <div className="lm-grid">
        <div className="lm-panel"><h3>Pilot assumptions</h3><div className="lm-fields">{miningFields.map(field)}</div>
          <p className="lm-note">The starting recovery and fee show a prior illustrative $20 example. Change them to test a better or worse outcome.</p></div>
        <div className="lm-panel">
          <h3>Pilot settlement</h3>
          <dl className="lm-ledger">
            <LedgerLine label="Gross pool proceeds" value={money(output.gross)}/>
            <LedgerLine label="Pool fee" value={output.fee?'−'+money(output.fee):money(0)}/>
            <LedgerLine label="Returned after pool fee" value={money(output.returned)}/>
            <LedgerLine label="Rental and other costs" value={output.spend+output.costs?'−'+money(output.spend+output.costs):money(0)}/>
            <LedgerLine emphasis label="Pilot profit / loss" value={signed(output.miningProfit)}/>
          </dl>
          {output.breakEvenGross!==null&&<p className="lm-note">The model needs about {money(output.breakEvenGross)} in gross proceeds to break even.</p>}
          {output.fundingGap>0&&<p className="lm-note lm-down">This pilot needs {money(output.fundingGap)} more than the modeled monthly budget.</p>}
        </div>
      </div>
    </section>

    <section className="lm-module" aria-labelledby="lm-access">
      <header className="lm-section-title"><span>03 / HOLDER ACCESS</span><h2 id="lm-access">What happens if the gate moves?</h2>
      <p>Compare the cost of qualifying and the most wallets that could possibly fit into a {LAMMB_SUPPLY}-NFT supply.</p></header>
      <div className="lm-compare">
        {output.thresholds.map(item=><button type="button" key={item.gate} aria-pressed={item.gate===output.gate} onClick={()=>change('gate',item.gate)}>
          <span>{item.gate===VAULT_MINIMUM?'CURRENT VAULT GATE':'COMPARE'}</span>
          <strong>{item.gate}+ <small>LAMMBs</small></strong>
          <div><b>{money(item.entryCost)}</b><small>Estimated entry cost</small></div>
          <div><b>{item.maxWallets}</b><small>Max possible wallets</small></div>
        </button>)}
      </div>
      <p className="lm-note">Wallet counts are supply ceilings, not observed holders. Entry cost uses your modeled price and excludes fees and price slippage. Selecting any card does not change the live {VAULT_MINIMUM}+ gate.</p>
      <div className="lm-waterline">
        <div><h3>Optional holder scenario</h3><p className="lm-note">This illustration shares only positive mining profit. Rewards are not approved or claimable.</p>
          <div className="lm-fields">{([
            {key:'holderShare',label:'Share of positive profit',max:100,unit:'%'},
            {key:'eligibleNfts',label:'Total NFTs in qualifying wallets',max:LAMMB_SUPPLY},
            {key:'yourNfts',label:'Test wallet holdings',max:LAMMB_SUPPLY}
          ] as Field[]).map(field)}</div></div>
        <div><dl className="lm-ledger">
          <LedgerLine label="Modeled holder pool" value={money(output.distribution)}/>
          <LedgerLine label={'Selected wallet qualifies at '+output.gate+'+'} value={output.wallet>=output.gate?'Yes':'No'}/>
          <LedgerLine emphasis label="Illustrative reward for test wallet" value={fine(output.walletShare)}/>
        </dl>
        {!output.eligibleModel&&<p className="lm-note">Share is zero if the wallet is below the threshold or the modeled eligible supply cannot include it.</p>}</div>
      </div>
    </section>

    <footer className="lm-footer">
      <div><ShieldCheck size={17}/> Read-only model. Inputs stay in this tab.</div>
      <div className="lm-footer-actions"><button className="lv-btn" type="button" onClick={()=>preset('baseline',MODEL_DEFAULT)}><RotateCcw size={15}/> Reset</button>
      <button className="lv-btn primary" type="button" onClick={()=>void copy()}><Copy size={15}/> Copy scenario</button></div>
      {copyState&&<span role="status">{copyState}</span>}
    </footer>
  </main>;
}
