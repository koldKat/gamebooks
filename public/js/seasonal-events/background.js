// Sparse Halloween artwork in clear landing-page gaps, never over panels.
import { seasonalGapPositions } from './gaps.js';

const icons = [
  '<path d="M10 39V20a14 14 0 0 1 28 0v19l-6-4-7 5-7-5-8 4Z"/><path d="m15 19 7 3-5 5Zm18 0-7 3 5 5Z" fill="#111827"/><ellipse cx="25" cy="31" rx="3" ry="4" fill="#111827"/>',
  '<path d="M8 43 13 19Q24-1 35 19l5 24-10-4-6 5-7-5Z" fill="#050507" stroke="#a4a1a0" stroke-width=".65"/><path d="M16 22q8-12 16 0v8l-5 5h-6l-5-5Z" fill="#0c0c10"/><path d="m18 24 5 2-4 3Zm12 0-5 2 4 3Z" fill="white"/><path d="M42 44V12M42 13Q32 5 29 9q5-11 17-5" fill="none" stroke="#b5b3ae" stroke-width="1.7"/>',
  '<path d="m23 11 2-7 5 1-3 7"/><path d="M24 13C4 5 2 24 8 36q5 9 16 6 12 3 17-6c6-12 1-31-17-23Z"/><path d="m10 20 11 4-5 6Zm28 0-11 4 5 6ZM13 34l7 2 4-2 4 2 7-2-4 7-7-2-7 2Z" fill="#111827"/>',
  '<path d="m2 14 12 5 7-8 3 8 3-8 7 8 12-5-4 17-8-4-5 9-5-5-5 5-5-9-8 4Z"/><path d="m20 23 3 2-3 2m8-4-3 2 3 2" fill="#f3ac63"/>',
  '<g fill="none" stroke="currentColor" stroke-width="1"><path d="M3 3v42M3 3h42M3 3l40 40M3 3l18 42M3 3l42 18M3 15q5-5 12-12M3 27q12-12 24-24M3 42q18-18 39-39M11 23q1-8 12-12M16 35q2-12 19-19M27 42q1-9 15-15"/></g><path d="M32 7v10" fill="none" stroke="currentColor"/><ellipse cx="32" cy="21" rx="3" ry="4"/><path d="m29 19-5-3m5 6-5 2m11-5 5-3m-5 6 5 2" fill="none" stroke="currentColor"/>',
  '<path d="M10 23C4 0 44 0 38 23l-6 8v9H16V31Z"/><path d="m13 19 9 3-3 7-7-2Zm22 0-9 3 3 7 7-2Zm-11 9-3 6h6Z" fill="#111827"/><path d="M20 35v6m8-6v6" fill="none" stroke="#111827" stroke-width="2"/>',
];

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
  const nodes = [0, 2, 1, 3, 4, 5, 0, 2, 1, 3, 0, 4].map(kind => {
    const icon = document.createElement('span');
    icon.className = 'seasonal-background__icon';
    icon.dataset.kind = String(kind);
    icon.innerHTML = `<svg viewBox="0 0 48 48" focusable="false">${icons[kind]}</svg>`;
    return icon;
  });
  function render() {
    const style = getComputedStyle(landing);
    layer.hidden = style.visibility === 'hidden' || style.display === 'none' || !landing.getClientRects().length;
    if (['covers-collapsed', 'right-collapsed', 'feed-collapsed'].every(name => document.body.classList.contains(name))) layer.hidden = true;
    if (layer.hidden) return;
    const occupied = panels.filter(panel => {
      const s = getComputedStyle(panel), rect = panel.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && rect.width && rect.height
        && rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight;
    }).map(panel => {
      const rect = panel.getBoundingClientRect();
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
    positions = seasonalGapPositions(innerWidth, innerHeight, occupied, { previous: positions });
    for (const [index, icon] of nodes.entries()) {
      const point = positions[index];
      icon.hidden = !point;
      if (!point) continue;
      icon.style.left = `${point.x - point.size / 2}px`;
      icon.style.top = `${point.y - point.size / 2}px`;
      icon.style.width = icon.style.height = `${point.size}px`;
      icon.style.transform = `rotate(${point.angle}deg)`;
      if (!icon.isConnected) layer.append(icon);
    }
  }
  function schedule() {
    clearTimeout(timer); timer = setTimeout(render, 180);
  }
  const resize = new ResizeObserver(schedule);
  for (const panel of [landing, ...panels]) resize.observe(panel);
  const changes = new MutationObserver(schedule);
  for (const element of [document.body, landing, ...panels]) {
    changes.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  }
  window.addEventListener('resize', schedule);
  render();
  return () => {
    clearTimeout(timer); resize.disconnect(); changes.disconnect();
    window.removeEventListener('resize', schedule);
    layer.remove();
  };
}
