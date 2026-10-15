// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _rollChance() {
 return 1 + Math.floor(Math.random() * 6); }

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _hasEnemy(d) {
 return d.enemy.lifeMax > 0; }

function _playerDefeated(d) {
 return d.player.lifeInitial > 0 && d.player.life <= 0; }

function _enemyDefeated(d)  {
  const { _hasEnemy } = getContext();
 return _hasEnemy(d) && d.enemy.life <= 0; }

function _runRound() {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _battleOver, _data, _enemyDefeated, _enemyNameSafe, _hasEnemy, _playerDefeated, _recordOutcome, _renderAll, _rollChance, saveState, t } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  d.roundsThisBattle++;

  const attacker = d.attackerIsPlayer ? d.player : d.enemy;
  const defender = d.attackerIsPlayer ? d.enemy : d.player;
  const attackerName = d.attackerIsPlayer ? t('battlesim696.ui.you') : _enemyNameSafe(d);
  const defenderName = d.attackerIsPlayer ? _enemyNameSafe(d) : t('battlesim696.ui.you');

  const strikeChance = _rollChance();
  const strike = strikeChance + attacker.sila + attacker.ataka;
  const defenseChance = _rollChance();
  const defense = defenseChance + defender.refleks + defender.zashtita;

  if (defense > strike) {
    _appendLog(d, t('battlesim696.log.fails', { round: d.roundsThisBattle, attacker: attackerName, strike, defender: defenderName, defense }));
  } else {
    const minor = defense >= strike - 2;
    const dmg = minor ? Math.max(0, strike - (strikeChance + defender.izdrazhlivost)) : Math.max(0, strike - defender.izdrazhlivost);
    defender.life = Math.max(0, defender.life - dmg);
    _appendLog(d, t(minor ? 'battlesim696.log.minor_hit' : 'battlesim696.log.major_hit', {
      round: d.roundsThisBattle, attacker: attackerName, strike, defender: defenderName, defense, dmg,
      life: defender.life, lifeMax: d.attackerIsPlayer ? d.enemy.lifeMax : d.player.lifeInitial,
    }));
  }

  if (_hasEnemy(d) && _enemyDefeated(d)) {
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim696.log.defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
  } else if (_playerDefeated(d)) {
    _appendLog(d, `${SVG_SKULL} ${t('battlesim696.log.fallen')}`);
    _recordOutcome(d, 'loss');
  } else {
    // Existing saved fights retain their original exchange rules until restarted.
    if (d.exchangeRulesVersion >= 2 || defense <= strike) d.attackerIsPlayer = !d.attackerIsPlayer;
  }

  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.enemy.life = d.enemy.lifeMax;
  d.player.life = d.player.lifeInitial;
  d.attackerIsPlayer = true;
  d.roundsThisBattle = 0;
  d.exchangeRulesVersion = 2;
  if (d.log.length) _appendLog(d, t('battlesim696.log.reset_sep'));
  _appendLog(d, t('battlesim696.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _rollChance, _enemyName, _enemyNameSafe, _hasEnemy, _playerDefeated, _enemyDefeated, _runRound, _resetBattle };
}
