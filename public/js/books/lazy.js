import { _scheduleAnthologyCardCoverFlows, _getBookCoverObserver, _queueBookCovers } from './covers.js';

// Materialize collapsed groups on expansion or search to keep hidden DOM bounded.
export const lazyState = { builders: new Map(), wireContent: null, sequence: 0 };
const _materializingGroups = new WeakMap();
// Sequence builder keys per render: duplicate stash containers share data-parent.

export function _materializeLazyGroup(group, { immediate = false } = {}) {
  const active = group && _materializingGroups.get(group);
  if (active) {
    if (immediate) active.complete();
    return;
  }
  const key = group?.dataset?.lazyGroup;
  if (!key) return;
  const build = lazyState.builders.get(key);
  // Insert and wire item chunks to avoid a long main-thread parse.
  const built = build ? build() : [];
  const items = (Array.isArray(built) ? built : [built]).filter(Boolean);
  delete group.dataset.lazyGroup;
  // Retain the builder so reclaimed groups can be rebuilt on expansion.
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
    // Wire newly inserted elements, not item indices; one item may produce several elements.
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

// Reclaim DOM only for large groups; small groups are cheaper to hide.
const _RECLAIM_MIN_CARDS = 20;

// Drop large collapsed groups' DOM and decoded covers, retaining their builders.
export function _maybeReclaimLazyGroup(group) {
  const key = group?.dataset?.lazyKey;
  if (!key || !lazyState.builders.has(key)) return; // no builder to rebuild with - leave it hidden
  if (group.querySelectorAll('.book-item, .book-item--container').length < _RECLAIM_MIN_CARDS) return;
  _materializingGroups.delete(group);
  delete group.dataset.materializingGroup;
  // Unobserve pending cover targets before removal; the observer otherwise retains them.
  const observer = _getBookCoverObserver();
  group.querySelectorAll('[data-pending-cover]').forEach(el => observer.unobserve(el));
  group.replaceChildren();
  group.dataset.lazyGroup = key;   // re-arm placeholder so the next expand re-materializes
  delete group.dataset.lazyKey;
}
