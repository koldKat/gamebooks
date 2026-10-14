// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { TECH_ITEMS, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim286) {
    pt.sim286 = {
      // Starting life/AE stay zero until rolled; never grant placeholder points.
      player: { life: 0, lifeMax: 0, weaponKey: 'sword', customMinHit: 6, customAeCost: 0, shieldKey: 'none', aeMax: 0, enemyFirst: false, gloveBonus: 5, extraDef: 0 },
      enemy:  { name: '', hp: 20, hpMax: 20, minHit: 6, fixedDamage: 0, extraAttackers: 0 },
      battleStart: { playerLife: 0, enemyHp: 20 },
      effects: { tempShield: false, doubleAttack: false, pendingBonus: 0, enemyStun: 0 },
      roundsThisBattle: 0,
      healUsedThisBattle: false,
      lifeRollCount: 0,
      aeRolled: false,
      tech: {},
      dehronatorUsed: false,
      log: [],
      history: [],
      groupRules: true,
    };
  }
  const d = pt.sim286;
  if (!d.effects) d.effects = { tempShield: false, doubleAttack: false, pendingBonus: 0, enemyStun: 0 };
  if (!d.tech) d.tech = {};
  if (!d.battleStart) d.battleStart = { playerLife: d.player.life, enemyHp: d.enemy.hp };
  if (d.dehronatorUsed === undefined) d.dehronatorUsed = false;
  if (!d.history) d.history = [];
  if (d.player.aeMax === undefined) d.player.aeMax = 0;
  if (d.player.customAeCost === undefined) d.player.customAeCost = 0;
  if (d.player.enemyFirst === undefined) d.player.enemyFirst = false;
  if (d.player.gloveBonus === undefined) d.player.gloveBonus = 5;
  if (d.player.extraDef === undefined) d.player.extraDef = 0;
  if (d.enemy.fixedDamage === undefined) d.enemy.fixedDamage = 0;
  if (d.enemy.extraAttackers === undefined) d.enemy.extraAttackers = 0;
  if (d.lifeRollCount === undefined) d.lifeRollCount = 0;
  if (d.aeRolled === undefined) d.aeRolled = false;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (d.healUsedThisBattle === undefined) d.healUsedThisBattle = false;
  // Grandfather previously initialized life/AE stats independently so legacy runs do not become roll-gated.
  if (d.lifeRollCount === 0 && d.player.lifeMax > 0) d.lifeRollCount = 1;
  if (!d.aeRolled && d.player.aeMax > 0) d.aeRolled = true;
  for (const item of TECH_ITEMS) {
    if (!d.tech[item.key]) d.tech[item.key] = { usesLeft: item.maxUses, activated: false };
  }
  return d;
}

function _notReady(d) {

  return d.lifeRollCount === 0 || !d.aeRolled;
}

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 250) d.log.shift();
}

function _recordOutcome(d, outcome, enemyNameOverride = null) {
  const { _enemyName } = getContext();

  d.history.push({
    enemy: enemyNameOverride ?? _enemyName(d), outcome,
    enemyHpMax: d.enemy.hpMax, enemyMinHit: d.enemy.minHit,
    playerLife: d.player.life, playerLifeMax: d.player.lifeMax,
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _notReady, _appendLog, _recordOutcome };
}
