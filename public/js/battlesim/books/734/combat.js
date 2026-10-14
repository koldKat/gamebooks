// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _isRobot(d) {
 return d.mode === 'robot'; }

function _activeLife(d) {
  const { _isRobot } = getContext();
 return _isRobot(d) ? d.player.armour : d.player.stamina; }

function _activeLifeInitial(d) {
  const { _isRobot } = getContext();
 return _isRobot(d) ? d.player.armourInitial : d.player.staminaInitial; }

function _setActiveLife(d, v) {
  const { _isRobot } = getContext();
 if (_isRobot(d)) d.player.armour = v; else d.player.stamina = v; }

function _roll2d6() {
 return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _sideEnemyNameSafe(d) {
  const { escapeHtml, t } = getContext();
 return escapeHtml(d.sideEnemy.name.trim() || t('battlesim734.ui.second_attacker')); }

function _speedBonus(mySpeed, theirSpeed) {
 return mySpeed > theirSpeed ? 1 : 0; }

function _resetEncounterKnobs(d) {

  d.combatRulesVersion = 2;
  delete d.battleOutcome;
  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.winAfterHits = 0;
  d.player.hitsLandedThisFight = 0;
  d.pairedFight = false;
  d.sideEnemy = { name: '', skill: 0, lifeMax: 0 };
}

function _finishCurrentRound(d) {
  const { SVG_SKULL, SVG_TROPHY, _activeLife, _appendLog, _enemyNameSafe, _recordOutcome, t } = getContext();

  if (d.combatRulesVersion !== 2 || d.battleOutcome) return;
  if (_activeLife(d) <= 0) {
    d.battleOutcome = 'loss';
    d.pendingLuckQueue = [];
    _appendLog(d, t('battlesim734.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  } else if (!d.pendingLuckQueue.length && d.enemy.life <= 0) {
    if (d.pairedFight && d.sideEnemy.lifeMax > 0) {
      d.enemy = { ...d.sideEnemy, life: d.sideEnemy.life ?? d.sideEnemy.lifeMax, speed: d.sideEnemy.speed ?? d.enemy.speed };
      d.pairedFight = false;
      d.sideEnemy = { name: '', skill: 0, lifeMax: 0 };
      d.player.hitsLandedThisFight = 0;
      _appendLog(d, t('battlesim734.log.next_enemy', { enemy: _enemyNameSafe(d) }));
    } else {
      d.battleOutcome = 'win';
      _appendLog(d, t('battlesim734.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
      _recordOutcome(d, 'win');
    }
  }
}

function _switchTarget() {
  const { _activeLife, _data, _notReady, _renderAll, saveState } = getContext();

  const d = _data();
  if (!d || _notReady(d) || _activeLife(d) <= 0 || d.combatRulesVersion !== 2 || !d.pairedFight || d.battleOutcome || d.pendingLuckQueue.length || d.sideEnemy.lifeMax <= 0) return;
  const previous = { ...d.enemy };
  d.enemy = { ...d.sideEnemy, life: d.sideEnemy.life ?? d.sideEnemy.lifeMax, speed: d.sideEnemy.speed ?? previous.speed };
  d.sideEnemy = previous;
  d.player.hitsLandedThisFight = 0;
  saveState();
  _renderAll();
}

function _runRound() {
  const { SIDE_WOUND_DMG, SVG_SKULL, SVG_TROPHY, _activeLife, _activeLifeInitial, _appendLog, _data, _enemyNameSafe, _finishCurrentRound, _isRobot, _notReady, _recordOutcome, _renderAll, _roll2d6, _setActiveLife, _sideEnemyNameSafe, _speedBonus, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.battleOutcome || _activeLife(d) <= 0 || d.enemy.life <= 0 || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;

  const robotMode = _isRobot(d);
  const woundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const myBonus = robotMode ? (d.player.robotCombatBonus || 0) + _speedBonus(d.player.robotSpeed, d.enemy.speed) : 0;
  const theirBonus = robotMode ? _speedBonus(d.enemy.speed, d.player.robotSpeed) : 0;

  const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0) + myBonus;
  const enemyAS  = _roll2d6() + d.enemy.skill + theirBonus;
  _appendLog(d, t('battlesim734.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));

  if (playerAS === enemyAS) {
    _appendLog(d, t('battlesim734.log.both_avoided'));
  } else if (playerAS > enemyAS) {
    d.enemy.life = Math.max(0, d.enemy.life - 2);
    d.player.hitsLandedThisFight++;
    _appendLog(d, t('battlesim734.log.you_wound', { enemy: _enemyNameSafe(d), n: 2, life: d.enemy.life, lifeMax: d.enemy.lifeMax }));
    if (d.player.winAfterHits > 0 && d.player.hitsLandedThisFight >= d.player.winAfterHits && d.enemy.life > 0) {
      d.enemy.life = 0;
      _appendLog(d, t('battlesim734.log.press_advantage'));
    }
    if (d.enemy.life > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    _setActiveLife(d, Math.max(0, _activeLife(d) - woundDmg));
    _appendLog(d, t('battlesim734.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: woundDmg, life: _activeLife(d), lifeMax: _activeLifeInitial(d) }));
    if (_activeLife(d) > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit', damage: woundDmg });
  }

  // Side attackers act every round but cannot be wounded back.
  if (d.pairedFight && d.sideEnemy.lifeMax > 0 && _activeLife(d) > 0) {
    const sideSpeed = d.sideEnemy.speed ?? d.enemy.speed;
    const sideBonus = d.combatRulesVersion === 2 && robotMode ? (d.player.robotCombatBonus || 0) + _speedBonus(d.player.robotSpeed, sideSpeed) : myBonus;
    const sidePlayerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0) + sideBonus;
    const sideAS = _roll2d6() + d.sideEnemy.skill + (d.combatRulesVersion === 2 && robotMode ? _speedBonus(sideSpeed, d.player.robotSpeed) : 0);
    _appendLog(d, t('battlesim734.log.side_round', { enemy: _sideEnemyNameSafe(d), playerAS: sidePlayerAS, enemyAS: sideAS }));
    if (sideAS > sidePlayerAS) {
      _setActiveLife(d, Math.max(0, _activeLife(d) - SIDE_WOUND_DMG));
      _appendLog(d, t('battlesim734.log.side_wounds', { enemy: _sideEnemyNameSafe(d), n: SIDE_WOUND_DMG, life: _activeLife(d), lifeMax: _activeLifeInitial(d) }));
      if (_activeLife(d) > 0) d.pendingLuckQueue.push({ kind: 'side-hit' });
    } else {
      _appendLog(d, t('battlesim734.log.side_fend', { enemy: _sideEnemyNameSafe(d) }));
    }
  }

  if (d.combatRulesVersion === 2) {
    _finishCurrentRound(d);
  } else if (d.enemy.life <= 0) {
    _appendLog(d, t('battlesim734.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (_activeLife(d) <= 0) {
    _appendLog(d, t('battlesim734.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

function _testLuck() {
  const { SVG_SKULL, SVG_TROPHY, _activeLife, _activeLifeInitial, _appendLog, _data, _enemyNameSafe, _finishCurrentRound, _recordOutcome, _renderAll, _roll2d6, _setActiveLife, _sideEnemyNameSafe, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'player-hit') {
    if (lucky) {
      d.enemy.life = Math.max(0, d.enemy.life - 2);
      _appendLog(d, t('battlesim734.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), life: d.enemy.life, lifeMax: d.enemy.lifeMax }));
    } else {
      d.enemy.life = Math.min(d.enemy.lifeMax, d.enemy.life + 1);
      _appendLog(d, t('battlesim734.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), life: d.enemy.life, lifeMax: d.enemy.lifeMax }));
    }
    if (d.combatRulesVersion !== 2 && d.enemy.life <= 0) { _appendLog(d, t('battlesim734.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : _enemyNameSafe(d);
    const luckDamage = d.combatRulesVersion === 2 && event.damage === 4 ? 2 : 1;
    if (lucky) {
      _setActiveLife(d, Math.min(_activeLifeInitial(d), _activeLife(d) + luckDamage));
      _appendLog(d, t('battlesim734.log.luck_hit_lucky', { roll, source, life: _activeLife(d), lifeMax: _activeLifeInitial(d) }));
    } else {
      _setActiveLife(d, Math.max(0, _activeLife(d) - luckDamage));
      _appendLog(d, t('battlesim734.log.luck_hit_unlucky', { roll, source, life: _activeLife(d), lifeMax: _activeLifeInitial(d) }));
    }
    if (d.combatRulesVersion !== 2 && _activeLife(d) <= 0) {
      _appendLog(d, t('battlesim734.log.fallen', { skull: SVG_SKULL }));
      _recordOutcome(d, 'loss');
      d.pendingLuckQueue = [];
    }
  }
  _finishCurrentRound(d);
  saveState();
  _renderAll();
}

function _skipLuck() {
  const { _data, _finishCurrentRound, _renderAll, saveState } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length) return;
  d.pendingLuckQueue.shift();
  _finishCurrentRound(d);
  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _activeLifeInitial, _appendLog, _data, _enemyNameSafe, _renderAll, _setActiveLife, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.combatRulesVersion = 2;
  delete d.battleOutcome;
  if (d.sideEnemy.lifeMax > 0) d.sideEnemy.life = d.sideEnemy.lifeMax;
  d.enemy.life = d.enemy.lifeMax;
  _setActiveLife(d, _activeLifeInitial(d));
  d.roundsThisBattle = 0;
  d.player.hitsLandedThisFight = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim734.log.reset_sep'));
  _appendLog(d, t('battlesim734.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}




// END EXTRACTED RULES
  return { _isRobot, _activeLife, _activeLifeInitial, _setActiveLife, _roll2d6, _enemyName, _enemyNameSafe, _sideEnemyNameSafe, _speedBonus, _resetEncounterKnobs, _finishCurrentRound, _switchTarget, _runRound, _testLuck, _skipLuck, _resetBattle };
}
