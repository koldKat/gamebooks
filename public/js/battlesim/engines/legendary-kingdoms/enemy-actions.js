import { legendaryDie } from './character.js';
import { legendaryAutomaticDamage } from './encounter.js';
import { legendaryZoneRecipients } from './locations.js';

export function activeLegendaryEnemy(fight, index) {
  const enemy = fight.enemies[index];
  return enemy.health > 0 && (enemy.arrivalRound ?? 1) <= fight.round &&
    (enemy.partyMember === undefined || fight.enemies[fight.rules.controllerIndex].health > 0);
}

function event(fight, entry) {
  fight.log = [...fight.log.slice(-59), { round: fight.round, ...entry }];
}

export function planLegendaryEnemy(fight, enemyIndex, roll) {
  const enemy = fight.enemies[enemyIndex];
  const special = fight.rules.special;
  const attack = (count = enemy.attack, threshold = enemy.threshold, extra = {}) => ({ enemyIndex, count, threshold, ...extra });
  const heroes = fight.participants.filter(index => fight.party[index].health > 0 &&
    (fight.rules.heroArrivalRounds?.[index] ?? 1) <= fight.round);
  if (enemy.inactive) return [];
  if (enemy.forcedAttackRound === fight.round) return [attack(enemy.attack,enemy.forcedAttackThreshold,
    {forcedMember:enemy.forcedAttackMember,automaticDamage:legendaryAutomaticDamage(fight,enemyIndex)})];
  if (enemy.zone) {
    const recipients = legendaryZoneRecipients(fight, enemy);
    if (!recipients.length) return [];
    if (enemy.attackEveryoneInZone) return recipients.map(forcedMember => attack(enemy.attack,enemy.threshold,{forcedMember}));
    return [attack(enemy.attack,enemy.threshold,{allowedMembers:recipients})];
  }
  if (enemy.forcedDamage) return [{enemyIndex,...enemy.forcedDamage}];
  if (enemy.spellPlan) {
    const cast = { enemyIndex, castSpell: true };
    if (!enemy.spellPlan.afterAttack) return [cast];
    const automaticDamage = legendaryAutomaticDamage(fight, enemyIndex);
    return [attack(enemy.attack, enemy.threshold, { ...(automaticDamage ? { automaticDamage } : {}) }), cast];
  }
  if (enemy.netWhileOthersAlive && fight.enemies.some((_, index) => index !== enemyIndex && activeLegendaryEnemy(fight, index)))
    return [attack(1, 3, { stunOnly: true })];
  if (enemy.undamagedAttack) {
    if (!fight.roundEnemyDamage[enemyIndex]) {
      const { hits, recipients = 1, noArmour = false } = enemy.undamagedAttack;
      return Array.from({ length: recipients }, (_, index) => attack(null, null,
        { hits, noArmour, ...(index ? { distinct: true } : {}) }));
    }
    if (enemy.attack === null) return [];
  }
  if (special === 'zealotHealer' && enemy.name === 'Zealot Healer' &&
      fight.enemies.some((other,index) => index !== enemyIndex && activeLegendaryEnemy(fight,index))) {
    for (const [index, other] of fight.enemies.entries())
      if (index !== enemyIndex && activeLegendaryEnemy(fight,index)) other.health += 2;
    event(fight, { type: 'zealotHealing', enemyIndex });
    return [];
  }
  if (special === 'archers' && /Archers/.test(enemy.name))
    return fight.roundEnemyDamage[enemyIndex] ? [] :
      [attack(null,null,{hits:2,noArmour:true}),attack(null,null,{hits:2,noArmour:true,distinct:true})];
  if (special === 'unbraaki' && /Monkey/.test(enemy.name)) {
    const die = legendaryDie(roll);
    event(fight, { type: 'monkeySpell', enemyIndex, die });
    if (die <= 2) return [attack(8,4)];
    if (die <= 4) return [attack(null,null,{hits:3})];
    return [attack(5,4),attack(5,4)];
  }
  if (special === 'imopposh') {
    if (fight.round === 1) return [attack(10),attack(10)];
    if (fight.round === 2) return [attack(13)];
    if (fight.round === 3) return heroes.map(forcedMember => attack(3,enemy.threshold,{forcedMember}));
  }
  if (special === 'sorcerer' && enemy.name === 'Sorcerer') {
    if (fight.round === 1) return [attack(8)];
    if (fight.round === 2) {
      fight.playerHitThreshold = 5;
      event(fight, { type: 'enemyDazingLights', enemyIndex });
      return [];
    }
    if (fight.round === 3) return heroes.map(forcedMember => attack(3,enemy.threshold,{forcedMember}));
  }
  if (special === 'fastilon') {
    if (!fight.roundEnemyDamage[enemyIndex] && fight.fastilonSpell < 3) {
      const spell = fight.fastilonSpell++;
      event(fight, { type: 'fastilonSpell', enemyIndex, spell });
      if (spell === 0) return [attack(null,null,{hits:6})];
      if (spell === 1) return [attack(null,null,{hits:5}),attack(null,null,{hits:5,distinct:true})];
      enemy.health = Math.min(40,enemy.health+8);
      return [];
    }
    return [attack(),attack(enemy.attack,enemy.threshold,{distinct:true})];
  }
  if (special === 'backstab' && enemy.name === 'Cursite Assassin' && !fight.roundEnemyDamage[enemyIndex])
    return [attack(null,null,{hits:4})];
  if (enemy.attackType === 'none' || (enemy.attackType === 'special' && special === 'beetles')) return [];
  if (enemy.attackType === 'special') throw new RangeError('This special attack requires its source-specific resolver');
  const automaticDamage = legendaryAutomaticDamage(fight, enemyIndex);
  const ordinary = extra => attack(enemy.attack, enemy.threshold,
    { ...(automaticDamage ? { automaticDamage } : {}), ...(enemy.ignoreArmour ? { noArmour: true } : {}), ...extra });
  const before = enemy.beforeAttackDamage;
  const prefix = before && fight.party[before.forcedMember]?.health > 0 ?
    [{ enemyIndex, hits: before.hits, forcedMember: before.forcedMember, unpreventable: !!before.unpreventable }] : [];
  if (enemy.attacksPerTurn === 2 || special === 'doubleAttack' || (special === 'ironKing' && /Malronac/.test(enemy.name)))
    return [...prefix, ordinary(), ordinary({ distinct: true })];
  return [...prefix, ordinary({lifeSteal:special === 'unbraaki' && enemy.name === 'Unbraaki'})];
}
