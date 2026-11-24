import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiled = await build({stdin: {contents: `export * from './lib/account-navigation';`, resolveDir: root, loader: 'ts'}, absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24'});
const {accountContinuation, continuationFromSearch, signInHref, studioSectionFromSearch} = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

test('claim and project sign-in links retain the exact intended RMT destination', () => {
  for (const destination of ['/#claim/vamps', '/#claim/community-9ea7c0c4-063c-4927-9f59-f051dc450015', '/projects/suited-apes', '/#project/lammbs']) {
    const account = new URL(signInHref(destination), 'https://rmtlaunch.fun');
    assert.equal(account.origin, 'https://rmtlaunch.fun');
    assert.equal(account.pathname, '/');
    assert.equal(account.hash, '#account');
    const continuation = continuationFromSearch(account.search);
    assert.equal(continuation.href, destination);
    assert.equal(continuation.label, 'Continue to your project');
  }
});

test('Builder Studio continuations preserve new applications, management, and claims history', () => {
  for (const [destination, section] of [['/#studio', 'add'], ['/?studio=projects#studio', 'projects'], ['/?studio=claims#studio', 'claims']]) {
    const account = new URL(signInHref(destination), 'https://rmtlaunch.fun');
    const continuation = continuationFromSearch(account.search);
    assert.equal(continuation.label, 'Continue to Builder Studio');
    assert.equal(continuation.href, destination);
    assert.equal(studioSectionFromSearch(new URL(continuation.href, account).search), section);
  }
});

test('ordinary project discovery and library destinations remain available', () => {
  assert.equal(accountContinuation('/#library').label, 'Continue to your library');
  for (const destination of ['/#discover', '/#games', '/#music', '/#tools']) {
    assert.equal(continuationFromSearch(new URL(signInHref(destination), 'https://rmtlaunch.fun').search).href, destination);
  }
  assert.equal(signInHref(), '/#account');
  assert.equal(signInHref('/#account'), '/#account');
});

test('external, encoded, malformed, and unapproved continuations fail closed', () => {
  for (const destination of ['https://attacker.example/', '//attacker.example/', 'https://rmtlaunch.fun/#studio', 'javascript:alert(1)', '/\\attacker.example', '/api/auth/link', '/signin-with-chatgpt', '/#review', '/#claim/../account', '/projects/vamps?next=//attacker.example', '/#claim/vamps%2Fextra', '/#studio\n', '/#studio\r', ' /#studio', '/?studio=projects&next=evil#studio', '/?studio=unknown#studio', '/#claim/' + 'x'.repeat(121), null, 3]) {
    assert.equal(accountContinuation(destination), null, String(destination));
    if (typeof destination === 'string') assert.equal(signInHref(destination), '/#account');
  }
  for (const search of ['', '?continue=%252F%2523studio', '?continue=%', '?continue=%2F%23studio&continue=%2F%23library', '?continue=' + 'x'.repeat(2049)]) {
    assert.equal(continuationFromSearch(search), null, search.slice(0, 80));
  }
  assert.equal(studioSectionFromSearch('?studio=projects&studio=claims'), 'add');
  assert.equal(studioSectionFromSearch('?studio=admin'), 'add');
});
