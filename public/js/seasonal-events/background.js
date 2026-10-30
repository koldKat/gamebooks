// Sparse Halloween artwork in clear landing-page gaps, never over panels.
import { seasonalGapPositions } from './gaps.js';
import { halloweenArtwork } from './artwork.js';


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
  const variants = [8, 9, 10, 11, 12, 13];
  for (let i = variants.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [variants[i], variants[j]] = [variants[j], variants[i]];
  }
  const nodes = [0, 2, 1, 3, 4, 5, 6, 7, ...variants.slice(0, 4)].map(index => {
    const { kind, svg } = halloweenArtwork[index];
    const icon = document.createElement('span');
    icon.className = 'seasonal-background__icon';
    icon.dataset.kind = String(kind);
    icon.dataset.artwork = String(index);
    icon.dataset.rotation = String(kind === 4 ? Math.floor(Math.random() * 4) * 90 : 0);
    icon.dataset.flip = Math.random() < .5 ? '-1' : '1';
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
      if (panel.id === 'app-footer' && getComputedStyle(document.getElementById('feed-panel')).opacity === '0') return false;
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && rect.width && rect.height
        && rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight;
    }).map(panel => {
      const rect = panel.getBoundingClientRect();
      if (panel.id === 'feed-panel') {
        const style = getComputedStyle(panel);
        return {left:rect.left+parseFloat(style.paddingLeft),right:rect.right-parseFloat(style.paddingRight),top:0,bottom:innerHeight};
      }
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
    positions = seasonalGapPositions(innerWidth, innerHeight, occupied);
    for (const [index, icon] of nodes.entries()) {
      const point = positions[index];
      icon.hidden = !point;
      if (!point) continue;
      icon.style.left = `${point.x - point.size / 2}px`;
      icon.style.top = `${point.y - point.size / 2}px`;
      icon.style.width = icon.style.height = `${point.size}px`;
      icon.style.transform = `rotate(${point.angle + Number(icon.dataset.rotation)}deg) scaleX(${icon.dataset.flip})`;
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
