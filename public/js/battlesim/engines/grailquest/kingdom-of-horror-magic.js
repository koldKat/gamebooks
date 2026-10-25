import { kingdomTargets, prepareKingdomMagic, finishKingdomMagic,
  damageKingdomPlayer, damageKingdomEnemy, settleKingdomFight }
  from './kingdom-of-horror.js';
import { KINGDOM_RULES, KINGDOM_FRED } from './kingdom-of-horror-roster.js';

const die = random => 1 + Math.floor(random() * 6);
const dice = random => die(random) + die(random);
const attackItems = new Set(['pointingBone', 'deathbell', 'deathMask', 'eyeOfHorus',
  'laughingGlobe', 'lightningWand', 'fireball', 'destructionOrb', 'psionicHelm',
  'sanctuaryScroll', 'seekerNeedle', 'sleepGlobe', 'xerox', 'thunderbolt', 'kangling', 'dragonfirePills']);

export function kingdomCast(f, item, index, settings = {}, random = Math.random) {
  const p = f.player;
  if (!attackItems.has(item) || !(p.magic[item] > 0)) return null;
  const target = kingdomTargets(f).find(row => row.index === index)?.foe;
  if (!target) return null;
  const cost = item === 'pointingBone' ? 5 : item === 'deathMask' ? 1 : item === 'eyeOfHorus' ? 10 : 0;
  if (p.life < cost || item === 'pointingBone' && (!target.humanoid || f.surprised)
    || item === 'eyeOfHorus' && !target.humanoid
    || f.spec.foolingForbidden && ['deathMask', 'eyeOfHorus', 'laughingGlobe', 'sleepGlobe'].includes(item)
    || item === 'seekerNeedle' && settings.nameAndLocationKnown !== true) return null;
  const indices = settings.targets ?? [index];
  if (['laughingGlobe', 'sleepGlobe'].includes(item) &&
    (!Array.isArray(indices) || !indices.length || new Set(indices).size !== indices.length
      || indices.some(value => !kingdomTargets(f).some(row => row.index === value))
      || item === 'laughingGlobe' && indices.length > 3
      || item === 'sleepGlobe' && (indices.length > 12 || 12 % indices.length !== 0))) return null;
  const action = prepareKingdomMagic(f, index, random);
  if (!action) return null;
  p.magic[item]--;
  damageKingdomPlayer(f, cost);
  const event = { kind: 'magic', item, index, cost, resistanceRoll: action.resistanceRoll,
    resisted: action.resisted, forcedMiss: action.forcedMiss, damage: 0 };
  if (action.resisted || action.forcedMiss || p.life <= 0) return finishKingdomMagic(f, event, random);
  switch (item) {
    case 'pointingBone': event.damage = damageKingdomEnemy(f, target, target.life); break;
    case 'deathMask':
      for (const { foe } of kingdomTargets(f)) foe.bypassed = true;
      break;
    case 'eyeOfHorus': target.freePlayerStrikes = 6; f.attacksLeft += 6; f.freeStrikes = true; break;
    case 'laughingGlobe':
      for (const value of indices) f.foes[value].freePlayerStrikes = 3;
      f.attacksLeft += indices.length * 3;
      f.freeStrikes = true;
      break;
    case 'lightningWand': event.roll = dice(random); event.damage = damageKingdomEnemy(f, target, event.roll); break;
    case 'fireball':
      event.roll = dice(random);
      if (event.roll >= 6) event.damage = damageKingdomEnemy(f, target, 75);
      break;
    case 'thunderbolt':
      event.roll = dice(random);
      if (event.roll >= 6) event.damage = damageKingdomEnemy(f, target, Math.floor(target.life / 2));
      break;
    case 'kangling':
      event.roll = dice(random);
      if (event.roll >= 6) target.gelDamage = 10;
      break;
    case 'dragonfirePills': event.damage = damageKingdomEnemy(f, target, 35); break;
    case 'destructionOrb':
      event.roll = die(random);
      for (const { foe } of kingdomTargets(f)) event.damage += damageKingdomEnemy(f, foe, foe.life);
      if (event.roll <= 3) damageKingdomPlayer(f, p.life);
      break;
    case 'psionicHelm': target.psionicThroughRound = f.rounds + 6; break;
    case 'sanctuaryScroll': f.sanctuaryThroughRound = f.rounds + 3; break;
    case 'seekerNeedle': event.damage = damageKingdomEnemy(f, target, Math.floor(target.life / 2)); break;
    case 'sleepGlobe': for (const value of indices) f.foes[value].sleepRounds = 12 / indices.length; break;
    case 'xerox': f.xerox = true; break;
    case 'deathbell': {
      event.roll = die(random);
      const fred = { ...KINGDOM_FRED, maxLife: KINGDOM_FRED.life,
        hitCount: 0, bypassed: false, sleepRounds: 0, spellsUsed: 0 };
      if (event.roll <= KINGDOM_RULES.deathbell.enemyMax) {
        f.enemyAlly = true;
        f.foes.push(fred);
      } else f.ally = { ...fred, expiresAfterFight: true };
      break;
    }
  }
  return finishKingdomMagic(f, event, random);
}

