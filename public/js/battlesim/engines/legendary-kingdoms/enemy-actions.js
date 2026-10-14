import { legendaryDie } from './character.js';

export function activeLegendaryEnemy(fight, index) {
  const enemy = fight.enemies[index];
  return enemy.health > 0 && (enemy.arrivalRound ?? 1) <= fight.round;
}

function event(fight, entry) {
  fight.log = [...fight.log.slice(-59), { round: fight.round, ...entry }];
}

export function planLegendaryEnemy(fight, enemyIndex, roll) {
  const enemy = fight.enemies[enemyIndex];
  const special = fight.rules.special;
  const attack = (count = enemy.attack, threshold = enemy.threshold, extra = {}) => ({ enemyIndex, count, threshold, ...extra });
  const heroes = fight.participants.filter(index => fight.party[index].health > 0);
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
  if (special === 'doubleAttack' || (special === 'ironKing' && /Malronac/.test(enemy.name)))
    return [attack(),attack(enemy.attack,enemy.threshold,{distinct:true})];
  return [attack(enemy.attack,enemy.threshold,{lifeSteal:special === 'unbraaki' && enemy.name === 'Unbraaki'})];
}
