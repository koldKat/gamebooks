// autocomplete.js - Book/author/series autocomplete dropdowns and data loading

import { apiFetch } from './state.js?v=11';
import { getCachedBooks } from './books.js?v=110';
import { naturalCompare, naturalCompareByName, matchesSearch } from './sort.js?v=1';
import { escapeHtml, fetchPublic as _fetchPublic } from './util.js?v=35';
import { t } from './i18n.js?v=28';

function _sortedByName(items) { return [...items].sort(naturalCompareByName); }

// ── Cache state ───────────────────────────────────────────────────────────────

let _allPublicBooks        = null;
let _allAuthorNames        = null;
let _allSeriesAutocomplete = null;

export function invalidateAutocompleteCaches() {
  _allPublicBooks = null;
  _allAuthorNames = null;
  _allSeriesAutocomplete = null;
}

// ── Data loaders ──────────────────────────────────────────────────────────────

async function _loadPublicBooks() {
  if (_allPublicBooks) return _allPublicBooks;
  try { const r = await _fetchPublic('/api/public/books'); _allPublicBooks = r.ok ? await r.json() : []; }
  catch (_) { _allPublicBooks = []; }
  return _allPublicBooks;
}

export async function _loadAutocompleteBooks() {
  const publicBooks = await _loadPublicBooks();
  const byId = new Map();
  publicBooks.forEach(b => byId.set(b.id, b));
  (getCachedBooks() || []).forEach(b => {
    byId.set(b.id, {
      id: b.id,
      name: b.name,
      authors: b.authors || null,
      description: b.description || null,
      totalSections: b.total_sections || 0,
      pages: b.pages || null,
      isbn: b.isbn || null,
      issn: b.issn || null,
      asin: b.asin || null,
      coverUrl: b.cover_path ? `/covers/${b.cover_path}` : null,
      isContainer: !!b.is_container,
      seriesId: b.series_id || null,
      seriesName: b.series_name || null,
      seriesNumber: b.series_number || null,
    });
  });
  return [...byId.values()];
}

async function _loadAuthorNames() {
  if (_allAuthorNames) return _allAuthorNames;
  const books = await _loadAutocompleteBooks();
  const names = new Set();
  const collect = authors => {
    String(authors || '').split(',').map(s => s.trim()).filter(Boolean).forEach(name => names.add(name));
  };
  books.forEach(b => collect(b.authors));
  _allAuthorNames = [...names].sort((a, b) => naturalCompare(a, b));
  return _allAuthorNames;
}

export async function _loadSeriesAutocomplete() {
  if (_allSeriesAutocomplete) return _allSeriesAutocomplete;
  try {
    const r = await apiFetch('/api/series/autocomplete');
    _allSeriesAutocomplete = r.ok ? await r.json() : [];
  } catch (_) {
    _allSeriesAutocomplete = [];
  }
  return _allSeriesAutocomplete;
}

// ── Cover helper ──────────────────────────────────────────────────────────────

export function _setModalCover(imgId, placeholderId, coverUrl) {
  const img = document.getElementById(imgId);
  const ph  = document.getElementById(placeholderId);
  if (coverUrl) {
    img.src = coverUrl; img.style.display = 'block'; ph.style.display = 'none';
  } else {
    img.src = ''; img.style.display = 'none'; ph.style.display = 'block';
  }
}

// ── Autocomplete widgets ──────────────────────────────────────────────────────