export function kingdomChargeResurrection(character) {
  if (!(character.magic.resurrectionWand > 0) || character.life <= 15 || character.resurrectionCharged) return false;
  character.life -= 15;
  character.resurrectionCharged = true;
  return true;
}

export function kingdomResurrect(f, random = Math.random) {
  const p = f.player;
  if (f.recorded || f.resurrectionDeclined || p.life !== 0 || !p.resurrectionCharged || !(p.magic.resurrectionWand > 0)) return null;
  p.magic.resurrectionWand--;
  p.resurrectionCharged = false;
  const roll = dice(random), success = roll >= 9;
  if (success) {
    p.life = p.maxLife;
    f.status = 'fighting';
    f.active = null;
    f.roundStarted = false;
    settleKingdomFight(f);
  }
  f.events.push({ kind: 'resurrection', roll, success });
  return { roll, success };
}

export function kingdomBreakSanctuary(f) {
  if (!f.sanctuaryThroughRound) return false;
  f.sanctuaryThroughRound = 0;
  f.events.push({ kind: 'breakSanctuary' });
  return true;
}

export function kingdomPrepareFriendship(character) {
  if (!(character.magic.friendshipMask > 0) || character.life <= 0 || character.friendshipPending) return false;
  character.magic.friendshipMask--;
  character.friendshipPending = true;
  return true;
}

export function kingdomUseLuckyRoll(character, roll) {
  if (!Number.isSafeInteger(roll) || roll < 1 || roll > 12 || character.luckyRolls <= 0) return null;
  character.luckyRolls--;
  return roll + 2;
}

export function kingdomSwitchWeapon(character, weapon) {
  if (!['ej', 'unarmed', 'vorpalSword'].includes(weapon)
    || weapon === 'vorpalSword' && !(character.magic.vorpalSword > 0)) return false;
  character.weapon = weapon;
  character.hit = weapon === 'ej' ? 4 : 6;
  character.bonus = weapon === 'ej' ? 5 : 0;
  return true;
}

export function kingdomRemoveNeckBolt(character) {
  if (!character.neckBolt || character.neckRemoved) return false;
  character.neckBolt = false;
  character.neckRemoved = true;
  character.neckActivated = false;
  return true;
}

export function kingdomSmarm(f, index, oppositeSexConfirmed) {
  const target = kingdomTargets(f).find(row => row.index === index)?.foe;
  if (f.status !== 'fighting' || f.spec.dream || f.rounds || f.roundStarted || !target?.humanoid
    || oppositeSexConfirmed !== true || f.spec.foolingForbidden || !(f.player.magic.smarmOil > 0)) return false;
  f.player.magic.smarmOil--;
  target.bypassed = true;
  f.events.push({ kind: 'smarm', index, success: true });
  settleKingdomFight(f);
  return true;
}
