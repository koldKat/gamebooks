// Touch graph renderer without desktop interaction imports.
// Use shared positions/colors, deterministic placement, and grid-snapped dragging; physics stays off.

import {
  state, currentPlaythrough, viewingPt, isTerminal, parseSecId, allDiscoveredSections, saveState,
} from '../../js/core/state.js';
import { COLORS } from '../../js/core/constants.js';
import { t } from '../../js/i18n.js';

const LAYER_GAP  = 120; // vertical spacing between BFS depth layers
const COL_GAP    = 90;  // horizontal spacing between siblings at the same layer
const GRID_SIZE  = 40;  // matches graph.js's own GRID_SIZE - shared state.positions data

// Use a fixed zoom rather than fitting the growing map.
const DEFAULT_SCALE = 1.15;

let network = null;
let visNodes = null;
let visEdges = null;
let _onTap = null;
let _onHold = null;
let _onDragStart = null;
let _lastSig = null;
let _dragSaveTimer = null;

// Rebuild metadata markers on refresh using desktop glyph geometry and colors.
let _overlayNodeIds = [];
let _overlayNodes   = [];

function _rebuildOverlayNodes() {
  _overlayNodeIds = [];
  _overlayNodes   = [];
  for (const [idStr, data] of Object.entries(state.graph)) {
    if (!data.priority && !data.battle && !data.note) continue;
    _overlayNodeIds.push(idStr);
    _overlayNodes.push({ sec: idStr, priority: data.priority, battle: data.battle, note: data.note });
  }
}

function _drawOverlays(ctx) {
  if (!_overlayNodes.length || !network) return;
  const pos = network.getPositions(_overlayNodeIds);
  ctx.lineCap = 'butt';
  for (const node of _overlayNodes) {
    const p = pos[node.sec];
    if (!p) continue;

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
  }
}

// Update the layout signature on drag so the next refresh cannot reset zoom.
function _computeSig(sections) {
  return sections.length + '|' + sections.map(id => `${id}:${Math.round(state.positions[id].x)},${Math.round(state.positions[id].y)}`).sort().join(',');
}

function _hasPos(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

// Object keys normalize numeric/string section IDs; Map lookups would distinguish them.
function _bfsDepth(startSec) {
  // Use a null prototype so alphanumeric IDs cannot collide with inherited property names.
  const depth = Object.create(null);
  if (startSec === undefined || startSec === null) return depth;
  depth[startSec] = 0;
  const queue = [startSec];
  while (queue.length) {
    const cur = queue.shift();
    const choices = state.graph[cur]?.choices || [];
    for (const c of choices) {
      if (isTerminal(c) || c in depth) continue;
      depth[c] = depth[cur] + 1;
      queue.push(c);
    }
  }
  return depth;
}

// Find positioned choice neighbors in either direction without importing the desktop graph.
function _positionedNeighbors(sec) {
  // Normalize both IDs to strings before comparing choice targets.
  const secStr = String(sec);
  const out = [];
  for (const [srcKey, data] of Object.entries(state.graph)) {
    if (srcKey === secStr) {
      for (const dest of (data.choices || [])) {
        if (!isTerminal(dest) && _hasPos(state.positions[dest])) out.push(dest);
      }
      continue;
    }
    if ((data.choices || []).some(c => String(c) === secStr) && _hasPos(state.positions[srcKey])) out.push(srcKey);
  }
  return out;
}

// Preserve saved positions; place missing nodes near positioned neighbors.
// Use depth-grid fallback only without an anchor, and search free slots locally.
function _firstFreeRowSlot(rowY, startX) {
  let x = startX;
  for (;;) {
    const taken = Object.values(state.positions).some(p => p &&
      Math.abs(p.y - rowY) < LAYER_GAP / 2 && Math.abs(p.x - x) < COL_GAP / 2);
    if (!taken) return x;
    x += COL_GAP;
  }
}

function _layout(sections, startSec) {
  const missing = sections.filter(id => !_hasPos(state.positions[id]));
  if (!missing.length) return;
  const depth = _bfsDepth(startSec);
  const depthValues = Object.values(depth);
  const maxDepth = depthValues.length ? Math.max(...depthValues) : 0;
  // Place parents before children so newly discovered branches can use their actual parent as anchor.
  missing.sort((a, b) => (depth[a] ?? maxDepth + 1) - (depth[b] ?? maxDepth + 1) ||
    String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));
  for (const id of missing) {
    const neighbors = _positionedNeighbors(id);
    let y, xStart;
    if (neighbors.length) {
      // Anchor both axes on one neighbor; stack siblings rightward into local free slots.
      const anchorId = neighbors.reduce((a, b) => (state.positions[a].y >= state.positions[b].y ? a : b));
      y = state.positions[anchorId].y + LAYER_GAP;
      xStart = state.positions[anchorId].x;
    } else {
      y = (id in depth ? depth[id] : maxDepth + 1) * LAYER_GAP;
      xStart = 0;
    }
    let x = _firstFreeRowSlot(y, xStart);
    // Snap automatic placements too: layer gaps are not exact grid multiples.
    x = Math.round(x / GRID_SIZE) * GRID_SIZE;
    y = Math.round(y / GRID_SIZE) * GRID_SIZE;
    state.positions[id] = { x, y };
  }
}

