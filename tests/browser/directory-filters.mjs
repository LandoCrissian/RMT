import assert from 'node:assert/strict';
const {chromium,webkit} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.RMT_TEST_ORIGIN;
if (!origin) throw new Error('Set RMT_TEST_ORIGIN to an isolated RMT site.');

for (const [engine,width,height] of [[webkit,320,568],[webkit,375,812],[webkit,390,844],[webkit,430,932],[webkit,844,390],[chromium,768,1024],[chromium,1280,812]]) {
  const browser = await engine.launch(engine===chromium && process.env.CHROME_CHANNEL ? {channel:process.env.CHROME_CHANNEL} : {});
  try {
    const page = await browser.newPage({viewport:{width,height},extraHTTPHeaders:{DNT:'1'}});
    const catalogResponse = page.waitForResponse(response=>new URL(response.url()).pathname==='/api/catalog');
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    const {categories,projects} = await (await catalogResponse).json();
    const trigger = page.getByRole('button',{name:'Filters',exact:true});
    const dialog = page.getByRole('dialog',{name:'Categories'});
    const count = page.locator('.directory-heading .count-pill');
    const applies = (project,id) => project.classification.primary===id || project.classification.secondary.includes(id);
    const first = categories.find(category=>projects.some(project=>applies(project,category.id)));
    const second = categories.find(category=>category.id!==first.id && projects.some(project=>applies(project,category.id)));
    const union = projects.filter(project=>applies(project,first.id)||applies(project,second.id)).length;
    const option = name => dialog.getByRole('checkbox',{name:new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))});
    await trigger.click();
    assert.equal(await dialog.getByRole('checkbox').count(),categories.filter(c=>!c.archived).length);
    assert.equal(await count.innerText(),String(projects.length));
    await option(first.name).check();
    assert.equal(await option(first.name).locator('..').locator('small').innerText(),String(projects.filter(project=>applies(project,first.id)).length));
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'detached'});
    assert.ok(await trigger.evaluate(element=>document.activeElement===element));
    assert.equal(await count.innerText(),String(projects.length));
    await trigger.click();
    assert.equal(await option(first.name).isChecked(),false);
    await option(first.name).check();await option(second.name).check();
    const apply=dialog.getByRole('button',{name:'Apply ('+union+')',exact:true});
    await apply.waitFor();
    const box=await dialog.boundingBox();
    assert.ok(box.x>=-1 && box.y>=-1 && box.x+box.width<=width+1 && box.y+box.height<=height+1);
    assert.ok(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1));
    if(process.env.RMT_SCREENSHOTS) await page.screenshot({path:process.env.RMT_SCREENSHOTS+'/filters-'+width+'.png'});
    await apply.click();await dialog.waitFor({state:'detached'});
    assert.equal(await count.innerText(),String(union));
    await page.getByRole('button',{name:'Remove '+first.name+' filter',exact:true}).click();
    assert.equal(await count.innerText(),String(projects.filter(project=>applies(project,second.id)).length));
    await page.locator('.filter-trigger').click();await dialog.getByRole('button',{name:'Clear',exact:true}).click();
    await dialog.getByRole('button',{name:'Apply ('+projects.length+')',exact:true}).click();
    assert.equal(await count.innerText(),String(projects.length));
    assert.equal(await page.getByRole('group',{name:'Applied categories'}).count(),0);
    if(width===320 || width===1280) {
      const pick=categories.slice(0,3);
      await trigger.click();
      for(const category of pick) await option(category.name).check();
      await dialog.getByRole('button',{name:/^Apply/}).click();
      const chips=page.getByRole('group',{name:'Applied categories'});
      assert.equal(await chips.getByRole('button').count(),3);
      await chips.getByRole('button',{name:'View all 3 applied categories'}).click();
      await dialog.getByRole('button',{name:'Clear',exact:true}).click();
      await dialog.getByRole('button',{name:/^Apply/}).click();
      const search=page.getByRole('searchbox');await search.fill('no-matching-project-for-filter-qa');
      await trigger.click();await option(first.name).focus();await page.keyboard.press('Space');
      assert.equal(await option(first.name).isChecked(),true);
      await dialog.getByRole('button',{name:'Apply (0)',exact:true}).click();
      assert.equal(await count.innerText(),'0');
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    console.log(engine.name(),width+'×'+height,'category counts, draft, cancel, focus, apply, chips, clear and layout passed');
  } finally {await browser.close();}
}
