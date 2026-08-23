// Users + Books tabs, and their drill-down detail views (user detail -> their
// books -> book detail -> owner -> back to user detail, etc.) plus the Gift
// modal used from both. Kept as ONE module rather than split into users.js/
// books.js - the two detail views call back into each other constantly
// (viewing a user's books opens a book detail, which links back to the owner,
// which reopens user detail...), genuinely one cohesive drill-down feature,
// same precedent as party.js/play.js or charsheet.js's many-importer pattern
// elsewhere in the app.
// To remove: delete this file and its <script type="module"> import in
// admin/index.html; remove the Users/Books tabs and user/book detail view
// HTML/CSS, and the #gift-overlay modal HTML/CSS.

import {
  api, el, badge, mkBtn, appendCell, emptyRow, mkLevelCell, mkGeoCell, addMetaItem, addStatCard,
  fmtDate, fmtDateTime, fmtBytes, pdfUrl, esc, adminBadge, authorBadge, contributorBadge,
  daysInactiveClass, fmtDaysInactive, flashSaved, showAlert, showConfirm,
  storeData, getSorted, getFiltered, foldForSearch, naturalCompare, naturalCompareByName, _tableData,
  setSearchFields, wireTableSearch, initSortHeaders, renderPaged,
} from './core.js';
import { loadAll, loadTools } from './dashboard.js';

// ── Gift modal ────────────────────────────────────────────────────────────────

let _giftBookId     = null;
let _giftSourceId   = null;
let _giftSugIdx     = -1;

const _giftInput = document.getElementById('gift-input');
const _giftSugs  = document.getElementById('gift-suggestions');
const _giftStat  = document.getElementById('gift-status');

function _setGiftStatus(msg, type) {
  _giftStat.textContent = msg;
  _giftStat.className   = type || '';
}

function _hideSuggestions() {
  _giftSugs.style.display = 'none';
  _giftSugs.innerHTML = '';
  _giftSugIdx = -1;
}

function _showSuggestions(matches) {
  _giftSugs.innerHTML = '';
  _giftSugIdx = -1;
  if (!matches.length) { _hideSuggestions(); return; }
  matches.forEach((u, i) => {
    const item = document.createElement('div');
    item.className   = 'gift-sug-item';
    item.textContent = u.username;
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      _giftInput.value = u.username;
      _hideSuggestions();
      _setGiftStatus('', '');
    });
    _giftSugs.appendChild(item);
  });
  _giftSugs.style.display = 'block';
}

_giftInput.addEventListener('input', () => {
  const q = foldForSearch(_giftInput.value.trim());
  _setGiftStatus('', '');
  if (!q) { _hideSuggestions(); return; }
  const users = _tableData['users'] || [];
  const matches = users.filter(u => foldForSearch(u.username).includes(q)).slice(0, 8);
  _showSuggestions(matches);
});

_giftInput.addEventListener('keydown', e => {
  const items = _giftSugs.querySelectorAll('.gift-sug-item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _giftSugIdx = Math.min(_giftSugIdx + 1, items.length - 1);
    items.forEach((el, i) => el.classList.toggle('active', i === _giftSugIdx));
    if (items[_giftSugIdx]) _giftInput.value = items[_giftSugIdx].textContent;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _giftSugIdx = Math.max(_giftSugIdx - 1, -1);
    items.forEach((el, i) => el.classList.toggle('active', i === _giftSugIdx));
    if (_giftSugIdx >= 0 && items[_giftSugIdx]) _giftInput.value = items[_giftSugIdx].textContent;
  } else if (e.key === 'Escape') {
    _hideSuggestions();
  } else if (e.key === 'Enter') {
    _hideSuggestions();
    _submitGift();
  }
});

_giftInput.addEventListener('blur', () => { setTimeout(_hideSuggestions, 150); });

function showGiftModal(bookId, bookName, sourceUserId) {
  _giftBookId   = bookId;
  _giftSourceId = sourceUserId || null;
  document.getElementById('gift-book-name').textContent = bookName;
  _giftInput.value = '';
  _setGiftStatus('', '');
  _hideSuggestions();
  document.getElementById('gift-overlay').classList.add('active');
  setTimeout(() => _giftInput.focus(), 50);
}

async function _submitGift() {
  const username = _giftInput.value.trim();
  if (!username) { _setGiftStatus('Enter a username.', 'error'); return; }
  const users  = _tableData['users'] || [];
  const usernameFold = foldForSearch(username);
  const target = users.find(u => foldForSearch(u.username) === usernameFold);
  if (!target) { _setGiftStatus(`User "${username}" not found. Open the Users tab first if needed.`, 'error'); return; }
  if (target.id === _giftSourceId) { _setGiftStatus('Source and target are the same user.', 'error'); return; }
  _setGiftStatus('', '');
  try {
    await api('POST', `/api/admin/books/${_giftBookId}/gift`, { sourceUserId: _giftSourceId, targetUserId: target.id });
    _setGiftStatus(`Gifted to ${target.username}.`, 'ok');
    setTimeout(() => {
      document.getElementById('gift-overlay').classList.remove('active');
      _giftBookId = _giftSourceId = null;
    }, 1200);
  } catch (e) {
    _setGiftStatus(e.message || 'Error gifting book.', 'error');
  }
}

document.getElementById('gift-ok').addEventListener('click', _submitGift);
document.getElementById('gift-cancel').addEventListener('click', () => {
  _hideSuggestions();
  document.getElementById('gift-overlay').classList.remove('active');
  _giftBookId = _giftSourceId = null;
});

// ── Navigation ────────────────────────────────────────────────────────────────

let _backCtx       = null;
let _currentUserId = null;
let _currentBookId = null;

export function showView(name) {
  document.getElementById('view-main').style.display = name === 'main' ? '' : 'none';
  document.getElementById('view-user').style.display = name === 'user' ? '' : 'none';
  document.getElementById('view-book').style.display = name === 'book' ? '' : 'none';
}

document.getElementById('user-back-btn').addEventListener('click', () => {
  document.getElementById('user-gift-gc-row').style.display = 'none';
  showView('main'); loadAll();
});

document.getElementById('ue-save').addEventListener('click', async () => {
  const status  = document.getElementById('ue-status');
  const errEl   = document.getElementById('ue-error');
  const body = {
    username:      document.getElementById('ue-username').value.trim(),
    displayName:   document.getElementById('ue-display-name').value.trim() || null,
    password:      document.getElementById('ue-password').value,
    email:         document.getElementById('ue-email').value.trim(),
    publicProfile: document.getElementById('ue-public-profile').checked,
    hideFeed:      document.getElementById('ue-hide-feed').checked,
  };
  status.textContent = 'Saving…';
  errEl.style.display = 'none';
  try {
    await api('POST', `/api/admin/users/${_currentUserId}/edit`, body);
    document.getElementById('ue-password').value = '';
    status.textContent = 'Saved';
    loadUserDetail(_currentUserId);
  } catch (err) {
    status.textContent = '';
    errEl.textContent = err.message || 'Error saving';
    errEl.style.display = '';
  }
});

