// Retain fleet survivors and completed battle history independently of story state.
import { fleetBattlePlayers } from './fleet-battle.js';

const outcomes = new Set(['victory', 'defeat', 'withdrawn', 'stopped', 'support-arrived', 'time-limit', 'unengaged-enemies']);
export const fleetBattleActive = fight => Boolean(fight && !outcomes.has(fight.status));

export function createFleetPanelState(defaults) {
  return { encounter: '', custom: {}, playerForce: structuredClone(defaults.playerUnits),
    morale: defaults.morale, stealth: defaults.stealth, fight: null, history: [] };
}

export function fleetPanelForce(state, preset, defaults) {
  const template = preset?.playerAllowedTypes?.includes('fortress')
    ? [{ ...defaults.fortress, key: 'fortress', name: 'Orbital fortress', type: 'fortress' }]
    : !preset && state.custom?.player ? state.custom.player : defaults.playerUnits;
  const saved = new Map(state.playerForce.map(unit => [unit.key, unit]));
  return template.filter(unit => !preset?.playerAllowedTypes || preset.playerAllowedTypes.includes(unit.type))
    .map(unit => structuredClone(saved.get(unit.key) ?? unit));
}

export function storeFleetPanelBattle(previous, incoming, now = Date.now()) {
  const state = structuredClone(previous), fight = structuredClone(incoming);
  state.fight = fight;
  if (fleetBattleActive(fight) || fight.recorded) return state;
  // Sector fragments may contain several independently wounded ships mid-battle.
  // Only collapse them once the battle has ended and the engine has repaired survivors.
  const merged = new Map();
  for (const unit of fleetBattlePlayers(fight)) {
    if (unit.damage) throw new RangeError('Completed fleet battle still has unresolved damage');
    const key = unit.originKey ?? unit.key;
    if (!merged.has(key)) { const row = { ...unit, key, count: 0 }; delete row.originKey; merged.set(key, row); }
    merged.get(key).count += unit.count;
  }
  const remembered = new Map(state.playerForce.map(unit => [unit.key, unit]));
  for (const [key, unit] of merged) remembered.set(key, unit);
  state.playerForce = [...remembered.values()];
  fight.recorded = true;
  if (fight.round > 0) {
    const outcome = ['victory', 'support-arrived'].includes(fight.status) ? 'win'
      : ['defeat', 'time-limit'].includes(fight.status) ? 'loss' : fight.status;
    state.history.push({ enemy: fight.config.name ?? 'Custom fleet battle', outcome,
      result: fight.status, ts: Math.max(now, (state.history.at(-1)?.ts ?? 0) + 1) });
  }
  return state;
}
