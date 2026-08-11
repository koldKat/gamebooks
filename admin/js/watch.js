// watch.js - Admin-only, read-only live canvas viewer prototype.
// Fully self-contained: no imports from any other admin/js or public/js module,
// so it can't interfere with (or be broken by) anything else in the app.
// Polls /api/admin/watch/:userId/:bookId every few seconds and redraws a
// read-only vis-network graph. Nothing here ever writes anything, and the
// polling is invisible to the watched user - it's a plain authenticated GET
// against admin-only, localhost-gated data, same as the rest of the admin panel.
// To remove: delete this file, admin/watch.html, server/routes/watch.js, the
// getActiveBookInSeries export in server/db/books.js, the three lines in
// server.js that wire them up, and the "Watch" button in
// admin/js/users-books.js's renderUserBooksTable().

const POLL_MS = 1000;

// Pinned-note text box measurements - mirrors graph.js's _NOTE_* constants exactly.
const NOTE_FONT    = '10px Segoe UI, system-ui, sans-serif';
const NOTE_PAD_X   = 5;
const NOTE_PAD_Y   = 3;
const NOTE_LINE_H  = 12;
const NOTE_FONT_PX = 10;
const measureCtx   = document.createElement('canvas').getContext('2d');

// Mirrors graph.js's GRID_SIZE/FOG_RADIUS exactly - fixed constants, not
// user-configurable there either, so no per-book value to read from state.
const GRID_SIZE  = 40;
const FOG_RADIUS = 125;

// Mirrors graph.js's CONNECTOR_STYLES/_smoothOption - the watched user's own
// state.connectorStyle, not a fixed style, so the canvas actually looks like
// what they see rather than always-straight lines regardless of their setting.
const CONNECTOR_STYLES = {
  curvedCW:   { enabled: true, type: 'curvedCW',    roundness: 0.2 },
  curvedCCW:  { enabled: true, type: 'curvedCCW',   roundness: 0.2 },
  cubic:      { enabled: true, type: 'cubicBezier', roundness: 0.4, forceDirection: 'none' },
  horizontal: { enabled: true, type: 'cubicBezier', roundness: 0.4, forceDirection: 'horizontal' },
  straight:   { enabled: false },
};
function smoothOption(style) { return CONNECTOR_STYLES[style] ?? CONNECTOR_STYLES.curvedCW; }

const COLORS = {
  current:        { background: '#f5a623', border: '#c47d00' },
  visitedRun:     { background: '#3d9be9', border: '#2980b9' },
  death:          { background: '#e74c3c', border: '#c0392b' },
  victory:        { background: '#27ae60', border: '#1e8449' },
  deathOutline:   { background: '#0f172a', border: '#e74c3c' },
  victoryOutline: { background: '#0f172a', border: '#27ae60' },
  bothOutline:    { background: '#0f172a', border: '#f59e0b' },
  battleOutline:  { background: '#431407', border: '#f97316' },
  battleDeath:    { background: '#c2410c', border: '#9a3412' },
  mapped:         { background: '#8e44ad', border: '#6c3483' },
  discovered:     { background: '#606060', border: '#404040' },
  start:          { background: '#fde047', border: '#a16207' },
};

function darkenHex(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `#${[r, g, b].map(c => Math.round(c * 0.6).toString(16).padStart(2, '0')).join('')}`;
}

const params = new URLSearchParams(location.search);
const userId = params.get('userId');
const requestedBookId = params.get('bookId');
const titleEl  = document.getElementById('watch-title');
const subEl    = document.getElementById('watch-sub');
const statusEl = document.getElementById('watch-status');
const graphContainerEl = document.getElementById('graph-container');

