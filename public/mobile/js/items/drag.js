// Support mouse dragging and touch hold-and-drag without blocking ordinary scrolling.
export function bindItemDrag(root, { canDrag, onDrop }) {
  let gesture = null, timer = null, ghost = null;
  const targetAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-item-target]');
  function clear() {
    clearTimeout(timer);
    gesture?.element.classList.remove('m-item-dragging');
    ghost?.remove();
    ghost = null;
    gesture = null;
    root.querySelectorAll('.m-item-drop-target').forEach(el => el.classList.remove('m-item-drop-target'));
  }
  function activate() {
    if (!gesture || !canDrag()) return clear();
    gesture.active = true;
    gesture.element.classList.add('m-item-dragging');
    ghost = gesture.element.cloneNode(true);
    ghost.className = 'm-item-drag-ghost';
    // Positioned equipment slots carry inline percentages; never copy them to a viewport preview.
    ghost.removeAttribute('style');
    ghost.removeAttribute('id');
    ghost.removeAttribute('data-tooltip');
    ghost.removeAttribute('data-tooltip-wrap');
    ghost.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ghost);
    position(gesture.x, gesture.y);
  }
  function position(x, y) {
    if (!ghost) return;
    ghost.style.left = `${x - ghost.offsetWidth / 2}px`;
    ghost.style.top = `${y - ghost.offsetHeight / 2}px`;
    root.querySelectorAll('.m-item-drop-target').forEach(el => el.classList.remove('m-item-drop-target'));
    const target = targetAt(x, y);
    if (target && root.contains(target)) target.classList.add('m-item-drop-target');
  }
  function start(event, touch) {
    const element = event.target.closest('[data-item-source]');
    if (!element || !root.contains(element) || !canDrag()) return;
    clear();
    const point = touch || event;
    gesture = { element, source: JSON.parse(element.dataset.itemSource), x: point.clientX, y: point.clientY, active: false, touch: !!touch };
    if (touch) timer = setTimeout(activate, 220);
  }
  function move(event, point) {
    if (!gesture) return;
    if (!canDrag()) return clear();
    const distance = Math.hypot(point.clientX - gesture.x, point.clientY - gesture.y);
    if (!gesture.active && distance > 8) {
      if (gesture.touch) return clear(); // Let a normal swipe scroll.
      activate();
    }
    if (gesture?.active) { event.preventDefault(); position(point.clientX, point.clientY); }
  }
  function end(point) {
    if (!gesture) return;
    const source = gesture.source;
    const target = gesture.active && canDrag() ? targetAt(point.clientX, point.clientY) : null;
    const destination = target && root.contains(target) ? JSON.parse(target.dataset.itemTarget) : null;
    clear();
    if (destination) onDrop(source, destination);
  }
  const pointerStart = event => { if (event.pointerType !== 'touch' && event.button === 0) start(event); };
  const pointerMove = event => { if (event.pointerType !== 'touch') move(event, event); };
  const pointerEnd = event => { if (event.pointerType !== 'touch') end(event); };
  const touchStart = event => { if (event.touches.length === 1) start(event, event.touches[0]); else clear(); };
  const touchMove = event => { if (event.touches.length === 1) move(event, event.touches[0]); else clear(); };
  const touchEnd = event => { if (event.changedTouches[0]) end(event.changedTouches[0]); };
  const contextMenu = event => { if (event.target.closest('[data-item-source]')) event.preventDefault(); };
  root.addEventListener('pointerdown', pointerStart);
  root.addEventListener('touchstart', touchStart, { passive: true });
  root.addEventListener('contextmenu', contextMenu);
  document.addEventListener('pointermove', pointerMove, { passive: false });
  document.addEventListener('pointerup', pointerEnd);
  document.addEventListener('pointercancel', clear);
  document.addEventListener('touchmove', touchMove, { passive: false });
  document.addEventListener('touchend', touchEnd);
  document.addEventListener('touchcancel', clear);
  return () => {
    clear();
    root.removeEventListener('pointerdown', pointerStart);
    root.removeEventListener('touchstart', touchStart);
    root.removeEventListener('contextmenu', contextMenu);
    document.removeEventListener('pointermove', pointerMove);
    document.removeEventListener('pointerup', pointerEnd);
    document.removeEventListener('pointercancel', clear);
    document.removeEventListener('touchmove', touchMove);
    document.removeEventListener('touchend', touchEnd);
    document.removeEventListener('touchcancel', clear);
  };
}
