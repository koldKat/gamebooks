export function startRinglasFight(d, setup, rules = setup, companionDefaults = rules.companion) {
  if (d.playerStamina <= 0) return false;
  if (rules.drunkPenalty && d.drunk) {
    d.playerStamina = Math.max(0, d.playerStamina - rules.drunkPenalty);
    if (!d.playerStamina) {
      d.over = true;
      d.winner = 'enemy';
      d.started = false;
      return false;
    }
  }
  d.enemyTarget = setup.target;
  d.enemyStamina = setup.stamina;
  d.multi = !!setup.multi;
  d.rulesVersion = 1;
  d.fightMulti = d.multi;
  d.fightAlly = !!rules.companion && !!d.allyEnabled;
  d.allyTarget = d.allyTarget ?? companionDefaults?.target;
  d.allyStamina = d.allyStamina ?? companionDefaults?.stamina;
  d.playerStamina += d.multi ? 5 : d.simautBonus !== false ? rules.playerBonus || 0 : 0;
  d.initialPlayerStamina = d.playerStamina;
  d.initialEnemyStamina = d.enemyStamina;
  d.banditResumed = false;
  d.pausedSection = null;
  d.over = false;
  d.winner = null;
  d.started = true;
  return true;
}

export function resumeRinglasFight(d, rules = {}) {
  if (d.rulesVersion !== 1 || !rules.pause?.resumable || d.pausedSection !== rules.pause.section || d.playerStamina <= 0) return false;
  d.pausedSection = null;
  d.banditResumed = true;
  return true;
}

function checkpoint(d, rules) {
  if (d.playerStamina <= 0) {
    d.over = true;
    d.winner = 'enemy';
  } else if (d.enemyStamina <= 0) {
    d.over = true;
    d.winner = 'player';
  } else {
    const pause = rules.pause;
    if (pause && (pause.kind === 'firstWound' && !d.banditResumed && d.enemyStamina < d.initialEnemyStamina
        || pause.kind === 'enemyStamina' && d.enemyStamina <= pause.threshold
        || pause.kind === 'playerLoss' && d.initialPlayerStamina - d.playerStamina >= pause.threshold)) {
      d.pausedSection = pause.section;
    }
  }
  return d.over || !!d.pausedSection;
}

export function ringlasRound(d, roll, rules = {}) {
  if (d.rulesVersion !== 1 || !d.started || d.over || d.pausedSection) return [];
  const events = [];
  if (checkpoint(d, rules)) return events;
  function attack(actor, target, damage, modifier = 0, less = false) {
    const result = roll() + modifier;
    const hit = less ? result < target : result > target;
    if (hit) d.enemyStamina = Math.max(0, d.enemyStamina - damage);
    events.push({ actor, roll: result, target, hit, stamina: d.enemyStamina });
    return checkpoint(d, rules);
  }
  if (attack('player', d.enemyTarget, 1, d.playerBonus || 0)) return events;
  if (d.fightMulti && attack('horse', d.enemyTarget, 2, 0, true)) return events;
  if (d.fightAlly && d.allyStamina > 0 && attack('ally', d.enemyTarget, 1)) return events;
  const enemyRoll = roll() - (d.enemyPenalty || 0);
  const hit = d.fightMulti ? enemyRoll > d.playerTarget : enemyRoll < d.playerTarget;
  if (hit) d.playerStamina = Math.max(0, d.playerStamina - 1);
  events.push({ actor: 'enemy', roll: enemyRoll, target: d.playerTarget, hit, stamina: d.playerStamina });
  if (checkpoint(d, rules)) return events;
  if (d.fightAlly && d.allyStamina > 0) {
    const allyRoll = roll() - (d.enemyPenalty || 0);
    const allyHit = allyRoll > d.allyTarget;
    if (allyHit) d.allyStamina = Math.max(0, d.allyStamina - 1);
    events.push({ actor: 'allyEnemy', roll: allyRoll, target: d.allyTarget, hit: allyHit, stamina: d.allyStamina });
  }
  return events;
}
