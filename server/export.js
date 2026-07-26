'use strict';
const zlib = require('zlib');
const { escapeHtml } = require('./html-escape');

// Windows reserves these device names (case-insensitive, with or without an extension) -
// a zip entry literally named "CON" or "CON.html" fails to extract with many Windows
// zip tools, so a book titled e.g. "Con" would otherwise silently break its own export.
const _RESERVED_WIN_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
// Keeps zip entries well under typical filesystem path limits even with multi-byte
// UTF-8 names and the " (2)"-style dedup suffix buildFullExportZip may append.
const _MAX_FILENAME_LEN = 150;

// For display / HTML content - keeps all Unicode (Cyrillic, Japanese, etc.)
function safeFilename(name, fallback) {
  let n = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0, _MAX_FILENAME_LEN);
  // slice() cuts by UTF-16 code unit, which can split an astral character (emoji, rare
  // CJK) in half and leave a dangling lone surrogate - drop it if so.
  if (n.length && /[\uD800-\uDBFF]$/.test(n)) n = n.slice(0, -1);
  n = n.trim();
  if (!n || _RESERVED_WIN_NAMES.test(n)) return fallback;
  return n;
}

// ── CRC-32 ────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── Minimal ZIP builder ───────────────────────────────────────────────────────
// files: [{ name: string, data: Buffer|string }]
function buildZip(files) {
  const now   = new Date();
  const dTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const locals = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const raw     = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
    const deflated = zlib.deflateRawSync(raw, { level: 6 });
    const useDeflate = deflated.length < raw.length;
    const body   = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc    = crc32(raw);

    // Unicode Path Extra Field (0x7075) - unzip 6.x on Debian reads this
    // even when it ignores the 0x0800 flag, giving proper UTF-8 filenames.
    const upef = Buffer.alloc(9 + nameBuf.length);
    upef.writeUInt16LE(0x7075, 0);
    upef.writeUInt16LE(5 + nameBuf.length, 2);
    upef.writeUInt8(0x01, 4);
    upef.writeUInt32LE(crc32(nameBuf), 5);
    nameBuf.copy(upef, 9);

    const lh = Buffer.alloc(30 + nameBuf.length + upef.length);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(dTime, 10);
    lh.writeUInt16LE(dDate, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(upef.length, 28);
    nameBuf.copy(lh, 30);
    upef.copy(lh, 30 + nameBuf.length);

    const cd = Buffer.alloc(46 + nameBuf.length + upef.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(dTime, 12);
    cd.writeUInt16LE(dDate, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(upef.length, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    nameBuf.copy(cd, 46);
    upef.copy(cd, 46 + nameBuf.length);

    locals.push(lh, body);
    central.push(cd);
    offset += lh.length + body.length;
  }

  const cdBuf = Buffer.concat(central);
  const eocd  = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, cdBuf, eocd]);
}

// ── Equipment slot label lookup ───────────────────────────────────────────────
const SLOT_LABELS = {
  head: 'Head', neck: 'Neck', chest: 'Chest', belt: 'Belt', legs: 'Legs', feet: 'Feet',
  cloak: 'Cloak', ring1: 'Ring 1', ring2: 'Ring 2', ring3: 'Ring 3', ring4: 'Ring 4',
  primary: 'Weapon', secondary: 'Off-hand', hands: 'Hands', back: 'Back',
  item1: 'Item 1', item2: 'Item 2', item3: 'Item 3', item4: 'Item 4', item5: 'Item 5',
};

function _eqItemId(entry) {
  return (entry && typeof entry === 'object') ? entry.itemId : entry;
}
function _eqMeta(entry) {
  return (entry && typeof entry === 'object') ? { label: entry.label || '', note: entry.note || '' } : { label: '', note: '' };
}
function _eqQty(entry) {
  return (entry && typeof entry === 'object') ? (entry.qty || 1) : 1;
}

// ── Graph snapshot (SVG, not PNG) ───────────────────────────────────────────────
// Generated entirely from stored data (node positions, colors are just rules applied
// to plain objects) - no browser/canvas needed, so this runs server-side in one pass
// instead of round-tripping through the client to rasterize a live vis-network canvas.
// That earlier canvas approach also produced blurry PNGs (a <canvas> has no notion of
// "resolution" beyond its pixel size); SVG is vector, so it's sharp at any zoom/print
// size instead. Colors mirror graph.js's nodeColor()/edgeColor() - specifically the
// "no specific run being viewed" aggregate branch, since a static snapshot has no
// single displayed run. Keep in sync with public/js/constants.js's COLORS if it changes.
const GRAPH_COLORS = {
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

// The exported HTML is meant to stand on its own outside the app (that's the whole
// point of exporting), so - unlike relying on the live app's separate legend panel -
// buildBookHtml() embeds one directly next to the graph image. Includes the
// death+victory-both-available color (GRAPH_COLORS.bothOutline), which isn't
// currently explained in either of the app's own live legends either.
function _exportLegendHtml() {
  const dot = (c) => `<span class="legend-dot" style="background:${c.background};border:2px solid ${c.border}"></span>`;
  const items = [
    [GRAPH_COLORS.start,          'Start'],
    [GRAPH_COLORS.mapped,         'Mapped'],
    [GRAPH_COLORS.discovered,     'Discovered only'],
    [GRAPH_COLORS.deathOutline,   'Can die here'],
    [GRAPH_COLORS.victoryOutline, 'Can win here'],
    [GRAPH_COLORS.bothOutline,    'Can die or win here'],
    [GRAPH_COLORS.battleOutline,  'Battle here'],
    [GRAPH_COLORS.victory,        'Victory ended here'],
    [GRAPH_COLORS.death,          'Death ended here'],
    [GRAPH_COLORS.battleDeath,    'Battle death ended here'],
  ];
  return `<div class="legend">${items.map(([c, label]) => `<span class="legend-item">${dot(c)}${label}</span>`).join('')}</div>`;
}

function _isTerm(v) { return v === -1 || v === 0 || v === '-1' || v === '0'; }

function _darkenHex(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `#${[r, g, b].map(c => Math.round(c * 0.6).toString(16).padStart(2, '0')).join('')}`;
}

function _inevitableOutcome(graph, destId, visited = new Set()) {
  if (_isTerm(destId)) return (destId === -1 || destId === '-1') ? 'death' : 'win';
  if (visited.has(destId)) return null;
  visited.add(destId);
  const data = graph[destId];
  if (!data || (data.choices || []).length !== 1) return null;
  return _inevitableOutcome(graph, data.choices[0], visited);
}

function _edgeColor(graph, dest) {
  const outcome = _inevitableOutcome(graph, dest);
  if (outcome === 'death') return '#e74c3c';
  if (outcome === 'win')   return '#27ae60';
  return '#4b5563';
}

function _isValidStartSec(v) {
  if (v == null) return false;
  return typeof v === 'number' ? (v > 0 && Number.isInteger(v)) : String(v).length > 0;
}

// graph[secId].color is stored, client-set state - the live UI only ever writes one of a
// fixed set of swatch hex values, but the server never enforces that on save, and this
// value gets interpolated straight into an SVG fill="..." attribute below. An untrusted
// value here (e.g. a hand-crafted state payload posted directly to the save endpoint)
// could break out of the attribute and inject markup/script into the exported SVG, which
// executes if opened directly in a browser rather than as an <img> - reject anything that
// isn't a genuine #rrggbb hex string instead of trusting stored data.
function _isHexColor(v) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v); }

