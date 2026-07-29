import { COLORS } from './constants.js?v=1';
import {
  state, viewingPt, isTerminal, parseSecId, isValidSecId,
  currentPlaythrough, allDiscoveredSections, saveState,
} from './state.js?v=11';
import { t } from './i18n.js?v=19';

export let network  = null;
export let visNodes = null;
export let visEdges = null;

// Bounds for persisted zoom level - keeps an accidental pinch/scroll zoom-out
// (e.g. from a child mashing the trackpad) from getting saved and then
// permanently re-applied on every future load, leaving the chart stuck as a dot.
export const MIN_VIEWPORT_SCALE = 0.3;
export const MAX_VIEWPORT_SCALE = 3;
export function clampViewportScale(scale) {
  return Math.min(MAX_VIEWPORT_SCALE, Math.max(MIN_VIEWPORT_SCALE, scale));
}

let _stabilizeHandler  = null;

// ── Overlay draw cache ────────────────────────────────────────────────────────
// Rebuilt in syncGraph() (state-change time), consumed in drawOverlays() (per frame).
// Avoids iterating all nodes and calling measureText on every afterDrawing event.
const _NOTE_FONT      = '10px Segoe UI, system-ui, sans-serif';
const _NOTE_PAD_X     = 5;
const _NOTE_PAD_Y     = 3;
const _NOTE_LINE_H    = 12;
const _NOTE_FONT_PX   = 10;
const _measureCtx     = document.createElement('canvas').getContext('2d');

// Nodes that need any overlay drawn - only these are passed to getPositions().
let _overlayNodeIds  = [];
// Per-node overlay descriptor: { sec, priority, battle, note, noteLayout? }
let _overlayNodes    = [];
// Separate map for pinned-note layout (also a subset of _overlayNodes).
let _noteLabelCache  = new Map(); // sec → { lines, boxW, boxH }
// Cached positions (graph-space coords don't change during pan/zoom, only on drag).
let _overlayPositions      = {};
let _overlayPosDirty       = true;
let _overlayDraggingActive = false; // true while an overlay node is being dragged

function _buildOverlayCache() {
  _overlayNodeIds  = [];
  _overlayNodes    = [];
  _overlayPosDirty = true;
  _noteLabelCache.clear();
  _measureCtx.font = _NOTE_FONT;

  for (const [secId, data] of Object.entries(state.graph)) {
    if (!data.priority && !data.battle && !data.note) continue;
    const sec = parseSecId(secId);
    _overlayNodeIds.push(sec);
    let noteLayout = null;
    if (data.showNote && data.note) {
      const lines = data.note.split('\n');
      const boxW  = Math.max(...lines.map(l => _measureCtx.measureText(l).width)) + _NOTE_PAD_X * 2;
      const boxH  = _NOTE_PAD_Y * 2 + (lines.length - 1) * _NOTE_LINE_H + _NOTE_FONT_PX;
      noteLayout  = { lines, boxW, boxH };
      _noteLabelCache.set(sec, noteLayout);
    }
    _overlayNodes.push({ sec, priority: data.priority, battle: data.battle, note: data.note, noteLayout });
  }
}

const _LOCAL_PLACE_RADII = [135, 180, 225, 270, 315, 360];
const _LOCAL_PLACE_ANGLES = 20;
const _LOCAL_MIN_NODE_GAP = 40;
const _LOCAL_SOFT_NODE_GAP = 68;
const _LOCAL_EDGE_CLEARANCE = 18;

// ── Open world flag (set by main.js when book is opened) ─────────────────────
let _graphIsOpenWorld = false;
let _graphSeriesBooks = []; // [{id, name}] for tooltip resolution
let _graphCrossBookRoute = null; // Set<number> - sections reachable cross-book; null when not applicable
export function setGraphCrossBookRoute(routeMap) {
  // routeMap is the Map from _computeCrossBookReachability; we only need the keys.
  _graphCrossBookRoute = (routeMap && routeMap.size) ? new Set(routeMap.keys()) : null;
}
export function setGraphOpenWorld(v, seriesBooks = []) {
  _graphIsOpenWorld = !!v;
  _graphSeriesBooks = seriesBooks || [];
}

