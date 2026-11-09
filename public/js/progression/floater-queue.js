// Schedule personal and admin reward chips, sharing one lane on mobile.
import { floatiesEnabled } from './floaties.js';
import { waitForCameraIdle } from '../graph/camera-motion.js';

const pendingFloaters = [];
const activeFloaters = new Map();
const mobileFloaters = window.matchMedia?.('(max-width: 768px)');

function floaterLayer(channel) {
  return document.getElementById(mobileFloaters?.matches || channel === 'personal'
    ? 'reward-float-layer' : 'app-reward-float-layer');
}

function drainFloaters() {
  if (!floatiesEnabled() || !pendingFloaters.length) return;
  if (waitForCameraIdle(drainFloaters)) return;
  while (pendingFloaters.length) {
    if (mobileFloaters?.matches && activeFloaters.size) return;
    const index = pendingFloaters.findIndex(item => !activeFloaters.has(item.channel));
    if (index < 0) return;
    const item = pendingFloaters.splice(index, 1)[0];
    const layer = floaterLayer(item.channel);
    if (!layer) continue;
    const chip = document.createElement('div');
    const prefix = item.channel === 'admin' ? 'app-reward-float' : 'reward-float';
    chip.className = `${prefix} ${prefix}--${item.type}`;
    chip.innerHTML = item.html;
    layer.appendChild(chip);
    const timer = setTimeout(() => {
      chip.remove();
      activeFloaters.delete(item.channel);
      drainFloaters();
    }, 5000);
    activeFloaters.set(item.channel, { item, chip, timer });
  }
}

export function enqueueRewardFloater(channel, type, html) {
  if (!floatiesEnabled()) return;
  pendingFloaters.push({ channel, type, html });
  drainFloaters();
}

export function clearRewardFloaters(channel) {
  for (let i = pendingFloaters.length - 1; i >= 0; i--) {
    if (!channel || pendingFloaters[i].channel === channel) pendingFloaters.splice(i, 1);
  }
  for (const [key, active] of activeFloaters) {
    if (channel && key !== channel) continue;
    clearTimeout(active.timer);
    active.chip.remove();
    activeFloaters.delete(key);
  }
  drainFloaters();
}

window.addEventListener('floaties-change', () => {
  if (!floatiesEnabled()) clearRewardFloaters();
});

mobileFloaters?.addEventListener('change', () => {
  if (!floatiesEnabled()) return;
  // A desktop pair becomes one active chip and one queued chip on mobile.
  let first = true;
  for (const [channel, active] of activeFloaters) {
    if (mobileFloaters.matches && !first) {
      clearTimeout(active.timer);
      active.chip.remove();
      activeFloaters.delete(channel);
      pendingFloaters.unshift(active.item);
    } else {
      floaterLayer(channel)?.appendChild(active.chip);
    }
    first = false;
  }
  drainFloaters();
});