document.getElementById('ue-cancel').addEventListener('click', () => {
  if (_currentUserId) loadUserDetail(_currentUserId);
});
document.getElementById('book-back-btn').addEventListener('click', () => {
  if (_backCtx && _backCtx.view === 'user') loadUserDetail(_backCtx.userId);
  else { showView('main'); loadAll(); }
});
document.getElementById('refresh-btn').addEventListener('click', () => {
  if (document.getElementById('view-book').style.display !== 'none')
    loadBookDetail(_currentBookId, _backCtx);
  else if (document.getElementById('view-user').style.display !== 'none')
    loadUserDetail(_currentUserId);
  else {
    loadAll();
    if (document.querySelector('.tab-btn.active')?.dataset.tab === 'tools') loadTools();
  }
});

// ── Main view - Users ─────────────────────────────────────────────────────────

export function renderUsersTable(data) {
  const tbody = document.getElementById('users-body');
  // Derived from the live header rather than hardcoded - a hardcoded number
  // here has gone stale before (most recently when the Active column was
  // added), leaving these full-width rows spanning fewer columns than the
  // table actually has and reading as off-center.
  const colCount = document.querySelectorAll('#users-table thead th').length;
  tbody.innerHTML = '';
  if (!data.length) { emptyRow(tbody, colCount, 'No users yet.'); return; }

  const visible = data.filter(u => daysInactiveClass(u.days_inactive) !== 'act-stale');
  const hidden  = data.filter(u => daysInactiveClass(u.days_inactive) === 'act-stale');

  for (const u of visible) renderUserRow(tbody, u);

  if (hidden.length) {
    const moreTr = tbody.insertRow();
    const moreTd = moreTr.insertCell();
    moreTd.colSpan = colCount;
    moreTd.style.textAlign = 'center';
    moreTd.style.padding = '10px';
    const moreBtn = mkBtn(`Show ${hidden.length} inactive user${hidden.length !== 1 ? 's' : ''} (31+ days)`, 'btn-info', () => {
      moreTr.remove();
      for (const u of hidden) renderUserRow(tbody, u);
    });
    moreTd.appendChild(moreBtn);
  }
}

function renderUserRow(tbody, u) {
    const tr = tbody.insertRow();

    const nameCell = tr.insertCell();
    const link = el('span', 'link', u.username);
    link.addEventListener('click', () => loadUserDetail(u.id));
    nameCell.appendChild(link);
    requestAnimationFrame(() => { if (link.scrollWidth > link.clientWidth) link.dataset.tooltip = u.username; });
    if (u.is_admin) nameCell.insertAdjacentHTML('beforeend', adminBadge(true));
    if (u.is_author) nameCell.insertAdjacentHTML('beforeend', authorBadge(true));
    if (u.is_contributor) nameCell.insertAdjacentHTML('beforeend', contributorBadge(true));

    appendCell(tr, fmtDate(u.created_at), 'muted');
    appendCell(tr, fmtDate(u.last_active), 'muted');

    const daysCell = tr.insertCell();
    daysCell.className = daysInactiveClass(u.days_inactive);
    daysCell.textContent = fmtDaysInactive(u.days_inactive);

    appendCell(tr, badge(u.book_count, 'badge-blue'));

    const runsCell    = appendCell(tr, u.runs    || 0, 'muted');
    const activeCell  = appendCell(tr, u.active  || 0, 'muted');
    const winsCell    = appendCell(tr, u.wins    || 0, 'muted');
    const deathsCell  = appendCell(tr, u.deaths  || 0, 'muted');
    const battlesCell = appendCell(tr, u.battles || 0, 'muted');
    if (u.runs    > 0) runsCell.style.color    = '#f5a623';
    if (u.active  > 0) activeCell.style.color  = '#60a5fa';
    if (u.wins    > 0) winsCell.style.color    = '#4ade80';
    if (u.deaths  > 0) deathsCell.style.color  = '#f87171';
    if (u.battles > 0) battlesCell.style.color = '#fb923c';

    const lvlCell = tr.insertCell();
    lvlCell.appendChild(mkLevelCell(u));

    const earnedCell = tr.insertCell();
    if (u.coinsEarned > 0) {
      earnedCell.innerHTML = `<span style="color:#f59e0b;font-variant-numeric:tabular-nums">${u.coinsEarned.toLocaleString()}</span>`;
    } else {
      earnedCell.textContent = '-';
      earnedCell.className = 'muted';
    }

    const spentCell = tr.insertCell();
    if (u.coinsSpent > 0) {
      spentCell.innerHTML = `<span style="color:#f87171;font-variant-numeric:tabular-nums">${u.coinsSpent.toLocaleString()}</span>`;
    } else {
      spentCell.textContent = '-';
      spentCell.className = 'muted';
    }

    const giftedCell = tr.insertCell();
    if (u.adminGiftedCoins > 0) {
      giftedCell.innerHTML = `<span style="color:#a78bfa;font-variant-numeric:tabular-nums">${u.adminGiftedCoins.toLocaleString()}</span>`;
    } else {
      giftedCell.textContent = '-';
      giftedCell.className = 'muted';
    }

    const luckyCell = tr.insertCell();
    if (u.luckyClaimed > 0) {
      luckyCell.innerHTML = `<span style="color:#f59e0b;font-variant-numeric:tabular-nums">${u.luckyClaimed.toLocaleString()}</span>`;
    } else {
      luckyCell.textContent = '-';
      luckyCell.className = 'muted';
    }

    appendCell(tr, badge(u.session_count, u.session_count > 0 ? 'badge-green' : 'badge-grey'));

    const locTd = tr.insertCell();
    const locEl = mkGeoCell(u.active_country, u.active_city);
    if (locEl) locTd.appendChild(locEl); else locTd.textContent = '-';
    locTd.style.fontSize = '0.85rem';

    const domainTd = tr.insertCell();
    domainTd.textContent = u.last_domain ? u.last_domain.replace(/^www\./, '') : '-';
    domainTd.style.fontSize = '0.85rem';
    if (!u.last_domain) domainTd.className = 'muted';

    const group = el('div', 'btn-group');
    group.appendChild(mkBtn('Clear sessions', 'btn-warn',   () => confirmClearSessions(u.id, u.username)));
    group.appendChild(mkBtn('Impersonate', 'btn-info', async () => {
      const r = await fetch(`/api/admin/users/${u.id}/impersonate`, { method: 'POST' });
      const { url } = await r.json();
      window.open(url, '_blank');
    }));
    if (!u.is_protected) {
      if (u.locked_until) {
        group.appendChild(mkBtn('Unlock', 'btn-info', async () => {
          await api('POST', `/api/admin/users/${u.id}/unlock`);
          loadUsers();
        }));
      } else {
        group.appendChild(mkBtn('Lock', 'btn-danger', () => {
          showConfirm(`Lock ${u.username}? They will not be able to log in until unlocked.`, async () => {
            await api('POST', `/api/admin/users/${u.id}/lock`);
            loadUsers();
          });
        }));
      }
      if (!u.is_author && !u.is_contributor) {
        group.appendChild(mkBtn('Delete', 'btn-danger', () => confirmDeleteUser(u.id, u.username)));
      }
    }
    appendCell(tr, group);
}

