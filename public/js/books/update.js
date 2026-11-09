// Replace only changed top-level library groups, preserving other DOM and bindings.
import { afterLazyGroupsSettled } from './lazy.js';

const snapshots = new WeakMap();
const scrollHolds = new WeakMap();

function retainScroll(root) {
  const height = root.getBoundingClientRect().height;
  if (!height) return () => {};
  const previous = scrollHolds.get(root);
  const hold = { minHeight: previous?.minHeight ?? root.style.minHeight,
    anchors: previous?.anchors ?? new Map() };
  scrollHolds.set(root, hold);
  const positions = [];
  for (let node = root.parentElement; node; node = node.parentElement) {
    if (node.scrollTop) {
      positions.push([node, node.scrollTop]);
      if (!hold.anchors.has(node)) hold.anchors.set(node, node.style.overflowAnchor);
      node.style.overflowAnchor = 'none';
    }
  }
  // A changed expanded stash briefly becomes an empty lazy placeholder.
  // Keep the list's height until its replacement children have been built.
  root.style.minHeight = `${height}px`;
  return () => {
    for (const [node, top] of positions) node.scrollTop = top;
    requestAnimationFrame(() => afterLazyGroupsSettled(() => {
      if (scrollHolds.get(root) !== hold) return;
      const current = positions.map(([node]) => [node, node.scrollTop]);
      root.style.minHeight = hold.minHeight;
      scrollHolds.delete(root);
      // Preserve scrolling performed by the user while chunks were loading.
      for (const [node, top] of current) node.scrollTop = top;
      for (const [node, anchor] of hold.anchors) node.style.overflowAnchor = anchor;
    }));
  };
}

function expansionChanged(nodes, prefs) {
  if (!prefs) return false;
  for (const node of nodes) {
    const rows = [...node.querySelectorAll('[data-expanded]')];
    if (node.matches('[data-expanded]')) rows.push(node);
    for (const row of rows) {
      const d = row.dataset;
      const key = row.classList.contains('stash-header-row') ? `stash:${d.stashId}`
        : row.classList.contains('series-header-row') ? `series:${d.stashId || 'main'}:${d.seriesId}`
        : d.containerId ? `book:${d.containerId}` : null;
      // Search visibility is temporary; data-expanded retains the saved preference.
      if (key && Object.hasOwn(prefs, key) && prefs[key] !== d.expanded) return true;
    }
  }
  return false;
}

export function updateBooksList(root, blocks) {
  const restoreScroll = retainScroll(root);
  let previous = snapshots.get(root) || new Map();
  if ([...previous.values()].some(record => record.nodes.some(node => node.parentNode !== root))) previous = new Map();
  if (!previous.size) root.replaceChildren();
  const next = new Map(), changedRoots = [];
  let cursor = root.firstElementChild;
  for (const block of blocks) {
    const fingerprint = block.fingerprint ?? block.html;
    const old = previous.get(block.key);
    let nodes = old?.nodes;
    if (!old || old.fingerprint !== fingerprint || expansionChanged(nodes, block.expansion)) {
      const template = document.createElement('template');
      template.innerHTML = typeof block.html === 'function' ? block.html() : block.html;
      nodes = [...template.content.children];
      for (const node of old?.nodes || []) {
        if (node === cursor) cursor = node.nextElementSibling;
        node.remove();
      }
      changedRoots.push(...nodes);
    }
    for (const node of nodes) {
      if (node === cursor) cursor = cursor.nextElementSibling;
      else root.insertBefore(node, cursor);
    }
    next.set(block.key, { nodes, fingerprint });
  }
  for (const [key, old] of previous) if (!next.has(key)) for (const node of old.nodes) node.remove();
  snapshots.set(root, next);
  restoreScroll();
  return changedRoots;
}
