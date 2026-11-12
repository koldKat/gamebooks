// Render the same compact, grouped statistics in public and private profiles.
import { escapeHtml } from '../core/util.js';
import { t } from '../i18n.js';

export function profileStatsHtml(data) {
  const row = (label, value, tone = '') => `<div class="pub-stat ${tone}"><span>${escapeHtml(label.charAt(0).toLocaleUpperCase() + label.slice(1))}</span><span class="pub-stat-val">${escapeHtml(String(value))}</span></div>`;
  const winRate = (wins, total) => total > 0 ? `${(100 * wins / total).toFixed(1)}%` : '-';
  const group = (title, rows) => `<section class="profile-stat-group"><h4>${escapeHtml(title)}</h4>${rows.join('')}</section>`;
  return [
    group(t('profile.stats.library'), [
      row(t('pub.stat.books_suffix'), data.totalBooks),
      row(t('pub.stat.books_played'), data.booksPlayed),
      row(t('pub.stat.created_suffix'), data.createdBooks ?? 0),
      row(t('profile.stats.books_won'), data.booksWon ?? 0, 'pub-stat-win'),
      row(t('profile.stats.collectibles'), data.collectiblesCollected ?? 0),
    ]),
    group(t('profile.stats.runs'), [
      row(t('pub.stat.runs'), data.totalRuns),
      row(t('pub.stat.wins'), data.wins, 'pub-stat-win'),
      row(t('pub.stat.losses'), data.losses, 'pub-stat-death'),
      ...(data.battles > 0 ? [row(t('pub.stat.battle_deaths'), data.battles, 'pub-stat-battle')] : []),
      row(t('profile.stats.win_rate'), winRate(data.wins, data.totalRuns)),
    ]),
    group(t('profile.stats.simulator'), [
      row(t('profile.stats.fought'), data.simBattlesFought ?? 0),
      row(t('pub.stat.wins'), data.simBattlesWon ?? 0, 'pub-stat-win'),
      row(t('pub.stat.losses'), data.simBattlesLost ?? 0, 'pub-stat-death'),
      row(t('profile.stats.win_rate'), winRate(data.simBattlesWon ?? 0, data.simBattlesFought ?? 0)),
    ]),
    group(t('profile.stats.ratings'), [
      row(t('profile.ratings_given').replace(/:$/, ''), data.ratingsGiven ?? 0),
      row(t('profile.average_rating').replace(/:$/, ''), data.averageRating == null ? '-' : Number(data.averageRating).toFixed(2)),
    ]),
    group(t('profile.stats.exploration'), [
      row(t('profile.stats.discovered'), data.sectionsDiscovered ?? 0),
      row(t('profile.stats.visited'), data.sectionsVisited ?? 0),
    ]),
  ].join('');
}
