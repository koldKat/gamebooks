// A decorative pumpkin beside the mouse, with occasional creepy facial animations.
export function createPumpkin({ random = Math.random } = {}) {
  const pumpkin = document.createElement('div');
  pumpkin.className = 'seasonal-pumpkin';
  pumpkin.setAttribute('aria-hidden', 'true');
  pumpkin.hidden = true;
  pumpkin.innerHTML = `<svg viewBox="0 0 48 48" focusable="false"><g class="seasonal-pumpkin__body">
    <path d="M23 13c-2-5 1-9 5-10l3 3c-4 0-5 3-4 7" fill="#57813c" stroke="#294722" stroke-width="1.5"/>
    <path d="M24 13C5 5 1 24 7 35c4 9 12 10 17 8 6 2 14 1 18-8 6-12 0-29-18-22Z" fill="#ef8520" stroke="#783b15" stroke-width="1.5"/>
    <path d="M20 13c-8 7-9 22-1 30M28 13c8 7 9 22 1 30" fill="none" stroke="#c75b17" stroke-width="1.6"/>
    <path d="M24 14v27" fill="none" stroke="#ffab3b" stroke-width="1.4"/>
    <g class="seasonal-pumpkin__eyes">
      <path d="m10 19 12 5-3 7-8-2Z" fill="#ffd36a" stroke="#49200d" stroke-width="1.7"/>
      <path d="m38 19-12 5 3 7 8-2Z" fill="#ffd36a" stroke="#49200d" stroke-width="1.7"/>
      <g class="seasonal-pumpkin__pupils">
        <ellipse cx="16" cy="26" rx="1.5" ry="2.8" fill="#29170e"/>
        <ellipse cx="32" cy="26" rx="1.5" ry="2.8" fill="#29170e"/>
      </g>
    </g>
    <path d="m24 29-3 5h6Z" fill="#49200d"/>
    <g class="seasonal-pumpkin__mouth">
    <g class="seasonal-pumpkin__mouth-closed">
      <path d="m11 33 6 3 3-1 4 3 4-3 3 1 6-3-3 7-6 2-4-1-4 1-6-2Z" fill="#ffd36a" stroke="#49200d" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="m16 35 2 5 2-4m8 0 2 4 2-5m-10 6 2-3 2 3" fill="#49200d"/>
    </g>
    <g class="seasonal-pumpkin__mouth-open">
      <path d="M13 31Q24 27 35 31L34 40Q24 49 14 40Z" fill="#291209" stroke="#9a4414" stroke-width="1.2"/>
      <path class="seasonal-pumpkin__upper-teeth" d="m15 31 3 8 3-9m6 0 3 9 3-8" fill="#ffdc86"/>
      <path class="seasonal-pumpkin__lower-teeth" d="m20 43 4-7 4 7" fill="#ffdc86"/>
    </g>
    </g>
    <g class="seasonal-pumpkin__drool">
      <path d="M29 40q-2 5 0 9t-1 8" fill="none" stroke="#9fcf45" stroke-width="2.2" stroke-linecap="round"/>
      <ellipse cx="28" cy="60" rx="2" ry="3" fill="#9fcf45" stroke="#486b1f" stroke-width=".5"/>
    </g>
  </g></svg>`;
  document.body.append(pumpkin);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let blinkTimer, openTimer, glanceTimer, mouthTimer, closeMouthTimer, droolTimer, droolEndTimer, frame, point;
  let clackTimer, clackEndTimer;
  const animate = () => !motion.matches && !document.body.classList.contains('reduce-motion');
  function clearAnimation() {
    clearTimeout(blinkTimer); clearTimeout(openTimer); clearTimeout(glanceTimer);
    clearTimeout(mouthTimer); clearTimeout(closeMouthTimer);
    clearTimeout(droolTimer); clearTimeout(droolEndTimer);
    clearTimeout(clackTimer); clearTimeout(clackEndTimer);
    blinkTimer = openTimer = glanceTimer = null;
    pumpkin.classList.remove('is-blinking');
    pumpkin.classList.remove('is-gaping');
    pumpkin.classList.remove('is-drooling');
    pumpkin.classList.remove('is-clacking');
    pumpkin.style.setProperty('--pumpkin-look-x', '0px');
    pumpkin.style.setProperty('--pumpkin-look-y', '0px');
  }
  function scheduleBlink() {
    blinkTimer = setTimeout(() => {
      if (pumpkin.hidden || !animate()) return;
      pumpkin.classList.add('is-blinking');
      openTimer = setTimeout(() => pumpkin.classList.remove('is-blinking'), 150);
      scheduleBlink();
    }, 3200 + random() * 4200);
  }
  function scheduleGlance() {
    glanceTimer = setTimeout(() => {
      if (pumpkin.hidden || !animate()) return;
      pumpkin.style.setProperty('--pumpkin-look-x', `${(random() * 4 - 2).toFixed(1)}px`);
      pumpkin.style.setProperty('--pumpkin-look-y', `${(random() * 2 - 1).toFixed(1)}px`);
      scheduleGlance();
    }, 1700 + random() * 2600);
  }
  function scheduleMouth() {
    mouthTimer = setTimeout(() => {
      if (pumpkin.hidden || !animate()) return;
      if (pumpkin.classList.contains('is-clacking')) { scheduleMouth(); return; }
      pumpkin.classList.add('is-gaping');
      closeMouthTimer = setTimeout(() => pumpkin.classList.remove('is-gaping'), 1500);
      scheduleMouth();
    }, 70000 + random() * 60000);
  }
  function updateAnimation() {
    clearAnimation();
    if (!pumpkin.hidden && animate()) {
      scheduleBlink(); scheduleGlance(); scheduleMouth(); scheduleDrool(); scheduleClack();
    }
  }
  function scheduleClack() {
    clackTimer = setTimeout(() => {
      if (pumpkin.hidden || !animate()) return;
      if (!pumpkin.classList.contains('is-gaping')) {
        pumpkin.classList.add('is-clacking');
        clackEndTimer = setTimeout(() => pumpkin.classList.remove('is-clacking'), 1200);
      }
      scheduleClack();
    }, 90000 + random() * 70000);
  }
  function scheduleDrool() {
    droolTimer = setTimeout(() => {
      if (pumpkin.hidden || !animate()) return;
      pumpkin.classList.add('is-drooling');
      droolEndTimer = setTimeout(() => pumpkin.classList.remove('is-drooling'), 2300);
      scheduleDrool();
    }, 120000 + random() * 90000);
  }
  function hide() {
    pumpkin.hidden = true;
    cancelAnimationFrame(frame); frame = null;
    clearAnimation();
  }
  function move(event) {
    if (event.pointerType !== 'mouse' || document.hidden || document.pointerLockElement) { hide(); return; }
    point = { x: event.clientX, y: event.clientY };
    if (frame != null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      const x = point.x + 48 > innerWidth ? point.x - 46 : point.x + 14;
      const y = point.y + 62 > innerHeight ? point.y - 58 : point.y + 14;
      pumpkin.style.transform = `translate3d(${Math.max(0, x)}px, ${Math.max(0, y)}px, 0)`;
      if (pumpkin.hidden) { pumpkin.hidden = false; updateAnimation(); }
    });
  }
  function pointerDown(event) { if (event.pointerType !== 'mouse') hide(); }
  let lastMotion = animate();
  function motionChanged() {
    const next = animate();
    if (next !== lastMotion) { lastMotion = next; updateAnimation(); }
  }
  const prefsObserver = new MutationObserver(motionChanged);
  prefsObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('pointermove', move, { passive: true });
  document.addEventListener('pointerdown', pointerDown, { passive: true });
  document.documentElement.addEventListener('pointerleave', hide);
  window.addEventListener('blur', hide);
  window.addEventListener('resize', hide);
  document.addEventListener('visibilitychange', hide);
  document.addEventListener('pointerlockchange', hide);
  motion.addEventListener('change', motionChanged);
  return () => {
    hide(); prefsObserver.disconnect();
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerdown', pointerDown);
    document.documentElement.removeEventListener('pointerleave', hide);
    window.removeEventListener('blur', hide);
    window.removeEventListener('resize', hide);
    document.removeEventListener('visibilitychange', hide);
    document.removeEventListener('pointerlockchange', hide);
    motion.removeEventListener('change', motionChanged);
    pumpkin.remove();
  };
}