function renderLockedTable(users, now) {
  const locked = users.filter(u => u.locked_until);
  const section = document.getElementById('locked-section');
  const tbody   = document.getElementById('locked-body');
  section.style.display = locked.length ? '' : 'none';
  tbody.innerHTML = '';
  if (!locked.length) return;
  for (const u of locked) {
    const tr = tbody.insertRow();
    const nameCell = tr.insertCell();
    const link = el('span', 'link', u.username);
    link.addEventListener('click', () => loadUserDetail(u.id));
    nameCell.appendChild(link);
    requestAnimationFrame(() => { if (link.scrollWidth > link.clientWidth) link.dataset.tooltip = u.username; });

    const isHard = u.locked_until === -1;
    appendCell(tr, isHard ? 'Admin lock' : 'Auto (failed attempts)', isHard ? '' : 'muted');

    const detailCell = tr.insertCell();
    if (isHard) {
      detailCell.textContent = 'Requires admin unlock';
      detailCell.style.color = '#f87171';
    } else {
      const minsLeft = Math.max(0, Math.ceil((u.locked_until - now) / 60));
      detailCell.textContent = minsLeft > 0 ? `${minsLeft} min remaining` : 'Expired (will clear on next login)';
      detailCell.className = 'muted';
    }

    appendCell(tr, u.failed_login_attempts || 0, 'muted');

    const group = el('div', 'btn-group');
    group.appendChild(mkBtn('Unlock', 'btn-info', async () => {
      await api('POST', `/api/admin/users/${u.id}/unlock`);
      loadUsers();
    }));
    appendCell(tr, group);
  }
}

export async function loadUsers() {
  const meta = document.getElementById('users-meta');
  try {
    const now   = Date.now() / 1000;
    const users = await api('GET', '/api/admin/users');
    for (const u of users) {
      u.days_inactive = u.last_active ? Math.floor((now - u.last_active) / 86400) : null;
      u.coinsSpent    = (u.coinsEarned || 0) - (u.coinsBalance || 0);
    }
    meta.textContent = `${users.length} user${users.length !== 1 ? 's' : ''}`;
    storeData('users', users);
    renderUsersTable(getSorted('users'));
    renderLockedTable(users, now);
  } catch (e) { meta.textContent = 'Error loading users.'; console.error(e); }
}

// ── Main view - Books ─────────────────────────────────────────────────────────

export function renderBooksTable(data) {
  const tbody = document.getElementById('books-body');
  tbody.innerHTML = '';
  if (!data.length) { emptyRow(tbody, 8, 'No books yet.'); return; }

  for (const b of data) {
    const tr = tbody.insertRow();

    const nameCell = tr.insertCell();
    const link = el('span', 'link', b.name);
    link.addEventListener('click', () => loadBookDetail(b.id, null));
    nameCell.appendChild(link);

    appendCell(tr, b.owner,          'muted');
    appendCell(tr, b.total_sections, 'muted');
    const winsCell    = appendCell(tr, b.wins    || 0, 'muted');
    const deathsCell  = appendCell(tr, b.deaths  || 0, 'muted');
    const battlesCell = appendCell(tr, b.battles || 0, 'muted');
    if (b.wins    > 0) winsCell.style.color    = '#4ade80';
    if (b.deaths  > 0) deathsCell.style.color  = '#f87171';
    if (b.battles > 0) battlesCell.style.color = '#fb923c';
    appendCell(tr, fmtDate(b.updated_at), 'muted');
    appendCell(tr, mkBtn('Delete', 'btn-danger', () => confirmDeleteBook(b.id, b.name, null)));
  }
}

export async function loadBooks() {
  const meta = document.getElementById('books-meta');
  try {
    const books = await api('GET', '/api/admin/books');
    meta.textContent = `${books.length} book${books.length !== 1 ? 's' : ''}`;
    storeData('books', books);
    renderPaged('books', getFiltered('books'), renderBooksTable);
  } catch (e) { meta.textContent = 'Error loading books.'; console.error(e); }
}

// ── User detail view ──────────────────────────────────────────────────────────

export function renderUserBooksTable(data, userId) {
  const tbody = document.getElementById('user-books-body');
  tbody.innerHTML = '';
  if (!data.length) { emptyRow(tbody, 10, 'No books yet.'); return; }

  for (const b of data) {
    const tr = tbody.insertRow();

    const nameCell = tr.insertCell();
    const link = el('span', 'link', b.name);
    link.addEventListener('click', () => loadBookDetail(b.id, { view: 'user', userId }));
    nameCell.appendChild(link);

    appendCell(tr, b.total_sections, 'muted');
    appendCell(tr, b.mapped,         'muted');
    appendCell(tr, b.discovered,     'muted');
    const runsCell    = appendCell(tr, b.playthroughs || 0, 'muted');
    const winsCell    = appendCell(tr, b.wins         || 0, 'muted');
    const deathsCell  = appendCell(tr, b.deaths       || 0, 'muted');
    const battlesCell = appendCell(tr, b.battles      || 0, 'muted');
    if (b.playthroughs > 0) runsCell.style.color    = '#f5a623';
    if (b.wins         > 0) winsCell.style.color    = '#4ade80';
    if (b.deaths       > 0) deathsCell.style.color  = '#f87171';
    if (b.battles      > 0) battlesCell.style.color = '#fb923c';
    appendCell(tr, fmtDate(b.updated_at), 'muted');
    const actCell = tr.insertCell();
    actCell.style.cssText = 'white-space:nowrap';
    actCell.appendChild(mkBtn('Watch', 'btn-info', () => window.open(`/admin/watch?userId=${userId}&bookId=${b.id}`, '_blank')));
    actCell.appendChild(document.createTextNode('\u00a0'));
    actCell.appendChild(mkBtn('Gift', 'btn-info', () => showGiftModal(b.id, b.name, userId)));
    actCell.appendChild(document.createTextNode('\u00a0'));
    actCell.appendChild(mkBtn('Delete', 'btn-danger', () => confirmDeleteBook(b.id, b.name, userId)));
  }
}

