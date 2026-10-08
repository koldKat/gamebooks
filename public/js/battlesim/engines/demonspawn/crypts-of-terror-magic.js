import { FIRE_WOLF_SPELLS, castFireWolfSpell, createFireWolfMagicSection } from './fire-wolf-magic.js';
import { checkCryptsOutcome, cryptsEnemyActive, finishCryptsFight } from './crypts-of-terror.js';

export function createCryptsMagicSection(section, player, enemies = []) {
  const magic = createFireWolfMagicSection(section,player,enemies[0]);
  magic.opening.enemyLives = enemies.map(enemy => enemy.lifePoints);
  return magic;
}

function rewind(fight, opening) {
  fight.player.lifePoints = opening.playerLife;
  if (opening.enemyLives?.length === fight.enemies.length) {
    fight.enemies.forEach((enemy,index) => { enemy.lifePoints = opening.enemyLives[index]; });
  }
  fight.enemyDamage.fill(0);
  fight.playerDamage = 0;
}

function record(fight, event) {
  fight.log.push(event);
  if (fight.log.length > 150) fight.log.splice(0,fight.log.length-150);
}

function duelResult(fight, side, success) {
  if (fight.encounter.rule !== 'wizard-duel') return;
  if (!success) { finishCryptsFight(fight,side === 'player' ? 'defeat' : 'win'); return; }
  const pHalf = fight.opening.playerLife / 2, eHalf = fight.opening.enemyLife / 2;
  if (fight.player.lifePoints <= pHalf) finishCryptsFight(fight,'defeat');
  else if (fight.enemy.lifePoints <= eHalf) finishCryptsFight(fight,'win');
}

export function castCryptsPlayerSpell(fight, magic, spell, options = {}, random = Math.random) {
  if (fight.encounter.noMagic || fight.outcome && spell !== 'resurrection') return {error:'unavailable'};
  if (fight.pending && spell !== 'resurrection') return {error:'pending'};
  if (fight.encounter.noPoisonNeedle && spell === 'poisonNeedle') return {error:'forbidden-spell'};
  const target = options.target ?? 0;
  const enemy = fight.enemies[target];
  if (!Number.isInteger(target) || !enemy) return {error:'no-target'};
  if (['fireball','paralysis','poisonNeedle','xenophobia'].includes(spell) && !cryptsEnemyActive(fight,target)) return {error:'no-target'};
  if (spell === 'crypt' && ![6,74].includes(Number(options.cryptStart ?? 6))) return {error:'invalid-initiation'};
  if (fight.encounter.rule === 'wizard-duel' && fight.turn !== 'player') return {error:'wrong-turn'};
  if (fight.encounter.rule === 'wizard-duel' && options.useLife) return {error:'power-only'};
  fight.enemy = enemy;
  const before = enemy.lifePoints;
  const result = castFireWolfSpell(magic,fight.player,spell,{...options,enemy},random);
  if (result.error) {
    if (fight.encounter.rule === 'wizard-duel' && ['insufficient-power','no-inclination'].includes(result.error)) duelResult(fight,'player',false);
    return result;
  }
  if (result.success) {
    fight.player.magicArmour = magic.armour;
    if (spell === 'crypt') result.destination = Number(options.cryptStart ?? 6);
    if (spell === 'fireball') {
      const protection = Math.max(0,Number(enemy.magicArmour)||0)+(Number(fight.player.magicFear)||0);
      result.damage = Math.max(0,50-protection)*(fight.options.cursedStone ? 0.5 : 1);
      enemy.lifePoints = before-result.damage;
    }
    fight.enemyDamage[target] += Math.max(0,before-enemy.lifePoints);
    if (spell === 'timewarp') rewind(fight,magic.opening);
    if (fight.encounter.rule === 'wizard-duel') {
      if (result.avoidCombat || magic.invisible || result.destination != null) result.manualEffect=true;
    } else {
      if (result.avoidCombat) enemy.paralysed=true;
      if (magic.invisible) fight.outcome='avoided';
      if (result.destination != null && !result.rerollCharacter) fight.outcome='warped';
    }
  }
  duelResult(fight,'player',result.success);
  if (fight.encounter.rule === 'wizard-duel') fight.turn='enemy';
  record(fight,{kind:'spell',side:'player',...result});checkCryptsOutcome(fight);
  return result;
}

