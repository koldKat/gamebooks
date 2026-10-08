import { _isMobile } from './helpers.js';
import { booksState } from './state.js';
import { _patchCachedBook } from './data.js';
import { isDemoMode } from '../core/state.js';
import { t } from '../i18n.js';
import { escapeHtml } from '../core/util.js';

// ── Star rating helpers ───────────────────────────────────────────────────────
export function _starsHtml(rating) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    const cls = rating >= i ? 'star on' : rating >= i - 0.5 ? 'star half' : 'star';
    html += `<span class="${cls}" data-pos="${i}">★</span>`;
  }
  return html;
}

export function _starLabelHtml(avgRating, voteCount, noun = 'book') {
  if (!avgRating || !voteCount) return `<span class="star-avg-none">Rate this ${noun}</span>`;
  const avg = Number.isInteger(avgRating) ? avgRating + '.0' : avgRating.toFixed(1);
  return `<span class="star-avg">${avg}</span><span class="star-votes"> (${voteCount} vote${voteCount !== 1 ? 's' : ''})</span>`;
}

export function _flashRatingGate(widget, msg) {
  const lbl = widget?.querySelector('.star-label');
  if (!lbl) return;
  const prev = lbl.innerHTML;
  lbl.innerHTML = `<span class="rating-gate-msg">${msg}</span>`;
  setTimeout(() => { if (lbl.querySelector('.rating-gate-msg')) lbl.innerHTML = prev; }, 3000);
}

// ── Book item HTML ────────────────────────────────────────────────────────────
export function _hasBattleSim(b) {
  if (b.has_battle_sim) return true;
  return !!(b.is_container && (booksState._cachedBooks || []).some(c => c.parent_book_id === b.id && c.has_battle_sim));
}

export function _hasLiveReading(b) {
  if (b.hasLiveReading) return true;
  return !!(b.is_container && (booksState._cachedBooks || []).some(c => c.parent_book_id === b.id && c.hasLiveReading));
}

export function _pdfBadgeHtml(pdfPath, isAdmin) {
  if (!pdfPath || !isAdmin) return '';
  return `<span class="book-pdf-badge" data-tooltip="${escapeHtml(t('books.has_pdf'))}"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span>`;
}

export function _epubBadgeHtml(epubPath, canShow) {
  if (!epubPath || !canShow) return '';
  return `<span class="book-epub-badge" data-tooltip="${escapeHtml(t('books.has_epub'))}"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg></span>`;
}

// Patch all rendered copies and the cache after PDF changes, without rebuilding the library.
export function _syncPdfBadgeOnCards(bookId, pdfPath, pdfSize = null) {
  _patchCachedBook(bookId, { pdf_path: pdfPath, pdf_size: pdfSize });
  const isAdmin = booksState._hooks.getIsAdmin?.() ?? false;
  document.querySelectorAll(`.book-item[data-id="${bookId}"]`).forEach(card => {
    if (pdfPath) card.setAttribute('data-pdf', pdfPath); else card.removeAttribute('data-pdf');
    if (pdfSize != null) card.setAttribute('data-pdf-size', String(pdfSize)); else card.removeAttribute('data-pdf-size');
    card.querySelector('.book-pdf-badge')?.remove();
    if (!pdfPath) return;
    const badge = _pdfBadgeHtml(pdfPath, isAdmin);
    if (!badge) return;
    // Keep the badge order from _bookItemHtml: ..., pdf, active-run badge.
    const activeBadge = card.querySelector('.book-active-run-badge');
    if (activeBadge) activeBadge.insertAdjacentHTML('beforebegin', badge);
    else card.querySelector('.book-name-row')?.insertAdjacentHTML('beforeend', badge);
  });
}

// Patch all rendered copies and the cache after EPUB changes, without rebuilding the library.
export function _syncEpubBadgeOnCards(bookId, epubPath, epubSize = null) {
  _patchCachedBook(bookId, { epub_path: epubPath, epub_size: epubSize });
  const canShow = (booksState._hooks.getIsAdmin?.() ?? false) || (booksState._hooks.getHasPdfAccess?.() ?? false);
  document.querySelectorAll(`.book-item[data-id="${bookId}"]`).forEach(card => {
    if (epubPath) card.setAttribute('data-epub', epubPath); else card.removeAttribute('data-epub');
    if (epubSize != null) card.setAttribute('data-epub-size', String(epubSize)); else card.removeAttribute('data-epub-size');
    card.querySelector('.book-epub-badge')?.remove();
    if (!epubPath) return;
    const badge = _epubBadgeHtml(epubPath, canShow);
    if (!badge) return;
    // Keep the badge order from _bookItemHtml: ..., epub, active-run badge.
    const activeBadge = card.querySelector('.book-active-run-badge');
    if (activeBadge) activeBadge.insertAdjacentHTML('beforebegin', badge);
    else card.querySelector('.book-name-row')?.insertAdjacentHTML('beforeend', badge);
  });
}