export async function loadUserDetail(userId) {
  _currentUserId = userId;
  _backCtx = { view: 'main' };
  showView('user');

  document.getElementById('user-crumb').textContent     = '…';
  document.getElementById('user-meta-bar').innerHTML    = '';
  document.getElementById('user-action-bar').innerHTML  = '';
  document.getElementById('user-books-body').innerHTML  = '';
  document.getElementById('gift-gc-amount').value  = '';
  document.getElementById('gift-gc-message').value = '';
  document.getElementById('gift-gc-status').textContent = '';
  document.getElementById('gift-gc-supply').textContent = '';
  document.getElementById('user-gift-gc-row').style.display = 'flex';
  async function refreshGcSupply() {
    try {
      const s = await api('GET', '/api/admin/gc-supply');
      document.getElementById('s-admin-gc-earned').textContent = s.earned;
      document.getElementById('s-admin-gc-avail').textContent  = s.available;
      document.getElementById('gift-gc-supply').textContent = `(${s.available} available)`;
    } catch (_) {}
  }
  refreshGcSupply();
  document.getElementById('gift-gc-btn').onclick = async () => {
    const amount = parseInt(document.getElementById('gift-gc-amount').value);
    const message = document.getElementById('gift-gc-message').value.trim() || null;
    const status = document.getElementById('gift-gc-status');
    if (!amount || amount < 1) { status.style.color = '#f87171'; status.textContent = 'Enter a valid amount.'; return; }
    try {
      document.getElementById('gift-gc-btn').disabled = true;
      const r = await api('POST', `/api/admin/users/${userId}/gift-gc`, { amount, message });
      status.style.color = '#4ade80';
      status.textContent = `Gifted ${amount} GC. New balance: ${r.balance}`;
      document.getElementById('gift-gc-amount').value = '';
      refreshGcSupply();
    } catch (e) {
      status.style.color = '#f87171';
      status.textContent = e.message?.includes('Insufficient') ? 'Not enough admin GC.' : 'Failed.';
    }
    document.getElementById('gift-gc-btn').disabled = false;
  };
  document.getElementById('user-books-meta').textContent = '';

  try {
    const { user, books, totals } = await api('GET', `/api/admin/users/${userId}`);

    document.getElementById('user-crumb').innerHTML = esc(user.username) + adminBadge(user.is_admin) + authorBadge(user.is_author) + contributorBadge(user.is_contributor)
      + (user.display_name ? ` <span style="color:#6b7280;font-size:0.82rem;font-weight:400">(${esc(user.display_name)})</span>` : '');

    document.getElementById('ue-username').value              = user.username;
    document.getElementById('ue-display-name').value          = user.display_name || '';
    document.getElementById('ue-password').value              = '';
    document.getElementById('ue-email').value                 = user.email || '';
    document.getElementById('ue-public-profile').checked      = !!user.public_profile;
    document.getElementById('ue-hide-feed').checked           = !!user.hide_from_feed;
    document.getElementById('ue-display-name-row').style.display = user.is_author ? 'block' : 'none';
    document.getElementById('ue-status').textContent          = '';
    document.getElementById('ue-error').style.display         = 'none';

    const metaBar = document.getElementById('user-meta-bar');
    // From the permanent xp_events ledger (server's `totals`), not summed
    // from the per-book breakdown below - see server/db/admin.js's own
    // comment on adminGetUserBooks for why those can disagree.
    const totalRuns    = totals.runs;
    const totalWins    = totals.wins;
    const totalDeaths  = totals.deaths;
    const totalBattles = totals.battles;
    const createdCount = books.filter(b => b.created_by === user.id).length;

    addMetaItem(metaBar, 'Joined', fmtDate(user.created_at));
    const booksMeta = el('div', 'meta-item');
    booksMeta.appendChild(el('div', 'label', 'Books'));
    const booksVal = document.createElement('div');
    booksVal.className = 'value';
    booksVal.style.cssText = 'display:flex;align-items:baseline;gap:0.35rem';
    const booksN = el('span', '', String(books.length));
    booksVal.appendChild(booksN);
    if (createdCount > 0) {
      const createdSpan = el('span', '', `(${createdCount} created)`);
      createdSpan.style.cssText = 'font-size:0.75rem;color:#60a5fa';
      booksVal.appendChild(createdSpan);
    }
    booksMeta.appendChild(booksVal);
    metaBar.appendChild(booksMeta);
    addMetaItem(metaBar, 'Sessions', user.session_count);

    const runsMeta = el('div', 'meta-item');
    runsMeta.appendChild(el('div', 'label', 'Runs'));
    const runsVal = document.createElement('div');
    runsVal.className = 'value';
    runsVal.style.cssText = 'display:flex;align-items:baseline;gap:0.35rem';
    const runsN = el('span', '', totalRuns.toLocaleString());
    runsN.style.color = totalRuns > 0 ? '#f5a623' : '';
    const winsN = el('span', '', `${totalWins.toLocaleString()}W`);
    winsN.style.cssText = 'font-size:0.75rem;color:#4ade80';
    const deathsN = el('span', '', `${totalDeaths.toLocaleString()}L`);
    deathsN.style.cssText = 'font-size:0.75rem;color:#f87171';
    const battlesN = el('span', '', `${totalBattles.toLocaleString()}B`);
    battlesN.style.cssText = 'font-size:0.75rem;color:#fb923c';
    runsVal.appendChild(runsN);
    if (totalRuns > 0) { runsVal.appendChild(winsN); runsVal.appendChild(deathsN); if (totalBattles > 0) runsVal.appendChild(battlesN); }
    runsMeta.appendChild(runsVal);
    metaBar.appendChild(runsMeta);
    const locMeta = el('div', 'meta-item');
    locMeta.appendChild(el('div', 'label', 'Location'));
    const locVal = document.createElement('div');
    locVal.className = 'value';
    const locEl = mkGeoCell(user.active_country, user.active_city);
    if (locEl) { locVal.style.fontSize = '0.9rem'; locVal.appendChild(locEl); }
    else locVal.textContent = '-';
    locMeta.appendChild(locVal);
    metaBar.appendChild(locMeta);
    const domainMeta = el('div', 'meta-item');
    domainMeta.appendChild(el('div', 'label', 'Domain'));
    const domainVal = document.createElement('div');
    domainVal.className = 'value';
    domainVal.style.fontSize = '0.9rem';
    domainVal.textContent = user.last_domain ? user.last_domain.replace(/^www\./, '') : '-';
    domainMeta.appendChild(domainVal);
    metaBar.appendChild(domainMeta);
    const lvlMeta = el('div', 'meta-item');
    lvlMeta.appendChild(el('div', 'label', 'Level'));
    const lvlVal = document.createElement('div');
    lvlVal.className = 'value';
    lvlVal.appendChild(mkLevelCell(user));
    if (user.xp > 0) {
      const xpText = document.createElement('div');
      xpText.style.cssText = 'font-size:0.7rem;color:#6b7280;margin-top:2px;white-space:nowrap';
      xpText.textContent = user.nextLevelXp
        ? `${user.xp.toLocaleString()} / ${user.nextLevelXp.toLocaleString()} XP`
        : `${user.xp.toLocaleString()} XP`;
      lvlVal.appendChild(xpText);
    }
    lvlMeta.appendChild(lvlVal);
    metaBar.appendChild(lvlMeta);

    const shopXpBoost = user.xpBoostPurchased || 0;
    if (shopXpBoost || user.bonusUndos || user.bonusFastTravels || user.bonusHeartbeatXp || user.bonusGcChancePurchased) {
      const boostMeta = el('div', 'meta-item');
      boostMeta.appendChild(el('div', 'label', 'Shop Boosts'));
      const boostVal = el('div', 'value');
      boostVal.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:0.8rem';
      const addBoostRow = (text, item, count, costEach) => {
        const row = el('div', '', '');
        row.style.cssText = 'display:flex;align-items:center;gap:0.4rem';
        row.appendChild(el('span', '', text));
        row.appendChild(mkBtn('Refund 1', 'btn-warn', () => {
          showConfirm(`Refund one ${text} for ${user.username}? Restores ${costEach} GC.`, async () => {
            await api('POST', `/api/admin/users/${user.id}/refund`, { item });
            loadUserDetail(user.id);
          }, { label: 'Refund', variant: 'warn' });
        }));
        if (count > 1) {
          row.appendChild(mkBtn('Refund all', 'btn-danger', () => {
            showConfirm(`Refund all ${count} × ${text} for ${user.username}? Restores ${count * costEach} GC.`, async () => {
              await api('POST', `/api/admin/users/${user.id}/refund`, { item, all: true });
              loadUserDetail(user.id);
            }, { label: 'Refund all', variant: 'danger' });
          }));
        }
        boostVal.appendChild(row);
      };
      if (shopXpBoost)              addBoostRow(`+${(shopXpBoost * 0.1).toFixed(1)}% XP boost (${shopXpBoost} purchases)`, 'xp_boost', shopXpBoost, 1);
      if (user.bonusUndos)          addBoostRow(`+${user.bonusUndos} undo${user.bonusUndos !== 1 ? 's' : ''}`, 'undo', user.bonusUndos, 5);
      if (user.bonusFastTravels)    addBoostRow(`+${user.bonusFastTravels} fast travel${user.bonusFastTravels !== 1 ? 's' : ''}`, 'fast_travel', user.bonusFastTravels, 10);
      if (user.bonusHeartbeatXp) {
        const hbCount = user.bonusHeartbeatXp;
        const hbLastCost = hbCount;
        const hbTotalCost = (hbCount * (hbCount + 1)) / 2;
        const hbRow = el('div', '', '');
        hbRow.style.cssText = 'display:flex;align-items:center;gap:0.4rem';
        hbRow.appendChild(el('span', '', `+${(hbCount * 0.1).toFixed(1)} heartbeat XP (${hbCount} purchases)`));
        hbRow.appendChild(mkBtn('Refund 1', 'btn-warn', () => {
          showConfirm(`Refund one heartbeat XP upgrade for ${user.username}? Restores ${hbLastCost} GC.`, async () => {
            await api('POST', `/api/admin/users/${user.id}/refund`, { item: 'heartbeat_xp' });
            loadUserDetail(user.id);
          }, { label: 'Refund', variant: 'warn' });
        }));
        if (hbCount > 1) {
          hbRow.appendChild(mkBtn('Refund all', 'btn-danger', () => {
            showConfirm(`Refund all ${hbCount} heartbeat XP upgrades for ${user.username}? Restores ${hbTotalCost} GC.`, async () => {
              await api('POST', `/api/admin/users/${user.id}/refund`, { item: 'heartbeat_xp', all: true });
              loadUserDetail(user.id);
            }, { label: 'Refund all', variant: 'danger' });
          }));
        }
        boostVal.appendChild(hbRow);
      }
      if (user.bonusGcChancePurchased) {
        // Same escalating-cost shape as heartbeat XP above (1st purchase = 1
        // GC, 2nd = 2 GC, ...) - addBoostRow's flat count*costEach math would
        // understate "Refund all"'s restored amount for this item, same as
        // it would for xp_boost above (a pre-existing, separate issue).
        const gcCount = user.bonusGcChancePurchased;
        const gcLastCost = gcCount;
        const gcTotalCost = (gcCount * (gcCount + 1)) / 2;
        const gcRow = el('div', '', '');
        gcRow.style.cssText = 'display:flex;align-items:center;gap:0.4rem';
        gcRow.appendChild(el('span', '', `+${(gcCount * 0.01).toFixed(2)}% bonus GC chance (${gcCount} purchases)`));
        gcRow.appendChild(mkBtn('Refund 1', 'btn-warn', () => {
          showConfirm(`Refund one bonus GC chance upgrade for ${user.username}? Restores ${gcLastCost} GC.`, async () => {
            await api('POST', `/api/admin/users/${user.id}/refund`, { item: 'gc_chance' });
            loadUserDetail(user.id);
          }, { label: 'Refund', variant: 'warn' });
        }));
        if (gcCount > 1) {
          gcRow.appendChild(mkBtn('Refund all', 'btn-danger', () => {
            showConfirm(`Refund all ${gcCount} bonus GC chance upgrades for ${user.username}? Restores ${gcTotalCost} GC.`, async () => {
              await api('POST', `/api/admin/users/${user.id}/refund`, { item: 'gc_chance', all: true });
              loadUserDetail(user.id);
            }, { label: 'Refund all', variant: 'danger' });
          }));
        }
        boostVal.appendChild(gcRow);
      }
      boostMeta.appendChild(boostVal);
      metaBar.appendChild(boostMeta);
    }

    // Lock status in meta bar
    if (user.locked_until) {
      const now = Math.floor(Date.now() / 1000);
      let lockLabel;
      if (user.locked_until === -1) {
        lockLabel = 'Admin locked';
      } else {
        const minsLeft = Math.ceil((user.locked_until - now) / 60);
        lockLabel = `Temp locked (${minsLeft}m left)`;
      }
      const lockItem = el('div', 'meta-item');
      lockItem.innerHTML = `<span class="meta-label">Login</span><span style="color:#f87171">${lockLabel}</span>`;
      metaBar.appendChild(lockItem);
    }
    if (user.failed_login_attempts > 0) {
      addMetaItem(metaBar, 'Failed logins', user.failed_login_attempts);
    }

    const actionBar = document.getElementById('user-action-bar');
    actionBar.appendChild(mkBtn('Clear sessions', 'btn-warn', () => confirmClearSessions(user.id, user.username)));
    {
      const authorLabel = user.is_author ? 'Remove Author' : 'Mark as Author';
      actionBar.appendChild(mkBtn(authorLabel, user.is_author ? 'btn-warn' : 'btn-info', async () => {
        await api('POST', `/api/admin/users/${user.id}/author`, { isAuthor: !user.is_author });
        loadUserDetail(user.id);
      }));
      const contribLabel = user.is_contributor ? 'Remove Contributor' : 'Mark as Contributor';
      actionBar.appendChild(mkBtn(contribLabel, user.is_contributor ? 'btn-warn' : 'btn-info', async () => {
        await api('POST', `/api/admin/users/${user.id}/contributor`, { isContributor: !user.is_contributor });
        loadUserDetail(user.id);
      }));
      const pdfLabel = user.pdf_access ? 'Revoke PDF Access' : 'Grant PDF Access';
      actionBar.appendChild(mkBtn(pdfLabel, user.pdf_access ? 'btn-warn' : 'btn-info', async () => {
        await api('POST', `/api/admin/users/${user.id}/pdf-access`, { pdfAccess: !user.pdf_access });
        loadUserDetail(user.id);
      }));
    }
    if (!user.is_protected) {
      if (user.locked_until) {
        actionBar.appendChild(mkBtn('Unlock', 'btn-info', async () => {
          await api('POST', `/api/admin/users/${user.id}/unlock`);
          loadUserDetail(user.id);
        }));
      } else {
        actionBar.appendChild(mkBtn('Lock', 'btn-danger', () => {
          showConfirm(`Lock ${user.username}? They will not be able to log in until unlocked.`, async () => {
            await api('POST', `/api/admin/users/${user.id}/lock`);
            loadUserDetail(user.id);
          });
        }));
      }
      if (!user.is_author && !user.is_contributor) {
        actionBar.appendChild(mkBtn('Delete user', 'btn-danger', () => confirmDeleteUser(user.id, user.username)));
      }
    }

    document.getElementById('user-books-meta').textContent =
      `${books.length} book${books.length !== 1 ? 's' : ''}`;

    storeData('ubooks', books);
    renderUserBooksTable(getSorted('ubooks'), user.id);
  } catch (e) { console.error('User detail:', e); }
}

