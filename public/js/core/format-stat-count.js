// Shared count formatting for Stats for Nerds and admin statistic cards.
// Increase compact-number precision with each K/M/B/T tier.
const COMPACT_SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
const fmtCompact = n => {
  n = Number(n) || 0;
  const neg = n < 0;
  let v = Math.abs(n);
  let tier = 0;
  while (v >= 1000 && tier < COMPACT_SUFFIXES.length - 1) { v /= 1000; tier++; }
  // Rounding can push e.g. 999.999 -> "1000.0" at the current tier - bump to
  // the next tier when that happens so we never show a 4-digit leading value.
  if (tier > 0 && tier < COMPACT_SUFFIXES.length - 1 && Number(v.toFixed(tier)) >= 1000) {
    v /= 1000;
    tier++;
  }
  const str = tier === 0 ? Math.round(v).toLocaleString() : v.toFixed(tier);
  return (neg ? '-' : '') + str + COMPACT_SUFFIXES[tier];
};
// Compact all counts above 10,000.
export function formatStatCount(n) {
  const num = Number(n) || 0;
  return Math.abs(num) >= 10000 ? fmtCompact(num) : num.toLocaleString();
}
