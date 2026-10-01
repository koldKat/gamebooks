import { _ensureThumbVisibilityObserver, _enqueueCoverLoad } from './images.js';
import { _visibleCoverItems, _sortedAllBooks, _randomizedCoverItems } from './filters.js';
import { _makeCoverThumbHTML } from './markup.js';
import { _landingCoverPool, _startLandingCoverRotation } from './background.js';
import { coversState } from './state.js';

const _LAZY_BATCH = 20;

export function _removeFavoriteThumbInPlace(favBtn) {
  const thumb = favBtn?.closest('.cover-thumb');
  if (!thumb) return;
  const grid = document.getElementById('covers-grid');
  const panel = document.getElementById('covers-panel');
  if (coversState._lazyItems) {
    const favType = favBtn.dataset.favType;
    const favId = Number(favBtn.dataset.favId);
    const idx = coversState._lazyItems.findIndex(item => (
      favType === 'series'
        ? (item.isSeries && Number(item.entityId) === favId)
        : (!item.isSeries && Number(item.id) === favId)
    ));
    if (idx >= 0) {
      coversState._lazyItems.splice(idx, 1);
      if (coversState._lazyOffset > idx) coversState._lazyOffset -= 1;
    }
  }
  thumb.remove();
  _updateCoversCount();
  if (coversState._lazyItems && panel && grid) {
    requestAnimationFrame(() => {
      if (coversState._lazyItems && coversState._lazyOffset < coversState._lazyItems.length &&
          panel.scrollHeight <= panel.clientHeight + 50) {
        _appendLazyBatch();
      }
    });
  } else {
    _trimCoversToFit();
  }
}

// ── Lazy loading ───────────────────────────────────────────────────────────────
export function _updateCoversCount() {
  const countEl = document.getElementById('covers-count');
  const totalEl = document.getElementById('covers-total');
  if (!totalEl) return;
  if (coversState._lazyItems) {
    if (countEl) countEl.textContent = `${Math.min(coversState._lazyOffset, coversState._lazyItems.length).toLocaleString()} `;
    totalEl.textContent = ` (${coversState._lazyItems.length.toLocaleString()} total)`;
  } else {
    if (countEl) countEl.textContent = '';
    totalEl.textContent = ` (${_visibleCoverItems().length.toLocaleString()} total)`;
  }
}

export function _stopLazy() {
  const panel = document.getElementById('covers-panel');
  if (panel && coversState._lazyScrollFn) panel.removeEventListener('scroll', coversState._lazyScrollFn);
  coversState._lazyItems    = null;
  coversState._lazyOffset   = 0;
  coversState._lazyScrollFn = null;
  coversState._lazyGrid     = null;
  coversState._coversPanelQueue = [];
  coversState._coversPanelGen++;
  coversState._coversPanelRunning = false;
  coversState._thumbVisibilityObserver?.disconnect();
  coversState._thumbVisibilityObserver = null;
}

export function _appendLazyBatch() {
  if (!coversState._lazyItems || !coversState._lazyGrid || coversState._lazyOffset >= coversState._lazyItems.length) return;
  const start = coversState._lazyOffset;
  const end   = Math.min(start + _LAZY_BATCH, coversState._lazyItems.length);
  const frag  = document.createDocumentFragment();
  for (let i = start; i < end; i++) {
    const tmp = document.createElement('div');
    tmp.innerHTML = _makeCoverThumbHTML(coversState._lazyItems[i]);
    frag.appendChild(tmp.firstChild);
  }
  coversState._lazyGrid.appendChild(frag);
  const allThumbs = coversState._lazyGrid.querySelectorAll('.cover-thumb');
  const visObserver = _ensureThumbVisibilityObserver();
  for (let i = start; i < end; i++) {
    const c = coversState._lazyItems[i];
    if (!c.coverUrl) continue;
    const thumb = allThumbs[i];
    if (!thumb) continue;
    _enqueueCoverLoad(c.coverUrl, thumb.querySelector('img'), thumb.querySelector('.cover-load-bar'));
    visObserver?.observe(thumb);
  }
  coversState._lazyOffset = end;
  _updateCoversCount();
  requestAnimationFrame(() => {
    const panel = document.getElementById('covers-panel');
    if (panel && coversState._lazyItems && coversState._lazyOffset < coversState._lazyItems.length &&
        panel.scrollHeight <= panel.clientHeight + 50) {
      _appendLazyBatch();
    }
  });
}

