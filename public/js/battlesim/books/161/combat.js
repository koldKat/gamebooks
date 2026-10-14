// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _weapon(id) {
  const { WEAPONS } = getContext();
 return WEAPONS.find(w => w.id === id) || WEAPONS[0]; }

function _weaponNameById(id) {
  const { _weapon, t } = getContext();
 return t(_weapon(id).nameKey); }

function _die(sides) {
 return 1 + Math.floor(Math.random() * sides); }

function _rollDice(n, sides, mod) {
  const { _die } = getContext();

  let total = mod;
  for (let i = 0; i < n; i++) total += _die(sides);
  return total;
}

function _rollWeapon(d, whoseDiceN, whoseDiceSides, whoseDiceMod) {
  const { _rollDice } = getContext();

  return Math.max(0, _rollDice(whoseDiceN, whoseDiceSides, whoseDiceMod));
}

function _playerDead(d) {
 return d.playerStamina <= 0; }

function _hordeCleared(d) {
 return d.enemyCount <= 0; }

function _duelEnemyDead(d) {
 return d.duelEnemyStamina <= 0; }

function _checkEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _duelEnemyDead, _hordeCleared, _playerDead, _recordOutcome, t } = getContext();

  const enemyDown = d.mode === 'horde' ? _hordeCleared(d) : _duelEnemyDead(d);
  if (enemyDown) {
    d.over = true; d.winner = 'player';
    _appendLog(d, t('battlesim161.log.defeated', { trophy: SVG_TROPHY }));
    _recordOutcome(d, 'win');
    return true;
  }
  if (_playerDead(d)) {
    d.over = true; d.winner = 'enemy';
    _appendLog(d, t('battlesim161.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _hordeRound() {
  const { _appendLog, _checkEnd, _data, _renderAll, _rollWeapon, _weapon, saveState, t } = getContext();

  const d = _data();
  if (!d || d.over) return;
  d.started = true;
  const w = _weapon(d.weaponId);
  const n = d.weaponId === 'custom' ? d.diceN : w.dice;
  const sides = d.weaponId === 'custom' ? d.diceSides : w.sides;
  const mod = d.weaponId === 'custom' ? d.diceMod : w.mod;
  const roll = _rollWeapon(d, n, sides, mod);
  const kills = Math.min(roll, d.enemyCount);
  d.enemyCount -= kills;
  let msg = t('battlesim161.log.you_kill', { roll, kills, remaining: d.enemyCount });

  if (d.enemyCount > 0) {
    const dmg = d.enemyCount * d.retaliation;
    d.playerStamina = Math.max(0, d.playerStamina - dmg);
    msg += ' ' + t('battlesim161.log.retaliate', { n: d.enemyCount, dmg, stamina: d.playerStamina, staminaMax: d.playerStaminaMax });
  }

  _appendLog(d, msg);
  _checkEnd(d);
  saveState();
  _renderAll();
}

function _duelRound() {
  const { _appendLog, _checkEnd, _data, _duelEnemyDead, _renderAll, _rollWeapon, saveState, t } = getContext();

  const d = _data();
  if (!d || d.over) return;
  d.started = true;
  const pRoll = _rollWeapon(d, d.duelPlayerDiceN, d.duelPlayerDiceSides, d.duelPlayerDiceMod);
  d.duelEnemyStamina = Math.max(0, d.duelEnemyStamina - pRoll);
  let msg = t('battlesim161.log.you_hit_duel', { roll: pRoll, stamina: d.duelEnemyStamina, staminaMax: d.duelEnemyStaminaMax });

  if (!_duelEnemyDead(d)) {
    const eRoll = _rollWeapon(d, d.duelEnemyDiceN, d.duelEnemyDiceSides, d.duelEnemyDiceMod);
    d.playerStamina = Math.max(0, d.playerStamina - eRoll);
    msg += ' ' + t('battlesim161.log.enemy_hit_duel', { roll: eRoll, stamina: d.playerStamina, staminaMax: d.playerStaminaMax });
  }

  _appendLog(d, msg);
  _checkEnd(d);
  saveState();
  _renderAll();
}

function _round() {
  const { _data, _duelRound, _hordeRound } = getContext();

  const d = _data();
  if (!d) return;
  if (d.mode === 'horde') _hordeRound(); else _duelRound();
}

function _startBattle() {
  const { _appendLog, _data, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.over = false;
  d.winner = null;
  d.started = true;
  if (d.log.length) _appendLog(d, t('battlesim161.log.reset_sep'));
  _appendLog(d, d.mode === 'horde'
    ? t('battlesim161.log.start_horde', { n: d.enemyCount })
    : t('battlesim161.log.start_duel', { stamina: d.duelEnemyStamina }));
  saveState();
  _renderAll();
}

function _throwGrenade() {
  const { _appendLog, _checkEnd, _data, _renderAll, _rollDice, saveState, t } = getContext();

  const d = _data();
  if (!d || d.mode !== 'horde' || d.over) return;
  const roll = _rollDice(2, 6, 1);
  const killed = Math.min(roll, d.enemyCount);
  d.enemyCount -= killed;
  d.started = true;
  _appendLog(d, t('battlesim161.log.grenade', { roll, killed, remaining: d.enemyCount }));
  _checkEnd(d);
  saveState();
  _renderAll();
}

function _setMode(mode) {
  const { _data, _renderAll, saveState } = getContext();

  const d = _data();
  if (!d) return;
  d.mode = mode;
  saveState();
  _renderAll();
}

function _pickWeapon(id) {
  const { _data, _renderAll, _weapon, saveState } = getContext();

  const d = _data();
  if (!d) return;
  d.weaponId = id;
  const w = _weapon(id);
  if (id !== 'custom') { d.diceN = w.dice; d.diceSides = w.sides; d.diceMod = w.mod; }
  saveState();
  _renderAll();
}




// END EXTRACTED RULES
  return { _weapon, _weaponNameById, _die, _rollDice, _rollWeapon, _playerDead, _hordeCleared, _duelEnemyDead, _checkEnd, _hordeRound, _duelRound, _round, _startBattle, _throwGrenade, _setMode, _pickWeapon };
}