function _nodeColor(secId, graph, playthroughs, startSection) {
  const startSec = _isValidStartSec(startSection) ? startSection : 1;
  if (secId === startSec) return GRAPH_COLORS.start;

  const ends = (playthroughs || []).filter(p =>
    p.completed && p.path?.length && p.path[p.path.length - 1] === secId
  );
  const hasEndDeath   = ends.some(p => p.result === 'death');
  const hasEndBattle  = ends.some(p => p.result === 'battle');
  const hasEndVictory = ends.some(p => p.result === 'success');

  let base;
  if ((hasEndDeath || hasEndBattle) && hasEndVictory) base = { background: '#b45309', border: '#f59e0b' };
  else if (hasEndDeath)   base = GRAPH_COLORS.death;
  else if (hasEndBattle)  base = GRAPH_COLORS.battleDeath;
  else if (hasEndVictory) base = GRAPH_COLORS.victory;

  if (!base) {
    const choices    = graph[secId]?.choices || [];
    const hasDeath   = choices.some(c => c === -1 || c === '-1');
    const hasVictory = choices.some(c => c === 0 || c === '0');
    if (hasDeath && hasVictory) base = GRAPH_COLORS.bothOutline;
    else if (hasDeath)          base = GRAPH_COLORS.deathOutline;
    else if (hasVictory)        base = GRAPH_COLORS.victoryOutline;
    else if (graph[secId] && !graph[secId].discovered) base = GRAPH_COLORS.mapped;
    else                                                base = GRAPH_COLORS.discovered;
  }

  const customColor = graph[secId]?.color;
  if (_isHexColor(customColor)) base = { background: customColor, border: _darkenHex(customColor) };

  if (graph[secId]?.battle) return { background: base.background, border: GRAPH_COLORS.battleOutline.border };
  return base;
}

