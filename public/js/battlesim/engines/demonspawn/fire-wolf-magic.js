export const FIRE_WOLF_SPELLS = Object.freeze({
  armour: 25, crypt: 10, fireball: 15, invisibility: 30, paralysis: 30,
  poisonNeedle: 25, resurrection: 50, retrace: 20, timewarp: 10, xenophobia: 15,
});

function die(random) { return Math.floor(random() * 6) + 1; }
function dice(random) { return die(random) + die(random); }

export function createFireWolfMagicSection(section, player, enemy = null) {
  return { section: String(section), inclination: null, used: [], armour: 0, invisible: false,
    enemyDamageReduction: 0, opening: { playerLife: player.lifePoints, enemyLife: enemy?.lifePoints ?? null } };
}

// The caller supplies the actual navigation event; reopening a dialog is not a new section.
export function enterFireWolfMagicSection(previous, section, player, enemy = null) {
  if (previous?.section === String(section)) return previous;
  if (previous && Number.isFinite(player.power) && Number.isFinite(player.maxPower)) {
    player.power = Math.min(player.maxPower, player.power + 1);
  }
  return createFireWolfMagicSection(section, player, enemy);
}

export function castFireWolfSpell(magic, player, spell, { enemy = null, destination = null, visited = [], useLife = false } = {}, random = Math.random) {
  const cost = FIRE_WOLF_SPELLS[spell];
  if (cost === undefined || magic.used.includes(spell)) return { error: 'unavailable' };
  if (!Number.isFinite(player.power) || player.power < 0) return { error: 'insufficient-power' };
  const lifeCost = Math.max(0, cost - player.power);
  if (lifeCost && (!useLife || player.lifePoints <= lifeCost)) return { error: 'insufficient-power' };
  if (spell === 'resurrection' ? player.lifePoints > 0 : player.lifePoints <= 0) return { error: 'wrong-life-state' };
  if (['fireball', 'paralysis', 'poisonNeedle', 'xenophobia'].includes(spell) && (!enemy || enemy.lifePoints <= 0)) return { error: 'no-target' };
  if (spell === 'retrace' && (destination == null || ['0', '-1'].includes(String(destination)) || !visited.some(section => String(section) === String(destination)))) return { error: 'unvisited-destination' };
  let inclinationRoll = null;
  if (magic.inclination === null) {
    inclinationRoll = dice(random);
    magic.inclination = inclinationRoll >= 4;
  }
  if (!magic.inclination) return { error: 'no-inclination', inclinationRoll };
  player.power = Math.max(0, player.power - cost);
  player.lifePoints -= lifeCost;
  magic.used.push(spell);
  const roll = dice(random);
  const result = { spell, cost, lifeCost, roll, inclinationRoll, success: roll >= 6 };
  if (!result.success) return result;
  if (spell === 'armour') magic.armour = 10;
  else if (spell === 'crypt') result.destination = 150;
  else if (spell === 'fireball') { enemy.lifePoints -= 50; result.damage = 50; }
  else if (spell === 'invisibility') magic.invisible = true;
  else if (spell === 'paralysis') result.avoidCombat = true;
  else if (spell === 'poisonNeedle') {
    result.immunityRoll = die(random);
    result.immune = result.immunityRoll > 3;
    if (!result.immune) { result.damage = Math.max(0, enemy.lifePoints); enemy.lifePoints = 0; }
  } else if (spell === 'resurrection') {
    // New statistics and returning to the section are explicit caller actions, not hidden resets.
    result.rerollCharacter = true;
    result.destination = magic.section;
  } else if (spell === 'retrace') result.destination = destination;
  else if (spell === 'timewarp') {
    player.lifePoints = magic.opening.playerLife;
    if (enemy && magic.opening.enemyLife !== null) enemy.lifePoints = magic.opening.enemyLife;
  } else if (spell === 'xenophobia') {
    magic.enemyDamageReduction = 5;
    enemy.magicFear = 5;
  }
  return result;
}

export const FIRE_WOLF_REGENT_SPELLS = Object.freeze({ leprosy: 8, blight: 6, timetrap: 9, crackOfDoom: 8, firebolt: 9 });

export function castFireWolfRegentSpell(regent, spell, random = Math.random) {
  const threshold = FIRE_WOLF_REGENT_SPELLS[spell];
  if (threshold === undefined || regent.lifePoints <= 0) return { error: 'unavailable' };
  const cost = dice(random);
  regent.lifePoints -= cost;
  const roll = dice(random);
  const result = { spell, cost, roll, success: roll >= threshold };
  if (!result.success) return result;
  if (spell === 'blight') result.paralysisRounds = 2;
  else if (spell === 'timetrap') result.destination = dice(random) * 10;
  else if (spell === 'crackOfDoom') result.damage = 50;
  else if (spell === 'firebolt') result.damage = 75;
  else result.leprosyPercent = 10;
  return result;
}
