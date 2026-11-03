// Render and bind declared Sagard naval, group and combat-item action controls.
import {resolveSagardEncounter} from './encounter.js';
import {grappleSagardFight, canUseSagardDagger} from './core.js';
import {useSagardEncounterStone, sagardMeleeFight, useSagardEncounterDagger} from './actions.js';
import {blowSagardWhistle, canBlowSagardWhistle} from './forces.js';
import {withdrawSagardNaval} from './naval.js';
import {switchSagardStrategy} from './strategy.js';

export const sagardEncounterActors = fight => !fight ? [] : fight.kind === 'naval'
  ? [{id: 'ship', name: fight.ship.name}, ...fight.opponents]
  : fight.kind === 'beast' ? [fight.hero, {id: 'monster', name: fight.monster.name}]
    : fight.kind === 'forces' ? [fight.hero, ...(fight.duel?.opponents ?? []), {id: 'crew', name: 'Human crew'}, {id: 'monkeys', name: 'Monkey reinforcements'}]
      : [fight.hero, ...fight.allies, ...fight.opponents];

export function sagardExtraActionsMarkup(id) {
  const button = (key, text) => `<button type="button" class="bsim-action-btn" id="${id}-${key}">${text}</button>`;
  return `<div class="bsim-btn-row" id="${id}-naval-actions" hidden>${button('ram', 'Ram')}${button('missile', 'Missile fire')}${button('board', 'Board')}</div>
    <div class="bsim-btn-row" id="${id}-force-actions" hidden>${button('duel', 'Individual duel')}${button('volley', 'Group volley')}</div>
    <label class="inv-edit-row" id="${id}-allocation-row" hidden><span>Damage to this target</span><input class="inv-edit-input" id="${id}-amount" type="number" min="1" max="1" step="1" value="1"></label>
    <div class="bsim-btn-row" id="${id}-strategy-actions" hidden>${button('strategy-normal', 'Fight the demon')}${button('strategy-pendant', 'Break the pendant')}</div>
    <div class="bsim-btn-row" id="${id}-dagger-actions" hidden>${button('dagger-damage', 'Strike with magic dagger')}${button('dagger-destroy', 'Expend dagger to destroy foe')}</div>
    <div class="bsim-btn-row">${button('whistle', 'Blow monkey whistle')}</div>
    <div class="bsim-btn-row">${button('grapple', 'Try grappling (4)')}${button('stone', 'Use stun stone')}${button('skip-lamp', 'Keep fighting')}${button('naval-withdraw', 'Break off attack')}</div>`;
}

