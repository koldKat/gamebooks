import { escapeHtml } from '../core/util.js';

// Cache natural cover dimensions with bounded FIFO eviction.
const _dayCoverMetaCache = new Map();
const _DAY_COVER_META_MAX = 200;
function _loadDayCoverMeta(url) {
  if (_dayCoverMetaCache.has(url)) return _dayCoverMetaCache.get(url);
  const pending = new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
  _dayCoverMetaCache.set(url, pending);
  while (_dayCoverMetaCache.size > _DAY_COVER_META_MAX) {
    _dayCoverMetaCache.delete(_dayCoverMetaCache.keys().next().value);
  }
  return pending;
}

// Use a flat overlay so tall tile stacks are darkened consistently.
let _lastDayCoverLists = [];
let _coverGeneration = 0;

// Observe actual card sizes; explicit resize/fullscreen hooks only provide immediate nudges.
const _dayCoverResizeObserver = (typeof ResizeObserver !== 'undefined')
  ? new ResizeObserver(() => _scheduleDayCoverRecompute())
  : null;

export async function _applyDayCoverFlows(root, dayCoverLists = _lastDayCoverLists) {
  const generation = _coverGeneration;
  if (document.body.classList.contains('no-feed-day-covers')) return; // toggle off - don't bother loading images just to hide them
  const cards = root.querySelectorAll('.feed-day-card[data-day-index]');
  for (const card of cards) {
    if (generation !== _coverGeneration) return;
    if (card.isConnected === false) continue;
    _dayCoverResizeObserver?.observe(card); // no-op if already observed
    const covers = dayCoverLists[Number(card.dataset.dayIndex)];
    const stack = card.querySelector('.feed-day-cover-stack');
    if (!covers?.length || !stack) continue;
    if (card.offsetWidth <= 0 || card.offsetHeight <= 0) continue;
    const metas = await Promise.all(covers.map(_loadDayCoverMeta));
    if (generation !== _coverGeneration) return;
    if (card.isConnected === false || document.body.classList.contains('no-feed-day-covers')) continue;
    if (metas.every(m => !m?.width || !m?.height)) continue; // every cover failed to load - leave the flat background
    const cardW   = card.offsetWidth;
    const targetH = card.offsetHeight;
    if (cardW <= 0 || targetH <= 0) continue;
    const n = covers.length;

    // Tile at full card width and natural aspect ratio without cropping.
    const boxes = metas.map(m => (m?.width && m?.height)
      ? { w: cardW, h: Math.max(1, Math.round((m.height / m.width) * cardW)) }
      : null);

    const tiles = []; // { top, cover, box }
    const pushTile = (top, idx) => { if (boxes[idx]) tiles.push({ top, cover: covers[idx], box: boxes[idx] }); };

    // Center the most prominent loaded cover; advance other covers independently above and below.
    const centerIdx = boxes[0] ? 0 : boxes.findIndex(b => b);

    const pool = [];
    for (let k = 0; k < n; k++) if (k !== centerIdx) pool.push(k);
    if (pool.length === 0) pool.push(centerIdx); // literally only one book all day - it repeats outward too

    const anchorH = boxes[centerIdx]?.h || targetH;
    let topEdge    = Math.round(targetH / 2 - anchorH / 2);
    let bottomEdge = topEdge;
    pushTile(topEdge, centerIdx);
    bottomEdge += anchorH;

    let downPtr = 0;
    let upPtr   = Math.floor(pool.length / 2);
    let guard   = 0;
    while ((topEdge > 0 || bottomEdge < targetH) && guard < 400) {
      if (bottomEdge < targetH) {
        const idx = pool[downPtr % pool.length]; downPtr++;
        const box = boxes[idx];
        if (box) { pushTile(bottomEdge, idx); bottomEdge += box.h; } else { bottomEdge += 1; }
      }
      if (topEdge > 0) {
        const idx = pool[upPtr % pool.length]; upPtr++;
        const box = boxes[idx];
        if (box) { topEdge -= box.h; pushTile(topEdge, idx); } else { topEdge -= 1; }
      }
      guard++;
    }

    stack.innerHTML = tiles.map(t => {
      const left = Math.round((cardW - t.box.w) / 2);
      return `<div class="feed-day-cover-tile" style="top:${t.top}px;left:${left}px;width:${t.box.w}px;height:${t.box.h}px;background-image:url('${escapeHtml(t.cover)}')"></div>`;
    }).join('');
  }
}

let _dayCoverResizeRaf = null;
let _dayCoverSettleTimer = null;
function _scheduleDayCoverRecompute() {
  if (_dayCoverResizeRaf) cancelAnimationFrame(_dayCoverResizeRaf);
  _dayCoverResizeRaf = requestAnimationFrame(() => {
    _dayCoverResizeRaf = null;
    const el = document.getElementById('feed-content');
    if (el) _applyDayCoverFlows(el);
  });
  // Recheck after fullscreen transitions that can outlast the first animation frame.
  if (_dayCoverSettleTimer) clearTimeout(_dayCoverSettleTimer);
  _dayCoverSettleTimer = setTimeout(() => {
    _dayCoverSettleTimer = null;
    const el = document.getElementById('feed-content');
    if (el) _applyDayCoverFlows(el);
  }, 400);
}
window.addEventListener('resize', _scheduleDayCoverRecompute);
document.addEventListener('fullscreenchange', _scheduleDayCoverRecompute);

// Panel collapse changes feed width without a window resize; preferences must nudge the layout.
export function refreshDayCoverFlows() {
  _scheduleDayCoverRecompute();
}

export function replaceDayCoverLists(lists) {
  ++_coverGeneration;
  _dayCoverResizeObserver?.disconnect();
  _lastDayCoverLists = lists;
}
