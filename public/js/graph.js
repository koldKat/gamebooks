import { COLORS } from './constants.js';
import {
  state, viewingPt, isTerminal, parseSecId, isValidSecId,
  currentPlaythrough, allDiscoveredSections, saveState,
} from './state.js';
import { t } from './i18n.js';

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
// A tighter floor used only when *restoring* a saved zoom on entry
// (_focusNodeAfterLoad in open-world.js), not for manual zooming during an
// active session. MIN_VIEWPORT_SCALE alone (0.3) was too permissive here -
// any accidental zoom-out during a session, even briefly, gets debounce-
// saved via the 'zoom' listener below and then force-reapplied via
// network.focus() on every future entry into that book, "sticking" the view
// at a tiny, hard-to-read scale indefinitely. Manual in-session zooming can
// still go below this floor (down to MIN_VIEWPORT_SCALE) - this only affects
// what gets restored automatically on load.
export const RESTORE_MIN_VIEWPORT_SCALE = 0.6;

let _stabilizeHandler  = null;
let _restabilizeTimer  = null;

// True from the moment a stabilize() pass is issued until its
// stabilizationIterationsDone handler actually fires. Debouncing (below)
// only stops a *new* pass from being scheduled too soon after the last
// *request* - it says nothing about whether the *previous* pass has
// actually finished running yet. A graph with several fixed obstacles
// (e.g. manually-added nodes, which still count toward avoidOverlap
// collision-avoidance even though they don't move) can take longer than
// the debounce window to converge, so a second debounced call could fire
// while the first stabilize(300) is still active - starting a *second*
// concurrent physics pass on top of the first, each one independently
// shoving nodes around. That reads as the graph jittering chaotically
// while genuinely nothing should be moving it, confirmed via a user
// report that it stopped entirely with DevTools open the whole time
// (the added JS overhead widened timing enough that the first pass
// always finished before a second one could be scheduled - the same
// "adding a print statement masks a race" pattern from threaded code).
let _stabilizing = false;

// Set when syncGraph() finds a pass already running (_stabilizing) and still
// needs one. The first version of this fix responded to that case by just
// rescheduling the same debounce timer to try again later - but that retry
// carried no logic of its own, so once it finally got its turn it called
// stabilize() unconditionally, trusting whatever hasUnpositioned had been at
// the moment this *specific* call was originally made rather than checking
// whether it was still true by the time it actually ran. If the in-flight
// pass's own completion had already placed everything in the meantime, that
// was an unnecessary extra pass on stale information. Now the in-flight
// pass's own completion handler is the only thing that starts a follow-up
// pass, and it does so by calling syncGraph() again - which re-derives
// hasUnpositioned fresh from current state - rather than trusting a snapshot
// from whenever this flag got set.
let _pendingSync = false;

// Live-reading reveals a brand-new, never-before-mapped section on every
// single page turn - the read section usually has no already-positioned
// neighbor yet for _assignLocalPositions to place it next to, so it falls
// through to a full stabilize() pass below on every page turn, at normal
// reading pace (several seconds apart) well outside RESTABILIZE_DEBOUNCE_MS.
// A full 300-iteration pass on the whole graph every single page is real,
// sustained CPU cost that a slower reader would feel continuously. A single
// newly-revealed node doesn't need the same convergence a fresh full layout
// does, so liveread.js sets this for as long as its panel is open to trade
// precision for a much cheaper settle each time - the reader isn't watching
// the physics settle anyway, just the prose.
let _lightweightRestabilize = false;
export function setLightweightRestabilize(on) { _lightweightRestabilize = on; }

// The lighter iteration count above only cuts the cost of *one* pass - it
// doesn't stop a fresh pass from firing on nearly every page turn if pages
// are read faster than RESTABILIZE_DEBOUNCE_MS apart but not truly
// back-to-back (rapid-fire clicking during testing, not just normal
// reading, can land in exactly that gap). Widening the debounce while
// reading is active coalesces a burst of fast clicks into far fewer passes
// total, on top of each surviving pass already being cheaper.
const LIGHTWEIGHT_RESTABILIZE_DEBOUNCE_MS = 600;