// ── Book detail view ──────────────────────────────────────────────────────────

export function renderPtsTable(data) {
  const tbody = document.getElementById('book-pts-body');
  tbody.innerHTML = '';
  if (!data.length) { emptyRow(tbody, 6, 'No playthroughs yet.'); return; }

  for (const pt of data) {
    const tr = tbody.insertRow();
    appendCell(tr, `Run ${pt.index}`);
    const uCell = tr.insertCell();
    const uLink = el('span', 'link', pt.username);
    uLink.addEventListener('click', () => loadUserDetail(pt.owner_id));
    uCell.appendChild(uLink);
    appendCell(tr, pt.pathLength,  'muted');
    appendCell(tr, pt.lastSection, 'muted');
    appendCell(tr, fmtDateTime(pt.lastActionAt), 'muted');

    const resultCell = tr.insertCell();
    if (!pt.completed)
      resultCell.appendChild(badge('In progress', 'badge-amber'));
    else if (pt.result === 'death')
      resultCell.appendChild(badge('Lost ✝', 'badge-red'));
    else if (pt.result === 'success')
      resultCell.appendChild(badge('Victory ★', 'badge-green'));
    else if (pt.result === 'battle')
      resultCell.appendChild(badge('Battle Death ⚔', 'badge-amber'));
    else
      resultCell.appendChild(badge('Completed', 'badge-grey'));
  }
}

