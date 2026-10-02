import { getToken, apiFetch } from '../core/state.js';
import { t } from '../i18n.js';
import { feedHooks as _hooks } from './state.js';
import { renderFeedContents } from './render.js';
import { replaceDayCoverLists, _applyDayCoverFlows } from './day-covers.js';
import { bindFeedInteractions } from './bindings.js';
import { bindFeedPreviews, _hideFeedPreview } from './previews.js';
import { updateFeedContents } from './update.js';

// Reuse the in-flight feed refresh to avoid duplicate requests and DOM rebuilds.
let _loadFeedInFlight = null;
let _loadFeedToken = null;
let _loadFeedGeneration = 0;
let _renderedFeedToken;
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
  // Show loading only on an empty feed; populated background refreshes retain existing entries.
  if (!el.querySelector('.feed-entry, #feed-header')) {
    // Reuse the app's choice-graph loading icon.
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

    // Register author info from entries
    for (const e of entries) {
      _hooks.registerAuthor?.(e.username, !!e.isAuthor, e.displayName);
      _hooks.registerContributor?.(e.username, !!e.isContributor);
    }

    const { blocks, dayCoverLists } = renderFeedContents(entries, pinned, feedHeaderHtml);
    // Snapshot expanded groups before re-rendering
    const _expandedKeys = new Set(
      [...el.querySelectorAll('.feed-group-toggle[aria-expanded="true"]')]
        .map(b => b.dataset.groupKey).filter(Boolean)
    );

    const update = updateFeedContents(el, blocks, _renderedFeedToken !== token);
    _renderedFeedToken = token;
    if (!update.changed) return;
    replaceDayCoverLists(dayCoverLists);
    _hideFeedPreview();
    for (const root of update.changedRoots) {
      bindFeedInteractions(root, _expandedKeys);
      bindFeedPreviews(root);
    }
    update.restoreScroll();
    _applyDayCoverFlows(el);
  } catch (_) {
    if (!isCurrent()) return;
    // On failure, remove only a live spinner; never clear previously rendered entries.
    if (el.querySelector('.feed-loading')) {
      el.innerHTML = `<div id="feed-header">${t('feed.header')} <span class="feed-header-sub">${t('feed.header_sub')}</span></div>` +
                      `<p class="feed-empty">${t('feed.empty')}</p>`;
    }
  }
}