// A burst of render() calls in quick succession (e.g. losing a run, marking it
// public, and starting a new one, each chaining through saveState/UI-update
// callbacks within a few ms of each other) used to restart the physics solver
// from scratch on every single call - interrupting a not-yet-finished
// stabilize() pass before it ever got to fire stabilizationIterationsDone,
// which could leave the graph visibly re-jostling indefinitely (worse the
// more fixed obstacles, e.g. manually-added nodes, the solver has to route
// around under avoidOverlap). Debouncing so only the last call in a tight
// burst actually kicks off a pass fixes it without changing anything for a
// single, isolated render().
const RESTABILIZE_DEBOUNCE_MS = 150;

// World-space spacing (graph units, not screen pixels) - fixed rather than
// user-configurable, and shared by both the grid overlay and snap-to-grid so
// snapped nodes always land on a line the player can actually see.
export const GRID_SIZE = 40;

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

// Same caching strategy as the overlay cache above, for the fog-of-grid halo
// positions - all nodes are candidates here (not just ones with an overlay),
// so it's kept separate rather than reusing _overlayPositions.
let _fogPositions      = {};
let _fogPosDirty       = true;
let _fogDraggingActive = false; // true while any node is being dragged

function _buildOverlayCache() {
  _overlayNodeIds  = [];
  _overlayNodes    = [];
  _overlayPosDirty = true;
  _fogPosDirty     = true;
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
  const portalLegendItem = document.querySelector('.legend-item-portal');
  if (portalLegendItem) portalLegendItem.style.display = _graphIsOpenWorld ? '' : 'none';
}

export function destroyNetwork() {
  if (network) { network.stopSimulation(); network.destroy(); network = null; }
  visNodes          = null;
  visEdges          = null;
  _stabilizeHandler = null;
  _stabilizing      = false;
  _pendingSync      = false;
  clearTimeout(_restabilizeTimer);
  _restabilizeTimer = null;
  _graphIsOpenWorld = false;
  _graphSeriesBooks = [];
  _graphCrossBookRoute = null;
  _overlayPositions      = {};
  _overlayPosDirty       = true;
  _overlayDraggingActive = false;
  _fogPositions      = {};
  _fogPosDirty       = true;
  _fogDraggingActive = false;
}

// ── Edge appearance ──────────────────────────────────────────────────────────

// Whether a section's fate is settled no matter which choice a player picks
// from here on - not just a single unbranching chain of choices. A section is
// 'death' only if EVERY one of its choices is itself already 'death', and
// 'win' only if EVERY one of its choices is itself already 'win' (same
// quantifier both ways - "no matter what you pick from here"). Win is
// deliberately NOT "any choice can reach 0": a section with one path to
// certain victory and another to certain death is not a guaranteed win just
// because a winning option exists - the player could still pick the death
// branch, so reaching this section promises nothing either way and it stays
// unresolved, same as any other genuinely mixed branch.
// Branching used to make this bail out immediately (any node with more than
// one choice returned null, "can't tell"), which missed real certain-death
// zones where a section branches into two or more choices that each,
// independently, still only ever end in death further down their own chains.
// This is an AND-OR fixed-point solve over the whole graph rather than a walk
// down one path, so it resolves those cases too, and treats unmapped
// sections and true cycles (a loop with no escape to -1/0) as unresolved
// ('unknown') rather than guessing - never falsely paint an edge as certain
// death/win.
export function computeOutcomes() {
  const graph   = state.graph;
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
      if (outs.every(o => o === 'death'))      { outcome[id] = 'death'; changed = true; }
      else if (outs.every(o => o === 'win'))   { outcome[id] = 'win';   changed = true; }
    }
  }
  return outcome;
}

