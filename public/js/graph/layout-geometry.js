import { state, parseSecId, isTerminal } from '../core/state.js';
import { _hasValidPos } from './helpers.js';
import { _avgPoint } from './layout-helpers.js';
import { _LOCAL_PLACE_RADII, _LOCAL_MIN_NODE_GAP, _LOCAL_SOFT_NODE_GAP, _LOCAL_EDGE_CLEARANCE } from './layout-constants.js';

export function _buildPlacedEdges(posMap, excludeNode = null) {
  const edges = [];
  for (const [fromKey, data] of Object.entries(state.graph)) {
    const from = parseSecId(fromKey);
    if (excludeNode !== null && from === excludeNode) continue;
    if (!_hasValidPos(posMap[from])) continue;
    for (const raw of (data.choices || [])) {
      const to = parseSecId(raw);
      if (to === null || isTerminal(to) || !_hasValidPos(posMap[to])) continue;
      if (excludeNode !== null && to === excludeNode) continue;
      edges.push({
        from,
        to,
        a: posMap[from],
        b: posMap[to],
      });
    }
  }
  return edges;
}

function _orientation(a, b, c) {
  const v = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(v) < 0.0001) return 0;
  return v > 0 ? 1 : 2;
}

function _segmentsIntersect(a, b, c, d) {
  const o1 = _orientation(a, b, c);
  const o2 = _orientation(a, b, d);
  const o3 = _orientation(c, d, a);
  const o4 = _orientation(c, d, b);
  return o1 !== o2 && o3 !== o4;
}

function _pointToSegmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

export function _scoreLocalCandidate(candidate, anchors, neighbors, posMap, placedEdges) {
  return _evaluateLocalCandidate(candidate, anchors, neighbors, posMap, placedEdges).score;
}

export function _evaluateLocalCandidate(candidate, anchors, neighbors, posMap, placedEdges, placedNodes = Object.entries(posMap)) {
  let score = 0;
  let distanceCost = 0;

  for (const [, pos] of placedNodes) {
    if (!_hasValidPos(pos)) continue;
    if (Math.abs(candidate.x - pos.x) >= _LOCAL_SOFT_NODE_GAP || Math.abs(candidate.y - pos.y) >= _LOCAL_SOFT_NODE_GAP) continue;
    const d = Math.hypot(candidate.x - pos.x, candidate.y - pos.y);
    if (d < _LOCAL_MIN_NODE_GAP) score += 100000 + (_LOCAL_MIN_NODE_GAP - d) * 2500;
    else if (d < _LOCAL_SOFT_NODE_GAP) score += (_LOCAL_SOFT_NODE_GAP - d) * 30;
  }

  let totalDist = 0;
  neighbors.forEach(id => {
    const pos = posMap[id];
    if (!pos) return;
    const segLen = Math.hypot(candidate.x - pos.x, candidate.y - pos.y);
    totalDist += segLen;
    if (segLen > _LOCAL_PLACE_RADII[_LOCAL_PLACE_RADII.length - 1]) {
      distanceCost += (segLen - _LOCAL_PLACE_RADII[_LOCAL_PLACE_RADII.length - 1]) * 20;
    }
    // Keep a new connector away from other nodes along its whole route.
    const pathGap = _LOCAL_MIN_NODE_GAP / 2;
    const left = Math.min(candidate.x, pos.x) - pathGap, right = Math.max(candidate.x, pos.x) + pathGap;
    const top = Math.min(candidate.y, pos.y) - pathGap, bottom = Math.max(candidate.y, pos.y) + pathGap;
    for (const [key, point] of placedNodes) {
      if (!_hasValidPos(point) || point.x < left || point.x > right || point.y < top || point.y > bottom || parseSecId(key) === id) continue;
      const clearance = _pointToSegmentDistance(point, candidate, pos);
      if (clearance < _LOCAL_MIN_NODE_GAP / 2) score += 2000 + (_LOCAL_MIN_NODE_GAP / 2 - clearance) * 300;
    }
    for (const edge of placedEdges) {
      if (edge.from === id || edge.to === id) continue;
      if (_segmentsIntersect(candidate, pos, edge.a, edge.b)) score += 900;
    }
  });
  if (neighbors.length) {
    const avgDist = totalDist / neighbors.length;
    distanceCost += avgDist * 0.08;
  }

  for (const edge of placedEdges) {
    if (candidate.x < Math.min(edge.a.x, edge.b.x) - _LOCAL_EDGE_CLEARANCE || candidate.x > Math.max(edge.a.x, edge.b.x) + _LOCAL_EDGE_CLEARANCE
        || candidate.y < Math.min(edge.a.y, edge.b.y) - _LOCAL_EDGE_CLEARANCE || candidate.y > Math.max(edge.a.y, edge.b.y) + _LOCAL_EDGE_CLEARANCE) continue;
    const clearance = _pointToSegmentDistance(candidate, edge.a, edge.b);
    if (clearance < _LOCAL_EDGE_CLEARANCE) score += (_LOCAL_EDGE_CLEARANCE - clearance) * 45;
  }

  if (anchors.length) {
    const centroid = _avgPoint(anchors, posMap);
    const centroidDist = Math.hypot(candidate.x - centroid.x, candidate.y - centroid.y);
    distanceCost += centroidDist * 0.03;
  }

  return { score: score + distanceCost, crowding: score };
}
