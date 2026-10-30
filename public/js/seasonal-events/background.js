// Sparse Halloween artwork in clear landing-page gaps, never over panels.
import { seasonalGapPositions } from './gaps.js';
import { halloweenArtwork } from './artwork.js';

// A document gets one scatter; returning to the same layout reproduces it exactly.
const pageSeed = Math.floor(Math.random() * 0x100000000);
function layoutRandom() {
  let seed = pageSeed;
  return () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 0x100000000);
}

export function createHalloweenBackground() {
  const landing = document.getElementById('landing-wrapper');
  if (!landing) return () => {};
  const layer = document.createElement('div');
  layer.className = 'seasonal-background';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  const panels = [...document.querySelectorAll('#covers-panel, #feed-panel, #landing-right, .panel-toggle, .scroll-top-btn, #app-footer')];
  let timer, signature, positions = [];
  const haze = Array.from({ length: 3 }, () => {
    const patch = document.createElement('div');
    patch.className = 'seasonal-background__haze';
    patch.hidden = true; layer.append(patch); return patch;
  });
  const featured = [0, 2, 1, 3, 4, 14, 16, 18, 20];
  const variants = halloweenArtwork.map((_, index) => index).filter(index => !featured.includes(index));
  const random = layoutRandom();
  for (let i = variants.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [variants[i], variants[j]] = [variants[j], variants[i]];
  }
  const portfolio = [...featured, ...variants];
  const nodes = [...portfolio, ...portfolio.slice(0,7).reverse()].map(index => {
    const { kind, svg, pixelated } = halloweenArtwork[index];
    const icon = document.createElement('span');
    icon.className = 'seasonal-background__icon';
    icon.dataset.kind = String(kind);
    icon.dataset.artwork = String(index);
    if (pixelated) icon.dataset.pixelated = 'true';
    icon.dataset.rotation = String(kind === 4 ? Math.floor(random() * 4) * 90 : 0);
    icon.dataset.flip = random() < .5 ? '-1' : '1';
    icon.innerHTML = `<svg viewBox="0 0 48 48" focusable="false">${svg}</svg>`;
    return icon;
  });
  function render() {
    const style = getComputedStyle(landing);
    layer.hidden = style.visibility === 'hidden' || style.display === 'none' || !landing.getClientRects().length;
    if (['covers-collapsed', 'right-collapsed', 'feed-collapsed'].every(name => document.body.classList.contains(name))) layer.hidden = true;
    if (layer.hidden) return;
    const occupied = panels.filter(panel => {
      const s = getComputedStyle(panel), rect = panel.getBoundingClientRect();
      const column = ['covers-panel', 'feed-panel', 'landing-right'].includes(panel.id);
      if (panel.id === 'app-footer' && getComputedStyle(document.getElementById('feed-panel')).opacity === '0') return false;
      // A scrolled-away feed still occupies its column. Reserve fixed controls even
      // while faded out, so revealing a scroll-to-top button cannot reshuffle icons.
      return s.display !== 'none' && s.visibility !== 'hidden' && (!column || s.opacity !== '0') && rect.width && rect.height
        && rect.right > 0 && rect.left < innerWidth
        && (column || panel.id === 'app-footer' || (rect.bottom > 0 && rect.top < innerHeight));
    }).map(panel => {
      const rect = panel.getBoundingClientRect();
      if (panel.id === 'feed-panel') {
        const style = getComputedStyle(panel);
        return {left:rect.left+parseFloat(style.paddingLeft),right:rect.right-parseFloat(style.paddingRight),top:0,bottom:innerHeight};
      }
      // Reserve its eventual bottom-of-viewport position, independent of feed scroll.
      if (panel.id === 'app-footer') return {left:rect.left,right:rect.right,top:innerHeight-rect.height,bottom:innerHeight};
      return ['covers-panel', 'feed-panel', 'landing-right'].includes(panel.id)
        ? {left:rect.left,right:rect.right,top:0,bottom:innerHeight}
        : {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};
    });
    const nextSignature = JSON.stringify([innerWidth, innerHeight, occupied.map(rect =>
      Object.values(rect).map(value => Math.round(value)))]);
    if (signature === nextSignature) return;
    signature = nextSignature;
    const columns = occupied.filter(rect => rect.top === 0 && rect.bottom === innerHeight && rect.right - rect.left > 100)
      .sort((a, b) => a.left - b.left);
    const gaps = []; let edge = 0;
    for (const column of columns) {
      if (column.left - edge >= 150) gaps.push({ left: edge, width: column.left - edge });
      edge = Math.max(edge, column.right);
    }
    if (innerWidth - edge >= 150) gaps.push({ left: edge, width: innerWidth - edge });
    for (const [index, patch] of haze.entries()) {
      patch.hidden = !gaps[index];
      if (gaps[index]) { patch.style.left = `${gaps[index].left}px`; patch.style.width = `${gaps[index].width}px`; }
    }
    // Redistribute into newly opened space after a real panel-layout change.
    // Unchanged geometry returns above, preserving positions during ordinary use.
    positions = seasonalGapPositions(innerWidth, innerHeight, occupied, { random: layoutRandom() });
    for (const [index, icon] of nodes.entries()) {
      const point = positions[index];
      icon.hidden = !point;
      if (!point) continue;
      icon.style.left = `${point.x - point.size / 2}px`;
      icon.style.top = `${point.y - point.size / 2}px`;
      icon.style.width = icon.style.height = `${point.size}px`;
      const angle = icon.dataset.pixelated ? 0 : point.angle + Number(icon.dataset.rotation);
      icon.style.transform = `rotate(${angle}deg) scaleX(${icon.dataset.flip})`;
      if (!icon.isConnected) layer.append(icon);
    }
  }
  function schedule() {
    clearTimeout(timer); timer = setTimeout(render, 280);
  }
  function settled(event) {
    if ((event.target === landing || panels.includes(event.target))
      && ['transform', 'padding-left', 'padding-right', 'width', 'max-height'].includes(event.propertyName)) {
      clearTimeout(timer); timer = setTimeout(render, 30);
    }
  }
  const resize = new ResizeObserver(schedule);
  for (const panel of [landing, ...panels]) resize.observe(panel);
  const changes = new MutationObserver(schedule);
  for (const element of [document.body, landing, ...panels]) {
    changes.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  }
  window.addEventListener('resize', schedule);
  document.addEventListener('transitionend', settled, true);
  render();
  return () => {
    clearTimeout(timer); resize.disconnect(); changes.disconnect();
    window.removeEventListener('resize', schedule);
    document.removeEventListener('transitionend', settled, true);
    layer.remove();
  };
}
