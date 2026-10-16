import { dice, die, integer, newCharacter, RULES_REVISION, validateCharacter } from '../../engines/space-assassin/core.js';

export function rollCharacter(roll = die) {
  return { ...newCharacter(roll), equipmentBudget: dice(1, roll), loadoutPurchased: false,
    weapon: 'unarmed', gravityBombs: 0, nerveGas: 0, energyBars: 0 };
}

export function buyLoadout(character, { weapon, grenades = 0, gravityBombs = 0, armour = 0 }) {
  validateCharacter(character, true);
  if (character.loadoutPurchased || !['lash', 'blaster'].includes(weapon)) throw new RangeError('Choose a starting weapon');
  integer(character.equipmentBudget, 1, 6);
  integer(grenades, 0, 6);
  integer(gravityBombs, 0, 2);
  integer(armour, 0, 12);
  const halfPoints = (weapon === 'lash' ? 2 : 6) + grenades * 2 + gravityBombs * 6 + armour;
  if (halfPoints > character.equipmentBudget * 2) throw new RangeError('Equipment exceeds rolled budget');
  const player = structuredClone(character);
  player.weapon = weapon;
  player.grenades += grenades;
  player.gravityBombs = (player.gravityBombs ?? 0) + gravityBombs;
  player.armour += armour;
  player.armourInitial += armour;
  player.loadoutPurchased = true;
  player.equipmentSpent = halfPoints / 2;
  return player;
}

function precombat(original, sections) {
  if (!original || original.rulesRevision !== RULES_REVISION || original.outcome || original.rounds
      || original.openingPending || !sections.includes(original.encounterSection)) throw new RangeError('Item cannot be used now');
  validateCharacter(original.player, true);
  return structuredClone(original);
}

export function useNerveGas(original, roll = die) {
  const fight = precombat(original, [108, 312]);
  integer(fight.player.nerveGas, 1);
  fight.player.nerveGas--;
  if (fight.encounterSection === 312) {
    fight.events.push({ kind: 'gas', failed: true, damage: 0 });
  } else {
    const damage = dice(1, roll);
    for (const enemy of fight.enemies) enemy.stamina = Math.max(0, enemy.stamina - damage);
    fight.events.push({ kind: 'gas', failed: false, damage });
    if (fight.enemies.every(enemy => !enemy.stamina)) fight.outcome = 'win';
  }
  fight.events = fight.events.slice(-160);
  return fight;
}

export function useGravityBomb(original) {
  const fight = precombat(original, [267]);
  integer(fight.player.gravityBombs, 1);
  fight.player.gravityBombs--;
  for (const enemy of fight.enemies) enemy.stamina = 0;
  fight.outcome = 'win';
  fight.events.push({ kind: 'gravityBomb' });
  fight.events = fight.events.slice(-160);
  return fight;
}

export function replaceSuit(character) {
  validateCharacter(character, true);
  if (character.replacementSuitEquipped) throw new RangeError('Replacement suit already equipped');
  const player = structuredClone(character);
  player.armour = 14;
  player.skill = Math.max(0, player.skill - 1);
  player.replacementSuitEquipped = true;
  return player;
}

export function eatEnergyBar(character) {
  validateCharacter(character, true);
  integer(character.energyBars, 1);
  if (character.stamina >= character.staminaInitial) throw new RangeError('No recovery needed');
  const player = structuredClone(character);
  player.energyBars--;
  player.stamina = Math.min(player.staminaInitial, player.stamina + 5);
  return player;
}
