// Resolve Craven Manor encounters and time abilities without advancing the story.
const statuses = new Set(['fighting', 'win', 'loss', 'draw', 'fled', 'cancelled']);
const integer = (n, min = 0, max = 1000000) => {
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new RangeError('Invalid combat value');
  return n;
};
const special = dice => dice[0] === dice[1] || dice[0] + dice[1] > 10;
const sum = dice => dice.reduce((a, b) => a + b, 0);
const copy = value => structuredClone(value);
const abilityKeys = ['absorber', 'reducer', 'forward', 'freeze', 'secondSelf'];

export function normalizeEncounter(source) {
  if (!source || typeof source.name !== 'string' || !source.name.trim() || source.name.length > 200) throw new RangeError('Invalid opponent');
  const opponent = {...copy(source), name:source.name.trim(), section:integer(source.section ?? 0),
    rounds:integer(source.rounds, 6, 120), rules:{...source.rules}};
  if (opponent.rounds % 6) throw new RangeError('Combat uses six-round rows');
  for (const key of ['playerBonus', 'enemyBonus']) integer(opponent.rules[key] ?? 0, -100, 100);
  integer(opponent.rules.enemyHit ?? 1, 1, 10);
  for (const key of ['pair', 'escape', 'disarm', 'phantom', 'boxing', 'gunfight']) {
    if (opponent.rules[key] != null && typeof opponent.rules[key] !== 'boolean') throw new RangeError('Invalid combat rule');
  }
  return opponent;
}
function validatePlayer(player) {
  integer(player.ttp); integer(player.maxTtp, Math.max(1, player.ttp));
  for (const key of abilityKeys) if (typeof player[key] !== 'boolean') throw new RangeError('Invalid time ability');
}
export function validateFight(fight) {
  if (!fight || fight.rulesVersion !== 1 || !statuses.has(fight.status)) throw new RangeError('Invalid saved combat');
  normalizeEncounter(fight.opponent); validatePlayer(fight.player);
  integer(fight.round, 0, 1000000); integer(fight.revision, 0, Number.MAX_SAFE_INTEGER - 1);
  for (const key of ['playerHits', 'enemyHits', 'rowPlayer', 'rowEnemy', 'cloneLeft', 'freezeLeft']) integer(fight[key]);
  if (!Array.isArray(fight.events) || fight.events.length > 120) throw new RangeError('Invalid combat log');
  if (fight.result && !statuses.has(fight.result)) throw new RangeError('Invalid combat result');
  return fight;
}
// Checkpoints contain only physical combat state. Never nest rewind checkpoints.
function snapshot(fight) {
  const {checkpoints, events, revision, recorded, ...state} = fight;
  return {state:copy(state), eventCount:events.length};
}
function event(fight, kind, data = {}) {
  fight.events.push({kind, round:fight.round, ...data});
  // A bounded log also bounds persisted fight size during repeated rewinds.
  if (fight.events.length > 120) {
    fight.events.shift();
    for (const checkpoint of Object.values(fight.checkpoints)) checkpoint.eventCount = Math.max(0, checkpoint.eventCount - 1);
  }
}
export function startFight(player, encounter) {
  const current = {ttp:10, maxTtp:10, ...Object.fromEntries(abilityKeys.map(key => [key, false])), ...copy(player)};
  validatePlayer(current);
  const fight = {rulesVersion:1, revision:0, status:'fighting', result:null, round:0, player:current,
    opponent:normalizeEncounter(encounter), playerHits:0, enemyHits:0, rowPlayer:0, rowEnemy:0,
    playerAdvantage:0, enemyAdvantage:0, enemies:encounter.rules?.pair ? 2 : 1,
    playerStreak:0, enemyStreak:0, cloneLeft:0, freezeLeft:0, used:{forward:false, freeze:false, secondSelf:false},
    phantom:{phase:'ground', left:3}, gun:{phase:'player', index:0, wounds:[0, 0, 0, 0], playerWounds:0},
    pending:null, checkpoints:{}, events:[]};
  fight.checkpoints.fight = snapshot(fight);
  fight.checkpoints.row = snapshot(fight);
  return validateFight(fight);
}
function spend(fight, amount) {
  integer(amount);
  if (amount > fight.player.ttp) throw new RangeError('Not enough time points');
  fight.player.ttp -= amount;
}
function dice(action, key, random) {
  const supplied = action.dice?.[key];
  const values = supplied === undefined ? [0, 0].map(() => {
    const r = random();
    if (!(r >= 0 && r < 1)) throw new RangeError('Invalid die generator');
    return Math.floor(r * 6) + 1;
  }) : copy(supplied);
  if (!Array.isArray(values) || values.length !== 2) throw new RangeError('Supply two dice');
  values.forEach(n => integer(n, 1, 6));
  return values;
}
function advancePhantom(fight, fed = false) {
  const phase = fight.phantom;
  if (!fight.opponent.rules.phantom) return;
  if (phase.phase === 'drop') {
    phase.phase = fed ? 'feeding' : 'ceiling'; phase.left = fed ? 3 : 2;
  } else if (--phase.left <= 0) {
    phase.phase = phase.phase === 'ground' || phase.phase === 'feeding' ? 'ceiling' : 'drop';
    phase.left = phase.phase === 'ceiling' ? 2 : 1;
  }
}
function finishRound(fight, playerHits, enemyHits, {skipped = false, fed = false} = {}) {
  fight.round++;
  fight.playerHits += playerHits; fight.enemyHits += enemyHits;
  fight.rowPlayer += playerHits; fight.rowEnemy += enemyHits;
  fight.playerStreak = playerHits ? fight.playerStreak + 1 : 0;
  fight.enemyStreak = enemyHits ? fight.enemyStreak + 1 : 0;
  if (!fight.result && fight.opponent.rules.boxing && (fight.playerStreak >= 2 || fight.enemyStreak >= 2)) {
    fight.result = fight.playerStreak >= 2 && fight.enemyStreak >= 2 ? 'draw' : fight.playerStreak >= 2 ? 'win' : 'loss';
    event(fight, 'knockout', {player:fight.playerStreak >= 2, enemy:fight.enemyStreak >= 2});
  }
  event(fight, skipped ? 'skipped' : 'round', {playerHits, enemyHits});
  advancePhantom(fight, fed);
  if (fight.cloneLeft) fight.cloneLeft--;
  if (fight.round % 6 === 0) {
    const winner = Math.sign(fight.rowPlayer - fight.rowEnemy);
    fight.playerAdvantage = winner > 0 ? 1 : 0; fight.enemyAdvantage = winner < 0 ? 1 : 0;
    if (winner > 0 && fight.player.absorber) fight.player.ttp = Math.min(fight.player.maxTtp, fight.player.ttp + 2);
    if (winner > 0 && fight.enemies === 2) {fight.enemies = 1; event(fight, 'opponentRemoved');}
    event(fight, 'row', {winner, playerHits:fight.rowPlayer, enemyHits:fight.rowEnemy});
    fight.rowPlayer = fight.rowEnemy = 0;
  }
  if (!fight.result && fight.round >= fight.opponent.rounds) {
    fight.result = fight.playerHits > fight.enemyHits ? 'win' : fight.playerHits < fight.enemyHits ? 'loss' : 'draw';
  }
  fight.pending = null;
}
function prepareRoll(fight, action, random) {
  if (fight.pending || fight.result) throw new RangeError('Resolve the current roll first');
  if (fight.round % 6 === 0) fight.checkpoints.row = snapshot(fight);
  fight.checkpoints.roll = snapshot(fight);
  if (fight.opponent.rules.gunfight) {
    const shot = dice(action, 'shot', random);
    fight.pending = {shot, dodge:fight.gun.phase === 'enemy' && (special(shot) || shot.includes(6)) ? dice(action, 'dodge', random) : null};
  } else {
    fight.pending = {player:dice(action, 'player', random), enemy:dice(action, 'enemy', random)};
    if (fight.cloneLeft && fight.enemies === 1) fight.pending.player2 = dice(action, 'player2', random);
    if (fight.enemies === 2 && !fight.cloneLeft) fight.pending.enemy2 = dice(action, 'enemy2', random);
  }
  event(fight, 'dice', copy(fight.pending));
}
function gunRound(fight, action) {
  const {shot, dodge} = fight.pending, gun = fight.gun;
  const hit = shot[0] === shot[1] ? 2 : shot.includes(6) ? 1 : 0;
  const boost = integer(action.boost ?? 0, 0, 2);
  if (gun.phase === 'player') {
    if (boost) throw new RangeError('Time points only modify dodge rolls');
    gun.wounds[gun.index] = Math.min(2, gun.wounds[gun.index] + hit);
    event(fight, 'shot', {who:'player', target:gun.index, wounds:hit});
  } else {
    if (!dodge && boost) throw new RangeError('No dodge needed');
    spend(fight, boost);
    const dodged = Boolean(dodge && sum(dodge) + boost >= sum(shot));
    if (hit && !dodged) gun.playerWounds = Math.min(2, gun.playerWounds + hit);
    event(fight, 'shot', {who:'enemy', target:gun.index, wounds:dodged ? 0 : hit, dodged});
  }
  fight.pending = null;
  if (gun.playerWounds >= 2) fight.result = 'loss';
  else if (gun.wounds.every(n => n >= 2)) fight.result = 'win';
  if (fight.result) return;
  do {
    gun.index++;
    if (gun.index === 4) {
      gun.index = 0; gun.phase = gun.phase === 'player' ? 'enemy' : 'player';
      if (gun.phase === 'player') fight.round++;
    }
  } while (gun.wounds[gun.index] >= 2);
}
function resolveRound(fight, action, random) {
  const pending = fight.pending, rules = fight.opponent.rules;
  if (!pending) throw new RangeError('Roll the dice first');
  if (rules.gunfight) return gunRound(fight, action);
  const boost = integer(action.boost ?? 0, 0, 2), secondBoost = integer(action.secondBoost ?? 0, 0, 2);
  if (secondBoost && (!pending.player2 || rules.boxing)) throw new RangeError('No second boost available');
  spend(fight, boost + secondBoost);
  const rawSpecial = special(pending.player);
  if (rawSpecial && rules.escape && action.choice === 'escape') {
    if (boost || secondBoost) throw new RangeError('Special escape uses unmodified dice');
    fight.result = 'fled'; fight.pending = null; event(fight, 'escaped'); return;
  }
  if (rawSpecial && rules.disarm) {
    if (boost || secondBoost) throw new RangeError('Special disarm uses unmodified dice');
    if (!['hit', 'disarm'].includes(action.choice)) throw new RangeError('Choose a double hit or disarm attempt');
    if (action.choice === 'disarm') {
      const roll = dice(action, 'disarm', random);
      event(fight, 'disarm', {dice:roll, success:special(roll)});
      if (special(roll)) {fight.result = 'fled'; fight.pending = null; event(fight, 'disarmed'); return;}
      finishRound(fight, 0, 2); return;
    }
    finishRound(fight, 2, 0); return;
  }
  const phase = fight.phantom.phase;
  const playerBonus = (rules.playerBonus ?? 0) + fight.playerAdvantage + (rules.phantom && phase === 'ceiling' ? -4 : 0);
  const enemyBonus = (rules.enemyBonus ?? 0) + fight.enemyAdvantage;
  const player = sum(pending.player) + playerBonus + (rules.boxing ? 0 : boost);
  const enemy = sum(pending.enemy) + enemyBonus - (rules.boxing ? boost : 0);
  event(fight, 'comparison', {player, player2:pending.player2 ? sum(pending.player2) + playerBonus + secondBoost : null,
    enemies:[enemy, ...(pending.enemy2 ? [sum(pending.enemy2) + enemyBonus] : [])]});
  let playerHits = 0, enemyHits = 0, fed = false;
  if (pending.player2) {
    const second = sum(pending.player2) + playerBonus + secondBoost;
    playerHits = Number(player > enemy) + Number(second > enemy);
    enemyHits = !playerHits && player < enemy && second < enemy ? (rules.enemyHit ?? 1) : 0;
  } else if (pending.enemy2) {
    const other = sum(pending.enemy2) + enemyBonus;
    enemyHits = Number(enemy > player) + Number(other > player);
    playerHits = player > enemy && player > other ? 1 : 0;
  } else {
    playerHits = player > enemy ? 1 : 0;
    enemyHits = enemy > player ? (rules.enemyHit ?? 1) : 0;
  }
  if (rules.phantom) {
    if (phase === 'ceiling') enemyHits = 0;
    if (phase === 'drop' && enemyHits) {enemyHits = 2; fed = fight.round + 1 < fight.opponent.rounds;}
    if (phase === 'feeding') {
      if (rawSpecial) {fight.phantom = {phase:'ceiling', left:3}; event(fight, 'knockedOff');}
      else {fight.player.ttp = Math.max(0, fight.player.ttp - 2); event(fight, 'feeding');}
    }
  }
  if (rules.boxing) {
    const playerKO = rawSpecial || Boolean(pending.player2 && special(pending.player2)) || (playerHits > 0 && fight.playerStreak > 0);
    const enemyKO = special(pending.enemy) || (enemyHits > 0 && fight.enemyStreak > 0);
    if (playerKO || enemyKO) {
      fight.result = playerKO && enemyKO ? 'draw' : playerKO ? 'win' : 'loss';
      event(fight, 'knockout', {player:playerKO, enemy:enemyKO});
    }
  }
  finishRound(fight, playerHits, enemyHits, {fed});
}
function rewind(fight, kind) {
  const checkpoint = fight.checkpoints[kind];
  if (!checkpoint) throw new RangeError('Nothing to rewind');
  if (kind === 'row' && fight.opponent.rules.gunfight) throw new RangeError('No combat rows in a gunfight');
  const cost = fight.player.reducer ? 1 : {roll:2, row:5, fight:8}[kind];
  spend(fight, cost);
  const ttp = fight.player.ttp, revision = fight.revision, checkpoints = fight.checkpoints;
  const events = fight.events.slice(0, checkpoint.eventCount);
  Object.assign(fight, copy(checkpoint.state), {revision, checkpoints, events, recorded:false});
  fight.player.ttp = ttp;
  if (kind === 'fight') {delete checkpoints.roll; checkpoints.row = snapshot(fight);}
  else if (kind === 'row') delete checkpoints.roll;
  event(fight, 'rewind', {scope:kind, cost});
}
export function combatAction(previous, action, random = Math.random) {
  validateFight(previous);
  if (previous.status !== 'fighting' || action?.expectedRevision !== previous.revision) throw new RangeError('Stale combat action');
  const fight = copy(previous);
  if (action.kind === 'cancel') {fight.status = 'cancelled'; fight.pending = null;}
  else if (action.kind === 'finish') {
    if (!fight.result) throw new RangeError('The fight is not finished');
    fight.status = fight.result;
  } else if (action.kind === 'rewind') rewind(fight, action.scope);
  else if (action.kind === 'roll') prepareRoll(fight, action, random);
  else if (action.kind === 'resolve') resolveRound(fight, action, random);
  else if (['forward', 'freeze', 'secondSelf'].includes(action.kind)) {
    const ability = action.kind;
    if (fight.pending || fight.result || fight.opponent.rules.gunfight || !fight.player[ability] || fight.used[ability]) throw new RangeError('Ability unavailable');
    fight.used[ability] = true;
    if (ability === 'secondSelf') fight.cloneLeft = 3;
    else {
      const count = ability === 'freeze' ? 2 : action.die === undefined ? Math.floor(random() * 6) + 1 : integer(action.die, 1, 6);
      event(fight, ability, {count});
      for (let i = 0; i < count && !fight.result; i++) {
        if (fight.round % 6 === 0) fight.checkpoints.row = snapshot(fight);
        finishRound(fight, ability === 'freeze' ? 1 : 0, 0, {skipped:ability === 'forward'});
      }
    }
  } else throw new RangeError('Unknown combat action');
  fight.revision++;
  return validateFight(fight);
}
