import { state, isTerminal, isValidSecId, parseSecId, saveState } from '../core/state.js';

// ── Node deletion ───────────────────────────────────────────────────────────

export function subtreeToDelete(rootId) {
  rootId = parseSecId(rootId);
  const toDelete = new Set([rootId]);
  const queue    = [rootId];
  while (queue.length) {
    const cur  = queue.shift();
    const data = state.graph[cur];
    if (data) {
      data.choices.forEach(raw => {
        const child = parseSecId(raw);
        if (child !== null && !isTerminal(child) && !toDelete.has(child)) {
          toDelete.add(child);
          queue.push(child);
        }
      });
    }
  }
  // Protect nodes reachable from any real start without passing through rootId, including alternate starts.
  const roots = new Set([isValidSecId(state.startSection) ? parseSecId(state.startSection) : 1]);
  (state.playthroughs || []).forEach(pt => {
    if (isValidSecId(pt?.path?.[0])) roots.add(parseSecId(pt.path[0]));
  });
  const reachable = new Set(roots);
  const bfsQ = [...roots];
  while (bfsQ.length) {
    const cur = bfsQ.shift();
    if (cur === rootId) continue; // treat rootId as removed
    for (const raw of (state.graph[cur]?.choices ?? [])) {
      const child = parseSecId(raw);
      if (child !== null && !isTerminal(child) && !reachable.has(child)) {
        reachable.add(child);
        bfsQ.push(child);
      }
    }
  }
  toDelete.forEach(node => {
    if (node !== rootId && reachable.has(node)) toDelete.delete(node);
  });
  return toDelete;
}

// Caller is responsible for clearing viewingPt if needed and calling render()
export function deleteNodes(ids) {
  ids = new Set([...ids].map(parseSecId));
  ids.forEach(id => {
    delete state.graph[id];
    delete state.positions[id];
    Object.values(state.graph).forEach(data => {
      data.choices = data.choices.filter(c => parseSecId(c) !== id);
    });
  });
  // Retain visited nodes and useful metadata even when choices become empty.
  const visited = new Set(state.playthroughs.flatMap(pt => pt.path.map(parseSecId)));
  Object.keys(state.graph).forEach(sec => {
    const node = state.graph[sec];
    const hasMetadata = node.note || node.priority || node.battle || node.color || node.portals || node.showNote || node.manual;
    if (node.choices.length === 0 && !visited.has(parseSecId(sec)) && !hasMetadata)
      delete state.graph[sec];
  });
  // Trim paths and reopen any affected run
  state.playthroughs.forEach((pt, i) => {
    const cutAt = pt.path.findIndex(s => ids.has(parseSecId(s)));
    if (cutAt !== -1) {
      pt.path      = pt.path.slice(0, cutAt);
      pt.completed = false;
      pt.result    = null;
      if (!pt.path.length) pt.path = [1];
      if (state.activePtIndex === i) state.activePtIndex = null;
    }
  });
  saveState();
}
