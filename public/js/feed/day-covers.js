import { escapeHtml } from '../core/util.js';

// Cache natural cover dimensions with bounded FIFO eviction.
const _dayCoverMetaCache = new Map();
const _DAY_COVER_META_MAX = 200;
const _DAY_COVER_LOAD_TIMEOUT_MS = 10000;
function _loadDayCoverMeta(url) {
  if (_dayCoverMetaCache.has(url)) return _dayCoverMetaCache.get(url);
  const pending = new Promise(resolve => {
    const img = new Image();
    const finish = meta => {
      clearTimeout(timer);
      img.onload = img.onerror = null;
      resolve(meta);
    };
    const timer = setTimeout(() => finish(null), _DAY_COVER_LOAD_TIMEOUT_MS);
    img.onload = () => finish(img.naturalWidth && img.naturalHeight
      ? { width: img.naturalWidth, height: img.naturalHeight } : null);
    img.onerror = () => finish(null);
    img.src = url;
  });
  _dayCoverMetaCache.set(url, pending);
  pending.then(meta => {
    if (!meta && _dayCoverMetaCache.get(url) === pending) _dayCoverMetaCache.delete(url);
  });
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

function _nearViewport(card) {
  if (!card.getBoundingClientRect) return true;
  const rect = card.getBoundingClientRect();
  return rect.bottom >= -300 && rect.top <= window.innerHeight + 300;
}

function _clearCoverTiles(card) {
  const stack = card.querySelector('.feed-day-cover-stack');
  if (stack?.firstChild) stack.replaceChildren();
}

export async function _applyDayCoverFlows(root, dayCoverLists = _lastDayCoverLists) {
  const generation = _coverGeneration;
  const cards = root.querySelectorAll('.feed-day-card[data-day-index]');
  if (document.body.classList.contains('no-feed-day-covers') || document.body.classList.contains('feed-collapsed')) {
    for (const card of cards) _clearCoverTiles(card);
    _dayCoverResizeObserver?.disconnect();
    return;
  }
  const applyCard = async card => {
    if (generation !== _coverGeneration) return;
    if (card.isConnected === false) return;
    _dayCoverResizeObserver?.observe(card); // no-op if already observed
    if (!_nearViewport(card)) { _clearCoverTiles(card); return; }
    const covers = dayCoverLists[Number(card.dataset.dayIndex)];
    const stack = card.querySelector('.feed-day-cover-stack');
    if (!covers?.length || !stack) return;
    if (card.offsetWidth <= 0 || card.offsetHeight <= 0) return;
    const metas = await Promise.all(covers.map(_loadDayCoverMeta));
    if (generation !== _coverGeneration) return;
    if (card.isConnected === false || document.body.classList.contains('no-feed-day-covers')) return;
    if (!_nearViewport(card)) { _clearCoverTiles(card); return; }
    if (metas.every(m => !m?.width || !m?.height)) return;
    const cardW   = card.offsetWidth;
    const targetH = card.offsetHeight;
    if (cardW <= 0 || targetH <= 0) return;
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

    const html = tiles.map(t => {
      const left = Math.round((cardW - t.box.w) / 2);
      return `<div class="feed-day-cover-tile" style="top:${t.top}px;left:${left}px;width:${t.box.w}px;height:${t.box.h}px;background-image:url('${escapeHtml(t.cover)}')"></div>`;
    }).join('');
    if (stack.innerHTML !== html) stack.innerHTML = html;
  };
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, cards.length) }, async () => {
    while (next < cards.length) await applyCard(cards[next++]);
  }));
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
document.addEventListener('scroll', event => {
  if (event.target === document || event.target === document.getElementById('landing-wrapper')) _scheduleDayCoverRecompute();
}, true);

// Panel collapse changes feed width without a window resize; preferences must nudge the layout.
export function refreshDayCoverFlows() {
  _scheduleDayCoverRecompute();
}

export function replaceDayCoverLists(lists) {
  ++_coverGeneration;
  _dayCoverResizeObserver?.disconnect();
  _lastDayCoverLists = lists;
}
