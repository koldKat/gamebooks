// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _roll2d6() {
 return 1 + Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6); }

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _ready(d) {
 return !!d && d.enemy.name.trim() !== '' && d.endurance > 0 && d.enemy.endurance > 0 && d.battleCode > 0; }

function _runRound() {
  const { _appendLog, _checkBattleEnd, _data, _enemyNameSafe, _ready, _renderAll, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || !_ready(d)) return;
  d.roundsThisBattle++;

  const playerRoll = _roll2d6();
  const enemyRoll   = _roll2d6();
  const playerTotal = playerRoll + d.battleCode;
  const enemyTotal   = enemyRoll + d.enemy.battleQualities;
  const diff = Math.abs(playerTotal - enemyTotal);

  _appendLog(d, t('battlesim122.log.round', {
    round: d.roundsThisBattle, playerRoll, battleCode: d.battleCode, playerTotal,
    enemyRoll, battleQualities: d.enemy.battleQualities, enemyTotal,
  }));

  if (playerTotal > enemyTotal) {
    if (d.system === 2) {
      d.enemy.endurance = Math.max(0, d.enemy.endurance - diff);
      _appendLog(d, t('battlesim122.log.win_en', { diff, enemy: _enemyNameSafe(d), endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax }));
    } else {
      d.battleCode = d.battleCode + diff;
      _appendLog(d, t('battlesim122.log.win_bc', { diff, battleCode: d.battleCode }));
    }
  } else if (enemyTotal > playerTotal) {
    if (d.system === 2) {
      d.endurance = Math.max(0, d.endurance - diff);
      _appendLog(d, t('battlesim122.log.lose_en', { diff, endurance: d.endurance, enduranceMax: d.enduranceInitial }));
    } else {
      d.battleCode = Math.max(0, d.battleCode - diff);
      _appendLog(d, t('battlesim122.log.lose_bc', { diff, battleCode: d.battleCode }));
    }
  } else {
    _appendLog(d, t('battlesim122.log.tie'));
  }

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, t } = getContext();

  if (d.system === 2 && d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim122.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.endurance <= 0 || (d.system === 3 && d.battleCode <= 0)) {
    _appendLog(d, t('battlesim122.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.endurance = d.enemy.enduranceMax;
  d.endurance = d.enduranceInitial;
  d.battleCode = d.battleCodeInitial;
  if (d.log.length) _appendLog(d, t('battlesim122.log.reset_sep'));
  _appendLog(d, t('battlesim122.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}


// END EXTRACTED RULES
  return { _roll2d6, _enemyName, _enemyNameSafe, _ready, _runRound, _checkBattleEnd, _resetBattle };
}
