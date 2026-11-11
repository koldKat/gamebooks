// Resolve independent Golden Dragon encounters from their printed two-dice charts.
const LIMIT = 1000000;
const outcomes = new Set(['fighting', 'win', 'loss', 'fled', 'paused', 'cancelled']);
function integer(value, min = 0, max = LIMIT) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
}
function name(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new RangeError('Invalid combat name');
  return value.trim();
}
export function normalizeDragonEncounter(source) {
  if (!source || !Array.isArray(source.profiles) || !source.profiles.length || source.profiles.length > 100
      || !Array.isArray(source.rows) || !source.rows.length || source.rows.length > 11) throw new RangeError('Invalid encounter');
  const encounter = structuredClone(source);
  encounter.name = name(source.name);
  encounter.profiles = source.profiles.map(profile => ({...profile, name:name(profile.name), hp:integer(profile.hp, source.allowDefeatedOpponents ? 0 : 1)}));
  if (!encounter.profiles.some(profile => profile.hp > 0)) throw new RangeError('No surviving opponent');
  let next = 2;
  encounter.rows = source.rows.map(row => {
    if (row.min !== next) throw new RangeError('Incomplete combat chart');
    const result = {...row, min:integer(row.min, 2, 12), max:integer(row.max, row.min, 12)};
    for (const key of ['playerDamage', 'enemyDamage', 'psiDamage', 'venomBites', 'paralysisHits']) result[key] = integer(row[key] ?? 0);
    for (const key of ['loss', 'win', 'pause']) {
      if (row[key] !== undefined && typeof row[key] !== 'boolean') throw new RangeError('Invalid combat outcome');
    }
    if (['loss', 'win', 'pause'].filter(key => row[key]).length > 1) throw new RangeError('Conflicting combat outcomes');
    next = result.max + 1;
    return result;
  });
  if (next !== 13) throw new RangeError('Incomplete combat chart');
  for (const key of ['stopAfterRounds', 'stopAfterDefeated', 'winAfterDefeated', 'winAfterWoundingHits', 'loseBelowHp', 'venomLimit', 'paralysisLimit', 'fleeAfterRounds']) {
    encounter[key] = integer(source[key] ?? 0);
  }
  encounter.fleeDamage = integer(source.fleeDamage ?? 3);
  for (const key of ['canFlee', 'sequential', 'allowDefeatedOpponents', 'psiSaveOnWound']) {
    if (source[key] !== undefined && typeof source[key] !== 'boolean') throw new RangeError('Invalid combat rule');
  }
  return encounter;
}
export function customDragonEncounter(profiles, {playerHitThrough = 6, playerDamage = 3, enemyDamage = 3} = {}) {
  integer(playerHitThrough, 2, 11); integer(playerDamage, 1); integer(enemyDamage, 1);
  return normalizeDragonEncounter({name:profiles[0]?.name, profiles, canFlee:true,
    rows:[{min:2, max:playerHitThrough, playerDamage}, {min:playerHitThrough + 1, max:12, enemyDamage}]});
}
function validatePlayer(player, starting = false) {
  name(player.name); integer(player.maxHp, 1); integer(player.hp, starting ? 1 : -LIMIT, player.maxHp);
  integer(player.psi, -LIMIT); integer(player.agility, -LIMIT); integer(player.rollModifier ?? 0, -10, 10);
  integer(player.firstRoundModifier ?? 0, -10, 10);
  if (player.woundDamage !== undefined) integer(player.woundDamage, 2, 4);
  if (player.progressiveRollBonus !== undefined && typeof player.progressiveRollBonus !== 'boolean') throw new RangeError('Invalid round bonus');
}
const modifier = (fight, completedRounds = fight.round) => (fight.player.rollModifier ?? 0)
  + (completedRounds === 0 ? fight.player.firstRoundModifier ?? 0 : 0)
  + (fight.player.progressiveRollBonus ? completedRounds : 0);