export function destroyNetwork() {
  if (network) { network.destroy(); network = null; }
  visNodes          = null;
  visEdges          = null;
  _stabilizeHandler = null;
  _graphIsOpenWorld = false;
  _graphSeriesBooks = [];
  _graphCrossBookRoute = null;
  _overlayPositions      = {};
  _overlayPosDirty       = true;
  _overlayDraggingActive = false;
}

// ── Edge appearance ──────────────────────────────────────────────────────────

// Walk forward through non-branching chains to find an inevitable outcome.
// Returns 'death', 'win', or null (branching / unmapped / cycle).
function inevitableOutcome(destId, visited = new Set()) {
  if (destId === -1) return 'death';
  if (destId === 0)  return 'win';
  if (visited.has(destId)) return null;
  visited.add(destId);
  const data = state.graph[destId];
  if (!data || data.choices.length !== 1) return null;
  return inevitableOutcome(data.choices[0], visited);
}

function edgeColor(dest) {
  const outcome = inevitableOutcome(dest);
  if (outcome === 'death') return { color: '#e74c3c', opacity: 0.8, highlight: '#e74c3c' };
  if (outcome === 'win')   return { color: '#27ae60', opacity: 0.8, highlight: '#27ae60' };
  return { color: '#4b5563', opacity: 0.7, highlight: '#9ca3af' };
}

// ── Node appearance ─────────────────────────────────────────────────────────

function _darkenHex(hex) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `#${[r,g,b].map(c => Math.round(c*0.6).toString(16).padStart(2,'0')).join('')}`;
}

// The "start" node to highlight follows whichever run is actually being
// displayed, not always the book's default `state.startSection` - a run
// begun via the alternate-start button (see play.js) has its own path[0],
// which may be a completely different node.
function _effectiveStartSec(displayPt) {
  if (displayPt?.path?.length && isValidSecId(displayPt.path[0])) return displayPt.path[0];
  return isValidSecId(state.startSection) ? state.startSection : 1;
}

function nodeColor(secId) {
  const pt        = currentPlaythrough();
  const displayPt = pt || viewingPt;
  const path      = displayPt ? displayPt.path : [];
  const cur       = (pt && path.length) ? path[path.length - 1] : null;
  const finalNode = (displayPt && displayPt.completed && path.length)
    ? path[path.length - 1] : null;

  // These states are always shown as-is, no battle border override
  const startSec = _effectiveStartSec(displayPt);
  if (secId === startSec) return COLORS.start;
  if (secId === cur) return COLORS.current;
  if (secId === finalNode) {
    if (displayPt.result === 'success') return COLORS.victory;
    if (displayPt.result === 'battle')  return COLORS.battleDeath;
    return COLORS.death;
  }

  // Determine base fill+border from normal rules
  let base;
  if (path.includes(secId)) {
    base = COLORS.visitedRun;
  } else if (!displayPt) {
    const ends          = state.playthroughs.filter(p =>
      p.completed && p.path.length && p.path[p.path.length - 1] === secId
    );
    const hasEndDeath   = ends.some(p => p.result === 'death');
    const hasEndBattle  = ends.some(p => p.result === 'battle');
    const hasEndVictory = ends.some(p => p.result === 'success');
    if ((hasEndDeath || hasEndBattle) && hasEndVictory) base = { background: '#b45309', border: '#f59e0b' };
    else if (hasEndDeath)   base = COLORS.death;
    else if (hasEndBattle)  base = COLORS.battleDeath;
    else if (hasEndVictory) base = COLORS.victory;
  }
  if (!base) {
    const choices    = state.graph[secId]?.choices || [];
    const hasDeath   = choices.includes(-1);
    const hasVictory = choices.includes(0);
    if (hasDeath && hasVictory) base = COLORS.bothOutline;
    else if (hasDeath)          base = COLORS.deathOutline;
    else if (hasVictory)        base = COLORS.victoryOutline;
    else if (state.graph[secId] && !state.graph[secId].discovered) base = COLORS.mapped;
    else                                                            base = COLORS.discovered;
  }

  // Custom color overrides base fill (not special states - those returned early above)
  const customColor = state.graph[secId]?.color;
  if (customColor) base = { background: customColor, border: _darkenHex(customColor) };

  // Battle flag: keep fill from base rules, override only the border
  if (state.graph[secId]?.battle) {
    return { background: base.background, border: COLORS.battleOutline.border };
  }

  return base;
}

