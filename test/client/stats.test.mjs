import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../public/js/stats.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const messages = vm.runInNewContext(readFileSync(new URL('../../public/js/i18n/en/stats.js', import.meta.url), 'utf8')
  .replace('export default', '(').replace(/;\s*$/, ')'));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, value =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]);
const group = (star, n) => ({ count: n, average: star,
  distribution: Array.from({ length: 10 }, (_, index) => ({ star: (index + 1) / 2, n: (index + 1) / 2 === star ? n : 0 })) });

test('stats renders all ten half-star bins for all categories in balanced column stacks', async () => {
  const body = { innerHTML: '' }, overlay = { classList: { add() {} } };
  const context = vm.createContext({ document: { getElementById: id => id === 'stats-modal-body' ? body : overlay },
    escapeHtml, t: key => messages[key] || key,
    fetchPublic: async () => ({ ok: true, json: async () => ({ ratingsTotal: 10,
      ratingBreakdown: { books: group(4.5, 5), anthologies: group(3.5, 2), series: group(2, 3) },
      cpuModel: '<script>bad</script>', appTitle: 'Title', avgTitle: 'Title' }) }),
  });
  vm.runInContext(source, context);
  await context.openStatsModal();
  assert.ok(!body.innerHTML.includes('Failed to load'));
  assert.equal((body.innerHTML.match(/class="stats-column"/g) || []).length, 3);
  assert.equal((body.innerHTML.match(/class="stats-section stats-section--/g) || []).length, 12);
  assert.ok(body.innerHTML.includes('4.5 / 5'));
  assert.ok(body.innerHTML.includes('0.5 / 5'));
  assert.ok(body.innerHTML.includes('4.50'));
  assert.ok(body.innerHTML.includes('3.50'));
  assert.ok(body.innerHTML.includes('Anthologies'));
  assert.ok(body.innerHTML.includes('Series'));
  assert.ok(!body.innerHTML.includes('<script>bad'));
  const ratingTable = body.innerHTML.match(/<table class="stats-rating-table">([\s\S]*?)<\/table>/)[1];
  assert.equal((ratingTable.match(/<tr/g) || []).length, 13);
  assert.ok(!body.innerHTML.includes('stats.rating'));
});

test('rating bars scale to each category peak, not its total votes', async () => {
  const body = {innerHTML: ''}, overlay = {classList: {add() {}}};
  const books = group(5, 40);
  books.count = 70;
  books.distribution.find(row => row.star === 4).n = 20;
  books.distribution.find(row => row.star === 3).n = 10;
  const anthologies = group(5, 2);
  anthologies.count = 3;
  anthologies.distribution.find(row => row.star === 4).n = 1;
  const context = vm.createContext({
    document: {getElementById: id => id === 'stats-modal-body' ? body : overlay},
    escapeHtml, t: key => messages[key] || key,
    fetchPublic: async () => ({ok: true, json: async () => ({
      ratingBreakdown: {books, anthologies, series: group(5, 0)},
    })}),
  });
  vm.runInContext(source, context);
  await context.openStatsModal();
  const fills = star => {
    const row = body.innerHTML.match(new RegExp(`<tr><th scope="row">${star} / 5</th>(.*?)</tr>`))[1];
    return [...row.matchAll(/--rating-fill:([\d.]+)%/g)].map(match => Number(match[1]));
  };
  assert.deepEqual(fills(5), [100, 100, 0]);
  assert.deepEqual(fills(4), [50, 50, 0]);
  assert.deepEqual(fills(3), [25, 0, 0]);
  assert.ok(!body.innerHTML.includes('NaN%'));
});
