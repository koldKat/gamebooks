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

const POLL_MS = 3000;

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

let network = null, visNodes = null, visEdges = null;
let lastStateJson = null; // skip a redraw if nothing actually changed since last poll
let lastConnectorStyle = null;
let lastPositions = new Map(); // secId -> "x,y" of the position last actually applied
let currentBookId = null; // which book's graph is actually on screen right now
let overlayNodes = []; // rebuilt each render(), drawn each frame - see drawOverlays()

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
  network.on('afterDrawing', ctx => drawOverlays(ctx));
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
    }
  }
}

function render(state, isOpenWorld) {
  ensureNetwork();
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
    if (data.priority || data.battle || data.note) overlayNodes.push({ sec: secId, priority: data.priority, battle: data.battle, note: data.note });
    for (const dest of (data.choices || [])) {
      if (isTerm(dest)) continue;
      const edgeId = `${secId}->${dest}`;
      seenEdgeIds.add(edgeId);
      edgeUpdates.push({ id: edgeId, from: secId, to: dest });
    }
  }
  visNodes.update(nodeUpdates);
  visEdges.update(edgeUpdates);
  visNodes.getIds().forEach(id => { if (!seenNodeIds.has(id)) { visNodes.remove(id); lastPositions.delete(id); } });
  visEdges.getIds().forEach(id => { if (!seenEdgeIds.has(id)) visEdges.remove(id); });

  const currentSec = activePt?.path?.length ? activePt.path[activePt.path.length - 1] : null;
  if (currentSec != null && visNodes.get(currentSec)) {
    network.focus(currentSec, { animation: { duration: 400, easingFunction: 'easeInOutQuad' }, scale: Math.max(network.getScale(), 1.2) });
  }
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
    if (json !== lastStateJson) { lastStateJson = json; render(data.state, !!data.isOpenWorld); }
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
