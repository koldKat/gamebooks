// covers.js - Covers panel, lazy grid, landing bg rotation, cover/series activity modals
import { getToken, isDemoMode, apiFetch } from './state.js?v=11';
import { openPublicModal, closePublicModal, openPublicProfile, renderPublicProfile, openPublicRun, openPublicSeriesRun, _destroyPubNetworks } from './public-profile.js?v=35';
import { refreshCoinsDisplay } from './shop.js?v=29';
import { foldForSearch, matchesSearch, naturalCompare, naturalCompareByName } from './sort.js?v=1';
import { escapeHtml, fetchPublic as publicFetch } from './util.js?v=20';
import { t } from './i18n.js?v=18';

// ── Hooks ─────────────────────────────────────────────────────────────────────
let _hooks = {};
export function setCoversHooks(h) { _hooks = h || {}; }

function _sortedByName(items) {
  return [...items].sort(naturalCompareByName);
}

function _isMobile() { return window.innerWidth <= 768; }

// ── State ─────────────────────────────────────────────────────────────────────
let _allCovers           = [];
let _allBooks            = [];
let _allSeriesCovers     = [];
let _coversDataFingerprint = '';
let _loadCoversInFlight  = false;
let _loadCoversPending   = null;
let _landingBgPosY       = 50;
let _landingBgDragging   = false;
let _landingBgDragDirty  = false;
let _landingBgCurrentKey = null;
let _landingCoverPosPrefs = {};
let _landingBgActive     = 'a';
let _landingBgQueue      = [];
let _landingBgQueueIdx   = 0;
const _coverBlobUrlCache    = new Map();
const _coverFetchPromiseCache = new Map();
let _coversPanelQueue    = [];
let _coversPanelRunning  = false;
let _coversPanelGen      = 0;
let _coversSortMode   = localStorage.getItem('covers-sort') || 'latest';
let _coversKindMode   = localStorage.getItem('covers-kind') || 'all';
let _favoriteBookIds   = new Set();
let _favoriteSeriesIds = new Set();
let _coverTooltipTitlePct  = Math.max(100, Math.min(148, parseInt(localStorage.getItem('cover-tooltip-title-pct') || '100', 10) || 100));
let _coverTooltipTitleBold = localStorage.getItem('cover-tooltip-title-bold') === '1';
let _hideCyrillicCovers    = localStorage.getItem('hide-cyrillic-covers') === '1';
let _reduceMotion = localStorage.getItem('reduce-motion') === null
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : localStorage.getItem('reduce-motion') === '1';
let _feedDayCovers = localStorage.getItem('feed-day-covers') !== '0';
let _feedGlassCards = localStorage.getItem('feed-glass-cards') !== '0';
let _landingCoverSource = localStorage.getItem('landing-cover-source') === 'mine' ? 'mine' : 'public';
let _landingBgHidden = false;
let _lazyItems    = null;
let _lazyOffset   = 0;
let _lazyScrollFn = null;
let _lazyGrid     = null;
const _LAZY_BATCH = 20;

// ── Cover blob/fetch caching ───────────────────────────────────────────────────
async function _loadCoverWithProgress(url, img, bar) {
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
      bar.style.transition = 'none';
      bar.style.width = '0';
      bar.style.opacity = '0';
      img.style.opacity = '1';
      img.src = blobUrl;
      return;
    } catch {
      bar.style.opacity = '0';
      img.src = url;
      return;
    }
  }

  const loadPromise = (async () => {
    const response = await fetch(url);
    const total    = parseInt(response.headers.get('Content-Length'), 10) || 0;
    const reader   = response.body.getReader();
    const chunks   = [];
    let received   = 0;

    bar.style.transition = 'none';
    bar.style.width      = '0';
    bar.style.opacity    = '1';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      const pct = total ? Math.min(98, (received / total) * 100) : null;
      bar.style.transition = 'width 0.15s ease';
      bar.style.width      = (pct !== null ? pct : Math.min(98, bar._fakeP = ((bar._fakeP || 0) + 15))) + '%';
    }

    const blobUrl = URL.createObjectURL(new Blob(chunks));
    _coverBlobUrlCache.set(url, blobUrl);
    return blobUrl;
  })();
  _coverFetchPromiseCache.set(url, loadPromise);

  try {
    const blobUrl = await loadPromise;
    bar.style.transition = 'width 0.1s ease';
    bar.style.width      = '100%';
    img.onload = () => { img.style.opacity = '1'; };
    img.src    = blobUrl;
    setTimeout(() => {
      bar.style.transition = 'opacity 0.3s ease';
      bar.style.opacity    = '0';
    }, 150);
  } catch {
    bar.style.opacity = '0';
    img.src = url;
  } finally {
    _coverFetchPromiseCache.delete(url);
  }
}

function _preloadCoverBlob(url) {
  if (_coverBlobUrlCache.has(url) || _coverFetchPromiseCache.has(url)) return;
  const p = fetch(url)
    .then(r => r.blob())
    .then(b => { const bu = URL.createObjectURL(b); _coverBlobUrlCache.set(url, bu); _coverFetchPromiseCache.delete(url); return bu; })
    .catch(() => { _coverFetchPromiseCache.delete(url); });
  _coverFetchPromiseCache.set(url, p);
}

function _enqueueCoverLoad(url, img, bar) {
  _coversPanelQueue.push({ url, img, bar });
  if (!_coversPanelRunning) {
    _coversPanelRunning = true;
    const gen = _coversPanelGen;
    (async () => {
      while (_coversPanelQueue.length) {
        if (gen !== _coversPanelGen) return;
        const item = _coversPanelQueue.shift();
        if (_coversPanelQueue.length) _preloadCoverBlob(_coversPanelQueue[0].url);
        await _loadCoverWithProgress(item.url, item.img, item.bar);
      }
      if (gen === _coversPanelGen) _coversPanelRunning = false;
    })();
  }
}

// ── Series cover entry builder ─────────────────────────────────────────────────
function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function _buildSeriesCoverEntries(seriesList = [], booksList = []) {
  const bySeries = new Map();
  for (const b of booksList) {
    const sid = b.seriesId ?? b.series_id ?? null;
    if (!sid) continue;
    if (!bySeries.has(sid)) bySeries.set(sid, []);
    bySeries.get(sid).push(b);
  }
  return _sortedByName(
    seriesList.map(series => {
      const seriesBooks = bySeries.get(series.id) || [];
      const withCovers = seriesBooks.filter(b => b.coverUrl);
      const coverBooks = _shuffle(withCovers).slice(0, 4);
      return {
        id: `series_${series.id}`,
        entityId: series.id,
        type: 'series',
        isSeries: true,
        isContainer: false,
        isOpenWorld: !!series.is_open_world,
        name: series.name,
        description: series.description || null,
        createdAt: Math.max(series.createdAt || 0, ...seriesBooks.map(b => b.createdAt || 0)),
        authors: null,
        seriesName: series.name,
        childNames: seriesBooks.map(b => b.name),
        coverSources: coverBooks.map(b => b.coverUrl).filter(Boolean),
        bookCount: series.book_count ?? seriesBooks.length,
        totalSections: series.total_sections ?? seriesBooks.reduce((s, b) => s + (b.totalSections || 0), 0),
        libraryCount: series.library_count ?? 0,
      };
    })
  );
}

// ── Favorites management ───────────────────────────────────────────────────────
function _setCoverFavoritesFromPrefs(p = {}) {
  _favoriteBookIds = new Set((Array.isArray(p.favoriteBookIds) ? p.favoriteBookIds : [])
    .map(Number)
    .filter(Number.isInteger));
  _favoriteSeriesIds = new Set((Array.isArray(p.favoriteSeriesIds) ? p.favoriteSeriesIds : [])
    .map(Number)
    .filter(Number.isInteger));
}

function _isFavoriteCoverItem(item) {
  return item.isSeries
    ? _favoriteSeriesIds.has(Number(item.entityId))
    : _favoriteBookIds.has(Number(item.id));
}

// ── Cover item queries ─────────────────────────────────────────────────────────
function _isLazyMode() { return true; }

function _effectiveCoversKindMode() {
  if (!getToken() || isDemoMode) return _coversKindMode === 'favorites' ? 'all' : _coversKindMode;
  return _coversKindMode;
}

function _hasCyrillic(text) {
  return /[Ѐ-ӿ]/.test(String(text || ''));
}

function _coverTooltipTitlePercent() {
  return _coverTooltipTitlePct;
}

function _visibleCoverItems() {
  const base = [..._allBooks, ..._allSeriesCovers].filter(item => !_hideCyrillicCovers || !_hasCyrillic(item.name));
  const mode = _effectiveCoversKindMode();
  if (mode === 'books') return base.filter(b => !b.isSeries && !b.isContainer);
  if (mode === 'anthologies') return base.filter(b => !!b.isContainer);
  if (mode === 'series') return base.filter(b => !!b.isSeries);
  if (mode === 'favorites') return base.filter(_isFavoriteCoverItem);
  return base;
}

