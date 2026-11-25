// Run against an isolated RMT Worker with the Playwright Chromium/WebKit browsers installed.
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.RMT_TEST_ORIGIN;
if(!origin)throw Error('Set RMT_TEST_ORIGIN to an isolated RMT site.');
const getButton=(scope,name)=>scope.getByRole('button',{name,exact:true});
for(const [engine,width,height] of [[webkit,320,568],[webkit,375,812],[webkit,390,844],[webkit,430,932],[webkit,844,390],[chromium,768,1024],[chromium,1280,812]]){
 const browser=await engine.launch(engine===chromium&&process.env.CHROME_CHANNEL?{channel:process.env.CHROME_CHANNEL}:{});
 try{
  const page=await browser.newPage({viewport:{width,height},extraHTTPHeaders:{DNT:'1'}});
  const guideResponse=page.waitForResponse(r=>r.url().includes('/api/catalog'));await page.goto(origin);await guideResponse;const trigger=page.locator('.guide-entry-button'),directory=page.locator('.directory-heading').first();
  await trigger.scrollIntoViewIfNeeded();
  const offset=()=>page.evaluate(()=>window.scrollY);
  const dirTop=()=>directory.evaluate(el=>el.getBoundingClientRect().top+window.scrollY);
  
  await trigger.evaluate(el=>el.addEventListener('click',()=>{window.__guideStart={y:scrollY,top:document.querySelector('.directory-heading').getBoundingClientRect().top+scrollY};},{capture:true,once:true}));
  const sheet=page.locator('dialog.guide-dialog[open]');
  await trigger.click();const progress=sheet.getByRole('progressbar');
  await progress.waitFor();const count=Number(await progress.getAttribute('max'));assert.ok(count>1);
  for(let i=1;i<=count;i++){
   assert.equal(await progress.getAttribute('value'),String(i));
   assert.ok((await sheet.locator('h2').innerText()).trim());
   const rect=await sheet.boundingBox();assert.ok(rect.width>=Math.min(width-32,600)&&rect.height<=height);
   assert.ok(await sheet.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   assert.equal(await getButton(sheet,'Back').isDisabled(),i===1);
   if(i===2&&process.env.RMT_SCREENSHOTS)await page.screenshot({path:process.env.RMT_SCREENSHOTS+'/guide-'+width+'.png'});
   if(i<count)await getButton(sheet,'Next').click();
  }
  await getButton(sheet,'Back').click();await getButton(sheet,'Close beginner guide').click();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const {y,top}=await page.evaluate(()=>window.__guideStart);
  assert.ok(Math.abs(await offset()-y)<=1,'scroll before '+y+' after '+await offset());assert.ok(Math.abs(await dirTop()-top)<=1,'directory position before '+top+' after '+await dirTop());
  assert.ok(await trigger.evaluate(el=>el===document.activeElement));
  const reload=await page.reload();assert.equal(reload?.status(),200);await trigger.click();await progress.waitFor();assert.equal(await progress.getAttribute('value'),String(count-1));
  await getButton(sheet,'Skip guide').click();await trigger.click();await progress.waitFor();assert.equal(await progress.getAttribute('value'),String(count-1));
  await getButton(sheet,'Next').click();await getButton(sheet,'Finish guide').click();await trigger.click();await progress.waitFor();assert.equal(await progress.getAttribute('value'),'1');
  await page.keyboard.press('Escape');await sheet.waitFor({state:'detached'});
  if(width===375){
   
   await page.evaluate(()=>{const original=window.fetch;window.fetch=(input,init)=>{if(String(input).includes('view=guide')){window.fetch=original;return Promise.resolve(new Response('Unavailable',{status:503}));}return original(input,init);};});
   await trigger.click();await sheet.getByRole('alert').waitFor();
   await getButton(sheet,'Retry').click();await progress.waitFor();
   await getButton(sheet,'Close beginner guide').click();
  }
  await getButton(page,'Project updates').click();await page.waitForURL('**/#activity');
  console.log(engine.name(),width+'×'+height,count,'lessons, controls, persistence, scroll restoration and updates passed');
 }finally{await browser.close();}
}
