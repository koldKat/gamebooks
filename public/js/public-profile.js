// ── Public profile / run viewer ───────────────────────────────────────────────
// Self-contained module. Imports only from state.js and util.js.
// To remove: delete this file, remove its import line and setPublicProfileHooks()
// call from boot.js, and delete public/css/public-profile.css (also shared by
// covers.js's cover activity view) and its <link> in index.html.

import { isValidSecId } from './state.js?v=12';
import { escapeHtml } from './util.js?v=44';
import { t } from './i18n.js?v=36';

// Callbacks wired in by main.js at boot
let _hooks = {};
export function setPublicProfileHooks(h) { _hooks = h || {}; }

// ── Internal state ────────────────────────────────────────────────────────────

let _pubNetwork    = null;
let _pubSegNetworks = [];

// ── Exports ───────────────────────────────────────────────────────────────────

export function _destroyPubNetworks() {
  if (_pubNetwork) { _pubNetwork.destroy(); _pubNetwork = null; }
  _pubSegNetworks.forEach(n => n.destroy());
  _pubSegNetworks = [];
}

export function openPublicModal() {
  document.getElementById('public-modal-overlay').classList.add('active');
}

export function closePublicModal() {
  const overlay = document.getElementById('public-modal-overlay');
  overlay.classList.remove('active');
  overlay.style.zIndex = ''; // undo the one-off bump from opening a book link inside the forum (see boot.js)
  document.getElementById('public-modal').classList.remove('pub-modal--run');
  document.getElementById('pub-modal-body').innerHTML = '';
  document.getElementById('pub-modal-title').textContent = '';
  _destroyPubNetworks();
  if (
    /^\/book\/\d+$/.test(location.pathname) ||
    /^\/anthology\/\d+$/.test(location.pathname) ||
    /^\/series\/\d+$/.test(location.pathname) ||
    /^\/user\/[^/]+$/.test(location.pathname)
  ) {
    history.replaceState({}, '', '/');
  }
}

export async function openPublicProfile(username) {
  openPublicModal();
  document.getElementById('pub-modal-title').innerHTML = escapeHtml(_hooks.displayFor?.(username) ?? username) + (_hooks.adminBadge?.(username) ?? '') + (_hooks.authorBadge?.(username) ?? '') + (_hooks.contributorBadge?.(username) ?? '');
  document.getElementById('pub-back-btn').style.display = 'none';
  document.getElementById('pub-modal-body').innerHTML = `<p class="pub-loading">${t('pub.loading')}</p>`;
  try {
    const res = await _hooks.publicFetch(`/api/public/user/${encodeURIComponent(username)}`);
    if (!res.ok) throw new Error();
    const profile = await res.json();
    renderPublicProfile(profile);
  } catch {
    document.getElementById('pub-modal-body').innerHTML = `<p class="pub-error">${t('pub.profile_unavailable')}</p>`;
  }
}