export function _setupNameAutocomplete(inputId, dropdownId, saveBtnId, filterFn, onSelect) {
  const input    = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const saveBtn  = document.getElementById(saveBtnId);
  let _selectedId    = null;
  let _selectedOwned = false;
  let _activeIdx     = -1;
  let _matches       = [];

  function _setSelected(book) {
    _selectedId    = book ? book.id : null;
    _selectedOwned = !!(book && (getCachedBooks() || []).some(cb => cb.id === book.id));
    saveBtn.textContent = book ? (_selectedOwned ? t('autocomplete.already_owned') : t('autocomplete.add_to_library')) : t('autocomplete.create');
    saveBtn.disabled = !!_selectedOwned;
    if (book) onSelect(book);
  }

  function _renderDropdown(q) {
    if (!q || !_allPublicBooks) { dropdown.classList.remove('open'); return; }
    const _owned = getCachedBooks() || [];
    const _eligible = _allPublicBooks.filter(b => filterFn(b));
    const _nameMatches = _eligible.filter(b => matchesSearch(b.name, q));
    _matches = _sortedByName(_nameMatches);
    if (!_matches.length) { dropdown.classList.remove('open'); return; }
    dropdown.innerHTML = _matches.map((b, i) =>
      `<li data-idx="${i}" data-id="${b.id}">` +
        escapeHtml(b.name) +
        (_owned.some(cb => cb.id === b.id) ? `<span class="ac-sub ac-owned">${t('autocomplete.owned')}</span>` : '') +
        (b.authors ? `<span class="ac-sub">${escapeHtml(b.authors)}</span>` : '') +
      `</li>`
    ).join('');
    _activeIdx = -1;
    dropdown.classList.add('open');
  }

  dropdown.addEventListener('mousedown', e => {
    const li = e.target.closest('li');
    if (!li) return;
    const book = _matches[+li.dataset.idx];
    input.value = book.name;
    dropdown.classList.remove('open');
    _setSelected(book);
    e.preventDefault();
  });

  input.addEventListener('input', async () => {
    _setSelected(null);
    if (!_allPublicBooks) _allPublicBooks = await _loadAutocompleteBooks();
    _renderDropdown(input.value.trim());
  });
  input.addEventListener('blur', () => setTimeout(() => dropdown.classList.remove('open'), 150));
  input.addEventListener('keydown', e => {
    const items = dropdown.querySelectorAll('li');
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); _activeIdx = Math.min(_activeIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); _activeIdx = Math.max(_activeIdx - 1, 0); }
    else if (e.key === 'Enter' && _activeIdx >= 0) {
      e.preventDefault();
      const book = _matches[_activeIdx];
      input.value = book.name;
      dropdown.classList.remove('open');
      _setSelected(book);
      return;
    } else if (e.key === 'Escape') { dropdown.classList.remove('open'); return; }
    else return;
    items.forEach((li, i) => li.classList.toggle('ac-active', i === _activeIdx));
    items[_activeIdx]?.scrollIntoView({ block: 'nearest' });
  });

  return {
    reset() {
      _selectedId    = null;
      _selectedOwned = false;
      dropdown.classList.remove('open');
      saveBtn.textContent = t('autocomplete.create');
      saveBtn.disabled    = false;
    },
    getSelectedId()    { return _selectedId; },
    isSelectedOwned()  { return _selectedOwned; },
  };
}

export function _setupPlainAutocomplete(inputId, dropdownId, loadItems, filterFn, renderMeta) {
  const input    = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  let _matches   = [];
  let _activeIdx = -1;

  function _close() {
    dropdown.classList.remove('open');
    _activeIdx = -1;
  }

  function _render(items, q) {
    if (!q) { _close(); return; }
    _matches = items.filter(item => filterFn(item, q));
    if (!_matches.length) { _close(); return; }
    dropdown.innerHTML = _matches.map((item, i) =>
      `<li data-idx="${i}">` +
        escapeHtml(item.name || '') +
        (renderMeta ? renderMeta(item) : '') +
      `</li>`
    ).join('');
    dropdown.classList.add('open');
  }

  dropdown.addEventListener('mousedown', e => {
    const li = e.target.closest('li');
    if (!li) return;
    const item = _matches[+li.dataset.idx];
    if (!item) return;
    input.value = item.name || '';
    _close();
    e.preventDefault();
  });

  input.addEventListener('input', async () => {
    const items = await loadItems();
    _render(items, input.value.trim());
  });
  input.addEventListener('blur', () => setTimeout(_close, 150));
  input.addEventListener('keydown', e => {
    const items = dropdown.querySelectorAll('li');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _activeIdx = Math.min(_activeIdx + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _activeIdx = Math.max(_activeIdx - 1, 0);
    } else if (e.key === 'Enter' && _activeIdx >= 0) {
      e.preventDefault();
      const item = _matches[_activeIdx];
      if (!item) return;
      input.value = item.name || '';
      _close();
      return;
    } else if (e.key === 'Escape') {
      _close();
      return;
    } else {
      return;
    }
    items.forEach((li, i) => li.classList.toggle('ac-active', i === _activeIdx));
    items[_activeIdx]?.scrollIntoView({ block: 'nearest' });
  });

  return { close: _close };
}

