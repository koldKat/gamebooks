// tooltip.js - App-wide data-tooltip hover tooltip

export function initTooltip() {
  const tip = document.getElementById('app-tooltip');
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tooltip]');
    tip.style.display = el ? 'block' : 'none';
    if (el) {
      tip.textContent = el.dataset.tooltip;
      tip.classList.toggle('tip-wrap', !!el.dataset.tooltipWrap);
    }
  });
  document.addEventListener('mousemove', e => {
    if (tip.style.display === 'block') {
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      const x = Math.min(e.clientX + 14, window.innerWidth  - tw - 8);
      const y = Math.min(e.clientY + 18, window.innerHeight - th - 8);
      tip.style.left = `${x}px`;
      tip.style.top  = `${y}px`;
    }
  });
  document.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  // Touch devices fire a synthetic mouseover on tap (showing the tooltip) but
  // never a matching mouseleave/mouseout, since there's no pointer to actually
  // leave - without this the tooltip gets stuck on screen after tapping
  // whatever triggered it, floating over the new modal/panel it just opened.
  document.addEventListener('click', () => { tip.style.display = 'none'; });
}
