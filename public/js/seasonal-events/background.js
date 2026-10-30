// Sparse Halloween artwork in clear landing-page gaps, never over panels.
import { seasonalGapPositions } from './gaps.js';
import { halloweenArtwork } from './artwork.js';
import { seasonalWebPositions } from './web-layout.js';
import { createZombieDrop } from './zombie-drop.js';

// A document gets one scatter; returning to the same layout reproduces it exactly.
const pageSeed = Math.floor(Math.random() * 0x100000000);
function layoutRandom() {
  let seed = pageSeed;
  return () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 0x100000000);
}

export function createSeasonalBackground({ id = 'halloween', artwork = halloweenArtwork,
  featured = [0, 2, 1, 3, 14, 16, 18, 20], cornerWebs = true } = {}) {
  const landing = document.getElementById('landing-wrapper');
  if (!landing) return () => {};
  const layer = document.createElement('div');
  layer.className = 'seasonal-background';
  layer.dataset.season = id;
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  const panels = [...document.querySelectorAll('#covers-panel, #feed-panel, #landing-right, .panel-toggle, .scroll-top-btn, #app-footer')];
  let timer, signature, positions = [],occupiedColumns=[];
  const haze = Array.from({ length: 3 }, () => {
    const patch = document.createElement('div');
    patch.className = 'seasonal-background__haze';
    patch.setAttribute('aria-hidden','true');
    patch.hidden = true; layer.append(patch); return patch;
  });
  featured = featured.filter(index => artwork[index]);
  const variants = artwork.map((_, index) => index)
    .filter(index => artwork[index].kind !== 4 && !featured.includes(index));
  const random = layoutRandom();
  for (let i = variants.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [variants[i], variants[j]] = [variants[j], variants[i]];
  }
  const portfolio = [...featured, ...variants];
  const pool = [...portfolio, ...portfolio.slice(0,7).reverse()];
  while (pool.length < 42 && portfolio.length) pool.push(...portfolio);
  const nodes = pool.map(index => {
    const { kind, svg, pixelated, maskImage,animated } = artwork[index];
    const icon = document.createElement('span');
    icon.className = 'seasonal-background__icon';
    icon.setAttribute('aria-hidden','true');
    icon.dataset.kind = String(kind);
    icon.dataset.artwork = String(index);
    if (pixelated) icon.dataset.pixelated = 'true';
    if(animated)icon.dataset.animated='true';
    if (maskImage&&!animated) icon.style.maskImage = maskImage;
    icon.dataset.rotation = String(kind === 4 ? Math.floor(random() * 4) * 90 : 0);
    icon.dataset.flip = random() < .5 ? '-1' : '1';
    icon.innerHTML = `<svg viewBox="0 0 48 48" focusable="false">${svg}</svg>`;
    return icon;
  });
  const webs = artwork.filter(art => cornerWebs && art.kind === 4).map(({ svg, maskImage,webSvg,spiderSvg },index) => {
    const web = document.createElement('span');
    web.className = 'seasonal-background__web';
    web.setAttribute('aria-hidden','true');
    if(webSvg&&spiderSvg){
      web.dataset.motion=index%2?'swing':'climb';
      web.innerHTML='<svg viewBox="0 0 48 48" focusable="false"><g class="seasonal-web__silk">'+webSvg+'</g>'
        +'<g class="seasonal-web__anchor"><g class="seasonal-web__swing"><rect class="seasonal-web__thread" x="-.5" y="0" width="1" height="12" fill="#b6bfce"/>'
        +'<g class="seasonal-web__spider"><g transform="translate(-29 -25)">'+spiderSvg+'</g></g></g></g></svg>';
    }else{
      web.style.maskImage=maskImage;
      web.innerHTML=`<svg viewBox="0 0 48 48" focusable="false">${svg}</svg>`;
    }
    return web;
  });
  const physics=id==='halloween'?createZombieDrop({layer,nodes,getColumns:()=>occupiedColumns}):null;
  if(physics)layer.removeAttribute('aria-hidden');
  function render() {
    const style = getComputedStyle(landing);
    layer.hidden = style.visibility === 'hidden' || style.display === 'none' || !landing.getClientRects().length;
    if (['covers-collapsed', 'right-collapsed', 'feed-collapsed'].every(name => document.body.classList.contains(name))) layer.hidden = true;
    physics?.visible(!layer.hidden);
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
    occupiedColumns=columns;
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
    const corners = cornerWebs ? seasonalWebPositions(innerWidth, innerHeight, occupied, { random: layoutRandom() }) : [];
    const webAreas = corners.map(point => ({ left: point.left - 8, right: point.left + point.size + 8,
      top: point.top - 8, bottom: point.top + point.size + 8 }));
    for (const [index, web] of webs.entries()) {
      const point = corners[index];
      web.hidden = !point;
      if (!point) continue;
      web.style.left = `${point.left}px`; web.style.top = `${point.top}px`;
      web.style.width = web.style.height = `${point.size}px`;
      web.style.transform = `scale(${point.flipX}, ${point.flipY})`;
      web.querySelector('.seasonal-web__anchor')?.setAttribute('transform',`translate(29 ${point.flipY===1?12:31}) scale(1 ${point.flipY})`);
      web.dataset.edge = point.edge; web.dataset.anchorX = String(point.anchorX);
      if (!web.isConnected) layer.append(web);
    }
    positions = seasonalGapPositions(innerWidth, innerHeight, [...occupied, ...webAreas], { random: layoutRandom() });
    for (const [index, icon] of nodes.entries()) {
      const point = positions[index];
      icon.hidden = !point;
      if (!point) continue;
      icon.style.left = `${point.x - point.size / 2}px`;
      icon.style.top = `${point.y - point.size / 2}px`;
      icon.style.width = icon.style.height = `${point.size}px`;
      const angle = icon.dataset.pixelated ? Number(icon.dataset.rotation) : point.angle + Number(icon.dataset.rotation);
      icon.style.transform = `rotate(${angle}deg) scaleX(${icon.dataset.flip})`;
      if (!icon.isConnected) layer.append(icon);
    }
    physics?.layout();
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
    physics?.dispose();
    layer.remove();
  };
}
export const createHalloweenBackground = () => createSeasonalBackground();