let _bookDetailData  = null;
let _pendingAdminPdf = null;
let _pendingAdminCover = null;

function _populateBookEditForm(d) {
  document.getElementById('bef-name').value           = d.name || '';
  document.getElementById('bef-sections').value       = d.total_sections || '';
  document.getElementById('bef-isbn').value           = d.isbn || '';
  document.getElementById('bef-asin').value           = d.asin || '';
  document.getElementById('bef-issn').value           = d.issn || '';
  document.getElementById('bef-pages').value          = d.pages || '';
  document.getElementById('bef-authors').value        = d.authors || '';
  document.getElementById('bef-description').value    = d.description || '';
  document.getElementById('bef-public').checked       = !!d.is_public;
  document.getElementById('bef-container').checked    = !!d.is_container;
  document.getElementById('bef-series').value         = d.series_name || '';
  document.getElementById('bef-series-num').value     = d.series_number || '';
  document.getElementById('bef-order').value          = d.book_order != null ? d.book_order : '';
  document.getElementById('bef-error').textContent    = '';
  document.getElementById('bef-pdf-file').value       = '';
  document.getElementById('bef-cover-file').value     = '';
  document.getElementById('bef-pdf-name').textContent = '';
  _pendingAdminPdf   = null;
  _pendingAdminCover = null;

  // Populate series datalist
  fetch('/api/admin/series').then(r => r.json()).then(series => {
    const dl = document.getElementById('bef-series-list');
    dl.innerHTML = [...series]
      .sort((a, b) => naturalCompare(a.name, b.name))
      .map(s => `<option value="${s.name.replace(/"/g,'&quot;')}">`).join('');
  }).catch(() => {});

  // Populate parent anthology dropdown
  fetch('/api/admin/anthologies').then(r => r.json()).then(books => {
    const sel = document.getElementById('bef-parent');
    sel.innerHTML = '<option value="">- None -</option>';
    [...books]
      .filter(b => b.id !== _currentBookId)
      .sort(naturalCompareByName)
      .forEach(b => {
        const o = document.createElement('option');
        o.value = b.id; o.textContent = b.name;
        if (b.id === d.parent_book_id) o.selected = true;
        sel.appendChild(o);
      });
  }).catch(() => {});

  // Cover
  const coverImg    = document.getElementById('bef-cover-img');
  const coverPh     = document.getElementById('bef-cover-ph');
  const coverRemove = document.getElementById('bef-cover-remove');
  if (d.cover_path) {
    coverImg.src           = `/covers/${d.cover_path}`;
    coverImg.style.display = 'block';
    coverPh.style.display  = 'none';
    coverRemove.style.display = '';
  } else {
    coverImg.src           = '';
    coverImg.style.display = 'none';
    coverPh.style.display  = '';
    coverRemove.style.display = 'none';
  }

  // PDF
  const pdfLink   = document.getElementById('bef-pdf-link');
  const pdfRemove = document.getElementById('bef-pdf-remove');
  if (d.pdf_path) {
    pdfLink.href        = pdfUrl(d.pdf_path);
    pdfLink.textContent = d.pdf_size ? `PDF (${fmtBytes(d.pdf_size)})` : 'Current PDF';
    pdfLink.style.display   = '';
    pdfRemove.style.display = '';
  } else {
    pdfLink.style.display   = 'none';
    pdfRemove.style.display = 'none';
  }
}

