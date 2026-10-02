import { state, parseSecId } from '../core/state.js';

// Graph-agnostic reachability BFS.
export function canReachInGraph(graph, from, to) {
  from = parseSecId(from); to = parseSecId(to);
  if (from == null || to == null || from === to) return false;
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const node = queue.shift();
    for (const raw of (graph[node]?.choices ?? [])) {
      const next = parseSecId(raw);
      if (next === -1 || next === 0) continue;
      if (next === to) return true;
      if (!seen.has(next) && graph[next]) { seen.add(next); queue.push(next); }
    }
  }
  return false;
}

// Returns a Set of all sections reachable from `from` in the given graph (excluding `from` and terminals).
export function allReachableInGraph(graph, from) {
  from = parseSecId(from);
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const node = queue.shift();
    for (const raw of (graph[node]?.choices ?? [])) {
      const next = parseSecId(raw);
      if (next === -1 || next === 0) continue; // skip death/win terminals
      if (!seen.has(next) && graph[next]) { seen.add(next); queue.push(next); }
    }
  }
  seen.delete(from);
  return seen;
}

// Normalize endpoints and choices before directed BFS so numeric-string IDs match.
export function canReach(from, to) {
  from = parseSecId(from); to = parseSecId(to);
  if (from === to) return false;
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const node = queue.shift();
    for (const raw of (state.graph[node]?.choices ?? [])) {
      const next = parseSecId(raw);
      if (next === -1 || next === 0) continue;
      if (next === to) return true;
      if (!seen.has(next) && state.graph[next]) { seen.add(next); queue.push(next); }
    }
  }
  return false;
}

// Returns an array [from, ..., to] or null if unreachable.
// mode: 'high' | 'shortest' | 'normal' | 'low'
export function findPathTo(from, to, mode) {
  from = parseSecId(from); to = parseSecId(to);
  if (from === to) return null;

  const bfsPath = _bfsShortestPath(from, to);
  if (!bfsPath) return null;
  if (mode === 'shortest') return bfsPath;

  if (mode === 'normal') {
    // BFS avoiding high/low priority intermediate nodes
    const seen = new Set([from]);
    const queue = [[from, [from]]];
    while (queue.length) {
      const [node, path] = queue.shift();
      for (const raw of (state.graph[node]?.choices ?? [])) {
        const next = parseSecId(raw);
        if (next === -1 || next === 0) continue;
        if (seen.has(next)) continue;
        const p = state.graph[next]?.priority;
        // allow destination even if it has a priority tag
        if (next !== to && (p === 'high' || p === 'low')) continue;
        if (next === to) return [...path, next];
        if (state.graph[next]) { seen.add(next); queue.push([next, [...path, next]]); }
      }
    }
    return bfsPath; // fallback to shortest if no clean path exists
  }

  const wantPriority = mode === 'high' ? 'high' : 'low';
  return _findMaxPriorityPath(from, to, wantPriority, bfsPath);
}

// Prefer paths containing wanted-priority nodes; prune routes with no better score or length.
function _findMaxPriorityPath(from, to, want, bfsPath) {
  // Allow up to (bfsPath.length) extra hops - generous for large books, capped
  // so the queue doesn't blow up on tiny books with huge graphs.
  const maxLen  = bfsPath.length + Math.max(10, bfsPath.length);
  let bestPath  = bfsPath;
  let bestScore = _countPriority(bfsPath, want);

  // Prune only when an earlier route has both at least this score and no greater length.
  const bestAt = new Map([[from, { score: 0, len: 1 }]]);
  const queue  = [{ path: [from], score: 0 }];

  while (queue.length) {
    const { path, score } = queue.shift();
    const node = path[path.length - 1];
    if (path.length >= maxLen) continue;

    for (const raw of (state.graph[node]?.choices ?? [])) {
      const next = parseSecId(raw);
      if (next === -1 || next === 0) continue;
      if (path.includes(next)) continue; // cycle guard

      const nextScore = score + (state.graph[next]?.priority === want ? 1 : 0);
      const newLen    = path.length + 1;

      if (next === to) {
        if (nextScore > bestScore) { bestScore = nextScore; bestPath = [...path, next]; }
        continue;
      }

      if (!state.graph[next]) continue;

      const prev = bestAt.get(next);
      // Prune only when the new path is dominated on both score AND length
      if (prev && prev.score >= nextScore && prev.len <= newLen) continue;

      bestAt.set(next, { score: nextScore, len: newLen });
      queue.push({ path: [...path, next], score: nextScore });
    }
  }

  return bestPath;
}

function _bfsShortestPath(from, to) {
  const queue = [[from]];
  const seen  = new Set([from]);
  while (queue.length) {
    const path = queue.shift();
    const node = path[path.length - 1];
    const choices = state.graph[node]?.choices ?? [];
    for (const raw of choices) {
      const next = parseSecId(raw);
      if (next === -1 || next === 0) continue;
      if (seen.has(next)) continue;
      const newPath = [...path, next];
      if (next === to) return newPath;
      if (state.graph[next]) {
        seen.add(next);
        queue.push(newPath);
      }
    }
  }
  return null;
}

function _countPriority(path, want) {
  return path.filter(n => state.graph[n]?.priority === want).length;
}
