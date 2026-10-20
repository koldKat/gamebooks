import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dir = new URL('../../../public/js/', import.meta.url);
test('play-area feature relocation preserves implementations and removes root modules', () => {
  // Excludes imports; includes whitespace cleanup and invite-autocomplete dismissal fixes.
  const digests = {
    "dice": "fd6b7d336ddfd227e995f60446adf91ec142f4c4748531ea5f26a8bf9b9e4f6e",
    "notes": "5559eecce9e5ae9d869fe269264274f6a57e29c264f8b578f5085bbf797ea13a",
    "charsheet": "904243f994aee0d22635d5b3aeaca4d00f1834551eac3ccdfbacc80be0fe1219",
    "open-world": "383d0110865c38f8a46329e33aef695093423be06025ae4e424925a826f89bea",
    // Party sync now catches up on reconnect and refreshes the viewed run reference.
    "party": "fd0fd3faeabdf6b3d187ef3e69935148bfd0f00f4bf69833572e455eb1305d63",
    "bg": "e39f758b5145d695d89bbbee705545e05c0aacec2f297d14663593b96a6850e8"
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
    dice: ['core/state.js', 'ui-helpers/prefs.js', 'play.js'],
    notes: ['core/state.js', 'play.js', 'i18n.js'],
    charsheet: ['core/state.js', 'i18n.js', 'core/util.js'],
    'open-world': ['core/state.js', 'graph.js', 'play.js', 'i18n.js', 'play/charsheet.js', 'equipment.js', 'books.js',
      'play/traveler.js', 'battlesim/travel-character.js', 'battlesim/loader.js'],
    party: ['core/state.js', 'core/event-stream.js', 'graph.js', 'graph/runtime.js', 'play.js', 'core/util.js', 'i18n.js'],
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
