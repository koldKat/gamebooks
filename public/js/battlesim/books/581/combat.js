// Resolve one Savage Realms fight, leaving story checks and allied-hit allocation to the player.
const POWER_KEYS = ['blade', 'deathbringer', 'fire', 'mirror', 'shield', 'horn', 'poison', 'resurrection'];
const STATES = ['fighting', 'win', 'loss', 'cancelled'];

function number(value, min = 0, max = 10000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat number');
  return value;
}
function name(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new RangeError('Invalid combat name');
  return value.trim();
}
function actor(source) {
  const hp = number(source?.hp), maxHp = number(source.maxHp ?? hp, 1);
  if (hp > maxHp) throw new RangeError('Life Force exceeds maximum');
  return {name:name(source.name ?? source.displayName), hp, maxHp,
    skill:number(source.skill, 0, 1000), diceModifier:number(source.diceModifier ?? 0, -6, 6),
    undead:Boolean(source.undead), stopHp:number(source.stopHp ?? 0, 0, maxHp - 1)};
}
export function normalizeEncounter(source) {
  if (!source || !Array.isArray(source.profiles) || !source.profiles.length || source.profiles.length > 12) {
    throw new RangeError('Invalid encounter');
  }
  const rules = source.rules ?? {}, profiles = source.profiles.map(profile => {
    const normalized = actor(profile);
    if (normalized.hp <= normalized.stopHp) throw new RangeError('Opponent already defeated');
    return {...normalized, count:number(profile.count ?? 1, 1, 12)};
  });
  const result = {name:name(source.name), profiles, rules:{
    playerDiceModifier:number(rules.playerDiceModifier ?? 0, -6, 6),
    enemyDiceModifier:number(rules.enemyDiceModifier ?? 0, -6, 6)},
  };
  if (source.key != null) result.key = name(source.key);
  if (source.section != null) result.section = number(source.section, 1, 1000000);
  if (rules.variableCount) {
    const min = number(rules.variableCount.min, 1, 12), max = number(rules.variableCount.max, min, 12);
    if (profiles.length !== 1 || profiles[0].count !== 1) throw new RangeError('Invalid variable group');
    result.rules.variableCount = {min, max};
  }
  if (source.sourceNotes) {
    if (!Array.isArray(source.sourceNotes) || source.sourceNotes.length > 20) throw new RangeError('Invalid source notes');
    result.sourceNotes = source.sourceNotes.map(note => {
      if (typeof note !== 'string' || note.length > 2000) throw new RangeError('Invalid source note');
      return note;
    });
  }
  return result;
}
function currentEnemy(fight) { return fight.enemies[fight.active]; }
function settled(fight) {
  while (fight.active < fight.enemies.length && currentEnemy(fight).hp <= currentEnemy(fight).stopHp) fight.active++;
  fight.result = fight.player.hp === 0 ? 'loss' : fight.active === fight.enemies.length ? 'win' : null;
}
export function startFight(player, encounter, setup = {}) {
  const opponent = normalizeEncounter(encounter), hero = actor({...player, name:player.name ?? 'Player'});
  if (!hero.hp) throw new RangeError('Enter current Life Force');
  const enemies = opponent.profiles.flatMap(profile => Array.from({length:profile.count}, () => actor(profile)));
  if (opponent.rules.variableCount) {
    const limits = opponent.rules.variableCount, count = number(setup.count, limits.min, limits.max);
    enemies.splice(0, enemies.length, ...Array.from({length:count}, () => actor(opponent.profiles[0])));
  }
  if (enemies.length > 12) throw new RangeError('Too many opponents');
  const powers = Object.fromEntries(POWER_KEYS.map(key => [key, number(setup.powers?.[key] ?? 0, 0, 99)]));
  const fight = {family:'savage-realms', rulesVersion:1, opponent, player:hero,
    companion:setup.companion ? actor(setup.companion) : null, enemies, active:0,
    powers, playerBonus:number(setup.playerBonus ?? 0, -6, 6),
    status:'fighting', result:null, pending:null, round:0, revision:0, playerWounded:false, events:[]};
  return validateFight(fight);
}
export function validateFight(fight) {
  if (!fight || fight.family !== 'savage-realms' || fight.rulesVersion !== 1 || !STATES.includes(fight.status)
      || !Array.isArray(fight.enemies) || !fight.enemies.length || fight.enemies.length > 12
      || !Array.isArray(fight.events) || fight.events.length > 100) throw new RangeError('Invalid saved fight');
  normalizeEncounter(fight.opponent); actor(fight.player);
  if (fight.companion) actor(fight.companion);
  fight.enemies.forEach(actor);
  number(fight.active, 0, fight.enemies.length); number(fight.revision); number(fight.round);
  number(fight.playerBonus, -6, 6);
  for (const key of POWER_KEYS) number(fight.powers?.[key], 0, 99);
  const next = fight.enemies.findIndex(enemy => enemy.hp > enemy.stopHp);
  if (fight.active !== (next < 0 ? fight.enemies.length : next)) throw new RangeError('Invalid active opponent');
  const expected = !fight.player.hp ? 'loss' : next < 0 ? 'win' : null;
  if (fight.status === 'fighting' && fight.result !== expected
      || fight.status === 'win' && expected !== 'win'
      || fight.status === 'loss' && expected !== 'loss') throw new RangeError('Invalid fight result');
  if (typeof fight.playerWounded !== 'boolean') throw new RangeError('Invalid wound record');
  if (fight.pending) {
    if (fight.result || fight.status !== 'fighting') throw new RangeError('Invalid pending round');
    for (const key of ['player', 'enemy']) number(fight.pending[key], 1, 6);
    if (fight.pending.companion != null) number(fight.pending.companion, 1, 6);
  }
  return fight;
}
function roll(value, random) {
  if (value !== undefined) return number(value, 1, 6);
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new RangeError('Invalid random roll');
  return Math.floor(draw * 6) + 1;
}
function modifier(fight, who) {
  if (who === 'enemy') return currentEnemy(fight).diceModifier + fight.opponent.rules.enemyDiceModifier;
  if (who === 'companion') return fight.companion.diceModifier;
  return fight.player.diceModifier + fight.opponent.rules.playerDiceModifier + fight.playerBonus;
}
export function roundTotals(fight) {
  validateFight(fight);
  if (!fight.pending) throw new RangeError('Roll first');
  const result = {player:fight.pending.player + fight.player.skill + modifier(fight, 'player'),
    enemy:fight.pending.enemy + currentEnemy(fight).skill + modifier(fight, 'enemy')};
  if (fight.pending.companion != null) result.companion = fight.pending.companion + fight.companion.skill + modifier(fight, 'companion');
  return result;
}
function damage(fight, who, target, die, random) {
  if (!['player', 'companion', 'enemy'].includes(who) || !['player', 'companion', 'enemy'].includes(target)
      || (who === 'enemy') === (target === 'enemy')) throw new RangeError('Invalid hit allocation');
  if ((who === 'companion' || target === 'companion') && !fight.companion?.hp) throw new RangeError('Companion unavailable');
  const victim = target === 'enemy' ? currentEnemy(fight) : fight[target];
  const raw = roll(die, random), amount = Math.max(0, raw + modifier(fight, who));
  const dealt = Math.min(victim.hp, amount); victim.hp -= dealt;
  if (target === 'player' && dealt > 0) fight.playerWounded = true;
  return {who, target, die:raw, amount:dealt};
}
export function combatAction(source, action, random = Math.random) {
  validateFight(source);
  if (source.status !== 'fighting' || !action || action.expectedRevision !== source.revision) throw new RangeError('Stale combat action');
  const fight = structuredClone(source), event = {kind:action.kind, round:fight.round};
  if (action.kind === 'finish') {
    if (!fight.result) throw new RangeError('Fight is not finished');
    fight.status = fight.result;
  } else if (action.kind === 'cancel') {
    fight.status = 'cancelled'; fight.result = null; fight.pending = null;
  } else if (action.kind === 'resurrect') {
    if (fight.result !== 'loss' || !fight.powers.resurrection) throw new RangeError('Resurrection unavailable');
    fight.player.hp = number(action.hp, 1, fight.player.maxHp); fight.powers.resurrection--;
    fight.pending = null; fight.result = null; settled(fight); event.hp = fight.player.hp;
  } else {
    if (fight.result) throw new RangeError('Review the result first');
    if (action.kind === 'roll') {
      if (fight.pending) throw new RangeError('Resolve the previous round');
      fight.pending = {player:roll(action.dice?.player, random), enemy:roll(action.dice?.enemy, random)};
      if (fight.companion?.hp) fight.pending.companion = roll(action.dice?.companion, random);
      event.dice = structuredClone(fight.pending);
    } else if (action.kind === 'resolve') {
      if (!fight.pending) throw new RangeError('Roll first');
      event.dice = structuredClone(fight.pending); event.hits = [];
      if (fight.pending.companion != null) {
        if (!Array.isArray(action.hits) || action.hits.length > 3) throw new RangeError('Allocate the allied round explicitly');
        const attackers = new Set();
        for (const hit of action.hits) {
          if (attackers.has(hit.who)) throw new RangeError('Duplicate attacker');
          attackers.add(hit.who);
          event.hits.push(damage(fight, hit.who, hit.target, hit.die, random));
        }
        event.manualAlliedResolution = true;
      } else {
        const totals = roundTotals(source);
        if (totals.player !== totals.enemy) event.hits.push(damage(fight,
          totals.player > totals.enemy ? 'player' : 'enemy', totals.player > totals.enemy ? 'enemy' : 'player', action.die, random));
      }
      fight.pending = null; fight.round++; settled(fight);
    } else if (action.kind === 'power') {
      const key = action.power;
      if (fight.pending || !POWER_KEYS.includes(key) || key === 'resurrection' || !fight.powers[key]) throw new RangeError('Power unavailable');
      const enemy = currentEnemy(fight); event.power = key;
      if (key === 'blade' || key === 'deathbringer') {
        if (enemy.hp > 25) throw new RangeError('Opponent is too strong');
        enemy.hp = 0;
      } else if (key === 'fire') {
        const eligible = fight.enemies.filter(enemy => enemy.hp > enemy.stopHp && enemy.hp <= 25);
        if (!eligible.length) throw new RangeError('No eligible opponent');
        eligible.forEach(enemy => {enemy.hp = 0;});
      } else if (key === 'poison') {
        if (!enemy.undead) throw new RangeError('Poison only affects the undead');
        enemy.hp = Math.max(0, enemy.hp - 5);
      } else fight.enemies.forEach(enemy => {enemy.hp = 0;});
      fight.powers[key]--; settled(fight);
    } else throw new RangeError('Unsupported combat action');
  }
  fight.revision++; fight.events = [...fight.events.slice(-99), event];
  return validateFight(fight);
}