// Mirrors bg.js's _applyBgPref() exactly (same gradient overlay/position math)
// so the watched canvas looks like what the player actually sees - moved
// where they moved it, or blank if they hid it, not always the raw cover.
let lastBgKey = null;
function applyBgPref(bgPref) {
  const key = bgPref ? `${bgPref.bgHidden}|${bgPref.bgPosY}|${bgPref.coverUrl}` : null;
  if (key === lastBgKey) return;
  lastBgKey = key;
  if (!bgPref || bgPref.bgHidden || !bgPref.coverUrl) {
    graphContainerEl.style.backgroundImage = '';
    graphContainerEl.style.backgroundColor = '#111827';
    return;
  }
  graphContainerEl.style.backgroundImage =
    `linear-gradient(rgba(15,23,42,0.92), rgba(15,23,42,0.92)), url(${bgPref.coverUrl})`;
  graphContainerEl.style.backgroundPositionY = `${bgPref.bgPosY}%`;
  graphContainerEl.style.backgroundColor = '';
}

let network = null, visNodes = null, visEdges = null;
let lastStateJson = null; // skip a redraw if nothing actually changed since last poll
let lastConnectorStyle = null;
let lastPositions = new Map(); // secId -> "x,y" of the position last actually applied
let currentBookId = null; // which book's graph is actually on screen right now
let overlayNodes = []; // rebuilt each render(), drawn each frame - see drawOverlays()
let lastFocusedSec = null; // last section the camera was actually moved to

// The watched player's own grid settings, not an admin-side control - the
// point of this viewer is to show the canvas exactly as they see it, same
// as connectorStyle above. Set at the top of render(), read by drawGrid()
// on every 'beforeDrawing' frame.
let gridState = { showGrid: false, fogOfGrid: false };

function isTerm(v) { return v === -1 || v === 0 || v === '-1' || v === '0'; }

// Mirrors state.js's discoveredSectionsFor() - a section only gets its own
// state.graph entry once choices are recorded from it, or it's referenced as
// someone else's choice target. The player's current position (no choices
// recorded there yet) and any discovered-but-unmapped section (referenced as
// a choice, never actually visited) both only ever show up in a playthrough's
// path or a graph entry's choices[] - iterating Object.keys(graph) alone
// silently drops both.
function knownSections(graph, playthroughs, startSection) {
  const startSec = (startSection && startSection !== '') ? startSection : 1;
  const set = new Set([startSec]);
  Object.entries(graph || {}).forEach(([secKey, data]) => {
    if (secKey === '-1' || secKey === '0') return;
    const secId = /^-?\d+$/.test(secKey) ? Number(secKey) : secKey;
    set.add(secId);
    (data.choices || []).forEach(c => { if (!isTerm(c)) set.add(c); });
  });
  (playthroughs || []).forEach(pt => (pt.path || []).forEach(s => { if (!isTerm(s)) set.add(s); }));
  return set;
}

// Mirrors graph.js's inevitableOutcome()/edgeColor() exactly - an edge whose
// destination chains through single-choice sections straight into a death/win
// terminal gets tinted red/green ahead of time, same as the real canvas.
function inevitableOutcome(graph, destId, visited = new Set()) {
  if (destId === -1 || destId === '-1') return 'death';
  if (destId === 0  || destId === '0')  return 'win';
  if (visited.has(destId)) return null;
  visited.add(destId);
  const data = graph[destId];
  if (!data || data.choices?.length !== 1) return null;
  return inevitableOutcome(graph, data.choices[0], visited);
}

function edgeColor(graph, dest, isRunEdge) {
  const outcome = inevitableOutcome(graph, dest);
  if (outcome === 'death') return { color: '#e74c3c', opacity: 0.8, highlight: '#e74c3c' };
  if (outcome === 'win')   return { color: '#27ae60', opacity: 0.8, highlight: '#27ae60' };
  if (isRunEdge)           return { color: '#f5a623', opacity: 1,   highlight: '#f5a623' };
  return { color: '#4b5563', opacity: 0.7, highlight: '#9ca3af' };
}

