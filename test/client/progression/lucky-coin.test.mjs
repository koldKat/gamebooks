import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

function setup() {
  const nodes = new Map(), coins = [], requests = [], timers = new Map();
  function element() {
    const classes = new Set();
    return { disabled: false, dataset: {}, style: {}, handlers: {},
      classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name) },
      setAttribute(name, value) { this[name] = value; },
      addEventListener(name, fn) { this.handlers[name] = fn; },
      getBoundingClientRect: () => ({ left: 100, top: 80, width: 90, height: 16 }),
      remove() { this.removed = true; },
    };
  }
  const get = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const c = createContext({
    document: { getElementById: get, createElement: element, body: { appendChild: coin => coins.push(coin) } },
    window: { dispatchEvent() {} }, CustomEvent: class {}, getToken: () => 'token',
    t: key => key, COIN_SVG: '<svg></svg>',
    setTimeout(fn) { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    apiFetch(url, options) { return new Promise(resolve => requests.push({ url, options, resolve })); },
  });
  const source = readFileSync(new URL('../../../public/js/progression/shop.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export \{.*\};$/gm, '').replace(/^export /gm, '');
  runInContext(source, c);
  runInContext('_shopData = { pendingBonusGc: true };', c);
  c.initShop();
  return { c, get, coins, requests, timers };
}

test('wordmark and coin button share one claim; the coin pops only after success', async () => {
  const h = setup(), brand = h.get('brand-coin-btn'), button = h.get('bonus-gc-btn');
  h.c.updateBonusGcIndicator(false);
  assert.equal(brand.disabled, true);
  h.c.updateBonusGcIndicator(true);
  assert.equal(brand.disabled, false);
  assert.equal(brand.dataset.tooltip, 'bonus_gc.tooltip_ready');
  const claim = brand.handlers.click({ currentTarget: brand });
  assert.equal(brand.disabled, true); assert.equal(button.disabled, true);
  await button.handlers.click({ currentTarget: button });
  assert.equal(h.requests.length, 1, 'cross-button double clicks cannot duplicate a claim');
  assert.equal(h.coins.length, 0, 'no coin before the server confirms the claim');
  h.requests[0].resolve({ ok: true, json: async () => ({ pendingBonusGc: false, coinsBalance: 1 }) });
  await claim;
  assert.equal(h.coins.length, 1);
  assert.equal(h.coins[0].style.left, '145px');
  assert.equal(h.coins[0].style.top, '88px');
  assert.equal(brand.disabled, true); assert.equal(button.disabled, true);
  assert.equal(button.classList.contains('bonus-gc-btn--ready'), false);
  h.coins[0].handlers.animationend();
  assert.equal(h.coins[0].removed, true);
  assert.equal(h.timers.size, 0);
});

test('failed claims leave both controls available and do not pop a coin', async () => {
  const h = setup(), brand = h.get('brand-coin-btn');
  h.c.updateBonusGcIndicator(true);
  const claim = brand.handlers.click({ currentTarget: brand });
  h.requests[0].resolve({ ok: false });
  await claim;
  assert.equal(h.coins.length, 0);
  assert.equal(brand.disabled, false);
  assert.equal(h.get('bonus-gc-btn').disabled, false);
});
