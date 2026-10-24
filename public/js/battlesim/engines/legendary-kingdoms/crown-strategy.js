import { legendaryInteger } from './character.js';
import { startLegendaryNaval } from './naval.js';
import { startLegendaryArmy } from './army.js';

export let CROWN_ARMIES = Object.freeze({});
export let CROWN_NAVAL = Object.freeze({});
export function installCrownStrategy(armies, naval) {
  CROWN_ARMIES = armies;
  CROWN_NAVAL = naval;
}

export function startCrownArmy(player, section) {
  legendaryInteger(section,1);
  const battle = Object.hasOwn(CROWN_ARMIES,section) && CROWN_ARMIES[section];
  if (!battle) throw new RangeError('Choose a Crown & Tower army battle');
  if (battle.pendingRules) throw new RangeError('Army rules pending: ' + battle.pendingRules);
  if (!Array.isArray(player) || player.some(row => !Array.isArray(row))) throw new RangeError('Choose an army formation');
  for (const troop of player.flat().filter(Boolean)) {
    if (troop.garrison !== battle.garrison || !['infantry','cavalry','missile','longbow'].includes(troop.type))
      throw new RangeError('Choose troop types and units from the required garrison');
  }
  if (section === 349 && player[1]?.some(troop => troop.name === 'Mounted Sergeants'))
    throw new RangeError('Mounted Sergeants cannot operate the ram in the Centre');
  const {enemy,...rules} = battle;
  return startLegendaryArmy(player,enemy,{section,...rules});
}

export function startCrownNaval(ship, section) {
  legendaryInteger(section,1);
  const battle = Object.hasOwn(CROWN_NAVAL,section) && CROWN_NAVAL[section];
  if (!battle) throw new RangeError('Choose a Crown & Tower ship battle');
  const {name,fighting,health,...rules} = battle;
  return startLegendaryNaval(ship,{name,fighting,health},{section,...rules,uncappedAttack:true});
}