export function _setupAuthorsAutocomplete(inputId, dropdownId) {
  const input    = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  let _matches   = [];
  let _activeIdx = -1;

  function _close() {
    dropdown.classList.remove('open');
    _activeIdx = -1;
  }

  function _currentTokenBounds() {
    const raw   = input.value || '';
    const caret = input.selectionStart ?? raw.length;
    const before = raw.slice(0, caret);
    const lastComma = before.lastIndexOf(',');
    const start = lastComma >= 0 ? lastComma + 1 : 0;
    // Forward boundary (next comma, or end of string) - the current token's real end,
    // regardless of where the caret sits within it (clicking mid-token is supported,
    // see the 'click' listener below).
    const nextCommaRel = raw.slice(caret).indexOf(',');
    const end = nextCommaRel >= 0 ? caret + nextCommaRel : raw.length;
    const token = raw.slice(start, caret).trim();
    return { raw, caret, start, end, token };
  }

  function _applyAuthor(author) {
    const { raw, start, end } = _currentTokenBounds();
    const prefix = raw.slice(0, start).replace(/\s*$/, '');
    const suffix = raw.slice(end);
    const next   = `${prefix}${prefix ? ' ' : ''}${author}${suffix}`;
    input.value  = next;
    const newCaret = `${prefix}${prefix ? ' ' : ''}${author}`.length;
    input.setSelectionRange(newCaret, newCaret);
    _close();
  }

  async function _render() {
    const { token } = _currentTokenBounds();
    if (!token) { _close(); return; }
    const authors = await _loadAuthorNames();
    const used = new Set(
      (input.value || '').split(',').map(s => s.trim()).filter(Boolean)
    );
    _matches = authors.filter(name => matchesSearch(name, token) && !used.has(name));
    if (!_matches.length) { _close(); return; }
    dropdown.innerHTML = _matches.map((name, i) => `<li data-idx="${i}">${escapeHtml(name)}</li>`).join('');
    _activeIdx = -1;
    dropdown.classList.add('open');
  }

  dropdown.addEventListener('mousedown', e => {
    const li = e.target.closest('li');
    if (!li) return;
    const author = _matches[+li.dataset.idx];
    if (!author) return;
    _applyAuthor(author);
    e.preventDefault();
  });

  input.addEventListener('input', _render);
  input.addEventListener('click', _render);
  input.addEventListener('blur', () => setTimeout(_close, 150));
  input.addEventListener('keydown', e => {
    const items = dropdown.querySelectorAll('li');
    if (!items.length) {
      if (e.key === 'Escape') _close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _activeIdx = Math.min(_activeIdx + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _activeIdx = Math.max(_activeIdx - 1, 0);
    } else if (e.key === 'Enter' && _activeIdx >= 0) {
      e.preventDefault();
      const author = _matches[_activeIdx];
      if (!author) return;
      _applyAuthor(author);
      return;
    } else if (e.key === 'Escape') {
      _close();
      return;
    } else {
      return;
    }
    items.forEach((li, i) => li.classList.toggle('ac-active', i === _activeIdx));
    items[_activeIdx]?.scrollIntoView({ block: 'nearest' });
  });

  return { close: _close };
}