function nodeLabel(secId) {
  const displayPt = currentPlaythrough() || viewingPt;
  const startSec  = _effectiveStartSec(displayPt);
  return secId === startSec ? `${secId}\nSTART` : String(secId);
}

function drawOverlays(ctx) {
  if (!_overlayNodeIds.length) return;

  // Graph-space coords are stable across pan/zoom; only refresh when nodes moved.
  // During an active drag of an overlay node, always fetch (skip caching).
  if (_overlayDraggingActive) {
    _overlayPositions = network.getPositions(_overlayNodeIds);
  } else if (_overlayPosDirty) {
    _overlayPositions = network.getPositions(_overlayNodeIds);
    _overlayPosDirty  = false;
  }
  const pos = _overlayPositions;

  ctx.lineCap = 'butt'; // reset to default before we begin

  for (const node of _overlayNodes) {
    const p = pos[node.sec];
    if (!p) continue;

    // ── Priority indicator (triangle, top-left) ───────────────────
    if (node.priority) {
      const hi = node.priority === 'high';
      const cx = p.x - 9, cy = p.y - 9, r = 5;
      ctx.beginPath();
      if (hi) {
        ctx.moveTo(cx,     cy - r);
        ctx.lineTo(cx + r, cy + r * 0.65);
        ctx.lineTo(cx - r, cy + r * 0.65);
      } else {
        ctx.moveTo(cx,     cy + r);
        ctx.lineTo(cx + r, cy - r * 0.65);
        ctx.lineTo(cx - r, cy - r * 0.65);
      }
      ctx.closePath();
      ctx.fillStyle   = hi ? '#4ade80' : '#f87171';
      ctx.fill();
      ctx.strokeStyle = hi ? '#14532d' : '#991b1b';
      ctx.lineWidth   = 0.8;
      ctx.stroke();
    }

    // ── Battle indicator (cross, bottom-right) ────────────────────
    if (node.battle) {
      const cx = p.x + 9, cy = p.y + 9, r = 4;
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth   = 1.5;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // ── Note indicator (book icon, top-right) ─────────────────────
    if (node.note) {
      const bx = p.x + 6, by = p.y - 13, bw = 6, bh = 8;
      ctx.fillStyle   = '#16a34a';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth   = 0.8;
      ctx.beginPath();
      ctx.moveTo(bx + 2, by + 1);
      ctx.lineTo(bx + 2, by + bh - 1);
      ctx.stroke();
    }

    // ── Pinned note text ──────────────────────────────────────────
    if (node.noteLayout) {
      const { lines, boxW, boxH } = node.noteLayout;
      const bx = p.x + 18, by = p.y - boxH / 2;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 3);
      ctx.fill();
      ctx.strokeStyle = '#374151';
      ctx.lineWidth   = 0.6;
      ctx.stroke();
      ctx.font         = _NOTE_FONT;
      ctx.textBaseline = 'top';
      ctx.fillStyle    = '#d1d5db';
      for (let i = 0; i < lines.length; i++)
        ctx.fillText(lines[i], bx + _NOTE_PAD_X, by + _NOTE_PAD_Y + i * _NOTE_LINE_H);
    }
  }
}

