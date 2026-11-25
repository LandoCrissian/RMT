import {mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import sharp from 'sharp';

// The art direction uses only approved local collection and destination images.
// All three designs retain the same canvas, RMT signature and canonical URL.
export async function buildShowcaseCards(root,rebuild=false) {
  const assets=join(root,'public/projects');
  const out=join(root,'lib/server/share-card-images');
  await mkdir(out,{recursive:true});
  const svg=body=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">${body}</svg>`);
  const stamp=(x,y)=>`<g transform="translate(${x},${y})"><rect width="82" height="38" rx="6" fill="#ccff00"/><text x="41" y="27" text-anchor="middle" font-family="Arial,sans-serif" font-size="23" font-weight="bold" fill="#10120e">RMT</text></g>`;
  const image=async(file,left,top,width,height,fit='cover')=>({input:await sharp(join(assets,file+'.webp')).resize(width,height,{fit,background:'#080a08'}).jpeg({quality:94}).toBuffer(),left,top});
  const text=(x,y,value,size,color,options='')=>`<text x="${x}" y="${y}" font-family="Arial,sans-serif" fill="${color}" font-size="${size}" ${options}>${value}</text>`;
  const overlay=markup=>({input:svg(markup),left:0,top:0});
  const render=(id,bg,layers)=>sharp({create:{width:1200,height:630,channels:3,background:bg}}).composite(layers).jpeg({quality:91,mozjpeg:true}).toFile(join(out,id+'.jpg'));

  if(rebuild || !existsSync(join(out,'moneymomos.jpg'))) await render('moneymomos','#19130e',[
    await image('moneymomos-cover',0,0,1200,387,'contain'),
    await image('moneymomos-elite',755,407,193,113), await image('moneymomos-council',963,407,193,113),
    overlay(stamp(40,26)+'<rect y="386" width="1200" height="4" fill="#f3ba53"/>'+
      text(44,451,'STEAMVILLE',20,'#f1bf68','letter-spacing="4" font-weight="bold"')+
      text(40,532,'MoneyMomos',86,'#fff2d9','font-weight="bold" letter-spacing="-4"')+
      text(756,551,'The Elite Compound',20,'#f4dfb8')+text(966,551,'The Council',20,'#f4dfb8')+
      text(44,595,'rmtlaunch.fun/projects/moneymomos',25,'#f1bf68')),
  ]);
  if(rebuild || !existsSync(join(out,'wif-outlaws.jpg'))) await render('wif-outlaws','#141714',[
    await image('wif-outlaws-banner',0,0,1200,630),
    overlay('<defs><linearGradient id="shade"><stop stop-color="#050806" stop-opacity=".95"/><stop offset=".48" stop-color="#070b08" stop-opacity=".62"/><stop offset=".78" stop-color="#101510" stop-opacity="0"/></linearGradient></defs><rect width="1200" height="630" fill="url(#shade)"/>'+stamp(44,35)+
      text(48,195,'ROBINWIFHAT',22,'#f8a565','letter-spacing="4" font-weight="bold"')+
      text(35,326,'WIF',145,'#ffffff','font-weight="bold" letter-spacing="-5"')+
      text(37,438,'OUTLAWS',104,'#ffffff','font-weight="bold" letter-spacing="-5"')+
      '<path d="M45 480h236l-10 12H45zM292 480h25l-10 12h-25z" fill="#ef9659"/>'+
      text(46,581,'rmtlaunch.fun/projects/wif-outlaws',25,'#fff3e8')),
  ]);
  if(rebuild || !existsSync(join(out,'bored-traders.jpg'))) await render('bored-traders','#0b1411',[
    await image('bored-traders-art',657,49,472,472,'contain'),
    overlay(stamp(46,42)+'<g fill="none" stroke="#5aef92" stroke-width="3"><path d="M646 77V38h39m416 0h39v39m0 416v39h-39m-416 0h-39v-39"/><path d="M46 154h525m-525 306h525" stroke="#304e40"/></g>'+
      '<g font-family="DejaVu Sans Mono, monospace"><text x="46" y="127" font-size="22" letter-spacing="2" fill="#8ccfa9">BORED TRADER TERMINAL</text><text x="39" y="286" font-size="105" font-weight="bold" fill="#ddf3df">Bored</text><text x="39" y="396" font-size="105" font-weight="bold" fill="#68f89a">Traders</text><text x="657" y="573" font-size="23" fill="#b1cebc">Bored Trader #1</text></g>'+
      text(48,575,'rmtlaunch.fun/projects/bored-traders',25,'#89d7aa')),
  ]);
}
