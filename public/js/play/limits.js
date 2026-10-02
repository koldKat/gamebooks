// limits.js - Internal play-screen module; use ../play.js externally.

import { currentUserLevel, bonusUndos, bonusFastTravels } from '../core/state.js';

export function maxUndos() {
  const lvl  = currentUserLevel || 0;
  const base = lvl <= 30 ? 3 : Math.min(10, 3 + Math.ceil((lvl - 30) / 10));
  return base + (bonusUndos || 0);
}

export function maxFastTravels() {
  const lvl  = currentUserLevel || 0;
  const base = lvl <= 30 ? 3 : Math.min(10, 3 + Math.ceil((lvl - 30) / 10));
  return base + (bonusFastTravels || 0);
}
