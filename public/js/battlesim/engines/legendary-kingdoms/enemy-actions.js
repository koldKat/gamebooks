import { legendaryDie } from './character.js';
import { legendaryAutomaticDamage } from './encounter.js';
import { legendaryZoneRecipients } from './locations.js';
import { VALLEY_SETTINGS } from './valley-roster.js';
import { CROWN_SETTINGS } from './crown-roster.js';

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
  const settings = VALLEY_SETTINGS;
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
    return [attack(CROWN_SETTINGS.netAttack.count, CROWN_SETTINGS.netAttack.threshold, { stunOnly: true })];
  if (enemy.undamagedAttack) {
    if (!fight.roundEnemyDamage[enemyIndex]) {
      const { hits, recipients = 1, noArmour = false } = enemy.undamagedAttack;
      return Array.from({ length: recipients }, (_, index) => attack(null, null,
        { hits, noArmour, ...(index ? { distinct: true } : {}) }));
    }
    if (enemy.attack === null) return [];
  }
  if (special === 'zealotHealer' && enemy.name === settings.zealotHealer.name &&
      fight.enemies.some((other,index) => index !== enemyIndex && activeLegendaryEnemy(fight,index))) {
    for (const [index, other] of fight.enemies.entries())
      if (index !== enemyIndex && activeLegendaryEnemy(fight,index)) other.health += settings.zealotHealer.healing;
    event(fight, { type: 'zealotHealing', enemyIndex });
    return [];
  }
  if (special === 'archers' && new RegExp(settings.archers.pattern).test(enemy.name))
    return fight.roundEnemyDamage[enemyIndex] ? [] :
      Array.from({length:settings.archers.recipients},(_,index)=>attack(null,null,{hits:settings.archers.hits,noArmour:true,...(index?{distinct:true}:{})}));
  if (special === 'unbraaki' && new RegExp(settings.monkeys.pattern).test(enemy.name)) {
    const die = legendaryDie(roll);
    event(fight, { type: 'monkeySpell', enemyIndex, die });
    const rules=settings.monkeys,index=die<=rules.bounds[0]?0:die<=rules.bounds[1]?1:2,spec=rules.attacks[index];
    return Array.from({length:spec.repeat??1},()=>spec.hits!==undefined?attack(null,null,{hits:spec.hits}):attack(spec.count,spec.threshold));
  }
  if (special === 'imopposh') {
    const rules=settings.imopposh;
    if (fight.round === rules.rounds[0]) return Array.from({length:rules.firstRepeats},()=>attack(rules.firstCount));
    if (fight.round === rules.rounds[1]) return [attack(rules.secondCount)];
    if (fight.round === rules.rounds[2]) return heroes.map(forcedMember => attack(rules.partyCount,enemy.threshold,{forcedMember}));
  }
  if (special === 'sorcerer' && enemy.name === settings.sorcerer.name) {
    const rules=settings.sorcerer;
    if (fight.round === rules.rounds[0]) return [attack(rules.firstCount)];
    if (fight.round === rules.rounds[1]) {
      fight.playerHitThreshold = rules.playerThreshold;
      event(fight, { type: 'enemyDazingLights', enemyIndex });
      return [];
    }
    if (fight.round === rules.rounds[2]) return heroes.map(forcedMember => attack(rules.partyCount,enemy.threshold,{forcedMember}));
  }
  if (special === 'fastilon') {
    const rules=settings.fastilon;
    if (!fight.roundEnemyDamage[enemyIndex] && fight.fastilonSpell < rules.spellLimit) {
      const spell = fight.fastilonSpell++;
      event(fight, { type: 'fastilonSpell', enemyIndex, spell });
      if (spell === 0) return [attack(null,null,{hits:rules.firstHits})];
      if (spell === 1) return [attack(null,null,{hits:rules.secondHits}),attack(null,null,{hits:rules.secondHits,distinct:true})];
      enemy.health = Math.min(rules.maximumHealth,enemy.health+rules.healing);
      return [];
    }
    return [attack(),attack(enemy.attack,enemy.threshold,{distinct:true})];
  }
  if (special === 'backstab' && enemy.name === settings.backstab.name && !fight.roundEnemyDamage[enemyIndex])
    return [attack(null,null,{hits:settings.backstab.hits})];
  if (enemy.attackType === 'none' || (enemy.attackType === 'special' && special === 'beetles')) return [];
  if (enemy.attackType === 'special') throw new RangeError('This special attack requires its source-specific resolver');
  const automaticDamage = legendaryAutomaticDamage(fight, enemyIndex);
  const ordinary = extra => attack(enemy.attack, enemy.threshold,
    { ...(automaticDamage ? { automaticDamage } : {}), ...(enemy.ignoreArmour ? { noArmour: true } : {}), ...extra });
  const before = enemy.beforeAttackDamage;
  const prefix = before && fight.party[before.forcedMember]?.health > 0 ?
    [{ enemyIndex, hits: before.hits, forcedMember: before.forcedMember, unpreventable: !!before.unpreventable }] : [];
  if (enemy.attacksPerTurn === 2 || special === 'doubleAttack' || (special === 'ironKing' && new RegExp(settings.names.malronacPattern).test(enemy.name)))
    return [...prefix, ordinary(), ordinary({ distinct: true })];
  return [...prefix, ordinary({lifeSteal:special === 'unbraaki' && enemy.name === settings.unbraakiName})];
}
