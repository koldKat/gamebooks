import { state, parseSecId } from '../core/state.js';
import { _hasValidPos, naturalCompareIds } from './helpers.js';
import { GRID_SIZE } from './viewport.js';
import { _LOCAL_PLACE_RADII, _LOCAL_PLACE_ANGLES, _GRID_LAYER_GAP } from './layout-constants.js';
import { _getPositionedNeighbors, _avgPoint, _firstFreeColumnSlot } from './layout-helpers.js';
import { _buildPlacedEdges, _scoreLocalCandidate } from './layout-geometry.js';

function _chooseLocalPosition(sec, posMap) {
  const { incoming, all } = _getPositionedNeighbors(sec, posMap);
  if (!all.length) return null;

  const anchorIds = incoming.length ? incoming : all;
  const center = _avgPoint(anchorIds, posMap);
  if (!center) return null;

  const placedEdges = _buildPlacedEdges(posMap, sec);
  const siblingBias = incoming.length
    ? _avgPoint(
        Object.keys(posMap)
          .map(parseSecId)
          // Normalize numeric/string choice IDs before comparing sibling connections.
          .filter(id => id !== sec && incoming.some(parent => (state.graph[parent]?.choices || []).some(c => parseSecId(c) === id))),
        posMap
      )
    : null;

  let startAngle = -Math.PI / 2;
  if (incoming.length === 1) {
    const parentPos = posMap[incoming[0]];
    if (siblingBias) {
      startAngle = Math.atan2(parentPos.y - siblingBias.y, parentPos.x - siblingBias.x);
    }
  }

  let best = null;
  for (const radius of _LOCAL_PLACE_RADII) {
    for (let i = 0; i < _LOCAL_PLACE_ANGLES; i++) {
      const angle = startAngle + (i / _LOCAL_PLACE_ANGLES) * Math.PI * 2;
      const candidate = {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      };
      const score = _scoreLocalCandidate(candidate, anchorIds, all, posMap, placedEdges);
      if (!best || score < best.score) best = { ...candidate, score };
      if (score < 1) return candidate;
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

// Place reading options right of positioned parents; parentless gaps use radial scoring.
function _chooseDirectionalPosition(sec) {
  const { incoming } = _getPositionedNeighbors(sec, state.positions);
  if (!incoming.length) return null;
  const parentId  = incoming.reduce((a, b) => (state.positions[a].x >= state.positions[b].x ? a : b));
  const parentPos = state.positions[parentId];
  const colX = parentPos.x + _GRID_LAYER_GAP;
  // Place the first sibling at parent height, then use local free slots below it.
  return { x: colX, y: _firstFreeColumnSlot(colX, parentPos.y) };
}

export function _assignLocalPositions(allSections) {
  let changed = false;
  let progressed = true;
  while (progressed) {
    progressed = false;
    const pending = [...allSections].filter(sec => !_hasValidPos(state.positions[sec]));
    pending.sort((a, b) => {
      const aNeighbors = _getPositionedNeighbors(a, state.positions).all.length;
      const bNeighbors = _getPositionedNeighbors(b, state.positions).all.length;
      return bNeighbors - aNeighbors || naturalCompareIds(a, b);
    });
    for (const sec of pending) {
      const pos = _chooseDirectionalPosition(sec) ?? _chooseLocalPosition(sec, state.positions);
      if (!pos) continue;
      // Snap only new nodes, after scoring; do not alter existing deliberate positions.
      if (state.snapToGrid) {
        pos.x = Math.round(pos.x / GRID_SIZE) * GRID_SIZE;
        pos.y = Math.round(pos.y / GRID_SIZE) * GRID_SIZE;
      }
      state.positions[sec] = pos;
      changed = true;
      progressed = true;
    }
  }
  return changed;
}