// destId is a real section id, or the -1/0 death/win sentinels themselves.
// Convenience single-lookup wrapper - callers checking more than one id in
// the same pass (e.g. every choice in a section, or every edge in the graph)
// should call computeOutcomes() once themselves instead, since this does a
// full-graph solve on every call.
export function inevitableOutcome(destId) {
  if (destId === -1) return 'death';
  if (destId === 0)  return 'win';
  return computeOutcomes()[destId] ?? null;
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

// A saved position is an object ({x, y}), which is always truthy regardless
// of what's inside it - `!pos` alone treats {x: NaN, y: 40} as "already
// positioned" just as readily as a real coordinate. A NaN/Infinity
// coordinate poisons vis-network's physics (pairwise force calculations
// between every node pair), causing chaotic movement across the *whole*
// graph that never self-corrects during the live session - nothing else
// ever re-examines an already-"positioned" node's actual coordinate
// validity. Traced to JSON.stringify silently turning NaN into null on
// save (saveState's JSON.stringify(state)), which is why reloading the
// page "fixed" it: the reloaded value is null, correctly fails a plain
// truthy check, and gets a fresh valid position - not because anything
// about the corruption itself was time-limited.
function _hasValidPos(pos) {
  return !!pos && Number.isFinite(pos.x) && Number.isFinite(pos.y);
}

// The "start" node to highlight follows whichever run is actually being
// displayed, not always the book's default `state.startSection` - a run
// begun via the alternate-start button (see play.js) has its own path[0],
// which may be a completely different node. Portal-entered runs (path[0]
// is just wherever the portal dropped the player, see play.js/open-world.js
// `portalEntry`) are NOT an alt-start and should still defer to the book's
// real start section.
function _effectiveStartSec(displayPt) {
  if (displayPt?.path?.length && isValidSecId(displayPt.path[0]) && !displayPt.portalEntry) return displayPt.path[0];
  return isValidSecId(state.startSection) ? state.startSection : 1;
}

// vis-network falls back to its own hardcoded default hover/select palette
// (#D2E5FF background, #2B7CE9 border) for any node color that doesn't
// specify its own `highlight`/`hover` sub-colors - none of the COLORS.*
// constants did, so simply hovering (interaction.hover: true, below) or
// selecting any node (regardless of its real state) briefly repainted it
// with that unrelated generic blue instead of its actual semantic color,
// which read as a rendering bug. `highlight` applies on selection, `hover`
// on mere mouse-over - both need to be set, or only one of the two
// interactions would actually be fixed.
function _withHighlight(c) {
  const swatch = { background: c.background, border: c.border };
  return { ...c, highlight: swatch, hover: swatch };
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
  if (secId === startSec) return _withHighlight(COLORS.start);
  if (secId === cur) return _withHighlight(COLORS.current);
  if (secId === finalNode) {
    if (displayPt.result === 'success') return _withHighlight(COLORS.victory);
    if (displayPt.result === 'battle')  return _withHighlight(COLORS.battleDeath);
    return _withHighlight(COLORS.death);
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
    // A node whose only way forward is a portal has nothing to record as a choice
    // (portals live in node.portals[], separate from node.choices[]) - without this
    // it stays colored as merely "discovered" forever, even once fully visited.
    else if (state.graph[secId] && (!state.graph[secId].discovered || state.graph[secId].portals?.length > 0)) base = COLORS.mapped;
    else                                                            base = COLORS.discovered;
  }

  // Custom color overrides base fill (not special states - those returned early above)
  const customColor = state.graph[secId]?.color;
  if (customColor) base = { background: customColor, border: _darkenHex(customColor) };

  // Battle flag: keep fill from base rules, override only the border
  if (state.graph[secId]?.battle) {
    return _withHighlight({ background: base.background, border: COLORS.battleOutline.border });
  }

  return _withHighlight(base);
}

function nodeLabel(secId) {
  const displayPt = currentPlaythrough() || viewingPt;
  const startSec  = _effectiveStartSec(displayPt);
  return secId === startSec ? `${secId}\nSTART` : String(secId);
}

// Fixed radius (graph units) a "fog of grid" halo extends around each node -
// fixed rather than scaled to node spacing, same reasoning as GRID_SIZE
// itself: one predictable constant instead of another speculative setting.
const FOG_RADIUS = 125;

// Drawn on 'beforeDrawing' (under nodes/edges), in world coordinates so it
// pans/zooms with the graph instead of sitting fixed on screen.
function drawGrid(ctx) {
  if (!network || (!state.showGrid && !state.fogOfGrid)) return;
  const container = document.getElementById('graph-container');
  if (!container) return;
  const topLeft     = network.DOMtoCanvas({ x: 0, y: 0 });
  const bottomRight = network.DOMtoCanvas({ x: container.clientWidth, y: container.clientHeight });

  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
  ctx.lineWidth   = 1 / network.getScale();

  // Fog of grid: clip to a circular halo around each node first, so the
  // grid lines drawn afterward only ever show up near a node - mutually
  // exclusive with the always-visible "Show grid" (state.showGrid).
  if (state.fogOfGrid) {
    if (!visNodes) { ctx.restore(); return; }
    const ids = visNodes.getIds();
    if (!ids.length) { ctx.restore(); return; }
    // Same idea as the overlay position cache below - avoid recomputing
    // every node's position and rebuilding a multi-circle clip path on
    // every single beforeDrawing frame (fired continuously during pan/zoom)
    // when nothing has actually moved.
    if (_fogDraggingActive || _fogPosDirty) {
      _fogPositions = network.getPositions(ids);
      _fogPosDirty  = false;
    }
    ctx.beginPath();
    for (const id of ids) {
      const p = _fogPositions[id];
      if (!p) continue;
      ctx.moveTo(p.x + FOG_RADIUS, p.y);
      ctx.arc(p.x, p.y, FOG_RADIUS, 0, Math.PI * 2);
    }
    ctx.clip();
  }

  const startX = Math.floor(topLeft.x / GRID_SIZE) * GRID_SIZE;
  const startY = Math.floor(topLeft.y / GRID_SIZE) * GRID_SIZE;
  ctx.beginPath();
  for (let x = startX; x <= bottomRight.x; x += GRID_SIZE) {
    ctx.moveTo(x, topLeft.y);
    ctx.lineTo(x, bottomRight.y);
  }
  for (let y = startY; y <= bottomRight.y; y += GRID_SIZE) {
    ctx.moveTo(topLeft.x, y);
    ctx.lineTo(bottomRight.x, y);
  }
  ctx.stroke();
  ctx.restore();
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

function nodeTitle(secId, portals) {
  const data = state.graph[secId];
  const lines = [];
  if (!data) {
    lines.push(t('node.unmapped', { n: secId }));
  } else {
    const real     = data.choices.filter(c => !isTerminal(c));
    const hasDeath = data.choices.includes(-1);
    const hasWin   = data.choices.includes(0);
    const parts    = [];
    if (real.length)  parts.push(t('node.goes_to', { list: real.join(', ') }));
    if (hasDeath)     parts.push(t('node.can_die'));
    if (hasWin)       parts.push(t('node.can_win'));
    lines.push(t('node.section', { n: secId, parts: parts.join(' | ') }));
    if (data.battle)              lines.push(`Battle: ${t('node.battle')}`);
    if (data.priority === 'high') lines.push(`▲ ${t('ctx.priority.high')}`);
    if (data.priority === 'low')  lines.push(`▼ ${t('ctx.priority.low')}`);
    if (data.note) { lines.push('Note:'); data.note.split('\n').forEach(part => lines.push(part)); }
  }
  if (portals && portals.length) {
    lines.push('Portal destinations:');
    portals.forEach(p => {
      const bookName = _graphSeriesBooks.find(b => b.id === p.targetBookId)?.name ?? `Book #${p.targetBookId}`;
      lines.push(p.label || `⇒ ${bookName} ${p.targetSection}`);
    });
  }
  const el = document.createElement('div');
  lines.forEach((line, i) => {
    if (i > 0) el.appendChild(document.createElement('br'));
    el.appendChild(document.createTextNode(line));
  });
  return el;
}

function _getPositionedNeighbors(sec, posMap) {
  // .includes(sec) is strict-equality: data.choices' raw values aren't
  // guaranteed to be the same JS type as sec (which callers pass in already
  // normalized via parseSecId/allDiscoveredSections) - the same string-vs-
  // number trap this project already fixed once in state.js's own
  // discoveredSectionsFor. String() both sides before comparing so a real
  // connection can't be silently missed here too.
  const secStr = String(sec);
  const incoming = [];
  const outgoing = [];
  for (const [srcKey, data] of Object.entries(state.graph)) {
    const src = parseSecId(srcKey);
    if (src === sec) {
      for (const dest of (data.choices || [])) {
        if (!isTerminal(dest) && _hasValidPos(posMap[dest])) outgoing.push(dest);
      }
      continue;
    }
    if ((data.choices || []).some(c => String(c) === secStr) && _hasValidPos(posMap[src])) incoming.push(src);
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
    if (!_hasValidPos(posMap[from])) continue;
    for (const to of (data.choices || [])) {
      if (isTerminal(to) || !_hasValidPos(posMap[to])) continue;
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
    const pending = [...allSections].filter(sec => !_hasValidPos(state.positions[sec]));
    pending.sort((a, b) => {
      const aNeighbors = _getPositionedNeighbors(a, state.positions).all.length;
      const bNeighbors = _getPositionedNeighbors(b, state.positions).all.length;
      return bNeighbors - aNeighbors || naturalCompareIds(a, b);
    });
    for (const sec of pending) {
      const pos = _chooseLocalPosition(sec, state.positions);
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

function naturalCompareIds(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

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
const _GRID_LAYER_GAP = 130; // horizontal spacing between BFS depth layers
const _GRID_COL_GAP   = 70;  // vertical spacing between siblings at the same layer

function _bfsDepth(startSec, allSections) {
  const depth = new Map();
  if (startSec === undefined || startSec === null || !allSections.has(startSec)) return depth;
  depth.set(startSec, 0);
  const queue = [startSec];
  while (queue.length) {
    const cur = queue.shift();
    const choices = state.graph[cur]?.choices || [];
    for (const c of choices) {
      if (isTerminal(c) || depth.has(c) || !allSections.has(c)) continue;
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
function _assignGridPositions(allSections, startSec) {
  const missing = [...allSections].filter(sec => !_hasValidPos(state.positions[sec]));
  if (!missing.length) return false;
  const depth = _bfsDepth(startSec, allSections);
  const maxDepth = depth.size ? Math.max(...depth.values()) : 0;
  missing.sort(naturalCompareIds);
  for (const sec of missing) {
    const neighbors = _getPositionedNeighbors(sec, state.positions).all;
    let x;
    if (neighbors.length) {
      const neighborX = Math.max(...neighbors.map(id => state.positions[id].x));
      x = neighborX + _GRID_LAYER_GAP;
    } else {
      x = (depth.has(sec) ? depth.get(sec) : maxDepth + 1) * _GRID_LAYER_GAP;
    }
    let maxY = -_GRID_COL_GAP;
    for (const other of allSections) {
      const p = state.positions[other];
      if (p && Math.abs(p.x - x) < _GRID_LAYER_GAP / 2 && p.y > maxY) maxY = p.y;
    }
    state.positions[sec] = { x, y: maxY + _GRID_COL_GAP };
  }
  return true;
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

  network.on('beforeDrawing', ctx => drawGrid(ctx));
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
    // Fog-of-grid halos can follow any node, not just overlay ones.
    if (state.fogOfGrid) _fogDraggingActive = true;
  });

  network.on('dragEnd', params => {
    if (params.nodes.length) {
      const positions = network.getPositions(params.nodes);
      // Snap only ever applies to this drag's end position - never touches
      // any node that wasn't just moved, so turning the toggle on can't
      // retroactively reshape an already-placed graph.
      if (state.snapToGrid) {
        for (const id of params.nodes) {
          positions[id].x = Math.round(positions[id].x / GRID_SIZE) * GRID_SIZE;
          positions[id].y = Math.round(positions[id].y / GRID_SIZE) * GRID_SIZE;
        }
        visNodes.update(params.nodes.map(id => ({ id, x: positions[id].x, y: positions[id].y, physics: false })));
      } else {
        visNodes.update(params.nodes.map(id => ({ id, physics: false })));
      }
      Object.assign(state.positions, positions);
      clearTimeout(dragSaveTimer);
      dragSaveTimer = setTimeout(saveState, 1000);
      _overlayDraggingActive = false;
      _overlayPosDirty = true;
      _fogDraggingActive = false;
      _fogPosDirty = true;
    }
  });
}

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
    const hasTerminal = choices.some(isTerminal);
    const hasBattle   = !!state.graph[sec]?.battle;
    const portals     = _graphIsOpenWorld ? (state.graph[sec]?.portals || []) : [];
    const isPortal    = portals.length > 0;
    const isXBookReachable = !!(_graphCrossBookRoute && _graphCrossBookRoute.has(sec));
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
      if (isTerminal(dest)) return;
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

  // Physics management:
  // - Initial layout (no saved positions): the BFS-depth-grid pass above
  //   already pinned every reachable node (physics: !posValid, above), so
  //   initGraph's forceAtlas2Based sim - still nominally "enabled" at the
  //   network level - has nothing left to actually move. Its
  //   stabilizationIterationsDone handler still fires (trivially, near-
  //   instantly) and persists the same positions again; harmless.
  // - Existing layout, new nodes added: re-enable physics to place them, save on settle.
  // - Existing layout, all nodes positioned: keep physics off.
  //
  // Single-flight, not "debounce and blindly retry": if a pass is already
  // running (_stabilizing), this call doesn't schedule anything of its own -
  // it just flags _pendingSync and returns. The *only* thing that starts a
  // follow-up pass is the in-flight pass's own completion handler calling
  // syncGraph() again once it's done, which re-derives hasUnpositioned fresh
  // from current state at that later point in time. A version of this that
  // instead rescheduled a plain retry timer would call stabilize() again
  // unconditionally once its turn came up, even if the graph had already
  // been fully placed by the pass it waited on - an unnecessary pass argued
  // from stale information instead of a real, rechecked need.
  if (hasSavedPositions && hasUnpositioned) {
    if (_stabilizing) {
      _pendingSync = true;
    } else {
      clearTimeout(_restabilizeTimer);
      _restabilizeTimer = setTimeout(() => {
        _restabilizeTimer = null;
        if (!network) return; // book switched away before the timer fired
        if (_stabilizeHandler) network.off('stabilizationIterationsDone', _stabilizeHandler);
        _stabilizeHandler = () => {
          _stabilizing = false;
          network.setOptions({ physics: { enabled: false } });
          // Belt-and-suspenders alongside physics.enabled:false - stabilize()
          // runs its own internal loop that isn't guaranteed to be governed
          // by the enabled flag the same way ordinary always-on physics is,
          // so explicitly halting it here (it should already be finished,
          // this is a no-op in the normal case) avoids relying on that.
          network.stopSimulation();
          Object.assign(state.positions, network.getPositions());
          saveState();
          network.off('stabilizationIterationsDone', _stabilizeHandler);
          _stabilizeHandler = null;
          if (_pendingSync) { _pendingSync = false; syncGraph(); }
        };
        network.on('stabilizationIterationsDone', _stabilizeHandler);
        _stabilizing = true;
        network.setOptions({ physics: { enabled: true, stabilization: { fit: false } } });
        network.stabilize(_lightweightRestabilize ? 60 : 300);
      }, _lightweightRestabilize ? LIGHTWEIGHT_RESTABILIZE_DEBOUNCE_MS : RESTABILIZE_DEBOUNCE_MS);
    }
  } else if (hasSavedPositions) {
    clearTimeout(_restabilizeTimer);
    _restabilizeTimer = null;
    _pendingSync = false;
    // Force-disabling physics here while a stabilize() pass is still
    // actually in flight would leave _stabilizing stuck true forever (its
    // own completion handler, which is what normally clears it, never gets
    // to run) - silently blocking every future restabilize attempt for
    // this book until the network is torn down. Go through the same
    // cleanup the completion handler would have done instead of just
    // cutting physics off underneath it.
    if (_stabilizing) {
      _stabilizing = false;
      if (_stabilizeHandler) { network.off('stabilizationIterationsDone', _stabilizeHandler); _stabilizeHandler = null; }
      network.stopSimulation();
    }
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
    const hasMetadata = node.note || node.priority || node.battle || node.color || node.portals || node.showNote || node.manual;
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
