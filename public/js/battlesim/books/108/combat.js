// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _levelCol(level) {

  if (level >= 5) return 0;
  if (level >= 3) return 1;
  if (level >= 1) return 2;
  if (level === 0) return 3;
  if (level >= -2) return 4;
  if (level >= -4) return 5;
  return 6;
}

function _chanceRow(pick) {

  if (pick <= 3) return 0;
  if (pick <= 8) return 1;
  return 2;
}

function _pick10() {
 return 1 + Math.floor(Math.random() * 10); }

function _enemyName(d) {
 return d.enemy.name.trim() || 'врагът'; }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _effectiveSkill(d) {
  const { WEAPON_TIER } = getContext();

  const base = d.skills[d.weapon] || 0;
  const mismatch = Math.max(0, d.enemy.tier - WEAPON_TIER[d.weapon]);
  const lifePenalty = (d.life < 20 ? 1 : 0) + (d.life < 10 ? 1 : 0);
  return Math.max(0, base - mismatch - lifePenalty);
}

function _runRound() {
  const { COMBAT_TABLE, _appendLog, _chanceRow, _checkBattleEnd, _data, _effectiveSkill, _enemyNameSafe, _levelCol, _pick10, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || d.life <= 0 || d.enemy.life <= 0) return;
  d.roundsThisBattle++;

  const effSkill = _effectiveSkill(d);
  const level = effSkill - d.enemy.skill;
  const pick = _pick10();
  const [playerLoss, enemyLoss] = COMBAT_TABLE[_chanceRow(pick)][_levelCol(level)];
  _appendLog(d, t('battlesim108.log.round', { round: d.roundsThisBattle, effSkill, enemySkill: d.enemy.skill, level, pick }));

  if (playerLoss === 'dead') d.life = 0;
  else d.life = Math.max(0, d.life - playerLoss);
  if (enemyLoss === 'dead') d.enemy.life = 0;
  else d.enemy.life = Math.max(0, d.enemy.life - enemyLoss);

  _appendLog(d, t('battlesim108.log.result', {
    playerLoss: playerLoss === 'dead' ? t('battlesim108.log.dead_word') : playerLoss,
    life: d.life, lifeMax: d.lifeInitial,
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyLoss === 'dead' ? t('battlesim108.log.dead_word') : enemyLoss,
    enemyLife: d.enemy.life, enemyLifeMax: d.enemy.lifeMax,
  }));

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, t } = getContext();

  if (d.enemy.life <= 0) {
    _appendLog(d, t('battlesim108.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.life <= 0) {
    _appendLog(d, t('battlesim108.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.life = d.enemy.lifeMax;
  d.life = d.lifeInitial;
  if (d.log.length) _appendLog(d, t('battlesim108.log.reset_sep'));
  _appendLog(d, t('battlesim108.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _levelCol, _chanceRow, _pick10, _enemyName, _enemyNameSafe, _effectiveSkill, _runRound, _checkBattleEnd, _resetBattle };
}
