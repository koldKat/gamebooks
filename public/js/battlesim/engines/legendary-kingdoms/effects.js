import { protectLegendaryHero } from './protection.js';
import { legendaryDie } from './character.js';
import { VALLEY_SETTINGS } from './valley-roster.js';
import { CROWN_SETTINGS } from './crown-roster.js';

function injureParty(fight, amount, combat = true) {
  for (const index of fight.participants) {
    const hero = fight.party[index];
    if (hero.health > 0) fight.party[index] = protectLegendaryHero(hero, amount, { noArmour: true, combat, attack: false }).character;
  }
}

export function applyLegendaryEndRound(fight, roll) {
  const special = fight.rules.special;
  const settings = VALLEY_SETTINGS;
  if (fight.rules.grappleEscape) {
    for (const index of fight.grappled) {
      const hero = fight.party[index];
      if (hero.health > 0) fight.party[index] = protectLegendaryHero(hero, CROWN_SETTINGS.grappleDamage, {combat:false,attack:false}).character;
    }
  }
  if (special === 'skallos') {
    const rules=settings.skallos;
    const index = fight.enemies.findIndex(enemy => enemy.name === rules.name);
    if (index >= 0 && fight.enemies[index].health > 0 && !fight.roundEnemyDamage[index]) {
      injureParty(fight, rules.partyDamage);
      fight.enemies[index].health = Math.min(rules.maximumHealth, fight.enemies[index].health + rules.healing);
      fight.log = [...fight.log.slice(-59), { round: fight.round, type: 'skallosRoar' }];
    }
  } else if (special === 'fallingRocks') {
    const priest = fight.enemies[0];
    if (priest.health > 0) {
      priest.health = Math.max(0, priest.health - settings.fallingRocks.selfDamage);
      injureParty(fight, settings.fallingRocks.partyDamage, false);
      fight.log = [...fight.log.slice(-59), { round: fight.round, type: 'fallingRocks' }];
    }
  } else if (special === 'beetles') {
    injureParty(fight, settings.beetleDamage);
    fight.log = [...fight.log.slice(-59), { round: fight.round, type: 'beetleBites' }];
  } else if (special === 'saltDragon' && !fight.roundPartyDamage) {
    injureParty(fight, settings.saltDragonDamage);
    fight.log = [...fight.log.slice(-59), { round: fight.round, type: 'dragonFire' }];
  } else if (special === 'assassinObjective' && !fight.roundEnemyDamage[0] && fight.enemies[0].health > 0) {
    fight.status = 'failed';
    fight.phase = 'ended';
    fight.destination = fight.rules.objectiveLoss;
    fight.pending = null;
    fight.party.forEach(hero => { hero.invulnerable = false; });
    fight.log = [...fight.log.slice(-59), { round: fight.round, type: 'assassinEscaped' }];
  }
  if (fight.rules.endRoundPartyDamage) injureParty(fight, fight.rules.endRoundPartyDamage, false);
  for (const [enemyIndex, enemy] of fight.enemies.entries()) {
    if (enemy.health > 0 && enemy.endRoundPartyDamage) injureParty(fight, enemy.endRoundPartyDamage, false);
    if (enemy.health > 0 && enemy.undamagedHeroAura) {
      for (const index of fight.participants) {
        const hero = fight.party[index];
        if (hero.health > 0 && !fight.enemyHeroDamage?.[enemyIndex]?.[index])
          fight.party[index] = protectLegendaryHero(hero, enemy.undamagedHeroAura,
            {combat:false,attack:false}).character;
      }
      fight.log = [...fight.log.slice(-59), {round:fight.round,type:'decayAura',enemyIndex}];
    }
  }
  if (fight.rules.rechargeSpellsAtRoundEnd) {
    for (const memberIndex of fight.participants) {
      const hero = fight.party[memberIndex];
      if (hero.health <= 0) continue;
      for (const spell of hero.spells ?? []) if (!spell.charged) {
        const die = legendaryDie(roll);
        spell.charged = die >= fight.rules.rechargeSpellsAtRoundEnd;
        fight.log = [...fight.log.slice(-59), {round:fight.round,type:'spellRecharge',memberIndex,
          spellId:spell.id,die,charged:spell.charged}];
      }
    }
  }
}

export function applyLegendaryPartyEnd(fight) {
  if (fight.rules.special !== 'slaveAllies' || fight.rules.slaveDamage === 0) return;
  const amount = fight.rules.slaveDamage ?? VALLEY_SETTINGS.slaves.default;
  for (const [index, enemy] of fight.enemies.entries()) {
    if (enemy.health > 0 && enemy.name !== VALLEY_SETTINGS.names.orcLeader) {
      const damage = Math.min(enemy.health, amount);
      enemy.health -= damage;
      fight.roundEnemyDamage[index] += damage;
    }
  }
  fight.log = [...fight.log.slice(-59), { round: fight.round, type: 'slaveAllies', damage: amount }];
}