function _sortedAllBooks() {
  const items = _visibleCoverItems();
  if (_coversSortMode === 'alpha')    return _sortedByName(items);
  if (_coversSortMode === 'za')       return _sortedByName(items).reverse();
  if (_coversSortMode === 'latest')   return [...items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (_coversSortMode === 'oldest')   return [...items].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  if (_coversSortMode === 'popular')  return [...items].sort((a, b) => (b.libraryCount || 0) - (a.libraryCount || 0));
  if (_coversSortMode === 'longest')  return [...items].filter(i => i.totalSections > 0).sort((a, b) => b.totalSections - a.totalSections);
  if (_coversSortMode === 'shortest') return [...items].filter(i => i.totalSections > 0).sort((a, b) => a.totalSections - b.totalSections);
  return [...items];
}

function _randomizedCoverItems() {
  return _shuffle(_visibleCoverItems());
}

// ── Cover thumb HTML ───────────────────────────────────────────────────────────
function _makeCoverThumbHTML(c) {
  const cls = c.isSeries ? ' cover-thumb--series' : (c.isContainer ? ' cover-thumb--anthology' : '');
  const isFavorite = _isFavoriteCoverItem(c);
  const favBtn = (getToken() && !isDemoMode)
    ? `<button class="cover-fav-btn${isFavorite ? ' is-favorite' : ''}" type="button" data-fav-type="${c.isSeries ? 'series' : 'book'}" data-fav-id="${c.isSeries ? c.entityId : c.id}" title="${isFavorite ? t('covers.remove_from_favorites') : t('covers.add_to_favorites')}" aria-label="${isFavorite ? t('covers.remove_from_favorites') : t('covers.add_to_favorites')}">${isFavorite ? '★' : '☆'}</button>`
    : '';
  const useSingleSeriesCover = c.isSeries && c.coverSources?.length && c.coverSources.length < 4;
  const attrs = c.isSeries
    ? ` data-series-id="${c.entityId}" data-series-name="${escapeHtml(c.name)}" data-series-book-count="${Number(c.bookCount) || 0}"${c.coverSources?.length ? ` data-series-cover-sources="${escapeHtml(JSON.stringify(c.coverSources))}"` : ''}`
    : ` data-book-id="${c.id}" data-book-name="${escapeHtml(c.name)}"${c.coverUrl ? ` data-cover-url="${escapeHtml(c.coverUrl)}"` : ''}`;
  return `<div class="cover-thumb${cls}"${attrs}>` +
    favBtn +
    (c.isSeries ? `<span class="cover-series-badge">series</span>` : '') +
    (c.isContainer ? `<span class="cover-anthology-badge">anthology</span>` : '') +
    (c.isOpenWorld ? `<span class="cover-open-world-badge" data-tooltip="Open world series"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span>` : '') +
    (c.isSeries
      ? (
        c.coverSources?.length
          ? (useSingleSeriesCover
              ? `<div class="cover-series-grid cover-series-grid--single">` +
                  `<div class="cover-series-cell"><img src="${escapeHtml(c.coverSources[0])}" alt=""></div>` +
                `</div>`
              : `<div class="cover-series-grid">` +
                  c.coverSources.map(src => `<div class="cover-series-cell"><img src="${escapeHtml(src)}" alt=""></div>`).join('') +
                  Array.from({ length: Math.max(0, 4 - c.coverSources.length) }, () => `<div class="cover-series-cell"></div>`).join('') +
                `</div>`)
          : `<div class="cover-series-empty">${escapeHtml(c.name)}</div>`
      )
      : (c.coverUrl ? `<div class="cover-load-bar"></div><img alt="${escapeHtml(c.name)}">` : `<div class="cover-no-img">${escapeHtml(c.name)}</div>`)
    ) +
    `</div>`;
}

function _syncCoverFavoriteButton(btn, isFavorite) {
  if (!btn) return;
  btn.classList.toggle('is-favorite', !!isFavorite);
  btn.textContent = isFavorite ? '★' : '☆';
  const label = isFavorite ? t('covers.remove_from_favorites') : t('covers.add_to_favorites');
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

function _removeFavoriteThumbInPlace(favBtn) {
  const thumb = favBtn?.closest('.cover-thumb');
  if (!thumb) return;
  const grid = document.getElementById('covers-grid');
  const panel = document.getElementById('covers-panel');
  if (_lazyItems) {
    const favType = favBtn.dataset.favType;
    const favId = Number(favBtn.dataset.favId);
    const idx = _lazyItems.findIndex(item => (
      favType === 'series'
        ? (item.isSeries && Number(item.entityId) === favId)
        : (!item.isSeries && Number(item.id) === favId)
    ));
    if (idx >= 0) {
      _lazyItems.splice(idx, 1);
      if (_lazyOffset > idx) _lazyOffset -= 1;
    }
  }
  thumb.remove();
  _updateCoversCount();
  if (_lazyItems && panel && grid) {
    requestAnimationFrame(() => {
      if (_lazyItems && _lazyOffset < _lazyItems.length &&
          panel.scrollHeight <= panel.clientHeight + 50) {
        _appendLazyBatch();
      }
    });
  } else {
    _trimCoversToFit();
  }
}

// ── Lazy loading ───────────────────────────────────────────────────────────────
function _updateCoversCount() {
  const countEl = document.getElementById('covers-count');
  const totalEl = document.getElementById('covers-total');
  if (!totalEl) return;
  if (_lazyItems) {
    if (countEl) countEl.textContent = `${Math.min(_lazyOffset, _lazyItems.length).toLocaleString()} `;
    totalEl.textContent = ` (${_lazyItems.length.toLocaleString()} total)`;
  } else {
    if (countEl) countEl.textContent = '';
    totalEl.textContent = ` (${_visibleCoverItems().length.toLocaleString()} total)`;
  }
}

function _stopLazy() {
  const panel = document.getElementById('covers-panel');
  if (panel && _lazyScrollFn) panel.removeEventListener('scroll', _lazyScrollFn);
  _lazyItems    = null;
  _lazyOffset   = 0;
  _lazyScrollFn = null;
  _lazyGrid     = null;
  _coversPanelQueue = [];
  _coversPanelGen++;
  _coversPanelRunning = false;
}

function _appendLazyBatch() {
  if (!_lazyItems || !_lazyGrid || _lazyOffset >= _lazyItems.length) return;
  const start = _lazyOffset;
  const end   = Math.min(start + _LAZY_BATCH, _lazyItems.length);
  const frag  = document.createDocumentFragment();
  for (let i = start; i < end; i++) {
    const tmp = document.createElement('div');
    tmp.innerHTML = _makeCoverThumbHTML(_lazyItems[i]);
    frag.appendChild(tmp.firstChild);
  }
  _lazyGrid.appendChild(frag);
  const allThumbs = _lazyGrid.querySelectorAll('.cover-thumb');
  for (let i = start; i < end; i++) {
    const c = _lazyItems[i];
    if (!c.coverUrl) continue;
    const thumb = allThumbs[i];
    if (thumb) _enqueueCoverLoad(c.coverUrl, thumb.querySelector('img'), thumb.querySelector('.cover-load-bar'));
  }
  _lazyOffset = end;
  _updateCoversCount();
  requestAnimationFrame(() => {
    const panel = document.getElementById('covers-panel');
    if (panel && _lazyItems && _lazyOffset < _lazyItems.length &&
        panel.scrollHeight <= panel.clientHeight + 50) {
      _appendLazyBatch();
    }
  });
}

export function _startLazy(items) {
  _stopLazy();
  const grid  = document.getElementById('covers-grid');
  const panel = document.getElementById('covers-panel');
  if (!grid || !panel) return;
  grid.innerHTML = '';
  panel.classList.add('covers-lazy');
  _lazyItems  = items;
  _lazyOffset = 0;
  _lazyGrid   = grid;
  _updateCoversCount();
  if (!_lazyItems.length) return;
  _appendLazyBatch();
  _lazyScrollFn = () => {
    if (!_lazyItems || _lazyOffset >= _lazyItems.length) return;
    if (panel.scrollHeight - panel.scrollTop - panel.clientHeight < 300) _appendLazyBatch();
  };
  panel.addEventListener('scroll', _lazyScrollFn);
}

// ── Covers rendering ───────────────────────────────────────────────────────────
function _renderCovers(covers) {
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

function _trimCoversToFit() {
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
  if (_coversSortMode === 'random') {
    _renderCovers(_randomizedCoverItems());
    _trimCoversToFit();
  } else {
    _startLazy(_sortedAllBooks());
  }
}

function _updateCoversTotal() { _updateCoversCount(); }

export function _showCachedCoversPanel() {
  const panel = document.getElementById('covers-panel');
  const toggle = document.getElementById('covers-toggle');
  if (!panel) return;
  if (!_allBooks.length && !_allSeriesCovers.length && !_allCovers.length) return;
  panel.classList.add('active');
  toggle?.classList.add('visible');
  _refreshCoversDisplay();
  if (_allCovers.some(c => c.coverUrl)) {
    _startLandingCoverRotation({ reset: false, immediate: true });
  }
}

export function _refreshPublicCatalogIfVisible() {
  const wrapper = document.getElementById('landing-wrapper');
  if (!wrapper) return;
  if (wrapper.style.display === 'none') return;
  loadCovers({ force: true });
}

export function _isLandingBooksViewVisible() {
  const landingVisible = document.getElementById('landing-wrapper')?.style.display !== 'none';
  const mainHidden = document.getElementById('main-screen')?.style.display === 'none';
  const booksVisible = document.getElementById('books-screen')?.style.display !== 'none';
  const loginVisible = document.getElementById('login-screen')?.style.display !== 'none';
  return landingVisible && mainHidden && (booksVisible || loginVisible);
}

export function _visibleCoverItemsExport() { return _visibleCoverItems(); }

// ── Landing bg ─────────────────────────────────────────────────────────────────
function _landingCoverKey(cover) {
  return cover?.id != null ? String(cover.id) : '';
}

function _landingCoverPosForKey(key) {
  const val = Number(_landingCoverPosPrefs?.[key]);
  return Number.isFinite(val) ? Math.max(0, Math.min(100, val)) : 50;
}

function _persistLandingCoverPos() {
  if (!getToken() || isDemoMode || !_landingBgCurrentKey) return;
  _landingCoverPosPrefs = {
    ..._landingCoverPosPrefs,
    [_landingBgCurrentKey]: Math.round(_landingBgPosY * 10) / 10,
  };
  _hooks.savePrefs?.({ landingCoverPos: _landingCoverPosPrefs });
}

export function _effectiveLandingCoverSource() {
  return (_landingCoverSource === 'mine' && getToken() && !isDemoMode) ? 'mine' : 'public';
}

function _ownedLandingCoverPool() {
  const books = Array.isArray(_hooks.getCachedBooks?.()) ? _hooks.getCachedBooks() : [];
  const seen = new Set();
  return books
    .filter(b => !!b?.cover_path)
    .map(b => ({
      id: `owned_${b.id}`,
      entityId: b.id,
      type: b.is_container ? 'anthology' : 'book',
      isSeries: false,
      isContainer: !!b.is_container,
      name: b.name,
      description: b.description || null,
      createdAt: b.created_at || b.createdAt || 0,
      authors: b.authors || null,
      seriesName: b.series_name || null,
      coverUrl: `/covers/${b.cover_path}`,
    }))
    .filter(entry => {
      if (!entry.coverUrl || seen.has(entry.coverUrl)) return false;
      seen.add(entry.coverUrl);
      return true;
    });
}

function _landingCoverPool() {
  if (_effectiveLandingCoverSource() !== 'mine') return (_allCovers || []).filter(c => c.coverUrl);
  return _ownedLandingCoverPool();
}

export function _applyLandingBgPosition() {
  ['a', 'b'].forEach(l => {
    const el = document.getElementById(`landing-bg-${l}`);
    if (el) el.style.backgroundPosition = `center ${_landingBgPosY}%`;
  });
}

export function _canDragLandingBg() {
  if (_isMobile()) return false;
  if (document.getElementById('landing-wrapper')?.style.display === 'none') return false;
  return document.body.classList.contains('covers-collapsed')
    && document.body.classList.contains('right-collapsed')
    && document.body.classList.contains('feed-collapsed');
}

export function _updateLandingBgDragUi() {
  const wrapper = document.getElementById('landing-wrapper');
  if (!wrapper) return;
  wrapper.classList.toggle('landing-bg-draggable', _canDragLandingBg());
}

export function _stopLandingCoverRotation() {
  clearInterval(window._landingCoverInterval);
  window._landingCoverInterval = null;
  _landingBgQueue = [];
  _landingBgQueueIdx = 0;
  ['a','b'].forEach(l => {
    const el = document.getElementById(`landing-bg-${l}`);
    if (el) el.style.opacity = '0';
  });
}

function _nextLandingCover() {
  const coversPool = _landingCoverPool();
  if (!coversPool.length) return null;
  if (_landingBgQueueIdx >= _landingBgQueue.length) {
    _landingBgQueue = _shuffle(coversPool);
    _landingBgQueueIdx = 0;
  }
  return _landingBgQueue[_landingBgQueueIdx++] || null;
}

// Two independent call sites (_showCachedCoversPanel, using stale cached data
// for perceived speed, and loadCovers, once the fresh fetch resolves) can both
// request an "immediate" rotation within a few hundred ms of each other on
// every return-to-Home. Without this guard, a second call landing mid-crossfade
// grabs whichever layer the first call is still mid-transition on and stomps
// its opacity/backgroundImage directly (no transition, since only `opacity` is
// animated - a background-image swap on an already-opacity:1 layer is instant),
// then schedules its own cleanup timeout against a layer the OTHER call also
// scheduled a timeout against - the two callbacks fight over the same two
// elements and can leave both layers at opacity:0, i.e. the background just
// disappears until the next natural 60s tick. Queueing instead of stacking
// fixes it: only one crossfade is ever in flight; a request that arrives
// mid-transition waits for it to finish, then runs cleanly on its own.
let _rotationInFlight = false;
let _rotationQueued   = false;

function _rotateLandingCover() {
  if (_rotationInFlight) { _rotationQueued = true; return; }
  const pick = _nextLandingCover();
  if (!pick) return;
  const key = _landingCoverKey(pick);
  _landingBgCurrentKey = key || null;
  _landingBgPosY = _landingCoverPosForKey(key);
  const url = `linear-gradient(rgba(15,23,42,0.92), rgba(15,23,42,0.92)), url(${pick.coverUrl})`;
  const next = _landingBgActive === 'a' ? 'b' : 'a';
  const cur = document.getElementById(`landing-bg-${_landingBgActive}`);
  const nxt = document.getElementById(`landing-bg-${next}`);
  if (!cur || !nxt) return;
  _rotationInFlight = true;
  nxt.style.willChange = 'opacity';
  nxt.style.backgroundImage = url;
  nxt.style.backgroundPosition = `center ${_landingBgPosY}%`;
  nxt.style.opacity = '1';
  setTimeout(() => {
    cur.style.opacity = '0';
    setTimeout(() => {
      cur.style.willChange = 'auto';
      _rotationInFlight = false;
      if (_rotationQueued) { _rotationQueued = false; _rotateLandingCover(); }
    }, 1600);
  }, 1500);
  _landingBgActive = next;
}

export function _startLandingCoverRotation({ reset = false, immediate = false } = {}) {
  if (_isMobile()) return;
  if (document.getElementById('landing-wrapper')?.style.display === 'none') return;
  const coversPool = _landingCoverPool();
  if (!coversPool.length) { _stopLandingCoverRotation(); return; }
  if (reset) {
    _landingBgQueue = [];
    _landingBgQueueIdx = 0;
  }
  _applyLandingBgPosition();
  if (!window._landingCoverInterval) {
    immediate = true;
    window._landingCoverInterval = setInterval(_rotateLandingCover, 60_000);
  }
  if (immediate) _rotateLandingCover();
}

// ── Load covers API ────────────────────────────────────────────────────────────
function _coversFingerprint(covers, books, series) {
  const sortRows = rows => [...rows].sort((a, b) => {
    const aId = a[0] ?? 0;
    const bId = b[0] ?? 0;
    if (aId !== bId) return aId - bId;
    return naturalCompare(String(a[1] ?? ''), String(b[1] ?? ''));
  });
  return JSON.stringify({
    covers: sortRows((Array.isArray(covers) ? covers : []).map(c => [c.id, c.name, c.coverUrl || c.cover_path || '', c.createdAt || c.created_at || 0, c.isContainer ? 1 : 0])),
    books: sortRows((Array.isArray(books) ? books : []).map(b => [b.id, b.name, b.coverUrl || b.cover_path || '', b.createdAt || b.created_at || 0, b.seriesId || b.series_id || 0, b.isContainer ? 1 : (b.is_container ? 1 : 0), b.libraryCount || 0])),
    series: sortRows((Array.isArray(series) ? series : []).map(s => [s.id, s.name, s.description || '', s.book_count || 0, s.library_count || 0])),
  });
}

export async function loadCovers({ force = true } = {}) {
  if (_loadCoversInFlight) {
    _loadCoversPending = { force: force || (_loadCoversPending?.force ?? false) };
    return;
  }
  _loadCoversInFlight = true;
  const panel = document.getElementById('covers-panel');
  const grid  = document.getElementById('covers-grid');
  if (!panel || !grid) { _loadCoversInFlight = false; _drainPendingLoadCovers(); return; }
  try {
    const noStore = { cache: 'no-store' };
    const [coversRes, booksRes, seriesRes] = await Promise.all([
      publicFetch('/api/public/covers', noStore),
      publicFetch('/api/public/books', noStore),
      publicFetch('/api/public/series', noStore),
    ]);
    const covers = await coversRes.json();
    const publicBooks = await booksRes.json();
    const publicSeries = await seriesRes.json();
    const nextFingerprint = _coversFingerprint(covers, publicBooks, publicSeries);
    const dataChanged = nextFingerprint !== _coversDataFingerprint;
    if (!force && !dataChanged) return;
    _coversDataFingerprint = nextFingerprint;
    if (!_isLandingBooksViewVisible()) return;
    _allBooks    = publicBooks;
    _allSeriesCovers = _buildSeriesCoverEntries(Array.isArray(publicSeries) ? publicSeries : [], Array.isArray(_allBooks) ? _allBooks : []);
    if (!covers.length && !_allBooks.length && !_allSeriesCovers.length) {
      panel.classList.remove('active');
      document.getElementById('covers-toggle').classList.remove('visible');
      return;
    }
    _allCovers = covers;
    const kindLabel = document.getElementById('covers-kind-label');
    const kindMenu = document.getElementById('covers-kind-menu');
    if (kindLabel && kindMenu) {
      const effective = _effectiveCoversKindMode();
      const kindLabels = { all: 'All', books: 'Books', anthologies: 'Anthologies', series: 'Series', favorites: 'Favorites' };
      kindLabel.textContent = kindLabels[effective] || effective;
      kindMenu.querySelectorAll('li').forEach(li => li.classList.toggle('active', li.dataset.value === effective));
      const favLi = kindMenu.querySelector('li[data-value="favorites"]');
      if (favLi) favLi.style.display = (getToken() && !isDemoMode) ? '' : 'none';
    }
    panel.classList.add('active');
    document.getElementById('covers-toggle').classList.add('visible');
    _refreshCoversDisplay();
    _startLandingCoverRotation({ reset: dataChanged, immediate: true });
  } catch (_) {
    panel.classList.remove('active');
    _stopLandingCoverRotation();
  } finally {
    _loadCoversInFlight = false;
    _drainPendingLoadCovers();
  }
}

function _drainPendingLoadCovers() {
  if (!_loadCoversPending) return;
  const opts = _loadCoversPending;
  _loadCoversPending = null;
  loadCovers(opts);
}

// ── Cover/series activity modals ───────────────────────────────────────────────
export async function openCoverActivity(bookId, bookName) {
  openPublicModal();
  document.getElementById('pub-modal-title').textContent = bookName;
  document.getElementById('pub-back-btn').style.display  = 'none';
  document.getElementById('pub-modal-body').innerHTML    = `<p class="pub-loading">${t('covers.loading')}</p>`;
  try {
    const res = getToken()
      ? await apiFetch(`/api/public/book/${bookId}/activity`)
      : await publicFetch(`/api/public/book/${bookId}/activity`);
    if (!res.ok) throw new Error();
    const data = await res.json();

    let userRating;
    let userCanRate = true;
    const userLoggedIn = !!getToken();
    let userOwnsBook   = false;
    if (userLoggedIn) {
      try {
        const rRes = await apiFetch(`/api/books/${bookId}/rating`);
        if (rRes.ok) {
          const rData = await rRes.json();
          userOwnsBook = true;
          userRating   = rData.rating;
          userCanRate  = rData.canRate ?? true;
        }
      } catch {}
    }

    renderCoverActivity(bookId, data.book?.name ?? bookName, data.entries ?? [], userRating, data.book, userLoggedIn, userOwnsBook, userCanRate);
  } catch {
    document.getElementById('pub-modal-body').innerHTML = `<p class="pub-error">${t('covers.activity_load_failed')}</p>`;
  }
}

export async function openSeriesActivity(seriesId, seriesName) {
  openPublicModal();
  document.getElementById('pub-modal-title').textContent = seriesName;
  document.getElementById('pub-back-btn').style.display  = 'none';
  document.getElementById('pub-modal-body').innerHTML    = `<p class="pub-loading">${t('covers.loading')}</p>`;
  try {
    const res = await publicFetch(`/api/public/series/${seriesId}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderSeriesActivity(data);
  } catch {
    document.getElementById('pub-modal-body').innerHTML = `<p class="pub-error">${t('covers.series_load_failed')}</p>`;
  }
}

function renderSeriesActivity(data) {
  const backBtn = document.getElementById('pub-back-btn');
  document.getElementById('pub-modal-title').innerHTML =
    escapeHtml(data.name) + ` <span class="pub-modal-type">${t('covers.series_label')}</span>`;
  const body = document.getElementById('pub-modal-body');
  body.style.padding  = '';
  body.style.overflow = '';

  const userLoggedIn  = !!getToken();
  const userHasSeries = userLoggedIn && _hooks.getCachedAllSeries?.()?.some(s => s.id === data.id);

  let html = '<div class="book-modal-header"><div class="book-modal-meta">';
  if (data.description) html += `<div class="book-modal-description">${escapeHtml(data.description)}</div>`;
  html += `<div class="book-modal-sections">${data.books.length} ${data.books.length === 1 ? 'book' : 'books'} in series</div>`;
  html += `<div class="star-rating" id="series-star-widget" data-series-id="${data.id}">`;
  html += _hooks.starsHtml?.(data.avgRating ?? null) ?? '';
  html += `<span class="star-label">${_hooks.starLabelHtml?.(data.avgRating ?? null, data.voteCount ?? 0, 'series') ?? ''}</span>`;
  html += `</div>`;
  if (data.isPublic && userLoggedIn && !userHasSeries) {
    html += `<button class="add-to-library-btn" id="add-series-to-lib-btn" data-series-id="${data.id}">${t('covers.add_to_library')}</button>`;
  }
  html += '</div></div>';

  if (data.books.length) {
    html += `<div class="book-modal-children-section"><div class="book-modal-children-header">${t('covers.books_in_series')}</div><div class="book-modal-children-list">`;
    for (const b of data.books) {
      const num = b.seriesNumber ? ` <span class="child-row-num">#${escapeHtml(b.seriesNumber)}</span>` : '';
      if (b.isContainer) {
        const sub = `<span class="child-row-sections">${b.childCount} ${b.childCount === 1 ? 'book' : 'books'}</span>`;
        html += `<div class="book-modal-anthology-row" data-anthology-id="${b.id}">
          <button class="book-modal-child-row anthology-name-btn" data-book-id="${b.id}" data-book-name="${escapeHtml(b.name)}">
            <span class="child-row-name">${escapeHtml(b.name)}${num}</span>
            ${sub}
            <span class="child-row-arrow">&#x203a;</span>
          </button>
          ${b.children.length ? `<button class="anthology-toggle-btn" data-anthology-id="${b.id}" aria-expanded="false" aria-label="${t('covers.expand_anthology')}">&#x25b8;</button>` : ''}
        </div>`;
        if (b.children.length) {
          html += `<div class="anthology-children-list" id="anthology-children-${b.id}" style="display:none">`;
          for (const c of b.children) {
            const csub = c.totalSections ? `<span class="child-row-sections">${c.totalSections} sections</span>` : '';
            html += `<button class="book-modal-child-row anthology-child-btn" data-book-id="${c.id}" data-book-name="${escapeHtml(c.name)}">
              <span class="child-row-name">${escapeHtml(c.name)}</span>
              ${csub}
              <span class="child-row-arrow">&#x203a;</span>
            </button>`;
          }
          html += `</div>`;
        }
      } else {
        const sub = b.totalSections ? `<span class="child-row-sections">${b.totalSections} sections</span>` : '';
        html += `<button class="book-modal-child-row" data-book-id="${b.id}" data-book-name="${escapeHtml(b.name)}">
          <span class="child-row-name">${escapeHtml(b.name)}${num}</span>
          ${sub}
          <span class="child-row-arrow">&#x203a;</span>
        </button>`;
      }
    }
    html += '</div></div>';
  } else {
    html += '<p class="pub-empty">No public books in this series yet.</p>';
  }

  body.innerHTML = html;

  const addSeriesBtn = body.querySelector('#add-series-to-lib-btn');
  if (addSeriesBtn) {
    addSeriesBtn.addEventListener('click', async () => {
      addSeriesBtn.disabled = true;
      addSeriesBtn.textContent = t('covers.adding');
      try {
        const res = await apiFetch(`/api/series/${data.id}/add?cascade=1`, { method: 'POST' });
        if (res.ok) {
          addSeriesBtn.textContent = t('covers.added_to_library');
          addSeriesBtn.classList.add('add-to-library-done');
          _hooks.showBooks?.();
        } else {
          addSeriesBtn.disabled = false;
          addSeriesBtn.textContent = t('covers.add_to_library');
        }
      } catch { addSeriesBtn.disabled = false; addSeriesBtn.textContent = t('covers.add_to_library'); }
    });
  }

  body.querySelectorAll('.anthology-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const list = body.querySelector(`#anthology-children-${btn.dataset.anthologyId}`);
      if (!list) return;
      const expanded = list.style.display !== 'none';
      list.style.display = expanded ? 'none' : '';
      btn.setAttribute('aria-expanded', String(!expanded));
      btn.textContent = expanded ? '▸' : '▾';
    });
  });

  body.querySelectorAll('.book-modal-child-row').forEach(btn => {
    btn.addEventListener('click', () => {
      backBtn.style.display = '';
      backBtn.onclick = () => renderSeriesActivity(data);
      openCoverActivity(+btn.dataset.bookId, btn.dataset.bookName);
    });
  });

  const ssw = body.querySelector('#series-star-widget');
  if (ssw) {
    let currentRating = null;
    let avgRating     = data.avgRating ?? null;
    let voteCount     = data.voteCount ?? 0;
    let canRate       = false;
    const seriesId    = data.id;

    const updateStars = (hoverVal) => {
      const displayVal = hoverVal !== null ? hoverVal : avgRating;
      ssw.querySelectorAll('.star').forEach(s => {
        const p = +s.dataset.pos;
        s.className = (displayVal !== null && displayVal >= p) ? 'star on'
                    : (displayVal !== null && displayVal >= p - 0.5) ? 'star half'
                    : 'star';
      });
      const lbl = ssw.querySelector('.star-label');
      if (hoverVal !== null) {
        lbl.innerHTML = `<span class="star-avg">${hoverVal % 1 === 0 ? hoverVal.toFixed(1) : hoverVal}</span>`;
      } else {
        lbl.innerHTML = _hooks.starLabelHtml?.(avgRating, voteCount, 'series') ?? '';
      }
    };

    updateStars(null);

    if (userLoggedIn && userHasSeries) {
      apiFetch(`/api/series/${seriesId}/rating`).then(async r => {
        if (!r.ok) return;
        const d = await r.json();
        currentRating = d.rating ?? null;
        avgRating     = d.avgRating ?? null;
        voteCount     = d.voteCount ?? 0;
        canRate       = d.canRate ?? false;
        ssw.dataset.userRating = currentRating ?? '';
        if (!canRate) ssw.title = 'Complete all books in this series first to rate it';
        updateStars(null);
      }).catch(() => {});

      ssw.querySelectorAll('.star').forEach(star => {
        star.addEventListener('mousemove', e => {
          const left = e.offsetX < star.offsetWidth / 2;
          updateStars(+star.dataset.pos - (left ? 0.5 : 0));
        });
        star.addEventListener('click', async e => {
          if (!canRate) { _hooks.flashRatingGate?.(ssw, 'Complete all books in the series first'); return; }
          const left      = e.offsetX < star.offsetWidth / 2;
          const newRating = +star.dataset.pos - (left ? 0.5 : 0);
          const toSave    = newRating === currentRating ? null : newRating;
          const prevRating = currentRating;
          currentRating = toSave;
          ssw.dataset.userRating = toSave ?? '';
          updateStars(null);
          try {
            const res = await apiFetch(`/api/series/${seriesId}/rating`, {
              method: 'PATCH', body: JSON.stringify({ rating: toSave }),
            });
            if (res.ok) {
              const d = await res.json();
              avgRating = d.avgRating ?? null;
              voteCount = d.voteCount ?? 0;
              updateStars(null);
            } else {
              currentRating = prevRating;
              ssw.dataset.userRating = prevRating ?? '';
              updateStars(null);
            }
          } catch {
            currentRating = prevRating;
            ssw.dataset.userRating = prevRating ?? '';
            updateStars(null);
          }
        });
      });
      ssw.addEventListener('mouseleave', () => updateStars(null));
    }
  }
}

function renderCoverActivity(bookId, bookName, entries, userRating, bookMeta, userLoggedIn, userOwnsBook, userCanRate = true) {
  _destroyPubNetworks();
  document.getElementById('public-modal').classList.remove('pub-modal--run');
  const backBtn = document.getElementById('pub-back-btn');
  backBtn.style.display = 'none';
  const typeLabel = bookMeta?.isContainer ? 'Anthology' : bookMeta?.issn ? 'Magazine' : '';
  document.getElementById('pub-modal-title').innerHTML =
    escapeHtml(bookName) + (typeLabel ? ` <span class="pub-modal-type">(${typeLabel})</span>` : '');
  const body = document.getElementById('pub-modal-body');
  body.style.padding  = '';
  body.style.overflow = '';

  let headerHtml = '<div class="book-modal-header">';
  if (bookMeta?.coverUrl) {
    headerHtml += `<img class="book-modal-cover" src="${escapeHtml(bookMeta.coverUrl)}" alt="${escapeHtml(bookName)}">`;
  }
  headerHtml += '<div class="book-modal-meta">';
  if (bookMeta?.parentId) {
    headerHtml += `<div class="book-modal-in-collection"><span class="in-collection-label">Anthology:</span><button class="book-modal-parent-btn" data-book-id="${bookMeta.parentId}" data-book-name="${escapeHtml(bookMeta.parentName)}">${escapeHtml(bookMeta.parentName)}</button></div>`;
  }
  if (bookMeta?.seriesName) {
    const seriesLabel = bookMeta.seriesNumber
      ? `${escapeHtml(bookMeta.seriesName)} #${escapeHtml(bookMeta.seriesNumber)}`
      : escapeHtml(bookMeta.seriesName);
    headerHtml += `<div class="book-modal-in-collection"><span class="in-collection-label">Series:</span><button class="book-modal-series-btn" data-series-id="${bookMeta.seriesId || ''}" data-series-name="${escapeHtml(bookMeta.seriesName)}">${seriesLabel}</button></div>`;
  }
  if (bookMeta?.authors) {
    headerHtml += `<div class="book-modal-authors">${escapeHtml(bookMeta.authors)}</div>`;
  }
  const metaBits = [];
  if (bookMeta?.totalSections) metaBits.push(`${bookMeta.totalSections} sections`);
  if (bookMeta?.pages)         metaBits.push(`${bookMeta.pages} pages`);
  if (metaBits.length) headerHtml += `<div class="book-modal-sections">${metaBits.join(' · ')}</div>`;
  const ids = [];
  if (bookMeta?.isbn) ids.push(`ISBN ${escapeHtml(bookMeta.isbn)}`);
  if (bookMeta?.asin) ids.push(`ASIN ${escapeHtml(bookMeta.asin)}`);
  if (bookMeta?.issn) ids.push(`ISSN ${escapeHtml(bookMeta.issn)}`);
  if (ids.length) headerHtml += `<div class="book-modal-ids">${ids.join(' · ')}</div>`;
  if (bookMeta?.description) {
    headerHtml += `<div class="book-modal-description">${escapeHtml(bookMeta.description)}</div>`;
  }
  const avgRating  = bookMeta?.avgRating ?? null;
  const voteCount  = bookMeta?.voteCount ?? 0;
  const showWidget = userOwnsBook || voteCount > 0;
  if (showWidget) {
    headerHtml += `<div class="star-rating" data-book-id="${bookId}">
      ${_hooks.starsHtml?.(avgRating) ?? ''}
      <span class="star-label">${_hooks.starLabelHtml?.(avgRating, voteCount) ?? ''}</span>
    </div>`;
  }
  if (userOwnsBook && !_isMobile()) {
    headerHtml += `<button class="add-to-library-btn open-owned-book-btn" data-book-id="${bookId}">${t('covers.open_book')}</button>`;
  }
  if (bookMeta?.isPublic && userLoggedIn && !userOwnsBook) {
    headerHtml += `<button class="add-to-library-btn" data-book-id="${bookId}">${t('covers.add_to_library')}</button>`;
  }
  if (_hooks.getIsAdmin?.()) {
    headerHtml += `<button class="add-to-library-btn catalog-admin-edit-btn" data-book-id="${bookId}" style="color:#f5a623;border-color:#92400e">✎ Admin Edit</button>`;
  }
  headerHtml += '</div></div>';

  if (bookMeta?.isContainer && bookMeta?.children?.length) {
    headerHtml += `<div class="book-modal-children-section">
      <div class="book-modal-children-header">${t('covers.books_in_anthology')}</div>
      <div class="book-modal-children-list">`;
    headerHtml += bookMeta.children.map(c =>
      `<button class="book-modal-child-row" data-book-id="${c.id}" data-book-name="${escapeHtml(c.name)}">
        <span class="child-row-name">${escapeHtml(c.name)}</span>
        ${c.total_sections ? `<span class="child-row-sections">${c.total_sections} sections</span>` : ''}
        <span class="child-row-arrow">›</span>
      </button>`
    ).join('');
    headerHtml += `</div></div>`;
  }

  let activityHtml = '';
  if (!entries.length) {
    activityHtml = `<p class="pub-empty">No public activity for this ${bookMeta?.isContainer ? 'anthology' : bookMeta?.issn ? 'magazine' : 'book'} yet.</p>`;
  } else {
    const multiBook = entries.some(e => e.bookName !== entries[0].bookName);
    activityHtml = '<div class="cover-activity-view">';
    for (const e of entries) {
      const initial    = escapeHtml(e.username.charAt(0).toUpperCase());
      const avatarHtml = e.avatarUrl
        ? `<img class="cover-act-avatar" src="${escapeHtml(e.avatarUrl)}" alt="">`
        : `<div class="cover-act-avatar cover-act-avatar-ph">${initial}</div>`;
      const userEl = e.publicProfile
        ? `<button class="cover-act-username" data-username="${escapeHtml(e.username)}">${escapeHtml(e.username)}</button>`
        : `<span class="cover-act-username-plain">${escapeHtml(e.username)}</span>`;
      const bookLabel = (multiBook || bookMeta?.isContainer)
        ? `<span class="cover-act-header-book">${escapeHtml(e.bookName)}</span>` : '';
      activityHtml += `<div class="cover-act-entry cover-act-entry--collapsed">
        <div class="cover-act-user cover-act-toggle">${avatarHtml}${userEl}${bookLabel}<span class="cover-act-run-count">${e.runs.length} run${e.runs.length === 1 ? '' : 's'}</span><span class="cover-act-chevron">&#9658;</span></div>
        <div class="cover-act-body">
        <div class="cover-act-runs">`;
      for (const run of e.runs) {
        const isWin    = run.result === 'success';
        const isBattle = run.result === 'battle';
        const label = `Run ${run.runIndex + 1} - ${isWin ? '★ Victory' : isBattle ? '⚔ Battle Death' : '† Lost'}`;
        const cls   = isWin ? 'pub-run-win' : 'pub-run-death';
        activityHtml += `<button class="pub-run-btn ${cls}" data-book-id="${e.bookId}" data-user-id="${e.userId}" data-run-index="${run.runIndex}">${escapeHtml(label)}</button>`;
      }
      activityHtml += `</div></div></div>`;
    }
    activityHtml += '</div>';
  }

  body.innerHTML = headerHtml + activityHtml;

  body.querySelectorAll('.cover-act-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      toggle.closest('.cover-act-entry').classList.toggle('cover-act-entry--collapsed');
    });
  });

  const addBtn = body.querySelector('.add-to-library-btn:not(.open-owned-book-btn):not(.catalog-admin-edit-btn)');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      addBtn.textContent = t('covers.adding');
      try {
        const res = await apiFetch(`/api/books/${bookId}/add`, { method: 'POST' });
        if (res.ok) {
          await _hooks.refreshBooksListOnly?.();
          renderCoverActivity(
            bookId, bookName, entries, currentMyRating,
            { ...bookMeta, avgRating: currentAvg, voteCount: currentCount },
            userLoggedIn, true, false
          );
        } else {
          const d = await res.json().catch(() => ({}));
          addBtn.textContent = d.error || t('covers.failed');
          addBtn.disabled = false;
        }
      } catch {
        addBtn.textContent = t('covers.error_retry');
        addBtn.disabled = false;
      }
    });
  }

  const adminEditBtn = body.querySelector('.catalog-admin-edit-btn');
  if (adminEditBtn) {
    adminEditBtn.addEventListener('click', () => {
      _hooks.openEditBookModal?.({
        bookId,
        initialName:          bookMeta?.name          || bookName,
        initialSections:      bookMeta?.totalSections  || 0,
        initialIsbn:          bookMeta?.isbn           || '',
        initialIssn:          bookMeta?.issn           || '',
        initialAsin:          bookMeta?.asin           || '',
        initialCoverUrl:      bookMeta?.coverUrl       || null,
        initialPdfPath:       bookMeta?.pdfPath        || null,
        initialPdfSize:       bookMeta?.pdfSize        || null,
        initialPages:         bookMeta?.pages          ? String(bookMeta.pages) : '',
        initialAuthors:       bookMeta?.authors        || '',
        initialDescription:   bookMeta?.description    || '',
        initialIsPublic:      bookMeta?.isPublic       ?? true,
        initialSeriesName:    bookMeta?.seriesName     || '',
        initialSeriesNumber:  bookMeta?.seriesNumber   || '',
        initialIsContainer:   bookMeta?.isContainer    ?? false,
        initialParentBookId:  bookMeta?.parentId       || null,
        minSections: 1,
        onSave: async (name, sections, isbn, issn, asin, pages, authors, description, discoverableSections, isPublic, seriesName, seriesNumber, isContainer, parentId, bookOrder) => {
          try {
            await apiFetch(`/api/books/${bookId}`, {
              method: 'PATCH',
              body: JSON.stringify({ name, total_sections: sections, isbn: isbn || null, issn: issn || null, asin: asin || null, pages: pages || null, authors: authors || null, description: description || null, discoverable_sections: discoverableSections ?? null, is_public: isPublic, series_name: seriesName || null, series_number: seriesNumber || null, is_container: !!isContainer, parent_book_id: parentId || null, book_order: bookOrder ?? null }),
            });
          } catch (_) {}
          openCoverActivity(bookId, bookName);
        },
      });
    });
  }

  const openOwnedBtn = body.querySelector('.open-owned-book-btn');
  if (openOwnedBtn) {
    openOwnedBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      openOwnedBtn.disabled = true;
      openOwnedBtn.textContent = t('covers.opening');
      const targetBookId = +openOwnedBtn.dataset.bookId;
      _hooks.lockView?.('book', 1500);
      await _hooks.navigateToBook?.(targetBookId);
      closePublicModal();
    });
  }

  let currentMyRating = userRating ?? null;
  let currentAvg      = avgRating;
  let currentCount    = voteCount;
  const bookCanRate = userCanRate;

  const starWidget = body.querySelector('.star-rating');
  if (starWidget && userOwnsBook) {
    starWidget.dataset.userRating = currentMyRating ?? '';
    if (!bookCanRate) starWidget.title = 'Complete a run first to rate this book';

    const updateDisplay = (hoverVal) => {
      const displayVal = hoverVal !== null ? hoverVal : currentAvg;
      starWidget.querySelectorAll('.star').forEach(s => {
        const p = +s.dataset.pos;
        s.className = (displayVal !== null && displayVal >= p) ? 'star on'
                    : (displayVal !== null && displayVal >= p - 0.5) ? 'star half'
                    : 'star';
      });
      const lbl = starWidget.querySelector('.star-label');
      if (hoverVal !== null) {
        lbl.innerHTML = `<span class="star-avg">${hoverVal % 1 === 0 ? hoverVal.toFixed(1) : hoverVal}</span>`;
      } else {
        lbl.innerHTML = _hooks.starLabelHtml?.(currentAvg, currentCount) ?? '';
      }
    };

    starWidget.querySelectorAll('.star').forEach(star => {
      star.addEventListener('mousemove', e => {
        if (!bookCanRate) return;
        const left = e.offsetX < star.offsetWidth / 2;
        updateDisplay(+star.dataset.pos - (left ? 0.5 : 0));
      });
      star.addEventListener('click', async e => {
        if (!bookCanRate) { _hooks.flashRatingGate?.(starWidget, 'Complete a run first to rate'); return; }
        const left      = e.offsetX < star.offsetWidth / 2;
        const newRating = +star.dataset.pos - (left ? 0.5 : 0);
        const toSave    = newRating === currentMyRating ? null : newRating;
        const prevRating = currentMyRating;
        currentMyRating = toSave;
        starWidget.dataset.userRating = toSave ?? '';
        updateDisplay(null);
        try {
          const res = await apiFetch(`/api/books/${bookId}/rating`, {
            method: 'PATCH', body: JSON.stringify({ rating: toSave }),
          });
          if (res.ok) {
            const data = await res.json();
            currentAvg   = data.avgRating;
            currentCount = data.voteCount;
            updateDisplay(null);
            if (data.xpAwarded) refreshCoinsDisplay();
          } else {
            currentMyRating = prevRating;
            starWidget.dataset.userRating = prevRating ?? '';
            updateDisplay(null);
          }
        } catch {
          currentMyRating = prevRating;
          starWidget.dataset.userRating = prevRating ?? '';
          updateDisplay(null);
        }
      });
    });
    starWidget.addEventListener('mouseleave', () => updateDisplay(null));
  }

  body.querySelectorAll('.cover-act-username').forEach(btn => {
    btn.addEventListener('click', async () => {
      const username = btn.dataset.username;
      document.getElementById('pub-modal-title').innerHTML = escapeHtml(_hooks.displayFor?.(username) ?? username) + (_hooks.adminBadge?.(username) ?? '') + (_hooks.authorBadge?.(username) ?? '') + (_hooks.contributorBadge?.(username) ?? '');
      document.getElementById('pub-modal-body').innerHTML  = `<p class="pub-loading">${t('covers.loading')}</p>`;
      backBtn.style.display = '';
      backBtn.onclick = () => renderCoverActivity(bookId, bookName, entries, currentMyRating, { ...bookMeta, avgRating: currentAvg, voteCount: currentCount }, userLoggedIn, userOwnsBook, bookCanRate);
      try {
        const res = await publicFetch(`/api/public/user/${encodeURIComponent(username)}`);
        if (!res.ok) throw new Error();
        const profile = await res.json();
        renderPublicProfile(profile);
        backBtn.style.display = '';
        backBtn.onclick = () => renderCoverActivity(bookId, bookName, entries, currentMyRating, { ...bookMeta, avgRating: currentAvg, voteCount: currentCount }, userLoggedIn, userOwnsBook, bookCanRate);
      } catch {
        document.getElementById('pub-modal-body').innerHTML = `<p class="pub-error">${t('pub.profile_unavailable')}</p>`;
      }
    });
  });

  body.querySelectorAll('.pub-run-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openPublicRun(+btn.dataset.bookId, +btn.dataset.userId, +btn.dataset.runIndex, null);
      backBtn.style.display = '';
      backBtn.onclick = () => renderCoverActivity(bookId, bookName, entries, currentMyRating, { ...bookMeta, avgRating: currentAvg, voteCount: currentCount }, userLoggedIn, userOwnsBook, bookCanRate);
    });
  });

  body.querySelectorAll('.book-modal-parent-btn, .book-modal-child-btn, .book-modal-child-row').forEach(btn => {
    btn.addEventListener('click', () => {
      backBtn.style.display = '';
      backBtn.onclick = () => renderCoverActivity(bookId, bookName, entries, currentMyRating, { ...bookMeta, avgRating: currentAvg, voteCount: currentCount }, userLoggedIn, userOwnsBook, bookCanRate);
      openCoverActivity(+btn.dataset.bookId, btn.dataset.bookName);
    });
  });

  body.querySelectorAll('.book-modal-series-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = +btn.dataset.seriesId;
      if (!sid) return;
      backBtn.style.display = '';
      backBtn.onclick = () => renderCoverActivity(bookId, bookName, entries, currentMyRating, { ...bookMeta, avgRating: currentAvg, voteCount: currentCount }, userLoggedIn, userOwnsBook, bookCanRate);
      openSeriesActivity(sid, btn.dataset.seriesName);
    });
  });
}