// Match desktop's fixed-point outcome calculation without its dependency tree.
function _computeOutcomes() {
  const graph = state.graph;
  // Section IDs must not collide with inherited object properties.
  const outcome = Object.create(null);
  let changed = true;
  while (changed) {
    changed = false;
    // Keep section keys as strings to support alphanumeric IDs.
    for (const idStr of Object.keys(graph)) {
      if (idStr in outcome) continue;
      const choices = graph[idStr]?.choices || [];
      if (!choices.length) continue;
      const outs = choices.map(c => {
        if (c === -1 || c === '-1') return 'death';
        if (c === 0 || c === '0')  return 'win';
        return outcome[c] ?? 'unknown';
      });
      if (outs.every(o => o === 'death')) { outcome[idStr] = 'death'; changed = true; }
      else if (outs.every(o => o === 'win')) { outcome[idStr] = 'win'; changed = true; }
    }
  }
  return outcome;
}

function _withHighlight(c) {
  const swatch = { background: c.background, border: c.border };
  return { ...c, highlight: swatch, hover: swatch };
}

function _nodeColor(id, startSec, curSec, everVisitedSecs, finalNode, finalResult) {
  if (id === startSec) return _withHighlight(COLORS.start);
  if (id === curSec)   return _withHighlight(COLORS.current);
  if (id === finalNode) {
    if (finalResult === 'success') return _withHighlight(COLORS.victory);
    if (finalResult === 'battle')  return _withHighlight(COLORS.battleDeath);
    return _withHighlight(COLORS.death);
  }
  // Color from permanent mVisited, not the undoable live path.
  if (everVisitedSecs.has(id)) return _withHighlight(COLORS.visitedRun);
  const choices    = (state.graph[id]?.choices || []).map(parseSecId);
  const hasDeath   = choices.includes(-1);
  const hasVictory = choices.includes(0);
  if (hasDeath && hasVictory) return _withHighlight(COLORS.bothOutline);
  if (hasDeath)                return _withHighlight(COLORS.deathOutline);
  if (hasVictory)              return _withHighlight(COLORS.victoryOutline);
  // Use mapped colors for recorded choices and discovered colors for metadata-only placeholders.
  if (state.graph[id] && (!state.graph[id].discovered || state.graph[id].portals?.length > 0)) return _withHighlight(COLORS.mapped);
  return _withHighlight(COLORS.discovered);
}

