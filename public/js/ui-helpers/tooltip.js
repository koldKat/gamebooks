// Shared themed hover tooltips, with optional tap access for informational details.

let initialized = false;
let dismissCurrent;
const contentRenderers = new WeakMap();
export function dismissTooltip() {
  dismissCurrent?.();
}
export function setTooltipContent(element, render) {
  contentRenderers.set(element, render);
}
export function initTooltip() {
  if (initialized) return;
  initialized = true;
  const tip = document.getElementById('app-tooltip') || document.body.appendChild(Object.assign(document.createElement('div'), {id:'app-tooltip'}));
  let lastMoveAt    = 0;
  let lastDismissAt = -1;
  let tapTarget = null;
  function dismiss() {
    lastDismissAt = Date.now();
    tapTarget?.setAttribute('aria-expanded', 'false');
    tapTarget = null;
    tip.classList.remove('tip-interactive');
    tip.style.display = 'none';
  }
  dismissCurrent = dismiss;
  function show(el) {
    const host = el.closest('dialog[open]') || document.body;
    if (tip.parentElement !== host) host.append(tip);
    const render = contentRenderers.get(el);
    if (render) { tip.replaceChildren(); render(tip); }
    else tip.textContent = el.dataset.tooltip;
    tip.classList.toggle('tip-wrap', !!el.dataset.tooltipWrap);
    tip.style.display = 'block';
  }
  document.addEventListener('mouseover', e => {
    if (tapTarget) return;
    const el = e.target.closest('[data-tooltip]');
    // Require pointer movement after dismissal so synthetic mouseovers cannot reopen the tooltip.
    if (el && lastMoveAt <= lastDismissAt) { tip.style.display = 'none'; return; }
    tip.style.display = el ? 'block' : 'none';
    if (el) show(el);
  });
  document.addEventListener('mousemove', e => {
    lastMoveAt = Date.now();
    if (!tapTarget && tip.style.display === 'block') {
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      const x = Math.min(e.clientX + 14, window.innerWidth  - tw - 8);
      const y = Math.min(e.clientY + 18, window.innerHeight - th - 8);
      tip.style.left = `${x}px`;
      tip.style.top  = `${y}px`;
    }
  });
  document.addEventListener('mouseleave', () => { if (!tapTarget) tip.style.display = 'none'; });
  document.addEventListener('click', e => {
    if (tapTarget && tip.contains(e?.target)) return;
    const el = e?.target?.closest?.('[data-tooltip-tap]');
    if (!el || tapTarget === el) { dismiss(); return; }
    dismiss();
    tapTarget = el;
    tip.classList.add('tip-interactive');
    show(el);
    el.setAttribute('aria-expanded', 'true');
    const rect = el.getBoundingClientRect();
    const x = Math.max(8, Math.min(rect.left, window.innerWidth - tip.offsetWidth - 8));
    const below = rect.bottom + 8;
    const y = below + tip.offsetHeight <= window.innerHeight - 8 ? below
      : Math.max(8, rect.top - tip.offsetHeight - 8);
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && tapTarget) { dismiss(); e.preventDefault(); e.stopPropagation(); }
    else if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('[data-tooltip-tap]')) {
      e.preventDefault(); e.target.closest('[data-tooltip-tap]').click();
    }
  }, true);
  document.addEventListener('scroll', e => {
    if (tapTarget && !tip.contains(e.target)) dismiss();
  }, true);
  document.addEventListener('close', event => {
    if (event.target.matches?.('dialog') && !event.target.open && event.target.contains(tip)) {
      dismiss(); document.body.append(tip);
    }
  }, true);
}
