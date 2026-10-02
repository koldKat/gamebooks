let _anthologyFlowRaf = null;
let _coverMetaCache = new Map();
let _bookCoverObserver = null;
let _bookCoverLoadedUrls = new Set();

// Cache and cap dimension probes to avoid bursts of image decodes on group expansion.
const _META_MAX_CONCURRENT = 6;
let   _metaActiveCount     = 0;
const _metaPendingQueue    = [];
export function _loadCoverMeta(url) {
  if (!url) return Promise.resolve(null);
  if (_coverMetaCache.has(url)) return _coverMetaCache.get(url);
  const pending = new Promise(resolve => { _metaPendingQueue.push({ url, resolve }); });
  _coverMetaCache.set(url, pending);
  _drainMetaQueue();
  return pending;
}
export function _drainMetaQueue() {
  while (_metaActiveCount < _META_MAX_CONCURRENT && _metaPendingQueue.length) {
    const { url, resolve } = _metaPendingQueue.shift();
    _metaActiveCount++;
    const img = new Image();
    const done = meta => { _metaActiveCount--; resolve(meta); _drainMetaQueue(); };
    img.onload  = () => done({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
    img.onerror = () => done(null);
    img.src = url;
  }
}

export async function _applyAnthologyCardCoverFlows(root = document.getElementById('books-list')) {
  if (!root) return;
  root.querySelectorAll('.book-item[data-anthology-cover-url]').forEach(card => {
    card.style.setProperty('--book-card-cover-size',     '100% auto');
    card.style.setProperty('--book-card-cover-position', 'center center');
    card.style.removeProperty('--bk-cover-repeat');
  });

  const containerRows = [...root.querySelectorAll('.book-item--container[data-container-id][data-anthology-cover-url]')];
  // Resolve dimensions first, then batch all layout reads before style writes.
  const metas = await Promise.all(containerRows.map(row => _loadCoverMeta(row.dataset.anthologyCoverUrl)));
  const writes = [];
  for (let i = 0; i < containerRows.length; i++) {
    const row  = containerRows[i];
    const meta = metas[i];
    // Use this card's adjacent children group; the same container may appear in multiple stashes.
    const group = row.nextElementSibling?.classList.contains('book-children-group') ? row.nextElementSibling : null;
    if (!group || group.style.display === 'none') continue;
    const childCards = Array.from(group.querySelectorAll('.book-item--child[data-anthology-cover-url]'));
    if (!childCards.length || !meta?.width || !meta?.height) continue;

    const cards    = [row, ...childCards];
    const stackTop = row.offsetTop;
    const lastCard = cards[cards.length - 1];
    const stackH   = lastCard.offsetTop + lastCard.offsetHeight - stackTop;
    if (stackH <= 0) continue;

    const imgH     = Math.round((meta.height / meta.width) * row.offsetWidth);
    const topOffset = Math.round((stackH - imgH) / 2); // where image top sits in stack coords; negative when imgH > stackH

    for (const card of cards) {
      const cardTop = card.offsetTop - stackTop;
      writes.push([card, `100% ${imgH}px`, `center ${topOffset - cardTop}px`]);
    }
  }
  for (const [card, size, pos] of writes) {
    card.style.setProperty('--book-card-cover-size',     size);
    card.style.setProperty('--book-card-cover-position', pos);
    card.style.setProperty('--bk-cover-repeat',          'repeat-y');
  }
}

export function _scheduleAnthologyCardCoverFlows(root = document.getElementById('books-list')) {
  if (_anthologyFlowRaf) cancelAnimationFrame(_anthologyFlowRaf);
  _anthologyFlowRaf = requestAnimationFrame(() => { _anthologyFlowRaf = null; _applyAnthologyCardCoverFlows(root); });
}

// Cap concurrent image requests and share in-flight URLs to avoid queue overload.
const _BOOK_COVER_MAX_CONCURRENT = 6;
let _bookCoverActiveCount        = 0;
const _bookCoverPendingQueue     = [];
const _bookCoverInFlightUrls     = new Map();

export function _loadBookCover(el) {
  const url = el.dataset.pendingCover;
  if (!url) return;
  if (_bookCoverLoadedUrls.has(url)) {
    el.style.setProperty('--bci', `url('${url}')`);
    el.removeAttribute('data-pending-cover');
    return;
  }
  const waiters = _bookCoverInFlightUrls.get(url);
  if (waiters) { waiters.push(el); return; }
  _bookCoverPendingQueue.push(el);
  _drainBookCoverQueue();
}

export function _drainBookCoverQueue() {
  while (_bookCoverActiveCount < _BOOK_COVER_MAX_CONCURRENT && _bookCoverPendingQueue.length) {
    const el = _bookCoverPendingQueue.shift();
    const url = el.dataset.pendingCover;
    if (!url) continue;
    if (_bookCoverLoadedUrls.has(url)) {
      el.style.setProperty('--bci', `url('${url}')`);
      el.removeAttribute('data-pending-cover');
      continue;
    }
    const waiters = _bookCoverInFlightUrls.get(url);
    if (waiters) { waiters.push(el); continue; }
    _bookCoverInFlightUrls.set(url, [el]);
    _bookCoverActiveCount++;
    const img = new Image();
    const finish = success => {
      const els = _bookCoverInFlightUrls.get(url) || [];
      _bookCoverInFlightUrls.delete(url);
      _bookCoverActiveCount--;
      if (success) _bookCoverLoadedUrls.add(url);
      for (const w of els) {
        if (success) w.style.setProperty('--bci', `url('${url}')`);
        w.removeAttribute('data-pending-cover');
      }
      _drainBookCoverQueue();
    };
    img.onload  = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
  }
}

// Root the observer on #landing-right, the fixed panel that actually scrolls.
// Use a small margin for preloading, not eager loading of the whole library.
export function _getBookCoverObserver() {
  if (_bookCoverObserver) return _bookCoverObserver;
  const root = document.getElementById('landing-right');
  _bookCoverObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      _bookCoverObserver.unobserve(entry.target);
      _loadBookCover(entry.target);
    }
  }, { root: root || null, rootMargin: '80px 0px' });
  return _bookCoverObserver;
}

// Reobserve pending covers to force a visibility check after expansion/search.
// Disconnect old targets on a full list rebuild.
export function _queueBookCovers(container, { reset = true } = {}) {
  if (!container) return;
  const observer = _getBookCoverObserver();
  if (reset) observer.disconnect();
  container.querySelectorAll('[data-pending-cover]').forEach(el => {
    const url = el.dataset.pendingCover;
    if (_bookCoverLoadedUrls.has(url)) {
      el.style.setProperty('--bci', `url('${url}')`);
      el.removeAttribute('data-pending-cover');
      return;
    }
    observer.unobserve(el);
    observer.observe(el);
  });
}