export function renderPublicProfile(profile) {
  _hooks.onRegisterAuthor?.(profile.username, !!profile.isAuthor, profile.displayName);
  _hooks.onRegisterContributor?.(profile.username, !!profile.isContributor);
  document.getElementById('pub-back-btn').style.display = 'none';
  document.getElementById('public-modal').classList.remove('pub-modal--run');
  const _dn = profile.displayName || profile.username;
  document.getElementById('pub-modal-title').innerHTML = escapeHtml(_dn) + (_hooks.adminBadge?.(profile.username) ?? '') + (_hooks.authorBadge?.(profile.username) ?? '') + (_hooks.contributorBadge?.(profile.username) ?? '');
  const body = document.getElementById('pub-modal-body');
  body.style.padding  = '';
  body.style.overflow = '';
  _destroyPubNetworks();

  const allRuns = profile.books.flatMap(b => b.runs);
  const wins    = allRuns.filter(r => r.result === 'success').length;
  const losses  = allRuns.filter(r => r.result === 'death').length;
  // Shown as its own stat, matching the admin panel's separate Wins/Losses/
  // Battle Deaths columns - runs includes 'battle' results in its total, so
  // this has to be broken out for wins+losses+battles to add up to it.
  const battles = allRuns.filter(r => r.result === 'battle').length;

  const avatarHtml = profile.avatarUrl
    ? `<img class="pub-profile-avatar" src="${escapeHtml(profile.avatarUrl)}" alt="">`
    : `<div class="pub-profile-avatar pub-profile-avatar-placeholder">${escapeHtml(profile.username.charAt(0).toUpperCase())}</div>`;

  const levelSuffix = profile.level != null
    ? ` - <span class="pub-level-badge">${t('feed.hover_level', { n: profile.level })}</span>${profile.title ? ` <span class="pub-level-title">${escapeHtml(profile.title)}</span>` : ''}`
    : '';

  let html = `
    <div class="pub-profile-header">
      ${avatarHtml}
      <div class="pub-profile-info">
        <div class="pub-profile-username">${escapeHtml(_dn)}${_hooks.adminBadge?.(profile.username) ?? ''}${_hooks.authorBadge?.(profile.username) ?? ''}${_hooks.contributorBadge?.(profile.username) ?? ''}${levelSuffix}</div>
        <div class="pub-profile-stats">
          <span class="pub-stat"><span class="pub-stat-val">${profile.totalBooks}</span> ${t('pub.stat.books_suffix')}${profile.createdBooks > 0 ? ` <span style="color:#6b7280;font-size:0.78em">(<span style="color:#60a5fa;font-weight:700">${profile.createdBooks}</span> ${t('pub.stat.created_suffix')})</span>` : ''}</span>
          <span class="pub-stat"><span class="pub-stat-val">${profile.books.length}</span> ${t('pub.stat.books_played')}</span>
          <span class="pub-stat"><span class="pub-stat-val">${allRuns.length}</span> ${t('pub.stat.runs')}</span>
          <span class="pub-stat pub-stat-win"><span class="pub-stat-val">${wins}</span> ${t('pub.stat.wins')}</span>
          <span class="pub-stat pub-stat-death"><span class="pub-stat-val">${losses}</span> ${t('pub.stat.losses')}</span>
          ${battles > 0 ? `<span class="pub-stat pub-stat-battle"><span class="pub-stat-val">${battles}</span> ${t('pub.stat.battle_deaths')}</span>` : ''}
        </div>
      </div>
    </div>`;

  if (!profile.books.length) {
    html += `<p class="pub-empty">${t('pub.no_runs')}</p>`;
    body.innerHTML = html;
    return;
  }

  profile._expandedBookIds = profile._expandedBookIds || new Set();
  for (const book of profile.books) {
    const collapsedCls = profile._expandedBookIds.has(book.id) ? '' : ' pub-book-collapsed';
    html += `<div class="pub-book${collapsedCls}" data-book-group-id="${book.id}">
      <div class="pub-book-name">
        <span class="pub-book-toggle">▸</span>
        <span class="pub-book-title">${escapeHtml(book.name)}</span>
        <span class="pub-book-count">${t('pub.run_count', { n: book.runs.length, s: book.runs.length === 1 ? '' : 's' })}</span>
      </div>
      <div class="pub-book-runs">`;
    for (const run of book.runs) {
      const isWin    = run.result === 'success';
      const isBattle = run.result === 'battle';
      const chapterPrefix = run.chapterName ? `${run.chapterName} - ` : '';
      const result = isWin ? t('pub.result.victory') : isBattle ? t('pub.result.battle') : t('pub.result.lost');
      // Negative index = a pre-series run (see getPublicProfile), displayed
      // as "Run -N" matching play.js's own convention - no +1 offset for those.
      const label = t('pub.run_label', { prefix: chapterPrefix, n: run.index < 0 ? run.index : run.index + 1, result });
      const cls   = isWin ? 'pub-run-win' : 'pub-run-death';
      const bookId = run.bookId || book.id;
      // A cheap plain-text preview instead of spinning up the full vis-network
      // run graph just for a hover - that's only built on click (openPublicRun).
      const tooltipParts = [];
      if (run.pathLength) tooltipParts.push(t('pub.run_tooltip_sections', { n: run.pathLength, s: run.pathLength === 1 ? '' : 's' }));
      if (run.lastSection != null) tooltipParts.push(t('pub.run_tooltip_last', { n: run.lastSection }));
      if (run.completedAt) tooltipParts.push(new Date(run.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }));
      const tooltip = tooltipParts.join(' · ');
      const tooltipAttr = tooltip ? ` data-tooltip="${escapeHtml(tooltip)}"` : '';
      if (run.isPublic) {
        html += `<button class="pub-run-btn ${cls}" data-book-id="${bookId}" data-user-id="${profile.userId}" data-run-index="${run.index}"${tooltipAttr}>${escapeHtml(label)}</button>`;
      } else {
        html += `<span class="pub-run-locked ${cls}"${tooltipAttr}>${escapeHtml(t('pub.locked', { label }))}</span>`;
      }
    }
    html += `</div></div>`;
  }
  body.innerHTML = html;
  body.querySelectorAll('.pub-book-name').forEach(el => {
    el.addEventListener('click', () => {
      const bookEl  = el.closest('.pub-book');
      const expanded = bookEl.classList.toggle('pub-book-collapsed') === false;
      const groupId  = +bookEl.dataset.bookGroupId;
      if (expanded) profile._expandedBookIds.add(groupId);
      else          profile._expandedBookIds.delete(groupId);
    });
  });
  body.querySelectorAll('.pub-run-btn').forEach(btn => {
    btn.addEventListener('click', () => openPublicRun(+btn.dataset.bookId, +btn.dataset.userId, +btn.dataset.runIndex, profile));
  });
}

