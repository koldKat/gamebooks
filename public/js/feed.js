// feed.js - Activity feed rendering, hover image previews, feed SSE reload

import { getToken, apiFetch } from './state.js?v=13';
import { openPublicProfile, openPublicSeriesRun, openPublicRun } from './public-profile.js?v=85';
import { openCoverActivity, openSeriesActivity } from './covers.js?v=115';
import { escapeHtml } from './util.js?v=61';
import { t } from './i18n.js?v=49';

let _hooks = {};
export function setFeedHooks(h) { _hooks = h || {}; }

// Hides the hover image preview (avatar/cover, wired up per-render further
// down) - shared by the normal mouseleave path and the click guard below.
function _hideFeedPreview() {
  const preview = document.getElementById('feed-img-preview');
  if (!preview) return;
  preview.style.display = 'none';
  preview.classList.remove('feed-img-preview--avatar');
  const previewImg = document.getElementById('feed-img-preview-img');
  const previewFooter = document.getElementById('feed-img-preview-footer');
  const previewLevel = document.getElementById('feed-img-preview-level');
  if (previewImg) previewImg.style.display = 'block';
  if (previewFooter) previewFooter.style.display = 'none';
  if (previewLevel) { previewLevel.textContent = ''; previewLevel.style.display = 'none'; }
  const bar = document.getElementById('feed-img-bar');
  if (bar) {
    bar._loadTimer = clearTimeout(bar._loadTimer);
    bar.style.transition = 'none';
    bar.style.width = '0';
    bar.style.opacity = '0';
  }
}
// Same fix as tooltip.js's own click guard: a hover preview shown right
// before a click opens a new dialog (e.g. clicking a feed avatar/cover to
// open its public profile/activity view) never gets a mouseleave, since the
// pointer doesn't actually leave the element - it stays floating on top of
// whatever just opened until the mouse happens to move again. Module-level
// (registered once, not per feed render) since loadFeed() re-renders the
// feed's own DOM on every SSE update.
document.addEventListener('click', _hideFeedPreview);

// A cheap plain-text run preview for the feed's own won/lost/battle-death
// links, same idea (and same i18n keys) as the one on the public-profile run
// list - not the full vis-network run graph, which is only built on click.
function _runTooltip(e) {
  const parts = [];
  if (e.pathLength) parts.push(t('pub.run_tooltip_sections', { n: e.pathLength, s: e.pathLength === 1 ? '' : 's' }));
  if (e.lastSection != null) parts.push(t('pub.run_tooltip_last', { n: e.lastSection }));
  if (e.completedAt) parts.push(new Date(e.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }));
  return parts.join(' · ');
}

// Negative runIndex = a preSeriesRuns entry (see getFeed() in server/db/feed.js),
// displayed as "run -N" matching play.js's own convention - no +1 offset for
// those, only genuine playthroughs indices (always >= 0) get the +1.
function _runN(runIndex) {
  return runIndex < 0 ? runIndex : runIndex + 1;
}

// first_win/first_loss/first_battle_death share this - "series run N" when the
// completion happened as part of an open-world series run (isSeriesRun, set
// server-side from whether the underlying win_run/death_run/battle_run ref
// was series-scoped), plain "run N" otherwise - matches the wording already
// used for series_run_started/series_run_completed elsewhere in the feed.
function _firstResultRunLabel(e) {
  if (e.runIndex == null) return '';
  const word = e.isSeriesRun ? t('feed.series_run_word') : t('feed.run_word');
  return ` <span class="feed-run">${word} ${_runN(e.runIndex)}</span>`;
}

function _seriesTag(e) {
  return e.seriesIsPublic
    ? `<a href="/series/${e.seriesId}" class="feed-series-tag" data-series-id="${e.seriesId}" data-series-name="${escapeHtml(e.seriesName)}">${escapeHtml(e.seriesName)}</a>`
    : `<span class="feed-series-tag" style="cursor:default">${escapeHtml(e.seriesName)}</span>`;
}

const ANN_COLORS = {
  red: '#f87171', orange: '#fb923c', amber: '#fbbf24', green: '#4ade80',
  teal: '#2dd4bf', blue: '#60a5fa', purple: '#a78bfa', pink: '#f472b6',
};

// [Label](/book/123) is a relative in-app link, not a hardcoded absolute
// domain (this app is served from several domains - koldkat.net, pathmap.net,
// bookplay.net, etc. - a baked-in domain would resolve on the wrong one).
// Rendered without target=_blank; the click-interceptor below already
// resolves it to the current origin correctly since it's relative. Genuine
// external https:// links are untouched and still open in a new tab.
function formatAnnBody(str) {
  return escapeHtml(str)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/__(.+?)__/g,     '<u>$1</u>')
    .replace(/~~(.+?)~~/g,     '<s>$1</s>')
    .replace(/\{color:(red|orange|amber|green|teal|blue|purple|pink)\}(.+?)\{\/color\}/g,
      (_, color, text) => `<span style="color:${ANN_COLORS[color]}">${text}</span>`)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+|\/book\/\d+)\)/g, (_, label, target) =>
      target.startsWith('/')
        ? `<a href="${target}">${label}</a>`
        : `<a href="${target}" target="_blank" rel="noopener noreferrer">${label}</a>`);
}

