import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

function setup() {
  const nodes = new Map(), requests = [];
  function element() {
    const classes = new Set();
    return { disabled: false, dataset: {}, handlers: {},
      classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name) },
      addEventListener(name, fn) { this.handlers[name] = fn; },
    };
  }
  const get = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const c = createContext({
    document: { getElementById: get },
    window: { dispatchEvent() {} }, CustomEvent: class {}, getToken: () => 'token',
    t: key => key, COIN_SVG: '<svg></svg>',
    apiFetch(url, options) { return new Promise(resolve => requests.push({ url, options, resolve })); },
  });
  const source = readFileSync(new URL('../../../public/js/progression/shop.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export \{.*\};$/gm, '').replace(/^export /gm, '');
  runInContext(source, c);
  runInContext('_shopData = { pendingBonusGc: true };', c);
  c.initShop();
  return { c, get, requests, nodes };
}

test('normal coin button claims a pending lucky coin once and returns to its inactive state', async () => {
  const h = setup(), button = h.get('bonus-gc-btn');
  h.c.updateBonusGcIndicator(false);
  assert.equal(button.disabled, true);
  h.c.updateBonusGcIndicator(true);
  assert.equal(button.disabled, false);
  assert.equal(button.dataset.tooltip, 'bonus_gc.tooltip_ready');
  assert.equal(h.nodes.has('brand-coin-btn'), false, 'wordmark is not part of claiming');
  const claim = button.handlers.click();
  assert.equal(button.disabled, true);
  await button.handlers.click();
  assert.equal(h.requests.length, 1, 'repeated clicks cannot duplicate a claim');
  assert.equal(h.requests[0].url, '/api/shop/claim-gc');
  assert.equal(h.requests[0].options.method, 'POST');
  h.requests[0].resolve({ ok: true, json: async () => ({ pendingBonusGc: false, coinsBalance: 1 }) });
  await claim;
  assert.equal(button.disabled, true);
  assert.equal(button.classList.contains('bonus-gc-btn--ready'), false);
  assert.ok(h.get('coins-display').innerHTML.includes('1'));
});

test('failed normal coin claims keep the pending coin available for retry', async () => {
  const h = setup(), button = h.get('bonus-gc-btn');
  h.c.updateBonusGcIndicator(true);
  const claim = button.handlers.click();
  h.requests[0].resolve({ ok: false });
  await claim;
  assert.equal(button.disabled, false);
  assert.equal(button.classList.contains('bonus-gc-btn--ready'), true);
});
