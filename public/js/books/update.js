// Replace only changed top-level library groups, preserving other DOM and bindings.
const snapshots = new WeakMap();

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
      template.innerHTML = block.html;
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
  return changedRoots;
}
