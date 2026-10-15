// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _enemy(id) {
  const { ROSTER } = getContext();
 return ROSTER.find(e => e.id === id) || ROSTER.find(e => e.id === 'li_xiao'); }

function _defaultPlayerStats() {
  const { PLAYER_STAT_KEYS } = getContext();

  const s = {};
  PLAYER_STAT_KEYS.forEach(([k]) => { s[k] = 0; });
  return s;
}

function _roll1d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _enemyName(d) {
  const { _enemy } = getContext();
 return _enemy(d.enemyId).name; }

function _hasWon(results) {

  if (results.length >= 2 && results[results.length - 1] === 'win' && results[results.length - 2] === 'win') return true;
  return results.filter(r => r === 'win').length >= 3;
}

function _playerWon(d) {
  const { _hasWon } = getContext();
 return _hasWon(d.playerResults); }

function _playerLost(d) {
  const { _hasWon, kungFuDefeated } = getContext();
 return _hasWon(d.enemyResults) || (d.rulesVersion === 2 && kungFuDefeated(d)); }

function _playerAttackTotal(d, move) {
  const { _roll1d6 } = getContext();

  const p = d.player;
  const roll = _roll1d6();
  let total;
  if (move === 'leg')      total = roll + p.leg + p.power;
  else if (move === 'hand') total = roll + p.hand + p.power;
  else                      total = roll + p.leg + p.hand + p.power; // combined
  return { roll, total };
}

function _playerDefenseTotal(d, style) {
  const { _roll1d6 } = getContext();

  const p = d.player;
  const roll = _roll1d6();
  const total = style === 'passive'
    ? roll + p.defense + p.calm + p.tactics
    : roll + p.defense + p.reflex + p.speed;
  return { roll, total };
}

function _enemyAttackTotal(e, move, fixed = false) {
  const { _roll1d6 } = getContext();

  const roll = fixed ? 0 : _roll1d6();
  const stat = move === 'leg' ? e.atkLeg : move === 'hand' ? e.atkHand : e.atkComb;
  return { roll, total: roll + (stat || 0) };
}

function _enemyDefenseTotal(e, move, fixed = false) {
  const { _roll1d6 } = getContext();

  const roll = fixed ? 0 : _roll1d6();
  const stat = move === 'leg' ? e.defLeg : move === 'hand' ? e.defHand : e.defComb;
  return { roll, total: roll + (stat || 0) };
}

function _moveLabelKey(move) {

  return { leg: 'battlesim772.move.leg', hand: 'battlesim772.move.hand', combined: 'battlesim772.move.combined' }[move];
}

function _applyPassivePenalty(d, e) {

  // Subtract 2 from every attacker (enemy) stat except dodge.
  ['defLeg', 'atkLeg', 'defHand', 'atkHand', 'defComb', 'atkComb'].forEach(k => {
    if (typeof e[k] === 'number') e[k] = Math.max(0, e[k] - 2);
  });
}

function _checkDodge(d, e) {
  const { _appendLog, _enemyName, _roll1d6, t } = getContext();

  if (!e.dodge) return false;
  const roll = _roll1d6();
  const dodged = e.dodge.includes(roll);
  _appendLog(d, t('battlesim772.log.dodge_roll', { name: _enemyName(d), roll, dodged: dodged ? t('battlesim772.log.dodge_yes') : t('battlesim772.log.dodge_no') }));
  return dodged;
}

