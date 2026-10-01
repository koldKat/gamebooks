import { state, parseSecId, isTerminal } from '../state.js';
import { _hasValidPos } from './helpers.js';
import { _GRID_LAYER_GAP, _GRID_COL_GAP } from './layout-constants.js';

export function _getPositionedNeighbors(sec, posMap) {
  // .includes(sec) is strict-equality: data.choices' raw values aren't
  // guaranteed to be the same JS type as sec (which callers pass in already
  // normalized via parseSecId/allDiscoveredSections) - the same string-vs-
  // number trap this project already fixed once in state.js's own
  // discoveredSectionsFor. String() both sides before comparing so a real
  // connection can't be silently missed here too.
  const secStr = String(sec);
  const incoming = [];
  const outgoing = [];
  for (const [srcKey, data] of Object.entries(state.graph)) {
    const src = parseSecId(srcKey);
    if (src === sec) {
      for (const raw of (data.choices || [])) {
        // Same raw-vs-normalized trap as _bfsDepth below - isTerminal()'s
        // own strict === would miss a string-typed "-1"/"0" sentinel.
        const dest = parseSecId(raw);
        if (dest !== null && !isTerminal(dest) && _hasValidPos(posMap[dest])) outgoing.push(dest);
      }
      continue;
    }
    if ((data.choices || []).some(c => String(c) === secStr) && _hasValidPos(posMap[src])) incoming.push(src);
  }
  return { incoming, outgoing, all: [...incoming, ...outgoing] };
}

export function _avgPoint(ids, posMap) {
  if (!ids.length) return null;
  let x = 0;
  let y = 0;
  ids.forEach(id => {
    x += posMap[id].x;
    y += posMap[id].y;
  });
  return { x: x / ids.length, y: y / ids.length };
}

// First free Y slot in the column at colX, starting at startY and stepping
// down by _GRID_COL_GAP - treating a slot as taken when any positioned node
// sits in the same column band within half a gap. Deliberately LOCAL: the
// previous "bottom of the column" scan (max Y over the whole map) stacked new
// options below unrelated nodes from other branches that happen to sit in the
// same column band, landing them far below the parent they belong to (one
// column right of it, but rows down where some distant branch ends).
export function _firstFreeColumnSlot(colX, startY) {
  let y = startY;
  for (;;) {
    const taken = Object.values(state.positions).some(p => p &&
      Math.abs(p.x - colX) < _GRID_LAYER_GAP / 2 && Math.abs(p.y - y) < _GRID_COL_GAP / 2);
    if (!taken) return y;
    y += _GRID_COL_GAP;
  }
}
