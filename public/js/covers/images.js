import { coversState } from './state.js';

// Capped at _COVER_BLOB_CACHE_MAX full-size decoded cover images (see
// _cacheCoverBlobUrl below) - uncapped, this grew for as long as the tab
// stayed open, since nothing ever called URL.revokeObjectURL() on an entry.
// A large personal library scrolled through the covers panel over a long
// session pinned every distinct cover ever seen as a live Blob in memory,
// the actual source of a ~300MB browser-tab leak report - not a one-off
// per-book cost, but one that scaled with how much of the library was
// ever scrolled past, matching that report exactly.
const _coverBlobUrlCache    = new Map();
const _coverFetchPromiseCache = new Map();
// Lowered from 60 - even capped, 60 full-size (up to 675x900) decoded covers
// is ~140MB before browser/GPU overhead, on top of whatever the now-added
// off-screen thumb unload (_ensureThumbVisibilityObserver, _appendLazyBatch)
// already frees. This is a cache of recently-*fetched* blobs (which the
// unload/reload cycle deliberately re-uses to avoid a network re-fetch), not
// the set of currently-visible thumbs, so it stays well below the number of
// items scrolled past in a session - keep it a bit larger than one lazy
// batch's worth of thumbs so ordinary scrolling doesn't refetch constantly.
const _COVER_BLOB_CACHE_MAX = 24;

// FIFO eviction (insertion order, via Map) rather than true LRU - simple and
// good enough here since the covers panel is scrolled roughly linearly, not
// randomly re-visited in a pattern true LRU would meaningfully improve on.
export function _cacheCoverBlobUrl(url, blobUrl) {
  _coverBlobUrlCache.set(url, blobUrl);
  while (_coverBlobUrlCache.size > _COVER_BLOB_CACHE_MAX) {
    const oldestUrl = _coverBlobUrlCache.keys().next().value;
    URL.revokeObjectURL(_coverBlobUrlCache.get(oldestUrl));
    _coverBlobUrlCache.delete(oldestUrl);
  }
}




// Lazy-appending batches never removes anything, so a long scroll through a
// large library left hundreds of decoded <img> bitmaps alive in memory at
// once (the blob URL cache below is capped, but that only bounds the blob
// URL table - a live <img src="blob:..."> in the DOM keeps its own decoded
// bitmap regardless of whether the URL is still in that cache). This
// observer discards the image (clears .src, releasing the decoded bitmap)
// once a thumb scrolls far enough outside the viewport, and reloads it -
// via the same _enqueueCoverLoad()/blob-cache pipeline everything else
// uses, so it's an instant cache hit if the blob's still cached - once it
// scrolls back near the viewport. A large rootMargin means this only ever
// affects thumbs well off-screen, not the ones about to be scrolled to.

export function _ensureThumbVisibilityObserver() {
  if (coversState._thumbVisibilityObserver) return coversState._thumbVisibilityObserver;
  const panel = document.getElementById('covers-panel');
  if (!panel) return null;
  coversState._thumbVisibilityObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const thumb = entry.target;
      const img   = thumb.querySelector('img');
      const url   = thumb.dataset.coverUrl;
      if (!img || !url) continue;
      if (entry.isIntersecting) {
        if (!img.src) _enqueueCoverLoad(url, img, thumb.querySelector('.cover-load-bar'));
      } else {
        img._coverLoadVersion = (img._coverLoadVersion || 0) + 1;
        if (img.src) {
          img.removeAttribute('src');
          img.style.opacity = '0';
        }
      }
    }
  }, { root: panel, rootMargin: '1200px 0px 1200px 0px', threshold: 0 });
  return coversState._thumbVisibilityObserver;
}

// ── Cover blob/fetch caching ───────────────────────────────────────────────────
function _showFallbackCover(url, img, bar, canApply) {
  if (!canApply()) return;
  bar.style.opacity = '0';
  img.onload = () => { if (canApply()) img.style.opacity = '1'; };
  img.src = url;
}