document.getElementById('book-edit-btn').addEventListener('click', () => {
  if (!_bookDetailData) return;
  _populateBookEditForm(_bookDetailData);
  document.getElementById('book-edit-form').style.display = '';
  document.getElementById('book-edit-btn').style.display  = 'none';
});

document.getElementById('bef-cancel').addEventListener('click', () => {
  document.getElementById('book-edit-form').style.display = 'none';
  document.getElementById('book-edit-btn').style.display  = '';
});

// Cover upload
document.getElementById('bef-cover-btn').addEventListener('click', () => {
  document.getElementById('bef-cover-file').value = '';
  document.getElementById('bef-cover-file').click();
});
document.getElementById('bef-cover-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  _pendingAdminCover = file;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = document.getElementById('bef-cover-img');
    const ph  = document.getElementById('bef-cover-ph');
    img.src = ev.target.result;
    img.style.display = 'block';
    ph.style.display  = 'none';
    document.getElementById('bef-cover-remove').style.display = '';
  };
  reader.readAsDataURL(file);
});
document.getElementById('bef-cover-remove').addEventListener('click', async () => {
  if (!_currentBookId) return;
  await fetch(`/api/books/${_currentBookId}/cover/delete`, { method: 'POST' }).catch(() => {});
  const img = document.getElementById('bef-cover-img');
  const ph  = document.getElementById('bef-cover-ph');
  img.src = ''; img.style.display = 'none'; ph.style.display = '';
  document.getElementById('bef-cover-remove').style.display = 'none';
  _pendingAdminCover = null;
  if (_bookDetailData) _bookDetailData.cover_path = null;
});

// PDF upload
document.getElementById('bef-pdf-btn').addEventListener('click', () => {
  document.getElementById('bef-pdf-file').value = '';
  document.getElementById('bef-pdf-file').click();
});
document.getElementById('bef-pdf-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  _pendingAdminPdf = file;
  document.getElementById('bef-pdf-name').textContent = file.name;
});
document.getElementById('bef-pdf-remove').addEventListener('click', async () => {
  if (!_currentBookId) return;
  await fetch(`/api/books/${_currentBookId}/pdf`, { method: 'DELETE' });
  document.getElementById('bef-pdf-link').style.display   = 'none';
  document.getElementById('bef-pdf-remove').style.display = 'none';
  document.getElementById('bef-pdf-name').textContent = '';
  _pendingAdminPdf = null;
  if (_bookDetailData) _bookDetailData.pdf_path = null;
});

document.getElementById('bef-save').addEventListener('click', async () => {
  const errEl    = document.getElementById('bef-error');
  const name     = document.getElementById('bef-name').value.trim();
  const isContainer = document.getElementById('bef-container').checked;
  const sections = isContainer ? 0 : parseInt(document.getElementById('bef-sections').value, 10);
  if (!name || (!isContainer && !(sections >= 1))) { errEl.textContent = 'Name and sections are required.'; return; }
  errEl.textContent = '';
  try {
    // Upload cover if pending
    if (_pendingAdminCover) {
      const buf = await _pendingAdminCover.arrayBuffer();
      const cr = await fetch(`/api/books/${_currentBookId}/cover`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buf,
      });
      if (!cr.ok) { errEl.textContent = 'Cover upload failed.'; return; }
    }

    // Save metadata
    const r = await fetch(`/api/books/${_currentBookId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        total_sections:  sections,
        isbn:            document.getElementById('bef-isbn').value.trim() || null,
        asin:            document.getElementById('bef-asin').value.trim() || null,
        issn:            document.getElementById('bef-issn').value.trim() || null,
        pages:           parseInt(document.getElementById('bef-pages').value, 10) || null,
        authors:         document.getElementById('bef-authors').value.trim() || null,
        description:     document.getElementById('bef-description').value.trim() || null,
        is_public:       document.getElementById('bef-public').checked,
        is_container:    isContainer ? 1 : 0,
        series_name:     document.getElementById('bef-series').value.trim() || null,
        series_number:   document.getElementById('bef-series-num').value.trim() || null,
        parent_book_id:  parseInt(document.getElementById('bef-parent').value, 10) || null,
        book_order:      parseInt(document.getElementById('bef-order').value, 10) || null,
      }),
    });
    if (!r.ok) { const j = await r.json(); errEl.textContent = j.error || 'Save failed.'; return; }

    // Upload PDF if pending
    if (_pendingAdminPdf) {
      const buf = await _pendingAdminPdf.arrayBuffer();
      const pr = await fetch(`/api/books/${_currentBookId}/pdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: buf,
      });
      if (!pr.ok) {
        let msg = `PDF upload failed (${pr.status})`;
        try { const j = await pr.json(); if (j.error) msg += `: ${j.error}`; } catch {}
        errEl.textContent = msg; return;
      }
    }

    document.getElementById('book-edit-form').style.display = 'none';
    document.getElementById('book-edit-btn').style.display  = '';
    await loadBookDetail(_currentBookId, _backCtx);
    flashSaved(document.getElementById('book-edit-saved'));
  } catch (e) { errEl.textContent = 'Error: ' + e.message; }
});

