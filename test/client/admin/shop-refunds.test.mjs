import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../admin/js/users-books.js', import.meta.url), 'utf8');
const block = source.slice(source.indexOf('    const shopXpBoost ='), source.indexOf('    // Lock status in meta bar'));

function render(count) {
  const requests = [], confirmations = [], reloads = [];
  const el = (tag, className, text = '') => ({ tag, className, text, style: {}, children: [],
    appendChild(child) { this.children.push(child); } });
  const metaBar = el('div', '');
  vm.runInNewContext(block, {
    user: { id: 42, username: 'Player', bonusGcMintPurchased: count }, metaBar, el,
    mkBtn: (text, className, click) => ({ text, className, click }),
    showConfirm: (text, confirm, options) => confirmations.push({ text, confirm, options }),
    api: async (method, url, body) => requests.push({ method, url, body: JSON.parse(JSON.stringify(body)) }),
    loadUserDetail: id => reloads.push(id),
  });
  const row = metaBar.children[0]?.children[1]?.children[0];
  return { metaBar, row, requests, confirmations, reloads };
}

test('Coin Mint alone displays latest and cumulative refunds with the correct API item', async () => {
  const f = render(5);
  assert.equal(f.metaBar.children.length, 1);
  assert.equal(f.row.children[0].text, '+0.5% Coin Mint (5 purchases)');
  f.row.children[1].click();
  assert.match(f.confirmations[0].text, /Refunds 5 GC/);
  assert.equal(f.requests.length, 0);
  await f.confirmations[0].confirm();
  assert.deepEqual(f.requests[0], { method: 'POST', url: '/api/admin/users/42/refund', body: { item: 'gc_mint' } });
  f.row.children[2].click();
  assert.match(f.confirmations[1].text, /Refunds 15 GC/);
  await f.confirmations[1].confirm();
  assert.deepEqual(f.requests[1].body, { item: 'gc_mint', all: true });
  assert.deepEqual(f.reloads, [42, 42]);
});

test('one Coin Mint purchase has only Refund 1; zero purchases has no refund row', () => {
  const one = render(1);
  assert.deepEqual(one.row.children.map(child => child.text), ['+0.1% Coin Mint (1 purchases)', 'Refund 1']);
  assert.equal(render(0).metaBar.children.length, 0);
});
