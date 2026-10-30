// Validate personnel combat values and apply casualties within one optional encounter.
import { combatCommandHits } from './core.js';
import { pendingPersonnelReinforcements, waitingPersonnelObjective } from './personnel-timing.js';

export const personnelCopy = value => structuredClone(value);
export function personnelInteger(value, min = 0, max = 1000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
}
export function personnelChart(chart, shift = 0) {
  if (!/^[A-G]$/.test(chart)) throw new RangeError('Choose a combat chart');
  personnelInteger(shift, -6, 6);
  return String.fromCharCode(Math.max(65, Math.min(71, chart.charCodeAt(0) + shift)));
}
export function personnelForce(value) {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new RangeError('Enter a combat force');
  const keys = new Set();
  return value.map(input => {
    if (!input || typeof input.key !== 'string' || !input.key || keys.has(input.key)
        || typeof input.name !== 'string' || !input.name.trim()) throw new RangeError('Invalid combat unit');
    keys.add(input.key);
    const unit = personnelCopy(input);
    for (const key of ['count', 'ordnance', 'stealth', 'morale']) personnelInteger(unit[key]);
    if (unit.initialCount !== undefined) personnelInteger(unit.initialCount);
    if (unit.melee !== null) personnelInteger(unit.melee);
    if (unit.charges !== undefined) personnelInteger(unit.charges);
    if (unit.chargeAttack) { personnelInteger(unit.chargeAttack.strength); personnelChart(unit.chargeAttack.chart); }
    if (unit.extraAttack) { personnelInteger(unit.extraAttack.strength); personnelChart(unit.extraAttack.chart); }
    if (unit.lossMorale) {
      personnelInteger(unit.lossMorale.lossesOver);
      if (!['once', 'each-round'].includes(unit.lossMorale.frequency)) {
        throw new RangeError('Choose how often to check this unit’s casualty morale rule');
      }
      if (!['fled', 'surrendered'].includes(unit.lossMorale.outcome)) throw new RangeError('Invalid morale outcome');
    }
    return unit;
  });
}
export const personnelLiving = units => units.filter(u => u.count > 0 && !u.retired);
export const personnelManpower = units => units.reduce((sum, unit) => sum + unit.count, 0);
export function personnelDice(total, count = 2, roll = () => Math.floor(Math.random() * 6) + 1) {
  personnelInteger(count, 1, 2);
  if (total !== undefined && total !== null) return { total: personnelInteger(total, count, count * 6), dice: [], manual: true };
  const dice = Array.from({ length: count }, () => personnelInteger(roll(6), 1, 6));
  return { total: dice.reduce((sum, v) => sum + v, 0), dice, manual: false };
}
export function personnelHits(charts, chart, strength, total) {
  personnelInteger(strength, 0, Number.MAX_SAFE_INTEGER);
  return combatCommandHits(charts, chart, Math.min(strength, 1000000), total);
}
export function personnelFinish(fight, status) {
  fight.status = status;
  fight.phase = 'finished';
  fight.pending = null;
  fight.queue = [];
  fight.section = fight.config[status] == null ? null : String(fight.config[status]);
  if (fight.config.rules.temporaryLosses && status !== 'cancelled') {
    fight.endPlayer = personnelCopy(fight.player);
    for (const unit of fight.player) unit.count = fight.startPlayer.find(u => u.key === unit.key).count;
    fight.restoredTemporaryLosses = true;
  }
}
export function personnelOutcome(fight) {
  if (fight.status !== 'fighting') return true;
  const rules = fight.config.rules;
  if (fight.player.some(unit => unit.essential && (!unit.count || unit.retired))
      || rules.frontEssential && !fight.player[0].count || !personnelLiving(fight.player).length) {
    personnelFinish(fight, 'loss');
  } else if (!rules.fixedAttack && !personnelLiving(fight.enemies).length
      && !pendingPersonnelReinforcements(fight) && !waitingPersonnelObjective(fight)) {
    personnelFinish(fight, 'win');
  }
  return fight.status !== 'fighting';
}
export function personnelDamage(fight, side, hits, attack) {
  personnelInteger(hits);
  let targets = personnelLiving(side === 'player' ? fight.player : fight.enemies);
  if (side === 'enemy') targets = targets.filter(unit => unit.key === attack.target);
  else if (fight.config.rules.leadLossesOnly) targets = targets.slice(0, 1);
  for (const unit of targets) {
    const removed = Math.min(hits, unit.count);
    if (removed) attack.losses.push({ key: unit.key, name: unit.name, count: removed });
    unit.count -= removed;
    hits -= removed;
    if (!hits) break;
  }
  personnelOutcome(fight);
}
export function personnelAt(changes, base, round) {
  let value = base;
  for (const [start, next] of Object.entries(changes ?? {}).sort(([a], [b]) => Number(a) - Number(b))) {
    if (round >= Number(start)) value = next;
  }
  return value;
}