// ── Cover settings ─────────────────────────────────────────────────────────────
function _applyCoverTooltipTitlePrefs() {
  document.body.classList.toggle('cover-tooltip-title-bold', !!_coverTooltipTitleBold);
  document.documentElement.style.setProperty('--cover-preview-title-size', `${(0.84 * _coverTooltipTitlePct / 100).toFixed(4)}rem`);
  const sizeVal = document.getElementById('cover-tooltip-size-value');
  const boldCb = document.getElementById('cover-tooltip-bold-cb');
  const cyrillicCb = document.getElementById('cover-tooltip-hide-cyrillic-cb');
  if (sizeVal) sizeVal.textContent = `${_coverTooltipTitlePercent()}%`;
  if (boldCb) boldCb.checked = !!_coverTooltipTitleBold;
  if (cyrillicCb) cyrillicCb.checked = !!_hideCyrillicCovers;
}

function _persistCoverTooltipPrefs() {
  localStorage.setItem('cover-tooltip-title-pct', String(_coverTooltipTitlePct));
  localStorage.setItem('cover-tooltip-title-bold', _coverTooltipTitleBold ? '1' : '0');
  localStorage.setItem('hide-cyrillic-covers', _hideCyrillicCovers ? '1' : '0');
  _applyCoverTooltipTitlePrefs();
  if (getToken() && !isDemoMode) {
    _hooks.savePrefs?.({
      coverTooltipTitlePct: String(_coverTooltipTitlePct),
      coverTooltipTitleBold: _coverTooltipTitleBold ? '1' : '0',
      hideCyrillicCovers: _hideCyrillicCovers ? '1' : '0',
    });
  }
}

