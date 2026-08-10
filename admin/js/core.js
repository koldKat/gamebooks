// Shared formatting/DOM-building helpers, plus the generic sortable/searchable/
// paginated-table system every admin tab (Users, Books, Series, Anthologies,
// Inventory) is built on. No tab-specific logic lives here.
// To remove: this is the foundation every other admin/js/*.js module imports
// from - removing it means rewriting all of them.

// ── Confirm dialog ────────────────────────────────────────────────────────────
// Wired here (not left to boot.js) since almost every tab module calls
// showAlert/showConfirm - the #confirm-overlay markup itself lives in
// admin/index.html and is assumed present the moment this module loads.

let _confirmCb = null;

export function showAlert(message) {
  showConfirm(message, () => {}, { label: 'OK', variant: '' });
  document.getElementById('confirm-cancel').style.display = 'none';
  const restore = () => { document.getElementById('confirm-cancel').style.display = ''; };
  document.getElementById('confirm-ok').addEventListener('click', restore, { once: true });
  document.getElementById('confirm-cancel').addEventListener('click', restore, { once: true });
}

export function showConfirm(message, onOk, { label = 'Confirm', variant = 'danger' } = {}) {
  document.getElementById('confirm-message').textContent = message;
  const ok = document.getElementById('confirm-ok');
  ok.className = variant;
  ok.textContent = label;
  _confirmCb = onOk;
  document.getElementById('confirm-overlay').classList.add('active');
}

document.getElementById('confirm-ok').addEventListener('click', () => {
  document.getElementById('confirm-overlay').classList.remove('active');
  if (_confirmCb) { _confirmCb(); _confirmCb = null; }
});
document.getElementById('confirm-cancel').addEventListener('click', () => {
  document.getElementById('confirm-overlay').classList.remove('active');
  _confirmCb = null;
});

export async function api(method, path, body) {
  const opts = { method };
  if (body !== undefined) {
    opts.body    = JSON.stringify(body);
    opts.headers = { 'Content-Type': 'application/json' };
  }
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json();
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function fmtBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  const dp = Math.max(0, i - 1);
  return `${dp === 0 ? Math.round(n) : n.toFixed(dp)} ${units[i]}`;
}

