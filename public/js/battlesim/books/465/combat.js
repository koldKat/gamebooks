// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _roll2d6() {
 return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _enemyDefeated(d) {
 return d.enemy.staminaMax > 0 && d.enemy.stamina <= 0; }

function _hasEnemy(d) {
 return d.enemy.staminaMax > 0; }

function _runRound() {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _data, _enemyDefeated, _enemyNameSafe, _hasEnemy, _recordOutcome, _renderAll, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || !_hasEnemy(d) || d.player.field <= 0 || _enemyDefeated(d)) return;
  d.roundsThisBattle++;

  const enemyWoundDmg  = Math.max(1, d.enemy.woundDamage || 1);
  const playerWoundDmg = Math.max(1, d.player.woundDamage || 1);

  const playerRoll = _roll2d6();
  const enemyRoll  = _roll2d6();
  _appendLog(d, t('battlesim465.log.round', { round: d.roundsThisBattle, playerRoll, enemy: _enemyNameSafe(d), enemyRoll }));

  if (playerRoll === enemyRoll) {
    _appendLog(d, t('battlesim465.log.both_avoided'));
  } else if (playerRoll > enemyRoll) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - playerWoundDmg);
    _appendLog(d, t('battlesim465.log.you_wound', { enemy: _enemyNameSafe(d), n: playerWoundDmg, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
  } else {
    d.player.field = Math.max(0, d.player.field - enemyWoundDmg);
    _appendLog(d, t('battlesim465.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: enemyWoundDmg, field: d.player.field, fieldMax: d.player.fieldInitial }));
  }

  if (_enemyDefeated(d)) {
    _appendLog(d, t('battlesim465.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.field <= 0) {
    _appendLog(d, t('battlesim465.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }

  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.enemy.stamina = d.enemy.staminaMax;
  d.roundsThisBattle = 0;
  if (d.log.length) _appendLog(d, t('battlesim465.log.reset_sep'));
  _appendLog(d, t('battlesim465.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _roll2d6, _enemyName, _enemyNameSafe, _enemyDefeated, _hasEnemy, _runRound, _resetBattle };
}