function _applyReduceMotionPref() {
  document.body.classList.toggle('reduce-motion', !!_reduceMotion);
  const cb = document.getElementById('reduce-motion-cb');
  if (cb) cb.checked = !!_reduceMotion;
}

function _persistReduceMotionPref() {
  localStorage.setItem('reduce-motion', _reduceMotion ? '1' : '0');
  _applyReduceMotionPref();
  if (getToken() && !isDemoMode) {
    _hooks.savePrefs?.({ reduceMotion: _reduceMotion ? '1' : '0' });
  }
}

function _applyFeedDayCoversPref() {
  document.body.classList.toggle('no-feed-day-covers', !_feedDayCovers);
  const cb = document.getElementById('feed-day-covers-cb');
  if (cb) cb.checked = !!_feedDayCovers;
}

function _persistFeedDayCoversPref() {
  localStorage.setItem('feed-day-covers', _feedDayCovers ? '1' : '0');
  _applyFeedDayCoversPref();
  // Turning covers back on just removes the CSS class - it doesn't populate
  // the cover-stack divs, since _applyDayCoverFlows() skips loading images
  // entirely while the toggle is off (no point fetching covers just to hide
  // them). So flipping it back on needs an explicit refresh, or the stacks
  // stay empty shells until the next full feed reload.
  _hooks.refreshDayCovers?.();
  if (getToken() && !isDemoMode) {
    _hooks.savePrefs?.({ feedDayCovers: _feedDayCovers ? '1' : '0' });
  }
}

