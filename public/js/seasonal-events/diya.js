// A small Diwali lamp follows the mouse, with a gentle motion-aware flame.
import { diyaSvg } from './diwali-artwork.js';
export function createDiya() {
  const lamp = document.createElement('div');
  lamp.className = 'seasonal-diya'; lamp.hidden = true;
  lamp.setAttribute('aria-hidden', 'true');
  lamp.innerHTML = `<svg viewBox="0 0 48 48" focusable="false">${diyaSvg}</svg>`;
  document.body.append(lamp);
  let frame, point;
  function hide() { lamp.hidden = true; cancelAnimationFrame(frame); frame = null; }
  function move(event) {
    if (event.pointerType !== 'mouse' || document.hidden || document.pointerLockElement) return hide();
    point = { x:event.clientX, y:event.clientY };
    if (frame != null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      const x = point.x + 48 > innerWidth ? point.x - 46 : point.x + 14;
      const y = point.y + 48 > innerHeight ? point.y - 46 : point.y + 14;
      lamp.style.transform = `translate3d(${Math.max(0,x)}px, ${Math.max(0,y)}px, 0)`;
      lamp.hidden = false;
    });
  }
  function down(event) { if (event.pointerType !== 'mouse') hide(); }
  document.addEventListener('pointermove', move, { passive:true });
  document.addEventListener('pointerdown', down, { passive:true });
  document.documentElement.addEventListener('pointerleave', hide);
  for (const name of ['blur','resize']) window.addEventListener(name, hide);
  for (const name of ['visibilitychange','pointerlockchange']) document.addEventListener(name, hide);
  return () => {
    hide(); lamp.remove();
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerdown', down);
    document.documentElement.removeEventListener('pointerleave', hide);
    for (const name of ['blur','resize']) window.removeEventListener(name, hide);
    for (const name of ['visibilitychange','pointerlockchange']) document.removeEventListener(name, hide);
  };
}
