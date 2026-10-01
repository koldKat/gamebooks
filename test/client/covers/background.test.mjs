import { test } from 'node:test';
import assert from 'node:assert/strict';

test('hide and restart cancel crossfades without resurrecting or blanking a background', async () => {
  const keys = ['window', 'document', 'localStorage', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame'];
  const saved = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const timers = new Map(), intervals = new Map(), frames = [];
  let nextId = 1;
  globalThis.localStorage = { getItem: () => null };
  globalThis.window = { innerWidth: 1280, matchMedia: () => ({ matches: false }) };
  globalThis.setTimeout = fn => { const id = nextId++; timers.set(id, fn); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  globalThis.setInterval = fn => { const id = nextId++; intervals.set(id, fn); return id; };
  globalThis.clearInterval = id => intervals.delete(id);
  globalThis.requestAnimationFrame = fn => frames.push(fn);
  const vars = new Map();
  const root = { style: { setProperty: (key, value) => vars.set(key, value), getPropertyValue: key => vars.get(key) || '' } };
  const a = { style: { opacity: '0' } }, b = { style: { opacity: '0' } };
  const wrapper = { style: {} };
  globalThis.document = { documentElement: root, getElementById: id => ({ 'landing-bg-a': a, 'landing-bg-b': b, 'landing-wrapper': wrapper })[id] || null };
  try {
    const { coversState } = await import('../../../public/js/covers/state.js');
    const { _startLandingCoverRotation, _stopLandingCoverRotation, _rotateLandingCover } = await import('../../../public/js/covers/background.js');
    coversState._allCovers = [{ id: 1, coverUrl: '/cover.jpg' }];
    _startLandingCoverRotation();
    const firstInterval = window._landingCoverInterval;
    assert.equal(b.style.opacity, '1');
    _startLandingCoverRotation();
    assert.equal(window._landingCoverInterval, firstInterval);
    _rotateLandingCover();
    const staleCallback = [...timers.values()][0];
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
    assert.equal(a.style.opacity, '1', 'restart paints without waiting for the cancelled fade');
    staleCallback();
    assert.equal(a.style.opacity, '1', 'old fade cannot blank the new active layer');
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