const woundDamage = (fight, row) => row.enemyDamage > 0 ? fight.player.woundDamage ?? row.enemyDamage : 0;
export function validateDragonFight(fight) {
  if (!fight || fight.rulesVersion !== 1 || !outcomes.has(fight.status)) throw new RangeError('Invalid saved combat');
  validatePlayer(fight.player); normalizeDragonEncounter(fight.opponent);
  integer(fight.revision, 0, Number.MAX_SAFE_INTEGER - 1); integer(fight.round, 0, Number.MAX_SAFE_INTEGER - 1);
  integer(fight.venomBites); integer(fight.paralysisHits); integer(fight.hitsTaken);
  integer(fight.hitsDealt ?? 0);
  if (!Array.isArray(fight.enemies) || fight.enemies.length !== fight.opponent.profiles.length) throw new RangeError('Invalid combatants');
  fight.enemies.forEach((enemy, index) => {
    if (enemy.name !== fight.opponent.profiles[index].name) throw new RangeError('Changed combatant');
    integer(enemy.hp, -LIMIT, fight.opponent.profiles[index].hp);
  });
  if (!Array.isArray(fight.events) || fight.events.length > 100) throw new RangeError('Invalid combat log');
  for (const event of fight.events) {
    if (!event || !['round', 'flee', 'unresolved', 'cancel', 'psiSave'].includes(event.kind)) throw new RangeError('Invalid combat event');
    integer(event.round, 0, fight.round + 1);
    if (event.kind === 'cancel') continue;
    validateDice(event.dice);
    const rolled = event.dice[0] + event.dice[1];
    if (event.kind === 'round') {
      integer(event.target, 0, fight.enemies.length - 1);
      if (typeof event.manualRuling !== 'boolean' || !event.manualRuling && event.total !== rolled + modifier(fight, event.round - 1)) throw new RangeError('Invalid chart total');
      const row = fight.opponent.rows.find(row => event.total >= row.min && event.total <= row.max);
      if (!row || ['playerDamage', 'psiDamage'].some(key => event[key] !== (row[key] ?? 0))
          || event.enemyDamage !== woundDamage(fight, row)) throw new RangeError('Invalid chart result');
    } else if (event.kind === 'flee') {
      if (event.total !== rolled || event.playerDamage !== (rolled > fight.player.agility ? fight.opponent.fleeDamage ?? 3 : 0)) throw new RangeError('Invalid escape result');
    } else if (event.kind === 'psiSave') {
      integer(event.psiBefore, 1);
      if (!fight.opponent.psiSaveOnWound || event.total !== rolled || event.psiDamage !== (rolled > event.psiBefore ? 1 : 0)) throw new RangeError('Invalid PSI save');
    } else if (event.total !== rolled + modifier(fight, event.round - 1) || event.total >= 2 && event.total <= 12) throw new RangeError('Invalid unresolved result');
  }
  if (fight.unresolved) {
    if (fight.status !== 'fighting') throw new RangeError('Invalid pending ruling');
    validateDice(fight.unresolved.dice);
    integer(fight.unresolved.target, 0, fight.enemies.length - 1);
    const total = fight.unresolved.dice[0] + fight.unresolved.dice[1] + modifier(fight);
    if (fight.unresolved.total !== total || total >= 2 && total <= 12) throw new RangeError('Invalid pending ruling');
  }
  if (fight.pendingPsiSave) {
    const last = fight.events.at(-1);
    if (fight.status !== 'fighting' || fight.unresolved || fight.pendingPsiSave.round !== fight.round
        || last?.kind !== 'round' || last.round !== fight.round || last.playerDamage <= 0
        || !fight.opponent.psiSaveOnWound || fight.player.psi <= 0) throw new RangeError('Invalid pending PSI save');
  }
  return fight;
}
export function startDragonFight(player, encounter) {
  validatePlayer(player, true);
  const opponent = normalizeDragonEncounter(encounter);
  if (opponent.psiSaveOnWound && player.psi <= 0) throw new RangeError('PSI must be positive');
  return validateDragonFight({rulesVersion:1, player:structuredClone(player), opponent,
    enemies:opponent.profiles.map(profile => ({name:profile.name, hp:profile.hp})), status:'fighting',
    round:0, revision:0, venomBites:0, paralysisHits:0, hitsTaken:0, hitsDealt:0, unresolved:null, events:[]});
}
function validateDice(dice) {
  if (!Array.isArray(dice) || dice.length !== 2) throw new RangeError('Enter two dice');
  dice.forEach(die => integer(die, 1, 6));
  return dice;
}
function rollDice(supplied, random) {
  if (supplied !== undefined) return [...validateDice(supplied)];
  return Array.from({length:2}, () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid dice source');
    return Math.floor(value * 6) + 1;
  });
}
const record = (fight, event) => { fight.events = [...fight.events.slice(-99), event]; };
export function canDragonFlee(fight) {
  return fight.status === 'fighting' && !fight.unresolved && !fight.pendingPsiSave && Boolean(fight.opponent.canFlee)
    && fight.round >= fight.opponent.fleeAfterRounds;
}
function resolve(fight, dice, total, target, manualRuling) {
  const row = fight.opponent.rows.find(row => total >= row.min && total <= row.max);
  if (!row) throw new RangeError('No printed chart result');
  const enemy = fight.enemies[target];
  fight.player.hp -= row.playerDamage;
  fight.player.psi -= row.psiDamage;
  if (row.playerDamage > 0) fight.hitsTaken++;
  const dealt = woundDamage(fight, row);
  enemy.hp -= dealt;
  if (dealt > 0) fight.hitsDealt = (fight.hitsDealt ?? 0) + 1;
  fight.venomBites += row.venomBites;
  fight.paralysisHits += row.paralysisHits;
  fight.round++;
  record(fight, {kind:'round', round:fight.round, dice, total, target, manualRuling,
    playerDamage:row.playerDamage, enemyDamage:dealt, psiDamage:row.psiDamage});
  const defeated = fight.enemies.filter(enemy => enemy.hp <= 0).length - fight.opponent.profiles.filter(enemy => enemy.hp <= 0).length;
  if (row.loss || fight.player.hp <= 0
      || fight.opponent.loseBelowHp && fight.player.hp < fight.opponent.loseBelowHp
      || fight.opponent.venomLimit && fight.venomBites >= fight.opponent.venomLimit
      || fight.opponent.paralysisLimit && fight.paralysisHits >= fight.opponent.paralysisLimit) fight.status = 'loss';
  else if (row.win
      || fight.opponent.winAfterDefeated && defeated >= fight.opponent.winAfterDefeated
      || fight.opponent.winAfterWoundingHits && fight.hitsDealt >= fight.opponent.winAfterWoundingHits) fight.status = 'win';
  else if (row.pause || fight.opponent.stopAfterDefeated && defeated >= fight.opponent.stopAfterDefeated) fight.status = 'paused';
  else if (fight.enemies.every(enemy => enemy.hp <= 0)) fight.status = 'win';
  else if (fight.opponent.stopAfterRounds && fight.round >= fight.opponent.stopAfterRounds) fight.status = 'paused';
  if (fight.status === 'fighting' && fight.opponent.psiSaveOnWound && row.playerDamage > 0) {
    if (fight.player.psi <= 0) fight.status = 'loss';
    else fight.pendingPsiSave = {round:fight.round};
  }
}
export function dragonAction(source, action, random = Math.random) {
  validateDragonFight(source);
  if (source.status !== 'fighting' || action.expectedRevision !== source.revision) throw new RangeError('Stale combat action');
  const fight = structuredClone(source);
  if (action.kind === 'cancel') {
    fight.status = 'cancelled'; fight.unresolved = null; fight.pendingPsiSave = null; record(fight, {kind:'cancel', round:fight.round});
  } else if (action.kind === 'psiSave') {
    if (!fight.pendingPsiSave) throw new RangeError('No pending PSI save');
    const dice = rollDice(action.dice, random), total = dice[0] + dice[1], psiBefore = fight.player.psi;
    const psiDamage = total > psiBefore ? 1 : 0;
    fight.player.psi -= psiDamage; fight.pendingPsiSave = null;
    if (fight.player.psi <= 0) fight.status = 'loss';
    record(fight, {kind:'psiSave', round:fight.round, dice, total, psiBefore, psiDamage});
  } else if (action.kind === 'flee') {
    if (!canDragonFlee(fight)) throw new RangeError('Cannot flee');
    const dice = rollDice(action.dice, random), total = dice[0] + dice[1];
    const damage = total > fight.player.agility ? fight.opponent.fleeDamage ?? 3 : 0;
    fight.player.hp -= damage; fight.status = fight.player.hp <= 0 ? 'loss' : 'fled';
    record(fight, {kind:'flee', round:fight.round, dice, total, playerDamage:damage});
  } else if (action.kind === 'roll') {
    if (fight.pendingPsiSave) throw new RangeError('Resolve the pending PSI save first');
    if (fight.unresolved) throw new RangeError('Resolve the pending ruling first');
    const target = integer(action.target ?? 0, 0, fight.enemies.length - 1);
    if (fight.enemies[target].hp <= 0) throw new RangeError('Opponent already defeated');
    if (fight.opponent.sequential && target !== fight.enemies.findIndex(enemy => enemy.hp > 0)) throw new RangeError('Fight opponents in order');
    const dice = rollDice(action.dice, random), total = dice[0] + dice[1] + modifier(fight);
    if (total < 2 || total > 12) {
      fight.unresolved = {dice, total, target};
      record(fight, {kind:'unresolved', round:fight.round + 1, dice, total});
    } else resolve(fight, dice, total, target, false);
  } else if (action.kind === 'adjudicate') {
    if (!fight.unresolved) throw new RangeError('No pending ruling');
    const total = integer(action.printedTotal, 2, 12), pending = fight.unresolved;
    fight.unresolved = null; resolve(fight, pending.dice, total, pending.target, true);
  } else throw new RangeError('Unknown combat action');
  fight.revision++;
  return validateDragonFight(fight);
}
