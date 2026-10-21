import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

test('diamonds stay hidden without a private balance, update at zero, and clear on account changes', () => {
  const attrs = new Map();
  const el = { hidden: true, textContent: '', innerHTML: '', dataset: {},
    setAttribute: (key, value) => attrs.set(key, value), removeAttribute: key => attrs.delete(key) };
  const context = createContext({ document: { getElementById: () => el } });
  const source = readFileSync(new URL('../../../public/js/progression/diamonds.js', import.meta.url), 'utf8');
  runInContext(source.replace(/^export /gm, ''), context);
  context.updateDiamondsDisplay(36);
  assert.equal(el.hidden, false);
  assert.equal(attrs.get('aria-label'), 'Diamond Exchange Shop, 36 diamonds');
  context.updateDiamondsDisplay(36, { diamondExchangeRate: 67 });
  assert.equal(el.dataset.tooltip, 'Diamond Exchange Shop: 1 diamond = 67 GC');
  assert.ok(el.innerHTML.includes('<svg'));
  context.updateDiamondsDisplay(0);
  assert.equal(el.hidden, false, 'the owner sees the balance even before earning a diamond');
  assert.equal(attrs.get('aria-label'), 'Diamond Exchange Shop, 0 diamonds');
  for (const value of [undefined, null, NaN, -1, '<img onerror=alert(1)>']) {
    context.updateDiamondsDisplay(value);
    assert.equal(el.hidden, true);
    assert.equal(el.textContent, '');
    assert.equal(attrs.has('aria-label'), false);
  }
  const html = readFileSync(new URL('../../../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="shop-btn"[^\n]+\n\s*<button id="diamonds-display"[^>]* hidden>/);
});

test('resetting rewards on logout or an account switch clears the private diamond balance', () => {
  const balances = [];
  const context = createContext({
    updateDiamondsDisplay: value => balances.push(value),
    closeDiamondExchangeShop() {},
    updateHeartbeatCoinsDisplay() {},
    clearRewardCache() {},
    clearTimeout() {},
  });
  const source = readFileSync(new URL('../../../public/js/progression/rewards.js', import.meta.url), 'utf8');
  const stateStart = source.indexOf('let _lastRewardXp');
  const stateEnd = source.indexOf('// ── Floater queue');
  const resetStart = source.indexOf('export function _resetRewardSnapshotState');
  const resetEnd = source.indexOf('// Return XP, coin, and level deltas');
  runInContext(source.slice(stateStart, stateEnd) + source.slice(resetStart, resetEnd).replace('export ', ''), context);
  context._resetRewardSnapshotState();
  assert.deepEqual(balances, [null]);
});