export async function loadBookDetail(bookId, backCtx) {
  _currentBookId = bookId;
  _backCtx = backCtx;
  showView('book');

  document.getElementById('book-back-btn').textContent    = '←';
  document.getElementById('book-crumb').innerHTML          = '';
  document.getElementById('book-stats-grid').innerHTML     = '';
  document.getElementById('book-pts-body').innerHTML       = '';
  document.getElementById('book-edit-form').style.display  = 'none';
  document.getElementById('book-edit-btn').style.display   = '';
  document.getElementById('book-pdf-open-btn').style.display = 'none';
  document.getElementById('book-meta-bar').innerHTML        = '';
  document.getElementById('book-pts-meta').textContent     = '';
  document.getElementById('book-ratings-body').innerHTML   = '';
  document.getElementById('book-ratings-meta').textContent = '';

  try {
    const d = await api('GET', `/api/admin/books/${bookId}/stats`);

    document.getElementById('book-back-btn').textContent =
      backCtx && backCtx.view === 'user' ? `← ${d.owner}` : '← Books';

    _bookDetailData = d;

    const crumb = document.getElementById('book-crumb');
    const ownerLink = el('span', 'link', d.owner);
    ownerLink.addEventListener('click', () => loadUserDetail(d.owner_id));
    crumb.appendChild(ownerLink);
    crumb.appendChild(document.createTextNode(' / '));
    crumb.appendChild(el('strong', null, d.name));

    // Meta bar
    const metaBar = document.getElementById('book-meta-bar');

    // Cover thumbnail
    if (d.cover_path) {
      const coverWrap = document.createElement('div');
      coverWrap.style.cssText = 'flex-shrink:0;align-self:center';
      const coverImg = document.createElement('img');
      coverImg.src = `/covers/${d.cover_path}`;
      coverImg.alt = d.name;
      coverImg.style.cssText = 'width:72px;height:96px;object-fit:cover;border-radius:5px;border:1px solid #374151;display:block';
      coverWrap.appendChild(coverImg);
      metaBar.appendChild(coverWrap);
    }

    const metaFields = document.createElement('div');
    metaFields.style.cssText = 'display:flex;gap:2.5rem;flex-wrap:wrap;align-items:flex-start';
    if (d.authors)     addMetaItem(metaFields, 'Author(s)', d.authors);
    if (d.isbn)        addMetaItem(metaFields, 'ISBN',      d.isbn);
    if (d.asin)        addMetaItem(metaFields, 'ASIN',      d.asin);
    if (d.issn)        addMetaItem(metaFields, 'ISSN',      d.issn);
    if (d.pages)       addMetaItem(metaFields, 'Pages',     d.pages);
    addMetaItem(metaFields, 'Public', d.is_public ? 'Yes' : 'No');
    const pdfOpenBtn = document.getElementById('book-pdf-open-btn');
    if (d.pdf_path) {
      pdfOpenBtn.href = pdfUrl(d.pdf_path);
      pdfOpenBtn.style.display = '';
    } else {
      pdfOpenBtn.style.display = 'none';
    }
    if (d.description) addMetaItem(metaFields, 'Description', d.description);
    metaBar.appendChild(metaFields);

    const grid = document.getElementById('book-stats-grid');
    addStatCard(grid, 'Total Sections', d.total_sections);
    addStatCard(grid, 'Mapped',         d.mapped);
    addStatCard(grid, 'Discovered',     d.discovered);
    addStatCard(grid, 'Total Runs',     d.totalPts);
    addStatCard(grid, 'In Progress',    d.inProgress);
    addStatCard(grid, 'Losses',          d.deaths);
    addStatCard(grid, 'Victories',      d.victories);

    document.getElementById('book-pts-meta').textContent =
      `${d.totalPts} run${d.totalPts !== 1 ? 's' : ''}`;

    // Add sort key for result column
    for (const pt of d.playthroughs) {
      pt.resultOrder = !pt.completed ? 0 : pt.result === 'death' ? 1 : 2;
    }

    storeData('pts', d.playthroughs);
    renderPtsTable(getSorted('pts'));

    loadBookRatings(bookId);
  } catch (e) { console.error('Book detail:', e); }
}

export async function loadBookRatings(bookId) {
  const tbody = document.getElementById('book-ratings-body');
  const meta  = document.getElementById('book-ratings-meta');
  try {
    const ratings = await api('GET', `/api/admin/books/${bookId}/ratings`);
    meta.textContent = `${ratings.length} vote${ratings.length !== 1 ? 's' : ''}`;
    tbody.innerHTML = '';
    if (!ratings.length) { emptyRow(tbody, 4, 'No ratings yet.'); return; }
    for (const r of ratings) {
      const tr = tbody.insertRow();
      const uCell = tr.insertCell();
      const uLink = el('span', 'link', r.username);
      uLink.addEventListener('click', () => loadUserDetail(r.user_id));
      uCell.appendChild(uLink);
      appendCell(tr, r.rating % 1 === 0 ? r.rating.toFixed(1) : r.rating, 'muted');
      appendCell(tr, fmtDateTime(r.updated_at), 'muted');
      const actCell = tr.insertCell();
      const delBtn = mkBtn('Delete', 'btn-danger', () => {
        showConfirm(
          `Delete ${r.username}'s rating of ${r.rating % 1 === 0 ? r.rating.toFixed(1) : r.rating} stars?`,
          async () => {
            await api('DELETE', `/api/admin/books/${bookId}/ratings/${r.user_book_id}`);
            loadBookRatings(bookId);
          }
        );
      });
      actCell.appendChild(delBtn);
    }
  } catch (e) { console.error('Book ratings:', e); }
}

// ── Confirm actions ───────────────────────────────────────────────────────────

function confirmClearSessions(id, username) {
  showConfirm(
    `Clear all sessions for "${username}"? They will be logged out of all devices.`,
    async () => {
      await api('POST', `/api/admin/users/${id}/clear-sessions`);
      if (document.getElementById('view-user').style.display !== 'none')
        loadUserDetail(id);
      else
        loadAll();
    },
    { label: 'Clear', variant: 'warn' },
  );
}

function confirmDeleteUser(id, username) {
  showConfirm(
    `Delete user "${username}"? This permanently removes the account and all their books.`,
    async () => {
      await api('DELETE', `/api/admin/users/${id}`);
      showView('main'); loadAll();
    },
    { label: 'Delete', variant: 'danger' },
  );
}

export function confirmDeleteBook(id, name, returnUserId) {
  showConfirm(
    `Delete "${name}"? All progress and run history will be lost.`,
    async () => {
      const res = await fetch(`/api/admin/books/${id}`, { method: 'DELETE' });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (r?.error === 'has_readers') {
          const who = r.names?.join(', ') || '';
          showAlert(`Cannot delete - ${r.count} reader(s) still have this book: ${who}. Remove it from their libraries first.`);
        } else {
          showAlert(`Delete failed: ${r?.error || res.status}`);
        }
        return;
      }
      if (returnUserId) loadUserDetail(returnUserId);
      else { showView('main'); loadAll(); }
    },
    { label: 'Delete', variant: 'danger' },
  );
}

// ── Self-wiring (sort headers + Books search) ─────────────────────────────────

initSortHeaders('users',  renderUsersTable);
initSortHeaders('books',  renderBooksTable);
initSortHeaders('ubooks', data => renderUserBooksTable(data, _currentUserId));
initSortHeaders('pts',    renderPtsTable);

setSearchFields('books', ['name', 'owner']);
wireTableSearch('books', 'books-search', 'books-search-clear', renderBooksTable);
