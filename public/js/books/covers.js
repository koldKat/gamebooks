let _anthologyFlowRaf = null;
let _coverMetaCache = new Map();
let _bookCoverObserver = null;
let _bookCoverLoadedUrls = new Set();

// ── Cover meta / lazy loading ─────────────────────────────────────────────────
// Dimension probes are capped like the cover loader below: an expand/collapse
// in a big library can make the flow pass probe hundreds of anthology covers
// at once, and uncapped simultaneous Image decodes are a big part of the
// post-toggle scroll jank. Cache-first, so repeats are free.
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
  // Fetch every cover's dimensions in parallel, then do ALL offsetTop/Height
  // reads before ANY style writes. The previous loop awaited each cover and
  // wrote styles per anthology, so every anthology after the first forced
  // its own synchronous relayout of the whole list - with dozens of expanded
  // anthologies that froze scrolling for a beat after each expand/collapse.
  const metas = await Promise.all(containerRows.map(row => _loadCoverMeta(row.dataset.anthologyCoverUrl)));
  const writes = [];
  for (let i = 0; i < containerRows.length; i++) {
    const row  = containerRows[i];
    const meta = metas[i];
    // The children group is always this card's own next sibling (same
    // adjacency invariant the expand-toggle relies on) - a container can
    // appear in more than one stash, so a data-parent query could grab the
    // other copy's group.
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

// Real accounts can have 1000+ covers in the DOM at once (anthologies/series
// mostly expanded, a big library). Left uncapped, that many simultaneous
// `new Image()` requests can overwhelm the browser's per-host connection
// queue (or this app's own single-process static server) badly enough that
// most of them silently error out - onerror never throws, it just strips
// data-pending-cover and leaves the card blank, which looks like "covers
// don't load at all" with nothing in the console to explain why.
// _bookCoverInFlightUrls also dedups the case where the same not-yet-loaded
// url gets observed again while already mid-fetch - it's registered as a
// waiter on the existing request instead of starting a redundant second one.
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

// #landing-right (not #landing-wrapper, and not the default browser-viewport
// root) is the actual scrollable ancestor of #books-list. #landing-wrapper
// does have its own overflow-y:auto (landing.css), but #landing-right sits
// inside it as position:fixed with its own separate overflow-y:auto
// (demo.css, loaded unconditionally - the filename is misleading, this rule
// isn't demo-mode-gated) - a position:fixed element is taken out of normal
// flow, so #landing-wrapper's scroll position never actually changes when
// the books list scrolls; only #landing-right's own scrollTop does. Rooting
// on #landing-wrapper meant the observer was watching an ancestor that, from
// a scrolling perspective, never moves - every element's intersection state
// got stuck at whatever it was on the very first check, never updating on
// scroll or on an expand/collapse reveal. rootMargin is a small head start
// (just enough to avoid a hard blank-then-pop-in flash right at the edge of
// the panel), not a real preload buffer - a larger margin here made a big
// library feel like it was eagerly loading everything at once rather than
// genuinely just what's visible.
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

// [data-pending-cover] presence is itself the "still needs loading" filter
// - _loadBookCover() removes the attribute the moment a cover resolves
// (success or failure), so a previously-loaded element simply stops
// matching the querySelectorAll below on every later call. That means no
// separate "already observed" bookkeeping is needed: every element found
// here still genuinely needs a cover, and gets an explicit
// unobserve()+observe() (not a bare observe()) to FORCE a fresh
// IntersectionObserver check rather than trusting the ancestor's
// display:none -> visible transition (an anthology/series/stash
// expand-toggle, or the search filter revealing a match) to reliably
// re-trigger the observer's own automatic recheck on its own timing.
// unobserve() is a safe no-op for anything not currently being observed
// (the common case), so this costs nothing extra for the normal path.
//
// `reset: true` (full renderBooksList() rebuild) disconnects first, since
// every existing target belongs to DOM that's about to be discarded.
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
