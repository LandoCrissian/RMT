import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=new URL(process.env.RMT_TEST_ORIGIN??'').origin;
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Run with an isolated local Worker and synthetic identities.');
const manager='qa-builder-vamps',admin='taxonomy-owner-fixture',member='fixture-calendar-member';
const publicPath='/api/calendar',controlPath='/api/control/calendar',memberPath='/api/calendar/member',managePath='/api/calendar/manage?projectId=vamps';
const headers=user=>user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':'calendar@example.test','x-rmt-account':user}:{};
async function api(path,user,status,body,method='POST'){
  const response=await fetch(origin+path,{headers:{connection:'close',...headers(user),...(body?{origin,'Content-Type':'application/json'}:{})},
    method:body?method:'GET',...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,status,path+' '+user+' '+(body?.action??''));
  return response.json();
}
const title='QA community '+crypto.randomUUID(), edited=title+' revised';
const project=(await api('/api/catalog',null,200)).projects.find(p=>p.id==='vamps');assert.ok(project.website);
const future=new Date(Date.now()+3600000);
const local=new Date(future.getTime()-future.getTimezoneOffset()*60000).toISOString().slice(0,19);
const initial=await api(controlPath,admin,200);
await api(controlPath,null,401);await api(controlPath,member,403);await api(managePath,member,403);await api(memberPath,null,401);
const managerBrowser=await webkit.launch(),adminBrowser=await chromium.launch(process.env.CHROME_CHANNEL?{channel:process.env.CHROME_CHANNEL}:{});
async function pageFor(browser,user,width){
  const page=await browser.newPage({viewport:{width,height:812},serviceWorkers:'block'});page.setDefaultTimeout(20000);
  await page.route(origin+'/**',route=>route.continue({headers:{...route.request().headers(),...headers(user)}}));
  return page;
}
try{
  const page=await pageFor(managerBrowser,manager,375);
  const mod=await pageFor(adminBrowser,admin,1280);
  await page.goto(origin+'/?studio=projects#studio');
  await page.locator('article.st-owned-card').filter({has:page.getByRole('heading',{name:'VAMPS',exact:true})}).getByRole('button',{name:'Events',exact:true}).click();
  await page.getByRole('button',{name:'Create event',exact:true}).click();
  await page.getByLabel('Event title').fill(title);await page.getByLabel('Description',{exact:true}).fill('An isolated fixture for reviewed calendar management.');
  await page.getByLabel('Starts',{exact:true}).fill(local);await page.getByLabel('Event destination').fill(project.website);
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  const card=page.locator('article').filter({has:page.getByRole('heading',{name:title,exact:true})});
  await card.getByText('draft',{exact:true}).waitFor();assert.ok(!(await api(publicPath,null,200)).events.some(e=>e.title===title));
  await card.getByRole('button',{name:'Edit event',exact:true}).click();await page.getByRole('button',{name:'Submit for review'}).click();
  await card.getByText('pending',{exact:true}).waitFor();
  const record=(await api(managePath,manager,200)).events.find(e=>e.title===title);
  assert.ok(record);await api(managePath,manager,409,{action:'submit',projectId:'vamps',id:record.id,expectedRevision:0,fields:record});
  await mod.goto(origin+'/#control');await mod.getByRole('button',{name:'Calendar',exact:true}).click();
  const modCard=mod.locator('article').filter({has:mod.getByRole('heading',{name:title,exact:true})});
  async function confirm(label){
    const d=mod.getByRole('dialog');await d.getByLabel('Reason for this change').fill('Isolated calendar acceptance check.');
    const [r]=await Promise.all([mod.waitForResponse(r=>new URL(r.url()).pathname===controlPath&&r.request().method()==='PATCH'),d.getByRole('button',{name:'Confirm change'}).click()]);
    assert.equal(r.status(),200,label);await d.waitFor({state:'hidden'});
  }
  await modCard.getByRole('button',{name:'Approve',exact:true}).click();await confirm('approve');
  const published=async()=>(await api(publicPath,null,200)).events.find(e=>e.id===record.id);
  assert.equal((await published()).title,title);
  await mod.locator('.calendar-management').getByRole('combobox',{name:/status/i}).selectOption('published');
  await modCard.getByRole('button',{name:'Feature event'}).click();await confirm('feature');assert.equal((await published()).featured,true);
  await modCard.getByRole('button',{name:'Unfeature'}).click();await confirm('unfeature');assert.equal((await published()).featured,false);
  await api(memberPath,member,200,{id:record.id,saved:true,reminder:true});await api(memberPath,member,200,{id:record.id,saved:true,reminder:true});
  const mine=await api(memberPath,member,200);assert.equal(mine.filter(r=>r.id===record.id&&r.reminder).length,1);
  assert.ok(!(await api(memberPath,manager,200)).some(r=>r.id===record.id));
  const inbox='/api/discovery?view=notifications';
  assert.ok((await api(inbox,member,200)).calendarEvents?.some(e=>e.id===record.id));
  assert.ok(!(await api(inbox,manager,200)).calendarEvents?.some(e=>e.id===record.id));
  const afterSave=await api(controlPath,admin,200);assert.equal(afterSave.stats.saved,initial.stats.saved+1);assert.equal(afterSave.stats.reminders,initial.stats.reminders+1);
  await api(memberPath,member,200,{id:record.id,saved:false,reminder:false});
  assert.ok(!(await api(inbox,member,200)).calendarEvents?.some(e=>e.id===record.id));
  await page.goto(origin+'/?studio=projects#studio');await page.locator('article.st-owned-card').filter({has:page.getByRole('heading',{name:'VAMPS',exact:true})}).getByRole('button',{name:'Events',exact:true}).click();
  await card.getByRole('button',{name:'Edit event'}).click();await page.getByLabel('Event title').fill(edited);await page.getByRole('button',{name:'Submit for review'}).click();
  const updated=page.locator('article').filter({has:page.getByRole('heading',{name:edited,exact:true})});
  await updated.getByText('pending',{exact:true}).waitFor();assert.equal((await published()).title,title);
  await mod.reload();await mod.getByRole('button',{name:'Calendar',exact:true}).click();
  await mod.locator('article').filter({has:mod.getByRole('heading',{name:edited,exact:true})}).getByRole('button',{name:'Reject',exact:true}).click();await confirm('reject');
  assert.equal((await published()).title,title);
  await page.goto(origin+'/?studio=projects#studio');await page.locator('article.st-owned-card').filter({has:page.getByRole('heading',{name:'VAMPS',exact:true})}).getByRole('button',{name:'Events',exact:true}).click();
  await updated.getByRole('button',{name:'Cancel event',exact:true}).click();await updated.getByRole('button',{name:'Confirm cancellation',exact:true}).click();
  await updated.getByText('cancelled',{exact:true}).waitFor();
  assert.equal((await published()).status,'cancelled');
  const current=(await api(controlPath,admin,200)).events.find(e=>e.id===record.id);
  await api(controlPath,admin,200,{id:record.id,action:'remove',expectedRevision:current.revision,reason:'Remove cancelled QA fixture.'},'PATCH');
  assert.equal(await published(),undefined);
  const unique='qa-'+crypto.randomUUID().slice(0,8);await api(controlPath,admin,200,{id:unique,action:'type',name:'QA '+unique,archived:false,expectedRevision:0,reason:'Test fixture event type.'},'PATCH');
  const type=(await api(controlPath,admin,200)).types.find(t=>t.id===unique);await api(controlPath,admin,200,{id:unique,action:'type',name:type.name,archived:true,expectedRevision:type.revision,reason:'Archive fixture event type.'},'PATCH');
  const destination=new URL('/events/'+unique,project.website).href,sourceUrl=project.website;
  const imported={...record,title:'Suggest '+unique,destination,sourceUrl,sourceKey:createHash('sha256').update('vamps\n'+destination).digest('hex')};
  await mod.getByText('Official-source suggestions',{exact:true}).click();
  await mod.getByLabel('Calendar suggestions file').setInputFiles({name:'calendar-suggestions.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,suggestions:[imported]}))});
  await mod.getByRole('button',{name:'Review VAMPS · '+imported.title}).click();
  await mod.getByRole('button',{name:'Send suggestion to review'}).click();await confirm('suggest');
  assert.ok((await api(controlPath,admin,200)).events.some(e=>e.title===imported.title&&e.status==='pending'));
  assert.ok(!(await api(publicPath,null,200)).events.some(e=>e.title===imported.title));
  const final=await api(controlPath,admin,200);assert.equal(final.stats.saved,initial.stats.saved);assert.equal(final.stats.reminders,initial.stats.reminders);
  const actions=final.history.filter(h=>h.eventId===record.id).map(h=>h.action);
  for(const action of ['draft','submit','approve','feature','unfeature','reject','cancel','remove'])assert.ok(actions.includes(action),action);
  for(const client of [page,mod])assert.ok(await client.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log('PASS mobile builder draft/edit/submit, desktop approve/reject/editorial picks, source import, type management, cancellation/removal, visibility, audit, authorization and private reminder totals.');
}finally{await managerBrowser.close();await adminBrowser.close();}

