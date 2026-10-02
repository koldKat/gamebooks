import { state } from '../core/state.js';

// A terminal outcome is guaranteed only when every choice resolves to it.
// Use a graph-wide fixed point; mixed branches, unmapped sections, and closed cycles stay unknown.
export function computeOutcomes() {
  const graph   = state.graph;
  const outcome = Object.create(null);
  let changed = true;
  while (changed) {
    changed = false;
    for (const idStr of Object.keys(graph)) {
      const id = idStr;
      if (id in outcome) continue;
      const choices = graph[id]?.choices || [];
      if (!choices.length) continue;
      const outs = choices.map(c => {
        if (c === -1 || c === '-1') return 'death';
        if (c === 0 || c === '0')  return 'win';
        return outcome[c] ?? 'unknown';
      });
      if (outs.every(o => o === 'death'))      { outcome[id] = 'death'; changed = true; }
      else if (outs.every(o => o === 'win'))   { outcome[id] = 'win';   changed = true; }
    }
  }
  return outcome;
}

// For multiple lookups, compute outcomes once; this wrapper solves the whole graph per call.
export function inevitableOutcome(destId) {
  if (destId === -1 || destId === '-1') return 'death';
  if (destId === 0 || destId === '0')  return 'win';
  return computeOutcomes()[destId] ?? null;
}

function edgeColor(dest) {
  const outcome = inevitableOutcome(dest);
  if (outcome === 'death') return { color: '#e74c3c', opacity: 0.8, highlight: '#e74c3c' };
  if (outcome === 'win')   return { color: '#27ae60', opacity: 0.8, highlight: '#27ae60' };
  return { color: '#4b5563', opacity: 0.7, highlight: '#9ca3af' };
}
