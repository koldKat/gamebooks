import { legendaryInteger, legendaryDamage, validateLegendaryCharacter } from './character.js';

export function protectLegendaryHero(character, hits, { armourBonus = 0, noArmour = false,
  combat = true, attack = true, potionFirst = true } = {}, roll) {
  validateLegendaryCharacter(character, true);
  legendaryInteger(hits);
  legendaryInteger(armourBonus);
  const hero = { ...character };
  const potion = hero.invulnerable && attack && hits > 0;
  const escort = combat && hero.skeletonHealth > 0 && hits > 0;
  if (potion && (!escort || potionFirst)) {
    hero.invulnerable = false;
    return { character: hero, dice: [], prevented: 0, lost: 0, dead: false, protection: 'potion', absorbed: hits };
  }
  if (escort) {
    const lost = Math.min(hero.skeletonHealth, hits);
    hero.skeletonHealth -= lost;
    return { character: hero, dice: [], prevented: 0, lost: 0, dead: false,
      protection: 'skeleton', absorbed: hits, skeletonLost: lost };
  }
  const result = legendaryDamage({ ...hero, armour: hero.armour + armourBonus }, hits, { armour: combat && !noArmour }, roll);
  return { ...result, character: { ...result.character, armour: hero.armour } };
}
