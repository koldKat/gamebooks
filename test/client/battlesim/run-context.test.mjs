import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function context() {
  const scope = {state:{playthroughs:[]}, viewingPt:null, currentBookId:1307,
    active:null, saves:0, requests:[], structuredClone, Response};
  scope.activeRun = () => scope.active;
  scope.saveActiveState = () => scope.saves++;
  scope.fetchActive = (...args) => {scope.requests.push(args); return Promise.resolve(new Response('{}'));};
  const source = readFileSync(new URL('../../../public/js/battlesim/run-context.js', import.meta.url),'utf8')
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*'[^']+';\n/g, '')
    .replace(/export\s*\{[^}]+\}\s*from\s*'[^']+';\n/g, '')
    .replace(/^export /gm, '');
  runInNewContext(source + '\napi = {currentPlaythrough,saveState,apiFetch,isReadOnlySimulator};', scope);
  return scope;
}
test('no-run simulator preview is isolated and blocks saves and mutating requests', async () => {
  const c = context(), preview = c.api.currentPlaythrough();
  assert.equal(c.api.isReadOnlySimulator(), true);
  preview.sim1307 = {history:[{outcome:'win'}]};
  assert.equal(c.state.playthroughs.length, 0);
  assert.equal(c.api.currentPlaythrough(), preview);
  await c.api.saveState();
  assert.equal((await c.api.apiFetch('/api/state',{method:'POST'})).status, 403);
  await c.api.apiFetch('/api/books/1307/enemies');
  assert.equal(c.saves, 0); assert.equal(c.requests.length, 1);
});
test('completed-run preview preserves source and releases copies when active editing resumes', () => {
  const c = context();
  c.viewingPt = {completed:true,sim1307:{history:[{outcome:'win'}]}};
  const original = JSON.stringify(c.viewingPt), preview = c.api.currentPlaythrough();
  preview.sim1307.history.push({outcome:'loss'});
  assert.equal(JSON.stringify(c.viewingPt), original);
  c.active = {path:[1]};
  assert.equal(c.api.currentPlaythrough(), c.active);
  c.api.saveState(); assert.equal(c.saves, 1);
  c.active = null;
  assert.notEqual(c.api.currentPlaythrough(), preview);
  c.currentBookId = 8;
  assert.notEqual(c.api.currentPlaythrough(), preview);
});
test('every simulator run binding goes through the shared protected context', () => {
  const root = new URL('../../../public/js/battlesim/', import.meta.url);
  function scan(dir) {
    for (const entry of readdirSync(dir,{withFileTypes:true})) {
      const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''),dir);
      if (entry.isDirectory()) scan(path);
      else if (entry.name.endsWith('.js') && entry.name !== 'run-context.js') {
        const source = readFileSync(path,'utf8');
        for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
          if (/\b(?:currentPlaythrough|saveState)\b/.test(match[1])) assert.ok(!match[2].endsWith('/core/state.js'), path.pathname);
        }
      }
    }
  }
  scan(root);
});