export function fmtDuration(s) {
  if (!s || s < 1) return '0s';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function fmtDate(ts) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function fmtDateTime(ms) {
  if (!ms) return '-';
  const d = new Date(ms);
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const HH   = String(d.getHours()).padStart(2, '0');
  const min  = String(d.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${HH}:${min}`;
}

export function pdfUrl(path) {
  const token = localStorage.getItem('gamebook_auth_token');
  return token ? `/books/${path}?token=${encodeURIComponent(token)}` : `/books/${path}`;
}

export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function fmtMsgBody(str) {
  return esc(str)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

const IMG_ATT_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);
export function fmtAttachments(attachments) {
  if (!attachments?.length) return '';
  const items = attachments.map(a => {
    const ext = a.filename.slice(a.filename.lastIndexOf('.')).toLowerCase();
    if (IMG_ATT_EXTS.has(ext)) {
      return `<a href="/attachments/${esc(a.filename)}" target="_blank" class="att-thumb-wrap">
        <img src="/attachments/${esc(a.filename)}" class="att-thumb" alt="${esc(a.original_name)}" loading="lazy">
      </a>`;
    }
    return `<a href="/attachments/${esc(a.filename)}" target="_blank" class="att-file-link">${esc(a.original_name)}</a>`;
  }).join('');
  return `<div class="msg-attachments">${items}</div>`;
}

export function fmtDaysInactive(days) {
  if (days === null || days === undefined) return '-';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

export function daysInactiveClass(days) {
  if (days === null || days === undefined) return 'muted';
  if (days <= 7)  return 'act-fresh';
  if (days <= 30) return 'act-mid';
  return 'act-stale';
}

// _esc is a pre-existing separate escaper (no single-quote escaping, unlike esc)
// kept distinct rather than merged - some call sites embed values inside
// single-quoted onclick="..." strings where esc()'s &#39; would double-escape.
export function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Takes the row's own is_admin flag directly (id-based, from the DB), not a
// username comparison - a hardcoded admin username would silently stop
// badging the real admin on a rename, matching authorBadge/contributorBadge
// below which already take a boolean rather than re-deriving one from a name.
export function adminBadge(isAdmin) {
  return isAdmin ? '<span class="admin-badge" data-tooltip="Admin">★</span>' : '';
}
export function authorBadge(isAuthor) {
  return isAuthor ? '<span class="author-badge" data-tooltip="Author">★</span>' : '';
}
export function contributorBadge(isContributor) {
  return isContributor ? '<span class="contributor-badge" data-tooltip="Contributor">✦</span>' : '';
}

// ── DOM builders ──────────────────────────────────────────────────────────────

export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function badge(text, cls) { return el('span', 'badge ' + cls, text); }

export function mkBtn(label, cls, onClick) {
  const b = el('button', 'btn ' + cls, label);
  b.addEventListener('click', onClick);
  return b;
}

export function appendCell(tr, content, className) {
  const td = tr.insertCell();
  if (className) td.className = className;
  if (content instanceof Node) td.appendChild(content);
  else if (typeof content === 'number') td.textContent = content.toLocaleString();
  else td.textContent = (content !== null && content !== undefined) ? content : '-';
  return td;
}

export function emptyRow(tbody, colspan, msg) {
  const tr = tbody.insertRow();
  const td = tr.insertCell();
  td.colSpan = colspan; td.className = 'empty'; td.textContent = msg;
}

export function mkLevelCell(u) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;min-width:80px';
  const lvl = u.level || 0;
  const badgeEl = document.createElement('span');
  badgeEl.textContent = `Lvl ${lvl}${u.title ? '  ' + u.title : ''}`;
  badgeEl.style.cssText = 'font-size:0.8rem;font-weight:600;color:#f5a623;white-space:nowrap';
  wrap.appendChild(badgeEl);
  if (u.nextLevelXp) {
    const pct = Math.min(100, Math.round(((u.xp - u.levelXp) / (u.nextLevelXp - u.levelXp)) * 100));
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:5px';
    const track = document.createElement('div');
    track.style.cssText = 'height:4px;border-radius:2px;background:#1f2937;width:60px;flex-shrink:0';
    const fill = document.createElement('div');
    fill.style.cssText = `height:100%;border-radius:2px;background:#f5a623;width:${pct}%`;
    track.appendChild(fill);
    const pctLabel = document.createElement('span');
    pctLabel.textContent = `${pct}%`;
    pctLabel.style.cssText = 'font-size:0.7rem;color:#6b7280;white-space:nowrap';
    row.appendChild(track);
    row.appendChild(pctLabel);
    wrap.appendChild(row);
  } else if (lvl >= 100) {
    const maxLabel = document.createElement('span');
    maxLabel.textContent = 'MAX';
    maxLabel.style.cssText = 'font-size:0.7rem;color:#4ade80;font-weight:600';
    wrap.appendChild(maxLabel);
  }
  return wrap;
}

const _countryNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function countryName(code) {
  try { return _countryNames.of(code); } catch { return code; }
}

export function mkGeoCell(country, city) {
  if (!country && !city) return null;
  const wrap = document.createElement('span');
  wrap.style.cssText = 'display:inline-flex;align-items:center;gap:0.4rem;white-space:nowrap';
  if (country) {
    const img = document.createElement('img');
    img.src    = `https://flagcdn.com/w20/${country.toLowerCase()}.png`;
    img.width  = 20;
    img.height = 15;
    img.dataset.tooltip = countryName(country);
    img.style.cssText = 'border-radius:2px;object-fit:cover;vertical-align:middle;flex-shrink:0';
    wrap.appendChild(img);
  }
  if (city) {
    const s = document.createElement('span');
    s.textContent = city;
    s.style.color = '#9ca3af';
    wrap.appendChild(s);
  }
  return wrap;
}

export function addMetaItem(container, label, value) {
  const wrap = el('div', 'meta-item');
  wrap.appendChild(el('div', 'label', label));
  wrap.appendChild(el('div', 'value', String(value)));
  container.appendChild(wrap);
}

export function flashSaved(el) {
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 1800);
}

export function addStatCard(grid, label, value) {
  const card = el('div', 'stat-card');
  card.appendChild(el('div', 'label', label));
  card.appendChild(el('div', 'value', typeof value === 'number' ? value.toLocaleString() : String(value)));
  grid.appendChild(card);
}

// ── Generic sortable/searchable/paginated-table system ───────────────────────

// tableId → { col, dir }. Pre-seeded for tables whose default sort isn't
// "unsorted" - storeData() lazily adds an entry for any table not listed here.
export const _sortState = { users: { col: 'last_active', dir: -1 }, books: { col: 'name', dir: 1 }, pts: { col: 'lastActionAt', dir: -1 }, ubooks: { col: 'last_run_at', dir: -1 } };
export const _tableData  = {}; // tableId → data[]

const _naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
export const foldForSearch = value => (value == null ? '' : String(value)).normalize('NFC').toLocaleLowerCase();
export const naturalCompare = (a, b) => _naturalCollator.compare(a == null ? '' : String(a), b == null ? '' : String(b));
export const naturalCompareByName = (a, b) => naturalCompare(a?.name, b?.name);

export function storeData(tableId, data) {
  _tableData[tableId] = data;
  if (!_sortState[tableId]) _sortState[tableId] = { col: null, dir: 1 };
}

