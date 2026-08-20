// graph-view.js - The bottom pane of the reader's "double-screen" layout.
// Deliberately NOT graph.js: that file's initGraph()/syncGraph() carry a lot
// of desktop-only interaction (right-click context menu wiring, portals,
// cross-book routing) that a touch screen doesn't need and that would
// balloon this preview's import graph for no benefit. This is a
// from-scratch, tap-to-travel renderer: physics is always off and every
// node gets a deterministic grid position (state.positions is the same
// field graph.js itself reads/writes, so a run opened on desktop later sees
// the same layout instead of falling back to a physics simulation). Node/
// edge colors reuse constants.js's COLORS directly (zero imports, safe) so
// this matches desktop's palette instead of inventing its own. Node
// dragging IS enabled (unlike the rest of graph.js's desktop-only
// interaction) - always snapped to GRID_SIZE, no toggle, since freehand
// placement on a touchscreen is too imprecise to be worth the option.
// Reuses window.vis, the same vendored vis-network script desktop loads.

import {
  state, currentPlaythrough, viewingPt, isTerminal, allDiscoveredSections, saveState,
} from '../../js/state.js?v=1412';
import { COLORS } from '../../js/constants.js?v=1412';
import { t } from '../../js/i18n.js?v=1412';

const LAYER_GAP  = 120; // vertical spacing between BFS depth layers
const COL_GAP    = 90;  // horizontal spacing between siblings at the same layer
const GRID_SIZE  = 40;  // matches graph.js's own GRID_SIZE - shared state.positions data

// Fixed default zoom - the graph should always read at a consistent size,
// never drift wider/narrower as the map grows the way network.fit() (fit
// the whole graph in view) would make it do session over session.
const DEFAULT_SCALE = 1.15;

let network = null;
let visNodes = null;
let visEdges = null;
let _onTap = null;
let _onHold = null;
let _onDragStart = null;
let _lastSig = null;
let _dragSaveTimer = null;

// Priority/battle/note markers - rebuilt in refreshGraph(), drawn every
// frame in drawOverlays(). Same data desktop's graph.js paints (state.graph
// entries with priority/battle/note set), reusing its exact glyph geometry/
// colours (graph.js:437-506) so a node looks the same whichever platform
// its metadata was set on - without this, setting priority/battle/a note
// on mobile had no visible effect on the graph at all, even though the
// underlying state.graph write (and its XP award) was working correctly.
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

// Shared by refreshGraph() (deciding whether to reset zoom) and the drag
// handler below (keeping that same signature in sync after a manual
// reposition) - a signature computed only in refreshGraph would go stale
// the moment a node is dragged, and the very next refreshGraph() call would
// read the new position as "the map changed shape" and reset the player's
// zoom right after they just repositioned a node to look at it.
function _computeSig(sections) {
  return sections.length + '|' + sections.map(id => `${id}:${Math.round(state.positions[id].x)},${Math.round(state.positions[id].y)}`).sort().join(',');
}

