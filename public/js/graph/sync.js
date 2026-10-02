import { state, viewingPt, currentPlaythrough, allDiscoveredSections, isTerminal, parseSecId, saveState } from '../core/state.js';
import { visNodes, visEdges, graphRuntime } from './runtime.js';
import { _hasValidPos, _effectiveStartSec } from './helpers.js';
import { nodeColor, nodeLabel, nodeTitle } from './appearance.js';
import { computeOutcomes } from './outcomes.js';
import { _assignGridPositions } from './layout-grid.js';
import { _assignLocalPositions } from './layout-local.js';
import { _buildOverlayCache } from './overlay-cache.js';
import { syncPhysics } from './physics.js';

export function syncGraph() {
  if (!visNodes || !visEdges) return;

  const allSections = allDiscoveredSections();
  const startSec = _effectiveStartSec(currentPlaythrough() || viewingPt);

  const hasSavedPositions = Object.keys(state.positions).length > 0;
  // A book with zero saved positions at all used to fall through to vis-
  // network's own forceAtlas2Based physics simulation entirely (see
  // initGraph()). _assignLocalPositions()'s per-neighbor overlap scoring is
  // built for dropping a handful of new nodes into an already-laid-out map,
  // not for laying out an entire book from nothing - with no sense of an
  // overall growth direction, unrelated branches end up crossing each
  // other's connectors on a real book. _assignGridPositions() (BFS-depth
  // grid, ported from mobile's graph-view.js with the axes swapped so
  // desktop grows right instead of down) replaces it for exactly this one
  // case - no physics simulation either way (CPU cost, and the exact class
  // of jitter/race-condition bug this project already hit once).
  //
  // hasSavedPositions alone can't drive this choice on every call: the grid
  // pass itself makes state.positions non-empty the instant it places the
  // very first node, so re-deriving "is this a grid book?" from position
  // count would flip to _assignLocalPositions the very next sync - every
  // node after the first ends up radially placed instead of gridded (found
  // via a real book: only the start node landed on-grid, everything
  // discovered afterward scattered). state.gridLayout is a persisted,
  // one-way flag - once a book starts in the grid regime it stays there for
  // every node discovered afterward, in this session or a later one. Books
  // with a genuine pre-existing (pre-this-feature or hand-dragged) layout
  // never set it, so they keep using _assignLocalPositions exactly as
  // before - existing saved layouts are still never touched.
  const useGrid = state.gridLayout || !hasSavedPositions;
  const locallyPlaced = useGrid
    ? _assignGridPositions(allSections, startSec)
    : _assignLocalPositions(allSections);
  if (useGrid) state.gridLayout = true;

  const nodeUpdates = [];
  let hasUnpositioned = false;
  allSections.forEach(sec => {
    const pos         = state.positions[sec];
    const posValid    = _hasValidPos(pos);
    const choices     = state.graph[sec]?.choices || [];
    const hasTerminal = choices.some(c => isTerminal(parseSecId(c)));
    const hasBattle   = !!state.graph[sec]?.battle;
    const portals     = graphRuntime._graphIsOpenWorld ? (state.graph[sec]?.portals || []) : [];
    const isPortal    = portals.length > 0;
    const isXBookReachable = !!(graphRuntime._graphCrossBookRoute && graphRuntime._graphCrossBookRoute.has(sec));
    if (!posValid) hasUnpositioned = true;
    const nodeUpdate = {
      id:          sec,
      label:       isPortal ? `${nodeLabel(sec)}\n⇒` : nodeLabel(sec),
      // Portal nodes used to get a hardcoded teal fill regardless of visited/mapped
      // state, bypassing nodeColor() entirely - a portal you'd never even visited
      // looked identical to one you'd fully explored and traveled through, and
      // nothing about the color would ever change either way. Fill now follows the
      // same mapped/discovered/outcome rules as every other node, but a portal is
      // easy to lose among a sea of same-colored mapped nodes with only the diamond
      // shape to go on - a gold border (independent of fill/mapped state) keeps it
      // easy to spot regardless of how much of the book you've explored.
      color:       isPortal
        ? { ...nodeColor(sec), border: '#facc15', highlight: { ...(nodeColor(sec).highlight || {}), border: '#fde047' } }
        : (isXBookReachable
          ? { ...nodeColor(sec), border: '#22d3ee', highlight: { ...(nodeColor(sec).highlight || {}), border: '#67e8f9' } }
          : nodeColor(sec)),
      title:       nodeTitle(sec, portals),
      shape:       isPortal ? 'diamond' : 'dot',
      size:        isPortal ? 16 : 14,
      borderWidth: (hasTerminal || hasBattle) ? 4 : (isPortal || isXBookReachable) ? 3 : 2,
      shapeProperties: isXBookReachable ? { borderDashes: [4, 3] } : { borderDashes: false },
      font:        sec === startSec ? { size: 11, color: '#fde047', face: 'Segoe UI, system-ui, sans-serif', bold: true } : undefined,
      physics:     !posValid,
      ...(posValid ? { x: pos.x, y: pos.y } : {}),
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

  // Computed once for the whole graph rather than per edge - computeOutcomes()
  // does a full fixed-point solve, and this loop can have hundreds of edges.
  const outcomes = computeOutcomes();
  const liveEdgeIds = new Set();
  const edgeUpdates = [];
  Object.entries(state.graph).forEach(([sec, data]) => {
    data.choices.forEach(dest => {
      if (isTerminal(parseSecId(dest))) return;
      const eid       = `${sec}>${dest}`;
      const isRunEdge = runEdges.has(eid);
      liveEdgeIds.add(eid);
      const outcome = outcomes[dest] ?? null;
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

  syncPhysics(hasSavedPositions, hasUnpositioned, syncGraph);
}