function _positionFeedPreview(ev) {
  const preview = document.getElementById('feed-img-preview');
  const footer = document.getElementById('feed-img-preview-footer');
  const offset = 14;
  let x = ev.clientX + offset;
  let y = ev.clientY + offset;
  const footerVisible = preview.classList.contains('feed-img-preview--avatar') && footer && footer.style.display !== 'none';
  const previewWidth = Math.max(preview.offsetWidth, footerVisible ? footer.offsetWidth : 0);
  const previewHeight = preview.offsetHeight + (footerVisible ? footer.offsetHeight + 6 : 0);
  if (x + previewWidth  > window.innerWidth)  x = ev.clientX - previewWidth  - offset;
  if (y + previewHeight > window.innerHeight) y = ev.clientY - previewHeight - offset;
  preview.style.left = x + 'px';
  preview.style.top  = y + 'px';
}

function _feedHoverThumbWidth() {
  const thumb = document.querySelector('#covers-grid .cover-thumb');
  const width = Math.round(thumb?.getBoundingClientRect?.().width || 0);
  return width > 0 ? width : 90;
}

// ── Day-card cover backgrounds ──────────────────────────────────────────────
// A day-card is a single fixed box (unlike an anthology stack of separately
// positioned cards), so this only needs the image's true rendered height to
// tile it at natural size - no cross-card offset math like books.js needs.
const _dayCoverMetaCache = new Map();
function _loadDayCoverMeta(url) {
  if (_dayCoverMetaCache.has(url)) return _dayCoverMetaCache.get(url);
  const pending = new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
  _dayCoverMetaCache.set(url, pending);
  return pending;
}

// The flat overlay (see .feed-day-cover-stack::after in style.css) sits above
// the tiles as a plain constant-opacity layer - a top-to-bottom gradient only
// made sense for a short box; on a tall multi-tile stack a ramp would mean
// everything below its own top portion sits at the darkest stop uniformly.
let _lastDayCoverLists = [];

// Recomputes whenever a day-card's *actual rendered size* changes, for
// whatever reason - a CSS-animated panel-collapse transition, a window
// resize, a font finishing its load and reflowing text, a sibling card's
// content shifting this one - rather than trying to enumerate every possible
// cause as its own listener (window resize, fullscreenchange, panel toggle,
// prefs sync... proved to be an incomplete list in practice). ResizeObserver
// fires once per element per actual layout change, already coalesced by the
// browser, so this is the single source of truth; the resize/fullscreenchange/
// panel-toggle hooks below are kept only as immediate nudges for the common
// cases, not load-bearing for correctness.
const _dayCoverResizeObserver = (typeof ResizeObserver !== 'undefined')
  ? new ResizeObserver(() => _scheduleDayCoverRecompute())
  : null;

async function _applyDayCoverFlows(root, dayCoverLists = _lastDayCoverLists) {
  if (document.body.classList.contains('no-feed-day-covers')) return; // toggle off - don't bother loading images just to hide them
  const cards = root.querySelectorAll('.feed-day-card[data-day-index]');
  for (const card of cards) {
    _dayCoverResizeObserver?.observe(card); // no-op if already observed
    const covers = dayCoverLists[Number(card.dataset.dayIndex)];
    const stack = card.querySelector('.feed-day-cover-stack');
    if (!covers?.length || !stack) continue;
    const metas = await Promise.all(covers.map(_loadDayCoverMeta));
    if (metas.every(m => !m?.width || !m?.height)) continue; // every cover failed to load - leave the flat background
    const cardW   = card.offsetWidth;
    const targetH = card.offsetHeight;
    const n = covers.length;

    // Full card width, natural aspect ratio - no stretch, no crop, no
    // shrinking. On a card shorter than one tile's height this still shows
    // exactly one tile (that's just what "full width, real aspect ratio"
    // means for a portrait cover); cycling through several different books
    // only becomes visible once a day has enough entries to need more than
    // one tile's worth of height, same as it would with a single repeated
    // cover.
    const boxes = metas.map(m => (m?.width && m?.height)
      ? { w: cardW, h: Math.round((m.height / m.width) * cardW) }
      : null);

    const tiles = []; // { top, cover, box }
    const pushTile = (top, idx) => { if (boxes[idx]) tiles.push({ top, cover: covers[idx], box: boxes[idx] }); };

    // The most-prominent book's cover sits whole, centered on the card. Above
    // and below it, the day's *other* books fill outward independently on
    // each side, drawing from the same pool of non-center books - with only
    // one other book that pool has a single entry, so both sides naturally
    // land on the same cover; with two or more, each side gets its own
    // continuously-advancing pointer into the pool (offset from the other by
    // half the pool length) so the two sides draw different books from each
    // other rather than mirroring, only repeating once every other book that
    // day has been shown at least once.
    // Center index is usually 0 (the most-prominent book), but if that
    // specific cover failed to load, fall back to whichever book's did load -
    // otherwise the center band would be silently left blank (reserved via
    // anchorH below) with the outward tiling still starting from its edges.
    const centerIdx = boxes[0] ? 0 : boxes.findIndex(b => b);

    const pool = [];
    for (let k = 0; k < n; k++) if (k !== centerIdx) pool.push(k);
    if (pool.length === 0) pool.push(centerIdx); // literally only one book all day - it repeats outward too

    const anchorH = boxes[centerIdx]?.h || targetH;
    let topEdge    = Math.round(targetH / 2 - anchorH / 2);
    let bottomEdge = topEdge;
    pushTile(topEdge, centerIdx);
    bottomEdge += anchorH;

    let downPtr = 0;
    let upPtr   = Math.floor(pool.length / 2);
    let guard   = 0;
    while ((topEdge > 0 || bottomEdge < targetH) && guard < 400) {
      if (bottomEdge < targetH) {
        const idx = pool[downPtr % pool.length]; downPtr++;
        const box = boxes[idx];
        if (box) { pushTile(bottomEdge, idx); bottomEdge += box.h; } else { bottomEdge += 1; }
      }
      if (topEdge > 0) {
        const idx = pool[upPtr % pool.length]; upPtr++;
        const box = boxes[idx];
        if (box) { topEdge -= box.h; pushTile(topEdge, idx); } else { topEdge -= 1; }
      }
      guard++;
    }

    stack.innerHTML = tiles.map(t => {
      const left = Math.round((cardW - t.box.w) / 2);
      return `<div class="feed-day-cover-tile" style="top:${t.top}px;left:${left}px;width:${t.box.w}px;height:${t.box.h}px;background-image:url('${escapeHtml(t.cover)}')"></div>`;
    }).join('');
  }
}

