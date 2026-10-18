import { escapeHtml } from '../core/util.js';
import { t } from '../i18n.js';

export const FEED_FILTERS = ['runs', 'achievements', 'catalog', 'news', 'ratings', 'library', 'players'];

const categories = new Map([
  ...['book_created', 'series_created'].map(type => [type, 'catalog']),
  ...['book_added', 'series_added'].map(type => [type, 'library']),
  ...['run_started', 'run_completed', 'series_run_started', 'series_run_completed'].map(type => [type, 'runs']),
  ...['level_up', 'all_visited', 'all_discovered', 'first_win', 'first_loss', 'first_battle_death',
    'won_all_series', 'won_all_anthology', 'visit_all_series', 'discover_all_series',
    'visit_all_anthology', 'discover_all_anthology'].map(type => [type, 'achievements']),
  ...['book_rated', 'series_rated'].map(type => [type, 'ratings']),
  ...['user_joined', 'party_formed'].map(type => [type, 'players']),
  ['announcement', 'news'],
]);

export function filterFeedEntries(entries, disabled) {
  return entries.filter(entry => !disabled.has(categories.get(entry.type)));
}

export function feedHeaderHtml(canFilter, disabled) {
  const heading = `${t('feed.header')} <span class="feed-header-sub">${t('feed.header_sub')}</span>`;
  if (!canFilter) return `<div id="feed-header">${heading}</div>`;
  const buttons = FEED_FILTERS.map(key => `<button type="button" class="feed-filter-btn" data-feed-filter="${key}" aria-pressed="${!disabled.has(key)}">${escapeHtml(t('feed.filter.' + key))}</button>`).join('');
  return `<div id="feed-header" class="feed-header--filters"><span class="feed-header-label">${heading}</span><div class="feed-filters" role="group" aria-label="${escapeHtml(t('feed.filter.label'))}">${buttons}</div></div>`;
}

export function bindFeedFilters(root, toggle) {
  root.querySelectorAll('[data-feed-filter]').forEach(button => {
    button.addEventListener('click', () => toggle(button.dataset.feedFilter));
  });
}
