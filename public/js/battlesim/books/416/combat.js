// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _emptyEnemy() {

  return { name: '', skill: 0, endurance: 0, enduranceMax: 0, unarmed: false };
}

function _rollTable(d) {

  return d.chanceRollRange === 12 ? Math.floor(Math.random() * 12) + 1 : Math.floor(Math.random() * 10);
}

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _applyEnemyDefeat(d) {
  const { SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, t } = getContext();

  if (d.enemy.enduranceMax > 0 && d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim416.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  return false;
}

function _applyPlayerFall(d) {
  const { SVG_SKULL, _appendLog, _recordOutcome, t } = getContext();

  if (d.player.endurance <= 0) {
    _appendLog(d, t('battlesim416.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _exchange() {
  const { _appendLog, _applyEnemyDefeat, _applyPlayerFall, _battleOver, _data, _enemyNameSafe, _renderAll, _rollTable, saveState, t } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;

  let playerRoll, enemyRoll, playerTotal, enemyTotal;
  let ties = 0;
  do {
    playerRoll = _rollTable(d);
    enemyRoll = _rollTable(d);
    playerTotal = d.player.skill + playerRoll;
    enemyTotal = d.enemy.skill + enemyRoll;
    if (playerTotal === enemyTotal) {
      ties++;
      _appendLog(d, t('battlesim416.log.tie', { playerRoll, playerTotal, enemyRoll, enemyTotal, enemy: _enemyNameSafe(d) }));
    }
  } while (playerTotal === enemyTotal && ties < 20);

  if (d.printedCombatRules === 1 && playerTotal === enemyTotal) {
    saveState();
    _renderAll();
    return;
  }

  if (playerTotal > enemyTotal) {
    const dmg = d.player.unarmed ? 1 : 2;
    d.enemy.endurance = Math.max(0, d.enemy.endurance - dmg);
    _appendLog(d, t('battlesim416.log.you_hit', { playerRoll, playerTotal, enemyRoll, enemyTotal, enemy: _enemyNameSafe(d), n: dmg, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax }));
  } else {
    const dmg = d.enemy.unarmed ? 1 : 2;
    d.player.endurance = Math.max(0, d.player.endurance - dmg);
    _appendLog(d, t('battlesim416.log.enemy_hits', { playerRoll, playerTotal, enemyRoll, enemyTotal, enemy: _enemyNameSafe(d), n: dmg, endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial }));
  }

  if (!_applyEnemyDefeat(d)) _applyPlayerFall(d);
  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.printedCombatRules = 1;
  d.chanceRollRange = 12;
  d.enemy.endurance = d.enemy.enduranceMax;
  d.player.endurance = d.player.enduranceInitial;
  if (d.log.length) _appendLog(d, t('battlesim416.log.reset_sep'));
  _appendLog(d, t('battlesim416.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _emptyEnemy, _rollTable, _enemyName, _enemyNameSafe, _applyEnemyDefeat, _applyPlayerFall, _exchange, _resetBattle };
}