export async function loadFeed() {
  const el = document.getElementById('feed-content');
  if (!el) return;
  try {
    const res              = getToken() ? await apiFetch('/api/feed') : await _hooks.publicFetch?.('/api/feed');
    const { entries, pinned } = await res.json();
    if (getToken()) _hooks.scheduleRewardProfileRefresh?.(150);

    const feedHeaderHtml = `<div id="feed-header">${t('feed.header')} <span class="feed-header-sub">${t('feed.header_sub')}</span></div>`;

    if (!entries.length && !pinned) {
      el.innerHTML = feedHeaderHtml + `<p class="feed-empty">${t('feed.empty')}</p>`;
      return;
    }

    const now       = new Date();
    const todayStr  = now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const yestStr   = yesterday.toDateString();

    function dayLabel(ts) {
      const d = new Date(ts);
      const s = d.toDateString();
      if (s === todayStr)  return t('feed.day_today');
      if (s === yestStr)   return t('feed.day_yesterday');
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    // Register author info from entries
    for (const e of entries) {
      _hooks.registerAuthor?.(e.username, !!e.isAuthor, e.displayName);
      _hooks.registerContributor?.(e.username, !!e.isContributor);
    }

    // Group by day label (already sorted desc)
    const groups = [];
    let lastLabel = null;
    for (const e of entries) {
      const label = dayLabel(e.completedAt);
      if (label !== lastLabel) { groups.push({ label, items: [] }); lastLabel = label; }
      groups[groups.length - 1].items.push(e);
    }

    // All distinct public books active this day, most entries first, for the
    // day-card background bleed - cycled across tiles rather than repeating
    // a single "winner", so a day with several different books played shows
    // more than just one of them. Private books never leak their cover.
    function _dayCovers(items) {
      const counts = new Map(); // bookId -> { n, cover, firstIndex }
      let order = 0;
      for (const e of items) {
        if (!e.bookId || !e.bookIsPublic) continue;
        const cover = e.coverUrl || e.parentCoverUrl;
        if (!cover) continue;
        const cur = counts.get(e.bookId) || { n: 0, cover, firstIndex: order++ };
        cur.n++;
        counts.set(e.bookId, cur);
      }
      return [...counts.values()]
        .sort((a, b) => b.n - a.n || a.firstIndex - b.firstIndex)
        .map(c => c.cover);
    }

    function _makeEntryHtml(x) {
      const { html: b, isParty, extraClass } = renderEntry(x);
      return b ? `<div class="feed-entry${isParty ? ' feed-entry--party' : ''}${extraClass ? ' ' + extraClass : ''}">${b}</div>` : '';
    }

    function renderEntry(e) {
      const isParty = !!(e.usernames && e.usernames.length > 1);
      let extraClass = '';
      let userEl;
      if (isParty) {
        userEl = [...e.usernames].sort((a, b) => a.username.localeCompare(b.username)).map(u => {
          const dn = escapeHtml(_hooks.displayFor?.(u.username) ?? u.username);
          const av = u.avatarUrl ? ` data-avatar="${escapeHtml(u.avatarUrl)}"` : '';
          const level = Number.isFinite(+u.userLevel) ? ` data-user-level="${+u.userLevel}"` : '';
          const userTitle = u.userTitle ? ` data-user-title="${escapeHtml(u.userTitle)}"` : '';
          return u.userPublicProfile
            ? `<button class="feed-user feed-user-pub" data-username="${escapeHtml(u.username)}"${av}${level}${userTitle}>${dn}</button>${_hooks.adminBadge?.(u.username) ?? ''}${_hooks.authorBadge?.(u.username) ?? ''}${_hooks.contributorBadge?.(u.username) ?? ''}`
            : `<span class="feed-user"${av}${level}${userTitle}>${dn}</span>${_hooks.adminBadge?.(u.username) ?? ''}${_hooks.authorBadge?.(u.username) ?? ''}${_hooks.contributorBadge?.(u.username) ?? ''}`;
        }).join('<span class="feed-party-sep">, </span>');
      } else {
        const dn     = escapeHtml(_hooks.displayFor?.(e.username) ?? e.username);
        const user   = escapeHtml(e.username);
        const avatar = e.avatarUrl ? ` data-avatar="${escapeHtml(e.avatarUrl)}"` : '';
        const level  = Number.isFinite(+e.userLevel) ? ` data-user-level="${+e.userLevel}"` : '';
        const userTitle = e.userTitle ? ` data-user-title="${escapeHtml(e.userTitle)}"` : '';
        const badge  = (_hooks.adminBadge?.(e.username) ?? '') + (_hooks.authorBadge?.(e.username) ?? '') + (_hooks.contributorBadge?.(e.username) ?? '');
        userEl = e.userPublicProfile
          ? `<button class="feed-user feed-user-pub" data-username="${user}"${avatar}${level}${userTitle}>${dn}</button>${badge}`
          : `<span class="feed-user"${avatar}${level}${userTitle}>${dn}</span>${badge}`;
      }
      const bookBtn = (id, name) => {
        const collectionTag = e.parentBookName
          ? (e.parentBookIsPublic
              ? ` <a href="/anthology/${e.parentBookId}" class="feed-anthology-tag" data-anthology-id="${e.parentBookId}" data-anthology-name="${escapeHtml(e.parentBookName)}">${escapeHtml(e.parentBookName)}</a>`
              : ` <span class="feed-anthology-tag">${escapeHtml(e.parentBookName)}</span>`)
          : '';
        const seriesTag = e.seriesName && e.seriesId
          ? (e.seriesIsPublic
              ? ` <a href="/series/${e.seriesId}" class="feed-series-tag" data-series-id="${e.seriesId}" data-series-name="${escapeHtml(e.seriesName)}">${escapeHtml(e.seriesName)}${e.seriesNumber ? ' #' + escapeHtml(e.seriesNumber) : ''}</a>`
              : ` <span class="feed-series-tag" style="cursor:default">${escapeHtml(e.seriesName)}${e.seriesNumber ? ' #' + escapeHtml(e.seriesNumber) : ''}</span>`)
          : '';
        const tags = collectionTag + seriesTag;
        if (!e.bookIsPublic) return `<span class="feed-book">${escapeHtml(name)}</span>${tags}`;
        const effectiveCover = e.coverUrl || e.parentCoverUrl || null;
        const cover = effectiveCover ? ` data-cover="${escapeHtml(effectiveCover)}"` : '';
        const parentAttrs = e.parentBookId
          ? ` data-parent-id="${e.parentBookId}" data-parent-name="${escapeHtml(e.parentBookName)}"`
          : '';
        return `<button class="feed-book feed-book-btn" data-book-id="${id}" data-book-name="${escapeHtml(name)}"${cover}${parentAttrs}>${escapeHtml(name)}</button>${tags}`;
      };
      const verbLabel = cls => cls === 'won' ? t('feed.verb.won') : cls === 'died' ? t('feed.verb.died') : t('feed.verb.lost');
      const nounLabel = isContainer => isContainer ? t('feed.noun.anthology') : t('feed.noun.book');

      let html = '';
      if (e.type === 'run_completed') {
        const isWin  = e.result === 'success';
        const isBattle = e.result === 'battle';
        const verbCls = isWin ? 'won' : isBattle ? 'died' : 'lost';
        const verb = verbLabel(verbCls);
        const verbEl = e.runIsPublic
          ? `<button class="feed-verb ${verbCls} feed-verb-pub" data-book-id="${e.bookId}" data-user-id="${e.userId}" data-run-index="${e.runIndex}" data-tooltip="${escapeHtml(_runTooltip(e))}">${verb}</button>`
          : `<span class="feed-verb ${verbCls}">${verb}</span>`;
        html = t('feed.tmpl.run_completed', { user: userEl, verb: verbEl, book: bookBtn(e.bookId, e.bookName), n: _runN(e.runIndex) });
      } else if (e.type === 'book_created') {
        html = t('feed.tmpl.created', { user: userEl, noun: nounLabel(e.isContainer), book: bookBtn(e.bookId, e.bookName) });
        extraClass = 'feed-entry--created';
      } else if (e.type === 'book_added') {
        html = t('feed.tmpl.added', { user: userEl, noun: nounLabel(e.isContainer), book: bookBtn(e.bookId, e.bookName) });
      } else if (e.type === 'series_created') {
        html = t('feed.tmpl.created_series', { user: userEl, series: _seriesTag(e) });
      } else if (e.type === 'series_added') {
        html = t('feed.tmpl.added_series', { user: userEl, series: _seriesTag(e) });
      } else if (e.type === 'series_run_started') {
        // Book first, series shown as its usual attached tag (bookBtn already
        // does this for every other entry type) - never "series" mentioned
        // ahead of the book, which would break the pattern used everywhere
        // else in the feed.
        html = e.bookName
          ? t('feed.tmpl.series_run_started_in', { user: userEl, n: e.runIndex + 1, book: bookBtn(e.bookId, e.bookName) })
          : t('feed.tmpl.series_run_started', { user: userEl, n: e.runIndex + 1, series: _seriesTag(e) });
      } else if (e.type === 'series_run_completed') {
        const isWin    = e.result === 'success';
        const isBattle = e.result === 'battle';
        const verbCls  = isWin ? 'won' : isBattle ? 'died' : 'lost';
        const verb = verbLabel(verbCls);
        const verbEl   = e.runIsPublic
          ? `<button class="feed-verb ${verbCls} feed-verb-pub" data-book-id="${e.seriesId}" data-user-id="${e.userId}" data-run-index="${e.runIndex}" data-series-run="1" data-tooltip="${escapeHtml(_runTooltip(e))}">${verb}</button>`
          : `<span class="feed-verb ${verbCls}">${verb}</span>`;
        html = e.bookName
          ? t('feed.tmpl.series_run_completed_in', { user: userEl, verb: verbEl, n: e.runIndex + 1, book: bookBtn(e.bookId, e.bookName) })
          : t('feed.tmpl.series_run_completed', { user: userEl, verb: verbEl, n: e.runIndex + 1, series: _seriesTag(e) });
      } else if (e.type === 'run_started') {
        html = t('feed.tmpl.run_started', { user: userEl, n: _runN(e.runIndex), book: bookBtn(e.bookId, e.bookName) });
      } else if (e.type === 'user_joined') {
        const tmpl = e.joinTemplate || t('feed.join_default');
        html = tmpl.replace('{name}', userEl);
        extraClass = 'feed-entry--join';
      } else if (e.type === 'level_up') {
        extraClass = 'feed-entry--levelup';
        const abilitySuffix = e.gainedAbility
          ? t('feed.ability_unlocked', { n: e.newAbilityCount })
          : '';
        const lvTmpl = e.levelUpTemplate || t('feed.levelup_default');
        html = lvTmpl
          .replace('{name}',  userEl)
          .replace('{title}', `<span class="feed-title">${escapeHtml(e.levelTitle)}</span>`)
          .replace('{level}', `<span class="feed-level">${e.level}</span>`) + abilitySuffix;
      } else if (e.type === 'all_visited') {
        html = t('feed.tmpl.all_visited', { user: userEl, book: bookBtn(e.bookId, e.bookName) });
      } else if (e.type === 'all_discovered') {
        html = t('feed.tmpl.all_discovered', { user: userEl, book: bookBtn(e.bookId, e.bookName) });
      } else if (e.type === 'first_win') {
        const wonEl = (e.runIsPublic && e.runIndex != null)
          ? `<button class="feed-verb won feed-verb-pub" data-book-id="${e.bookId}" data-user-id="${e.userId}" data-run-index="${e.runIndex}" data-tooltip="${escapeHtml(_runTooltip(e))}">${t('feed.verb.won')}</button>`
          : `<span class="feed-verb won">${t('feed.verb.won')}</span>`;
        const runLabel = _firstResultRunLabel(e);
        html = t('feed.tmpl.first_result', { user: userEl, verb: wonEl, book: bookBtn(e.bookId, e.bookName), run: runLabel, first_time: t('feed.first_time') });
      } else if (e.type === 'first_loss') {
        const verbEl   = (e.runIsPublic && e.runIndex != null)
          ? `<button class="feed-verb lost feed-verb-pub" data-book-id="${e.bookId}" data-user-id="${e.userId}" data-run-index="${e.runIndex}" data-tooltip="${escapeHtml(_runTooltip(e))}">${t('feed.verb.lost')}</button>`
          : `<span class="feed-verb lost">${t('feed.verb.lost')}</span>`;
        const runLabel = _firstResultRunLabel(e);
        html = t('feed.tmpl.first_result', { user: userEl, verb: verbEl, book: bookBtn(e.bookId, e.bookName), run: runLabel, first_time: t('feed.first_time') });
      } else if (e.type === 'first_battle_death') {
        const verbEl   = (e.runIsPublic && e.runIndex != null)
          ? `<button class="feed-verb lost feed-verb-pub" data-book-id="${e.bookId}" data-user-id="${e.userId}" data-run-index="${e.runIndex}" data-tooltip="${escapeHtml(_runTooltip(e))}">${t('feed.verb.fell_in_battle')}</button>`
          : `<span class="feed-verb lost">${t('feed.verb.fell_in_battle')}</span>`;
        const runLabel = _firstResultRunLabel(e);
        html = t('feed.tmpl.first_result', { user: userEl, verb: verbEl, book: bookBtn(e.bookId, e.bookName), run: runLabel, first_time: t('feed.first_time') });
      } else if (e.type === 'won_all_series') {
        html = t('feed.tmpl.won_all', { user: userEl, target: _seriesTag(e) });
      } else if (e.type === 'won_all_anthology') {
        html = t('feed.tmpl.won_all', { user: userEl, target: bookBtn(e.bookId, e.bookName) });
      } else if (e.type === 'visit_all_series') {
        html = t('feed.tmpl.visit_all', { user: userEl, target: _seriesTag(e) });
      } else if (e.type === 'discover_all_series') {
        html = t('feed.tmpl.discover_all', { user: userEl, target: _seriesTag(e) });
      } else if (e.type === 'visit_all_anthology') {
        html = t('feed.tmpl.visit_all', { user: userEl, target: bookBtn(e.bookId, e.bookName) });
      } else if (e.type === 'discover_all_anthology') {
        html = t('feed.tmpl.discover_all', { user: userEl, target: bookBtn(e.bookId, e.bookName) });
      } else if (e.type === 'party_formed') {
        html = t('feed.tmpl.party_formed', { user: userEl, book: bookBtn(e.bookId, e.bookName), together: t('feed.together'), party: t('feed.party_badge') });
      } else if (e.type === 'book_rated') {
        html = t('feed.tmpl.rated', { user: userEl, noun: nounLabel(e.isContainer), book: bookBtn(e.bookId, e.bookName), stars: _hooks.starsHtml?.(e.rating) ?? '' });
        extraClass = 'feed-entry--rated';
      } else if (e.type === 'series_rated') {
        html = t('feed.tmpl.rated_series', { user: userEl, series: _seriesTag(e), stars: _hooks.starsHtml?.(e.rating) ?? '' });
        extraClass = 'feed-entry--rated';
      } else if (e.type === 'announcement') {
        html = `<div class="feed-announcement"><span class="feed-ann-title">${escapeHtml(e.title)}</span><div class="feed-ann-body">${formatAnnBody(e.body)}</div></div>`;
      }
      if (isParty && html && e.type !== 'party_formed') html += ` <span class="feed-party-badge">${t('feed.party_badge')}</span>`;
      return { html, isParty, extraClass };
    }

    const COLLAPSE_THRESHOLD = 6;

    function entryUserKey(e) {
      if (e.usernames && e.usernames.length > 1) {
        return e.usernames.map(u => u.username).sort().join('\x00');
      }
      return e.username || '';
    }

    function renderGroupLabel(firstEntry, k) {
      if (firstEntry.usernames && firstEntry.usernames.length > 1) {
        const sorted = [...firstEntry.usernames].sort((a, b) => a.username.localeCompare(b.username));
        const parts = sorted.map((u, i) => {
            const dn     = escapeHtml(_hooks.displayFor?.(u.username) ?? u.username);
            const badges = (_hooks.adminBadge?.(u.username) ?? '') + (_hooks.authorBadge?.(u.username) ?? '') + (_hooks.contributorBadge?.(u.username) ?? '');
            const comma  = i < sorted.length - 1 ? ',' : '';
            const av     = u.avatarUrl ? ` data-avatar="${escapeHtml(u.avatarUrl)}"` : '';
            const level  = Number.isFinite(+u.userLevel) ? ` data-user-level="${+u.userLevel}"` : '';
            const userTitle = u.userTitle ? ` data-user-title="${escapeHtml(u.userTitle)}"` : '';
            const pub    = u.userPublicProfile ? ` data-username="${escapeHtml(u.username)}" class="feed-user feed-user-pub"` : ` class="feed-user"`;
            return `<span class="feed-group-name"><span${pub}${av}${level}${userTitle}>${dn}</span>${badges}${comma}</span>`;
          });
        return parts.join(' ');
      }
      const dn     = escapeHtml(_hooks.displayFor?.(k) ?? k);
      const badges = (_hooks.adminBadge?.(k) ?? '') + (_hooks.authorBadge?.(k) ?? '') + (_hooks.contributorBadge?.(k) ?? '');
      const av     = firstEntry.avatarUrl ? ` data-avatar="${escapeHtml(firstEntry.avatarUrl)}"` : '';
      const level  = Number.isFinite(+firstEntry.userLevel) ? ` data-user-level="${+firstEntry.userLevel}"` : '';
      const userTitle = firstEntry.userTitle ? ` data-user-title="${escapeHtml(firstEntry.userTitle)}"` : '';
      const pub    = firstEntry.userPublicProfile ? ` data-username="${escapeHtml(k)}" class="feed-user feed-user-pub"` : ` class="feed-user"`;
      return `<span class="feed-group-name"><span${pub}${av}${level}${userTitle}>${dn}</span>${badges}</span>`;
    }

    let collapseId = 0;
    let dayIndex   = 0;

    const JOIN_COLLAPSE_THRESHOLD = 5;

    function renderDayItems(items) {
      const thisDayIndex = dayIndex++;
      const skipTypes = new Set(['level_up', 'user_joined', 'book_rated', 'series_rated', 'book_created']);
      const userCounts = new Map();
      for (const e of items) {
        if (skipTypes.has(e.type)) continue;
        const k = entryUserKey(e);
        userCounts.set(k, (userCounts.get(k) || 0) + 1);
      }

      const joinItems = items.filter(e => e.type === 'user_joined');
      const collapseJoins = joinItems.length >= JOIN_COLLAPSE_THRESHOLD;
      let joinGroupRendered = false;

      const rendered = new Set();
      let out = '';
      for (const e of items) {
        if (e.type === 'level_up' || e.type === 'book_rated' || e.type === 'series_rated' || e.type === 'book_created') {
          // Always its own standalone entry - never merged into a same-user
          // collapse group, even if that user has enough other actions today
          // to trigger one (grouping keys purely on username, so without this
          // explicit bypass a rating would get swept into an unrelated group
          // of e.g. run_completed entries, or silently dropped if that group
          // was already rendered).
          const { html: body, isParty, extraClass } = renderEntry(e);
          if (body) out += `<div class="feed-entry${isParty ? ' feed-entry--party' : ''}${extraClass ? ' ' + extraClass : ''}">${body}</div>`;
          continue;
        }
        if (e.type === 'user_joined') {
          if (collapseJoins) {
            if (joinGroupRendered) continue;
            joinGroupRendered = true;
            const id = `feed-collapse-${collapseId++}`;
            const preview = joinItems.slice(0, 2).map(_makeEntryHtml).join('');
            const rest    = joinItems.slice(2).map(_makeEntryHtml).join('');
            out += `<div class="feed-user-group feed-user-group--joins">`;
            out += `<button class="feed-group-toggle" data-target="${id}" data-group-key="${escapeHtml(thisDayIndex + ':__joins')}" aria-expanded="false">`;
            out += `<span class="feed-group-chevron">▶</span><span class="feed-group-name">${t('feed.new_adventurers')}</span><span class="feed-group-count">${t('feed.joined_today', { n: joinItems.length })}</span>`;
            out += `</button>`;
            out += `<div class="feed-group-body" id="${id}" hidden>${preview}${rest}</div>`;
            out += `</div>`;
            continue;
          }
          const { html: body, isParty, extraClass } = renderEntry(e);
          if (body) out += `<div class="feed-entry${isParty ? ' feed-entry--party' : ''}${extraClass ? ' ' + extraClass : ''}">${body}</div>`;
          continue;
        }
        const k = entryUserKey(e);
        if (userCounts.get(k) >= COLLAPSE_THRESHOLD) {
          if (rendered.has(k)) continue;
          rendered.add(k);
          const userItems = items.filter(x => !skipTypes.has(x.type) && entryUserKey(x) === k);
          const id = `feed-collapse-${collapseId++}`;
          const preview = userItems.slice(0, 2).map(_makeEntryHtml).join('');
          const rest    = userItems.slice(2).map(_makeEntryHtml).join('');
          const isPartyGroup = !!(e.usernames && e.usernames.length > 1);
          const label = renderGroupLabel(e, k);
          const partyTag = isPartyGroup ? ' <span class="feed-party-badge">party</span>' : '';
          out += `<div class="feed-user-group${isPartyGroup ? ' feed-user-group--party' : ''}">`;
          out += `<button class="feed-group-toggle" data-target="${id}" data-group-key="${escapeHtml(thisDayIndex + ':' + k)}" aria-expanded="false">`;
          out += `<span class="feed-group-chevron">▶</span>${label}<span class="feed-group-count">${t('feed.actions_today', { n: userItems.length })}</span>${partyTag}`;
          out += `</button>`;
          out += `<div class="feed-group-body" id="${id}" hidden>${preview}${rest}</div>`;
          out += `</div>`;
          continue;
        }
        const { html: body, isParty, extraClass } = renderEntry(e);
        if (body) out += `<div class="feed-entry${isParty ? ' feed-entry--party' : ''}${extraClass ? ' ' + extraClass : ''}">${body}</div>`;
      }
      return out;
    }

    let html = '';
    if (pinned) {
      html += `<div class="feed-pinned-card"><div class="feed-pinned-legend"><svg class="feed-pin-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>${escapeHtml(pinned.title)}</div><div class="feed-pinned-body">${formatAnnBody(pinned.body)}</div></div>`;
    }
    html += feedHeaderHtml;
    _lastDayCoverLists = [];
    for (const g of groups) {
      const covers = _dayCovers(g.items);
      let attr = '';
      let stackHtml = '';
      let cardCls = 'feed-day-card';
      if (covers.length) {
        attr = ` data-day-index="${_lastDayCoverLists.length}"`;
        stackHtml = `<div class="feed-day-cover-stack"></div>`;
        _lastDayCoverLists.push(covers);
      } else {
        // No eligible cover for this day - rather than a flat opaque card that
        // looks out of place next to its cover-bearing neighbors, let the
        // real rotating landing background show through directly (like glass)
        // instead of drawing a copy of it - always in sync, never stale.
        cardCls += ' feed-day-card--glass';
      }
      html += `<div class="${cardCls}"${attr}>${stackHtml}<div class="feed-day-content"><div class="feed-day-header">${g.label}</div>`;
      html += renderDayItems(g.items);
      html += `</div></div>`;
    }
    // Snapshot expanded groups before re-rendering
    const _expandedKeys = new Set(
      [...el.querySelectorAll('.feed-group-toggle[aria-expanded="true"]')]
        .map(b => b.dataset.groupKey).filter(Boolean)
    );

    // el.innerHTML replaces the whole subtree below, so every previously-
    // observed day-card is about to be detached - disconnect first or the
    // ResizeObserver keeps holding references to them (and re-firing is moot
    // anyway, since a detached element never resizes again), leaking memory
    // a little more on every refresh over a long session.
    _dayCoverResizeObserver?.disconnect();
    el.innerHTML = html;
    _applyDayCoverFlows(el);

    // Collapse toggles
    el.querySelectorAll('.feed-group-toggle').forEach(btn => {
      // Restore previously expanded state
      if (_expandedKeys.has(btn.dataset.groupKey)) {
        const target = document.getElementById(btn.dataset.target);
        if (target) { target.hidden = false; btn.setAttribute('aria-expanded', 'true'); btn.querySelector('.feed-group-chevron').textContent = '▼'; }
      }
      btn.addEventListener('click', e => {
        // The group label (rendered via renderGroupLabel) embeds each
        // member's clickable .feed-user-pub username directly inside this
        // button - a click there should open their profile only, not also
        // toggle the group. Bail here rather than stopPropagation()ing in the
        // username's own handler, so document-level click cleanup (context
        // menus etc.) still runs normally for that click.
        if (e.target.closest('.feed-user-pub')) return;
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!expanded));
        btn.querySelector('.feed-group-chevron').textContent = expanded ? '▶' : '▼';
        target.hidden = expanded;
      });
    });

    el.querySelectorAll('.feed-user-pub').forEach(btn => {
      btn.addEventListener('click', () => openPublicProfile(btn.dataset.username));
    });
    el.querySelectorAll('.feed-verb-pub').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.seriesRun === '1') openPublicSeriesRun(+btn.dataset.bookId, +btn.dataset.userId, +btn.dataset.runIndex, null);
        else openPublicRun(+btn.dataset.bookId, +btn.dataset.userId, +btn.dataset.runIndex, null);
      });
    });
    el.querySelectorAll('.feed-book-btn').forEach(btn => {
      btn.addEventListener('click', () => openCoverActivity(+btn.dataset.bookId, btn.dataset.bookName));
    });
    el.querySelectorAll('.feed-anthology-tag').forEach(a => {
      if (!a.dataset.anthologyId) return;
      a.addEventListener('click', e => { e.preventDefault(); openCoverActivity(+a.dataset.anthologyId, a.dataset.anthologyName); });
    });
    el.querySelectorAll('.feed-series-tag').forEach(a => {
      if (!a.dataset.seriesId) return;
      a.addEventListener('click', e => { e.preventDefault(); openSeriesActivity(+a.dataset.seriesId, a.dataset.seriesName); });
    });
    // An announcement can link a book via formatAnnBody()'s [Label](/book/123)
    // syntax - same real, crawlable /book/:id page used elsewhere (e.g. the
    // no-JS feed SEO page), but intercepted here so clicking it from inside
    // the app opens the in-app detail dialog instead of navigating away,
    // same as .feed-series-tag above.
    el.querySelectorAll('.feed-ann-body a, .feed-pinned-body a').forEach(a => {
      let u;
      try { u = new URL(a.href); } catch { return; }
      if (u.origin !== location.origin) return;
      const m = u.pathname.match(/^\/book\/(\d+)$/);
      if (!m) return;
      a.addEventListener('click', e => { e.preventDefault(); openCoverActivity(+m[1], a.textContent); });
    });

    // Hover image previews (desktop only - touch devices have no reliable mouseleave)
    const preview = document.getElementById('feed-img-preview');
    const previewImg = document.getElementById('feed-img-preview-img');
    const previewFooter = document.getElementById('feed-img-preview-footer');
    const previewLevel = document.getElementById('feed-img-preview-level');
    if (window.innerWidth > 768) el.querySelectorAll('.feed-user, [data-cover]').forEach(item => {
      const url = item.dataset.avatar || item.dataset.cover;
      const isCover = !!item.dataset.cover;
      const userLevel = item.dataset.userLevel || '';
      const userTitle = item.dataset.userTitle || '';
      item.addEventListener('mouseenter', ev => {
        if (!url && !userLevel && !userTitle) return;
        const thumbWidth = _feedHoverThumbWidth();
        if (url) {
          previewImg.src = url;
          previewImg.style.display = 'block';
          previewImg.style.width  = `${thumbWidth}px`;
          previewImg.style.height = isCover ? `${Math.round(thumbWidth * 1.5)}px` : `${thumbWidth}px`;
        } else {
          previewImg.style.display = 'none';
        }
        preview.classList.toggle('feed-img-preview--avatar', !isCover);
        if (!isCover && userLevel) {
          previewFooter.style.display = 'block';
          previewLevel.innerHTML = `<span class="feed-hover-level-kicker">${t('feed.hover_level', { n: escapeHtml(userLevel) })}</span>${userTitle ? ` <span class="feed-hover-level-title">${escapeHtml(userTitle)}</span>` : ''}`;
          previewLevel.style.display = 'block';
        } else {
          previewFooter.style.display = 'none';
          previewLevel.textContent = '';
          previewLevel.style.display = 'none';
        }
        preview.style.display = 'block';
        _positionFeedPreview(ev);

        const bar = document.getElementById('feed-img-bar');
        bar._loadTimer = clearTimeout(bar._loadTimer);
        if (!url) {
          bar.style.transition = 'none';
          bar.style.width = '0';
          bar.style.opacity = '0';
        } else if (previewImg.complete && previewImg.naturalWidth) {
          bar.style.transition = 'none';
          bar.style.width = '0';
          bar.style.opacity = '0';
        } else {
          bar.style.transition = 'none';
          bar.style.width = '0';
          bar.style.opacity = '1';
          void bar.offsetWidth;
          bar.style.transition = 'width 1.5s cubic-bezier(0.1,0.4,0.5,1)';
          bar.style.width = '80%';
          const finish = () => {
            bar.style.transition = 'width 0.1s ease';
            bar.style.width = '100%';
            bar._loadTimer = setTimeout(() => {
              bar.style.transition = 'opacity 0.3s ease';
              bar.style.opacity = '0';
            }, 120);
          };
          previewImg.addEventListener('load',  finish, { once: true });
          previewImg.addEventListener('error', finish, { once: true });
        }
      });
      item.addEventListener('mousemove', _positionFeedPreview);
      item.addEventListener('mouseleave', _hideFeedPreview);
    });
  } catch (_) {
    // Feed is best-effort; silently ignore errors
  }
}

