// Resolve chosen-threshold attacks and independent opponent limits for Usborne combat.
const integer = (value, min, max = 10000) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
};

export function createCombatRules({attacks = [7, 9], advanced = false, unarmedDamage = 1} = {}) {
  const damageFor = new Map(attacks.map(target => [target, ({7:1, 9:3, 11:5})[target]]));
  if ([...damageFor.values()].some(value => !value)) throw new RangeError('Invalid attack options');
  function startFight(hp, opponents, config = {}, modifier = 0, unarmed = false, equipment = {}) {
    integer(hp, 1, 12); integer(modifier, -100, 100);
    if (!Array.isArray(opponents) || !opponents.length || opponents.length > 100) throw new RangeError('Missing opponents');
    const fight = {rulesVersion:1, hp, modifier, unarmed:Boolean(unarmed), config:structuredClone(config),
      enemies:opponents.map(enemy => ({name:String(enemy.displayName ?? enemy.name ?? '').slice(0, 200),
        hp:integer(enemy.hp, 1), rounds:integer(enemy.rounds, 1), injury:integer(enemy.injury, 0)})),
      advantage:Boolean(config.bonusUntilMiss), restrained:Boolean(config.penaltyUntilHit),
      rounds:0, outcome:null, destination:null, events:[]};
    if (advanced) {
      if (!['none', 'leather', 'chainmail'].includes(equipment.armor ?? 'none')) throw new RangeError('Invalid armor');
      fight.equipment = {armor:equipment.armor ?? 'none', goldRing:Boolean(equipment.goldRing),
        flynt:equipment.flynt !== false, staff:equipment.staff !== false, bracelet:Boolean(equipment.bracelet)};
      fight.enemyWins = 0;
    }
    return fight;
  }
  function round(original, target, attack, roll = () => Math.floor(Math.random() * 6) + 1) {
    if (original?.rulesVersion !== 1 || original.outcome) throw new RangeError('No active fight');
    integer(target, 0, original.enemies.length - 1);
    if (!damageFor.has(attack) || original.enemies[target].hp <= 0) throw new RangeError('Invalid attack');
    const fight = structuredClone(original), enemy = fight.enemies[target], config = fight.config;
    const die = () => integer(roll(), 1, 6), dice = [die(), die()];
    const equipment = advanced ? fight.equipment : null;
    const rollModifier = integer(config.rollModifier ?? 0, -100, 100);
    const weaponPenalty = advanced && config.withoutFlyntPenalty && !equipment.flynt ? 1 : 0;
    const total = dice[0] + dice[1] + fight.modifier + rollModifier
      + (fight.advantage ? 1 : 0) - (fight.restrained ? 1 : 0)
      + (equipment?.goldRing ? 1 : 0) - weaponPenalty;
    const hit = total >= attack;
    const confirmation = advanced && config.confirmHit && hit ? die() : null;
    const connected = hit && (confirmation === null || confirmation >= 4);
    const enemyLoss = connected ? Math.min(enemy.hp, damageFor.get(attack)) : 0;
    const damageDie = advanced && config.evenDamageDouble && !hit ? die() : null;
    const doubles = dice[0] === dice[1];
    const multiplier = advanced && !hit && ((config.doubleOnMiss && doubles)
      || (damageDie !== null && damageDie % 2 === 0)) ? 2 : 1;
    let armor = 0;
    if (advanced && config.armorRule !== 'none') {
      armor = equipment.armor === 'chainmail' || (equipment.armor === 'leather' && config.armorRule !== 'chainmail') ? 1 : 0;
    }
    const damageSources = advanced && config.damageMode === 'all' ? fight.enemies.filter(row => row.hp > 0) : [enemy];
    const injury = hit ? 0 : damageSources.reduce((sum, row) => sum + Math.max(0, row.injury * multiplier - armor), 0);
    const unarmedLoss = fight.unarmed && !config.unarmedRollPenalty ? unarmedDamage : 0;
    const staffLoss = advanced && config.staffThreat && equipment.staff && doubles ? 1 : 0;
    const playerLoss = injury + unarmedLoss + staffLoss;
    enemy.hp -= enemyLoss; enemy.rounds--; fight.rounds++;
    fight.hp = Math.max(0, fight.hp - playerLoss);
    if (!hit) {fight.advantage = false; if (advanced) fight.enemyWins++;}
    if (hit) fight.restrained = false;
    const event = {name:enemy.name, dice, total, attack, enemyLoss, playerLoss, hit};
    if (advanced) Object.assign(event, {connected, confirmation, damageDie, armor, multiplier, staffLoss});
    fight.events = [event];
    let resolution;
    if (!fight.hp) {fight.outcome = 'loss'; resolution = 'death';}
    else if (fight.enemies.every(row => row.hp === 0)) {fight.outcome = 'win'; resolution = 'victory';}
    else if (advanced && config.rescueAfter && equipment.bracelet && fight.rounds >= config.rescueAfter) {
      fight.outcome = 'win'; resolution = 'rescued';
    } else if (advanced && config.poisonAfter && fight.enemyWins >= config.poisonAfter) {
      fight.outcome = 'loss'; resolution = 'poison';
    } else if (enemy.hp > 0 && enemy.rounds <= 0) {fight.outcome = 'loss'; resolution = 'time';}
    if (fight.outcome) fight.destination = resolution === 'rescued' ? config.rescueRoute ?? null : config[fight.outcome] ?? null;
    if (advanced) fight.resolution = resolution ?? null;
    return fight;
  }
  return {startFight, round};
}
const legacy = createCombatRules();
export const startFight = legacy.startFight;
export const round = legacy.round;
