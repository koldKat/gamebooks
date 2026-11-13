// limits.js - Internal play-screen module; use ../play.js externally.

import { currentUserLevel, bonusUndos, bonusFastTravels } from '../core/state.js';

export function maxUndos() {
  const lvl  = currentUserLevel || 0;
  const base = Math.min(10, Math.max(3, Math.floor(lvl / 10)));
  return base + Math.min(10, bonusUndos || 0);
}

export function maxFastTravels() {
  const lvl  = currentUserLevel || 0;
  const base = Math.min(10, Math.max(3, Math.floor(lvl / 10)));
  return base + Math.min(10, bonusFastTravels || 0);
}
