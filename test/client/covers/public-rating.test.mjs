import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function render(kind, { loggedIn = true, owned = true, rating = 2.5, canRate = true } = {}) {
  const requests = [], gates = [];
  let rejectPatch = false, widget;
  const element = () => ({ dataset: {}, style: {}, classList: { remove() {} }, events: {},
    addEventListener(type, handler) { this.events[type] = handler; } });
  const body = { style: {}, querySelectorAll: () => [],
    set innerHTML(html) {
      this.html = html;
      const stars = [...html.matchAll(/class="(star(?: on| half)?)"/g)].map((match, index) =>
        Object.assign(element(), { className: match[1], dataset: { pos: String(index + 1) }, offsetWidth: 20 }));
      const label = { innerHTML: '4.5 (9 votes)' };
      widget = Object.assign(element(), { stars, label,
        querySelectorAll: () => stars, querySelector: () => label });
    },
    querySelector: selector => ['.star-rating', '#series-star-widget'].includes(selector) ? widget : null,
  };
  const apiFetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: options ? !rejectPatch : true,
      json: async () => options ? { avgRating: 4.8, voteCount: 10 } : { rating, avgRating: 4.5, voteCount: 9, canRate } };
  };
  const hooks = { getCachedAllSeries: () => owned ? [{ id: 42 }] : [],
    starsHtml: value => Array.from({ length: 5 }, (_, i) => `<span class="star${value >= i + 1 ? ' on' : value >= i + 0.5 ? ' half' : ''}" data-pos="${i + 1}">★</span>`).join(''),
    starLabelHtml: (average, votes) => `${average} (${votes} votes)`,
    flashRatingGate: () => gates.push(true) };
  const source = readFileSync(new URL(`../../../public/js/covers/${kind === 'series' ? 'series' : 'book'}-dialog.js`, import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export function ', 'function ');
  runInNewContext(source + (kind === 'series'
    ? '\nrenderSeriesActivity(data);'
    : '\nrenderCoverActivity(42, "Book", [], rating, data, loggedIn, owned, canRate);'), {
    document: { getElementById: id => id === 'pub-modal-body' ? body : element() },
    coversState: { _hooks: hooks }, apiFetch, getToken: () => loggedIn ? 'token' : null,
    escapeHtml: String, t: key => key, _destroyPubNetworks() {}, _seriesRowBadges: () => '', publicEntryLinks: () => '',
    rating, loggedIn, owned, canRate,
    data: { id: 42, name: 'Item', books: [], isContainer: kind === 'anthology', avgRating: 4.5, voteCount: 9 },
  });
  return { body, widget, requests, gates, rejectPatch() { rejectPatch = true; } };
}

const settled = () => new Promise(resolve => setImmediate(resolve));
const filled = widget => widget.stars.filter(star => star.className === 'star on').length;
const half = widget => widget.stars.filter(star => star.className === 'star half').length;
const pointer = { offsetX: 15 };

for (const kind of ['book', 'anthology', 'series']) {
  test(`${kind}: guests see aggregate stars; signed-in visitors see only their own rating controls`, async () => {
    const guest = render(kind, { loggedIn: false, owned: false });
    assert.equal(filled(guest.widget), 4);
    assert.equal(half(guest.widget), 1);
    assert.match(guest.body.html, /4\.5 \(9 votes\)/);
    assert.equal(guest.widget.stars[0].events.click, undefined, 'guest rating is read-only');
    const visitor = render(kind, { owned: false });
    assert.equal(visitor.widget.stars.length, 0, 'another player\'s average never fills personal stars');
    assert.match(visitor.body.html, /4\.5 \(9 votes\)/);
    const unrated = render(kind, { rating: null });
    assert.equal(filled(unrated.widget), 0);
    await settled();
    assert.equal(filled(unrated.widget), 0, 'unrated stays empty after loading personal data');
  });

  test(`${kind}: personal stars survive hover, save, removal and rejected saves independently of the average`, async () => {
    const d = render(kind);
    await settled();
    assert.equal(filled(d.widget), 2);
    assert.equal(half(d.widget), 1);
    d.widget.stars[3].events.mousemove(pointer);
    assert.equal(filled(d.widget), 4);
    d.widget.events.mouseleave();
    assert.equal(filled(d.widget), 2);
    await d.widget.stars[3].events.click(pointer);
    assert.equal(filled(d.widget), 4);
    assert.equal(JSON.parse(d.requests.at(-1).options.body).rating, 4);
    assert.equal(d.widget.label.innerHTML, '4.8 (10 votes)');
    await d.widget.stars[3].events.click(pointer);
    assert.equal(filled(d.widget), 0, 'clicking own rating again removes it');
    assert.equal(JSON.parse(d.requests.at(-1).options.body).rating, null);
    d.rejectPatch();
    await d.widget.stars[4].events.click(pointer);
    assert.equal(filled(d.widget), 0, 'failed save restores personal empty stars, not aggregate stars');
  });

  test(`${kind}: completion gates prevent hovering or submitting a rating`, async () => {
    const d = render(kind, { canRate: false });
    await settled();
    d.widget.stars[4].events.mousemove(pointer);
    assert.equal(filled(d.widget), 2);
    await d.widget.stars[4].events.click(pointer);
    assert.equal(d.gates.length, 1);
    assert.equal(d.requests.some(request => request.options), false);
  });
}