export async function _loadCoverWithProgress(url, img, bar, canApply = () => true) {
  if (!canApply()) return;
  if (_coverBlobUrlCache.has(url)) {
    bar.style.transition = 'none';
    bar.style.width = '0';
    bar.style.opacity = '0';
    img.style.opacity = '1';
    img.src = _coverBlobUrlCache.get(url);
    return;
  }

  if (_coverFetchPromiseCache.has(url)) {
    try {
      const blobUrl = await _coverFetchPromiseCache.get(url);
      if (!canApply()) return;
      if (!blobUrl) throw new Error('Cover prefetch failed');
      bar.style.transition = 'none';
      bar.style.width = '0';
      bar.style.opacity = '0';
      img.style.opacity = '1';
      img.src = blobUrl;
      return;
    } catch {
      _showFallbackCover(url, img, bar, canApply);
      return;
    }
  }

  const loadPromise = (async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Cover request failed');
    const total    = parseInt(response.headers.get('Content-Length'), 10) || 0;
    const reader   = response.body.getReader();
    const chunks   = [];
    let received   = 0;

    if (canApply()) {
      bar.style.transition = 'none';
      bar.style.width      = '0';
      bar.style.opacity    = '1';
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      const pct = total ? Math.min(98, (received / total) * 100) : null;
      if (canApply()) {
        bar.style.transition = 'width 0.15s ease';
        bar.style.width      = (pct !== null ? pct : Math.min(98, bar._fakeP = ((bar._fakeP || 0) + 15))) + '%';
      }
    }

    const blobUrl = URL.createObjectURL(new Blob(chunks));
    _cacheCoverBlobUrl(url, blobUrl);
    return blobUrl;
  })();
  _coverFetchPromiseCache.set(url, loadPromise);

  try {
    const blobUrl = await loadPromise;
    if (!canApply()) return;
    bar.style.transition = 'width 0.1s ease';
    bar.style.width      = '100%';
    img.onload = () => { if (canApply()) img.style.opacity = '1'; };
    img.src    = blobUrl;
    setTimeout(() => {
      if (!canApply()) return;
      bar.style.transition = 'opacity 0.3s ease';
      bar.style.opacity    = '0';
    }, 150);
  } catch {
    _showFallbackCover(url, img, bar, canApply);
  } finally {
    _coverFetchPromiseCache.delete(url);
  }
}

export function _preloadCoverBlob(url) {
  if (_coverBlobUrlCache.has(url) || _coverFetchPromiseCache.has(url)) return;
  const p = fetch(url)
    .then(r => { if (!r.ok) throw new Error('Cover prefetch failed'); return r.blob(); })
    .then(b => { const bu = URL.createObjectURL(b); _cacheCoverBlobUrl(url, bu); _coverFetchPromiseCache.delete(url); return bu; })
    .catch(() => { _coverFetchPromiseCache.delete(url); });
  _coverFetchPromiseCache.set(url, p);
}

export function _enqueueCoverLoad(url, img, bar) {
  const version = img._coverLoadVersion = (img._coverLoadVersion || 0) + 1;
  coversState._coversPanelQueue.push({ url, img, bar, version });
  if (!coversState._coversPanelRunning) {
    coversState._coversPanelRunning = true;
    const gen = coversState._coversPanelGen;
    (async () => {
      while (coversState._coversPanelQueue.length) {
        if (gen !== coversState._coversPanelGen) return;
        const item = coversState._coversPanelQueue.shift();
        if (coversState._coversPanelQueue.length) _preloadCoverBlob(coversState._coversPanelQueue[0].url);
        await _loadCoverWithProgress(item.url, item.img, item.bar, () =>
          gen === coversState._coversPanelGen && item.version === item.img._coverLoadVersion);
      }
      if (gen === coversState._coversPanelGen) coversState._coversPanelRunning = false;
    })();
  }
}