function nodeColor(secId, graph, playthroughs, startSection, activePt) {
  const startSec = startSection && startSection !== '' ? startSection : 1;
  if (secId === startSec) return COLORS.start;
  if (activePt && activePt.path?.includes(secId)) {
    if (activePt.path[activePt.path.length - 1] === secId) return COLORS.current;
    return COLORS.visitedRun;
  }
  let base = null;
  const ends = (playthroughs || []).filter(p =>
    p.completed && p.path?.length && p.path[p.path.length - 1] === secId
  );
  if (ends.some(p => (p.result === 'death' || p.result === 'battle')) && ends.some(p => p.result === 'success'))
    base = { background: '#b45309', border: '#f59e0b' };
  else if (ends.some(p => p.result === 'death'))   base = COLORS.death;
  else if (ends.some(p => p.result === 'battle'))  base = COLORS.battleDeath;
  else if (ends.some(p => p.result === 'success')) base = COLORS.victory;

  if (!base) {
    const choices  = graph[secId]?.choices || [];
    const hasDeath = choices.some(c => c === -1 || c === '-1');
    const hasWin   = choices.some(c => c === 0 || c === '0');
    if (hasDeath && hasWin) base = COLORS.bothOutline;
    else if (hasDeath) base = COLORS.deathOutline;
    else if (hasWin)   base = COLORS.victoryOutline;
    else if (graph[secId] && (!graph[secId].discovered || graph[secId].portals?.length > 0)) base = COLORS.mapped;
    else base = COLORS.discovered;
  }

  // Custom color (right-click a node -> paint it) overrides the base fill,
  // same precedence graph.js uses - not for the "special state" colors
  // above (current/visited/death/win), only the mapped/discovered fallback.
  const customColor = graph[secId]?.color;
  if (customColor) base = { background: customColor, border: darkenHex(customColor) };

  // Battle flag keeps whatever fill is active, overrides only the border.
  if (graph[secId]?.battle) return { background: base.background, border: COLORS.battleOutline.border };
  return base;
}

function ensureNetwork() {
  if (network) return;
  visNodes = new vis.DataSet();
  visEdges = new vis.DataSet();
  network = new vis.Network(
    document.getElementById('graph-container'),
    { nodes: visNodes, edges: visEdges },
    {
      nodes: { shape: 'dot', size: 14, font: { size: 11, color: '#ffffff', face: 'Segoe UI, system-ui, sans-serif' }, borderWidth: 2 },
      edges: { arrows: { to: { enabled: true, scaleFactor: 0.5 } }, color: { color: '#4b5563', opacity: 0.7 }, width: 1.2, smooth: smoothOption(null) },
      physics: { enabled: true, solver: 'forceAtlas2Based', forceAtlas2Based: { gravitationalConstant: -120, springLength: 160, springConstant: 0.05, damping: 0.5, avoidOverlap: 1 }, stabilization: { iterations: 200 } },
      // Read-only: no editing, but panning/zooming to look around is harmless.
      interaction: { hover: true, zoomView: true, dragView: true, dragNodes: false, selectable: false },
    }
  );
  network.on('beforeDrawing', ctx => drawGrid(ctx));
  network.on('afterDrawing', ctx => drawOverlays(ctx));
}

