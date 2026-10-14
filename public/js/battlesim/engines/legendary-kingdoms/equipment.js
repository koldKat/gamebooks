import { legendaryInteger } from './character.js';

export function legendaryArmourParts(hero, supplied) {
  const parts = supplied ?? hero.armourBreakdown ?? (hero.armour === 0 ? {body:0,shield:0,magic:0} : undefined);
  if (!parts) throw new RangeError('Separate worn armour, shield and magical Armour before this fight');
  for (const key of ['body','shield','magic']) legendaryInteger(parts[key]);
  if (parts.body + parts.shield + parts.magic !== hero.armour)
    throw new RangeError('The Armour breakdown must equal the current Armour score');
  return {...parts};
}

export function legendaryCombatHero(fight, index) {
  const hero = fight.party[index];
  if (fight.rules.capturedEquipment) return {
    ...hero, armour: fight.rules.armourParts[index].body,
    armed: fight.rules.capturedEquipment === 'knife', weaponBonus:0,
    bonuses:Object.fromEntries(Object.keys(hero.bonuses).map(key => [key,0])),
    attackDieBonus:0,spellDamageBonus:0,stonecutterSword:false,magicalWeapon:false,
    skeletonHealth:0,healingPotions:0,invulnerabilityPotions:0,invulnerable:false,
  };
  if (fight.rules.noShield) return {...hero,armour:hero.armour - fight.rules.armourParts[index].shield};
  if (fight.rules.borrowedWeapon) return {...hero,armed:true,weaponBonus:0,twoHanded:true,
    stonecutterSword:false,magicalWeapon:false};
  return hero;
}

export function restoreLegendaryCombatGear(fight, index, character) {
  const original = fight.party[index];
  if (fight.rules.capturedEquipment) return {...original,health:character.health};
  if (fight.rules.noShield) return {...character,armour:original.armour};
  if (fight.rules.borrowedWeapon) {
    const restored = {...character};
    for (const key of ['armed','weaponBonus','twoHanded','stonecutterSword','magicalWeapon']) {
      if (Object.hasOwn(original,key)) restored[key] = original[key];
      else delete restored[key];
    }
    return restored;
  }
  return character;
}

export function erodeLegendaryArmour(fight, index, damage, order) {
  if (!damage.dice.length) return;
  const parts = fight.rules.armourParts[index];
  const available = {...parts,spell:fight.armourBonuses[index]};
  const types = Object.keys(available).filter(key => available[key] > 0);
  order ??= types.length === 1 ? Array(damage.dice.length).fill(types[0]) : undefined;
  if (!Array.isArray(order) || order.length !== damage.dice.length)
    throw new RangeError('Allocate each Armour save die to worn armour, shield, magic or spell protection');
  const used = {};
  for (const type of order) {
    if (!Object.hasOwn(available,type) || (used[type] = (used[type] ?? 0) + 1) > available[type])
      throw new RangeError('The Armour save allocation exceeds that protection');
  }
  let eroded = 0;
  damage.dice.forEach((die, dieIndex) => {
    const type = order[dieIndex];
    if (die >= 4 && ['body','shield'].includes(type)) { parts[type]--;eroded++; }
  });
  const hero = fight.party[index];
  hero.armour -= eroded;
  hero.armourBreakdown = {...parts};
  fight.log = [...fight.log.slice(-59),{round:fight.round,type:'armourErosion',memberIndex:index,
    eroded,remaining:{...parts},order:[...order]}];
}
