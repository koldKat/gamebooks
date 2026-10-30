// A small Diwali lamp follows the mouse, with a gentle motion-aware flame.
import { diyaCursorSvg } from './diya-artwork.js';
export function createDiya({ random = Math.random, preview = false } = {}) {
  const lamp = document.createElement('div');
  lamp.className = 'seasonal-diya'; lamp.hidden = true;
  lamp.setAttribute('aria-hidden', 'true');
  lamp.innerHTML = `<svg viewBox="0 0 48 48" focusable="false">${diyaCursorSvg}</svg>`;
  document.body.append(lamp);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const effects = [
    { name:'is-flaring', delay:70000, spread:60000, duration:1800, previewDelay:4500 },
    { name:'is-sparking', delay:90000, spread:70000, duration:2400, previewDelay:10000 },
    { name:'is-smoking', delay:120000, spread:90000, duration:3000, previewDelay:16000 },
  ];
  const previewPending = new Set(preview ? effects.map(effect => effect.name) : []);
  const timers = new Set();
  let frame, point, endEffect, currentEffect;
  const animate = () => !motion.matches && !document.body.classList.contains('reduce-motion');
  function clearAnimation() {
    for (const timer of timers) clearTimeout(timer);
    timers.clear(); clearTimeout(endEffect);
    lamp.classList.remove(...effects.map(effect => effect.name));
    currentEffect = null;
  }
  function schedule(effect) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (lamp.hidden || !animate()) return;
      if (!currentEffect) {
        previewPending.delete(effect.name);
        currentEffect = effect.name;
        lamp.classList.add(currentEffect);
        endEffect = setTimeout(() => {
          lamp.classList.remove(effect.name);
          currentEffect = null;
        }, effect.duration);
      }
      schedule(effect);
    }, previewPending.has(effect.name) ? effect.previewDelay + random() * 2000
      : effect.delay + random() * effect.spread);
    timers.add(timer);
  }
  function updateAnimation() {
    clearAnimation();
    if (!lamp.hidden && animate()) effects.forEach(schedule);
  }
  function hide() {
    lamp.hidden = true; cancelAnimationFrame(frame); frame = null;
    clearAnimation();
  }
  function move(event) {
    if (event.pointerType !== 'mouse' || document.hidden || document.pointerLockElement) return hide();
    point = { x:event.clientX, y:event.clientY };
    if (frame != null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      const x = point.x + 48 > innerWidth ? point.x - 46 : point.x + 14;
      const y = point.y + 48 > innerHeight ? point.y - 46 : point.y + 14;
      lamp.style.transform = `translate3d(${Math.max(0,x)}px, ${Math.max(0,y)}px, 0)`;
      if (lamp.hidden) { lamp.hidden = false; updateAnimation(); }
    });
  }
  function down(event) { if (event.pointerType !== 'mouse') hide(); }
  let lastMotion = animate();
  function motionChanged() {
    const next = animate();
    if (next !== lastMotion) { lastMotion = next; updateAnimation(); }
  }
  const prefsObserver = new MutationObserver(motionChanged);
  prefsObserver.observe(document.body, { attributes:true, attributeFilter:['class'] });
  motion.addEventListener('change', motionChanged);
  document.addEventListener('pointermove', move, { passive:true });
  document.addEventListener('pointerdown', down, { passive:true });
  document.documentElement.addEventListener('pointerleave', hide);
  for (const name of ['blur','resize']) window.addEventListener(name, hide);
  for (const name of ['visibilitychange','pointerlockchange']) document.addEventListener(name, hide);
  return () => {
    hide(); lamp.remove(); prefsObserver.disconnect();
    motion.removeEventListener('change', motionChanged);
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerdown', down);
    document.documentElement.removeEventListener('pointerleave', hide);
    for (const name of ['blur','resize']) window.removeEventListener(name, hide);
    for (const name of ['visibilitychange','pointerlockchange']) document.removeEventListener(name, hide);
  };
}
