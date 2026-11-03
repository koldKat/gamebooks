// Persist isolated Sagard fights and once-only results in the current playthrough.
import {validateSagardEncounterFight} from './encounter.js';

export const emptySagardState = () => ({rulesVersion: 1, setup: {}, opponentSetup: [], allySetup: [], fight: null, history: []});

export function validateSagardState(state) {
  if (state?.rulesVersion !== 1 || !state.setup || !Array.isArray(state.opponentSetup) || !Array.isArray(state.allySetup)
      || !Array.isArray(state.history)) throw new RangeError('Invalid saved Sagard state');
  if (state.fight) validateSagardEncounterFight(state.fight);
  let previous = -1;
  for (const entry of state.history) {
    if (!['win', 'loss'].includes(entry.outcome) || !Number.isSafeInteger(entry.ts) || entry.ts <= previous
        || !Number.isSafeInteger(entry.rounds) || entry.rounds < 1) throw new RangeError('Invalid Sagard history');
    previous = entry.ts;
  }
  return state;
}

export function rememberSagardFight(state, now = Date.now()) {
  validateSagardState(state);
  const fight = state.fight;
  if (!fight) return state;
  if (fight.kind === 'naval') state.setup.shipHp = fight.ship.hp;
  else {
    Object.assign(state.setup, {hp: fight.hero.hp, level: fight.baseHeroLevel ?? fight.hero.level, shield: fight.hero.shield,
      fang: fight.healing.fang, moss: fight.healing.moss});
    if (Object.hasOwn(fight.healing, 'spiritLuck')) state.setup.spiritLuck = fight.healing.spiritLuck;
    if (fight.stunStone) {state.setup.stunStone = fight.stunStone.held; state.setup.stunStoneBroken = fight.stunStone.broken;}
    if (fight.kind === 'beast') state.setup.crewRemaining = fight.crewRemaining;
  }
  if (fight.ammo) {state.setup.ammo = structuredClone(fight.ammo); state.setup.dahliaOil = fight.dahliaOil;}
  if (Object.hasOwn(fight, 'magicDaggerPower')) state.setup.magicDaggerPower = fight.magicDaggerPower;
  if (Object.hasOwn(fight, 'saltBags')) state.setup.saltBags = fight.saltBags;
  if (fight.monkeys) state.setup.monkeyWhistle = fight.monkeys.held;
  if (['win', 'loss'].includes(fight.status) && !fight.recorded) {
    if (!Number.isSafeInteger(now) || now < 0) throw new RangeError('Invalid combat time');
    fight.recorded = true;
    state.history.push({enemy: fight.encounter.name || 'Custom encounter', section: String(fight.encounter.section ?? 'custom'),
      outcome: fight.status, rounds: fight.round, ts: Math.max(now, (state.history.at(-1)?.ts ?? 0) + 1)});
  }
  return state;
}

export function createSagardState(getContext) {
  const context = () => {
    const ctx = getContext();
    return ctx?.run && Number(ctx.bookId) === ctx.definition.id ? ctx : null;
  };
  function snapshot() {
    const ctx = context();
    if (!ctx) return null;
    const state = structuredClone(ctx.run[ctx.definition.stateKey] ?? emptySagardState());
    validateSagardState(state);
    return {run: ctx.run, original: ctx.run[ctx.definition.stateKey], state};
  }
  function update(change, token = snapshot()) {
    let ctx = context();
    if (!ctx || !token || token.run !== ctx.run || token.original !== ctx.run[ctx.definition.stateKey]) return false;
    const next = change(structuredClone(token.state));
    if (!next) return false;
    rememberSagardFight(next); ctx = context();
    if (!ctx || token.run !== ctx.run || token.original !== ctx.run[ctx.definition.stateKey]) return false;
    ctx.run[ctx.definition.stateKey] = next; ctx.saveState(); return true;
  }
  return {snapshot, update};
}
