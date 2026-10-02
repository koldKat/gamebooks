import { coversState } from './state.js';

// Bound cached blob URLs and revoke evicted entries.
const _coverBlobUrlCache    = new Map();
const _coverFetchPromiseCache = new Map();
// Keep the recent-fetch cache slightly larger than one lazy batch, not the whole scrolled catalog.
const _COVER_BLOB_CACHE_MAX = 24;

// Evict covers FIFO; the panel is typically scrolled linearly.
export function _cacheCoverBlobUrl(url, blobUrl) {
  _coverBlobUrlCache.set(url, blobUrl);
  while (_coverBlobUrlCache.size > _COVER_BLOB_CACHE_MAX) {
    const oldestUrl = _coverBlobUrlCache.keys().next().value;
    URL.revokeObjectURL(_coverBlobUrlCache.get(oldestUrl));
    _coverBlobUrlCache.delete(oldestUrl);
  }
}




// Unload decoded images well outside the viewport and reload through the shared blob cache.

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
