import { state, parseSecId, isTerminal } from '../core/state.js';
import { _hasValidPos, naturalCompareIds } from './helpers.js';
import { GRID_SIZE } from './viewport.js';
import { _GRID_LAYER_GAP } from './layout-constants.js';
import { _getPositionedNeighbors, _firstFreeColumnSlot } from './layout-helpers.js';

// Initial layout uses a BFS-depth grid; desktop grows rightward, mobile downward.

function _bfsDepth(startSec, allSections) {
  const depth = new Map();
  if (startSec === undefined || startSec === null || !allSections.has(startSec)) return depth;
  depth.set(startSec, 0);
  const queue = [startSec];
  while (queue.length) {
    const cur = queue.shift();
    const choices = state.graph[cur]?.choices || [];
    for (const raw of choices) {
      // Normalize raw choice IDs before strict Map/Set lookup.
      const c = parseSecId(raw);
      if (c === null || isTerminal(c) || depth.has(c) || !allSections.has(c)) continue;
      depth.set(c, depth.get(cur) + 1);
      queue.push(c);
    }
  }
  return depth;
}

// Never move saved positions.
// Anchor new nodes to positioned neighbors; use start-relative depth only for an unpositioned bulk layout.
export function _assignGridPositions(allSections, startSec) {
  const missing = [...allSections].filter(sec => !_hasValidPos(state.positions[sec]));
  if (!missing.length) return false;
  const depth = _bfsDepth(startSec, allSections);
  const maxDepth = depth.size ? Math.max(...depth.values()) : 0;
  // Process shallow BFS depths first so children can anchor to newly positioned parents.
  missing.sort((a, b) => (depth.get(a) ?? maxDepth + 1) - (depth.get(b) ?? maxDepth + 1) || naturalCompareIds(a, b));
  for (const sec of missing) {
    const neighbors = _getPositionedNeighbors(sec, state.positions);
    // Prefer incoming parents; outgoing edges must not pull new options away from their source.
    const anchors = neighbors.incoming.length ? neighbors.incoming : neighbors.all;
    let x, yStart;
    if (anchors.length) {
      // Anchor both axes to the same parent, stacking siblings downward.
      const anchorId = anchors.reduce((a, b) => (state.positions[a].x >= state.positions[b].x ? a : b));
      x = state.positions[anchorId].x + _GRID_LAYER_GAP;
      yStart = state.positions[anchorId].y;
    } else {
      x = (depth.has(sec) ? depth.get(sec) : maxDepth + 1) * _GRID_LAYER_GAP;
      yStart = 0;
    }
    let y = _firstFreeColumnSlot(x, yStart);
    // Snap new placements when enabled; grid spacing is not necessarily a multiple of GRID_SIZE.
    if (state.snapToGrid) {
      x = Math.round(x / GRID_SIZE) * GRID_SIZE;
      y = Math.round(y / GRID_SIZE) * GRID_SIZE;
    }
    state.positions[sec] = { x, y };
  }
  return true;
}
