import { state, parseSecId, isTerminal } from '../core/state.js';
import { _hasValidPos } from './helpers.js';
import { _GRID_LAYER_GAP, _GRID_COL_GAP } from './layout-constants.js';

export function _getPositionedNeighbors(sec, posMap) {
  // Compare normalized IDs so numeric strings cannot hide a real connection.
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

// Search free slots downward from the local parent height, not the global column bottom.
export function _firstFreeColumnSlot(colX, startY) {
  let y = startY;
  for (;;) {
    const taken = Object.values(state.positions).some(p => p &&
      Math.abs(p.x - colX) < _GRID_LAYER_GAP / 2 && Math.abs(p.y - y) < _GRID_COL_GAP / 2);
    if (!taken) return y;
    y += _GRID_COL_GAP;
  }
}
