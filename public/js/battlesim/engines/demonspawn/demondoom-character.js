const characteristics = ['strength', 'speed', 'stamina', 'courage', 'luck', 'charm', 'attraction'];
const die = random => Math.floor(random() * 6) + 1;

export function rollDemondoomCharacter(random = Math.random, carriedSkill = 10, resurrectionPenalty = 0) {
  if (!Number.isFinite(carriedSkill) || carriedSkill < 0 || carriedSkill > 96 ||
      !Number.isFinite(resurrectionPenalty) || resurrectionPenalty < 0) throw new Error('Invalid Demondoom character input');
  const player = Object.fromEntries(characteristics.map(key => [key, (die(random) + die(random)) * 8]));
  player.strength = Math.max(0, player.strength - resurrectionPenalty);
  player.skill = carriedSkill;
  player.lifePoints = characteristics.reduce((total, key) => total + player[key], 0);
  player.maxLife = player.lifePoints;
  player.power = 50;
  player.maxPower = 50;
  player.resurrectionPenalty = resurrectionPenalty;
  return player;
}

export function transformedDemondoomCharacter(player) {
  return { ...structuredClone(player), strength: 95, speed: 95, stamina: 85, courage: 99,
    skill: 95, luck: 80, charm: 95, attraction: 100, lifePoints: 744, maxLife: 744, power: 175, maxPower: 175 };
}

export function awardDemondoomSkill(player) {
  if (!Number.isFinite(player.skill) || player.skill >= 96) return false;
  const gain = Math.min(1, 96 - player.skill);
  player.skill += gain;
  player.maxLife += gain;
  player.lifePoints = Math.min(player.maxLife, player.lifePoints + gain);
  return true;
}
