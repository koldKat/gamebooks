// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _roll1d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _strike(attackerLabel, offensive, roll, defenderDefensive) {

  return Math.max(0, offensive + roll - defenderDefensive);
}

function _runRound() {
  const { _appendLog, _checkBattleEnd, _data, _enemyNameSafe, _renderAll, _roll1d6, _strike, saveState, t } = getContext();

  const d = _data();
  if (!d || d.life <= 0 || d.enemy.life <= 0) return;
  d.roundsThisBattle++;

  const pRoll = _roll1d6();
  const eRoll = _roll1d6();
  const pOrder = d.interactive + pRoll;
  const eOrder = d.enemy.interactive + eRoll;
  const gap = pOrder - eOrder;
  const playerFirst = gap >= 0;
  const doubleStrike = Math.abs(gap) >= 3;

  _appendLog(d, t('battlesim80.log.order', {
    round: d.roundsThisBattle, pRoll, pOrder, eRoll, eOrder,
    first: playerFirst ? t('battlesim80.log.you') : _enemyNameSafe(d),
  }));
  if (doubleStrike) _appendLog(d, t('battlesim80.log.double', { who: playerFirst ? t('battlesim80.log.you') : _enemyNameSafe(d) }));

  const sequence = [];
  if (playerFirst) {
    sequence.push('player');
    if (doubleStrike) sequence.push('player');
    sequence.push('enemy');
  } else {
    sequence.push('enemy');
    if (doubleStrike) sequence.push('enemy');
    sequence.push('player');
  }

  for (const side of sequence) {
    if (d.life <= 0 || d.enemy.life <= 0) break;
    const roll = _roll1d6();
    if (side === 'player') {
      const dmg = _strike('player', d.offensive, roll, d.enemy.defensive);
      d.enemy.life = Math.max(0, d.enemy.life - dmg);
      _appendLog(d, t('battlesim80.log.hit_enemy', { roll, dmg, enemy: _enemyNameSafe(d), life: d.enemy.life, lifeMax: d.enemy.lifeMax }));
    } else {
      const dmg = _strike('enemy', d.enemy.offensive, roll, d.defensive);
      d.life = Math.max(0, d.life - dmg);
      _appendLog(d, t('battlesim80.log.hit_player', { roll, dmg, life: d.life, lifeMax: d.lifeInitial }));
    }
  }

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, t } = getContext();

  if (d.enemy.life <= 0) {
    _appendLog(d, t('battlesim80.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.life <= 0) {
    _appendLog(d, t('battlesim80.log.fallen', { skull: SVG_SKULL }));
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
  if (d.log.length) _appendLog(d, t('battlesim80.log.reset_sep'));
  _appendLog(d, t('battlesim80.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}


// END EXTRACTED RULES
  return { _roll1d6, _enemyName, _enemyNameSafe, _strike, _runRound, _checkBattleEnd, _resetBattle };
}