// _appendLazyBatch's own "do I need another batch?" check reads
// panel.clientHeight, which is 0 while #covers-panel is display:none (mobile,
// before the Add Book toggle reveals it) - the very first batch looks like
// it already overflows a zero-height container, so the fill loop stops
// after just one batch instead of filling the space the panel actually has
// once shown. Call this right after revealing the panel to pick the fill
// back up; harmless (and a same-tick no-op) if the panel was already full.
export function _refillLazyIfShort() {
  const panel = document.getElementById('covers-panel');
  if (panel && coversState._lazyItems && coversState._lazyOffset < coversState._lazyItems.length &&
      panel.scrollHeight <= panel.clientHeight + 50) {
    _appendLazyBatch();
  }
}

export function _startLazy(items) {
  _stopLazy();
  const grid  = document.getElementById('covers-grid');
  const panel = document.getElementById('covers-panel');
  if (!grid || !panel) return;
  grid.innerHTML = '';
  panel.classList.add('covers-lazy');
  coversState._lazyItems  = items;
  coversState._lazyOffset = 0;
  coversState._lazyGrid   = grid;
  _updateCoversCount();
  if (!coversState._lazyItems.length) return;
  _appendLazyBatch();
  coversState._lazyScrollFn = () => {
    if (!coversState._lazyItems || coversState._lazyOffset >= coversState._lazyItems.length) return;
    if (panel.scrollHeight - panel.scrollTop - panel.clientHeight < 300) _appendLazyBatch();
  };
  panel.addEventListener('scroll', coversState._lazyScrollFn);
}

// ── Covers rendering ───────────────────────────────────────────────────────────
export function _renderCovers(covers) {
  _stopLazy();
  const panel = document.getElementById('covers-panel');
  const grid  = document.getElementById('covers-grid');
  if (!grid) return;
  panel.classList.remove('covers-lazy');
  grid.innerHTML = covers.map(c => _makeCoverThumbHTML(c)).join('');
  covers.forEach((c, i) => {
    if (!c.coverUrl) return;
    const thumb = grid.querySelectorAll('.cover-thumb')[i];
    if (thumb) _enqueueCoverLoad(c.coverUrl, thumb.querySelector('img'), thumb.querySelector('.cover-load-bar'));
  });
}

export function _trimCoversToFit() {
  const panel  = document.getElementById('covers-panel');
  const grid   = document.getElementById('covers-grid');
  const header = document.getElementById('covers-header');
  requestAnimationFrame(() => {
    const style    = getComputedStyle(panel);
    const padTop   = parseFloat(style.paddingTop);
    const padBot   = parseFloat(style.paddingBottom);
    const headerH  = header ? header.getBoundingClientRect().height : 0;
    const panelGap = parseFloat(style.gap) || 16;
    const cellGap  = parseFloat(getComputedStyle(grid).gap) || 8;
    const available = panel.clientHeight - padTop - padBot - headerH - panelGap;
    const thumbs    = grid.querySelectorAll('.cover-thumb');
    if (!thumbs.length) return;
    const cellH = thumbs[0].getBoundingClientRect().height;
    if (!cellH) return;
    const rows    = Math.max(1, Math.floor((available + cellGap) / (cellH + cellGap)));
    const visible = Math.min(thumbs.length, rows * 4);
    thumbs.forEach((t, i) => { t.style.display = i < visible ? '' : 'none'; });
    const countEl = document.getElementById('covers-count');
    const totalEl = document.getElementById('covers-total');
    if (countEl) countEl.textContent = `${visible} `;
    if (totalEl) totalEl.textContent = ` (${_visibleCoverItems().length} total)`;
  });
}

export function _refreshCoversDisplay() {
  const _searchEl = document.getElementById('covers-search');
  if (document.getElementById('covers-panel')?.classList.contains('covers-searching') && _searchEl?.value.trim()) {
    _searchEl.dispatchEvent(new Event('input'));
    return;
  }
  if (coversState._coversSortMode === 'random') {
    _renderCovers(_randomizedCoverItems());
    _trimCoversToFit();
  } else {
    _startLazy(_sortedAllBooks());
  }
}

export function _updateCoversTotal() { _updateCoversCount(); }

export function _showCachedCoversPanel() {
  const panel = document.getElementById('covers-panel');
  const toggle = document.getElementById('covers-toggle');
  if (!panel) return;
  if (!coversState._allBooks.length && !coversState._allSeriesCovers.length && !coversState._allCovers.length) return;
  panel.classList.add('active');
  toggle?.classList.add('visible');
  _refreshCoversDisplay();
  if (_landingCoverPool().length) {
    // Runs on every return to the books/landing screen - no-op if the
    // rotation interval is already going. Checks the *effective* pool
    // (public covers or, with landingCoverSource 'mine', the user's own
    // library) rather than hardcoding coversState._allCovers, which is empty whenever
    // 'mine' is selected and would otherwise skip starting the rotation
    // even when the owned-covers pool has plenty to show.
    _startLandingCoverRotation();
  }
}
