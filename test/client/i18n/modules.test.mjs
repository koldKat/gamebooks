import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('translation split preserves the public API and unchanged lookup/DOM runtime', () => {
  const facade = readFileSync(new URL('../../../public/js/i18n.js', import.meta.url), 'utf8');
  assert.match(facade, /export \{ t, applyTranslations, setTranslationOverride \} from '\.\/i18n\/runtime\.js';/);
  const runtime = readFileSync(new URL('../../../public/js/i18n/runtime.js', import.meta.url), 'utf8');
  assert.equal(createHash('sha256').update(runtime.slice(runtime.indexOf('let _lang'))).digest('hex'),
    '9eb537ae5e8e0216db9d930e2d39f07290cfc62aba56dd656bbfa12de02f7023');
  assert.match(runtime, /^import en from '\.\/en\/index\.js';/);
  assert.doesNotMatch(runtime, /import\(|fetch\(|setTimeout|setInterval/);
});

test('all translation entries, public lookups, interpolation and DOM bindings retain behavior', () => {
  const fixture = readFileSync(new URL('./runtime.fixture', import.meta.url), 'utf8');
  const root = fileURLToPath(new URL('../../../public/js/', import.meta.url));
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '--eval', fixture, root],
    { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
