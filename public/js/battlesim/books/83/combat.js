// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _pick() {
 return 1 + Math.floor(Math.random() * 12); }

function _enemyName(d) {
 return d.enemy.name.trim() || 'врагът'; }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _playerStrike() {
  const { WOUND_DMG, _appendLog, _data, _enemyNameSafe, _pick, t } = getContext();

  const d = _data();
  const yourPick = _pick();
  const enemyPick = _pick();
  const yourTotal = yourPick + d.strength + d.weapon;
  const enemyTotal = enemyPick + d.enemy.defense;
  _appendLog(d, t('battlesim83.log.you_strike', { yourPick, strength: d.strength, weapon: d.weapon, yourTotal, enemy: _enemyNameSafe(d), enemyPick, defense: d.enemy.defense, enemyTotal }));
  if (yourTotal >= enemyTotal) {
    d.enemy.endurance = Math.max(0, d.enemy.endurance - WOUND_DMG);
    _appendLog(d, t('battlesim83.log.you_hit', { enemy: _enemyNameSafe(d), n: WOUND_DMG, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax }));
  } else {
    d.endurance = Math.max(0, d.endurance - WOUND_DMG);
    _appendLog(d, t('battlesim83.log.you_miss', { n: WOUND_DMG, endurance: d.endurance, enduranceMax: d.enduranceInitial }));
  }
}

function _enemyStrike() {
  const { WOUND_DMG, _appendLog, _data, _enemyNameSafe, _pick, t } = getContext();

  const d = _data();
  const enemyPick = _pick();
  const yourPick = _pick();
  const enemyTotal = enemyPick + d.enemy.attack;
  // Weapon bonuses apply only to attacks; defense uses STRENGTH alone.
  const yourTotal = yourPick + d.strength;
  _appendLog(d, t('battlesim83.log.enemy_strikes', { enemy: _enemyNameSafe(d), enemyPick, attack: d.enemy.attack, enemyTotal, yourPick, strength: d.strength, yourTotal }));
  if (enemyTotal >= yourTotal) {
    d.endurance = Math.max(0, d.endurance - WOUND_DMG);
    _appendLog(d, t('battlesim83.log.enemy_hits', { enemy: _enemyNameSafe(d), n: WOUND_DMG, endurance: d.endurance, enduranceMax: d.enduranceInitial }));
  } else {
    d.enemy.endurance = Math.max(0, d.enemy.endurance - WOUND_DMG);
    _appendLog(d, t('battlesim83.log.enemy_misses', { enemy: _enemyNameSafe(d), n: WOUND_DMG, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax }));
  }
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, t } = getContext();

  if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim83.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.endurance <= 0) {
    _appendLog(d, t('battlesim83.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _runRound() {
  const { _appendLog, _checkBattleEnd, _data, _enemyStrike, _playerStrike, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || d.endurance <= 0 || d.enemy.endurance <= 0) return;
  d.roundsThisBattle++;
  _appendLog(d, t('battlesim83.log.round', { round: d.roundsThisBattle }));
  _playerStrike();
  if (d.endurance > 0 && d.enemy.endurance > 0) _enemyStrike();
  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.endurance = d.enemy.enduranceMax;
  d.endurance = d.enduranceInitial;
  if (d.log.length) _appendLog(d, t('battlesim83.log.reset_sep'));
  _appendLog(d, t('battlesim83.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}


// END EXTRACTED RULES
  return { _pick, _enemyName, _enemyNameSafe, _playerStrike, _enemyStrike, _checkBattleEnd, _runRound, _resetBattle };
}
