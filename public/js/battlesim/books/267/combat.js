// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _roll2d6() {
 return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }

function _roll1d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _isCaldwell(name) {
  const { CALDWELL_NAME_RULES } = getContext();
 return CALDWELL_NAME_RULES.some(rule => rule.test(name.trim())); }

function _startSpecialRules(d) {

  d.specialRules = { enemy: d.enemy.name.trim().toUpperCase(), lostRounds: 0, outcome: null, craggenKnife: false, demon283: false };
}

function _playerDamage(d) {

  const { ENCOUNTER_RULES } = getContext();
  const rule = ENCOUNTER_RULES[d.specialRules?.enemy]?.playerDamageWithoutFlag;
  return rule && !d.specialRules[rule.flag] ? rule.damage : 2;
}

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _runRound() {
  const { ENCOUNTER_RULES, CALDWELL_RULE, SVG_SKULL, SVG_TROPHY, _appendLog, _data, _enemyNameSafe, _notReady, _playerDamage, _recordOutcome, _renderAll, _roll1d6, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.specialRules?.outcome) return;
  const encounter = ENCOUNTER_RULES[d.specialRules?.enemy];
  d.roundsThisBattle++;
  d.pendingLuck = null;

  const playerRoll = _roll2d6() + d.player.skill;
  const enemyDice = [_roll1d6(), _roll1d6()];
  const enemyRoll = enemyDice[0] + enemyDice[1] + d.enemy.skill;
  _appendLog(d, t('battlesim267.log.round', { round: d.roundsThisBattle, playerAS: playerRoll, enemy: _enemyNameSafe(d), enemyAS: enemyRoll }));
  if (playerRoll === enemyRoll) {
    _appendLog(d, t('battlesim267.log.both_avoided'));
  } else if (playerRoll > enemyRoll) {
    const damage = _playerDamage(d);
    d.enemy.stamina = Math.max(0, d.enemy.stamina - damage);
    _appendLog(d, t('battlesim267.log.you_wound', { enemy: _enemyNameSafe(d), n: damage, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.enemy.stamina > 0) d.pendingLuck = 'player-hit';
    if (encounter?.stopAfterPlayerWin) d.specialRules.outcome = 'win';
  } else {
    const flagDamage = encounter?.enemyDamageWithFlag;
    const damage = d.caldwellDoubles && enemyDice[0] === enemyDice[1] ? CALDWELL_RULE.doublesDamage
      : flagDamage && d.specialRules[flagDamage.flag] ? flagDamage.damage : 2;
    d.player.stamina = Math.max(0, d.player.stamina - damage);
    _appendLog(d, t('battlesim267.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: damage, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuck = 'enemy-hit';
    if (encounter?.loseAfterEnemyWins && ++d.specialRules.lostRounds >= encounter.loseAfterEnemyWins) d.specialRules.outcome = 'loss';
  }

  if (d.specialRules?.outcome) {
    d.pendingLuck = null;
    _appendLog(d, t(d.specialRules.outcome === 'win' ? 'battlesim267.log.dwarf_stopped' : 'battlesim267.log.paralysed'));
    _recordOutcome(d, d.specialRules.outcome);
  } else if (d.enemy.stamina <= 0) {
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim267.log.defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, `${SVG_SKULL} ${t('battlesim267.log.fallen')}`);
    _recordOutcome(d, 'loss');
  }

  saveState();
  _renderAll();
}

function _testLuck() {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _data, _enemyNameSafe, _playerDamage, _recordOutcome, _renderAll, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingLuck || d.player.luck <= 0) return;
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (d.pendingLuck === 'player-hit') {
    if (lucky) {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
      _appendLog(d, t('battlesim267.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + Math.max(0, _playerDamage(d) - 1));
      _appendLog(d, t('battlesim267.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.enemy.stamina <= 0) { _appendLog(d, `${SVG_TROPHY} ${t('battlesim267.log.defeated', { enemy: _enemyNameSafe(d) })}`); _recordOutcome(d, 'win'); }
  } else {
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim267.log.luck_hit_lucky', { roll, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim267.log.luck_hit_unlucky', { roll, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) { _appendLog(d, `${SVG_SKULL} ${t('battlesim267.log.fallen')}`); _recordOutcome(d, 'loss'); }
  }
  d.pendingLuck = null;
  saveState();
  _renderAll();
}

function _skipLuck() {
  const { _data, _renderAll } = getContext();

  const d = _data();
  if (!d) return;
  d.pendingLuck = null;
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _isCaldwell, _renderAll, _startSpecialRules, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.enemy.stamina = d.enemy.staminaMax;
  d.player.stamina = d.player.staminaInitial;
  d.roundsThisBattle = 0;
  d.caldwellDoubles = _isCaldwell(d.enemy.name);
  _startSpecialRules(d);
  d.pendingLuck = null;
  if (d.log.length) _appendLog(d, t('battlesim267.log.reset_sep'));
  _appendLog(d, t('battlesim267.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _roll2d6, _roll1d6, _enemyName, _isCaldwell, _startSpecialRules, _playerDamage, _enemyNameSafe, _runRound, _testLuck, _skipLuck, _resetBattle };
}