function nodeTitle(secId) {
  const data = state.graph[secId];
  if (!data) return t('node.unmapped', { n: secId });

  const real     = data.choices.filter(c => !isTerminal(c));
  const hasDeath = data.choices.includes(-1);
  const hasWin   = data.choices.includes(0);
  const parts    = [];
  if (real.length)  parts.push(t('node.goes_to', { list: real.join(', ') }));
  if (hasDeath)     parts.push(t('node.can_die'));
  if (hasWin)       parts.push(t('node.can_win'));
  const lines = [t('node.section', { n: secId, parts: parts.join(' | ') })];
  if (data.battle)              lines.push(`Battle: ${t('node.battle')}`);
  if (data.priority === 'high') lines.push(`▲ ${t('ctx.priority.high')}`);
  if (data.priority === 'low')  lines.push(`▼ ${t('ctx.priority.low')}`);
  if (data.note) { lines.push('Note:'); data.note.split('\n').forEach(part => lines.push(part)); }
  const el = document.createElement('div');
  lines.forEach((line, i) => {
    if (i > 0) el.appendChild(document.createElement('br'));
    el.appendChild(document.createTextNode(line));
  });
  return el;
}

function _getPositionedNeighbors(sec, posMap) {
  const incoming = [];
  const outgoing = [];
  for (const [srcKey, data] of Object.entries(state.graph)) {
    const src = parseSecId(srcKey);
    if (src === sec) {
      for (const dest of (data.choices || [])) {
        if (!isTerminal(dest) && posMap[dest]) outgoing.push(dest);
      }
      continue;
    }
    if ((data.choices || []).includes(sec) && posMap[src]) incoming.push(src);
  }
  return { incoming, outgoing, all: [...incoming, ...outgoing] };
}

function _avgPoint(ids, posMap) {
  if (!ids.length) return null;
  let x = 0;
  let y = 0;
  ids.forEach(id => {
    x += posMap[id].x;
    y += posMap[id].y;
  });
  return { x: x / ids.length, y: y / ids.length };
}

