// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _enemy(id) {
  const { ROSTER } = getContext();
 return ROSTER.find(e => e.id === id) || ROSTER[0]; }

function _enemyName(d) {
  const { _enemy, t } = getContext();
 return t(_enemy(d.enemyId).nameKey); }

function _checkEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyName, _recordOutcome, t } = getContext();

  if (d.printedCombatRules === 1 && d.player.lp <= 0) {
    d.over = true; d.winner = 'enemy';
    _appendLog(d, t('battlesim412.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  if (d.enemy.hp <= 0) {
    d.over = true; d.winner = 'player';
    _appendLog(d, t('battlesim412.log.defeated', { trophy: SVG_TROPHY, name: _enemyName(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  if (d.player.lp <= 0) {
    d.over = true; d.winner = 'enemy';
    _appendLog(d, t('battlesim412.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _startBattle() {
  const { _appendLog, _checkEnd, _data, _enemy, _enemyName, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  const base = _enemy(d.enemyId);
  d.enemy = { str: d.enemy.str || base.str, hp: d.enemy.startHp || base.hp, startHp: d.enemy.startHp || base.hp };
  d.printedCombatRules = 1;
  d.companionBonus = d.nextCompanionBonus === true ? 5 : 0;
  d.over = false; d.winner = null; d.started = true;
  if (d.log.length) _appendLog(d, t('battlesim412.log.reset_sep'));
  _appendLog(d, t('battlesim412.log.start', { name: _enemyName(d) }));
  if (d.companionBonus) _appendLog(d, t('battlesim412.log.companion'));
  _checkEnd(d);
  saveState();
  _renderAll();
}

function _strikeOnce(d) {
  const { _appendLog, _checkEnd, _enemyName, drawChance, resolveStrike, t } = getContext();

  const bonus = d.printedCombatRules === 1 ? (d.companionBonus || 0) : 0;
  const r = resolveStrike(d.player.lp, d.enemy.str, drawChance(), bonus);
  if (r.outcome === 'enemy') {
    d.enemy.hp = Math.max(0, d.enemy.hp - r.enemyLoss);
    _appendLog(d, t('battlesim412.log.strike_enemy', { chance: r.chance, pstr: r.playerStr, sum: r.sum, estr: d.enemy.str, name: _enemyName(d), hp: d.enemy.hp }));
  } else if (r.outcome === 'player') {
    d.player.lp = Math.max(0, d.player.lp - r.playerLoss);
    _appendLog(d, t('battlesim412.log.strike_player', { chance: r.chance, pstr: r.playerStr, sum: r.sum, estr: d.enemy.str, lp: d.player.lp }));
  } else {
    d.enemy.hp = Math.max(0, d.enemy.hp - r.enemyLoss);
    d.player.lp = Math.max(0, d.player.lp - r.playerLoss);
    _appendLog(d, t('battlesim412.log.strike_both', { chance: r.chance, pstr: r.playerStr, sum: r.sum, estr: d.enemy.str, lp: d.player.lp, hp: d.enemy.hp }));
  }
  return _checkEnd(d);
}

function _strike() {
  const { _data, _renderAll, _strikeOnce, saveState } = getContext();

  const d = _data();
  if (!d || d.over || !d.started) return;
  _strikeOnce(d);
  saveState();
  _renderAll();
}

function _autoResolve() {
  const { _data, _renderAll, _strikeOnce, saveState } = getContext();

  const d = _data();
  if (!d || d.over || !d.started) return;
  let guard = 0;
  while (!d.over && guard++ < 500) { if (_strikeOnce(d)) break; }
  saveState();
  _renderAll();
}

function _rollLp() {
  const { _appendLog, _data, _renderAll, drawChance, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  const n = drawChance();
  d.player.startLp = n + 50;
  d.player.lp = d.player.startLp;
  _appendLog(d, t('battlesim412.log.rolled_lp', { chance: n, lp: d.player.startLp }));
  saveState();
  _renderAll();
}

function _pickEnemy(id) {
  const { _data, _enemy, _renderAll, saveState } = getContext();

  const d = _data();
  if (!d) return;
  d.enemyId = id;
  const base = _enemy(id);
  d.enemy = { str: base.str, hp: base.hp, startHp: base.hp };
  d.started = false; d.over = false; d.winner = null;
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _enemy, _enemyName, _checkEnd, _startBattle, _strikeOnce, _strike, _autoResolve, _rollLp, _pickEnemy };
}
