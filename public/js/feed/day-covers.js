import { escapeHtml } from '../core/util.js';

// ── Day-card cover backgrounds ──────────────────────────────────────────────
// A day-card is a single fixed box (unlike an anthology stack of separately
// positioned cards), so this only needs the image's true rendered height to
// tile it at natural size - no cross-card offset math like books.js needs.
// Day-card cover meta (natural dimensions for tiling), cached per URL - a
// feed refresh re-asks for the same handful of covers constantly, so this
// turns N card re-layouts into one image load. Entries are tiny (a resolved
// {width, height}) but the key set is every distinct cover URL ever shown in
// a day card, which on a long-lived tab grows without bound as new books
// appear site-wide - cap it FIFO (same eviction shape as covers.js's blob
// cache) so 24h+ sessions don't accumulate it forever.
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

// The flat overlay (see .feed-day-cover-stack::after in style.css) sits above
// the tiles as a plain constant-opacity layer - a top-to-bottom gradient only
// made sense for a short box; on a tall multi-tile stack a ramp would mean
// everything below its own top portion sits at the darkest stop uniformly.
let _lastDayCoverLists = [];
let _coverGeneration = 0;

// Recomputes whenever a day-card's *actual rendered size* changes, for
// whatever reason - a CSS-animated panel-collapse transition, a window
// resize, a font finishing its load and reflowing text, a sibling card's
// content shifting this one - rather than trying to enumerate every possible
// cause as its own listener (window resize, fullscreenchange, panel toggle,
// prefs sync... proved to be an incomplete list in practice). ResizeObserver
// fires once per element per actual layout change, already coalesced by the
// browser, so this is the single source of truth; the resize/fullscreenchange/
// panel-toggle hooks below are kept only as immediate nudges for the common
// cases, not load-bearing for correctness.
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

    // Full card width, natural aspect ratio - no stretch, no crop, no
    // shrinking. On a card shorter than one tile's height this still shows
    // exactly one tile (that's just what "full width, real aspect ratio"
    // means for a portrait cover); cycling through several different books
    // only becomes visible once a day has enough entries to need more than
    // one tile's worth of height, same as it would with a single repeated
    // cover.
    const boxes = metas.map(m => (m?.width && m?.height)
      ? { w: cardW, h: Math.max(1, Math.round((m.height / m.width) * cardW)) }
      : null);

    const tiles = []; // { top, cover, box }
    const pushTile = (top, idx) => { if (boxes[idx]) tiles.push({ top, cover: covers[idx], box: boxes[idx] }); };

    // The most-prominent book's cover sits whole, centered on the card. Above
    // and below it, the day's *other* books fill outward independently on
    // each side, drawing from the same pool of non-center books - with only
    // one other book that pool has a single entry, so both sides naturally
    // land on the same cover; with two or more, each side gets its own
    // continuously-advancing pointer into the pool (offset from the other by
    // half the pool length) so the two sides draw different books from each
    // other rather than mirroring, only repeating once every other book that
    // day has been shown at least once.
    // Center index is usually 0 (the most-prominent book), but if that
    // specific cover failed to load, fall back to whichever book's did load -
    // otherwise the center band would be silently left blank (reserved via
    // anchorH below) with the outward tiling still starting from its edges.
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
  // A single rAF after `resize`/`fullscreenchange` can still land mid-transition
  // on an animated OS/browser fullscreen toggle (unlike a plain window resize,
  // which settles in one frame) - re-check once more shortly after in case the
  // first pass measured an in-between size.
  if (_dayCoverSettleTimer) clearTimeout(_dayCoverSettleTimer);
  _dayCoverSettleTimer = setTimeout(() => {
    _dayCoverSettleTimer = null;
    const el = document.getElementById('feed-content');
    if (el) _applyDayCoverFlows(el);
  }, 400);
}
window.addEventListener('resize', _scheduleDayCoverRecompute);
document.addEventListener('fullscreenchange', _scheduleDayCoverRecompute);

// The feed panel's width also changes whenever the covers/right landing
// panels collapse or expand (Ctrl+X, or the individual panel toggles) -
// that never fires a `resize` event at all (the window itself doesn't
// change size, only the feed panel's CSS width), so it needs an explicit
// call. Wired from prefs.js's _setLandingPanelCollapsed.
export function refreshDayCoverFlows() {
  _scheduleDayCoverRecompute();
}

export function replaceDayCoverLists(lists) {
  ++_coverGeneration;
  _dayCoverResizeObserver?.disconnect();
  _lastDayCoverLists = lists;
}
