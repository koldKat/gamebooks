// Alternating duels, consecutive opponents and optional equipment decisions.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _rollDice(n) {
  return Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
}
function _calcDmg(dice) {
  return dice.reduce((sum, die) => sum + (die === 6 ? 2 : die >= 4 ? 1 : 0), 0);
}
function _diceHtml(dice) {
  return '[' + dice.map(getContext()._dieHtml).join(' ') + ']';
}
function _enemyName(d) { return d.enemy.name.trim() || 'врагът'; }
function _fightActive(d) {
  return !!d && d.player.life > 0 && !d.outcomeRecorded &&
    (d.pendingAttack || d.battleStarted || d.round > 1) &&
    (d.enemy.life > 0 || d.group?.remaining.length > 0);
}
function _refreshBattle() {
  const { saveState, _renderInputs, _renderLog, _renderHistory } = getContext();
  saveState(); _renderInputs(); _renderLog(); _renderHistory();
}
function _finishEnemy(d) {
  const { _appendLog, _recordOutcome, t, escapeHtml } = getContext();
  if (d.player.life <= 0) {
    _recordOutcome(d, 'loss');
  } else if (d.enemy.life <= 0) {
    _appendLog(d, t('battlesim8.log.defeated', { en: escapeHtml(_enemyName(d)) }));
    if (d.group?.remaining.length) d.awaitingOpponent = true;
    else _recordOutcome(d, 'win');
  }
}
function _playerStrike(d) {
  const { _rollDice, _calcDmg, _appendLog, _diceHtml, _dmgHtml, AXE_DICE_BONUS, t } = getContext();
  const dice = _rollDice(d.player.skill + (d.items?.axe ? AXE_DICE_BONUS : 0));
  const damage = d.sixWins && dice.includes(6) ? d.enemy.life : _calcDmg(dice);
  d.enemy.life = Math.max(0, d.enemy.life - damage);
  _appendLog(d, t('battlesim8.log.player_attack', { rn: d.round - 1, dice: _diceHtml(dice), damage: _dmgHtml(damage, 's8-dmg-player') }));
}
function _resolveEnemyAttack(index = -1) {
  const { _data, _rollDice, _calcDmg, _appendLog, _diceHtml, _dmgHtml, t, escapeHtml } = getContext();
  const d = _data(), pending = d?.pendingAttack;
  if (!pending) return;
  if (index !== -1) {
    if (!Number.isInteger(index) || pending.dice[index] < 4 || d.chainmailUsed) return;
    const old = pending.dice[index];
    pending.dice[index] = _rollDice(1)[0];
    d.chainmailUsed = true;
    _appendLog(d, t('battlesim8.log.chainmail_note', { old, new: pending.dice[index] }));
  }
  const damage = _calcDmg(pending.dice);
  d.player.life = Math.max(0, d.player.life - damage);
  _appendLog(d, t('battlesim8.log.enemy_attack', { rn: d.round - 1, en: escapeHtml(_enemyName(d)), dice: _diceHtml(pending.dice), damage: _dmgHtml(damage, 's8-dmg-enemy') }));
  delete d.pendingAttack;
  if (d.player.life > 0 && pending.thenPlayer) _playerStrike(d);
  _finishEnemy(d);
  _refreshBattle();
}
function _runRound() {
  const { _data, _rollDice, AXE_DICE_BONUS } = getContext();
  const d = _data();
  if (!d || d.player.life <= 0 || d.enemy.life <= 0 || d.pendingAttack || d.outcomeRecorded) return;
  d.battleStarted = true;
  d.round++;
  if (!d.enemy.foeFirst) {
    _playerStrike(d);
    if (d.enemy.life <= 0) { _finishEnemy(d); _refreshBattle(); return; }
  }
  d.pendingAttack = { dice: _rollDice(d.enemy.skill + (d.items?.axe ? AXE_DICE_BONUS : 0)), thenPlayer: !!d.enemy.foeFirst };
  if (d.items?.chainmail && !d.chainmailUsed && d.pendingAttack.dice.some(die => die >= 4)) _refreshBattle();
  else _resolveEnemyAttack();
}
function _startEncounter(opponents, preset = {}) {
  const { _data } = getContext();
  const d = _data();
  if (!d || _fightActive(d) || !Array.isArray(opponents) || !opponents.length || opponents.length > 100) return false;
  if (opponents.some(e => !Number.isInteger(e.skill) || e.skill < 2 || e.skill > 5 || !Number.isInteger(e.lifeMax) || e.lifeMax < 1)) return false;
  const enemies = opponents.map(e => ({ name: String(e.displayName ?? e.name ?? '').trim().slice(0, 200), skill: e.skill, life: e.lifeMax, lifeMax: e.lifeMax, foeFirst: false }));
  d.group = { name: String(preset.name || enemies.map(e => e.name || 'Враг').join(', ')), initial: structuredClone(enemies), remaining: enemies.slice(1), bowForbidden: !!preset.bowForbidden };
  d.enemy = enemies[0]; d.round = 1; d.bowFired = false; d.battleStarted = false;
  d.chainmailUsed = false; d.outcomeRecorded = false; d.awaitingOpponent = false;
  delete d.pendingAttack;
  _refreshBattle(); return true;
}
function _chooseOpponent(index) {
  const d = getContext()._data();
  if (!d?.group || d.pendingAttack || d.player.life <= 0 || d.outcomeRecorded || !Number.isInteger(index) || index < 0 || index >= d.group.remaining.length) return;
  if (d.battleStarted && !d.awaitingOpponent) return;
  const next = d.group.remaining.splice(index, 1)[0];
  if (!d.awaitingOpponent) d.group.remaining.splice(index, 0, d.enemy);
  next.foeFirst = !!d.battleStarted;
  d.enemy = next; d.awaitingOpponent = false; d.chainmailUsed = false;
  _refreshBattle();
}
function _fireBow() {
  const { _data, _rollDice, _calcDmg, _appendLog, _diceHtml, _dmgHtml, _enemyName, t, escapeHtml } = getContext();
  const d = _data();
  if (!d || d.round !== 1 || d.bowFired || d.group?.bowForbidden || d.enemy.foeFirst || d.pendingAttack || d.outcomeRecorded || !d.items?.bow || !(d.items.arrows > 0) || d.player.life <= 0 || d.enemy.life <= 0) return;
  const dice = _rollDice(1), damage = _calcDmg(dice);
  d.items.arrows--; d.bowFired = true; d.battleStarted = true;
  d.enemy.life = Math.max(0, d.enemy.life - damage);
  _appendLog(d, t('battlesim8.log.arrow', { dice: _diceHtml(dice), dmg: _dmgHtml(damage, 's8-dmg-player'), en: escapeHtml(_enemyName(d)), enemyLife: d.enemy.life, arrows: d.items.arrows }));
  _finishEnemy(d); _refreshBattle();
}
function _resetBattle() {
  const { _data, _appendLog, t } = getContext();
  const d = _data();
  if (!d) return;
  if (d.group) {
    const enemies = structuredClone(d.group.initial);
    d.enemy = enemies[0]; d.group.remaining = enemies.slice(1);
  } else d.enemy.life = d.enemy.lifeMax;
  d.player.life = d.player.lifeMax; d.round = 1; d.bowFired = false;
  d.battleStarted = false; d.chainmailUsed = false; d.outcomeRecorded = false; d.awaitingOpponent = false;
  delete d.pendingAttack;
  _appendLog(d, t('battlesim8.log.reset')); _refreshBattle();
}
// END EXTRACTED RULES
  return { _rollDice, _calcDmg, _diceHtml, _enemyName, _fightActive, _runRound, _fireBow, _resetBattle, _startEncounter, _chooseOpponent, _resolveEnemyAttack };
}