// Use the browser's contextmenu event for touch-and-hold.
export function initGraphView(container, onTap, onHold, onDragStart) {
  _onTap = onTap;
  _onHold = onHold;
  _onDragStart = onDragStart;
  _lastSig = null;
  if (network) { network.destroy(); network = null; }
  if (!window.vis?.DataSet || !window.vis?.Network) {
    container.innerHTML = `<div class="m-graph-error">${t('mobile.graph_load_error')}</div>`;
    return;
  }
  visNodes = new vis.DataSet();
  visEdges = new vis.DataSet();
  network = new vis.Network(container, { nodes: visNodes, edges: visEdges }, {
    autoResize: true,
    nodes: { shape: 'dot', size: 11, font: { size: 10, color: '#e5e7eb' }, borderWidth: 2 },
    edges: {
      arrows: { to: { enabled: true, scaleFactor: 0.4 } },
      color: { color: '#4b5563', opacity: 0.7 },
      width: 1,
      smooth: false,
    },
    physics: { enabled: false },
    layout: { improvedLayout: false },
    interaction: { dragNodes: true, tooltipDelay: 99999 },
  });
  // Consume the next synthetic click after hold/drag, with a timeout if no click arrives.
  let _suppressNextClick = false;
  let _suppressResetTimer = null;
  function _armClickSuppression() {
    _suppressNextClick = true;
    clearTimeout(_suppressResetTimer);
    _suppressResetTimer = setTimeout(() => { _suppressNextClick = false; }, 2000);
  }
  network.on('click', params => {
    if (_suppressNextClick) { _suppressNextClick = false; clearTimeout(_suppressResetTimer); return; }
    if (params.nodes.length) _onTap?.(params.nodes[0]);
  });
  network.on('oncontext', params => {
    params.event.preventDefault();
    const nodeId = network.getNodeAt(params.pointer.DOM);
    if (nodeId === undefined) return;
    _armClickSuppression();
    _onHold?.(nodeId, params.event.clientX, params.event.clientY);
  });
  // Close the menu on drag and suppress its trailing click.
  network.on('dragStart', params => {
    if (params.nodes.length) { _armClickSuppression(); _onDragStart?.(); }
  });
  network.on('dragEnd', params => {
    if (!params.nodes.length) return;
    const positions = network.getPositions(params.nodes);
    for (const id of params.nodes) {
      positions[id].x = Math.round(positions[id].x / GRID_SIZE) * GRID_SIZE;
      positions[id].y = Math.round(positions[id].y / GRID_SIZE) * GRID_SIZE;
    }
    visNodes.update(params.nodes.map(id => ({ id, x: positions[id].x, y: positions[id].y, physics: false })));
    Object.assign(state.positions, positions);
    // Keep the zoom-reset signature current - see _computeSig's own comment.
    if (_lastSig !== null) _lastSig = _computeSig([...allDiscoveredSections()]);
    clearTimeout(_dragSaveTimer);
    _dragSaveTimer = setTimeout(saveState, 1000);
  });
  network.on('afterDrawing', ctx => _drawOverlays(ctx));
}

export function refreshGraph(centerOnSec) {
  if (!network) return;
  _rebuildOverlayNodes();
  // Use viewingPt after completion to retain the final path and node.
  const livePt    = currentPlaythrough();
  const displayPt = livePt || viewingPt;
  const startSec  = displayPt?.path?.[0] ?? state.startSection ?? 1;
  const sections  = [...allDiscoveredSections()];
  _layout(sections, startSec);

  const curSec     = (livePt && livePt.path.length) ? livePt.path[livePt.path.length - 1] : null;
  const finalNode  = (displayPt?.completed && displayPt.path.length) ? displayPt.path[displayPt.path.length - 1] : null;
  const finalResult = finalNode !== null ? displayPt.result : null;

  // Highlight live path edges; node visits persist through undo, with a legacy runPath fallback.
  const runPath  = displayPt?.path || [];
  const runEdges = new Set();
  for (let i = 0; i < runPath.length - 1; i++) runEdges.add(`${runPath[i]}>${runPath[i + 1]}`);
  const everVisitedSecs = new Set(displayPt?.mVisited?.length ? displayPt.mVisited : runPath);
  const outcomes = _computeOutcomes();

  visNodes.clear();
  visNodes.add(sections.map(id => ({
    id: String(id),
    label: String(id),
    x: state.positions[id].x,
    y: state.positions[id].y,
    physics: false,
    color: _nodeColor(id, startSec, curSec, everVisitedSecs, finalNode, finalResult),
  })));

  const edges = [];
  for (const [sec, data] of Object.entries(state.graph)) {
    for (const dest of data.choices || []) {
      if (isTerminal(parseSecId(dest))) continue;
      const eid     = `${sec}>${dest}`;
      const isRun   = runEdges.has(eid);
      const outcome = outcomes[dest] ?? null;
      const color   = isRun                ? { color: '#f5a623', opacity: 1,   highlight: '#f5a623' }
                     : outcome === 'death'  ? { color: '#e74c3c', opacity: 0.8, highlight: '#e74c3c' }
                     : outcome === 'win'    ? { color: '#27ae60', opacity: 0.8, highlight: '#27ae60' }
                     :                        { color: '#4b5563', opacity: 0.7, highlight: '#9ca3af' };
      edges.push({ id: eid, from: sec, to: String(dest), color, width: isRun ? 2.5 : 1 });
    }
  }
  visEdges.clear();
  visEdges.add(edges);

  // Reset zoom only when layout changes; always recenter on the current node.
  const sig     = _computeSig(sections);
  const changed = sig !== _lastSig;
  _lastSig = sig;

  const curPos = state.positions[centerOnSec];
  if (curPos) {
    network.moveTo({
      position: { x: curPos.x, y: curPos.y },
      scale: changed ? DEFAULT_SCALE : network.getScale(),
      animation: { duration: 250, easingFunction: 'easeInOutQuad' },
    });
  }
}