export function getSorted(tableId) {
  const { col, dir } = _sortState[tableId] || { col: null, dir: 1 };
  const data = _tableData[tableId] || [];
  if (!col) return [...data];
  return [...data].sort((a, b) => {
    const va = a[col], vb = b[col];
    if (va == null && vb == null) return naturalCompare(a.name, b.name);
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'string') return naturalCompare(va, vb) * dir;
    const primary = (va - vb) * dir;
    if (primary !== 0) return primary;
    if (col === 'level') return ((a.xp || 0) - (b.xp || 0)) * dir;
    return 0;
  });
}

// ── Search (layers on top of getSorted; same tableId keys as _tableData) ──────

export const _searchState = {}; // tableId → { query, fields: [...] }

export function setSearchFields(tableId, fields) {
  _searchState[tableId] = { query: '', fields };
}

export function matchesQuery(text, q) {
  return foldForSearch(text).includes(foldForSearch(q));
}

export function getFiltered(tableId) {
  const sorted = getSorted(tableId);
  const search = _searchState[tableId];
  if (!search || !search.query) return sorted;
  return sorted.filter(row => search.fields.some(f => matchesQuery(row[f], search.query)));
}

// Wires a .admin-search-input/.admin-search-clear pair to a table's search
// state, resetting to page 1 and re-rendering (through the existing sort +
// pagination pipeline) on every keystroke and on clear.
export function wireTableSearch(tableId, inputId, clearId, renderFn) {
  const input = document.getElementById(inputId);
  const clearBtn = document.getElementById(clearId);
  const apply = () => {
    _searchState[tableId].query = input.value;
    clearBtn.style.display = input.value ? 'inline-block' : 'none';
    if (_pageState[tableId]) _pageState[tableId].page = 0;
    renderPaged(tableId, getFiltered(tableId), renderFn);
  };
  input.addEventListener('input', apply);
  clearBtn.addEventListener('click', () => { input.value = ''; apply(); input.focus(); });
}

export function applySortIndicator(tableId) {
  const s = _sortState[tableId];
  document.querySelectorAll(`th[data-table="${tableId}"]`).forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
  if (s?.col) {
    const th = document.querySelector(`th[data-table="${tableId}"][data-col="${s.col}"]`);
    if (th) th.classList.add(s.dir === 1 ? 'sort-asc' : 'sort-desc');
  }
}

export function initSortHeaders(tableId, renderFn) {
  document.querySelectorAll(`th[data-table="${tableId}"][data-col]`).forEach(th => {
    th.classList.add('sortable');
    th.addEventListener('click', () => {
      const s = _sortState[tableId] || (_sortState[tableId] = { col: null, dir: 1 });
      const col = th.dataset.col;
      if (s.col === col) s.dir *= -1;
      else { s.col = col; s.dir = 1; }
      applySortIndicator(tableId);
      if (_pageState[tableId]) _pageState[tableId].page = 0;
      renderPaged(tableId, getFiltered(tableId), renderFn);
    });
  });
  applySortIndicator(tableId);
}

// ── Pagination ────────────────────────────────────────────────────────────────

export const PAGE_SIZE  = 50;
export const _pageState = {}; // tableId → { page }

// Slices fullData to the current page, renders it via renderFn, then draws
// prev/next controls. Call this instead of renderFn(fullData) directly for
// any paginated table; sort/reload call sites pass the same renderFn each
// time so Prev/Next re-slice the same already-fetched array with no refetch.
export function renderPaged(tableId, fullData, renderFn, pageSize = PAGE_SIZE) {
  if (!_pageState[tableId]) _pageState[tableId] = { page: 0 };
  const state = _pageState[tableId];
  const totalPages = Math.max(1, Math.ceil(fullData.length / pageSize));
  if (state.page >= totalPages) state.page = totalPages - 1;
  if (state.page < 0) state.page = 0;
  const start = state.page * pageSize;
  renderFn(fullData.slice(start, start + pageSize));
  _renderPaginationControls(tableId, state.page, totalPages, fullData.length, () => renderPaged(tableId, fullData, renderFn, pageSize));
}

function _renderPaginationControls(tableId, page, totalPages, total, onChange) {
  const el = document.getElementById(`${tableId}-pagination`);
  if (!el) return;
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML =
    `<button class="btn" id="${tableId}-page-prev"${page === 0 ? ' disabled' : ''}>&larr; Prev</button>` +
    `<span>Page ${page + 1} of ${totalPages} (${total.toLocaleString()} total)</span>` +
    `<button class="btn" id="${tableId}-page-next"${page >= totalPages - 1 ? ' disabled' : ''}>Next &rarr;</button>`;
  document.getElementById(`${tableId}-page-prev`)?.addEventListener('click', () => { _pageState[tableId].page--; onChange(); });
  document.getElementById(`${tableId}-page-next`)?.addEventListener('click', () => { _pageState[tableId].page++; onChange(); });
}
