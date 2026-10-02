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
          // Same raw-vs-normalized trap as _bfsDepth/_getPositionedNeighbors -
          // .includes(id) is strict-equality, so a raw un-normalized choices
          // entry can silently miss a real sibling connection here too.
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

// Directional placement for in-app reading on books whose layout isn't the
// BFS grid: a new node with a positioned incoming parent (i.e. an option of
// the node just stepped on) goes one column to the RIGHT of that parent,
// siblings stacking downward in that column - instead of _chooseLocalPosition's
// directionless radial ring, which scattered new options below/around the
// parent with no rightward growth. Only used when at least one incoming
// parent is positioned; anything parentless falls through to the radial
// scoring. Mirrors the grid regime's parent-anchored placement and mobile's
// always-parent-relative _layout().
function _chooseDirectionalPosition(sec) {
  const { incoming } = _getPositionedNeighbors(sec, state.positions);
  if (!incoming.length) return null;
  const parentId  = incoming.reduce((a, b) => (state.positions[a].x >= state.positions[b].x ? a : b));
  const parentPos = state.positions[parentId];
  const colX = parentPos.x + _GRID_LAYER_GAP;
  // First sibling sits at the parent's own height, later ones stack below it
  // (_firstFreeColumnSlot is a local first-free-slot search, not the grid's
  // old whole-map bottom-of-column scan).
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
      // A newly-added node was never hand-placed by the user, so snapping it
      // doesn't touch anything the "snap never retroactive" rule protects -
      // unlike a drag, there's no existing deliberate placement to disturb.
      // Snapped after scoring (not during candidate search) so the overlap-
      // avoidance scoring above still works against real, unrounded
      // neighbor positions; the rounding can occasionally land a new node a
      // little closer to a neighbor than the scoring intended, same
      // trade-off the drag-end snap already accepts.
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