// Mirrors graph.js's CONNECTOR_STYLES (vis-network's "smooth" edge types): 'straight'
// draws a plain line; curvedCW/curvedCCW/cubic/horizontal all bow the edge away from a
// straight line through a control point offset perpendicular to it - CW and CCW offset
// in opposite directions, cubic/horizontal don't have a clean straight-line SVG
// equivalent so they're approximated as a CW curve rather than left as straight lines
// (visually closer to what the book actually uses than ignoring the setting entirely).
function _curveControlPoint(x1, y1, x2, y2, style) {
  if (style === 'straight') return null;
  const roundness = (style === 'cubic' || style === 'horizontal') ? 0.3 : 0.2;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const sign = style === 'curvedCCW' ? -1 : 1; // CW is the default direction
  // perpendicular unit vector, offset by roundness * edge length
  return { x: mx + (-dy / len) * roundness * len * sign, y: my + (dx / len) * roundness * len * sign };
}

// Returns an SVG string, or null if the book has never been laid out (nothing to draw).
function buildGraphSvg(graph, positions, playthroughs, startSection, connectorStyle) {
  const esc = escapeHtml;
  const R = 12, PAD = 40, LABEL_GAP = 22; // LABEL_GAP: room below each node for its label

  const nodes = [];
  for (const [secKey, data] of Object.entries(graph || {})) {
    if (secKey === '-1' || secKey === '0') continue;
    const pos = positions?.[secKey];
    // Number.isFinite (not typeof === 'number') - NaN and Infinity are both typeof
    // 'number' and would otherwise poison every min/max/width/height computation below,
    // producing a viewBox like "0 0 NaN Infinity" (blank/broken SVG) for the whole book
    // over one bad coordinate.
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;
    nodes.push({ key: secKey, x: pos.x, y: pos.y, data });
  }
  if (!nodes.length) return null;
  const byKey = new Map(nodes.map(n => [n.key, n]));

  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const width  = (Math.max(...xs) - minX) + PAD * 2 + R * 2;
  const height = (Math.max(...ys) - minY) + PAD * 2 + R * 2 + LABEL_GAP;
  const px = n => n.x - minX + PAD + R;
  const py = n => n.y - minY + PAD + R;

  const edgeParts = [];
  for (const n of nodes) {
    for (const dest of (n.data.choices || [])) {
      if (_isTerm(dest)) continue;
      const to = byKey.get(String(dest));
      if (!to) continue;
      const x1 = px(n), y1 = py(n), x2 = px(to), y2 = py(to);
      const color = _edgeColor(graph, dest);
      const ctrl  = _curveControlPoint(x1, y1, x2, y2, connectorStyle);
      // shorten the end point so the arrowhead lands on the destination node's edge, not
      // its center - along the curve's own tangent (through ctrl) when curved, otherwise
      // straight from the source.
      const tx = ctrl ? ctrl.x : x1, ty = ctrl ? ctrl.y : y1;
      const tdx = x2 - tx, tdy = y2 - ty, tlen = Math.hypot(tdx, tdy) || 1;
      const ex = x2 - (tdx / tlen) * (R + 8), ey = y2 - (tdy / tlen) * (R + 8);
      const d = ctrl
        ? `M${x1.toFixed(1)},${y1.toFixed(1)} Q${ctrl.x.toFixed(1)},${ctrl.y.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`
        : `M${x1.toFixed(1)},${y1.toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)}`;
      edgeParts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.85" marker-end="url(#arrow)"/>`);
    }
  }

  // Label sits below the node (vis-network's default for 'dot'-shaped nodes - it's never
  // actually inside the dot in the live graph either) rather than crammed inside a small
  // circle, where multi-digit section numbers would overflow or get truncated.
  const nodeParts = nodes.map(n => {
    const secId  = /^-?\d+$/.test(n.key) ? Number(n.key) : n.key;
    const color  = _nodeColor(secId, graph, playthroughs, startSection);
    const choices = n.data.choices || [];
    const thick  = choices.some(c => c === -1 || c === '-1' || c === 0 || c === '0') || n.data.battle;
    const cx = px(n), cy = py(n);
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${R}" fill="${color.background}" stroke="${color.border}" stroke-width="${thick ? 3 : 1.5}"/>` +
           `<text x="${cx.toFixed(1)}" y="${(cy + R + 13).toFixed(1)}" text-anchor="middle" font-size="10" fill="#d1d5db">${esc(n.key)}</text>`;
  }).join('\n  ');

  // Cap whichever dimension is larger (not just width) so a mostly-vertical graph gets
  // scaled down proportionally instead of ending up with a huge, mismatched intrinsic
  // height - explicit width AND height (not just viewBox) so opening the file directly
  // renders at a sane size instead of the browser guessing and padding it out.
  const maxDim = 1600;
  const scale  = Math.min(1, maxDim / Math.max(width, height));
  const outW   = Math.round(width * scale);
  const outH   = Math.round(height * scale);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(1)} ${height.toFixed(1)}" width="${outW}" height="${outH}" font-family="Segoe UI, system-ui, sans-serif">
  <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#9ca3af"/></marker></defs>
  <rect width="100%" height="100%" fill="#111827"/>
  ${edgeParts.join('\n  ')}
  ${nodeParts}
</svg>`;
}

// ── HTML generator ────────────────────────────────────────────────────────────
// itemsById: Map<id, {name, type}> — optional, used for inventory/equipment names
function buildBookHtml(book, username, itemsById = new Map()) {
  const esc = escapeHtml;
  const itemName = id => esc(itemsById.get(id)?.name ?? `Item #${id}`);

  const state = book.state || {};
  const graph = state.graph || {};
  const pts   = state.playthroughs || [];

  // Terminal sentinels: numeric -1 (death) and 0 (win). All other IDs are real sections,
  // including alphanumeric ones like "A1". We avoid Number(k) > 0 which breaks on strings.
  const _isTerminal = v => v === -1 || v === 0 || v === '-1' || v === '0';
  const _isRealSec  = v => v != null && !_isTerminal(v);

  // Mapped = sections with real recorded choices, not merely a discovered-as-choice stub.
  // Mirrors the client's mappedCount() (state.js): a node can be flagged discovered:true
  // and still end up with real choices recorded later, so checking the flag alone
  // undercounts - must also count any node with a non-empty choices list.
  const _isMappedNode = k => !graph[k]?.discovered || (graph[k]?.choices?.length > 0);
  const mapped = Object.keys(graph).filter(k => _isRealSec(k) && _isMappedNode(k)).length;

  // Known = all sections referenced anywhere (visited + seen as choices + in paths)
  const knownSet = new Set();
  Object.entries(graph).forEach(([sec, data]) => {
    if (_isRealSec(sec)) knownSet.add(sec);
    (data.choices || []).forEach(c => { if (_isRealSec(c)) knownSet.add(String(c)); });
  });
  pts.forEach(pt => (pt.path || []).forEach(s => { if (_isRealSec(s)) knownSet.add(String(s)); }));
  const discoveredOnly = Math.max(0, knownSet.size - mapped);

  const completed  = pts.filter(p => p.completed);
  const inProgress = pts.length - completed.length;
  const wins       = completed.filter(p => p.result === 'success').length;
  const losses     = completed.filter(p => p.result === 'death').length;
  const battles    = completed.filter(p => p.result === 'battle').length;

  const metaRows = [
    book.authors        && `<tr><td>Authors</td><td>${esc(book.authors)}</td></tr>`,
    book.isbn           && `<tr><td>ISBN</td><td>${esc(book.isbn)}</td></tr>`,
    book.issn           && `<tr><td>ISSN</td><td>${esc(book.issn)}</td></tr>`,
    book.asin           && `<tr><td>ASIN</td><td>${esc(book.asin)}</td></tr>`,
    book.pages          && `<tr><td>Pages</td><td>${esc(book.pages)}</td></tr>`,
    book.total_sections && `<tr><td>Total Sections</td><td>${esc(book.total_sections)}</td></tr>`,
    book.discoverable_sections != null && `<tr><td>Discoverable Sections</td><td>${esc(book.discoverable_sections)}</td></tr>`,
    book.description    && `<tr><td>Description</td><td>${esc(book.description)}</td></tr>`,
  ].filter(Boolean).join('');

  const runsRows = pts.map((pt, i) => {
    const result = pt.completed
      ? (pt.result === 'success' ? '★ Win' : pt.result === 'battle' ? '⚔ Battle Death' : '✝ Loss')
      : 'In progress';
    const path = (pt.path || []).map(s => (s === -1 || s === '-1') ? '✝' : (s === 0 || s === '0') ? '★' : s).join(' → ');
    const date = pt.completedAt
      ? new Date(pt.completedAt).toLocaleDateString()
      : (pt.startedAt ? new Date(pt.startedAt).toLocaleDateString() : '-');
    return `<tr><td>Run ${i + 1}</td><td>${esc(result)}</td><td>${esc(date)}</td><td class="path-cell">${esc(path)}</td></tr>`;
  }).join('');

  // Per-run details: charsheet, inventory, equipment
  const runDetails = pts.map((pt, i) => {
    const result = pt.completed
      ? (pt.result === 'success' ? '★ Win' : pt.result === 'battle' ? '⚔ Battle Death' : '✝ Loss')
      : 'In progress';

    // Character sheet
    const csFields = (pt.charSheet?.fields || []).filter(f => f.visible && f.name?.trim());
    const csHtml = csFields.length ? `
      <p class="det-label">Character Sheet</p>
      <table><tbody>${csFields.map(f => {
        let val;
        if (f.type === 'boolean') val = f.value ? 'Yes' : 'No';
        else if (f.type === 'list') val = (Array.isArray(f.value) ? f.value : []).join(', ') || '-';
        else val = (f.value !== undefined && f.value !== '' && f.value !== null) ? String(f.value) : '-';
        return `<tr><td>${esc(f.name)}</td><td>${esc(val)}</td></tr>`;
      }).join('')}</tbody></table>` : '';

    // Inventory
    const inv = (pt.inventory || []).filter(s => s.itemId);
    const invHtml = inv.length ? `
      <p class="det-label">Inventory</p>
      <table><thead><tr><th>Item</th><th>Qty</th><th>Note</th></tr></thead><tbody>${inv.map(s =>
        `<tr><td>${itemName(s.itemId)}</td><td>${s.qty ?? 1}</td><td>${esc(s.note || '')}</td></tr>`
      ).join('')}</tbody></table>` : '';

    // Equipment
    const eq = pt.equipment || {};
    const eqEntries = Object.entries(eq)
      .map(([key, entry]) => ({ key, itemId: _eqItemId(entry), meta: _eqMeta(entry), qty: _eqQty(entry) }))
      .filter(e => e.itemId);
    const eqHtml = eqEntries.length ? `
      <p class="det-label">Equipment</p>
      <table><thead><tr><th>Slot</th><th>Item</th><th>Qty</th><th>Label</th><th>Note</th></tr></thead><tbody>${eqEntries.map(e =>
        `<tr><td>${esc(SLOT_LABELS[e.key] ?? e.key)}</td><td>${itemName(e.itemId)}</td><td>${e.qty}</td><td>${esc(e.meta.label)}</td><td>${esc(e.meta.note)}</td></tr>`
      ).join('')}</tbody></table>` : '';

    if (!csHtml && !invHtml && !eqHtml) return '';
    return `<details><summary>Run ${i + 1} — ${result}</summary>${csHtml}${invHtml}${eqHtml}</details>`;
  }).filter(Boolean).join('');

  // Build section map — works for both numeric and alphanumeric section IDs
  const _secSort = (a, b) => {
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  };
  // Same _isMappedNode definition as the "Mapped" stat above, so a discovered-only stub
  // (empty choices, discovered:true) lands in the greyed "not yet visited" rows below
  // instead of the main table with a blank Choices cell - previously these disagreed.
  const mappedInGraph = new Set(Object.keys(graph).filter(k => _isRealSec(k) && _isMappedNode(k)));
  const discoveredOnlyIds = [...knownSet].filter(s => !mappedInGraph.has(s)).sort(_secSort);
  const sectionRows = [
    ...Object.entries(graph)
      .filter(([id]) => _isRealSec(id) && _isMappedNode(id))
      .sort((a, b) => _secSort(a[0], b[0]))
      .map(([id, node]) => {
        const choices  = (node.choices || []).map(c => (c === -1 || c === '-1') ? '✝ loss' : (c === 0 || c === '0') ? '★ win' : c).join(', ');
        const priority = node.priority === 'high' ? '▲ High' : node.priority === 'low' ? '▼ Low' : '';
        const flags    = [node.battle ? '⚔ Battle' : ''].filter(Boolean).join(', ');
        return `<tr><td>${esc(id)}</td><td>${esc(choices)}</td><td>${esc(priority)}</td><td>${esc(flags)}</td><td class="note-cell">${esc(node.note || '')}</td></tr>`;
      }),
    ...discoveredOnlyIds.map(id =>
      `<tr><td style="color:#888">${id}</td><td colspan="4" style="color:#888;font-style:italic">not yet visited</td></tr>`
    ),
  ].join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(book.name)} - Gamebook Tracker</title>