function _applyFeedGlassCardsPref() {
  document.body.classList.toggle('no-feed-glass-cards', !_feedGlassCards);
  const cb = document.getElementById('feed-glass-cards-cb');
  if (cb) cb.checked = !!_feedGlassCards;
}

function _persistFeedGlassCardsPref() {
  localStorage.setItem('feed-glass-cards', _feedGlassCards ? '1' : '0');
  _applyFeedGlassCardsPref();
  if (getToken() && !isDemoMode) {
    _hooks.savePrefs?.({ feedGlassCards: _feedGlassCards ? '1' : '0' });
  }
}

function _applyLandingBgHiddenPref() {
  ['a', 'b'].forEach(l => {
    const el = document.getElementById(`landing-bg-${l}`);
    if (el) el.style.opacity = _landingBgHidden ? '0' : '';
  });
  if (_landingBgHidden) {
    _stopLandingCoverRotation();
  } else if (_allCovers.length || _allBooks.length || _allSeriesCovers.length) {
    _startLandingCoverRotation({ reset: false, immediate: true });
  }
  const btn = document.getElementById('landing-ctx-toggle-btn');
  if (btn) btn.textContent = _landingBgHidden ? t('bg.show_background') : t('bg.hide_background');
}

function _persistLandingBgHiddenPref() {
  _applyLandingBgHiddenPref();
  if (getToken() && !isDemoMode) _hooks.savePrefs?.({ landingBgHidden: _landingBgHidden ? '1' : '0' });
}

