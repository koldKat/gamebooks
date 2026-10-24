import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

function setup() {
  const nodes = new Map(), requests = [], snapshots = [];
  let token = 'owner';
  const get = id => {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, { innerHTML: '', textContent: '', dataset: {}, handlers: {},
        classList: { add: k => classes.add(k), remove: k => classes.delete(k), contains: k => classes.has(k), toggle: (k, on) => on ? classes.add(k) : classes.delete(k) },
        addEventListener(k, fn) { this.handlers[k] = fn; },
        querySelectorAll() {
          return [...this.innerHTML.matchAll(/<button\b([^>]*data-item="([^"]+)"[^>]*)>/g)]
            .filter(match => !/\bdisabled\b/.test(match[1])).map(match => {
              const button = get('buy-' + match[2]); button.dataset.item = match[2]; return button;
            });
        },
      });
    }
    return nodes.get(id);
  };
  const strings = createContext({});
  runInContext(readFileSync(new URL('../../../public/js/i18n/en/progression.js', import.meta.url), 'utf8').replace('export default', 'globalThis.strings='), strings);
  const context = createContext({ document: { getElementById: get }, window: { dispatchEvent() {} }, CustomEvent: class {},
    getToken: () => token, COIN_SVG: '<svg class="coin-icon"></svg>', DIAMOND_SVG: '<svg class="diamond-icon"></svg>', escapeHtml: String,
    initBlackMarket() {},
    t: (key, values = {}) => (strings.strings[key] || key).replace(/\{(\w+)\}/g, (_, k) => values[k] ?? `{${k}}`),
    apiFetch(url, options) { return new Promise(resolve => requests.push({ url, options, resolve })); },
    setTimeout, clearTimeout,
  });
  const source = readFileSync(new URL('../../../public/js/progression/shop.js', import.meta.url), 'utf8');
  runInContext(source.replace(/^import .*;$/gm, '').replace(/^export \{.*\};$/gm, '').replace(/^export /gm, ''), context);
  context.setShopHooks({ onRewardSnapshot: data => snapshots.push(data) });
  const render = data => { context.data = data; runInContext('_shopData=data;renderShopItems()', context); return get('shop-items').innerHTML; };
  return { context, get, requests, snapshots, render, switchAccount() { token = 'other'; } };
}

test('private diamond upgrades sit after Coin Mint and before Extra Undo with escalating costs and current rates', () => {
  const h = setup();
  const html = h.render({ level: 10, coinsBalance: 55, diamondsBalance: 2,
    diamondDigPurchased: 2, diamondExchangePurchased: 3, diamondDigPct: 1.2,
    diamondEventsPerDiamond: 1000 / 1.012, diamondExchangeRate: 13 });
  assert.deepEqual([...html.matchAll(/data-item="([^"]+)"/g)].map(match => match[1]),
    ['xp_boost', 'heartbeat_xp', 'gc_chance', 'gc_mint', 'diamond_dig', 'undo', 'fast_travel']);
  assert.match(html, /Ruby Digging/); assert.match(html, /future XP events/);
  assert.match(html, /Current: \+1.2% digging speed \(1.0 base \+ 0.2 bought\)/);
  assert.match(html, /shop-item-effect">1 <span role="img" aria-label="Gold coin"><svg class="coin-icon"><\/svg><\/span> per/);
  assert.match(html, /shop-item-effect">1 <span role="img" aria-label="Ruby"><svg class="diamond-icon"><\/svg><\/span> per/);
  assert.equal(runInContext('SHOP_ITEMS.find(x=>x.id===\'diamond_dig\').costFn(_shopData)', h.context), 3);
  assert.doesNotMatch(html, /data-item="diamond_exchange"/);
  const capped = h.render({ level: 10, coinsBalance: 55, diamondsBalance: 2, diamondDigPurchased: 10, diamondExchangePurchased: 10 });
  assert.match(capped, /data-item="diamond_dig" disabled/);
  assert.doesNotMatch(h.render({ level: 10, coinsBalance: 55 }), /data-item="diamond_/);
});

test('buying a diamond upgrade refreshes the shop and its next price from the server snapshot', async () => {
  const h = setup();
  h.render({ level: 10, coinsBalance: 55, diamondsBalance: 1, diamondDigPurchased: 0 });
  const buying = h.get('buy-diamond_dig').handlers.click();
  assert.equal(h.get('buy-diamond_dig').disabled, true);
  assert.equal(h.requests[0].url, '/api/shop/purchase');
  assert.deepEqual(JSON.parse(h.requests[0].options.body), { item: 'diamond_dig' });
  const updated = { level: 10, coinsBalance: 54, coinsSpent: 1, diamondsBalance: 1,
    diamondDigPurchased: 1, diamondDigPct: 1.1, diamondEventsPerDiamond: 1000 / 1.011, diamondExchangeRate: 10 };
  h.requests.shift().resolve({ ok: true, json: async () => updated });
  await buying;
  assert.equal(h.snapshots.at(-1), updated);
  assert.equal(runInContext('SHOP_ITEMS.find(x=>x.id===\'diamond_dig\').costFn(_shopData)', h.context), 2);
  assert.match(h.get('shop-items').innerHTML, /1.1% digging speed/);
});

test('a late shop response from another account cannot display private upgrade data', async () => {
  const h = setup();
  const opening = h.context.openShopModal();
  h.switchAccount();
  h.requests.shift().resolve({ ok: true, json: async () => ({ level: 10, diamondsBalance: 36, coinsBalance: 100 }) });
  await opening;
  assert.equal(h.snapshots.length, 0);
  assert.doesNotMatch(h.get('shop-items').innerHTML, /Diamond/);
});
