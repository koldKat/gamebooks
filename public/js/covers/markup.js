import { _isFavoriteCoverItem, _hasBattleSim, _hasLiveReading, _bottomLeftBadgeCount } from './filters.js';
import { getToken, isDemoMode } from '../state.js';
import { escapeHtml } from '../util.js';
import { t } from '../i18n.js';

// ── Cover thumb HTML ───────────────────────────────────────────────────────────
export function _makeCoverThumbHTML(c) {
  const cls = c.isSeries ? ' cover-thumb--series' : (c.isContainer ? ' cover-thumb--anthology' : '');
  const isFavorite = _isFavoriteCoverItem(c);
  const favBtn = (getToken() && !isDemoMode)
    ? `<button class="cover-fav-btn${isFavorite ? ' is-favorite' : ''}" type="button" data-fav-type="${c.isSeries ? 'series' : 'book'}" data-fav-id="${c.isSeries ? c.entityId : c.id}" data-tooltip="${escapeHtml(isFavorite ? t('covers.remove_from_favorites') : t('covers.add_to_favorites'))}" aria-label="${isFavorite ? t('covers.remove_from_favorites') : t('covers.add_to_favorites')}">${isFavorite ? '★' : '☆'}</button>`
    : '';
  const useSingleSeriesCover = c.isSeries && c.coverSources?.length && c.coverSources.length < 4;
  const attrs = c.isSeries
    ? ` data-series-id="${c.entityId}" data-series-name="${escapeHtml(c.name)}" data-series-book-count="${Number(c.bookCount) || 0}"${c.coverSources?.length ? ` data-series-cover-sources="${escapeHtml(JSON.stringify(c.coverSources))}"` : ''}`
    : ` data-book-id="${c.id}" data-book-name="${escapeHtml(c.name)}"${c.coverUrl ? ` data-cover-url="${escapeHtml(c.coverUrl)}"` : ''}`;
  return `<div class="cover-thumb${cls}"${attrs}>` +
    favBtn +
    (c.isSeries ? `<span class="cover-series-badge">series</span>` : '') +
    (c.isContainer ? `<span class="cover-anthology-badge">anthology</span>` : '') +
    (c.isOpenWorld ? `<span class="cover-open-world-badge" data-tooltip="${escapeHtml(t('covers.open_world_series'))}"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span>` : '') +
    (_hasBattleSim(c) ? `<span class="cover-battlesim-badge" data-tooltip="${escapeHtml(t('covers.has_battle_sim'))}"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/><line x1="4" y1="4" x2="8" y2="4"/><line x1="4" y1="4" x2="4" y2="8"/><line x1="20" y1="4" x2="16" y2="4"/><line x1="20" y1="4" x2="20" y2="8"/></svg></span>` : '') +
    (_hasLiveReading(c) ? `<span class="cover-livereading-badge"${_hasBattleSim(c) ? ' data-badge-offset="1"' : ''} data-tooltip="${escapeHtml(t('covers.has_live_reading'))}"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H2z"/><path d="M22 4h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z"/></svg></span>` : '') +
    (!c.isSeries && c.pdfPath ? `<span class="cover-pdf-badge"${_bottomLeftBadgeCount(c) ? ` data-badge-offset="${_bottomLeftBadgeCount(c)}"` : ''} data-tooltip="${escapeHtml(t('books.has_pdf'))}"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span>` : '') +
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

export function _syncCoverFavoriteButton(btn, isFavorite) {
  if (!btn) return;
  btn.classList.toggle('is-favorite', !!isFavorite);
  btn.textContent = isFavorite ? '★' : '☆';
  const label = isFavorite ? t('covers.remove_from_favorites') : t('covers.add_to_favorites');
  btn.dataset.tooltip = label;
  btn.setAttribute('aria-label', label);
}