export function _bookItemHtml(b, isChild, containerExpanded, childCount, aggrStats, isAdmin, containerId = null) {
  const effectiveSections = b.is_container ? (aggrStats?.totalSections || 0) : (b.discoverable_sections ?? b.total_sections);
  const effectiveVisited  = b.is_container ? (aggrStats?.visited || 0)        : b.visited;
  const pct         = effectiveSections > 0
    ? Math.max(0, Math.min(100, (effectiveVisited / effectiveSections) * 100))
    : 0;
  const fullyVisited = effectiveSections > 0 && effectiveVisited >= effectiveSections;
  const barColor    = fullyVisited ? 'rgba(34,197,94,0.25)' : 'rgba(107,114,128,0.28)';
  const bg          = pct > 0 ? `background: linear-gradient(to right, ${barColor} ${pct}%, transparent ${pct}%);` : `background: transparent;`;
  const isCreator   = isDemoMode || b.created_by === null || b.created_by === booksState._currentUserId;
  const inParty     = !!b.party_id;
  const extraClass  = (b.is_container ? ' book-item--container' : (isChild ? ' book-item--child' : '')) + (inParty ? ' book-item--party' : '');
  const experimentalCoverCards = !isDemoMode;
  const ownCoverUrl   = b.cover_path ? `/covers/${b.cover_path}` : '';
  // Inherit the cover from the rendered anthology, not always the primary parent.
  const effectiveContainerId = containerId ?? b.parent_book_id;
  const parentContainer = isChild && effectiveContainerId ? (booksState._cachedBooks || []).find(x => x.id === effectiveContainerId && x.is_container) : null;
  const anthologyCoverUrl = isChild && parentContainer?.cover_path ? `/covers/${parentContainer.cover_path}` : '';
  const coverUrl      = anthologyCoverUrl || ownCoverUrl;
  const flowCoverUrl  = b.is_container ? ownCoverUrl : anthologyCoverUrl;
  const coverCardClass  = experimentalCoverCards && coverUrl ? ' book-item--coverbg' : '';
  const expandedAttr    = b.is_container ? ` data-expanded="${containerExpanded ? '1' : '0'}"` : '';
  const containerIdAttr = b.is_container ? ` data-container-id="${b.id}"` : '';
  const anthologyFlowAttr = flowCoverUrl ? ` data-anthology-cover-url="${escapeHtml(flowCoverUrl)}"` : '';
  const commonAttrs =
    ` data-id="${b.id}" data-name="${escapeHtml(b.name)}"` +
    ` data-sections="${b.total_sections}" data-max-section="${b.max_section_number ?? ''}" data-isbn="${escapeHtml(b.isbn || '')}" data-issn="${escapeHtml(b.issn || '')}" data-asin="${escapeHtml(b.asin || '')}"` +
    ` data-cover="${escapeHtml(b.cover_path ? `/covers/${b.cover_path}` : '')}" data-pdf="${escapeHtml(b.pdf_path || '')}"` +
    ` data-pdf-size="${escapeHtml(String(b.pdf_size ?? ''))}"` +
    ` data-epub="${escapeHtml(b.epub_path || '')}" data-epub-size="${escapeHtml(String(b.epub_size ?? ''))}"` +
    (effectiveContainerId && !b.cover_path ? (() => { const p = booksState._cachedBooks?.find(x => x.id === effectiveContainerId); return p?.cover_path ? ` data-parent-cover="${escapeHtml(`/covers/${p.cover_path}`)}"` : ''; })() : '') +
    ` data-pages="${escapeHtml(String(b.pages || ''))}" data-authors="${escapeHtml(b.authors || '')}" data-description="${escapeHtml(b.description || '')}"` +
    ` data-discoverable="${b.discoverable_sections ?? ''}" data-public="${b.is_public ? '1' : '0'}"` +
    ` data-series="${escapeHtml(b.series_name || '')}" data-series-num="${escapeHtml(b.series_number || '')}"` +
    ` data-is-container="${b.is_container ? '1' : '0'}" data-parent-id="${b.parent_book_id ?? ''}" data-book-order="${b.book_order ?? ''}"`;
  const subtitle = b.is_container
    ? `<span class="book-sections">${childCount === 1 ? '1 book' : `${childCount} books`}${effectiveSections > 0 ? ` · ${effectiveSections} sections` : ''}${b.pages ? ` · <span class="book-isbn">${escapeHtml(String(b.pages))} pages</span>` : ''}</span>`
    : `<span class="book-sections">${t('books.sections', { n: b.total_sections })}${b.pages ? ` · <span class="book-isbn">${escapeHtml(String(b.pages))} pages</span>` : ''}</span>`;
  const activeHere = !b.is_container && booksState._activeSeriesRuns.find(ar => ar.last_book_id === b.id);
  const activeBadge = activeHere
    ? `<span class="book-active-run-badge" data-tooltip="${escapeHtml(`Series run ${activeHere.run_index + 1} active here${activeHere.last_section ? ` at ${activeHere.last_section}` : ''}`)}">▶ Run ${activeHere.run_index + 1}</span>`
    : '';
  const openWorldBadge = b.isOpenWorld
    ? `<span class="book-open-world-badge" data-tooltip="${escapeHtml(t('covers.open_world_book'))}"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span>`
    : '';
  const battleSimBadge = _hasBattleSim(b)
    ? `<span class="book-battlesim-badge" data-tooltip="${escapeHtml(t('covers.has_battle_sim'))}"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/><line x1="4" y1="4" x2="8" y2="4"/><line x1="4" y1="4" x2="4" y2="8"/><line x1="20" y1="4" x2="16" y2="4"/><line x1="20" y1="4" x2="20" y2="8"/></svg></span>`
    : '';
  const liveReadingBadge = _hasLiveReading(b)
    ? `<span class="book-livereading-badge" data-tooltip="${escapeHtml(t('covers.has_live_reading'))}"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H2z"/><path d="M22 4h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z"/></svg></span>`
    : '';
  // PDF presence is private metadata - only advertise it on the card for
  // admins (the play-area PDF link itself is gated separately via pdfAccess).
  const pdfBadge = _pdfBadgeHtml(b.pdf_path, isAdmin);
  const epubBadge = _epubBadgeHtml(b.epub_path, isAdmin || (booksState._hooks.getHasPdfAccess?.() ?? false));
  let cardStyle      = bg;
  let pendingCoverAttr = '';
  if (experimentalCoverCards && coverUrl) {
    const progressLayer = pct > 0
      ? `linear-gradient(to right, ${barColor} ${pct}%, transparent ${pct}%)`
      : `linear-gradient(to right, transparent 0%, transparent 100%)`;
    cardStyle =
      `background-image:${progressLayer},linear-gradient(to right, rgba(17,24,39,0.96) 0%, rgba(17,24,39,0.92) 54%, rgba(17,24,39,0.72) 74%, rgba(17,24,39,0.4) 100%),var(--bci,none);` +
      `background-size:auto,auto,var(--book-card-cover-size,100% auto);` +
      `background-position:0 0,0 0,var(--book-card-cover-position,center center);` +
      `background-repeat:no-repeat,no-repeat,var(--bk-cover-repeat,no-repeat);`;
    pendingCoverAttr = ` data-pending-cover="${escapeHtml(coverUrl)}"`;
  }
  return `<div class="book-item${extraClass}${coverCardClass}"${expandedAttr}${containerIdAttr}${anthologyFlowAttr}${pendingCoverAttr} style="${cardStyle}">` +
    `<div class="book-info">` +
      `<div class="book-name-row">` +
        `<span class="book-name-text" data-id="${b.id}" data-name="${escapeHtml(b.name)}" data-tooltip="${escapeHtml(b.name)}">${escapeHtml(b.name)}</span>` +
        openWorldBadge + battleSimBadge + liveReadingBadge + pdfBadge + epubBadge +
        activeBadge +
      `</div>` +
      subtitle +
      `<div class="book-rating-row star-rating" data-book-id="${b.id}" data-user-rating="${b.userRating ?? ''}">` +
        _starsHtml(b.avgRating) +
        `<span class="star-label">${_starLabelHtml(b.avgRating, b.voteCount)}</span>` +
      `</div>` +
    `</div>` +
    `<div class="book-actions">` +
      (!b.is_container
        ? (_isMobile() && !b.hasLiveReading
            ? `<span data-tooltip="${escapeHtml(t('mobile.no_reading_tooltip'))}" style="display:inline-flex">` +
                `<button class="book-open-btn primary-btn" disabled${commonAttrs} data-creator="${isCreator ? '1' : '0'}">${t('books.open')}</button>` +
              `</span>`
            : `<button class="book-open-btn primary-btn"${commonAttrs} data-creator="${isCreator ? '1' : '0'}">${t('books.open')}</button>`)
        : '') +
      `<div class="book-secondary-actions">` +
        (!isCreator && !isAdmin
          ? `<span data-tooltip="Only the book creator can edit metadata" style="display:inline-flex">` +
              `<button class="book-edit-btn" disabled${commonAttrs}>✎</button>` +
            `</span>`
          : `<button class="book-edit-btn${!isCreator && isAdmin ? ' book-edit-btn--admin' : ''}"${commonAttrs}${!isCreator && isAdmin ? ' data-tooltip="Admin edit"' : ''}>✎</button>`
        ) +
        `<button class="book-del-btn" data-id="${b.id}" data-name="${escapeHtml(b.name)}" data-container="${b.is_container ? '1' : '0'}">✕</button>` +
      `</div>` +
    `</div>` +
  `</div>`;
}
