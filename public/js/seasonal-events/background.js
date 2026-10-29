// Sparse Halloween artwork in clear landing-page gaps, never over panels.
import { seasonalGapPositions } from './gaps.js';

const icons = [
  '<path d="M10 39V20a14 14 0 0 1 28 0v19l-6-4-7 5-7-5-8 4Z"/><path d="m15 19 7 3-5 5Zm18 0-7 3 5 5Z" fill="#111827"/><ellipse cx="25" cy="31" rx="3" ry="4" fill="#111827"/>',
  '<path d="M8 43 13 19Q24-1 35 19l5 24-10-4-6 5-7-5Z"/><path d="M16 22q8-12 16 0v8l-5 5h-6l-5-5Z" fill="#111827"/><path d="m18 24 5 2-4 3Zm12 0-5 2 4 3Z" fill="#b9a7d8"/><path d="M42 44V12M42 13Q32 5 29 9q5-11 17-5" fill="none" stroke="currentColor" stroke-width="2"/>',
  '<path d="m23 11 2-7 5 1-3 7"/><path d="M24 13C4 5 2 24 8 36q5 9 16 6 12 3 17-6c6-12 1-31-17-23Z"/><path d="m10 20 11 4-5 6Zm28 0-11 4 5 6ZM13 34l7 2 4-2 4 2 7-2-4 7-7-2-7 2Z" fill="#111827"/>',
];

export function createHalloweenBackground() {
  const landing = document.getElementById('landing-wrapper');
  if (!landing) return () => {};
  const layer = document.createElement('div');
  layer.className = 'seasonal-background';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  const panels = [...document.querySelectorAll('#covers-panel, #feed-panel, #landing-right, .panel-toggle, .scroll-top-btn, #app-footer')];
  let timer;
  function render() {
    layer.replaceChildren();
    const style = getComputedStyle(landing);
    if (style.visibility === 'hidden' || style.display === 'none' || !landing.getClientRects().length) return;
    const occupied = panels.filter(panel => {
      const s = getComputedStyle(panel), rect = panel.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && rect.width && rect.height
        && rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight;
    }).map(panel => panel.getBoundingClientRect());
    for (const [index, point] of seasonalGapPositions(innerWidth, innerHeight, occupied).entries()) {
      const icon = document.createElement('span');
      icon.className = 'seasonal-background__icon';
      icon.style.left = `${point.x - 20}px`;
      icon.style.top = `${point.y - 20}px`;
      icon.innerHTML = `<svg viewBox="0 0 48 48" focusable="false">${icons[index]}</svg>`;
      layer.append(icon);
    }
  }
  function schedule() {
    layer.replaceChildren();
    clearTimeout(timer); timer = setTimeout(render, 280);
  }
  const resize = new ResizeObserver(schedule);
  for (const panel of [landing, ...panels]) resize.observe(panel);
  const changes = new MutationObserver(schedule);
  for (const element of [document.body, landing, ...panels]) {
    changes.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  }
  window.addEventListener('resize', schedule);
  landing.addEventListener('scroll', schedule, { passive: true });
  render();
  return () => {
    clearTimeout(timer); resize.disconnect(); changes.disconnect();
    window.removeEventListener('resize', schedule);
    landing.removeEventListener('scroll', schedule);
    layer.remove();
  };
}