// Mirrors graph.js's drawGrid() - same beforeDrawing hook (under nodes/edges),
// same world-coordinate math via DOMtoCanvas(). No position-drag caching here
// like graph.js has, since dragNodes is disabled in this read-only viewer -
// there's never a mid-drag frame to worry about, only the player's own drags,
// which land in state.positions and get picked up on the next poll like any
// other position change.
function drawGrid(ctx) {
  if (!network || (!gridState.showGrid && !gridState.fogOfGrid)) return;
  const container = document.getElementById('graph-container');
  if (!container) return;
  const topLeft     = network.DOMtoCanvas({ x: 0, y: 0 });
  const bottomRight = network.DOMtoCanvas({ x: container.clientWidth, y: container.clientHeight });

  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
  ctx.lineWidth   = 1 / network.getScale();

  if (gridState.fogOfGrid) {
    if (!visNodes) { ctx.restore(); return; }
    const ids = visNodes.getIds();
    if (!ids.length) { ctx.restore(); return; }
    const positions = network.getPositions(ids);
    ctx.beginPath();
    for (const id of ids) {
      const p = positions[id];
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

// Small icon overlays (priority triangle / battle cross / note book-icon) -
// ported directly from graph.js's drawOverlays(), same shapes/colors/offsets,
// minus the pinned-note text-box rendering (not worth it for a prototype).
function drawOverlays(ctx) {
  if (!overlayNodes.length) return;
  const ids = overlayNodes.map(n => n.sec);
  const pos = network.getPositions(ids);
  ctx.lineCap = 'butt';
  for (const node of overlayNodes) {
    const p = pos[node.sec];
    if (!p) continue;
    if (node.priority) {
      const hi = node.priority === 'high';
      const cx = p.x - 9, cy = p.y - 9, r = 5;
      ctx.beginPath();
      if (hi) { ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r * 0.65); ctx.lineTo(cx - r, cy + r * 0.65); }
      else    { ctx.moveTo(cx, cy + r); ctx.lineTo(cx + r, cy - r * 0.65); ctx.lineTo(cx - r, cy - r * 0.65); }
      ctx.closePath();
      ctx.fillStyle = hi ? '#4ade80' : '#f87171';
      ctx.fill();
      ctx.strokeStyle = hi ? '#14532d' : '#991b1b';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    if (node.battle) {
      const cx = p.x + 9, cy = p.y + 9, r = 4;
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    if (node.note) {
      const bx = p.x + 6, by = p.y - 13, bw = 6, bh = 8;
      ctx.fillStyle = '#16a34a';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(bx + 2, by + 1);
      ctx.lineTo(bx + 2, by + bh - 1);
      ctx.stroke();
    }
    // Pinned note (showNote:true) - a readable text box, not just the icon
    // above. This is what section 45-style test notes actually look like on
    // the real play area; the tiny icon alone is easy to miss entirely.
    if (node.noteLayout) {
      const { lines, boxW, boxH } = node.noteLayout;
      const bx = p.x + 18, by = p.y - boxH / 2;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 3);
      ctx.fill();
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.font = NOTE_FONT;
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#d1d5db';
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], bx + NOTE_PAD_X, by + NOTE_PAD_Y + i * NOTE_LINE_H);
    }
  }
}

function render(state, isOpenWorld) {
  ensureNetwork();
  gridState.showGrid  = !!state.showGrid;
  gridState.fogOfGrid = !!state.fogOfGrid;
  if (state.connectorStyle !== lastConnectorStyle) {
    lastConnectorStyle = state.connectorStyle;
    network.setOptions({ edges: { smooth: smoothOption(state.connectorStyle) } });
  }
  const graph = state.graph || {};
  const playthroughs = state.playthroughs || [];
  const activePt = state.activePtIndex != null ? playthroughs[state.activePtIndex] : null;

  // Diffed update, not clear()+add() - a full recreate re-seeds every
  // position-less node with physics:true again on every poll, restarting the
  // force-directed simulation from scratch every 3s. The graph never settles,
  // which makes any path through it (however correctly colored) impossible
  // to actually see or follow. Only ever set position/physics for a node the
  // first time it's added; leave it alone on every later poll.
  const seenNodeIds = new Set();
  const seenEdgeIds = new Set();
  const nodeUpdates = [];
  const edgeUpdates = [];
  overlayNodes = [];

  // Mirrors graph.js's runEdges set - which consecutive path[i]->path[i+1]
  // pairs the watched player's current run has actually walked, so those
  // edges get the same orange/thick treatment as the real canvas instead of
  // looking identical to every other undiscovered choice.
  const runEdges = new Set();
  const runPath  = activePt?.path || [];
  for (let i = 0; i < runPath.length - 1; i++) runEdges.add(`${runPath[i]}->${runPath[i + 1]}`);

  const known = knownSections(graph, playthroughs, state.startSection);
  for (const secId of known) {
    const data = graph[secId] || {};
    seenNodeIds.add(secId);
    const color = nodeColor(secId, graph, playthroughs, state.startSection, activePt);
    const portals = isOpenWorld ? (data.portals || []) : [];
    const isPortal = portals.length > 0;
    const update = {
      id: secId,
      label: isPortal ? `${secId}\n⇒` : String(secId),
      color: isPortal ? { ...color, border: '#facc15', highlight: { ...(color.highlight || {}), border: '#fde047' } } : color,
      shape: isPortal ? 'diamond' : 'dot',
      size: isPortal ? 16 : 14,
      borderWidth: (data.battle || (data.choices || []).some(isTerm)) ? 4 : isPortal ? 3 : 2,
    };
    const pos = state.positions?.[secId];
    const isNew = !visNodes.get(secId);
    if (isNew) {
      if (pos) { update.x = pos.x; update.y = pos.y; update.physics = false; lastPositions.set(secId, `${pos.x},${pos.y}`); }
      else update.physics = true;
    } else if (pos) {
      // The player can drag a node after it's already on screen here - a
      // fixed-position node only ever got its x/y set once, on first
      // appearance, so a later drag was silently never reflected. Re-apply
      // only when the saved position actually changed, so an unmoved node
      // isn't repositioned (and thus doesn't fight physics) every poll.
      const key = `${pos.x},${pos.y}`;
      if (lastPositions.get(secId) !== key) {
        lastPositions.set(secId, key);
        update.x = pos.x; update.y = pos.y; update.physics = false;
      }
    }
    nodeUpdates.push(update);
    if (data.priority || data.battle || data.note) {
      let noteLayout = null;
      if (data.showNote && data.note) {
        measureCtx.font = NOTE_FONT;
        const lines = data.note.split('\n');
        const boxW  = Math.max(...lines.map(l => measureCtx.measureText(l).width)) + NOTE_PAD_X * 2;
        const boxH  = NOTE_PAD_Y * 2 + (lines.length - 1) * NOTE_LINE_H + NOTE_FONT_PX;
        noteLayout  = { lines, boxW, boxH };
      }
      overlayNodes.push({ sec: secId, priority: data.priority, battle: data.battle, note: data.note, noteLayout });
    }
    for (const dest of (data.choices || [])) {
      if (isTerm(dest)) continue;
      const edgeId    = `${secId}->${dest}`;
      const isRunEdge = runEdges.has(edgeId);
      seenEdgeIds.add(edgeId);
      edgeUpdates.push({
        id:    edgeId,
        from:  secId,
        to:    dest,
        color: edgeColor(graph, dest, isRunEdge),
        width: isRunEdge ? 2.5 : 1.2,
      });
    }
  }
  visNodes.update(nodeUpdates);
  visEdges.update(edgeUpdates);
  visNodes.getIds().forEach(id => { if (!seenNodeIds.has(id)) { visNodes.remove(id); lastPositions.delete(id); } });
  visEdges.getIds().forEach(id => { if (!seenEdgeIds.has(id)) visEdges.remove(id); });

  // Only actually move the camera when the player's position genuinely
  // changed - render() runs on every poll where anything at all in state
  // changed (charsheet edits, inventory, etc, not just movement), so
  // re-focusing unconditionally here fought any attempt to pan away and
  // look at another part of the graph, snapping straight back within a
  // second or two even though nothing about the player's position moved.
  const currentSec = activePt?.path?.length ? activePt.path[activePt.path.length - 1] : null;
  if (currentSec != null && currentSec !== lastFocusedSec && visNodes.get(currentSec)) {
    lastFocusedSec = currentSec;
    network.focus(currentSec, { animation: { duration: 400, easingFunction: 'easeInOutQuad' }, scale: Math.max(network.getScale(), 1.2) });
  }
}

// ── On-field HUD: character sheet + inventory, exactly like #stats-hud ──────
// The real play area never shows a full dump of everything the player is
// carrying - only whatever they've explicitly marked "show on screen" via
// charsheet.js's per-field `visible` flag, inventory.js's per-slot `visible`
// flag, and equipment.js's equipmentVisible[slot] flag. This mirrors that
// exactly (same filters, same #charsheet-display/#inv-display text format
// and positioning as charsheet.css/inventory.js), rendered directly over the
// canvas instead of in a separate panel with everything unconditionally shown.

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const SLOT_LABELS = {
  head: 'Head', neck: 'Neck', chest: 'Chest', belt: 'Belt', legs: 'Legs', feet: 'Feet',
  cloak: 'Cloak', ring1: 'Ring 1', ring2: 'Ring 2', ring3: 'Ring 3', ring4: 'Ring 4',
  primary: 'Weapon', secondary: 'Off-hand', hands: 'Hands', back: 'Back',
  item1: 'Item 1', item2: 'Item 2', item3: 'Item 3', item4: 'Item 4', item5: 'Item 5',
};
function eqItemId(entry) { return (entry && typeof entry === 'object') ? entry.itemId : entry; }
function eqMeta(entry) { return (entry && typeof entry === 'object') ? { label: entry.label || '', note: entry.note || '' } : { label: '', note: '' }; }
function eqQty(entry) { return (entry && typeof entry === 'object') ? (entry.qty || 1) : 1; }

function fmtCsValue(f) {
  if (f.type === 'boolean') return f.value ? '✓' : '✗';
  if (f.type === 'list')    return Array.isArray(f.value) && f.value.length ? f.value.join(', ') : '-';
  if (f.type === 'number')  return Number.isFinite(Number(f.value)) ? Number(f.value).toLocaleString() : String(f.value ?? 0);
  return (f.value !== undefined && f.value !== '' && f.value !== null) ? String(f.value) : '-';
}

function invLineHtml(name, qty, note, slotLabel, kind, iconSvg) {
  const noteHtml  = note?.trim() ? ` <span class="inv-line-note">${escapeHtml(note.trim())}</span>` : '';
  const qtyHtml   = qty > 1 ? ` <span class="inv-line-qty">×${qty}</span>` : '';
  const slotHtml  = slotLabel ? ` <span class="inv-line-slot">${escapeHtml(slotLabel)}</span>` : '';
  // item.svg_data is trusted admin-managed content (same items table the real
  // inventory.js injects unescaped via innerHTML), not user input - safe to
  // inject directly, same as the real app does.
  const iconHtml = iconSvg ? `<span class="inv-line-icon">${iconSvg}</span>` : '';
  // Badge always last (rightmost, since .inv-line is justify-content:flex-end) -
  // a note would otherwise become the last DOM child whenever one exists,
  // bumping the badge out of its usual rightmost spot.
  return `<span class="inv-line inv-line--${kind}">${iconHtml}<span class="inv-line-name">${escapeHtml(name)}</span>${qtyHtml}${noteHtml}${slotHtml}</span>`;
}

function renderHud(items, activePt) {
  const itemsById = new Map((items || []).map(it => [it.id, it]));

  const csEl = document.getElementById('watch-cs-display');
  const csFields = (activePt?.charSheet?.fields || []).filter(f => f.visible && f.name?.trim());
  csEl.innerHTML = csFields.map(f =>
    `<span class="cs-line"><span class="cs-label">${escapeHtml(f.name)}:</span> ${escapeHtml(fmtCsValue(f))}</span>`
  ).join('');

  const invEl = document.getElementById('watch-inv-display');
  // Only inventory slots explicitly marked "show on screen" - not merely
  // "carried". Matches inventory.js's own _inv().filter(s => s.visible).
  // A slot whose itemId no longer resolves to a real item (deleted from the
  // catalog) is dropped entirely, not shown as a placeholder "Item #N" - the
  // real player's own HUD (inventory.js's renderInventoryDisplay: `if
  // (!item) return ''`) never shows those either, so falling back to a
  // placeholder here made the watch view show dozens of phantom lines the
  // player themselves never sees on screen.
  const invLines = (activePt?.inventory || [])
    .filter(s => s.itemId && s.visible && itemsById.has(s.itemId))
    .map(s => invLineHtml(s.label?.trim() || itemsById.get(s.itemId).name, s.qty ?? 1, s.note, 'Item', 'item', itemsById.get(s.itemId).svg_data));
  // Same for equipped slots - only ones equipmentVisible[slot] marks visible.
  // Matches equipment.js's getVisibleEquippedItems() (`.filter(e => e.item)`).
  const eqVis = activePt?.equipmentVisible || {};
  const eqLines = Object.entries(activePt?.equipment || {})
    .map(([key, entry]) => ({ key, itemId: eqItemId(entry), meta: eqMeta(entry), qty: eqQty(entry) }))
    .filter(e => e.itemId && eqVis[e.key] && itemsById.has(e.itemId))
    .map(e => invLineHtml(e.meta.label?.trim() || itemsById.get(e.itemId).name, e.qty, e.meta.note, SLOT_LABELS[e.key] ?? e.key, 'equipped', itemsById.get(e.itemId).svg_data));
  invEl.innerHTML = [...invLines, ...eqLines].join('');
}

// Notebook is book-level (state.notesPinned + a separate user_books.notebook
// column), not tied to any one playthrough - shown whenever the player has
// it pinned, same as notes.js's own #notes-display would, regardless of
// whether the currently active run has anything else going on.
function renderNotes(state, notebook) {
  const el = document.getElementById('watch-notes');
  // Matches notes.js's setNotesPinned() exactly - visible purely on the
  // pinned flag, not on whether there's text yet (an empty pinned box is
  // what the player themselves would see too).
  el.classList.toggle('visible', !!state.notesPinned);
  el.textContent = notebook || '';
}

// The player can portal to a different book mid-run in an open-world series -
// the server already resolves and returns whichever book they're truly active
// in (see server/routes/watch.js), this just has to notice the switch and
// throw away all per-book state (positions/graph/physics) since none of it
// applies to the new book at all.
function resetForNewBook() {
  if (network) { network.destroy(); network = null; }
  visNodes = null; visEdges = null;
  lastStateJson = null;
  lastConnectorStyle = null;
  lastPositions = new Map();
  overlayNodes = [];
  lastFocusedSec = null;
  lastBgKey = null;
}

async function poll() {
  try {
    const res = await fetch(`/api/admin/watch/${userId}/${requestedBookId}`);
    if (!res.ok) { statusEl.textContent = `error (${res.status})`; statusEl.classList.add('stale'); return; }
    const data = await res.json();
    titleEl.textContent = `Watching ${data.username || 'user #' + userId}`;
    subEl.textContent   = data.state?.bookName ? `- ${data.state.bookName}` : '';
    if (data.bookId != null && data.bookId !== currentBookId) {
      if (currentBookId != null) subEl.textContent += ' (followed to another book)';
      currentBookId = data.bookId;
      resetForNewBook();
    }
    const json = JSON.stringify(data.state);
    if (json !== lastStateJson) {
      lastStateJson = json;
      render(data.state, !!data.isOpenWorld);
      const activePt = data.state.activePtIndex != null ? data.state.playthroughs?.[data.state.activePtIndex] : null;
      renderHud(data.items, activePt);
    }
    // Not gated on the state-changed check above - notebook text lives in its
    // own DB column, not state_data, so editing it wouldn't be caught by that
    // comparison at all. Cheap enough (one textContent/class toggle) to just
    // apply every poll regardless.
    renderNotes(data.state, data.notebook);
    // Same reasoning - bg_hidden/bg_pos_y live in user_books, not state_data,
    // so the state-changed check above wouldn't catch a background move/hide
    // either. applyBgPref() has its own no-op guard for "nothing changed".
    applyBgPref(data.bgPref);
    statusEl.textContent = `updated ${new Date().toLocaleTimeString()}`;
    statusEl.classList.remove('stale');
  } catch (e) {
    statusEl.textContent = 'connection lost';
    statusEl.classList.add('stale');
  }
}

if (!userId || !requestedBookId) {
  titleEl.textContent = 'Missing userId/bookId';
} else {
  poll();
  setInterval(poll, POLL_MS);
}