function _applyLandingCoverSourcePrefs() {
  localStorage.setItem('landing-cover-source', _landingCoverSource);
  const publicRadio = document.getElementById('cover-rotation-source-public');
  const mineRadio = document.getElementById('cover-rotation-source-mine');
  const preview = document.getElementById('cover-rotation-settings-preview');
  const effective = _effectiveLandingCoverSource();
  if (publicRadio) publicRadio.checked = _landingCoverSource === 'public';
  if (mineRadio) {
    mineRadio.checked = _landingCoverSource === 'mine';
    mineRadio.disabled = !getToken() || isDemoMode;
  }
  if (preview) preview.textContent = effective === 'mine' ? t('covers.my_books_covers') : t('covers.all_public_covers');
}

function _persistLandingCoverSourcePref() {
  _applyLandingCoverSourcePrefs();
  if (getToken() && !isDemoMode) _hooks.savePrefs?.({ landingCoverSource: _landingCoverSource });
  _startLandingCoverRotation({ reset: true, immediate: true });
}

export function _toggleCoverTooltipSettings(open) {
  const overlay = document.getElementById('cover-tooltip-settings-overlay');
  if (!overlay) return;
  const shouldOpen = open ?? !overlay.classList.contains('active');
  if (shouldOpen) {
    _applyLandingCoverSourcePrefs();
  }
  overlay.classList.toggle('active', shouldOpen);
}