<style>
  body{font-family:Georgia,serif;max-width:980px;margin:2rem auto;padding:0 1.2rem;color:#1a1a1a}
  h1{font-size:1.6rem;margin-bottom:.15rem}
  .sub{color:#555;font-size:.88rem;margin-bottom:1.5rem}
  h2{font-size:1.05rem;border-bottom:1px solid #ccc;padding-bottom:.2rem;margin-top:1.8rem}
  table{border-collapse:collapse;width:100%;font-size:.85rem;margin-top:.4rem}
  th{background:#f0f0f0;text-align:left;padding:.3rem .5rem;border:1px solid #ccc}
  td{padding:.22rem .5rem;border:1px solid #ddd;vertical-align:top}
  .path-cell{font-family:monospace;font-size:.78rem;word-break:break-all}
  .note-cell{white-space:pre-line}
  .stats{display:flex;flex-wrap:wrap;gap:.5rem 1.5rem;margin:.5rem 0 1rem;font-size:.88rem}
  .stats span{background:#f0f0f0;padding:.15rem .5rem;border-radius:3px}
  pre{background:#f8f8f8;border:1px solid #ddd;padding:.7rem;white-space:pre-wrap;font-size:.83rem}
  details{border:1px solid #ddd;border-radius:3px;margin:.4rem 0;padding:.3rem .6rem}
  details[open]{padding-bottom:.6rem}
  summary{cursor:pointer;font-size:.88rem;font-weight:600;padding:.2rem 0}
  .det-label{font-size:.78rem;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.04em;margin:.7rem 0 .1rem}
  .legend{display:flex;flex-wrap:wrap;gap:.3rem .9rem;margin:.5rem 0 1rem;font-size:.8rem}
  .legend-item{display:flex;align-items:center;gap:.35rem}
  .legend-dot{width:.8rem;height:.8rem;border-radius:50%;flex-shrink:0}
  @media print{body{margin:0}details{border:none}details[open]{border-bottom:1px solid #eee}}
</style>
</head>
<body>
<h1>${esc(book.name)}</h1>
<div class="sub">Exported ${new Date().toLocaleDateString()} · owner: ${esc(username)} · Gamebook Tracker</div>

${book._hasGraph ? `<h2>Graph</h2><img src="graph.svg" style="max-width:100%;border:1px solid #ddd;border-radius:4px">${_exportLegendHtml()}` : ''}

${metaRows ? `<h2>Book Details</h2><table><tbody>${metaRows}</tbody></table>` : ''}

<h2>Stats</h2>
<div class="stats">
  <span>Mapped: ${mapped}</span>
  <span>Discovered only: ${discoveredOnly}</span>
  <span>Total sections: ${esc(book.total_sections || '?')}</span>
  <span>Runs: ${pts.length}${inProgress ? ` (${inProgress} in progress)` : ''}</span>
  <span>Wins: ${wins}</span>
  <span>Losses: ${losses}</span>
  <span>Battle deaths: ${battles}</span>
  ${book.userRating ? `<span>Rating: ${'★'.repeat(book.userRating)}${'☆'.repeat(5 - book.userRating)}</span>` : ''}
</div>

${runsRows ? `<h2>Runs (${pts.length})</h2><table><thead><tr><th>#</th><th>Result</th><th>Date</th><th>Path</th></tr></thead><tbody>${runsRows}</tbody></table>` : '<h2>Runs</h2><p>No runs yet.</p>'}

${runDetails ? `<h2>Run Details</h2>${runDetails}` : ''}

${sectionRows ? `<h2>Section Map (${mapped} mapped, ${discoveredOnly} discovered only)</h2><table><thead><tr><th>§</th><th>Choices</th><th>Priority</th><th>Flags</th><th>Note</th></tr></thead><tbody>${sectionRows}</tbody></table>` : ''}

${book.notebook ? `<h2>Notebook</h2><pre>${esc(book.notebook)}</pre>` : ''}
</body>
</html>`;
}

// ── Public API ────────────────────────────────────────────────────────────────
// items: [{id, name, type}] array from DB — used to resolve item names in HTML
// Graph snapshots are generated from book.state (graph/positions/playthroughs/
// startSection) via buildGraphSvg - no client involvement needed, see buildGraphSvg's
// comment for why. Books that have never been laid out just get a flat HTML file;
// books with a renderable graph get their own folder alongside graph.svg.
function buildFullExportZip(username, books, items = []) {
  const date     = new Date().toISOString().slice(0, 10);
  const itemsById = new Map(items.map(it => [it.id, it]));
  const files    = [];
  const root     = safeFilename(username, 'export');

  // backup.json
  const json = JSON.stringify({ app: 'Gamebook Tracker', version: 1, exportedAt: new Date().toISOString(), user: { username }, books }, null, 2);
  files.push({ name: `${root}/backup.json`, data: json });

  // one HTML per book inside <username>/books/ — deduplicate filenames in case two books share a safe name
  const usedFilenames = new Map(); // fn → count
  for (const book of books) {
    const base = safeFilename(book.name, `book-${book.id}`);
    const count = usedFilenames.get(base) ?? 0;
    usedFilenames.set(base, count + 1);
    const fn = count === 0 ? base : `${base} (${count + 1})`;
    const svg = buildGraphSvg(book.state?.graph, book.state?.positions, book.state?.playthroughs, book.state?.startSection, book.state?.connectorStyle);
    if (svg) {
      files.push({ name: `${root}/books/${fn}/${fn}.html`, data: buildBookHtml({ ...book, _hasGraph: true }, username, itemsById) });
      files.push({ name: `${root}/books/${fn}/graph.svg`, data: svg });
    } else {
      files.push({ name: `${root}/books/${fn}.html`, data: buildBookHtml(book, username, itemsById) });
    }
  }

  return buildZip(files);
}

function buildBookExportZip(username, book, items = []) {
  const itemsById  = new Map(items.map(it => [it.id, it]));
  const fn         = safeFilename(book.name, `book-${book.id}`);
  const svg        = buildGraphSvg(book.state?.graph, book.state?.positions, book.state?.playthroughs, book.state?.startSection, book.state?.connectorStyle);
  const bookForHtml = svg ? { ...book, _hasGraph: true } : book;
  const json       = JSON.stringify({ app: 'Gamebook Tracker', version: 1, exportedAt: new Date().toISOString(), user: { username }, books: [book] }, null, 2);
  const files      = [
    { name: `${fn}/${fn}.html`, data: buildBookHtml(bookForHtml, username, itemsById) },
    { name: `${fn}/${fn}.json`, data: json },
  ];
  if (svg) files.push({ name: `${fn}/graph.svg`, data: svg });
  return buildZip(files);
}

module.exports = { buildFullExportZip, buildBookExportZip, safeFilename };
