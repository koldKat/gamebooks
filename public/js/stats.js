// ── Stats for nerds ────────────────────────────────────────────────────────────
// Self-contained module. Imports only from util.js. Fetches /api/site-stats and renders it.
// To remove: delete this file, remove its import line and initStats()/closeStatsModal()
// calls from boot.js, and remove the stats-modal CSS from style.css.

import { escapeHtml, fetchPublic } from './util.js?v=7';

export function closeStatsModal() {
  document.getElementById('stats-modal-overlay').classList.remove('active');
}

export async function openStatsModal() {
  const overlay = document.getElementById('stats-modal-overlay');
  const body    = document.getElementById('stats-modal-body');
  body.innerHTML = '<p class="stats-loading">Loading…</p>';
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

    const sections = [
      {
        label: 'Players',
        rows: [
          ['Registered', fmt(s.users)],
          ['Admins', fmt(s.admins)],
          ['Authors', fmt(s.authors)],
          ['Contributors', fmt(s.contributors)],
          ['Public profiles', fmt(s.publicProfiles)],
          ['With avatars', fmt(s.avatarUsers)],
          ['Undos performed', fmt(s.undosTotal)],
          ['Fast Travels performed', fmt(s.fastTravelsTotal)],
        ],
      },
      {
        label: 'Books',
        rows: [
          ['Unique books', fmt(s.uniqueBooks)],
          ['Unique authors', fmt(s.uniqueAuthors)],
          ['Total in libraries', fmt(s.totalUserBooks)],
          ['Public', fmt(s.publicBooks)],
          ['Private', fmt(s.privateBooks)],
          ['Unique series', fmt(s.uniqueSeries)],
          ['Series in libraries', fmt(s.totalUserSeries)],
          ['Public series', fmt(s.publicSeries)],
          ['Private series', fmt(s.privateSeries)],
          ['Unique anthologies', fmt(s.uniqueAnthologies)],
          ['Anthologies in libraries', fmt(s.totalUserAnthologies)],
          ['Public anthologies', fmt(s.publicAnthologies)],
          ['Private anthologies', fmt(s.privateAnthologies)],
          ['Avg sections / book', fmt(s.avgSections)],
          ['Total pages', fmt(s.totalPages)],
          ['Avg pages / book', fmt(s.avgPages)],
          ['Total sections', fmt(s.totalSections)],
          ['Mapped sections', fmt(s.mappedSections) + pct(s.mappedSections, s.totalSections)],
          ['Discovered sections', fmt(s.discoveredSections) + pct(s.discoveredSections, s.totalSections)],
          ['Books 100% visited', fmt(s.booksFullyVisited) + pct(s.booksFullyVisited, s.uniqueBooks)],
          ['Books 100% discovered', fmt(s.booksFullyDiscovered) + pct(s.booksFullyDiscovered, s.uniqueBooks)],
        ],
      },
      {
        label: 'Parties',
        rows: [
          ['Parties created', fmt(s.partyTotal)],
          ['Active parties', fmt(s.partyActive)],
          ['Players in parties', fmt(s.partyUsersTotal)],
          ['Invites sent', fmt(s.partyInvites)],
          ['Accepted', fmt(s.partyInvitesAccepted)],
          ['Declined', fmt(s.partyInvitesDeclined)],
        ],
      },
      {
        label: 'Gameplay',
        rows: [
          ['Total runs', fmt(s.playthroughs)],
          ['In progress', fmt(s.activePlaythroughs)],
          ['Finished', fmt(s.finishedPlaythroughs)],
          ['Total wins', fmt(s.wins) + pct(s.wins, s.finishedPlaythroughs)],
          ['Total losses', fmt(s.deaths) + pct(s.deaths, s.finishedPlaythroughs)],
          ['Total battle deaths', fmt(s.battleCount) + pct(s.battleCount, s.finishedPlaythroughs)],
          ['Tracked play time', fmtDuration(s.heartbeatMinutes)],
          ['Avg play time / player', fmtDuration(s.avgPlayMinutesPerPlayer)],
        ],
      },
      {
        label: 'XP & Progression',
        rows: [
          ['Total XP earned', fmt(s.totalXp)],
          ['App level', `${fmt(s.appLevel)} - ${escapeHtml(s.appTitle)}`],
          ['Avg player level', `${fmt(Math.floor(Number(s.avgLevel || 0)))} - ${escapeHtml(s.avgTitle)}`],
          ['Level-ups', fmt(s.levelUps)],
          ['XP event types', fmt(s.xpEventTypes)],
          ['XP events', fmt(s.xpEvents)],
        ],
      },
      {
        label: 'Gold Coins & Shop',
        rows: [
          ['Earned', fmt(s.totalCoinsEarned)],
          ['Spent', fmt(s.totalCoinsSpent)],
          ['In circulation', fmt(s.totalCoinsAvailable)],
          ['Upgrades purchased', fmt(s.totalUpgrades)],
          ['- Undo slots', fmt(s.upgradeUndos)],
          ['- Fast Travel slots', fmt(s.upgradeFastTravels)],
          ['- Heartbeat XP', fmt(s.upgradeHeartbeatXp)],
          ['- XP boost %', fmt(s.upgradeXpBoosts)],
        ],
      },
      {
        label: 'Ratings',
        rows: [
          ['Total ratings given', fmt(s.ratingsTotal)],
          ['Book ratings', fmt(s.bookRatingsCount)],
          ['Anthology ratings', fmt(s.anthologyRatingsCount)],
          ['Series ratings', fmt(s.seriesRatingsCount)],
          ['Avg book rating', s.bookRatingsAvg ? Number(s.bookRatingsAvg).toFixed(1) + ' / 5' : 'n/a'],
          ...[...(s.ratingDist || [])].reverse().map(r => [`${'★'.repeat(r.star)}${'☆'.repeat(5 - r.star)}`, fmt(r.n)]),
        ],
      },
      {
        label: 'Forum',
        rows: [
          ['Categories', fmt(s.forumCategories)],
          ['Threads', fmt(s.forumThreads)],
          ['Pinned threads', fmt(s.forumPinnedThreads)],
          ['Posts', fmt(s.forumPosts)],
        ],
      },
      {
        label: 'Server',
        rows: [
          ['CPU model', escapeHtml(s.cpuModel || 'n/a')],
          ['CPU cores', s.cpuCores != null ? fmt(s.cpuCores) : 'n/a'],
          ['CPU age', s.cpuAgeYears != null ? `${s.cpuAgeYears}y` : 'n/a'],
          ['CPU clock (advertised)', s.cpuGhz != null ? `${s.cpuGhz} GHz` : 'n/a'],
          ['CPU arch', escapeHtml(s.cpuArch || 'n/a')],
          ['Total RAM', fmtBytes(s.totalRamBytes || 0)],
        ],
      },
      {
        label: 'The App',
        rows: [
          ['Age', (() => { const d = Math.floor(s.appAgeDays || 0); const y = Math.floor(d / 365); return y > 0 ? `${y}y ${d - y * 365}d` : `${d}d`; })()],
          ['Server uptime (session)', fmtUptime(s.uptimeSec || 0)],
          ['Total uptime', s.totalDowntimeS != null ? fmtUptime(Math.max(0, (s.appAgeDays || 0) * 86400 - s.totalDowntimeS)) : 'n/a'],
          ['Uptime %', s.uptimePct != null ? `${Number(s.uptimePct).toFixed(2)}%` : 'n/a'],
          ['Total downtime', s.totalDowntimeS != null ? fmtUptime(s.totalDowntimeS) : 'n/a'],
          ['Lines of code', s.linesOfCode ? fmt(s.linesOfCode) : 'n/a'],
          ['Code size', kb(s.codeBytes || 0)],
          ['DB size', kb(s.dbSize || 0)],
          ['JS modules', fmt(s.jsModules)],
          ['Traffic in', fmtBytes(s.trafficIn || 0)],
          ['Traffic out', fmtBytes(s.trafficOut || 0)],
          ...(s.avgSamples > 0 ? [
            ['Avg CPU (session)', `${s.avgCpu.toFixed(1)}%`],
            ['Avg heap used (session)', fmtBytes(s.avgHeapUsed)],
            ['Avg heap total (session)', fmtBytes(s.avgHeapTotal)],
            ['Avg RSS (session)', fmtBytes(s.avgRss)],
          ] : []),
        ],
      },
      {
        label: 'Open World',
        rows: [
          ['Open world series', fmt(s.owSeries)],
          ['Public', fmt(s.owPublicSeries) + pct(s.owPublicSeries, s.owSeries)],
          ['Books in OW series', fmt(s.owBooksTotal)],
          ['Portal nodes', fmt(s.owPortals)],
          ['Series runs', fmt(s.owRuns)],
          ['Completed', fmt(s.owRunsCompleted) + pct(s.owRunsCompleted, s.owRuns)],
          ['Public runs', fmt(s.owRunsPublic) + pct(s.owRunsPublic, s.owRunsCompleted)],
          ['Pre-series runs', fmt(s.owPreSeriesRuns)],
        ],
      },
    ];

    body.innerHTML = sections.map(sec => `
      <div class="stats-section stats-section--${sec.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}">
        <div class="stats-section-label">${sec.label}</div>
        <table class="stats-table">
          ${sec.rows.map(([k, v]) => `<tr><td class="stats-key">${k}</td><td class="stats-val">${v}</td></tr>`).join('')}
        </table>
      </div>`).join('');
  } catch {
    body.innerHTML = '<p class="stats-loading">Failed to load stats.</p>';
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
