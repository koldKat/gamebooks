import { state, parseSecId, isTerminal } from '../state.js';
import { _hasValidPos, naturalCompareIds } from './helpers.js';
import { GRID_SIZE } from './viewport.js';
import { _GRID_LAYER_GAP } from './layout-constants.js';
import { _getPositionedNeighbors, _firstFreeColumnSlot } from './layout-helpers.js';

// ── First-layout grid (no saved positions at all) ───────────────────────────
// _assignLocalPositions()'s overlap-scoring approach is the right tool for
// dropping a handful of newly-discovered nodes into an already-laid-out map,
// but asked to lay out an entire book from nothing it has no sense of an
// overall direction to grow in - every candidate is judged only against its
// immediate neighbors, so branches fan out radially and, on a real book,
// distant unrelated branches end up crossing each other's connectors.
// Mobile's graph-view.js solves first-layout with a plain BFS-depth grid -
// each node's distance (in choices) from the start section becomes its row -
// which reads cleanly because every node at the same depth lines up. Ported
// here with the axes swapped: BFS depth drives X (rightward), sibling index
// within a depth drives Y, so desktop grows right the way mobile grows down.

function _bfsDepth(startSec, allSections) {
  const depth = new Map();
  if (startSec === undefined || startSec === null || !allSections.has(startSec)) return depth;
  depth.set(startSec, 0);
  const queue = [startSec];
  while (queue.length) {
    const cur = queue.shift();
    const choices = state.graph[cur]?.choices || [];
    for (const raw of choices) {
      // allSections is built via parseSecId() (allDiscoveredSections/
      // discoveredSectionsFor in state.js), but a choices array entry is
      // whatever the graph happened to store it as - not guaranteed to
      // already be the same type (a numeric-looking string section id can
      // slip in via a book import that stored choice targets as strings).
      // depth/allSections are a Map/Set, so .has() is strict-equality with
      // no coercion: an un-normalized raw value here silently drops that
      // whole branch as "unreachable" instead of throwing, corrupting every
      // downstream node's depth - and therefore its grid position - without
      // any error. Same class of bug _getPositionedNeighbors already had to
      // fix (String() there; parseSecId() here to match this Set's actual
      // value type, not stringify it).
      const c = parseSecId(raw);
      if (c === null || isTerminal(c) || depth.has(c) || !allSections.has(c)) continue;
      depth.set(c, depth.get(cur) + 1);
      queue.push(c);
    }
  }
  return depth;
}

// Same "only fill gaps, never move an existing position" contract as
// _assignLocalPositions - relevant once a book has grown past its very first
// sync and mixes freshly-discovered nodes in with already-gridded ones.
//
// A node discovered long after the book's initial layout is BFS-depth-from-
// START at that moment, which has nothing to do with where its own actual
// parent ended up on screen (the parent's own position may itself have come
// from an earlier partial layout, a drag, or simply not line up with pure
// depth*_GRID_LAYER_GAP spacing) - on a book with a long path, that raw
// depth can be large enough to place the new node thousands of pixels off
// to the side of the parent it's actually connected to, joined only by one
// very long connector (found via a real book: two nodes discovered ~20
// choices deep landed off past the edge of the visible map, the "start-
// relative" bug the grid formula has always had, not something that only
// affects the initial layout's missing-neighbor fallback). Any missing node
// with an already-positioned neighbor gets placed next to that neighbor -
// one grid column over, same "find the next free Y slot in that column"
// logic as below - instead of trusting raw BFS depth. Only a node with NO
// positioned neighbor at all (the genuine first-ever bulk layout, where
// nothing is positioned yet) falls back to the depth grid.
export function _assignGridPositions(allSections, startSec) {
  const missing = [...allSections].filter(sec => !_hasValidPos(state.positions[sec]));
  if (!missing.length) return false;
  const depth = _bfsDepth(startSec, allSections);
  const maxDepth = depth.size ? Math.max(...depth.values()) : 0;
  // Place parents before children: within a single sync a freshly-landed
  // node and its own new option nodes are all missing at once, and plain
  // id-sorting can put a child before its parent - the child then finds no
  // positioned parent yet and falls into the depth-from-START fallback
  // below, landing relative to the start node's column instead of beside
  // the node that was just stepped on (the "auto-place is relative to the
  // start node" bug). BFS depth ascending guarantees every node's parents
  // are already positioned when it is (parents are always one depth
  // shallower); id order inside a depth keeps the layout deterministic.
  missing.sort((a, b) => (depth.get(a) ?? maxDepth + 1) - (depth.get(b) ?? maxDepth + 1) || naturalCompareIds(a, b));
  for (const sec of missing) {
    const neighbors = _getPositionedNeighbors(sec, state.positions);
    // Anchor on incoming parents (the nodes whose choice led here - i.e.
    // the node just stepped on during reading) whenever any are positioned;
    // only fall back to children/other neighbors for genuinely parentless
    // gaps, so a stray outgoing edge can't yank a new node away from its
    // actual parent.
    const anchors = neighbors.incoming.length ? neighbors.incoming : neighbors.all;
    let x, yStart;
    if (anchors.length) {
      // X AND Y both anchor on the same neighbor: one column right of it,
      // siblings stacking DOWN from its own height. Anchoring only X (and
      // stacking Y from the top of the map) left fresh options rows away
      // below the node just stepped on whenever the parent sat above y=0.
      const anchorId = anchors.reduce((a, b) => (state.positions[a].x >= state.positions[b].x ? a : b));
      x = state.positions[anchorId].x + _GRID_LAYER_GAP;
      yStart = state.positions[anchorId].y;
    } else {
      x = (depth.has(sec) ? depth.get(sec) : maxDepth + 1) * _GRID_LAYER_GAP;
      yStart = 0;
    }
    let y = _firstFreeColumnSlot(x, yStart);
    // _GRID_LAYER_GAP/_GRID_COL_GAP aren't multiples of GRID_SIZE, so with
    // snap on a child of an on-grid parent landed 10px/30px off the visual
    // grid. New nodes were never hand-placed, so snapping them disturbs
    // nothing deliberate - same rule as _assignLocalPositions' own snap.
    if (state.snapToGrid) {
      x = Math.round(x / GRID_SIZE) * GRID_SIZE;
      y = Math.round(y / GRID_SIZE) * GRID_SIZE;
    }
    state.positions[sec] = { x, y };
  }
  return true;
}
