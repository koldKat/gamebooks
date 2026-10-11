import { KINGDOM_DREAMS, KINGDOM_EQUIPMENT, KINGDOM_MAGIC_STOCK } from './kingdom-of-horror-roster.js';
import { startKingdomFight } from './kingdom-of-horror.js';

const die = random => 1 + Math.floor(random() * 6);
const dice = random => die(random) + die(random);
const copy = value => JSON.parse(JSON.stringify(value));
const heal = (p, amount) => { p.life = Math.min(p.maxLife, p.life + amount); };
const hurt = (p, amount) => { p.life = Math.max(0, p.life - amount); };

export function kingdomMerlin(character, random = Math.random) {
  const p = copy(character);
  if (p.life <= 0) return null;
  const roll = die(random);
  const result = { player: p, roll,
    room: ['death', 'equipment', 'magic', 'sleep', 'empty', 'bathroom'][roll - 1] };
  if (roll === 1) p.life = 0;
  if (roll === 4) { result.healed = dice(random); heal(p, result.healed); }
  if (roll === 6) hurt(p, Math.ceil(p.life / 2));
  if (roll === 2) result.choicesRemaining = 2;
  if (roll === 3) result.choicesRemaining = 1;
  return result;
}

export function kingdomTakeEquipment(visit, id) {
  if (visit?.room !== 'equipment' || visit.choicesRemaining <= 0
    || !KINGDOM_EQUIPMENT.includes(id) || !visit.player.equipmentStock.includes(id)) return false;
  const p = visit.player;
  p.equipmentStock = p.equipmentStock.filter(value => value !== id);
  p.equipment.push(id);
  if (id === 'breastplate') p.armour = Math.max(p.armour, 2);
  if (id === 'healingPotion') p.potions += 6;
  if (id === 'healingSalve') p.salves += 6;
  if (id === 'rations') p.rations += 7;
  visit.choicesRemaining--;
  return true;
}

export function kingdomTakeMagic(visit, id, random = Math.random) {
  const item = KINGDOM_MAGIC_STOCK.find(row => row.id === id);
  if (!item || visit?.room !== 'magic' || visit.choicesRemaining <= 0
    || !(visit.player.magicStock[id] > 0)) return false;
  const p = visit.player;
  const variable = ['pointingBone', 'deathMask', 'lightningRod', 'psionicHelm',
    'resurrectionWand', 'xerox'];
  const charges = { eyeOfHorus: 3, lightningWand: 8, friendshipMask: 7,
    sanctuaryScroll: 3, smarmOil: 2 };
  p.magic[id] = (p.magic[id] || 0) + (variable.includes(id) ? die(random) : charges[id] || 1);
  if (id === 'speedBoots') p.speedCombats += 3;
  if (id === 'luckyCoin') { p.luckyGame = true; p.luckyRolls = 6; }
  p.magicStock[id]--;
  visit.choicesRemaining--;
  return true;
}

export function kingdomDream(character, number, random = Math.random) {
  if (!Number.isInteger(number) || number < 2 || number > 12) throw new RangeError('Invalid dream');
  const p = copy(character), result = { player: p, number, rolls: [], status: 'awake' };
  if (p.life <= 0) return null;
  const roll = (two = false) => { const value = two ? dice(random) : die(random); result.rolls.push(value); return value; };
  const fight = id => {
    if (p.life <= 5) { p.life = 0; result.status = 'dead'; return; }
    result.fight = startKingdomFight(p, id, {}, random);
    result.status = 'combat';
  };
  switch (number) {
    case 2: if (roll() <= 3) p.life = 0; break;
    case 3: case 4: fight(`dream${number}`); break;
    case 5: if (roll() >= 5) heal(p, roll(true)); else hurt(p, 10); break;
    case 6: result.status = 'limerick'; result.minutes = 15; break;
    case 7: {
      const value = roll(true);
      if (value <= 6) fight('dream7');
      else if (value >= 11) p.gnurlbash = true;
      break;
    }
    case 8: if (roll() >= 5) fight('dream8'); break;
    case 9: if (roll(true) < 9) p.limpSections = [1, 2, 3]; break;
    case 10: { const bonds = roll(true); if (roll(true) <= bonds) p.life = 0; break; }
    case 11: {
      let escaped = false;
      for (let attempt = 0; attempt < 5 && !escaped; attempt++) escaped = roll() === 6;
      if (!escaped) p.life = 0;
      break;
    }
    case 12: {
      const value = roll();
      if (value <= 2) p.life = 0;
      else if (value >= 5) { result.status = 'redream'; result.nextDream = roll(true); }
      break;
    }
  }
  if (p.life <= 0) result.status = 'dead';
  return result;
}

export function kingdomFinishLimerick(dream, completedInTime) {
  if (dream?.status !== 'limerick' || typeof completedInTime !== 'boolean') return false;
  if (!completedInTime) hurt(dream.player, 5);
  dream.status = dream.player.life <= 0 ? 'dead' : 'awake';
  return true;
}

export function kingdomSleep(character, random = Math.random) {
  if (character.life <= 0) return null;
  const sleepRoll = die(random);
  if (sleepRoll <= 4) return { sleepRoll, ...kingdomDream(character, dice(random), random) };
  const p = copy(character), restored = dice(random);
  heal(p, restored);
  return { sleepRoll, player: p, restored, status: 'awake' };
}

export function kingdomInvisibility(character, random = Math.random) {
  const p = copy(character);
  if (p.invisibleDoses <= 0 || p.life <= 0) return null;
  p.invisibleDoses--;
  const roll = die(random);
  return { player: p, roll, effect: roll === 6 ? 'invisible' : roll === 5 ? 'head' : 'none' };
}

export function kingdomCityPatrol(character, random = Math.random) {
  const p = copy(character);
  if (p.life <= 0) return null;
  if (p.equipment.includes('falseBeard')) return { player: p, status: 'clear', roll: null };
  const roll = die(random);
  return roll >= 4 ? { player: p, status: 'clear', roll }
    : { player: p, status: 'patrol', roll, count: die(random), fine: 200 };
}

export function kingdomPayFine(character, amount) {
  if (!Number.isSafeInteger(amount) || amount < 1 || character.gold < amount || character.life <= 0) return false;
  character.gold -= amount;
  return true;
}

export function kingdomBookExperience(character, points = 1) {
  if (!Number.isSafeInteger(points) || points < 1) throw new RangeError('Invalid experience');
  const p = copy(character);
  const earned = Math.floor((p.experience + points) / 20) - Math.floor(p.experience / 20);
  p.experience += points;
  p.permanent += earned;
  p.maxLife += earned;
  if (p.life > 0) p.life += earned;
  return p;
}

export function kingdomDreamRoster() { return KINGDOM_DREAMS; }
