import { getToken } from '../core/state.js';

const KEY = 'reward_snapshot_v1';
let tokenForDigest = null, digestPromise = null;
const fields = new Set(['id', 'username', 'xp', 'level', 'title', 'levelXp', 'nextLevelXp',
  'coinsBalance', 'coinsSpent', 'coinsEarned', 'xpBoostPct', 'xpBoostPurchased', 'xpFromBoost',
  'bonusHeartbeatXp', 'bonusHeartbeatXpFree', 'bonusUndos', 'bonusFastTravels',
  'bronzeBalance', 'silverBalance', 'heartbeatGoldEarned']);

function digest(token) {
  if (token !== tokenForDigest) {
    tokenForDigest = token;
    digestPromise = Promise.resolve().then(() => crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))
      .then(bytes => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join(''));
  }
  return digestPromise;
}

export async function readRewardCache() {
  const token = getToken();
  if (!token) return null;
  try {
    const auth = await digest(token), cached = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    return getToken() === token && cached?.auth === auth ? cached.value : null;
  } catch (_) { return null; }
}

export async function saveRewardCache(data) {
  const token = getToken();
  if (!token) return;
  try {
    const auth = await digest(token);
    if (getToken() !== token) return;
    const value = Object.fromEntries(Object.entries(data).filter(([key]) => fields.has(key) || key.startsWith('diamond') || key.startsWith('rub')));
    sessionStorage.setItem(KEY, JSON.stringify({ auth, value }));
  } catch (_) {}
}

export function clearRewardCache() {
  try { sessionStorage.removeItem(KEY); } catch (_) {}
}
