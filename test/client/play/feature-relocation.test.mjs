import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dir = new URL('../../../public/js/', import.meta.url);
test('play-area feature relocation preserves implementations and removes root modules', () => {
  // Source captured before the relocation, excluding single/multiline imports.
  const digests = {
    "dice": "69b88cecc8f0cf1f3af3869d3bf2516a1ad855eb5fab14a68fb233133737cafe",
    "notes": "cecf0aff0511e7a5dd28662c1b10e53052974bef3f02e6567ccbeb0fe8c1dd1a",
    "charsheet": "0490f98d4e79891aed8514d1539b91f0a4c6213a2271710669bacda022f2ed7a",
    "open-world": "a416341135a747532d5e2301e53c73b353ccbabde8964ffeb30a81271d066445",
    "party": "4f5f03ab9a8ef9371fbea87cfb8a121d3b7cbeb90456389fa3657cb54ad44a32",
    "bg": "e20516bdddf683f1557e291b2db06013c7ed676740290f7a5ebd9acc75f7084c"
  };
  for (const [name, digest] of Object.entries(digests)) {
    assert.equal(existsSync(new URL(name + '.js', dir)), false);
    const source = readFileSync(new URL('play/' + name + '.js', dir), 'utf8');
    assert.equal(createHash('sha256').update(source.replace(/^import[\s\S]*?;$/gm, '')).digest('hex'), digest);
  }
  assert.ok(existsSync(new URL('play.js', dir)), 'existing controller facade remains');
  assert.ok(existsSync(new URL('../mobile/js/notebook.js', dir)), 'mobile notebook remains independent');
});

test('relocated play features retain their original dependency identities and order', () => {
  const expected = {
    dice: ['core/state.js', 'prefs.js', 'play.js'],
    notes: ['core/state.js', 'play.js', 'i18n.js'],
    charsheet: ['core/state.js', 'i18n.js', 'core/util.js'],
    'open-world': ['core/state.js', 'graph.js', 'play.js', 'i18n.js', 'play/charsheet.js', 'equipment.js', 'books.js'],
    party: ['core/state.js', 'play.js', 'core/util.js', 'i18n.js'],
    bg: ['core/state.js', 'i18n.js'],
  };
  for (const [name, dependencies] of Object.entries(expected)) {
    const moduleUrl = new URL('play/' + name + '.js', dir);
    const source = readFileSync(moduleUrl, 'utf8');
    const actual = [...source.matchAll(/^import[\s\S]*?from '([^']+)';$/gm)]
      .map(match => new URL(match[1], moduleUrl).href);
    assert.deepEqual(actual, dependencies.map(path => new URL(path, dir).href));
  }
});