function _buildPlacedEdges(posMap, excludeNode = null) {
  const edges = [];
  for (const [fromKey, data] of Object.entries(state.graph)) {
    const from = parseSecId(fromKey);
    if (excludeNode !== null && from === excludeNode) continue;
    if (!posMap[from]) continue;
    for (const to of (data.choices || [])) {
      if (isTerminal(to) || !posMap[to]) continue;
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

function _scoreLocalCandidate(candidate, anchors, neighbors, posMap, placedEdges) {
  let score = 0;

  for (const [id, pos] of Object.entries(posMap)) {
    if (neighbors.includes(parseSecId(id))) continue;
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
      score += (segLen - _LOCAL_PLACE_RADII[_LOCAL_PLACE_RADII.length - 1]) * 20;
    }
    for (const edge of placedEdges) {
      if (edge.from === id || edge.to === id) continue;
      if (_segmentsIntersect(candidate, pos, edge.a, edge.b)) score += 900;
    }
  });
  if (neighbors.length) {
    const avgDist = totalDist / neighbors.length;
    score += avgDist * 0.08;
  }

  for (const edge of placedEdges) {
    const clearance = _pointToSegmentDistance(candidate, edge.a, edge.b);
    if (clearance < _LOCAL_EDGE_CLEARANCE) score += (_LOCAL_EDGE_CLEARANCE - clearance) * 45;
  }

  if (anchors.length) {
    const centroid = _avgPoint(anchors, posMap);
    const centroidDist = Math.hypot(candidate.x - centroid.x, candidate.y - centroid.y);
    score += centroidDist * 0.03;
  }

  return score;
}

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
          .filter(id => id !== sec && incoming.some(parent => (state.graph[parent]?.choices || []).includes(id))),
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

function _assignLocalPositions(allSections) {
  let changed = false;
  let progressed = true;
  while (progressed) {
    progressed = false;
    const pending = [...allSections].filter(sec => !state.positions[sec]);
    pending.sort((a, b) => {
      const aNeighbors = _getPositionedNeighbors(a, state.positions).all.length;
      const bNeighbors = _getPositionedNeighbors(b, state.positions).all.length;
      return bNeighbors - aNeighbors || naturalCompareIds(a, b);
    });
    for (const sec of pending) {
      const pos = _chooseLocalPosition(sec, state.positions);
      if (!pos) continue;
      state.positions[sec] = pos;
      changed = true;
      progressed = true;
    }
  }
  return changed;
}

function naturalCompareIds(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

// ── Connector style ──────────────────────────────────────────────────────────

const CONNECTOR_STYLES = {
  curvedCW:   { enabled: true, type: 'curvedCW',    roundness: 0.2 },
  curvedCCW:  { enabled: true, type: 'curvedCCW',   roundness: 0.2 },
  cubic:      { enabled: true, type: 'cubicBezier', roundness: 0.4, forceDirection: 'none' },
  horizontal: { enabled: true, type: 'cubicBezier', roundness: 0.4, forceDirection: 'horizontal' },
  straight:   { enabled: false },
};

function _smoothOption(style) {
  return CONNECTOR_STYLES[style] ?? CONNECTOR_STYLES.curvedCW;
}

export function applyConnectorStyle(style) {
  if (!network) return;
  network.setOptions({ edges: { smooth: _smoothOption(style) } });
}

// ── Graph lifecycle ─────────────────────────────────────────────────────────

export function initGraph() {
  if (!window.vis?.DataSet || !window.vis?.Network) {
    const container = document.getElementById('graph-container');
    if (container) {
      container.innerHTML = '<div class="graph-load-error">Graph library failed to load. Refresh the page or check the local vis-network asset.</div>';
    }
    throw new Error('vis-network failed to load');
  }

  visNodes = new vis.DataSet();
  visEdges = new vis.DataSet();

  const hasSavedLayout = Object.keys(state.positions).length > 0;

  const options = {
    nodes: {
      shape: 'dot',
      size: 14,
      font: { size: 11, color: '#ffffff', face: 'Segoe UI, system-ui, sans-serif' },
      borderWidth: 2,
    },
    edges: {
      arrows: { to: { enabled: true, scaleFactor: 0.5 } },
      color: { color: '#4b5563', opacity: 0.7, highlight: '#9ca3af' },
      smooth: _smoothOption(state.connectorStyle),
      width: 1.2,
    },
    physics: hasSavedLayout ? { enabled: false } : {
      enabled: true,
      solver: 'forceAtlas2Based',
      forceAtlas2Based: {
        gravitationalConstant: -120,
        springLength: 160,
        springConstant: 0.05,
        damping: 0.5,
        avoidOverlap: 1,
      },
      stabilization: { iterations: 300, updateInterval: 50 },
    },
    interaction: {
      hover: true,
      zoomView: true,
      dragView: true,
      tooltipDelay: 150,
    },
    layout: { improvedLayout: !hasSavedLayout },
  };

  network = new vis.Network(
    document.getElementById('graph-container'),
    { nodes: visNodes, edges: visEdges },
    options
  );

  if (!hasSavedLayout) {
    _stabilizeHandler = () => {
      network.setOptions({ physics: { enabled: false } });
      state.positions = network.getPositions();
      saveState();
      network.off('stabilizationIterationsDone', _stabilizeHandler);
      _stabilizeHandler = null;
    };
    network.on('stabilizationIterationsDone', _stabilizeHandler);
  }

  network.on('afterDrawing', ctx => drawOverlays(ctx));

  let dragSaveTimer    = null;
  let viewportSaveTimer = null;

  const freezeCurrentLayout = () => {
    network.setOptions({ physics: { enabled: false } });
    Object.assign(state.positions, network.getPositions());
    saveState();
  };

  const saveViewport = () => {
    clearTimeout(viewportSaveTimer);
    viewportSaveTimer = setTimeout(() => {
      state.viewport = { scale: clampViewportScale(network.getScale()) };
      saveState();
    }, 500);
  };

  network.on('zoom', saveViewport);

  network.on('dragStart', params => {
    if (!params.nodes.length) return;
    // Manual node dragging should take over immediately instead of fighting
    // the initial physics solver, which feels "bouncy" on freshly created maps.
    if (_stabilizeHandler) {
      network.off('stabilizationIterationsDone', _stabilizeHandler);
      _stabilizeHandler = null;
    }
    freezeCurrentLayout();
    // If any dragged node has an overlay, fetch positions every frame during drag.
    if (params.nodes.some(id => _overlayNodeIds.includes(id))) {
      _overlayDraggingActive = true;
    }
  });

  network.on('dragEnd', params => {
    if (params.nodes.length) {
      Object.assign(state.positions, network.getPositions(params.nodes));
      visNodes.update(params.nodes.map(id => ({ id, physics: false })));
      clearTimeout(dragSaveTimer);
      dragSaveTimer = setTimeout(saveState, 1000);
      _overlayDraggingActive = false;
      _overlayPosDirty = true;
    }
  });
}

function _portalNodeTitle(secId, portals) {
  if (!portals || !portals.length) return null;
  const el = document.createElement('div');
  el.appendChild(document.createTextNode('Portal destinations:'));
  portals.forEach(p => {
    el.appendChild(document.createElement('br'));
    const bookName = _graphSeriesBooks.find(b => b.id === p.targetBookId)?.name ?? `Book #${p.targetBookId}`;
    const lbl = p.label || `⇒ ${bookName} ${p.targetSection}`;
    el.appendChild(document.createTextNode(lbl));
  });
  return el;
}

export function syncGraph() {
  if (!visNodes || !visEdges) return;

  const allSections = allDiscoveredSections();

  const hasSavedPositions = Object.keys(state.positions).length > 0;
  const locallyPlaced = hasSavedPositions ? _assignLocalPositions(allSections) : false;

  const nodeUpdates = [];
  let hasUnpositioned = false;
  const startSec = _effectiveStartSec(currentPlaythrough() || viewingPt);
  allSections.forEach(sec => {
    const pos         = state.positions[sec];
    const choices     = state.graph[sec]?.choices || [];
    const hasTerminal = choices.some(isTerminal);
    const hasBattle   = !!state.graph[sec]?.battle;
    const portals     = _graphIsOpenWorld ? (state.graph[sec]?.portals || []) : [];
    const isPortal    = portals.length > 0;
    const isXBookReachable = !!(_graphCrossBookRoute && _graphCrossBookRoute.has(sec));
    if (!pos) hasUnpositioned = true;
    const nodeUpdate = {
      id:          sec,
      label:       isPortal ? `${nodeLabel(sec)}\n⇒` : nodeLabel(sec),
      color:       isPortal
        ? { background: '#0e7490', border: '#0891b2', highlight: { background: '#0891b2', border: '#38bdf8' } }
        : (isXBookReachable
          ? { ...nodeColor(sec), border: '#22d3ee', highlight: { ...(nodeColor(sec).highlight || {}), border: '#67e8f9' } }
          : nodeColor(sec)),
      title:       _portalNodeTitle(sec, portals) || nodeTitle(sec),
      shape:       isPortal ? 'diamond' : 'dot',
      size:        isPortal ? 16 : 14,
      borderWidth: (hasTerminal || hasBattle) ? 4 : (isXBookReachable ? 3 : 2),
      shapeProperties: isXBookReachable ? { borderDashes: [4, 3] } : { borderDashes: false },
      font:        sec === startSec ? { size: 11, color: '#fde047', face: 'Segoe UI, system-ui, sans-serif', bold: true } : undefined,
      physics:     !pos,
      ...(pos ? { x: pos.x, y: pos.y } : {}),
    };
    nodeUpdates.push(nodeUpdate);
  });
  visNodes.update(nodeUpdates);

  visNodes.getIds().forEach(id => {
    if (!allSections.has(id)) visNodes.remove(id);
  });

  const displayPt  = currentPlaythrough() || viewingPt;
  const runPath    = displayPt ? displayPt.path : [];
  const runEdges   = new Set();
  for (let i = 0; i < runPath.length - 1; i++) runEdges.add(`${runPath[i]}>${runPath[i + 1]}`);

  const liveEdgeIds = new Set();
  const edgeUpdates = [];
  Object.entries(state.graph).forEach(([sec, data]) => {
    data.choices.forEach(dest => {
      if (isTerminal(dest)) return;
      const eid       = `${sec}>${dest}`;
      const isRunEdge = runEdges.has(eid);
      liveEdgeIds.add(eid);
      const outcome = inevitableOutcome(dest);
      const color   = outcome === 'death' ? { color: '#e74c3c', opacity: 0.8, highlight: '#e74c3c' }
                    : outcome === 'win'   ? { color: '#27ae60', opacity: 0.8, highlight: '#27ae60' }
                    : isRunEdge          ? { color: '#f5a623', opacity: 1,   highlight: '#f5a623' }
                    :                      { color: '#4b5563', opacity: 0.7, highlight: '#9ca3af' };
      edgeUpdates.push({
        id:    eid,
        from:  parseSecId(sec),
        to:    dest,
        color,
        width: isRunEdge ? 2.5 : 1.2,
      });
    });
  });
  visEdges.update(edgeUpdates);
  visEdges.getIds().forEach(id => {
    if (!liveEdgeIds.has(id)) visEdges.remove(id);
  });

  if (locallyPlaced && !hasUnpositioned) saveState();

  _buildOverlayCache();

  // Physics management:
  // - Initial layout (no saved positions): initGraph owns physics; don't interfere.
  // - Existing layout, new nodes added: re-enable physics to place them, save on settle.
  // - Existing layout, all nodes positioned: keep physics off.
  if (hasSavedPositions && hasUnpositioned) {
    if (_stabilizeHandler) network.off('stabilizationIterationsDone', _stabilizeHandler);
    _stabilizeHandler = () => {
      network.setOptions({ physics: { enabled: false } });
      Object.assign(state.positions, network.getPositions());
      saveState();
      network.off('stabilizationIterationsDone', _stabilizeHandler);
      _stabilizeHandler = null;
    };
    network.on('stabilizationIterationsDone', _stabilizeHandler);
    network.setOptions({ physics: { enabled: true, stabilization: { fit: false } } });
    network.stabilize(300);
  } else if (hasSavedPositions) {
    network.setOptions({ physics: { enabled: false } });
  }
}

// ── Node deletion ───────────────────────────────────────────────────────────

export function subtreeToDelete(rootId) {
  const toDelete = new Set([rootId]);
  const queue    = [rootId];
  while (queue.length) {
    const cur  = queue.shift();
    const data = state.graph[cur];
    if (data) {
      data.choices.forEach(child => {
        if (!isTerminal(child) && !toDelete.has(child)) {
          toDelete.add(child);
          queue.push(child);
        }
      });
    }
  }
  // Remove nodes still reachable from any known entry point without passing through
  // rootId. The direct-parent check fails for cycles: a back-edge can pull ancestors
  // into toDelete even though they remain reachable from a graph root. A book can have
  // more than one real root once the alternate-start button (play.js) has been used to
  // begin runs at a different section - each run's own path[0] is just as much a "root"
  // as state.startSection, so a node only reachable from an alternate start (not from
  // state.startSection) must still be protected from being swept up as a false orphan.
  const roots = new Set([isValidSecId(state.startSection) ? state.startSection : 1]);
  (state.playthroughs || []).forEach(pt => {
    if (isValidSecId(pt?.path?.[0])) roots.add(pt.path[0]);
  });
  const reachable = new Set(roots);
  const bfsQ = [...roots];
  while (bfsQ.length) {
    const cur = bfsQ.shift();
    if (cur === rootId) continue; // treat rootId as removed
    for (const child of (state.graph[cur]?.choices ?? [])) {
      if (!isTerminal(child) && !reachable.has(child)) {
        reachable.add(child);
        bfsQ.push(child);
      }
    }
  }
  toDelete.forEach(node => {
    if (node !== rootId && reachable.has(node)) toDelete.delete(node);
  });
  return toDelete;
}

// ── Fast-travel pathfinding ─────────────────────────────────────────────────

// Graph-agnostic BFS: can `from` reach `to` in the given graph object?
export function canReachInGraph(graph, from, to) {
  if (from == null || to == null || from === to) return false;
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const node = queue.shift();
    for (const next of (graph[node]?.choices ?? [])) {
      if (next === -1 || next === 0) continue;
      if (next === to) return true;
      if (!seen.has(next) && graph[next]) { seen.add(next); queue.push(next); }
    }
  }
  return false;
}

// Returns a Set of all sections reachable from `from` in the given graph (excluding `from` and terminals).
export function allReachableInGraph(graph, from) {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const node = queue.shift();
    for (const next of (graph[node]?.choices ?? [])) {
      if (next === -1 || next === 0) continue; // skip death/win terminals
      if (!seen.has(next) && graph[next]) { seen.add(next); queue.push(next); }
    }
  }
  seen.delete(from);
  return seen;
}