function _hasPos(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

// A plain object, not a Map - state.graph's own keys (numeric IDs coerced
// through Object.entries) and its choices array *values* (added to
// allDiscoveredSections()'s Set without going through parseSecId first, see
// state.js's discoveredSectionsFor) aren't guaranteed to be the same JS
// type for the same logical section. A Map's has()/get() are type-strict -
// number 88 and string "88" are different keys - so a node reachable via a
// string-typed choice target would silently miss its own depth entry when
// looked up by its number-typed graph key, landing in the "unreachable"
// bucket below despite being genuinely connected. A plain object's keys are
// always coerced to strings on access, so both typings land on the same
// property - same reasoning _computeOutcomes() below already applies.
function _bfsDepth(startSec) {
  // Object.create(null), not {} - a plain object literal still inherits
  // Object.prototype, so `c in depth` would read true for a section ID that
  // happens to collide with a builtin property name (e.g. "constructor",
  // "toString") on an alphanumeric-section book, even though nothing was
  // ever actually added under that key.
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

// Assigns a grid slot to any discovered section that doesn't have a saved
// position yet. Existing positions (from a prior mobile session, or from
// desktop itself) are never touched - only gaps get filled in.
function _layout(sections, startSec) {
  const missing = sections.filter(id => !_hasPos(state.positions[id]));
  if (!missing.length) return;
  const depth = _bfsDepth(startSec);
  const depthValues = Object.values(depth);
  const maxDepth = depthValues.length ? Math.max(...depthValues) : 0;
  for (const id of missing) {
    const y = (id in depth ? depth[id] : maxDepth + 1) * LAYER_GAP;
    let maxX = -COL_GAP;
    for (const other of sections) {
      const p = state.positions[other];
      if (p && Math.abs(p.y - y) < LAYER_GAP / 2 && p.x > maxX) maxX = p.x;
    }
    state.positions[id] = { x: maxX + COL_GAP, y };
  }
}

// Mirrors graph.js's computeOutcomes() exactly (a full-graph fixed-point
// solve over state.graph, nothing DOM-touching) - reimplemented locally
// rather than importing graph.js itself, same reasoning as reader.js's
// commitChoices: that file drags in i18n.js/vis-network on its own terms.
function _computeOutcomes() {
  const graph = state.graph;
  // Object.create(null) - same reasoning as _bfsDepth's own depth object.
  const outcome = Object.create(null);
  let changed = true;
  while (changed) {
    changed = false;
    // idStr used directly as the key, not Number(idStr) - that coerces an
    // alphanumeric section id (e.g. "A12") to NaN, silently dropping every
    // such node out of outcome tracking for the rest of this book's session
    // (graph[id]/outcome[id] lookups still work identically for numeric ids
    // either way, since plain object keys coerce to string regardless).
    for (const idStr of Object.keys(graph)) {
      if (idStr in outcome) continue;
      const choices = graph[idStr]?.choices || [];
      if (!choices.length) continue;
      const outs = choices.map(c => {
        if (c === -1) return 'death';
        if (c === 0)  return 'win';
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
  // Persistent "ever visited" set (pt.mVisited, see reader.js), not the live
  // pt.path - undoing a step shrinks pt.path but shouldn't un-paint a node
  // the reader actually read earlier in the same run.
  if (everVisitedSecs.has(id)) return _withHighlight(COLORS.visitedRun);
  const choices    = state.graph[id]?.choices || [];
  const hasDeath   = choices.includes(-1);
  const hasVictory = choices.includes(0);
  if (hasDeath && hasVictory) return _withHighlight(COLORS.bothOutline);
  if (hasDeath)                return _withHighlight(COLORS.deathOutline);
  if (hasVictory)              return _withHighlight(COLORS.victoryOutline);
  return _withHighlight(COLORS.discovered);
}

// onHold fires on a long-press - vis-network's 'oncontext' wraps the
// browser's native `contextmenu` event, which mobile browsers already
// raise on touch-and-hold by default, so this is the same event desktop's
// right-click menu uses (graph.js/boot.js), not a separate gesture built
// from scratch.
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
  // Some mobile browsers still fire a trailing synthetic click right after
  // a long-press's own contextmenu event, not strictly one or the other -
  // without this window, that trailing click would open a preview (or,
  // worse, look like nothing happened) on the same gesture that just
  // opened the long-press context menu.
  let _lastHoldAt = 0;
  network.on('click', params => {
    if (Date.now() - _lastHoldAt < 400) return;
    if (params.nodes.length) _onTap?.(params.nodes[0]);
  });
  network.on('oncontext', params => {
    params.event.preventDefault();
    const nodeId = network.getNodeAt(params.pointer.DOM);
    if (nodeId === undefined) return;
    _lastHoldAt = Date.now();
    _onHold?.(nodeId, params.event.clientX, params.event.clientY);
  });
  // A long-press can open the context menu and then keep moving into a drag
  // on the same touch (the browser's own contextmenu firing doesn't cancel
  // the gesture) - without closing it here, the menu would sit on top of
  // the node the whole time it's being dragged, blocking the one thing the
  // player needs to see (where the node is landing).
  network.on('dragStart', params => {
    if (params.nodes.length) _onDragStart?.();
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
  // currentPlaythrough() stops returning a pt the instant it's marked
  // completed (see state.js) - viewingPt (set by reader.js's _navigate
  // right as a run ends) is what keeps the path/final-node display alive
  // after that, same displayPt = pt || viewingPt pairing graph.js itself
  // uses.
  const livePt    = currentPlaythrough();
  const displayPt = livePt || viewingPt;
  const startSec  = displayPt?.path?.[0] ?? state.startSection ?? 1;
  const sections  = [...allDiscoveredSections()];
  _layout(sections, startSec);

  const curSec     = (livePt && livePt.path.length) ? livePt.path[livePt.path.length - 1] : null;
  const finalNode  = (displayPt?.completed && displayPt.path.length) ? displayPt.path[displayPt.path.length - 1] : null;
  const finalResult = finalNode !== null ? displayPt.result : null;

  // The run's actual traveled route, so it reads as a path through the
  // grid rather than just a static map - mirrors desktop's isRunEdge/
  // orange-highlight convention (graph.js's syncGraph()). Edges only trace
  // the LIVE path (an undone step really isn't part of the current route
  // any more), but node colour uses the persistent mVisited set below -
  // falls back to runPath for a run saved before mVisited existed.
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
      if (isTerminal(dest)) continue;
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

  // Reset to the default zoom (discarding any manual pinch/zoom) only when
  // the map itself actually changed shape - a plain re-render (e.g. tapping
  // a link that shows bonus text, not a real new section) leaves whatever
  // zoom the player set alone. Always re-center on the current node either
  // way, that part isn't optional.
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