export function castCryptsEnemySpell(fight, target, spell, random = Math.random) {
  if (fight.outcome || fight.pending || fight.encounter.noMagic || !Number.isInteger(target)) return {error:'unavailable'};
  const enemy = fight.enemies[target];
  if (!enemy || !cryptsEnemyActive(fight,target)) return {error:'no-target'};
  if (!fight.manualGroup && fight.turn !== 'enemy') return {error:'wrong-turn'};
  if (fight.openingStrikes.length < fight.options.enemyOpening) return {error:'enemy-opening'};
  if (fight.encounter.noPoisonNeedle && spell === 'poisonNeedle') return {error:'forbidden-spell'};
  const allowed = enemy.spells === 'all' || enemy.spells?.includes(spell) || fight.encounter.rule === 'wizard-duel';
  if (!allowed || FIRE_WOLF_SPELLS[spell] === undefined) return {error:'unavailable'};
  // Enemy spellcasters are not subject to Fire*Wolf's reluctance or once-per-section restriction.
  const magic = createFireWolfMagicSection(fight.encounter.section,enemy,fight.player);
  magic.inclination=true;
  const before = fight.player.lifePoints;
  const result = castFireWolfSpell(magic,enemy,spell,{enemy:fight.player},random);
  if (result.error) {
    if (fight.encounter.rule === 'wizard-duel' && result.error === 'insufficient-power') duelResult(fight,'enemy',false);
    return result;
  }
  if (result.success) {
    if (spell === 'armour') enemy.magicArmour = magic.armour;
    if (spell === 'fireball') {
      const magicProtection = Math.max(0,Number(fight.player.magicArmour)||0)+(Number(enemy.magicFear)||0);
      const damage = Math.max(0,50-magicProtection)*(fight.options.cursedStone?2:1);
      fight.player.lifePoints = before-damage;result.damage=damage;
    }
    if (fight.encounter.rule === 'wizard-duel') {
      if (result.avoidCombat || magic.invisible || result.destination != null) result.manualEffect=true;
    } else if (result.avoidCombat) {
      if (fight.encounter.rule === 'manticore') fight.paralysedPlayerRounds=3;
      else enemy.escaped=true;
    }
    if (fight.encounter.rule !== 'wizard-duel' && (magic.invisible || result.destination != null && !result.rerollCharacter)) enemy.escaped=true;
    if (spell === 'timewarp') result.manualEffect=true;
  }
  fight.playerDamage += Math.max(0,before-fight.player.lifePoints);
  fight.enemyTurns += 1;
  if (!fight.manualGroup && fight.rest) {fight.rest-=1;if(!fight.rest)fight.attacks=0;}
  fight.turn='player';duelResult(fight,'enemy',result.success);
  record(fight,{kind:'spell',side:'enemy',target,...result});checkCryptsOutcome(fight);
  return result;
}

export function useCryptsRosewoodBox(fight) {
  if (fight.outcome || fight.pending || fight.encounter.noArtifacts || !fight.player.rosewoodBox) return false;
  const targets = fight.enemies.filter((e,i)=>e.name==='Alchiller' && cryptsEnemyActive(fight,i)).slice(0,4);
  if (!targets.length) return false;
  fight.player.rosewoodBox=false;targets.forEach(e=>e.paralysed=true);checkCryptsOutcome(fight);
  record(fight,{kind:'rosewood-box',targets:targets.length});return true;
}

export function tryCryptsOrb(fight, random = Math.random) {
  if (fight.outcome || fight.pending || fight.encounter.noArtifacts || !fight.options.orb || fight.orbTested) return null;
  fight.orbTested=true;
  if (fight.encounter.section === 144) {
    fight.enemies.forEach(enemy => { enemy.escaped=true; });
    checkCryptsOutcome(fight);
    record(fight,{kind:'orb',success:true,possessionOnly:true});
    return true;
  }
  const roll = Math.floor(random()*6)+1+Math.floor(random()*6)+1;
  const success = roll>=11;
  fight.options.orbActive=success;
  record(fight,{kind:'orb',roll,success});return success;
}

export function useCryptsWand(fight, target, random = Math.random) {
  if (fight.outcome || fight.pending || fight.encounter.noArtifacts || fight.player.wandCharges < 1
    || !Number.isFinite(fight.player.wandCharges) || fight.player.power < 5 || !Number.isFinite(fight.player.power)
    || !Number.isInteger(target) || !cryptsEnemyActive(fight,target)) return null;
  fight.player.wandCharges-=1;fight.player.power-=5;
  const roll=Math.floor(random()*6)+1+Math.floor(random()*6)+1,success=roll>=10;
  if (success) fight.enemies[target].escaped=true;
  record(fight,{kind:'wand',target,roll,success});checkCryptsOutcome(fight);return success;
}
