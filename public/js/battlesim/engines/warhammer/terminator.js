// Optional encounter rules. All opponents, statistics and destinations come
// from the installed roster, never from book-specific constants here.
export const isTerminatorFight = fight => fight.config.rulesVariant === 'terminator';

export function terminatorStats(fight, unit, player = unit === fight.character) {
  const result = { ws:unit.ws, s:unit.s, t:unit.t, aRanged:unit.aRanged, aClose:unit.aClose,
    armour:unit.armour, cover:unit.cover };
  if (!isTerminatorFight(fight)) return result;
  if (player) {
    if (fight.mode === 'advanced') {
      const modifier = fight.config.advancedFirstRoundsModifiers;
      if (modifier && fight.round <= modifier.rounds) {
        result.ws = Math.max(1, result.ws + modifier.ws);
        result.aRanged = Math.max(0, result.aRanged + modifier.a);
        result.aClose = Math.max(0, result.aClose + modifier.a);
      }
      if (fight.phase === 'close') result.s += unit.melee?.strengthBonus ?? 0;
      if (unit.stormShield) {
        result.t++;
        if (result.armour) result.armour = Math.max(1, result.armour - 1);
      }
    }
  } else {
    if (unit.tyranid && fight.character.tyranidWeakness && result.armour) result.armour++;
    const interval = fight.config.extraAttackPerWoundsLost;
    if (fight.mode === 'advanced' && interval) {
      const bonus = Math.floor((unit.maxW-unit.w)/interval);
      result.aRanged += bonus; result.aClose += bonus;
    }
  }
  return result;
}

export function terminatorEngaged(fight) {
  const living = fight.opponents.flatMap((enemy,index) => enemy.w > 0 ? [index] : []);
  const limit = fight.config.activeEnemies ?? (fight.mode === 'advanced' ? fight.config.advancedActiveEnemies : null);
  if (!limit) return living;
  const current = (fight.engagedIndices ?? []).filter(index => fight.opponents[index]?.w > 0);
  return current.length ? current : living.slice(0,limit);
}

export function terminatorEnd(fight, status, section) {
  fight.status = status; fight.section = section == null ? null : String(section);
  if (status !== 'paused') fight.character.burning = false;
}

export function terminatorOutcome(fight, roll) {
  if (!isTerminatorFight(fight)) return false;
  const config = fight.config, living = fight.opponents.filter(enemy => enemy.w > 0);
  // The capture threshold interrupts the attack that reaches it; it is not a
  // fatal defeat followed by a fresh character sheet.
  if (config.capture && (fight.character.w <= config.playerWoundsAtMost || !living.length)) {
    if (!fight.character.w) fight.character.w = config.playerWoundsAtMost;
    terminatorEnd(fight,'capture',config.interruptSection); return true;
  }
  if (!fight.character.w) return false; // Normal death has priority elsewhere.
  if (config.talosContinuation && !fight.checkpointHandled
      && (!living.length || fight.character.w < config.playerWoundsBelow)) {
    terminatorEnd(fight,'paused',config.checkpointSection); return true;
  }
  if (config.interruptAfterEnemyKills
      && fight.opponents.length-living.length >= config.interruptAfterEnemyKills) {
    terminatorEnd(fight,'interrupted',config.interruptSection); return true;
  }
  if (config.leaderIndex !== undefined && fight.opponents[config.leaderIndex].w === 0) {
    terminatorEnd(fight,'win',config.win); return true;
  }
  if (!living.length) {
    let destination = config.win;
    if (config.winByPhase) destination = config.winByPhase[fight.phase === 'close' ? 'melee' : fight.phase === 'basic' ? fight.lastWeapon : 'ranged'];
    if (config.winByDuration) {
      const timing = config.winByDuration;
      destination = fight.round < timing.threshold ? timing.fewerThan8 : fight.round > timing.threshold ? timing.moreThan8
        : timing.exactly8[roll(6)%2 ? 'odd' : 'even'];
    }
    terminatorEnd(fight,'win',destination); return true;
  }
  return false;
}

export function terminatorBeforeRound(fight) {
  if (!isTerminatorFight(fight)) return false;
  const config = fight.config;
  if (config.interruptBeforeRound && fight.round+1 >= config.interruptBeforeRound) {
    terminatorEnd(fight,config.interruptOutcome ?? 'interrupted',config.interruptSection); return true;
  }
  if (config.maxRounds && fight.round >= config.maxRounds) {
    terminatorEnd(fight,config.timeoutOutcome ?? 'interrupted',config.timeoutSection); return true;
  }
  fight.engagedIndices = terminatorEngaged(fight);
  return false;
}

export function terminatorAfterRound(fight, before, event) {
  if (!isTerminatorFight(fight) || fight.status !== 'fighting') return;
  const config = fight.config;
  if (config.capture && fight.round >= config.surviveRounds) terminatorEnd(fight,'capture',config.interruptSection);
  else if (config.talosContinuation && !fight.checkpointHandled && fight.round >= config.checkpointAfterRound) {
    terminatorEnd(fight,'paused',config.checkpointSection);
  } else if (config.consecutiveRoundsWon) {
    const received = before.player-fight.character.w;
    const inflicted = before.enemies-fight.opponents.reduce((sum,enemy) => sum+enemy.w,0);
    // The book leaves "win a round" undefined. Compare actual Wounds lost;
    // a tied round breaks the streak. The panel explains this interpretation.
    fight.consecutiveWins = inflicted > received ? (fight.consecutiveWins ?? 0)+1 : 0;
    event.consecutiveWins = fight.consecutiveWins;
    if (fight.consecutiveWins >= config.consecutiveRoundsWon) terminatorEnd(fight,'win',config.consecutiveWinSection);
  }
}

export function terminatorDrain(fight, defender, used, roll, event) {
  if (!isTerminatorFight(fight) || fight.mode !== 'advanced' || !used.statDrain || defender !== fight.character) return;
  const face = roll(6);
  const effect = Object.entries(used.statDrain).find(([range]) => {
    const values = range.match(/\d+/g).map(Number);
    return face >= values[0] && face <= values.at(-1);
  })?.[1];
  if (effect && effect !== 'none') {
    for (const [key,amount] of Object.entries(effect)) defender[key] = Math.max(1,defender[key]+amount);
  }
  event.effects.push({name:defender.name ?? 'You',statDrainRoll:face,statDrain:effect ?? 'none',damage:0});
}

export function resumeTerminatorFight(saved, damnatus = false) {
  const fight = structuredClone(saved);
  if (!isTerminatorFight(fight) || !fight.config.talosContinuation || fight.status !== 'paused') throw new RangeError('No paused battle');
  fight.checkpointHandled = true;
  if (damnatus) terminatorEnd(fight,'win',fight.round >= fight.config.talosDurationThreshold ? fight.config.talosLongWin : fight.config.talosShortWin);
  else if (!fight.opponents.some(enemy => enemy.w > 0)) terminatorEnd(fight,'win',fight.config.win);
  else { fight.status = 'fighting'; fight.section = null; }
  return fight;
}
