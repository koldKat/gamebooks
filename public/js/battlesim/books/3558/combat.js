export const TECHNIQUES = ['mist', 'thunder', 'sand', 'arrows', 'steel'];
export const WOUND_LEVELS = [1, 2, 3];
export const HIDDEN_WEAPONS = ['none', 'dagger', 'knuckles', 'garrote'];

export function woundLevel(difference) {
  const gap = Math.abs(difference);
  if (gap >= 5) return 3;
  if (gap >= 3) return 2;
  return Number(gap > 0);
}

export function woundPenalty(wounds, table) {
  return WOUND_LEVELS.reduce((total, level) => {
    const count = wounds[level - 1];
    const severity = table[level - 1];
    const lastPrintedCount = severity.length - 1;
    // The table ends at the hero's fatal total. Stronger opponents have their own limit.
    const penalty = count <= lastPrintedCount
      ? severity[count]
      : severity[lastPrintedCount] + count - lastPrintedCount;
    return total + penalty;
  }, 0);
}

export function needsOpeningTechnique(encounter, hiddenWeapon) {
  return !encounter?.streetFight || hiddenWeapon === 'dagger' || hiddenWeapon === 'knuckles';
}

export function startFight(hero, encounter, technique, table, hiddenWeapon = 'none') {
  if (!TECHNIQUES.includes(technique) || !encounter.techniques[technique]) {
    throw new RangeError('Missing technique');
  }
  if (woundPenalty(hero.wounds, table) >= (encounter.heroLimit ?? 5)) {
    throw new RangeError('The player has already reached the wound limit');
  }
  const usesTechnique = needsOpeningTechnique(encounter, hiddenWeapon);
  return {
    round: 0,
    outcome: null,
    encounter,
    technique,
    usesTechnique,
    heroSkill: hero.skill,
    heroWounds: [...hero.wounds],
    enemyWounds: [0, 0, 0],
  };
}

export function canFlee(fight) {
  const after = fight.encounter.retreatAfter;
  return !fight.outcome && Number.isInteger(after) && fight.round >= after;
}

export function flee(fight) {
  if (!canFlee(fight)) throw new RangeError('Cannot flee this round');
  return { ...fight, outcome: fight.encounter.withdrawal ? 'left' : 'fled', destination: fight.encounter.retreat };
}

export function canSpare(fight, table) {
  if (fight.spared) return false;
  if (fight.outcome === 'win' && Number.isInteger(fight.encounter.spareWhenWonByRound)) {
    return fight.round <= fight.encounter.spareWhenWonByRound;
  }
  return !fight.outcome && fight.encounter.spareLast === true
    && woundPenalty(fight.enemyWounds, table) === fight.encounter.limit - 1;
}

export function spare(fight, table) {
  if (!canSpare(fight, table)) throw new RangeError('Cannot spare an opponent yet');
  return { ...fight, outcome: 'win', destination: fight.encounter.win, spared: true };
}

export function resolveRound(fight, table, heroDie, enemyDie) {
  if (fight.outcome || ![heroDie, enemyDie].every(die => Number.isInteger(die) && die >= 1 && die <= 6)) {
    throw new RangeError('Invalid combat round');
  }
  const { encounter } = fight;
  const [heroBonus, enemyBonus] = fight.round === 0 && fight.usesTechnique
    ? encounter.techniques[fight.technique] : [0, 0];
  const heroDiePenalty = fight.usesTechnique ? 0 : 1;
  const previousHeroDamage = woundPenalty(fight.heroWounds, table);
  const heroTotal = fight.heroSkill + heroDie - heroDiePenalty + heroBonus - previousHeroDamage;
  const enemyTotal = encounter.skill + enemyDie + enemyBonus - woundPenalty(fight.enemyWounds, table);
  const difference = heroTotal - enemyTotal;
  const level = woundLevel(difference);
  const heroWounds = [...fight.heroWounds];
  const enemyWounds = [...fight.enemyWounds];
  if (difference > 0) enemyWounds[level - 1]++;
  if (difference < 0) heroWounds[level - 1]++;
  const heroDamage = woundPenalty(heroWounds, table);
  const enemyDamage = woundPenalty(enemyWounds, table);
  const death = heroDamage >= (encounter.heroLimit ?? 5);
  const forcedRetreat = Boolean(encounter.streetFight && !death && previousHeroDamage < 4 && heroDamage === 4);
  const outcome = death || forcedRetreat ? 'loss'
    : enemyDamage >= encounter.limit ? 'win' : null;
  const destination = outcome === 'win' ? encounter.win : forcedRetreat ? encounter.loss ?? 'map' : null;
  const round = fight.round + 1;
  return {
    ...fight, round, heroWounds, enemyWounds, outcome, destination, death, forcedRetreat,
    lastRound: { round: round + Number(!fight.usesTechnique), heroDie, enemyDie, heroBonus, enemyBonus,
      heroDiePenalty, heroTotal, enemyTotal,
      wounded: difference > 0 ? 'enemy' : difference < 0 ? 'hero' : null, level, heroDamage, enemyDamage },
  };
}

export function recordOutcome(hero, fight) {
  const battles = hero.battles + 1;
  const escapes = hero.escapes + Number(fight.outcome === 'fled');
  const skillBonus = battles === 7 && escapes <= 2 && !fight.death && !hero.skillBonus;
  return { ...hero, battles, escapes, wounds: fight.heroWounds, skill: hero.skill + Number(skillBonus),
    skillBonus: hero.skillBonus || skillBonus };
}
