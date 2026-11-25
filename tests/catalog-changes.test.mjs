import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

const result = await build({entryPoints:[fileURLToPath(new URL('../lib/client/catalog-changes.ts', import.meta.url))], bundle:true, format:'esm', write:false});
const {announceCatalogChange, listenForCatalogChanges} = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));

test('publication invalidation reaches the current tab, filters storage events and releases listeners', t => {
  const previous = globalThis.window;
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const writes = [];
  const tab = new EventTarget();
  tab.localStorage = {setItem:(key,value) => writes.push({key,value})};
  globalThis.window = tab;
  let reads = 0;
  const stop = listenForCatalogChanges(() => reads++);
  announceCatalogChange();
  announceCatalogChange();
  assert.equal(reads, 2);
  assert.equal(writes[0].key, writes[1].key);
  assert.match(writes[0].value, /^[a-f0-9-]{36}$/);
  assert.notEqual(writes[0].value, writes[1].value);
  const signal = key => tab.dispatchEvent(Object.assign(new Event('storage'), {key}));
  signal('unrelated');
  assert.equal(reads, 2);
  signal(writes[0].key);
  assert.equal(reads, 3);
  tab.localStorage.setItem = () => {throw new Error('Storage unavailable');};
  announceCatalogChange();
  assert.equal(reads, 4);
  stop();
  signal(writes[0].key);
  announceCatalogChange();
  assert.equal(reads, 4);
});
