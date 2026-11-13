import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {rewardFloaterTypeEnabled} from '../../../public/js/progression/floater-policy.js';

function fixture(mobile = true) {
  let enabled = true, idle = true, deferred, breakpoint, nextTimer = 0;
  const events = new Map(), timers = new Map(), chips = [];
  const layers = new Map(['reward-float-layer', 'app-reward-float-layer'].map(id => [id, {
    id, appendChild(chip) { chip.parent = this; },
  }]));
  const media = { matches: mobile, addEventListener(name, callback) { breakpoint = callback; } };
  const context = vm.createContext({
    rewardFloaterTypeEnabled,
    floatiesEnabled: () => enabled,
    waitForCameraIdle(callback) { if (!idle) deferred = callback; return !idle; },
    window: { matchMedia: () => media, addEventListener: (name, callback) => events.set(name, callback) },
    document: {
      getElementById: id => layers.get(id),
      createElement() {
        const chip = { parent: null, children: [], style: {}, setAttribute() {},
          appendChild(child) { this.children.push(child); }, remove() { this.parent = null; } };
        chips.push(chip);
        return chip;
      },
    },
    setTimeout(callback, delay) { assert.equal(delay, 5000); timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: timer => timers.delete(timer),
  });
  const source = readFileSync('public/js/progression/floater-queue.js', 'utf8');
  vm.runInContext(source.replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);
  return {
    enqueue: (...args) => context.enqueueRewardFloater(...args),
    clear: channel => context.clearRewardFloaters(channel),
    visible: () => chips.filter(chip => chip.parent), timers, chips,
    expire() { const [id, callback] = timers.entries().next().value; timers.delete(id); callback(); },
    disable() { enabled = false; events.get('floaties-change')(); },
    cameraBusy() { idle = false; }, cameraIdle() { idle = true; deferred(); },
    resize(value) { media.matches = value; breakpoint(); },
  };
}

test('mobile personal and admin rewards share one origin and FIFO queue', () => {
  const f = fixture();
  for (const [channel, type, html] of [['personal', 'xp', 'own XP'], ['admin', 'xp', 'player XP'],
    ['admin', 'coins', 'player coins'], ['admin', 'diamonds', 'player diamond']]) f.enqueue(channel, type, html);
  for (const expected of ['own XP', 'player XP', 'player coins', 'player diamond']) {
    assert.equal(f.visible().length, 1);
    assert.equal(f.visible()[0].innerHTML, expected);
    assert.equal(f.visible()[0].parent.id, 'reward-float-layer');
    assert.equal(f.timers.size, 1);
    f.expire();
  }
  assert.equal(f.visible().length, 0);
  assert.equal(f.timers.size, 0);
});

test('desktop retains separate concurrent personal and admin lanes', () => {
  const f = fixture(false);
  f.enqueue('personal', 'xp', 'own'); f.enqueue('personal', 'xp', 'next own XP');
  f.enqueue('admin', 'xp', 'other');
  assert.equal(f.visible().length, 2);
  assert.deepEqual(f.visible().map(chip => chip.parent.id), ['reward-float-layer', 'app-reward-float-layer']);
  f.expire();
  assert.deepEqual(f.visible().map(chip => chip.innerHTML), ['other', 'next own XP']);
});

test('disabling floaties clears active chips, queued rewards and timers', () => {
  const f = fixture();
  f.enqueue('admin', 'xp', 'active'); f.enqueue('personal', 'xp', 'queued');
  f.disable(); f.enqueue('admin', 'coins', 'disabled');
  assert.equal(f.visible().length, 0); assert.equal(f.timers.size, 0);
  assert.equal(f.chips.length, 1, 'disabled feedback creates no nodes');
});

test('personal non-XP types never reach the camera queue, DOM or timers; admin keeps them', () => {
  const f = fixture();
  for (const type of ['coins', 'rubies', 'diamonds', 'level']) f.enqueue('personal', type, 'hidden');
  assert.equal(f.chips.length, 0); assert.equal(f.timers.size, 0);
  for (const type of ['coins', 'rubies', 'diamonds', 'level']) {
    f.enqueue('admin', type, type);
    assert.equal(f.visible()[0].innerHTML, type);
    f.expire();
  }
});

test('camera motion defers chip construction for both reward sources', () => {
  const f = fixture(); f.cameraBusy();
  f.enqueue('personal', 'xp', 'own'); f.enqueue('admin', 'xp', 'other');
  assert.equal(f.chips.length, 0); assert.equal(f.timers.size, 0);
  f.cameraIdle(); assert.equal(f.visible()[0].innerHTML, 'own');
  f.expire(); assert.equal(f.visible()[0].innerHTML, 'other');
});

test('clearing personal feedback removes its pending items and releases the admin queue', () => {
  const f = fixture(); f.enqueue('personal', 'xp', 'old account');
  f.enqueue('admin', 'xp', 'other'); f.enqueue('personal', 'coins', 'old coins');
  f.clear('personal'); assert.equal(f.visible().length, 1);
  assert.equal(f.visible()[0].innerHTML, 'other');
  f.expire(); assert.equal(f.visible().length, 0);
});

test('crossing the mobile breakpoint moves chips into one lane without overlap', () => {
  const f = fixture(false); f.enqueue('personal', 'xp', 'own'); f.enqueue('admin', 'xp', 'other');
  f.resize(true); assert.equal(f.visible().length, 1); assert.equal(f.timers.size, 1);
  assert.equal(f.visible()[0].parent.id, 'reward-float-layer');
  f.expire(); assert.equal(f.visible().length, 1);
  assert.equal(f.visible()[0].innerHTML, 'other');
  assert.equal(f.visible()[0].parent.id, 'reward-float-layer');
  f.resize(false); assert.equal(f.visible()[0].parent.id, 'app-reward-float-layer');
});

test('survival drips vary per chip, share its lifetime and skip preparation when disabled', () => {
  const f=fixture();
  f.enqueue('personal','survival','red');
  const red=f.visible()[0];assert.ok(red.children.length>=4&&red.children.length<=6);
  const pattern=red.children.map(drop=>drop.style.cssText);
  assert.equal(new Set(pattern).size,pattern.length);
  assert.equal(f.timers.size,1,'drips add no JavaScript timers');
  f.expire();assert.equal(f.visible().length,0);
  f.enqueue('personal','survival-green','green');
  assert.notDeepEqual(f.visible()[0].children.map(drop=>drop.style.cssText),pattern);
  f.disable();const count=f.chips.length;
  f.enqueue('personal','survival','hidden');assert.equal(f.chips.length,count);
  assert.equal(f.timers.size,0);
});
