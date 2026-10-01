import { _scheduleAnthologyCardCoverFlows, _getBookCoverObserver, _queueBookCovers } from './covers.js';

// ── Lazy collapsed groups ─────────────────────────────────────────────────────
// Collapsed stash/series/anthology bodies are NOT rendered into the DOM at
// list-build time - a big library (1000+ books, mostly hidden inside collapsed
// groups) would otherwise put tens of thousands of never-seen nodes on the
// page. renderBooksList() registers a builder per hidden group and emits an
// empty placeholder <div data-lazy-group>; the first expand (or a search,
// which matches against DOM text/data-attrs and so needs everything present)
// materializes it via _materializeLazyGroup(). Groups default to expanded, so
// this only costs anything for content the user has explicitly collapsed.
export const lazyState = { builders: new Map(), wireContent: null, sequence: 0 };
const _materializingGroups = new WeakMap();
// Builder keys carry a per-render sequence number because the same container
// can legitimately appear in more than one stash block - data-parent is NOT
// unique across the list, so it can't serve as the builder key.

export function _materializeLazyGroup(group, { immediate = false } = {}) {
  const active = group && _materializingGroups.get(group);
  if (active) {
    if (immediate) active.complete();
    return;
  }
  const key = group?.dataset?.lazyGroup;
  if (!key) return;
  const build = lazyState.builders.get(key);
  // Call the builder - it returns an array of item HTML strings (not one
  // joined blob) so a big group can be parsed, inserted, and wired
  // incrementally - one giant innerHTML parse plus one giant wiring pass
  // blocks the main thread long enough to swallow the next scroll gesture.
  const built = build ? build() : [];
  const items = (Array.isArray(built) ? built : [built]).filter(Boolean);
  delete group.dataset.lazyGroup;
  // Remember the builder key so this now-materialized group can be RECLAIMED
  // (its DOM + decoded cover backgrounds dropped) when collapsed, then rebuilt
  // on re-expand. The builder is deliberately NOT deleted from the map for the
  // same reason - renderBooksList() clears the whole map on the next full render.
  group.dataset.lazyKey = key;
  const CHUNK = 100;
  if (immediate || items.length <= CHUNK || !lazyState.wireContent) {
    group.innerHTML = items.join('');
    lazyState.wireContent?.(group);
    _queueBookCovers(group, { reset: false });
    _scheduleAnthologyCardCoverFlows();
    return;
  }
  let i = 0;
  const job = { immediate: false };
  _materializingGroups.set(group, job);
  group.dataset.materializingGroup = key;
  const step = () => {
    if (_materializingGroups.get(group) !== job) return;
    if (!group.isConnected) {
      _materializingGroups.delete(group);
      delete group.dataset.materializingGroup;
      return;
    }
    group.insertAdjacentHTML('beforeend', items.slice(i, i + CHUNK).join(''));
    i = Math.min(i + CHUNK, items.length);
    // Wire only the elements inserted this chunk (an item string can expand
    // to more than one top-level element - a series header + its group - so
    // count elements, don't index by item).
    const kids = group.children;
    for (let k = _wiredCount; k < kids.length; k++) lazyState.wireContent(kids[k]);
    _wiredCount = kids.length;
    if (i < items.length) {
      if (!job.immediate) requestAnimationFrame(step);
    } else {
      _materializingGroups.delete(group);
      delete group.dataset.materializingGroup;
      _queueBookCovers(group, { reset: false });
      _scheduleAnthologyCardCoverFlows();
    }
  };
  // Search must finish pending chunks before matching against their DOM.
  job.complete = () => {
    job.immediate = true;
    while (_materializingGroups.get(group) === job) step();
  };
  let _wiredCount = 0;
  requestAnimationFrame(step);
}

// Cards-in-subtree above which collapsing a group RECLAIMS its DOM (drops the
// nodes + their decoded cover backgrounds) instead of just hiding it. Below
// this, a plain display:none is cheaper than paying to rebuild + re-decode
// covers on every toggle. Only groups big enough to actually retain meaningful
// memory get reclaimed.
const _RECLAIM_MIN_CARDS = 20;

// Collapse counterpart to _materializeLazyGroup: for a large materialized group
// (a stash/series/anthology the user opened then closed), drop its DOM and, with
// it, every decoded CSS cover background, then re-arm the empty lazy placeholder
// so re-expanding rebuilds it from the retained builder. Without this a big
// expanded-then-collapsed group stays fully resident (nodes + images) for the
// life of the page - it was only display:none'd.
export function _maybeReclaimLazyGroup(group) {
  const key = group?.dataset?.lazyKey;
  if (!key || !lazyState.builders.has(key)) return; // no builder to rebuild with - leave it hidden
  if (group.querySelectorAll('.book-item, .book-item--container').length < _RECLAIM_MIN_CARDS) return;
  _materializingGroups.delete(group);
  delete group.dataset.materializingGroup;
  // The shared cover IntersectionObserver keeps a strong reference to every
  // still-pending (off-screen) target it is watching, so removing those nodes
  // without unobserving first would leak them. Loaded covers already unobserved
  // themselves; unobserve() is a safe no-op for anything not being watched.
  const observer = _getBookCoverObserver();
  group.querySelectorAll('[data-pending-cover]').forEach(el => observer.unobserve(el));
  group.replaceChildren();
  group.dataset.lazyGroup = key;   // re-arm placeholder so the next expand re-materializes
  delete group.dataset.lazyKey;
}
