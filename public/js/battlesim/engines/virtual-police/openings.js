import { policeInteger } from './core.js';
import { POLICE_RULES } from './roster.js';

function die(roll, dice) {
  const value = policeInteger(roll(), 1, 6);
  dice.push(value);
  return value;
}
export function policeHunt({ shooting, weaponAttack, speed, animalSpeed, damage, animalLife, level = 1 }, roll = () => Math.floor(Math.random() * 6) + 1) {
  for (const value of [shooting, weaponAttack, speed, animalSpeed, damage]) policeInteger(value);
  if (animalLife !== undefined) policeInteger(animalLife, 1);
  policeInteger(level, 1, 6);
  const dice = [], hit = shooting + weaponAttack + speed > animalSpeed + level * 2;
  if (animalLife === undefined) return { hit, skin: hit, dice };
  const life = Math.max(0, animalLife - (hit ? damage : 0));
  if (life === 0) return { hit, life, skin: true, fights: false, dice };
  const result = die(roll, dice);
  return { hit, life, skin: false, fights: result % 2 === 0, dice };
}
export function policeDragonOpening(enemy, { kind, lines, level = 1, archers = [], shooting,
  harpoonDamage = POLICE_RULES.dragon.harpoon.damage, spellStrength, spellProtection, eligibleSpell = false } = {}, roll = () => Math.floor(Math.random() * 6) + 1) {
  const dragon = structuredClone(enemy), dice = [];
  for (const key of ['attack', 'defence', 'life']) policeInteger(dragon[key], key === 'life' ? 1 : 0);
  policeInteger(level, 1, 6);
  let damage = 0;
  if (kind === 'ground') {
    if (!Array.isArray(lines) || lines.length !== 2) throw new RangeError('First two lines required');
    let attack = 0, potential = 0;
    for (const line of lines) {
      policeInteger(line.count, 1, 3);
      if (!['warrior', 'archer', 'mage'].includes(line.type)) throw new RangeError('Invalid line type');
      const profile = POLICE_RULES.dragon.allies[line.type];
      attack += line.type === 'warrior' ? policeInteger(line.attack) : line.count * profile.attack;
      potential += line.type === 'warrior' ? policeInteger(line.damage) : line.count * profile.damage;
    }
    if (attack > dragon.defence) damage = potential;
  } else if (kind === 'arrows') {
    for (const archer of archers) if (policeInteger(archer) + die(roll, dice) > level * 2) damage += POLICE_RULES.dragon.allies.archer.damage;
  } else if (kind === 'harpoon') {
    policeInteger(shooting); policeInteger(harpoonDamage);
    if (shooting >= POLICE_RULES.dragon.harpoon.shootingMin) {
      damage = harpoonDamage;
      dragon.attack = Math.max(0, dragon.attack - POLICE_RULES.dragon.harpoon.penalty);
      dragon.defence = Math.max(0, dragon.defence - POLICE_RULES.dragon.harpoon.penalty);
    }
  } else if (kind === 'magic') {
    // Section 138's operator is unclear; require the user's resolved protection.
    if (!eligibleSpell) throw new RangeError('Fire and summoning spells are blocked');
    if (policeInteger(spellStrength) > policeInteger(spellProtection)) damage = POLICE_RULES.dragon.magicDamage;
  } else throw new RangeError('Unknown opening');
  dragon.life = Math.max(0, dragon.life - damage);
  return { enemy: dragon, damage, dice, status: dragon.life === 0 ? 'win' : 'fighting' };
}