// Quick forward-reachability check (BFS, follows directed edges only).
export function canReach(from, to) {
  if (from === to) return false;
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const node = queue.shift();
    for (const next of (state.graph[node]?.choices ?? [])) {
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
      for (const next of (state.graph[node]?.choices ?? [])) {
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

// Find path from `from` to `to` that passes through the most nodes with
// priority === `want`. Uses BFS with per-node best-score tracking to prune
// dominated paths (reached the same node with equal-or-better score via an
// equal-or-shorter path) while allowing generous detours.
function _findMaxPriorityPath(from, to, want, bfsPath) {
  // Allow up to (bfsPath.length) extra hops - generous for large books, capped
  // so the queue doesn't blow up on tiny books with huge graphs.
  const maxLen  = bfsPath.length + Math.max(10, bfsPath.length);
  let bestPath  = bfsPath;
  let bestScore = _countPriority(bfsPath, want);

  // bestAt[node] = { score, len } - prune a new path to `node` only when a
  // previous one already reached it with score >= new AND length <= new
  // (strictly dominated on both axes).
  const bestAt = new Map([[from, { score: 0, len: 1 }]]);
  const queue  = [{ path: [from], score: 0 }];

  while (queue.length) {
    const { path, score } = queue.shift();
    const node = path[path.length - 1];
    if (path.length >= maxLen) continue;

    for (const next of (state.graph[node]?.choices ?? [])) {
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
    for (const next of choices) {
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

// Caller is responsible for clearing viewingPt if needed and calling render()
export function deleteNodes(ids) {
  ids.forEach(id => {
    delete state.graph[id];
    delete state.positions[id];
    Object.values(state.graph).forEach(data => {
      data.choices = data.choices.filter(c => c !== id);
    });
  });
  // Sections left with no choices are effectively unmapped - unless they are part
  // of a playthrough path (visited nodes keep their graph entry, priority and note),
  // or they carry metadata worth not silently discarding (matches the same
  // safeguard in play.js's _cleanupOrphanedTargets).
  const visited = new Set(state.playthroughs.flatMap(pt => pt.path));
  Object.keys(state.graph).forEach(sec => {
    const node = state.graph[sec];
    const hasMetadata = node.note || node.priority || node.battle || node.color || node.portals || node.showNote;
    if (node.choices.length === 0 && !visited.has(parseSecId(sec)) && !hasMetadata)
      delete state.graph[sec];
  });
  // Trim paths and reopen any affected run
  state.playthroughs.forEach((pt, i) => {
    const cutAt = pt.path.findIndex(s => ids.has(s));
    if (cutAt !== -1) {
      pt.path      = pt.path.slice(0, cutAt);
      pt.completed = false;
      pt.result    = null;
      if (!pt.path.length) pt.path = [1];
      if (state.activePtIndex === i) state.activePtIndex = null;
    }
  });
  saveState();
}
