// Apply only the printed encounter modifiers and combat recovery chosen by the player.
import { integer } from '../../engines/shinte/core.js';

export function encounterRules(preset, hero, options) {
  const styles = options.styles ?? {}, section = String(preset?.section ?? 'custom');
  const agility = integer(hero.agility), guile = integer(hero.guile);
  let first = options.first, csModifier = 0, dsModifier = 0, openingDamage = integer(options.openingDamage ?? 0);
  const has = key => styles[key] === true;
  switch (preset?.firstRule) {
    case 'player': first = 'player'; break;
    case 'enemy': first = 'enemy'; break;
    case 'snakeElseEnemy': first = has('snake') ? 'player' : 'enemy'; break;
    case '33': first = has('snake') || has('wolf') || has('tiger') || agility >= 9 ? 'player' : 'enemy'; break;
    case '162': first = has('snake') || has('wolf') || agility + guile >= 18 ? 'player' : 'enemy'; break;
    case 'snakeOr9': if (has('snake') || agility + Number(has('wolf')) >= 9) first = 'player'; break;
    case 'snakeOr10': if (has('snake') || agility + Number(has('wolf')) >= 10) first = 'player'; break;
    case 'snakeOr8': if (has('snake') || agility >= 8 || guile >= 8) first = 'player'; break;
    case 'horseOr8': if (has('horse') || agility >= 8 || guile >= 8) first = 'player'; break;
    case 'snake': if (has('snake')) first = 'player'; break;
    case 'poachers': first = options.ambush || has('snake') || has('wolf') ? 'player' : 'enemy'; break;
  }
  switch (preset?.modifierRule) {
    case 'rats': csModifier = has('horse') || has('tiger') ? 0 : -4; dsModifier = options.shinGuards ? 2 : 0; break;
    case 'duchess': csModifier = 4 + (has('horse') ? 2 : 0); break;
    case 'mountedPair': csModifier = 6 + (has('horse') ? 2 : 0); break;
    case 'allies': csModifier = 50; dsModifier = 50; break;
    case 'pursuit': csModifier = has('horse') ? -2 : -4; break;
    case 'mounted': csModifier = 4; break;
    case 'stealth': csModifier = 2 * Number(has('tiger')) + 2 * Number(has('wolf')) + (options.indigo ? 4 : 0);
      openingDamage = guile; first = 'player'; break;
  }
  if (!['player', 'enemy'].includes(first)) throw new RangeError('The book does not specify initiative here. Choose who attacks first.');
  return {section, first, csModifier, dsModifier, openingDamage, openingAttackSpent: preset?.modifierRule === 'stealth',
    receiver: section === '84' ? 'Duchess' : 'Tsai', receiverPP: section === '84' ? 20 : hero.pp,
    receiverMaxPP: section === '84' ? 20 : hero.maxPP,
    netAllowed: section === '84', netBonus: has('monkey') ? 1 : 0, turtleEligible: has('turtle'),
    retreatAllowed: section === 'custom' && options.retreatAllowed === true};
}

export function missileDamage(spec, weapon, quantity, hero, styles) {
  const row = spec?.[weapon];
  if (!row) throw new RangeError('Choose a printed missile weapon.');
  const count = integer(quantity, 1, row.maximum), agility = integer(hero.agility);
  const perWeapon = weapon === 'bow' && styles.eagle ? row.eagleDamage : row.damage;
  return agility + count * (integer(perWeapon) + (row.thrown && styles.monkey ? 1 : 0));
}

export function turtleRecovery(hero, fight, hasTurtle) {
  if (!hasTurtle || !fight?.turtleEligible || !fight.turns || fight.turtleUsed || fight.pending || ['cancelled', 'retreated', 'loss'].includes(fight.outcome)) {
    throw new RangeError('Turtle recovery is unavailable.');
  }
  const next = structuredClone(hero), updated = structuredClone(fight);
  next.pp = Math.min(integer(hero.maxPP, 1), integer(hero.pp) + 1);
  next.sp = Math.min(integer(hero.maxSP), integer(hero.sp) + 1);
  if (updated.receiver === 'Tsai') updated.playerPP = next.pp;
  updated.turtleUsed = true;
  updated.events = [{kind: 'turtle', pp: next.pp - Number(hero.pp), sp: next.sp - Number(hero.sp)}];
  return {hero: next, fight: updated};
}