export async function openPublicRun(bookId, userId, runIndex, fromProfile) {
  _destroyPubNetworks();
  document.getElementById('public-modal').classList.add('pub-modal--run');
  const backBtn = document.getElementById('pub-back-btn');
  backBtn.style.display = '';
  backBtn.onclick = () => {
    if (fromProfile) renderPublicProfile(fromProfile);
    else closePublicModal();
  };
  if (!document.getElementById('public-modal-overlay').classList.contains('active')) {
    openPublicModal();
  }
  const body = document.getElementById('pub-modal-body');
  body.style.padding  = '';
  body.style.overflow = '';
  body.innerHTML = `<p class="pub-loading">${t('pub.loading')}</p>`;
  try {
    const res = await _hooks.publicFetch(`/api/public/book/${bookId}/user/${userId}/run/${runIndex}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderPublicRun(data);
  } catch {
    body.innerHTML = `<p class="pub-error">${t('pub.run_unavailable')}</p>`;
  }
}

export async function openPublicSeriesRun(seriesId, userId, runIndex, fromProfile) {
  _destroyPubNetworks();
  document.getElementById('public-modal').classList.add('pub-modal--run');
  const backBtn = document.getElementById('pub-back-btn');
  backBtn.style.display = '';
  backBtn.onclick = () => {
    if (fromProfile) renderPublicProfile(fromProfile);
    else closePublicModal();
  };
  if (!document.getElementById('public-modal-overlay').classList.contains('active')) {
    openPublicModal();
  }
  const body = document.getElementById('pub-modal-body');
  body.style.padding  = '';
  body.style.overflow = '';
  body.innerHTML = `<p class="pub-loading">${t('pub.loading')}</p>`;
  try {
    const res = await _hooks.publicFetch(`/api/public/series/${seriesId}/user/${userId}/run/${runIndex}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderPublicRun(data);
  } catch {
    body.innerHTML = `<p class="pub-error">${t('pub.run_unavailable')}</p>`;
  }
}

function _pubLegendHtml(isOpenWorld) {
  const dot  = (bg, border, bw = 2) =>
    `<div class="pub-legend-dot" style="background:${bg};border-color:${border};border-width:${bw}px"></div>`;
  const dia  = (bg, border) =>
    `<div class="pub-legend-dot pub-legend-diamond" style="background:${bg};border-color:${border}"></div>`;
  const row  = (icon, label) => `<div class="pub-legend-item">${icon}<span>${label}</span></div>`;
  const items = [
    row(dot('#fde047', '#a16207'),           t('pub.legend.start')),
    row(dot('#3d9be9', '#2980b9'),           t('pub.legend.visited')),
    row(dot('#8e44ad', '#6c3483'),           t('pub.legend.mapped')),
    row(dot('#0f172a', '#e74c3c', 3),        t('pub.legend.can_die')),
    row(dot('#0f172a', '#27ae60', 3),        t('pub.legend.can_win')),
    row(dot('#431407', '#f97316', 3),        t('pub.legend.battle')),
    row(dot('#27ae60', '#1e8449'),           t('pub.legend.victory_ended')),
    row(dot('#e74c3c', '#c0392b'),           t('pub.legend.death_ended')),
    row(dot('#c2410c', '#9a3412'),           t('pub.legend.battle_ended')),
    ...(isOpenWorld ? [row(dia('#0e7490', '#2dd4bf'), t('pub.legend.portal'))] : []),
  ];
  return `<div class="pub-run-legend">${items.join('')}</div>`;
}

function _wirePathHover(trailEl, net) {
  if (!trailEl || !net) return;
  trailEl.querySelectorAll('.trail-node').forEach(span => {
    const id = parseInt(span.textContent, 10);
    if (!id || id < 1) return;
    span.style.cursor = 'pointer';
    span.addEventListener('mouseenter', () => net.selectNodes([id]));
    span.addEventListener('mouseleave', () => net.selectNodes([]));
  });
}

function _pubRunPathNodes(path, result) {
  if (!path?.length) return '';
  const nodes = path.map(s => `<span class="trail-node">${s}</span>`);
  if (result === 'success') nodes.push('<span class="trail-node trail-win">★</span>');
  else if (result === 'battle') nodes.push('<span class="trail-node trail-battle">BTL</span>');
  else if (result === 'death') nodes.push('<span class="trail-node trail-death">✝</span>');
  // Each arrow is glued to the pill before it in one wrapper (see play.js's
  // renderPathTrail for the full reasoning) so a wrapped row ends with its
  // own arrow instead of stranding one at the start of the next row.
  return nodes.map((n, i) => i === nodes.length - 1 ? n : `<span class="trail-item">${n}<span class="trail-arrow">›</span></span>`).join('');
}

function renderPublicRun(data) {
  // ── Open world: multi-book journey ────────────────────────────────────────
  if (data.isOpenWorld && data.journey?.length > 0) {
    document.getElementById('pub-modal-title').textContent =
      t('pub.run_title', { name: data.seriesName, n: data.run.runNumber });
    const body = document.getElementById('pub-modal-body');
    body.style.padding  = '0';
    body.style.overflow = 'auto';

    const finalResult = data.run.result;
    const resultCls   = finalResult === 'success' ? 'trail-win'
                      : finalResult === 'battle'  ? 'trail-battle'
                      : 'trail-death';
    const resultLabel = finalResult === 'success' ? t('pub.journey_result.victory')
                      : finalResult === 'battle'  ? t('pub.journey_result.battle')
                      : t('pub.journey_result.loss');

    const segHtml = data.journey.map((seg, si) => {
      const isLast  = si === data.journey.length - 1;
      const nextSeg = data.journey[si + 1];
      const portalEl = !isLast
        ? `<div class="pub-journey-portal"><span class="pub-journey-portal-icon">◇</span><span class="pub-journey-portal-label">${t('pub.portal_to')}</span><span class="pub-journey-portal-dest">${escapeHtml(nextSeg?.bookName ?? '')}</span></div>`
        : `<div class="pub-journey-result ${resultCls}">${resultLabel}</div>`;
      const pathNodes = _pubRunPathNodes(seg.path, isLast ? finalResult : null);
      return `<div class="pub-journey-segment">
        <div class="pub-journey-book">${escapeHtml(seg.bookName)}</div>
        <div class="pub-graph-seg" id="pub-seg-${si}"></div>
        ${pathNodes ? `<div class="pub-seg-path"><div class="trail">${pathNodes}</div></div>` : ''}
        ${portalEl}
      </div>`;
    }).join('');

    body.innerHTML = `<div class="pub-journey">${segHtml}</div>${_pubLegendHtml(true)}`;

    data.journey.forEach((seg, si) => {
      const isLast        = si === data.journey.length - 1;
      const segResult     = isLast ? finalResult : 'portal';
      const isPortalEntry = si > 0;
      const container     = document.getElementById(`pub-seg-${si}`);
      if (!container) return;
      const net = _buildPubSegNetwork(container, seg.graph, seg.positions, seg.path, segResult, [], [], isPortalEntry, seg.startSection);
      _pubSegNetworks.push(net);
      _wirePathHover(container.closest('.pub-journey-segment')?.querySelector('.pub-seg-path .trail'), net);
    });
    return;
  }

  document.getElementById('pub-modal-title').textContent = t('pub.run_title', { name: data.bookName, n: data.run.runNumber });
  const body = document.getElementById('pub-modal-body');
  body.style.padding  = '0';
  body.style.overflow = 'hidden';
  const pathNodes = _pubRunPathNodes(data.run.path, data.run.result);
  body.innerHTML = `<div id="pub-graph-container"></div>${_pubLegendHtml(false)}${pathNodes ? `<div class="pub-run-path"><div class="trail">${pathNodes}</div></div>` : ''}`;

  _pubNetwork = _buildPubSegNetwork(
    document.getElementById('pub-graph-container'),
    data.graph, data.positions, data.run.path || [], data.run.result,
    data.allVisited, data.endNodes, false, data.startSection
  );
  if (pathNodes) _wirePathHover(body.querySelector('.pub-run-path .trail'), _pubNetwork);
}

function _buildPubSegNetwork(container, graph, positions, path, result, allVisited = [], endNodes = [], isPortalEntry = false, startSection = null) {
  const finalId  = path.length ? path[path.length - 1] : null;
  const startSec = isPortalEntry ? null : (isValidSecId(startSection) ? startSection : 1);
  const entrySec = isPortalEntry && path.length ? path[0] : null;
  const nodesArr = [];
  const edgesArr = [];

  const allIds = new Set(path.filter(s => s >= 1));
  Object.keys(graph).forEach(k => { const n = Number(k); if (n >= 1) allIds.add(n); });
  (allVisited || []).forEach(n => { if (n >= 1) allIds.add(n); });

  const endNodeMap = new Map();
  (endNodes || []).forEach(e => { endNodeMap.set(e.id, e.result); });

  allIds.forEach(id => {
    const inPath   = path.includes(id);
    const isFinal  = id === finalId;
    const isStart  = startSec !== null && id === startSec && !isFinal;
    const isEntry  = entrySec !== null && id === entrySec && !isFinal;
    const gNode    = graph[id];
    const choices  = gNode?.choices || [];
    const hasDeath = choices.includes(-1);
    const hasWin   = choices.includes(0);
    const isBattle = !!gNode?.battle;
    const isPortal = (gNode?.portals?.length ?? 0) > 0;
    let bg, border, fontColor = '#ffffff', fontBold = false, bw = 2;
    let shape = 'dot';

    if (isStart) {
      bg = '#fde047'; border = '#a16207'; fontColor = '#1a1a1a'; fontBold = true;
    } else if (isEntry) {
      bg = '#0e7490'; border = '#2dd4bf'; shape = 'diamond'; bw = 3; fontBold = true;
    } else if (isFinal) {
      if (result === 'success')     { bg = '#27ae60'; border = '#1e8449'; }
      else if (result === 'battle') { bg = '#c2410c'; border = '#9a3412'; }
      else if (result === 'portal') { bg = '#0e7490'; border = '#155e75'; shape = 'diamond'; }
      else                          { bg = '#e74c3c'; border = '#c0392b'; }
      bw = 4;
      // Start/entry/final are always shown as-is, no battle border override - matches
      // graph.js's nodeColor() precedence exactly.
    } else {
      if (inPath && isPortal) {
        bg = '#0e7490'; border = '#2dd4bf'; shape = 'diamond'; bw = 3;
      } else if (inPath) {
        bg = '#3d9be9'; border = '#2980b9';
      } else if (endNodeMap.has(id)) {
        const r = endNodeMap.get(id);
        if (r === 'success')     { bg = '#27ae60'; border = '#1e8449'; bw = 4; }
        else if (r === 'battle') { bg = '#c2410c'; border = '#9a3412'; bw = 4; }
        else                     { bg = '#e74c3c'; border = '#c0392b'; bw = 4; }
      } else if (isPortal) {
        bg = '#134e4a'; border = '#0d9488'; shape = 'diamond'; bw = 2;
      } else if (gNode) {
        if (hasDeath && hasWin) { bg = '#0f172a'; border = '#f59e0b'; bw = 4; }
        else if (hasDeath)      { bg = '#0f172a'; border = '#e74c3c'; bw = 4; }
        else if (hasWin)        { bg = '#0f172a'; border = '#27ae60'; bw = 4; }
        else                    { bg = '#8e44ad'; border = '#6c3483'; }
      } else {
        bg = '#606060'; border = '#404040';
      }
      // Battle flag: keep whatever fill the rules above chose, just override the border -
      // matches graph.js's nodeColor() precedence (a visited/mapped/end-node section
      // that's ALSO flagged battle still shows its battle border, unlike before this fix,
      // when isBattle was one branch in the chain above and got shadowed by inPath/etc).
      if (isBattle) { border = '#f97316'; bw = Math.max(bw, 4); }
    }

    const pos = positions[id];
    const label = isStart  ? `${id}\nSTART`
                : isEntry  ? `${id}\n⇒ IN`
                : isPortal ? `${id}\n⇒`
                : String(id);
    nodesArr.push({
      id, label,
      shape,
      color: { background: bg, border },
      font:  { size: 11, color: fontColor, face: 'Segoe UI, system-ui, sans-serif', bold: fontBold },
      borderWidth: bw, size: shape === 'diamond' ? 16 : 14,
      ...(pos ? { x: pos.x, y: pos.y, physics: false } : {}),
    });
  });

  function pubEdgeOutcome(destId, visited = new Set()) {
    if (destId === -1) return 'death';
    if (destId === 0)  return 'win';
    if (visited.has(destId)) return null;
    visited.add(destId);
    const nd = graph[destId];
    if (!nd || nd.choices.length !== 1) return null;
    return pubEdgeOutcome(nd.choices[0], visited);
  }

  const runEdges = new Set();
  for (let i = 0; i < path.length - 1; i++) runEdges.add(`${path[i]}>${path[i + 1]}`);

  Object.entries(graph).forEach(([sec, d]) => {
    (d.choices || []).forEach(dest => {
      if (dest === -1 || dest === 0) return;
      const eid       = `${sec}>${dest}`;
      const isRunEdge = runEdges.has(eid);
      const outcome   = pubEdgeOutcome(dest);
      const edgeColor = outcome === 'death' ? { color: '#e74c3c', opacity: 0.8, highlight: '#e74c3c' }
                      : outcome === 'win'   ? { color: '#27ae60', opacity: 0.8, highlight: '#27ae60' }
                      : isRunEdge           ? { color: '#f5a623', opacity: 1,   highlight: '#f5a623' }
                      :                       { color: '#4b5563', opacity: 0.7 };
      edgesArr.push({ id: eid, from: Number(sec), to: dest,
        color: edgeColor,
        arrows: { to: { enabled: true, scaleFactor: 0.5 } },
        smooth: { type: 'curvedCW', roundness: 0.2 },
        width: isRunEdge ? 2.5 : 1.2,
      });
    });
  });

  return new vis.Network(
    container,
    { nodes: new vis.DataSet(nodesArr), edges: new vis.DataSet(edgesArr) },
    {
      nodes: { shape: 'dot', size: 14, font: { size: 11, color: '#ffffff', face: 'Segoe UI, system-ui, sans-serif' }, borderWidth: 2 },
      edges: { arrows: { to: { enabled: true, scaleFactor: 0.5 } }, color: { color: '#4b5563', opacity: 0.7, highlight: '#9ca3af' }, smooth: { type: 'curvedCW', roundness: 0.2 }, width: 1.2 },
      physics: { enabled: false },
      interaction: { dragNodes: false, zoomView: true, dragView: true, hover: true },
    }
  );
}
