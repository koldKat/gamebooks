import { test } from 'node:test';
import assert from 'node:assert/strict';

test('card cover observer and bounded loader survive reveals and rebuilds', async () => {
  const saved = { document: globalThis.document, Image: globalThis.Image, IntersectionObserver: globalThis.IntersectionObserver };
  const root = {};
  const requests = [];
  const observers = [];
  globalThis.document = { getElementById: () => root };
  globalThis.Image = class {
    set src(url) { this.url = url; requests.push(this); }
  };
  globalThis.IntersectionObserver = class {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observed = [];
      this.unobserved = [];
      this.disconnects = 0;
      observers.push(this);
    }
    observe(el) { this.observed.push(el); }
    unobserve(el) { this.unobserved.push(el); }
    disconnect() { this.disconnects++; }
  };
  const card = url => ({
    dataset: { pendingCover: url },
    style: { setProperty(key, value) { this[key] = value; } },
    removeAttribute() { delete this.dataset.pendingCover; },
  });
  try {
    const { _queueBookCovers, _getBookCoverObserver } = await import('../../../public/js/books/covers.js');
    const cards = Array.from({ length: 8 }, (_, i) => card(`/cover-${i}.jpg`));
    const duplicate = card('/cover-0.jpg');
    const container = { querySelectorAll: () => [...cards, duplicate].filter(el => el.dataset.pendingCover) };
    _queueBookCovers(container);
    const observer = _getBookCoverObserver();
    assert.equal(observers.length, 1);
    assert.equal(observer.options.root, root);
    assert.equal(observer.disconnects, 1);
    assert.equal(observer.observed.length, 9);
    assert.equal(observer.unobserved.length, 9);
    observer.callback([...cards, duplicate].map(target => ({ target, isIntersecting: true })));
    assert.equal(requests.length, 6, 'only six distinct cover requests start concurrently');
    requests[0].onload();
    assert.equal(requests.length, 7, 'completion starts the next queued cover');
    assert.equal(cards[0].style['--bci'], "url('/cover-0.jpg')");
    assert.equal(duplicate.style['--bci'], cards[0].style['--bci']);
    for (let i = 1; i < requests.length; i++) requests[i].onload();
    assert.equal(requests.length, 8, 'duplicate URL uses the in-flight request');
    assert.ok([...cards, duplicate].every(el => !el.dataset.pendingCover));
    const revealed = card('/new-cover.jpg');
    _queueBookCovers({ querySelectorAll: () => [revealed] }, { reset: false });
    assert.equal(observer.disconnects, 1, 'revealing children preserves existing observation');
    assert.equal(observer.observed.at(-1), revealed);
    assert.equal(observer.unobserved.at(-1), revealed);
    const cached = card('/cover-0.jpg');
    _queueBookCovers({ querySelectorAll: () => [cached] });
    assert.equal(observers.length, 1, 'rebuild reuses the feature observer');
    assert.equal(observer.disconnects, 2);
    assert.equal(cached.style['--bci'], cards[0].style['--bci']);
    assert.equal(requests.length, 8, 'cached cover does not start a new request');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