function _runRound(playerAction) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _applyPassivePenalty, _battleOver, _checkDodge, _data, _enemy, _enemyAttackTotal, _enemyDefenseTotal, _enemyName, _moveLabelKey, _playerAttackTotal, _playerDefenseTotal, _playerLost, _playerWon, _recordOutcome, _renderAll, advanceKungFuAction, kungFuAction, kungFuEnemy, saveState, t } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  if (playerAction.move === 'passive' && d.playerPassiveUsed) return;
  if (playerAction.move === 'passive') d.playerPassiveUsed = true;
  const staticEnemy = _enemy(d.enemyId);
  // Keep live opponent stats for the fight so passive penalties persist between rounds.
  const revised = d.rulesVersion === 2;
  const liveEnemy = d._liveEnemy || (d._liveEnemy = revised ? kungFuEnemy(staticEnemy) : { ...staticEnemy, pattern: undefined });

  const enemyAction = revised ? kungFuAction(d, staticEnemy) : staticEnemy.pattern(d.roundIdx);

  let playerOutcome = null; // 'win' | 'loss' | 'draw'
  let enemyOutcome = null;

  const isPlayerAttack = playerAction.type === 'attack';
  const isEnemyAttack  = enemyAction.type === 'attack';

  if (isPlayerAttack && isEnemyAttack) {
    // Both attack - book rule 6: round is won by whoever has the higher
    // attack score, regardless of move type (no lane matching needed).
    const pa = _playerAttackTotal(d, playerAction.move);
    const ea = _enemyAttackTotal(liveEnemy, enemyAction.move, revised);
    _appendLog(d, t(revised ? 'battlesim772.log.both_attack_fixed' : 'battlesim772.log.both_attack', {
      pmove: t(_moveLabelKey(playerAction.move)), proll: pa.roll, ptotal: pa.total,
      ename: _enemyName(d), emove: t(_moveLabelKey(enemyAction.move)), eroll: ea.roll, etotal: ea.total,
    }));
    if (pa.total > ea.total) {
      let negated = false;
      if (liveEnemy.dodge) negated = _checkDodge(d, liveEnemy);
      if (negated) { playerOutcome = 'draw'; enemyOutcome = 'draw'; }
      else { playerOutcome = 'win'; enemyOutcome = 'loss'; }
    } else if (ea.total > pa.total) {
      playerOutcome = 'loss'; enemyOutcome = 'win';
    } else {
      playerOutcome = 'draw'; enemyOutcome = 'draw';
    }
  } else if (isPlayerAttack && !isEnemyAttack) {
    // Player attacks, enemy defends.
    const pa = _playerAttackTotal(d, playerAction.move);
    const defMove = playerAction.move; // matching defense lane
    const ed = _enemyDefenseTotal(liveEnemy, defMove, revised);
    _appendLog(d, t(revised ? 'battlesim772.log.player_attacks_fixed' : 'battlesim772.log.player_attacks', {
      pmove: t(_moveLabelKey(playerAction.move)), proll: pa.roll, ptotal: pa.total,
      ename: _enemyName(d), eroll: ed.roll, etotal: ed.total,
    }));
    if (pa.total > ed.total) {
      let negated = false;
      if (liveEnemy.dodge) negated = _checkDodge(d, liveEnemy);
      if (negated) { playerOutcome = 'draw'; enemyOutcome = 'draw'; }
      else { playerOutcome = 'win'; enemyOutcome = 'loss'; }
    } else if (ed.total > pa.total) {
      playerOutcome = 'loss'; enemyOutcome = 'win';
    } else {
      playerOutcome = 'draw'; enemyOutcome = 'draw';
    }
  } else if (!isPlayerAttack && isEnemyAttack) {
    // Player defends, enemy attacks.
    const defMove = playerAction.move; // 'passive' | 'aggressive'
    const pd = _playerDefenseTotal(d, defMove);
    const ea = _enemyAttackTotal(liveEnemy, enemyAction.move, revised);
    _appendLog(d, t(revised ? 'battlesim772.log.player_defends_fixed' : 'battlesim772.log.player_defends', {
      style: t(defMove === 'passive' ? 'battlesim772.move.passive' : 'battlesim772.move.aggressive'),
      proll: pd.roll, ptotal: pd.total,
      ename: _enemyName(d), emove: t(_moveLabelKey(enemyAction.move)), eroll: ea.roll, etotal: ea.total,
    }));
    if (defMove === 'aggressive') {
      if (pd.total > ea.total) {
        let negated = false;
        if (liveEnemy.dodge) negated = _checkDodge(d, liveEnemy);
        if (negated) { playerOutcome = 'draw'; enemyOutcome = 'draw'; }
        else { playerOutcome = 'win'; enemyOutcome = 'loss'; }
      } else if (ea.total > pd.total) { playerOutcome = 'loss'; enemyOutcome = 'win'; }
      else { playerOutcome = 'draw'; enemyOutcome = 'draw'; }
    } else {
      // Passive: never wins the round outright, but if it beats the
      // attack, the attacker (enemy) loses 2 from every stat except dodge.
      if (pd.total > ea.total) {
        _applyPassivePenalty(d, liveEnemy);
        _appendLog(d, t('battlesim772.log.passive_success', { ename: _enemyName(d) }));
        playerOutcome = 'draw'; enemyOutcome = 'draw';
      } else if (ea.total > pd.total) {
        playerOutcome = 'loss'; enemyOutcome = 'win';
      } else {
        playerOutcome = 'draw'; enemyOutcome = 'draw';
      }
    }
  } else {
    // Both defend - nobody wins.
    _appendLog(d, t('battlesim772.log.both_defend'));
    playerOutcome = 'draw'; enemyOutcome = 'draw';
  }

  if (playerOutcome === 'win')       _appendLog(d, t('battlesim772.log.round_win'));
  else if (playerOutcome === 'loss') _appendLog(d, t('battlesim772.log.round_loss'));
  else                                _appendLog(d, t('battlesim772.log.round_draw'));

  d.playerResults.push(playerOutcome);
  d.enemyResults.push(enemyOutcome);
  if (revised) advanceKungFuAction(d, enemyAction, enemyOutcome);
  d.roundIdx += 1;
  // Persist any live-enemy stat mutations (passive-defense penalty) back
  // onto the plain object stored in state.
  d._liveEnemy = { ...liveEnemy };

  if (_playerWon(d)) {
    _appendLog(d, t('battlesim772.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyName(d) }));
    _recordOutcome(d, 'win');
  } else if (_playerLost(d)) {
    _appendLog(d, t('battlesim772.log.fallen', { skull: SVG_SKULL, enemy: _enemyName(d) }));
    _recordOutcome(d, 'loss');
  }

  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _data, _enemyName, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.started = false;
  d.rulesVersion = 2;
  d.enemyAttacks = 0;
  d.enemyAttackLocked = false;
  d.enemyLastAction = null;
  d.roundIdx = 0;
  d.playerPassiveUsed = false;
  d.playerResults = [];
  d.enemyResults = [];
  d._liveEnemy = null;
  if (d.log.length) _appendLog(d, t('battlesim772.log.reset_sep'));
  _appendLog(d, t('battlesim772.log.reset', { enemy: _enemyName(d) }));
  saveState();
  _renderAll();
}

function _pickEnemy(id) {
  const { _data, _resetBattle } = getContext();

  const d = _data();
  if (!d) return;
  d.enemyId = id;
  _resetBattle();
}

// END EXTRACTED RULES
  return { _enemy, _defaultPlayerStats, _roll1d6, _enemyName, _hasWon, _playerWon, _playerLost, _playerAttackTotal, _playerDefenseTotal, _enemyAttackTotal, _enemyDefenseTotal, _moveLabelKey, _applyPassivePenalty, _checkDodge, _runRound, _resetBattle, _pickEnemy };
}
