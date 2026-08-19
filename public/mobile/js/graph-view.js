// graph-view.js - The bottom pane of the reader's "double-screen" layout.
// Deliberately NOT graph.js: that file's initGraph()/syncGraph() carry a lot
// of desktop-only interaction (right-click menus, node dragging, portals,
// cross-book routing) that a touch screen doesn't need and that would
// balloon this preview's import graph for no benefit. This is a
// from-scratch, tap-to-travel renderer: physics is always off and every
// node gets a deterministic grid position (state.positions is the same
// field graph.js itself reads/writes, so a run opened on desktop later sees
// the same layout instead of falling back to a physics simulation). Node/
// edge colors reuse constants.js's COLORS directly (zero imports, safe) so
// this matches desktop's palette instead of inventing its own.
// Reuses window.vis, the same vendored vis-network script desktop loads.

import {
  state, currentPlaythrough, viewingPt, isTerminal, allDiscoveredSections,
} from '../../js/state.js?v=14';
import { COLORS } from '../../js/constants.js?v=1';

const LAYER_GAP = 120; // vertical spacing between BFS depth layers
const COL_GAP   = 90;  // horizontal spacing between siblings at the same layer

// Fixed default zoom - the graph should always read at a consistent size,
// never drift wider/narrower as the map grows the way network.fit() (fit
// the whole graph in view) would make it do session over session.
const DEFAULT_SCALE = 1.15;

let network = null;
let visNodes = null;
let visEdges = null;
let _onTap = null;
let _lastSig = null;

function _hasPos(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function _bfsDepth(startSec) {
  const depth = new Map();
  if (startSec === undefined || startSec === null) return depth;
  depth.set(startSec, 0);
  const queue = [startSec];
  while (queue.length) {
    const cur = queue.shift();
    const choices = state.graph[cur]?.choices || [];
    for (const c of choices) {
      if (isTerminal(c) || depth.has(c)) continue;
      depth.set(c, depth.get(cur) + 1);
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
  const maxDepth = depth.size ? Math.max(...depth.values()) : 0;
  for (const id of missing) {
    const y = (depth.has(id) ? depth.get(id) : maxDepth + 1) * LAYER_GAP;
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
  const outcome = {};
  let changed = true;
  while (changed) {
    changed = false;
    for (const idStr of Object.keys(graph)) {
      const id = Number(idStr);
      if (id in outcome) continue;
      const choices = graph[id]?.choices || [];
      if (!choices.length) continue;
      const outs = choices.map(c => {
        if (c === -1) return 'death';
        if (c === 0)  return 'win';
        return outcome[c] ?? 'unknown';
      });
      if (outs.every(o => o === 'death')) { outcome[id] = 'death'; changed = true; }
      else if (outs.every(o => o === 'win')) { outcome[id] = 'win'; changed = true; }
    }
  }
  return outcome;
}

function _withHighlight(c) {
  const swatch = { background: c.background, border: c.border };
  return { ...c, highlight: swatch, hover: swatch };
}

function _nodeColor(id, startSec, curSec, pathSecs, finalNode, finalResult) {
  if (id === startSec) return _withHighlight(COLORS.start);
  if (id === curSec)   return _withHighlight(COLORS.current);
  if (id === finalNode) {
    if (finalResult === 'success') return _withHighlight(COLORS.victory);
    if (finalResult === 'battle')  return _withHighlight(COLORS.battleDeath);
    return _withHighlight(COLORS.death);
  }
  if (pathSecs.has(id)) return _withHighlight(COLORS.visitedRun);
  const choices    = state.graph[id]?.choices || [];
  const hasDeath   = choices.includes(-1);
  const hasVictory = choices.includes(0);
  if (hasDeath && hasVictory) return _withHighlight(COLORS.bothOutline);
  if (hasDeath)                return _withHighlight(COLORS.deathOutline);
  if (hasVictory)              return _withHighlight(COLORS.victoryOutline);
  return _withHighlight(COLORS.discovered);
}

export function initGraphView(container, onTap) {
  _onTap = onTap;
  _lastSig = null;
  if (network) { network.destroy(); network = null; }
  if (!window.vis?.DataSet || !window.vis?.Network) {
    container.innerHTML = '<div class="m-graph-error">Graph library failed to load.</div>';
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
    interaction: { dragNodes: false, tooltipDelay: 99999 },
  });
  network.on('click', params => {
    if (params.nodes.length) _onTap?.(params.nodes[0]);
  });
}

export function refreshGraph(centerOnSec) {
  if (!network) return;
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
  // orange-highlight convention (graph.js's syncGraph()).
  const runPath  = displayPt?.path || [];
  const pathSecs = new Set(runPath);
  const runEdges = new Set();
  for (let i = 0; i < runPath.length - 1; i++) runEdges.add(`${runPath[i]}>${runPath[i + 1]}`);
  const outcomes = _computeOutcomes();

  visNodes.clear();
  visNodes.add(sections.map(id => ({
    id: String(id),
    label: String(id),
    x: state.positions[id].x,
    y: state.positions[id].y,
    physics: false,
    color: _nodeColor(id, startSec, curSec, pathSecs, finalNode, finalResult),
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
  const sig     = sections.length + '|' + sections.map(id => `${id}:${Math.round(state.positions[id].x)},${Math.round(state.positions[id].y)}`).sort().join(',');
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
