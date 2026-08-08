// ── Stats for nerds ────────────────────────────────────────────────────────────
// Self-contained module. Imports only from util.js. Fetches /api/site-stats and renders it.
// To remove: delete this file, remove its import line and initStats()/closeStatsModal()
// calls from boot.js, and remove the stats-modal CSS from style.css.

import { escapeHtml, fetchPublic } from './util.js?v=54';
import { t } from './i18n.js?v=44';

export function closeStatsModal() {
  document.getElementById('stats-modal-overlay').classList.remove('active');
}

export async function openStatsModal() {
  const overlay = document.getElementById('stats-modal-overlay');
  const body    = document.getElementById('stats-modal-body');
  body.innerHTML = `<p class="stats-loading">${t('stats.loading')}</p>`;
  overlay.classList.add('active');
  try {
    const res  = await fetchPublic('/api/site-stats');
    if (!res.ok) throw new Error('Failed to load stats');
    const s    = await res.json();
    const fmtAvgLevel = n => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    // K/M/B/T… with decimal places increasing per tier (K=1, M=2, B=3, T=4…) so
    // bigger numbers keep roughly the same precision instead of losing more digits.
    const COMPACT_SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
    const fmtCompact = n => {
      n = Number(n) || 0;
      const neg = n < 0;
      let v = Math.abs(n);
      let tier = 0;
      while (v >= 1000 && tier < COMPACT_SUFFIXES.length - 1) { v /= 1000; tier++; }
      // Rounding can push e.g. 999.999 -> "1000.0" at the current tier - bump to
      // the next tier when that happens so we never show a 4-digit leading value.
      if (tier > 0 && tier < COMPACT_SUFFIXES.length - 1 && Number(v.toFixed(tier)) >= 1000) {
        v /= 1000;
        tier++;
      }
      const str = tier === 0 ? Math.round(v).toLocaleString() : v.toFixed(tier);
      return (neg ? '-' : '') + str + COMPACT_SUFFIXES[tier];
    };
    // Every plain count in this modal switches to the compact K/M/B/T form once
    // it crosses 10,000, so any stat that grows large stays readable - not just
    // the handful of fields we know run high today.
    const fmt = n => {
      const num = Number(n) || 0;
      return Math.abs(num) >= 10000 ? fmtCompact(num) : num.toLocaleString();
    };
    const pct  = (n, d) => d > 0 ? ` <span class="stats-pct">(${n >= d ? 100 : Math.min(99, Math.floor(n / d * 100))}%)</span>` : '';
    const kb   = b => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;
    const fmtBytes = n => {
      if (!n) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
      let i = 0; let v = n;
      while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
      return `${i <= 1 ? Math.round(v) : v.toFixed(Math.max(0, i - 1))} ${units[i]}`;
    };
    const fmtUptime = secs => {
      const s = Math.floor(secs);
      const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
      const parts = [];
      if (d) parts.push(`${d}d`);
      if (d || h) parts.push(`${h}h`);
      parts.push(`${m}m`);
      return parts.join(' ');
    };
    const fmtDuration = mins => {
      const total = Math.max(0, Math.round(Number(mins) || 0));
      const days = Math.floor(total / 1440);
      const hours = Math.floor((total % 1440) / 60);
      const minutes = total % 60;
      const parts = [];
      if (days) parts.push(`${days}d`);
      if (days || hours) parts.push(`${hours}h`);
      parts.push(`${minutes}m`);
      return parts.join(' ');
    };

    const na = t('stats.na');

    const sections = [
      {
        cls: 'players', label: t('stats.sec.players'),
        rows: [
          [t('stats.registered'), fmt(s.users)],
          [t('stats.admins'), fmt(s.admins)],
          [t('stats.authors'), fmt(s.authors)],
          [t('stats.contributors'), fmt(s.contributors)],
          [t('stats.public_profiles'), fmt(s.publicProfiles)],
          [t('stats.with_avatars'), fmt(s.avatarUsers)],
          [t('stats.undos_performed'), fmt(s.undosTotal)],
          [t('stats.fast_travels_performed'), fmt(s.fastTravelsTotal)],
        ],
      },
      {
        cls: 'books', label: t('stats.sec.books'),
        rows: [
          [t('stats.unique_books'), fmt(s.uniqueBooks)],
          [t('stats.unique_authors'), fmt(s.uniqueAuthors)],
          [t('stats.total_in_libraries'), fmt(s.totalUserBooks)],
          [t('stats.public'), fmt(s.publicBooks)],
          [t('stats.private'), fmt(s.privateBooks)],
          [t('stats.unique_series'), fmt(s.uniqueSeries)],
          [t('stats.series_in_libraries'), fmt(s.totalUserSeries)],
          [t('stats.public_series'), fmt(s.publicSeries)],
          [t('stats.private_series'), fmt(s.privateSeries)],
          [t('stats.unique_anthologies'), fmt(s.uniqueAnthologies)],
          [t('stats.anthologies_in_libraries'), fmt(s.totalUserAnthologies)],
          [t('stats.public_anthologies'), fmt(s.publicAnthologies)],
          [t('stats.private_anthologies'), fmt(s.privateAnthologies)],
          [t('stats.avg_sections_per_book'), fmt(s.avgSections)],
          [t('stats.total_pages'), fmt(s.totalPages)],
          [t('stats.avg_pages_per_book'), fmt(s.avgPages)],
          [t('stats.total_sections'), fmt(s.totalSections)],
          [t('stats.mapped_sections'), fmt(s.mappedSections) + pct(s.mappedSections, s.totalSections)],
          [t('stats.discovered_sections'), fmt(s.discoveredSections) + pct(s.discoveredSections, s.totalSections)],
          [t('stats.books_fully_visited'), fmt(s.booksFullyVisited) + pct(s.booksFullyVisited, s.uniqueBooks)],
          [t('stats.books_fully_discovered'), fmt(s.booksFullyDiscovered) + pct(s.booksFullyDiscovered, s.uniqueBooks)],
        ],
      },
      {
        cls: 'parties', label: t('stats.sec.parties'),
        rows: [
          [t('stats.parties_created'), fmt(s.partyTotal)],
          [t('stats.active_parties'), fmt(s.partyActive)],
          [t('stats.players_in_parties'), fmt(s.partyUsersTotal)],
          [t('stats.invites_sent'), fmt(s.partyInvites)],
          [t('stats.accepted'), fmt(s.partyInvitesAccepted)],
          [t('stats.declined'), fmt(s.partyInvitesDeclined)],
        ],
      },
      {
        cls: 'gameplay', label: t('stats.sec.gameplay'),
        rows: [
          [t('stats.total_runs'), fmt(s.playthroughs)],
          [t('stats.in_progress'), fmt(s.activePlaythroughs)],
          [t('stats.finished'), fmt(s.finishedPlaythroughs)],
          [t('stats.total_wins'), fmt(s.wins) + pct(s.wins, s.finishedPlaythroughs)],
          [t('stats.total_losses'), fmt(s.deaths) + pct(s.deaths, s.finishedPlaythroughs)],
          [t('stats.total_battle_deaths'), fmt(s.battleCount) + pct(s.battleCount, s.finishedPlaythroughs)],
          [t('stats.public_runs'), fmt(s.publicRuns) + pct(s.publicRuns, s.finishedPlaythroughs)],
          [t('stats.tracked_play_time'), fmtDuration(s.heartbeatMinutes)],
          [t('stats.avg_play_time_per_player'), fmtDuration(s.avgPlayMinutesPerPlayer)],
        ],
      },
      {
        cls: 'xp-progression', label: t('stats.sec.xp'),
        rows: [
          [t('stats.total_xp_earned'), fmt(s.totalXp)],
          [t('stats.app_level'), `${fmt(s.appLevel)} - ${escapeHtml(s.appTitle)}`],
          [t('stats.avg_player_level'), `${fmt(Math.floor(Number(s.avgLevel || 0)))} - ${escapeHtml(s.avgTitle)}`],
          [t('stats.level_ups'), fmt(s.levelUps)],
          [t('stats.xp_event_types'), fmt(s.xpEventTypes)],
          [t('stats.xp_events'), fmt(s.xpEvents)],
        ],
      },
      {
        cls: 'gold-coins-shop', label: t('stats.sec.coins'),
        rows: [
          [t('stats.earned'), fmt(s.totalCoinsEarned)],
          [t('stats.spent'), fmt(s.totalCoinsSpent)],
          [t('stats.in_circulation'), fmt(s.totalCoinsAvailable)],
          [t('stats.upgrades_purchased'), fmt(s.totalUpgrades)],
          [t('stats.upgrade_undo_slots'), fmt(s.upgradeUndos)],
          [t('stats.upgrade_fast_travel_slots'), fmt(s.upgradeFastTravels)],
          [t('stats.upgrade_heartbeat_xp'), fmt(s.upgradeHeartbeatXp)],
          [t('stats.upgrade_xp_boost_pct'), fmt(s.upgradeXpBoosts)],
          [t('stats.upgrade_gc_chance'), fmt(s.upgradeGcChance)],
        ],
      },
      {
        cls: 'ratings', label: t('stats.sec.ratings'),
        rows: [
          [t('stats.total_ratings_given'), fmt(s.ratingsTotal)],
          [t('stats.book_ratings'), fmt(s.bookRatingsCount)],
          [t('stats.anthology_ratings'), fmt(s.anthologyRatingsCount)],
          [t('stats.series_ratings'), fmt(s.seriesRatingsCount)],
          [t('stats.avg_book_rating'), s.bookRatingsAvg ? Number(s.bookRatingsAvg).toFixed(1) + ' / 5' : na],
          ...[...(s.ratingDist || [])].reverse().map(r => [`${'★'.repeat(r.star)}${'☆'.repeat(5 - r.star)}`, fmt(r.n)]),
        ],
      },
      {
        cls: 'forum', label: t('stats.sec.forum'),
        rows: [
          [t('stats.categories'), fmt(s.forumCategories)],
          [t('stats.threads'), fmt(s.forumThreads)],
          [t('stats.pinned_threads'), fmt(s.forumPinnedThreads)],
          [t('stats.posts'), fmt(s.forumPosts)],
        ],
      },
      {
        cls: 'server', label: t('stats.sec.server'),
        rows: [
          [t('stats.cpu_model'), escapeHtml(s.cpuModel || na)],
          [t('stats.cpu_cores'), s.cpuCores != null ? fmt(s.cpuCores) : na],
          [t('stats.cpu_age'), s.cpuAgeYears != null ? `${s.cpuAgeYears}y` : na],
          [t('stats.cpu_clock'), s.cpuGhz != null ? `${s.cpuGhz} GHz` : na],
          [t('stats.cpu_arch'), escapeHtml(s.cpuArch || na)],
          [t('stats.total_ram'), fmtBytes(s.totalRamBytes || 0)],
        ],
      },
      {
        cls: 'the-app', label: t('stats.sec.app'),
        rows: [
          [t('stats.age'), (() => { const d = Math.floor(s.appAgeDays || 0); const y = Math.floor(d / 365); return y > 0 ? `${y}y ${d - y * 365}d` : `${d}d`; })()],
          [t('stats.server_uptime_session'), fmtUptime(s.uptimeSec || 0)],
          [t('stats.total_uptime'), s.totalDowntimeS != null ? fmtUptime(Math.max(0, (s.appAgeDays || 0) * 86400 - s.totalDowntimeS)) : na],
          [t('stats.uptime_pct'), s.uptimePct != null ? `${Number(s.uptimePct).toFixed(2)}%` : na],
          [t('stats.total_downtime'), s.totalDowntimeS != null ? fmtUptime(s.totalDowntimeS) : na],
          [t('stats.lines_of_code'), s.linesOfCode ? fmt(s.linesOfCode) : na],
          [t('stats.code_size'), kb(s.codeBytes || 0)],
          [t('stats.db_size'), kb(s.dbSize || 0)],
          [t('stats.js_modules'), fmt(s.jsModules)],
          [t('stats.traffic_in'), fmtBytes(s.trafficIn || 0)],
          [t('stats.traffic_out'), fmtBytes(s.trafficOut || 0)],
          ...(s.avgSamples > 0 ? [
            [t('stats.avg_cpu_session'), `${s.avgCpu.toFixed(1)}%`],
            [t('stats.avg_heap_used_session'), fmtBytes(s.avgHeapUsed)],
            [t('stats.avg_heap_total_session'), fmtBytes(s.avgHeapTotal)],
            [t('stats.avg_rss_session'), fmtBytes(s.avgRss)],
          ] : []),
        ],
      },
      {
        cls: 'open-world', label: t('stats.sec.ow'),
        rows: [
          [t('stats.ow_series'), fmt(s.owSeries)],
          [t('stats.public'), fmt(s.owPublicSeries) + pct(s.owPublicSeries, s.owSeries)],
          [t('stats.books_in_ow_series'), fmt(s.owBooksTotal)],
          [t('stats.portal_nodes'), fmt(s.owPortals)],
          [t('stats.series_runs'), fmt(s.owRuns)],
          [t('stats.completed'), fmt(s.owRunsCompleted) + pct(s.owRunsCompleted, s.owRuns)],
          [t('stats.public_runs'), fmt(s.owRunsPublic) + pct(s.owRunsPublic, s.owRunsCompleted)],
          [t('stats.pre_series_runs'), fmt(s.owPreSeriesRuns)],
        ],
      },
    ];

    body.innerHTML = sections.map(sec => `
      <div class="stats-section stats-section--${sec.cls}">
        <div class="stats-section-label">${escapeHtml(sec.label)}</div>
        <table class="stats-table">
          ${sec.rows.map(([k, v]) => `<tr><td class="stats-key">${escapeHtml(k)}</td><td class="stats-val">${v}</td></tr>`).join('')}
        </table>
      </div>`).join('');
  } catch {
    body.innerHTML = `<p class="stats-loading">${t('stats.load_failed')}</p>`;
  }
}

export function initStats() {
  document.getElementById('stats-btn').addEventListener('click', openStatsModal);
  document.getElementById('stats-modal-close').addEventListener('click', closeStatsModal);
  let _mdOnOverlay = false;
  const statsOverlay = document.getElementById('stats-modal-overlay');
  statsOverlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === statsOverlay; });
  statsOverlay.addEventListener('click', e => {
    if (e.target === statsOverlay && _mdOnOverlay) closeStatsModal();
  });
}
