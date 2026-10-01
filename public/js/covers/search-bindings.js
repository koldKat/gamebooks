import { _effectiveCoversKindMode, _visibleCoverItems } from './filters.js';
import { _startLazy, _refreshCoversDisplay } from './grid.js';
import { coversState } from './state.js';
import { getToken, isDemoMode } from '../state.js';
import { foldForSearch, matchesSearch, naturalCompare } from '../sort.js';

export function _initCoverSearch() {
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
    coversState._coversSortMode = val;
    coversSortLbl.textContent = _sortLabels[val] || val;
    coversSortMenu.querySelectorAll('li').forEach(li => li.classList.toggle('active', li.dataset.value === val));
    localStorage.setItem('covers-sort', val);
    if (!coversPanel2.classList.contains('covers-searching')) _refreshCoversDisplay();
  }

  function _applyCoversKindMode(val) {
    coversState._coversKindMode = val;
    localStorage.setItem('covers-kind', val);
    _syncCoversKindUi();
    if (!coversPanel2.classList.contains('covers-searching')) {
      _refreshCoversDisplay();
    } else if (coversSearchEl.value.trim()) {
      coversSearchEl.dispatchEvent(new Event('input'));
    }
  }

  _applyCoversSortMode(coversState._coversSortMode);
  _applyCoversKindMode(coversState._coversKindMode);

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

  function _wireCoversFilterChip(elId, storageKey, get, set) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.setAttribute('aria-pressed', get() ? 'true' : 'false');
    el.addEventListener('click', () => {
      const next = el.getAttribute('aria-pressed') !== 'true';
      el.setAttribute('aria-pressed', next ? 'true' : 'false');
      set(next);
      localStorage.setItem(storageKey, next ? '1' : '0');
      if (!coversPanel2.classList.contains('covers-searching')) {
        _refreshCoversDisplay();
      } else if (coversSearchEl.value.trim()) {
        coversSearchEl.dispatchEvent(new Event('input'));
      }
    });
  }
  _wireCoversFilterChip('covers-filter-battlesim', 'covers-battlesim-only',
    () => coversState._coversBattleSimOnly, v => { coversState._coversBattleSimOnly = v; });
  _wireCoversFilterChip('covers-filter-livereading', 'covers-livereading-only',
    () => coversState._coversLiveReadingOnly, v => { coversState._coversLiveReadingOnly = v; });
  _wireCoversFilterChip('covers-filter-openworld', 'covers-openworld-only',
    () => coversState._coversOpenWorldOnly, v => { coversState._coversOpenWorldOnly = v; });
  _wireCoversFilterChip('covers-filter-notmine', 'covers-notmine-only',
    () => coversState._coversNotMineOnly, v => { coversState._coversNotMineOnly = v; });
  // Only makes sense with a logged-in library to compare against - same
  // gating as the Favorites kind-mode option elsewhere in this function.
  const notMineEl = document.getElementById('covers-filter-notmine');
  if (notMineEl) notMineEl.style.display = (getToken() && !isDemoMode) ? '' : 'none';
}
