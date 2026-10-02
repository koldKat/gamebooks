import { getToken, apiFetch } from '../core/state.js';
import { t } from '../i18n.js';
import { feedHooks as _hooks } from './state.js';
import { renderFeedContents } from './render.js';
import { replaceDayCoverLists, _applyDayCoverFlows } from './day-covers.js';
import { bindFeedInteractions } from './bindings.js';
import { bindFeedPreviews, _hideFeedPreview } from './previews.js';

// Single-flight guard: livetab.js's 60s interval and an SSE-triggered
// feed_changed refresh can land in the same tick, and each call rebuilds
// #feed-content's entire DOM (entries, day-card background layers) from
// scratch - overlapping calls raced the same rebuild for no benefit, just
// doubled GET /api/feed + DOM work. A caller arriving mid-refresh reuses
// the in-flight promise instead of starting a second one.
let _loadFeedInFlight = null;
let _loadFeedToken = null;
let _loadFeedGeneration = 0;
export function loadFeed() {
  const token = getToken();
  if (_loadFeedInFlight && _loadFeedToken === token) return _loadFeedInFlight;
  const generation = ++_loadFeedGeneration;
  _loadFeedToken = token;
  _loadFeedInFlight = _loadFeedImpl(token, generation).finally(() => {
    if (generation === _loadFeedGeneration) _loadFeedInFlight = null;
  });
  return _loadFeedInFlight;
}

async function _loadFeedImpl(token, generation) {
  const isCurrent = () => generation === _loadFeedGeneration && getToken() === token;
  const el = document.getElementById('feed-content');
  if (!el) return;
  // GET /api/feed can be slow on a bad connection - #feed-content sits
  // empty (its own initial markup in index.html) until this resolves, which
  // reads as the page having silently failed to load anything. Only show
  // the spinner on a genuinely empty panel (first load, or a previous call
  // that errored) - livetab.js's own leader-tab timer calls loadFeed()
  // every 60s regardless of whether the landing page is even visible, and
  // wiping real, already-rendered entries back to a spinner on every one of
  // those background refreshes (found the hard way: it looked like the
  // whole feed was reloading once a minute) would be far worse than the
  // silent swap-in this used to do before the spinner existed.
  if (!el.querySelector('.feed-entry, #feed-header')) {
    // Same graph (center node + 4 children) as favicon.svg, not an
    // unrelated book icon - this app's whole subject is mapping a
    // gamebook's own node graph, so re-using that exact shape/palette
    // reads as "the app", not just "some generic loading animation".
    el.innerHTML = `<div class="feed-loading">
      <svg class="feed-loading-graph" viewBox="0 0 32 32">
        <line x1="16" y1="16" x2="6"  y2="7"  stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
        <line x1="16" y1="16" x2="26" y2="7"  stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
        <line x1="16" y1="16" x2="6"  y2="26" stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
        <line x1="16" y1="16" x2="26" y2="26" stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
        <circle class="flg-node flg-n1" cx="6"  cy="7"  r="4" fill="#8e44ad" stroke="#6c3483" stroke-width="1.2"/>
        <circle class="flg-node flg-n2" cx="26" cy="7"  r="4" fill="#e74c3c" stroke="#c0392b" stroke-width="1.2"/>
        <circle class="flg-node flg-n3" cx="6"  cy="26" r="4" fill="#3498db" stroke="#2980b9" stroke-width="1.2"/>
        <circle class="flg-node flg-n4" cx="26" cy="26" r="4" fill="#27ae60" stroke="#1e8449" stroke-width="1.2"/>
        <circle class="flg-center" cx="16" cy="16" r="6" fill="#f5a623" stroke="#c47d00" stroke-width="1.5"/>
      </svg>
      <span>${t('feed.loading')}</span>
    </div>`;
  }
  try {
    const res              = token ? await apiFetch('/api/feed') : await _hooks.publicFetch?.('/api/feed');
    if (!isCurrent()) return;
    if (!res?.ok) throw new Error('Feed request failed');
    const { entries, pinned } = await res.json();
    if (!isCurrent()) return;
    if (!Array.isArray(entries)) throw new Error('Invalid feed response');
    if (token) _hooks.scheduleRewardProfileRefresh?.(150);

    const feedHeaderHtml = `<div id="feed-header">${t('feed.header')} <span class="feed-header-sub">${t('feed.header_sub')}</span></div>`;

    if (!entries.length && !pinned) {
      replaceDayCoverLists([]);
      _hideFeedPreview();
      el.innerHTML = feedHeaderHtml + `<p class="feed-empty">${t('feed.empty')}</p>`;
      return;
    }

    // Register author info from entries
    for (const e of entries) {
      _hooks.registerAuthor?.(e.username, !!e.isAuthor, e.displayName);
      _hooks.registerContributor?.(e.username, !!e.isContributor);
    }

    const { html, dayCoverLists } = renderFeedContents(entries, pinned, feedHeaderHtml);
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
    replaceDayCoverLists(dayCoverLists);
    _hideFeedPreview();
    el.innerHTML = html;
    _applyDayCoverFlows(el);

    bindFeedInteractions(el, _expandedKeys);
    bindFeedPreviews(el);
  } catch (_) {
    if (!isCurrent()) return;
    // Feed is best-effort; silently ignore errors. Only clear the spinner
    // set above if it's actually still showing (a genuinely empty panel) -
    // a failed background poll must never wipe entries a previous
    // successful call already rendered, same reasoning as the spinner
    // guard above.
    if (el.querySelector('.feed-loading')) {
      el.innerHTML = `<div id="feed-header">${t('feed.header')} <span class="feed-header-sub">${t('feed.header_sub')}</span></div>` +
                      `<p class="feed-empty">${t('feed.empty')}</p>`;
    }
  }
}