// Logged-out visitors have no UI to control the feed's cover/glass toggles -
// covers should always show for them, regardless of what a previously
// logged-in session on this browser had turned off. setCoversPrefsState({})
// (called on logout) can't clear these itself since it only touches a key
// when it's present in the object, so this exists specifically to force the
// true logged-out default instead of silently carrying over whatever the
// last logged-in user had set.
export function resetFeedDisplayPrefsForLogout() {
  _feedDayCovers = true;
  _feedGlassCards = true;
  localStorage.setItem('feed-day-covers', '1');
  localStorage.setItem('feed-glass-cards', '1');
  _applyFeedDayCoversPref();
  _applyFeedGlassCardsPref();
  _hooks.refreshDayCovers?.();
}

// ── Prefs state setter (called from applyPrefs in main.js) ────────────────────
export function setCoversPrefsState(p) {
  _setCoverFavoritesFromPrefs(p);
  if (p.landingCoverPos && typeof p.landingCoverPos === 'object' && !Array.isArray(p.landingCoverPos)) {
    _landingCoverPosPrefs = p.landingCoverPos;
  }
  if ('coverTooltipTitlePct' in p) {
    _coverTooltipTitlePct = Math.max(100, Math.min(148, parseInt(p.coverTooltipTitlePct || '100', 10) || 100));
    localStorage.setItem('cover-tooltip-title-pct', String(_coverTooltipTitlePct));
  }
  if ('coverTooltipTitleBold' in p) {
    _coverTooltipTitleBold = p.coverTooltipTitleBold === '1';
    localStorage.setItem('cover-tooltip-title-bold', _coverTooltipTitleBold ? '1' : '0');
  }
  if ('hideCyrillicCovers' in p) {
    _hideCyrillicCovers = p.hideCyrillicCovers === '1';
    localStorage.setItem('hide-cyrillic-covers', _hideCyrillicCovers ? '1' : '0');
  }
  if ('landingCoverSource' in p) {
    _landingCoverSource = p.landingCoverSource === 'mine' ? 'mine' : 'public';
    localStorage.setItem('landing-cover-source', _landingCoverSource);
  }
  if ('reduceMotion' in p) {
    _reduceMotion = p.reduceMotion === '1';
    localStorage.setItem('reduce-motion', _reduceMotion ? '1' : '0');
    _applyReduceMotionPref();
  }
  if ('feedDayCovers' in p) {
    _feedDayCovers = p.feedDayCovers !== '0';
    localStorage.setItem('feed-day-covers', _feedDayCovers ? '1' : '0');
    _applyFeedDayCoversPref();
  }
  if ('feedGlassCards' in p) {
    _feedGlassCards = p.feedGlassCards !== '0';
    localStorage.setItem('feed-glass-cards', _feedGlassCards ? '1' : '0');
    _applyFeedGlassCardsPref();
  }
  _landingBgHidden = p.landingBgHidden === '1';
  _applyLandingBgHiddenPref();
  _applyCoverTooltipTitlePrefs();
  _applyLandingCoverSourcePrefs();
}