export function createSagardTurnExtras({el, action, die}) {
  for (const mode of ['damage', 'destroy']) el('dagger-' + mode).addEventListener('click', () => action(state => {
    state.fight = useSagardEncounterDagger(state.fight, {mode, target: el('target').value || undefined}); return state;
  }));
  el('whistle').addEventListener('click', () => action(state => {
    state.fight = blowSagardWhistle(state.fight); return state;
  }));
  for (const mode of ['normal', 'pendant']) el('strategy-' + mode).addEventListener('click', () => action(state => {
    state.fight = switchSagardStrategy(state.fight, mode); return state;
  }));
  for (const decision of ['ram', 'missile', 'board', 'duel', 'volley']) el(decision).addEventListener('click', () => action(state => {
    state.fight = resolveSagardEncounter(state.fight, null, {decision}); return state;
  }));
  for (const [key, resolve] of Object.entries({grapple: grappleSagardFight, stone: useSagardEncounterStone})) {
    el(key).addEventListener('click', () => action(state => {state.fight = resolve(state.fight, die(state)); return state;}));
  }
  el('skip-lamp').addEventListener('click', () => action(state => {
    state.fight = resolveSagardEncounter(state.fight, null, {decision: 'skip'}); return state;
  }));
  el('naval-withdraw').addEventListener('click', () => action(state => {
    state.fight = withdrawSagardNaval(state.fight); return state;
  }));
  return {render(fight, turn) {
    const melee = sagardMeleeFight(fight);
    el('dagger-actions').hidden = !fight?.rules?.magicDagger;
    el('dagger-damage').disabled = !canUseSagardDagger(melee);
    const target = melee?.opponents.find(row => row.id === el('target').value);
    el('dagger-destroy').disabled = !canUseSagardDagger(melee) || !target || target.immortal
      || !Number.isInteger(target.level) || target.level > melee.rules.magicDagger.defeatsLevelAtMost;
    el('whistle').hidden = !fight?.monkeys;
    el('whistle').disabled = !canBlowSagardWhistle(fight);
    el('strategy-actions').hidden = !fight?.strategy;
    for (const mode of ['normal', 'pendant']) el('strategy-' + mode).disabled = fight?.status !== 'fighting'
      || fight?.phase !== 'round' || fight?.strategy?.mode === mode || Boolean(fight?.projectileWindow);
    el('naval-actions').hidden = turn?.kind !== 'chooseAction';
    for (const key of ['ram', 'missile', 'board']) el(key).disabled = !turn?.actions?.includes(key);
    el('force-actions').hidden = turn?.kind !== 'chooseDuel';
    el('allocation-row').hidden = turn?.kind !== 'allocate';
    el('amount').max = turn?.pendingDamage ?? 1;
    el('amount').value = Math.max(1, Math.min(Number(el('amount').value), turn?.pendingDamage ?? 1));
    el('grapple').hidden = !(turn?.kind === 'attack' && turn.attackerId === 'hero' && melee?.encounter.grappleTarget);
    el('stone').hidden = !(turn && fight?.stunStone?.held && !fight.stunStone.broken
      && ((melee?.phase === 'round' && turn.kind === 'attack' && turn.attackerId === 'hero')
        || (fight?.kind === 'beast' && turn.kind === 'heroAttack')));
    el('skip-lamp').hidden = turn?.kind !== 'lamp';
    el('naval-withdraw').hidden = !turn?.canWithdraw;
  }};
}

export function sagardSpecialTurnLabel(turn) {
  return {pendant: `${turn?.attackerName}: attempt to break the pendant.`, pendantConfirm: `${turn?.attackerName}: confirm the pendant-breaking attempt.`,
    interferenceActivate: 'Check whether the demon intervenes this round.', interferenceTarget: 'Roll to determine the demon’s target.',
    interferenceDamage: 'Roll the demon’s damage.', jab: 'Resolve the next jab.', jabConfirm: 'Confirm whether the jab captures you.',
    enemyEscape: 'Check whether this opponent escapes.',
    chooseShip: 'Choose the ship to attack this round.', chooseAction: 'Choose ramming, missile fire or boarding.',
    ram: 'Roll for ramming.', ramConfirm: 'Resolve the enemy ramming attempt.', missileHero: 'Roll your ship’s missile damage.',
    enemyAttack: 'Resolve the next sea opponent’s attack.', boardHero: 'Roll for one of your boarding crew.',
    boardEnemy: 'Roll for one of the opposing boarding crew.', precheck: 'Check whether the galleon surrenders or tries to escape.',
    escapeCheck: 'Check whether the galleon escapes.', heroAttack: 'Resolve your attack.',
    allocate: `Allocate the remaining ${turn?.pendingDamage ?? 0} damage among surviving tentacles.`,
    chooseDuel: 'Choose an individual duel or begin the group volley.', enemyVolley: 'Roll for the next enemy in the volley.',
    allyVolley: 'Roll for the next surviving ally.', swallow: 'Check whether the monster can swallow you.',
    monkeyVolley: 'Roll for the next monkey reinforcement (kills on 3 or 4).',
    swallowConfirm: 'Confirm whether the monster swallows you.', digestion: 'Apply this round’s swallowed damage.',
    crewCasualties: 'Resolve the monster’s attack on your crew.', crewAttack: 'Roll for the next surviving crewman.',
    stoneConfirm: 'Check whether the stun stone shatters.', stoneAttack: 'Make a free attack while the monster is stunned.',
    lamp: 'Try to steal the lamp with a four, or keep fighting.'}[turn?.kind];
}
