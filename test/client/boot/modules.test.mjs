import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = new URL('../../../public/js/boot/', import.meta.url);

test('boot modules have no internal cycles or back-imports of the entry point', () => {
  const modules = new Map(readdirSync(dir).filter(n => n.endsWith('.js')).map(n => [n, readFileSync(new URL(n, dir), 'utf8')]));
  const visiting = new Set(), visited = new Set();
  function visit(name) {
    assert.ok(!visiting.has(name), `cycle through ${name}`);
    if (visited.has(name)) return;
    visiting.add(name);
    for (const match of modules.get(name).matchAll(/(?:import|export) .* from '([^']+)';/g)) {
      assert.notEqual(match[1], '../boot.js');
      if (!match[1].startsWith('./')) continue;
      const dependency = match[1].slice(2);
      assert.ok(modules.has(dependency), `${name} imports an existing module`);
      visit(dependency);
    }
    visiting.delete(name);
    visited.add(name);
  }
  for (const name of modules.keys()) visit(name);
});

function checkRuntime(scenario) {
  const source = readFileSync(new URL('./runtime-check.fixture', import.meta.url), 'utf8');
  const root = fileURLToPath(new URL('../../../public/js/', import.meta.url));
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '--eval', source, root, JSON.stringify(scenario)], { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

test('boot startup and event integrations execute against isolated feature stubs', () => {
  checkRuntime({ name: 'integration' });
});

for (const scenario of [
  { name: 'signed-in library', token: 'token', screen: 'books-screen' },
  { name: 'signed-in book deep link', token: 'token', hash: '#book/1', screen: 'main-screen' },
  { name: 'admin book deep link', token: 'token', hash: '#book/1', admin: true, screen: 'main-screen' },
  { name: 'special app-XP account', token: 'token', hash: '#book/1', userId: 17, screen: 'main-screen' },
  { name: 'no PDF access', token: 'token', hash: '#book/1', pdfAccess: false, screen: 'main-screen' },
  { name: 'anthology child hides PDF', token: 'token', hash: '#book/1', parentId: 2, screen: 'main-screen' },
  { name: 'mobile book deep link', token: 'token', hash: '#book/1', mobile: true, screen: 'books-screen' },
  { name: 'missing book deep link', token: 'token', hash: '#book/404', screen: 'books-screen' },
  { name: 'public book', pathname: '/book/1', publicCall: 'openCoverActivity', publicId: 1, screen: 'login-screen' },
  { name: 'public anthology', pathname: '/anthology/2', publicCall: 'openCoverActivity', publicId: 2, screen: 'login-screen' },
  { name: 'public series', pathname: '/series/3', publicCall: 'openSeriesActivity', publicId: 3, screen: 'login-screen' },
  { name: 'public player', pathname: '/user/Player%20One', publicCall: 'openPublicProfile', publicId: 'Player One', screen: 'login-screen' },
  { name: 'demo path', pathname: '/demo', demo: true },
  { name: 'saved demo', savedDemo: true, demo: true },
  { name: 'password reset', reset: true, screen: 'login-screen' },
  { name: 'impersonation handoff', search: '?_imp=handoff', screen: 'books-screen' },
]) {
  test(`fresh startup: ${scenario.name}`, () => checkRuntime(scenario));
}