// ── DOM event wiring (called once from DOMContentLoaded) ──────────────────────
export function initCoversPanel() {
  // Initial pref application
  _applyCoverTooltipTitlePrefs();
  _applyLandingCoverSourcePrefs();
  _applyReduceMotionPref();
  _applyFeedDayCoversPref();
  _applyFeedGlassCardsPref();
  _applyLandingBgHiddenPref();

  // Cover tooltip size/bold/cyrillic
  document.getElementById('cover-tooltip-size-dec')?.addEventListener('click', () => {
    _coverTooltipTitlePct = Math.max(100, _coverTooltipTitlePercent() - 1);
    _persistCoverTooltipPrefs();
  });
  document.getElementById('cover-tooltip-size-inc')?.addEventListener('click', () => {
    _coverTooltipTitlePct = Math.min(148, _coverTooltipTitlePercent() + 1);
    _persistCoverTooltipPrefs();
  });
  document.getElementById('cover-tooltip-bold-cb')?.addEventListener('change', e => {
    _coverTooltipTitleBold = !!e.target.checked;
    _persistCoverTooltipPrefs();
  });
  document.getElementById('cover-tooltip-hide-cyrillic-cb')?.addEventListener('change', e => {
    _hideCyrillicCovers = !!e.target.checked;
    _persistCoverTooltipPrefs();
    _refreshCoversDisplay();
  });
  document.getElementById('reduce-motion-cb')?.addEventListener('change', e => {
    _reduceMotion = !!e.target.checked;
    _persistReduceMotionPref();
  });
  document.getElementById('feed-day-covers-cb')?.addEventListener('change', e => {
    _feedDayCovers = !!e.target.checked;
    _persistFeedDayCoversPref();
  });
  document.getElementById('feed-glass-cards-cb')?.addEventListener('change', e => {
    _feedGlassCards = !!e.target.checked;
    _persistFeedGlassCardsPref();
  });

  // Covers overlays (own mousedown tracker to avoid sharing main.js _mousedownOnOverlay)
  let _overlayMousedownTarget = null;
  document.getElementById('cover-tooltip-settings-overlay')?.addEventListener('mousedown', e => { _overlayMousedownTarget = e.target === e.currentTarget ? e.target : null; });
  document.getElementById('cover-tooltip-settings-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget && _overlayMousedownTarget === e.target) _toggleCoverTooltipSettings(false);
  });
  document.getElementById('cover-tooltip-settings-close')?.addEventListener('click', () => _toggleCoverTooltipSettings(false));

  // Cover rotation source radio
  document.querySelectorAll('input[name="cover-rotation-source"]').forEach(radio => {
    radio.addEventListener('change', e => {
      _landingCoverSource = e.target.value === 'mine' ? 'mine' : 'public';
      _persistLandingCoverSourcePref();
    });
  });

  // Landing bg context menu
  const _landingCtxMenu = document.getElementById('landing-ctx-menu');
  function _showLandingCtxMenu(x, y) {
    if (!_landingCtxMenu) return;
    document.getElementById('landing-ctx-toggle-btn').textContent = _landingBgHidden ? t('bg.show_background') : t('bg.hide_background');
    _landingCtxMenu.style.display = 'block';
    const mw = _landingCtxMenu.offsetWidth, mh = _landingCtxMenu.offsetHeight;
    _landingCtxMenu.style.left = `${Math.min(x, window.innerWidth  - mw - 8)}px`;
    _landingCtxMenu.style.top  = `${Math.min(y, window.innerHeight - mh - 8)}px`;
  }
  function _hideLandingCtxMenu() { if (_landingCtxMenu) _landingCtxMenu.style.display = 'none'; }
  document.getElementById('landing-wrapper')?.addEventListener('contextmenu', e => {
    if (!getToken() || isDemoMode) return;
    if (e.target.closest('button, a, input, textarea, select, label, .cover-thumb, .feed-entry, .feed-user-group, .feed-pinned-card, .feed-day-card, #app-banner, #covers-panel, #feed-panel, #books-xp-summary, .books-container')) return;
    e.preventDefault();
    _showLandingCtxMenu(e.clientX, e.clientY);
  });
  document.getElementById('landing-ctx-toggle-btn')?.addEventListener('click', () => {
    _landingBgHidden = !_landingBgHidden;
    _persistLandingBgHiddenPref();
    _hideLandingCtxMenu();
  });
  document.addEventListener('click', e => {
    if (_landingCtxMenu && !_landingCtxMenu.contains(e.target)) _hideLandingCtxMenu();
  });

  // Landing bg drag handlers
  const _landingWrapper = document.getElementById('landing-wrapper');
  _landingWrapper?.addEventListener('mousedown', e => {
    if (!_canDragLandingBg()) return;
    if (e.target.closest('button, a, input, textarea, select, label, .cover-thumb, .feed-entry, .feed-user-group, .feed-pinned-card, .feed-day-card, #app-banner')) return;
    _landingBgDragging = true;
    _landingBgDragDirty = false;
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!_landingBgDragging || !_canDragLandingBg()) return;
    _landingBgPosY = Math.max(0, Math.min(100, _landingBgPosY - e.movementY * 0.12));
    _landingBgDragDirty = true;
    _applyLandingBgPosition();
  });
  window.addEventListener('mouseup', () => {
    if (_landingBgDragging && _landingBgDragDirty) _persistLandingCoverPos();
    _landingBgDragging = false;
    _landingBgDragDirty = false;
  });
  _updateLandingBgDragUi();

  // Covers panel click (favorites + thumb navigation)
  document.getElementById('covers-panel').addEventListener('click', e => {
    const favBtn = e.target.closest('.cover-fav-btn');
    if (favBtn) {
      e.stopPropagation();
      if (!getToken() || isDemoMode) return;
      const id = Number(favBtn.dataset.favId);
      let isFavorite = false;
      if (favBtn.dataset.favType === 'series') {
        if (_favoriteSeriesIds.has(id)) _favoriteSeriesIds.delete(id);
        else _favoriteSeriesIds.add(id);
        isFavorite = _favoriteSeriesIds.has(id);
      } else {
        if (_favoriteBookIds.has(id)) _favoriteBookIds.delete(id);
        else _favoriteBookIds.add(id);
        isFavorite = _favoriteBookIds.has(id);
      }
      _hooks.savePrefs?.({
        favoriteBookIds: [..._favoriteBookIds].sort((a, b) => a - b),
        favoriteSeriesIds: [..._favoriteSeriesIds].sort((a, b) => a - b),
      });
      _hooks.onFavoriteToggled?.();
      const coversPanel = document.getElementById('covers-panel');
      const coversSearchEl = document.getElementById('covers-search');
      const favoritesMode = _effectiveCoversKindMode() === 'favorites';
      const searching = coversPanel?.classList.contains('covers-searching') && coversSearchEl?.value.trim();
      if (searching) {
        coversSearchEl.dispatchEvent(new Event('input'));
      } else if (favoritesMode) {
        if (isFavorite) {
          _syncCoverFavoriteButton(favBtn, true);
        } else {
          _removeFavoriteThumbInPlace(favBtn);
        }
      } else {
        _syncCoverFavoriteButton(favBtn, isFavorite);
      }
      return;
    }
    const thumb = e.target.closest('.cover-thumb');
    if (!thumb) return;
    if (thumb.dataset.seriesId) {
      openSeriesActivity(+thumb.dataset.seriesId, thumb.dataset.seriesName || '');
      return;
    }
    openCoverActivity(+thumb.dataset.bookId, thumb.dataset.bookName);
  });

  // Cover hover preview
  const _coverPopup      = document.getElementById('cover-preview-popup');
  const _coverPopupImg   = document.getElementById('cover-preview-popup-img');
  const _coverPopupSeries = document.getElementById('cover-preview-popup-series');
  const _coverPopupTitle = document.getElementById('cover-preview-popup-title');
  const _hideCoverPopup = () => {
    _coverPopup.classList.remove('visible', 'series-preview');
    if (_coverPopupSeries) _coverPopupSeries.innerHTML = '';
  };
  document.getElementById('covers-panel').addEventListener('mouseover', e => {
    const thumb = e.target.closest('.cover-thumb');
    if (!thumb) { _hideCoverPopup(); return; }
    if (thumb.dataset.seriesId) {
      const raw = thumb.dataset.seriesCoverSources;
      const bookCount = Number(thumb.dataset.seriesBookCount) || 0;
      let sources = [];
      try { sources = raw ? JSON.parse(raw) : []; } catch (_) {}
      if (!sources.length) { _hideCoverPopup(); return; }
      const title = thumb.dataset.seriesName || '';
      const useSingleSeriesCover = sources.length < 4;
      _coverPopup.classList.add('series-preview');
      _coverPopupSeries.innerHTML =
        (useSingleSeriesCover
          ? `<div class="cover-series-grid cover-series-grid--single">` +
              `<div class="cover-series-cell"><img src="${escapeHtml(sources[0])}" alt=""></div>` +
            `</div>`
          : `<div class="cover-series-grid">` +
              sources.map(src => `<div class="cover-series-cell"><img src="${escapeHtml(src)}" alt=""></div>`).join('') +
              Array.from({ length: Math.max(0, 4 - sources.length) }, () => `<div class="cover-series-cell"></div>`).join('') +
            `</div>`);
      _coverPopupTitle.textContent = title;
      _coverPopup.classList.add('visible');
      const rect = thumb.getBoundingClientRect();
      const top  = Math.min(rect.top, window.innerHeight - _coverPopup.offsetHeight - 8);
      _coverPopup.style.left = (rect.right + 8) + 'px';
      _coverPopup.style.top  = Math.max(8, top) + 'px';
      return;
    }
    _coverPopup.classList.remove('series-preview');
    const coverUrl = thumb.dataset.coverUrl;
    const img = thumb.querySelector('img');
    if (!coverUrl || !img || img.style.opacity !== '1') { _hideCoverPopup(); return; }
    _coverPopupImg.src = coverUrl;
    _coverPopupTitle.textContent = thumb.dataset.bookName || thumb.dataset.seriesName || '';
    _coverPopup.classList.add('visible');
    const rect = thumb.getBoundingClientRect();
    const top  = Math.min(rect.top, window.innerHeight - _coverPopup.offsetHeight - 8);
    _coverPopup.style.left = (rect.right + 8) + 'px';
    _coverPopup.style.top  = Math.max(8, top) + 'px';
  });
  document.getElementById('covers-panel').addEventListener('mouseout', e => {
    const fromThumb = e.target.closest('.cover-thumb');
    if (!fromThumb) return;
    const toThumb = e.relatedTarget?.closest?.('.cover-thumb');
    if (toThumb !== fromThumb) _hideCoverPopup();
  });
  document.getElementById('covers-panel').addEventListener('mouseleave', _hideCoverPopup);

  // Covers search
  const coversPanel2    = document.getElementById('covers-panel');
  const coversHeader    = document.getElementById('covers-header');
  const coversSearchEl  = document.getElementById('covers-search');
  const coversClearBtn  = document.getElementById('covers-search-clear');
  const coversSearchIcon = document.getElementById('covers-search-icon');

  function _closeCoversSearch() {
    coversSearchEl.value = '';
    coversClearBtn.style.display = 'none';
    coversPanel2.classList.remove('covers-searching');
    coversHeader.classList.remove('covers-search-open');
    _refreshCoversDisplay();
  }

  function _clearCoversSearch() {
    coversSearchEl.value = '';
    coversClearBtn.style.display = coversHeader.classList.contains('covers-search-open') ? 'block' : 'none';
    coversPanel2.classList.remove('covers-searching');
    _refreshCoversDisplay();
  }

  coversSearchIcon.addEventListener('click', () => {
    coversHeader.classList.add('covers-search-open');
    coversClearBtn.style.display = 'block';
    coversSearchEl.focus();
  });

  coversSearchEl.addEventListener('input', e => {
    const q = foldForSearch(e.target.value.trim());
    if (!q) { _clearCoversSearch(); return; }
    coversClearBtn.style.display = 'block';
    const isAnthologySearch = q === 'anthology' || q === 'anthologies';
    const isSeriesSearch = q === 'series';
    const results = _visibleCoverItems()
      .filter(b => {
        if (isAnthologySearch) return b.isContainer;
        if (isSeriesSearch) return b.isSeries;
        return matchesSearch(b.name, q) ||
          (b.childNames || []).some(n => matchesSearch(n, q)) ||
          matchesSearch(b.authors || '', q) ||
          matchesSearch(b.seriesName || '', q);
      })
      .sort((a, b) => naturalCompare(a.name, b.name));
    coversPanel2.classList.add('covers-searching');
    _startLazy(results);
  });

  coversSearchEl.addEventListener('keydown', e => {
    if (e.key === 'Escape') _closeCoversSearch();
  });

  coversClearBtn.addEventListener('click', () => {
    _closeCoversSearch();
  });

  // Sort and kind dropdowns
  const coversSortEl    = document.getElementById('covers-sort');
  const coversSortLbl   = document.getElementById('covers-sort-label');
  const coversSortMenu  = document.getElementById('covers-sort-menu');
  const coversKindEl    = document.getElementById('covers-kind');
  const coversKindLbl   = document.getElementById('covers-kind-label');
  const coversKindMenu  = document.getElementById('covers-kind-menu');
  const _sortLabels = { alpha: 'A–Z', za: 'Z–A', latest: 'Latest', oldest: 'Oldest', random: 'Random', popular: 'Popular', longest: 'Longest', shortest: 'Shortest' };
  const _kindLabels = { all: 'All', books: 'Books', anthologies: 'Anthologies', series: 'Series', favorites: 'Favorites' };

  function _syncCoversKindUi() {
    const effective = _effectiveCoversKindMode();
    coversKindLbl.textContent = _kindLabels[effective] || effective;
    coversKindMenu.querySelectorAll('li').forEach(li => li.classList.toggle('active', li.dataset.value === effective));
    const favLi = coversKindMenu.querySelector('li[data-value="favorites"]');
    if (favLi) favLi.style.display = (getToken() && !isDemoMode) ? '' : 'none';
  }

  function _closeCoversMenus() {
    coversSortEl.classList.remove('open');
    coversKindEl.classList.remove('open');
  }

  function _applyCoversSortMode(val) {
    _coversSortMode = val;
    coversSortLbl.textContent = _sortLabels[val] || val;
    coversSortMenu.querySelectorAll('li').forEach(li => li.classList.toggle('active', li.dataset.value === val));
    localStorage.setItem('covers-sort', val);
    if (!coversPanel2.classList.contains('covers-searching')) _refreshCoversDisplay();
  }

  function _applyCoversKindMode(val) {
    _coversKindMode = val;
    localStorage.setItem('covers-kind', val);
    _syncCoversKindUi();
    if (!coversPanel2.classList.contains('covers-searching')) {
      _refreshCoversDisplay();
    } else if (coversSearchEl.value.trim()) {
      coversSearchEl.dispatchEvent(new Event('input'));
    }
  }

  _applyCoversSortMode(_coversSortMode);
  _applyCoversKindMode(_coversKindMode);

  coversSortEl.addEventListener('click', e => {
    e.stopPropagation();
    coversKindEl.classList.remove('open');
    coversSortEl.classList.toggle('open');
  });
  coversSortEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      coversKindEl.classList.remove('open');
      coversSortEl.classList.toggle('open');
    }
    if (e.key === 'Escape') coversSortEl.classList.remove('open');
  });
  coversSortMenu.addEventListener('click', e => {
    const li = e.target.closest('li[data-value]');
    if (!li) return;
    e.stopPropagation();
    _closeCoversMenus();
    coversSortEl.blur();
    _applyCoversSortMode(li.dataset.value);
  });
  coversKindEl.addEventListener('click', e => {
    e.stopPropagation();
    coversSortEl.classList.remove('open');
    coversKindEl.classList.toggle('open');
  });
  coversKindEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      coversSortEl.classList.remove('open');
      coversKindEl.classList.toggle('open');
    }
    if (e.key === 'Escape') coversKindEl.classList.remove('open');
  });
  coversKindMenu.addEventListener('click', e => {
    const li = e.target.closest('li[data-value]');
    if (!li) return;
    e.stopPropagation();
    _closeCoversMenus();
    coversKindEl.blur();
    _applyCoversKindMode(li.dataset.value);
  });
  document.addEventListener('click', _closeCoversMenus);
}
