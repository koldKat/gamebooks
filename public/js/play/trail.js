// trail.js - Internal play-screen module; use ../play.js externally.

import { currentPlaythrough } from '../state.js';
import { network } from '../graph.js';
import { t } from '../i18n.js';
import { playContext } from './context.js';

export function renderPathTrail(pt, header) {
  const el = document.getElementById('run-trail-float');
  if (!pt || !pt.path.length) { el.innerHTML = ''; return; }

  const isActive = pt === currentPlaythrough();
  const nodes = pt.path.map((s, i) => {
    const isCurrent = isActive && i === pt.path.length - 1;
    return `<span class="trail-node${isCurrent ? ' trail-current' : ''}">${s}</span>`;
  });

  if (pt.completed) {
    const cls = pt.result === 'success' ? 'trail-win' : pt.result === 'battle' ? 'trail-battle' : 'trail-death';
    const lbl = pt.result === 'success' ? '★' : pt.result === 'battle' ? 'BTL' : '✝';
    nodes.push(`<span class="trail-node ${cls}">${lbl}</span>`);
  }

  // Each arrow is glued to the pill BEFORE it inside one wrapper (not the
  // pill after), so when a row wraps, the break falls between two whole
  // .trail-item units - the arrow stays at the end of the row it belongs
  // to instead of landing at the start of the next one.
  const trailHtml = nodes.map((n, i) => i === nodes.length - 1 ? n : `<span class="trail-item">${n}<span class="trail-arrow">›</span></span>`).join('');

  el.classList.toggle('trail-collapsed', playContext._trailCollapsed);
  el.innerHTML =
    `<div class="trail-header">` +
      `<span>${header || t('runs.this')}</span>` +
      `<button class="trail-toggle-btn" aria-label="${t('runs.toggle_trail')}">▾</button>` +
    `</div>` +
    `<div class="trail">${trailHtml}</div>`;

  // Hovering a pill highlights the matching node on the graph, same as the
  // public run-path viewer's trail (public-profile.js's _wirePathHover).
  if (network) {
    el.querySelectorAll('.trail-node').forEach(span => {
      const id = parseInt(span.textContent, 10);
      if (!id || id < 1) return;
      span.addEventListener('mouseenter', () => network.selectNodes([id]));
      span.addEventListener('mouseleave', () => network.selectNodes([]));
    });
  }

  const toggleTrail = () => {
    playContext._trailCollapsed = !playContext._trailCollapsed;
    localStorage.setItem('trailCollapsed', playContext._trailCollapsed ? '1' : '0');
    el.classList.toggle('trail-collapsed', playContext._trailCollapsed);
    if (playContext._onTrailToggle) playContext._onTrailToggle(playContext._trailCollapsed);
  };
  el.querySelector('.trail-header').addEventListener('click', toggleTrail);
  el.querySelector('.trail-toggle-btn').addEventListener('click', e => {
    e.stopPropagation();
    toggleTrail();
  });
}
