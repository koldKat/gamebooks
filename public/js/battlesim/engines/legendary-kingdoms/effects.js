import { protectLegendaryHero } from './protection.js';

function injureParty(fight, amount, combat = true) {
  for (const index of fight.participants) {
    const hero = fight.party[index];
    if (hero.health > 0) fight.party[index] = protectLegendaryHero(hero, amount, { noArmour: true, combat, attack: false }).character;
  }
}

export function applyLegendaryEndRound(fight) {
  const special = fight.rules.special;
  if (special === 'skallos') {
    const index = fight.enemies.findIndex(enemy => enemy.name === 'Skallos');
    if (index >= 0 && fight.enemies[index].health > 0 && !fight.roundEnemyDamage[index]) {
      injureParty(fight, 1);
      fight.enemies[index].health = Math.min(20, fight.enemies[index].health + 4);
      fight.log = [...fight.log.slice(-59), { round: fight.round, type: 'skallosRoar' }];
    }
  } else if (special === 'fallingRocks') {
    const priest = fight.enemies[0];
    if (priest.health > 0) {
      priest.health = Math.max(0, priest.health - 1);
      injureParty(fight, 1, false);
      fight.log = [...fight.log.slice(-59), { round: fight.round, type: 'fallingRocks' }];
    }
  } else if (special === 'beetles') {
    injureParty(fight, 1);
    fight.log = [...fight.log.slice(-59), { round: fight.round, type: 'beetleBites' }];
  } else if (special === 'saltDragon' && !fight.roundPartyDamage) {
    injureParty(fight, 3);
    fight.log = [...fight.log.slice(-59), { round: fight.round, type: 'dragonFire' }];
  } else if (special === 'assassinObjective' && !fight.roundEnemyDamage[0] && fight.enemies[0].health > 0) {
    fight.status = 'failed';
    fight.phase = 'ended';
    fight.destination = fight.rules.objectiveLoss;
    fight.pending = null;
    fight.party.forEach(hero => { hero.invulnerable = false; });
    fight.log = [...fight.log.slice(-59), { round: fight.round, type: 'assassinEscaped' }];
  }
}

export function applyLegendaryPartyEnd(fight) {
  if (fight.rules.special !== 'slaveAllies' || fight.rules.slaveDamage === 0) return;
  const amount = fight.rules.slaveDamage ?? 1;
  for (const [index, enemy] of fight.enemies.entries()) {
    if (enemy.health > 0 && enemy.name !== 'Orc Leader') {
      const damage = Math.min(enemy.health, amount);
      enemy.health -= damage;
      fight.roundEnemyDamage[index] += damage;
    }
  }
  fight.log = [...fight.log.slice(-59), { round: fight.round, type: 'slaveAllies', damage: amount }];
}
