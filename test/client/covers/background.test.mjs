import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('hide and restart cancel crossfades without resurrecting or blanking a background', async () => {
  const keys = ['window', 'document', 'localStorage', 'Image', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame'];
  const saved = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const timers = new Map(), intervals = new Map(), frames = [];
  const images = [];
  let nextId = 1;
  globalThis.localStorage = { getItem: () => null };
  globalThis.window = { innerWidth: 1280, matchMedia: () => ({ matches: false }) };
  globalThis.setTimeout = (fn, ms) => { const id = nextId++; timers.set(id, {fn, ms}); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  globalThis.setInterval = fn => { const id = nextId++; intervals.set(id, fn); return id; };
  globalThis.clearInterval = id => intervals.delete(id);
  globalThis.requestAnimationFrame = fn => frames.push(fn);
  globalThis.Image = class {
    naturalWidth = 100;
    constructor() { images.push(this); }
    decode() { return Promise.resolve(); }
  };
  const settle = () => new Promise(resolve => saved.setTimeout(resolve, 0));
  const fire = ms => {
    const timer = [...timers.entries()].find(([, value]) => value.ms === ms);
    assert.ok(timer, `expected ${ms}ms timer`);
    timers.delete(timer[0]); timer[1].fn();
  };
  const vars = new Map();
  const root = { style: { setProperty: (key, value) => vars.set(key, value), getPropertyValue: key => vars.get(key) || '' } };
  const a = { style: { opacity: '0' } }, b = { style: { opacity: '0' } };
  const wrapper = { style: {} };
  globalThis.document = { documentElement: root, getElementById: id => ({ 'landing-bg-a': a, 'landing-bg-b': b, 'landing-wrapper': wrapper })[id] || null };
  try {
    const { coversState } = await import('../../../public/js/covers/state.js');
    const { _startLandingCoverRotation, _stopLandingCoverRotation, _rotateLandingCover } = await import('../../../public/js/covers/background.js');
    coversState._landingBgHidden = false;
    coversState._landingBgActive = 'a';
    coversState._allCovers = [1, 2, 3].map(id => ({id, coverUrl: `/cover${id}.jpg`}));
    coversState._landingBgQueue = [...coversState._allCovers];
    coversState._landingBgQueueIdx = 0;
    coversState._landingCoverPosPrefs = {'3': 80};
    _startLandingCoverRotation();
    const firstInterval = window._landingCoverInterval;
    assert.equal(b.style.opacity, '0', 'wait for a downloaded and decoded image');
    assert.equal(vars.get('--landing-cover-url'), undefined);
    images[0].onload(); await settle();
    assert.equal(b.style.opacity, '1');
    _startLandingCoverRotation();
    assert.equal(window._landingCoverInterval, firstInterval);
    _rotateLandingCover();
    _rotateLandingCover();
    assert.equal(images.length, 1, 'overlapping refreshes queue only one rotation');
    fire(3300); fire(3400);
    assert.equal(images.length, 2);
    assert.equal(b.style.opacity, '1', 'outgoing cover remains visible during a slow download');
    assert.equal(coversState._landingBgCurrentKey, '1', 'drag position still belongs to visible cover');
    images[1].onerror();
    assert.equal(b.style.opacity, '1', 'failed image cannot replace the visible cover');
    assert.equal(timers.size, 0);
    _rotateLandingCover();
    let decoded;
    images[2].decode = () => new Promise(resolve => { decoded = resolve; });
    images[2].onload(); await settle();
    assert.equal(coversState._landingBgCurrentKey, '1', 'decode must finish before changing position or glass cards');
    decoded(); await settle();
    assert.equal(a.style.opacity, '1');
    assert.equal(coversState._landingBgCurrentKey, '3');
    assert.equal(coversState._landingBgPosY, 80);
    const staleCallback = [...timers.values()].find(timer => timer.ms === 3300).fn;
    _stopLandingCoverRotation();
    assert.equal(timers.size, 0);
    assert.equal(intervals.size, 0);
    coversState._landingBgHidden = true;
    staleCallback();
    _startLandingCoverRotation();
    _rotateLandingCover();
    assert.equal(a.style.opacity, '0');
    assert.equal(b.style.opacity, '0');
    assert.equal(vars.get('--landing-cover-url'), '');
    assert.equal(intervals.size, 0, 'refreshes cannot restart a deliberately hidden background');
    coversState._landingBgHidden = false;
    _startLandingCoverRotation();
    const pending = images.at(-1).onload;
    _stopLandingCoverRotation();
    pending(); await settle();
    assert.equal(vars.get('--landing-cover-url'), '', 'late image load cannot resurrect a stopped background');
    _startLandingCoverRotation();
    images.at(-1).onload(); await settle();
    assert.equal(b.style.opacity, '1', 'restart paints without waiting for the cancelled fade');
    staleCallback();
    assert.equal(b.style.opacity, '1', 'old fade cannot blank the new active layer');
    _stopLandingCoverRotation();
    _rotateLandingCover();
    images.at(-1).decode = () => Promise.reject(new Error('decode failed'));
    images.at(-1).onload(); await settle();
    assert.equal(timers.size, 0, 'decode failure releases the rotation');
    _rotateLandingCover();
    fire(20000);
    const loadedCount = images.length;
    _rotateLandingCover();
    assert.equal(images.length, loadedCount + 1, 'stalled downloads do not wedge future rotations');
    _stopLandingCoverRotation();
    wrapper.style.display = 'none';
    _startLandingCoverRotation();
    _rotateLandingCover();
    assert.equal(intervals.size, 0);
    assert.equal(a.style.opacity, '0');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test('landing layers and cover-backed feed cards share the requested 3.3-second fade', () => {
  for (const file of ['landing.css', 'feed.css']) {
    const css = readFileSync(new URL('../../../public/css/' + file, import.meta.url), 'utf8');
    assert.match(css, /transition: opacity 3\.3s ease;/);
  }
});
