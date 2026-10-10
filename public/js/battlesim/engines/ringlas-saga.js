export function startRinglasFight(d, setup) {
  if (d.playerStamina <= 0) return false;
  if (d.enemyId === 'armoredknight' && d.drunk) {
    d.playerStamina = Math.max(0, d.playerStamina - 5);
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
  d.fightAlly = d.enemyId === 'armoredknight' && !!d.allyEnabled;
  d.allyTarget = d.allyTarget ?? 4;
  d.allyStamina = d.allyStamina ?? 6;
  d.playerStamina += d.multi ? 5 : d.enemyId === 'simaut' && d.simautBonus !== false ? 5 : 0;
  d.initialPlayerStamina = d.playerStamina;
  d.initialEnemyStamina = d.enemyStamina;
  d.banditResumed = false;
  d.pausedSection = null;
  d.over = false;
  d.winner = null;
  d.started = true;
  return true;
}

export function resumeRinglasFight(d) {
  if (d.rulesVersion !== 1 || d.enemyId !== 'bandit' || d.pausedSection !== 130 || d.playerStamina <= 0) return false;
  d.pausedSection = null;
  d.banditResumed = true;
  return true;
}

function checkpoint(d) {
  if (d.playerStamina <= 0) {
    d.over = true;
    d.winner = 'enemy';
  } else if (d.enemyStamina <= 0) {
    d.over = true;
    d.winner = 'player';
  } else if (d.enemyId === 'bandit' && !d.banditResumed && d.enemyStamina < d.initialEnemyStamina) {
    d.pausedSection = 130;
  } else if (d.enemyId === 'knight' && d.enemyStamina <= 2) {
    d.pausedSection = 52;
  } else if (d.enemyId === 'snowwarrior' && d.initialPlayerStamina - d.playerStamina >= 8) {
    d.pausedSection = 142;
  } else if (d.enemyId === 'icelion' && d.enemyStamina <= 4) {
    d.pausedSection = 215;
  } else if (d.enemyId === 'spider' && d.enemyStamina <= 1) {
    d.pausedSection = 244;
  }
  return d.over || !!d.pausedSection;
}

export function ringlasRound(d, roll) {
  if (d.rulesVersion !== 1 || !d.started || d.over || d.pausedSection) return [];
  const events = [];
  if (checkpoint(d)) return events;
  function attack(actor, target, damage, modifier = 0, less = false) {
    const result = roll() + modifier;
    const hit = less ? result < target : result > target;
    if (hit) d.enemyStamina = Math.max(0, d.enemyStamina - damage);
    events.push({ actor, roll: result, target, hit, stamina: d.enemyStamina });
    return checkpoint(d);
  }
  if (attack('player', d.enemyTarget, 1, d.playerBonus || 0)) return events;
  if (d.fightMulti && attack('horse', d.enemyTarget, 2, 0, true)) return events;
  if (d.fightAlly && d.allyStamina > 0 && attack('ally', d.enemyTarget, 1)) return events;
  const enemyRoll = roll() - (d.enemyPenalty || 0);
  const hit = d.fightMulti ? enemyRoll > d.playerTarget : enemyRoll < d.playerTarget;
  if (hit) d.playerStamina = Math.max(0, d.playerStamina - 1);
  events.push({ actor: 'enemy', roll: enemyRoll, target: d.playerTarget, hit, stamina: d.playerStamina });
  if (checkpoint(d)) return events;
  if (d.fightAlly && d.allyStamina > 0) {
    const allyRoll = roll() - (d.enemyPenalty || 0);
    const allyHit = allyRoll > d.allyTarget;
    if (allyHit) d.allyStamina = Math.max(0, d.allyStamina - 1);
    events.push({ actor: 'allyEnemy', roll: allyRoll, target: d.allyTarget, hit: allyHit, stamina: d.allyStamina });
  }
  return events;
}
