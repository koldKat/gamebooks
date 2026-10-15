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

function _sideEnemyNameSafe(d) {
  const { escapeHtml } = getContext();
 return escapeHtml(d.sideEnemy.name.trim() || 'the second attacker'); }

function _sideEnemy2NameSafe(d) {
  const { escapeHtml } = getContext();
 return escapeHtml(d.sideEnemy2.name.trim() || 'the third attacker'); }

function _effectiveSkill(d) {

  return d.player.skill;
}

function _resetEncounterKnobs(d) {

  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.winAfterHits = 0;
  d.player.enemyStaminaFloor = 0;
  d.player.hitsLandedThisFight = 0;
  d.pairedFight = false;
  d.sideEnemy = { name: '', skill: 0, staminaMax: 0 };
  d.tripleFight = false;
  d.sideEnemy2 = { name: '', skill: 0, staminaMax: 0 };
}

function _enemyFloor(d) {
 return Math.max(0, d.player.enemyStaminaFloor || 0); }

function _runRound() {
  const { IAIJUTSU_DMG, NTK_ROLL_THRESHOLD, SIDE_WOUND_DMG, SVG_SKULL, SVG_TROPHY, _appendLog, _data, _effectiveSkill, _enemyFloor, _enemyNameSafe, _notReady, _recordOutcome, _renderAll, _roll2d6, _sideEnemy2NameSafe, _sideEnemyNameSafe, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;

  const woundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const floor    = _enemyFloor(d);
  const isIaijutsuRound = d.player.hasIaijutsu && d.roundsThisBattle === 1;

  if (isIaijutsuRound) {
    d.enemy.stamina = Math.max(floor, d.enemy.stamina - IAIJUTSU_DMG);
    d.player.hitsLandedThisFight++;
    _appendLog(d, t('battlesim216.log.iaijutsu', { enemy: _enemyNameSafe(d), n: IAIJUTSU_DMG, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.player.winAfterHits > 0 && d.player.hitsLandedThisFight >= d.player.winAfterHits && d.enemy.stamina > floor) {
      d.enemy.stamina = floor;
      _appendLog(d, t('battlesim216.log.press_advantage'));
    }
    if (d.enemy.stamina > floor) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    const playerRoll = _roll2d6();
    const playerAS = playerRoll + _effectiveSkill(d) + (d.player.attackModifier || 0);
    const enemyAS  = _roll2d6() + d.enemy.skill;
    _appendLog(d, t('battlesim216.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));

    if (playerAS === enemyAS) {
      _appendLog(d, t('battlesim216.log.both_avoided'));
    } else if (playerAS > enemyAS) {
      d.enemy.stamina = Math.max(floor, d.enemy.stamina - 2);
      d.player.hitsLandedThisFight++;
      _appendLog(d, t('battlesim216.log.you_wound', { enemy: _enemyNameSafe(d), n: 2, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
      if (d.player.winAfterHits > 0 && d.player.hitsLandedThisFight >= d.player.winAfterHits && d.enemy.stamina > floor) {
        d.enemy.stamina = floor;
        _appendLog(d, t('battlesim216.log.press_advantage'));
      }
      if (d.enemy.stamina > floor) d.pendingLuckQueue.push({ kind: 'player-hit' });

      if (d.player.hasNitoKenjutsu && playerRoll >= NTK_ROLL_THRESHOLD && d.enemy.stamina > floor) {
        const bonusRoll = _roll2d6();
        const bonusAS = bonusRoll + _effectiveSkill(d) + (d.player.attackModifier || 0);
        const bonusEnemyAS = _roll2d6() + d.enemy.skill;
        _appendLog(d, t('battlesim216.log.ntk_bonus', { roll: playerRoll, bonusAS, enemy: _enemyNameSafe(d), enemyAS: bonusEnemyAS }));
        if (bonusAS > bonusEnemyAS) {
          d.enemy.stamina = Math.max(floor, d.enemy.stamina - 2);
          d.player.hitsLandedThisFight++;
          _appendLog(d, t('battlesim216.log.you_wound', { enemy: _enemyNameSafe(d), n: 2, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
          if (d.player.winAfterHits > 0 && d.player.hitsLandedThisFight >= d.player.winAfterHits && d.enemy.stamina > floor) {
            d.enemy.stamina = floor;
            _appendLog(d, t('battlesim216.log.press_advantage'));
          }
          if (d.enemy.stamina > floor) d.pendingLuckQueue.push({ kind: 'player-hit' });
        } else {
          _appendLog(d, t('battlesim216.log.ntk_miss'));
        }
      }
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - woundDmg);
      _appendLog(d, t('battlesim216.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: woundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
    }
  }

  // Simultaneous side attackers: fresh independent exchanges every round,
  // never woundable themselves (choose-one-target rule, §146/§281/§301).
  if (d.pairedFight && d.sideEnemy.staminaMax > 0 && d.player.stamina > 0) {
    const sidePlayerAS = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
    const sideAS = _roll2d6() + d.sideEnemy.skill;
    _appendLog(d, t('battlesim216.log.side_round', { enemy: _sideEnemyNameSafe(d), playerAS: sidePlayerAS, enemyAS: sideAS }));
    if (sideAS > sidePlayerAS) {
      d.player.stamina = Math.max(0, d.player.stamina - SIDE_WOUND_DMG);
      _appendLog(d, t('battlesim216.log.side_wounds', { enemy: _sideEnemyNameSafe(d), n: SIDE_WOUND_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'side-hit' });
    } else {
      _appendLog(d, t('battlesim216.log.side_fend', { enemy: _sideEnemyNameSafe(d) }));
    }
  }
  if (d.pairedFight && d.tripleFight && d.sideEnemy2.staminaMax > 0 && d.player.stamina > 0) {
    const side2PlayerAS = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
    const side2AS = _roll2d6() + d.sideEnemy2.skill;
    _appendLog(d, t('battlesim216.log.side_round', { enemy: _sideEnemy2NameSafe(d), playerAS: side2PlayerAS, enemyAS: side2AS }));
    if (side2AS > side2PlayerAS) {
      d.player.stamina = Math.max(0, d.player.stamina - SIDE_WOUND_DMG);
      _appendLog(d, t('battlesim216.log.side_wounds', { enemy: _sideEnemy2NameSafe(d), n: SIDE_WOUND_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'side2-hit' });
    } else {
      _appendLog(d, t('battlesim216.log.side_fend', { enemy: _sideEnemy2NameSafe(d) }));
    }
  }

  if (d.enemy.stamina <= floor) {
    _appendLog(d, t('battlesim216.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim216.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

function _testLuck() {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _data, _enemyFloor, _enemyNameSafe, _recordOutcome, _renderAll, _roll2d6, _sideEnemy2NameSafe, _sideEnemyNameSafe, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  const floor = _enemyFloor(d);
  if (event.kind === 'player-hit') {
    if (lucky) {
      d.enemy.stamina = Math.max(floor, d.enemy.stamina - 2);
      _appendLog(d, t('battlesim216.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim216.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.enemy.stamina <= floor) { _appendLog(d, t('battlesim216.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : event.kind === 'side2-hit' ? _sideEnemy2NameSafe(d) : _enemyNameSafe(d);
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim216.log.luck_hit_lucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim216.log.luck_hit_unlucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim216.log.fallen', { skull: SVG_SKULL }));
      _recordOutcome(d, 'loss');
      d.pendingLuckQueue = [];
    }
  }
  saveState();
  _renderAll();
}

function _skipLuck() {
  const { _data, _renderAll, saveState } = getContext();

  const d = _data();
  if (!d || !d.pendingLuckQueue.length) return;
  d.pendingLuckQueue.shift();
  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.enemy.stamina = d.enemy.staminaMax;
  d.player.stamina = d.player.staminaInitial;
  d.roundsThisBattle = 0;
  d.player.hitsLandedThisFight = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim216.log.reset_sep'));
  _appendLog(d, t('battlesim216.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _roll2d6, _enemyName, _enemyNameSafe, _sideEnemyNameSafe, _sideEnemy2NameSafe, _effectiveSkill, _resetEncounterKnobs, _enemyFloor, _runRound, _testLuck, _skipLuck, _resetBattle };
}
