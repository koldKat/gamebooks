// Present the player's pending fleet combat, loss, retreat and redistribution choices.
import { fleetBattleRound, resolveFleetBattleLosses, chooseFleetBattleSector, redistributeFleetBattle,
  waitFleetBattle, retreatFleetBattle } from './fleet-battle.js';
import { currentFleetPlayer, shipCount } from './fleet-opposition.js';
import { canLaunchFleetSpecial } from './fleet-tactics.js';
import { fleetBattleActive } from './fleet-state.js';
import { fleetNumber, fleetSelect, fleetButton, fleetCheck, fleetDistribution } from './fleet-form.js';

export function renderFleetControls({ document, holder, fight, dispatch }) {
  holder.replaceChildren();
  if (!fleetBattleActive(fight)) return;
  const button = (label, action) => fleetButton(document, holder, label, () => dispatch(action, fight));
  const optionalRoll = (parent, label, max = 12) => fleetNumber(document, parent, label,
    { min: max === 6 ? 1 : 2, max, optional: true });
  const readRolls = fields => {
    const values = fields.map(field => field.read());
    if (values.every(value => value === undefined)) return undefined;
    if (values.some(value => value === undefined)) throw new RangeError('Enter all rolls in this group, or leave all blank for automatic dice.');
    return values;
  };
  const details = label => {
    const block = document.createElement('details'), summary = document.createElement('summary');
    summary.textContent = label; block.appendChild(summary); holder.appendChild(block); return block;
  };
  if (fight.status === 'fighting') {
    const force = currentFleetPlayer(fight);
    let wing, special;
    if (fight.config.firingOrder === 'each-sector-in-order') wing = fleetSelect(document, holder, 'Firing wing in this sector',
      [{ value: '', label: 'Choose wing' }, ...['destroyer', 'battlecruiser'].filter(type => force.some(unit => unit.type === type && unit.count))
        .map(value => ({ value, label: value === 'destroyer' ? 'Destroyers' : 'Battlecruisers' }))]);
    if (canLaunchFleetSpecial(force, fight.config, fight.tactics)) special = fleetCheck(document, holder, 'Special attack: two volleys (once this battle)');
    const dice = details('Manual dice — leave blank to roll automatically');
    const player = optionalRoll(dice, 'Your volley: 2d6'), second = optionalRoll(dice, 'Special second volley: 2d6'), enemy = optionalRoll(dice, 'Enemy: 2d6');
    const morale = optionalRoll(dice, 'End-round Morale: 2d6');
    const block = fight.config.firingOrder === 'battlecruiser-first-d6-blocks' ? optionalRoll(dice, 'Firing-wing duration: 1d6', 6) : null;
    const reinforcement = Array.from({ length: fight.config.reinforcement?.dice ?? 0 }, (_, index) => optionalRoll(dice, `Reinforcements die ${index + 1}`, 6));
    button('Resolve next exchange', current => fleetBattleRound(current, {
      special: special?.checked ?? false, wing: wing?.value,
      playerRolls: readRolls(special?.checked ? [player, second] : [player]),
      enemyRoll: enemy.read(), moraleRoll: morale.read(), blockRoll: block?.read(),
      reinforcementDice: reinforcement.length ? readRolls(reinforcement) : undefined,
    }));
  }
  if (['awaiting-enemy-losses', 'awaiting-player-losses'].includes(fight.status)) {
    const pending = fight.exchange.pending, target = pending.side === 'player' ? fight.exchange.player : fight.exchange.enemy;
    const text = document.createElement('p'); text.textContent = `Allocate ${pending.hits} ${pending.side === 'player' ? 'incoming' : 'enemy'} hits. Existing damaged ships must be finished before fresh ships of the same type take damage.`;
    holder.appendChild(text);
    const fields = target.filter(unit => pending.keys.includes(unit.key) && unit.count).map(unit => ({ key: unit.key,
      field: fleetNumber(document, holder, `${unit.name} (${unit.count} ships${unit.damage ? `, ${unit.damage} damage` : ''})`,
        { value: 0, max: unit.count * unit.hitsPerShip - unit.damage }) }));
    button('Apply allocated hits', current => resolveFleetBattleLosses(current,
      Object.fromEntries(fields.map(({ key, field }) => [key, field.read()]).filter(([, hits]) => hits))));
  }
  if (fight.status === 'awaiting-sector') {
    const choice = fleetSelect(document, holder, 'Next enemy sector', [{ value: '', label: 'Choose sector' },
      ...fight.opposition.state.counts.flatMap((count, index) => count ? [{ value: index + 1, label: `Sector ${index + 1}: ${count} enemies` }] : [])]);
    button('Engage sector', current => chooseFleetBattleSector(current, Number(choice.value)));
  }
  if (['fighting', 'awaiting-redistribution'].includes(fight.status) && fight.opposition.kind === 'dispersed') {
    const sectors = fight.opposition.state.sectors, cleared = sectors.filter(sector => !sector.enemy && shipCount(sector.player));
    if (cleared.length) {
      const movement = details('Move survivors from a cleared sector (optional)');
      const source = fleetSelect(document, movement, 'Move ships from', cleared.map(sector => ({ value: sector.id, label: `Sector ${sector.id}` })), fight.freedSector ?? cleared[0].id);
      const grid = document.createElement('div'); movement.appendChild(grid); let distribution;
      function fill() {
        const origin = sectors.find(sector => sector.id === source.value); grid.replaceChildren();
        distribution = fleetDistribution(document, grid, origin.player,
          sectors.filter(sector => sector.id === origin.id || sector.enemy && shipCount(sector.player))
            .map(sector => ({ value: sector.id, label: sector.id === origin.id ? `Stay in sector ${sector.id}` : `Move to sector ${sector.id}` })));
      }
      fill(); source.addEventListener('change', fill);
      fleetButton(document, movement, 'Move allocated ships', () => dispatch(current => {
        const values = distribution.read();
        return redistributeFleetBattle(current, values.allocation, values.woundedDestination, source.value);
      }, fight));
    }
    if (fight.status === 'awaiting-redistribution') button('Keep ships here and continue', current => redistributeFleetBattle(current));
  }
  if (['awaiting-wave', 'awaiting-reserves', 'blocked-sectors'].includes(fight.status)) {
    button(fight.status === 'blocked-sectors' ? 'Wait to the printed combat limit' : 'Wait for combat reinforcements', current => waitFleetBattle(current));
  }
  if (fight.status === 'retreat-required' || fight.atRoundBoundary) {
    const retreat = details(fight.status === 'retreat-required' ? 'Morale failed — resolve retreat' : 'End-round withdrawal');
    if (fight.status === 'retreat-required') retreat.open = true;
    let morale, automatic;
    if (fight.config.retreat?.kind === 'morale-gated-voluntary' && fight.status !== 'retreat-required') morale = optionalRoll(retreat, 'Voluntary retreat Morale: 2d6');
    const stealth = fight.config.retreat?.kind === 'manual-stop' ? []
      : Array.from({ length: fight.config.retreat?.stealthAttempts ?? 1 }, (_, index) => optionalRoll(retreat, `Stealth attempt ${index + 1}: 2d6`));
    if (fight.config.retreat?.sourceAmbiguity && !fight.lastEnemyFired) automatic = fleetCheck(document, retreat, 'Use the printed automatic withdrawal interpretation after no enemy fire');
    fleetButton(document, retreat, fight.config.retreat?.kind === 'manual-stop' ? 'End encounter' : 'Attempt withdrawal', () => dispatch(current => retreatFleetBattle(current,
      { moraleRoll: morale?.read(), stealthRolls: stealth.length ? readRolls(stealth) : undefined,
        automaticNoEnemyFire: automatic?.checked ?? false }), fight));
  }
}