let _dayCoverResizeRaf = null;
let _dayCoverSettleTimer = null;
function _scheduleDayCoverRecompute() {
  if (_dayCoverResizeRaf) cancelAnimationFrame(_dayCoverResizeRaf);
  _dayCoverResizeRaf = requestAnimationFrame(() => {
    _dayCoverResizeRaf = null;
    const el = document.getElementById('feed-content');
    if (el) _applyDayCoverFlows(el);
  });
  // A single rAF after `resize`/`fullscreenchange` can still land mid-transition
  // on an animated OS/browser fullscreen toggle (unlike a plain window resize,
  // which settles in one frame) - re-check once more shortly after in case the
  // first pass measured an in-between size.
  if (_dayCoverSettleTimer) clearTimeout(_dayCoverSettleTimer);
  _dayCoverSettleTimer = setTimeout(() => {
    _dayCoverSettleTimer = null;
    const el = document.getElementById('feed-content');
    if (el) _applyDayCoverFlows(el);
  }, 400);
}
window.addEventListener('resize', _scheduleDayCoverRecompute);
document.addEventListener('fullscreenchange', _scheduleDayCoverRecompute);

// The feed panel's width also changes whenever the covers/right landing
// panels collapse or expand (Ctrl+X, or the individual panel toggles) -
// that never fires a `resize` event at all (the window itself doesn't
// change size, only the feed panel's CSS width), so it needs an explicit
// call. Wired from prefs.js's _setLandingPanelCollapsed, right alongside
// its existing syncFeedTogglePos hook call.
export function refreshDayCoverFlows() {
  _scheduleDayCoverRecompute();
}
