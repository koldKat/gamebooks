import { state } from '../state.js';

// ── Edge appearance ──────────────────────────────────────────────────────────

// Whether a section's fate is settled no matter which choice a player picks
// from here on - not just a single unbranching chain of choices. A section is
// 'death' only if EVERY one of its choices is itself already 'death', and
// 'win' only if EVERY one of its choices is itself already 'win' (same
// quantifier both ways - "no matter what you pick from here"). Win is
// deliberately NOT "any choice can reach 0": a section with one path to
// certain victory and another to certain death is not a guaranteed win just
// because a winning option exists - the player could still pick the death
// branch, so reaching this section promises nothing either way and it stays
// unresolved, same as any other genuinely mixed branch.
// Branching used to make this bail out immediately (any node with more than
// one choice returned null, "can't tell"), which missed real certain-death
// zones where a section branches into two or more choices that each,
// independently, still only ever end in death further down their own chains.
// This is an AND-OR fixed-point solve over the whole graph rather than a walk
// down one path, so it resolves those cases too, and treats unmapped
// sections and true cycles (a loop with no escape to -1/0) as unresolved
// ('unknown') rather than guessing - never falsely paint an edge as certain
// death/win.
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

// destId is a real section id, or the -1/0 death/win sentinels themselves.
// Convenience single-lookup wrapper - callers checking more than one id in
// the same pass (e.g. every choice in a section, or every edge in the graph)
// should call computeOutcomes() once themselves instead, since this does a
// full-graph solve on every call.
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
