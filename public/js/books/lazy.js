import { _scheduleAnthologyCardCoverFlows, _getBookCoverObserver, _queueBookCovers } from './covers.js';

// Materialize collapsed groups on expansion or search to keep hidden DOM bounded.
export const lazyState = { builders: new Map(), wireContent: null, sequence: 0 };
const _materializingGroups = new WeakMap();
const pendingSteps = [];
let pendingFrame = null;
function scheduleStep(step) {
  pendingSteps.push(step);
  scheduleNextFrame();
}
function scheduleNextFrame() {
  if (pendingFrame != null || !pendingSteps.length) return;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = -1;
    const deadline = performance.now() + 6;
    const count = pendingSteps.length;
    for (let i = 0; i < count && pendingSteps.length; i++) {
      pendingSteps.shift()();
      if (performance.now() >= deadline) break;
    }
    pendingFrame = null;
    scheduleNextFrame();
  });
}
function materializeExpandedDescendants(root, immediate) {
  for (const group of root.querySelectorAll?.('[data-lazy-group]') || []) {
    if (!group.closest?.('[style*="display:none"], [style*="display: none"]')) {
      _materializeLazyGroup(group, { immediate });
    }
  }
}
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
  const built = build ? build({ incremental: !immediate }) : [];
  const items = typeof built === 'string' ? [built] : (built || []);
  delete group.dataset.lazyGroup;
  // Retain the builder so reclaimed groups can be rebuilt on expansion.
  group.dataset.lazyKey = key;
  if (immediate || (Array.isArray(items) && items.length <= 12) || !lazyState.wireContent) {
    group.innerHTML = Array.from(items).join('');
    lazyState.wireContent?.(group);
    materializeExpandedDescendants(group, immediate);
    _queueBookCovers(group, { reset: false });
    _scheduleAnthologyCardCoverFlows();
    return;
  }
  const iterator = items[Symbol.iterator]();
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
    const chunk = [], deadline = performance.now() + 4;
    let done = false;
    do {
      const next = iterator.next();
      done = next.done;
      if (!done && next.value) chunk.push(next.value);
    } while (!done && chunk.length < 12 && (job.immediate || performance.now() < deadline));
    group.insertAdjacentHTML('beforeend', chunk.join(''));
    // Wire newly inserted elements, not item indices; one item may produce several elements.
    const kids = group.children;
    for (let k = _wiredCount; k < kids.length; k++) {
      const child = kids[k];
      lazyState.wireContent(child);
      _queueBookCovers(child, { reset: false });
      // Expanded descendants start as small placeholders, never a giant HTML item.
      if (child.dataset?.lazyGroup && !child.closest?.('[style*="display:none"], [style*="display: none"]')) {
        _materializeLazyGroup(child, { immediate: job.immediate });
      }
      materializeExpandedDescendants(child, job.immediate);
    }
    _wiredCount = kids.length;
    _scheduleAnthologyCardCoverFlows();
    if (!done) {
      if (!job.immediate) scheduleStep(step);
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
  scheduleStep(step);
}

// Reclaim DOM only for large groups; small groups are cheaper to hide.
const _RECLAIM_MIN_CARDS = 20;

// Drop large collapsed groups' DOM and decoded covers, retaining their builders.
export function _maybeReclaimLazyGroup(group) {
  const key = group?.dataset?.lazyKey;
  if (!key || !lazyState.builders.has(key)) return; // no builder to rebuild with - leave it hidden
  if (!_materializingGroups.has(group) && group.querySelectorAll('.book-item, .book-item--container').length < _RECLAIM_MIN_CARDS) return;
  _materializingGroups.delete(group);
  delete group.dataset.materializingGroup;
  // Unobserve pending cover targets before removal; the observer otherwise retains them.
  const observer = _getBookCoverObserver();
  group.querySelectorAll('[data-pending-cover]').forEach(el => observer.unobserve(el));
  group.replaceChildren();
  group.dataset.lazyGroup = key;   // re-arm placeholder so the next expand re-materializes
  delete group.dataset.lazyKey;
}
