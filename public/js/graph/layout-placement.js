// Find nearby space for new graph nodes without moving saved nodes.
import { state } from '../core/state.js';
import { GRID_SIZE } from './viewport.js';
import { _avgPoint } from './layout-helpers.js';
import { _buildPlacedEdges, _evaluateLocalCandidate } from './layout-geometry.js';
import { _LOCAL_PLACE_RADII, _LOCAL_PLACE_ANGLES, _LOCAL_SOFT_NODE_GAP } from './layout-constants.js';

export function _chooseOpenPosition(sec, posMap, neighbors, preferred, options = {}) {
  const anchors = options.anchorIds ?? (neighbors.incoming.length ? neighbors.incoming : neighbors.all);
  const center = _avgPoint(anchors, posMap) ?? (options.allowUnanchored ? preferred : null);
  if (!center) return null;
  const snap = options.snapToGrid ?? state.snapToGrid;
  const edges = _buildPlacedEdges(posMap, sec);
  const nodes = Object.entries(posMap);
  let localNodes = nodes, localEdges = edges;
  // Anything outside this envelope cannot intersect a candidate or its connectors.
  // Narrow it per ring so a large book does not make every score scan the whole map.
  const scope = radius => {
    const points = [preferred, ...neighbors.all.map(id => posMap[id])];
    let left = center.x - radius, right = center.x + radius;
    let top = center.y - radius, bottom = center.y + radius;
    for (const point of points) {
      left = Math.min(left, point.x); right = Math.max(right, point.x);
      top = Math.min(top, point.y); bottom = Math.max(bottom, point.y);
    }
    const padding = _LOCAL_SOFT_NODE_GAP + GRID_SIZE;
    left -= padding; right += padding; top -= padding; bottom += padding;
    localNodes = nodes.filter(([, p]) => p && p.x >= left && p.x <= right && p.y >= top && p.y <= bottom);
    localEdges = edges.filter(e => Math.max(e.a.x, e.b.x) >= left && Math.min(e.a.x, e.b.x) <= right
      && Math.max(e.a.y, e.b.y) >= top && Math.min(e.a.y, e.b.y) <= bottom);
  };
  const seen = new Set();
  const evaluate = point => {
    const candidate = snap
      ? { x: Math.round(point.x / GRID_SIZE) * GRID_SIZE, y: Math.round(point.y / GRID_SIZE) * GRID_SIZE }
      : point;
    const key = `${candidate.x},${candidate.y}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const evaluated = _evaluateLocalCandidate(candidate, anchors, neighbors.all, posMap, localEdges, localNodes);
    evaluated.score += Math.hypot(candidate.x - preferred.x, candidate.y - preferred.y) * (options.directionWeight ?? 0);
    return { ...candidate, ...evaluated };
  };
  scope(0);
  let best = evaluate(preferred);
  if (best.crowding === 0) return { x: best.x, y: best.y };
  const heading = Math.atan2(preferred.y - center.y, preferred.x - center.x);
  for (const radius of [..._LOCAL_PLACE_RADII, 440, 520, 650, 780]) {
    scope(radius);
    let clear = null;
    for (let i = 0; i < _LOCAL_PLACE_ANGLES; i++) {
      const angle = heading + i * Math.PI * 2 / _LOCAL_PLACE_ANGLES;
      const candidate = evaluate({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
      if (!candidate) continue;
      if (!best || candidate.score < best.score) best = candidate;
      if (candidate.crowding === 0 && (!clear || candidate.score < clear.score)) clear = candidate;
    }
    if (clear) return { x: clear.x, y: clear.y };
  }
  return best ? { x: best.x, y: best.y } : null;
}
