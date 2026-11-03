// Save encounter snapshots and outcome history only within the active book's current playthrough.
import {groundPlayer, validateGroundFight} from './ground.js';
import {spacePlayer, validateSpaceFight} from './space.js';

export const twoFistedFightActive = fight => ['fighting', 'firefighting'].includes(fight?.status);
const copy = value => structuredClone(value);

export function emptyTwoFistedState() {
  return {rulesVersion: 1, player: null, setup: null, opponentSetup: [], encounter: '', fight: null, history: []};
}

export function validateTwoFistedState(state) {
  if (state?.rulesVersion !== 1 || !Array.isArray(state.history) || !Array.isArray(state.opponentSetup)) throw new RangeError('Invalid saved combat state');
  if (state.player) (state.player.ship ? spacePlayer : groundPlayer)(state.player);
  if (state.fight) (state.fight.mode === 'space' ? validateSpaceFight : validateGroundFight)(state.fight);
  let timestamp = -1;
  for (const entry of state.history) {
    if (!Number.isSafeInteger(entry.ts) || entry.ts <= timestamp || !['win', 'loss'].includes(entry.outcome)
        || !Number.isSafeInteger(entry.rounds) || entry.rounds < 0) throw new RangeError('Invalid combat history');
    timestamp = entry.ts;
  }
  return state;
}

export function recoveredTwoFistedPlayer(fight) {
  const player = copy(fight.mode === 'space' && fight.fireFight ? fight.fireFight.player : fight.player);
  if (fight.mode === 'space' && fight.fireFight) {
    player.ship = copy(fight.player.ship); player.trobble = copy(fight.player.trobble);
    if (!fight.roundAction.crewFire) player.copilot = copy(fight.player.copilot);
  }
  if (!twoFistedFightActive(fight)) {
    for (const actor of [player, player.copilot].filter(Boolean)) {
      actor.badgeActive = false; actor.traumaActive = false;
    }
    if (player.trobble && !player.trobble.discarded) player.trobble.inactive = false;
    player.nextAutomaticHeroWin = false;
  }
  return player;
}

export function rememberTwoFistedFight(state, now = Date.now()) {
  validateTwoFistedState(state);
  const fight = state.fight;
  if (!fight) return state;
  if (twoFistedFightActive(fight) || fight.playerSavedStatus !== fight.status || !state.player) state.player = recoveredTwoFistedPlayer(fight);
  fight.playerSavedStatus = fight.status;
  if (['win', 'loss'].includes(fight.status) && !fight.recorded) {
    if (!Number.isSafeInteger(now) || now < 0) throw new RangeError('Invalid history timestamp');
    fight.recorded = true;
    state.history.push({enemy: fight.encounter.label || 'Custom encounter', section: fight.encounter.section || 'custom',
      mode: fight.mode, outcome: fight.status, rounds: fight.round, ts: Math.max(now, (state.history.at(-1)?.ts ?? 0) + 1)});
  }
  return state;
}

export function cancelTwoFistedFight(original) {
  (original.mode === 'space' ? validateSpaceFight : validateGroundFight)(original);
  if (!twoFistedFightActive(original)) throw new RangeError('This encounter has already ended');
  const fight = copy(original); fight.status = 'cancelled';
  fight.player = recoveredTwoFistedPlayer(fight);
  fight.pending = null; fight.roundAction = null;
  if (fight.mode === 'space') {fight.fireFight = null; fight.volleys = []; fight.stage = 'ready';}
  else fight.queue = [];
  return fight;
}

export function createTwoFistedState(getContext) {
  function context() {
    const ctx = getContext();
    return ctx?.run && Number(ctx.bookId) === ctx.definition.id ? ctx : null;
  }
  function snapshot() {
    const ctx = context();
    if (!ctx) return null;
    const state = copy(ctx.run[ctx.definition.stateKey] ?? emptyTwoFistedState());
    validateTwoFistedState(state);
    return {run: ctx.run, original: ctx.run[ctx.definition.stateKey], state};
  }
  function update(change, token = snapshot()) {
    let ctx = context();
    if (!ctx || !token || ctx.run !== token.run || ctx.run[ctx.definition.stateKey] !== token.original) return false;
    const next = change(copy(token.state));
    if (!next) return false;
    rememberTwoFistedFight(next);
    ctx = context();
    if (!ctx || ctx.run !== token.run || ctx.run[ctx.definition.stateKey] !== token.original) return false;
    ctx.run[ctx.definition.stateKey] = next; ctx.saveState();
    return true;
  }
  return {snapshot, update};
}
