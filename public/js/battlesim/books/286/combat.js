// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _techName(key) {
  const { t } = getContext();
 return t(`battlesim286.tech.${key}.name`); }

function _techDesc(key) {
  const { t } = getContext();
 return t(`battlesim286.tech.${key}.desc`); }

function _loadoutAE(d) {
  const { SHIELDS, WEAPONS } = getContext();

  const w = WEAPONS.find(w => w[0] === d.player.weaponKey);
  const s = SHIELDS.find(s => s[0] === d.player.shieldKey);
  const weaponAE = w ? (w[0] === 'custom' ? (d.player.customAeCost || 0) : w[2]) : 0;
  const shieldAE = s ? s[2] : 0;
  return weaponAE + shieldAE;
}

function _roll2d6() {
 return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }

function _roll1d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _enemyName(d) {
 return d.enemy.name.trim() || 'противникът'; }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _startGroup(d) {

  d.groupRules = true;
  d.group = { target: 0, hp: Array.from({ length: 1 + Math.min(20, d.enemy.extraAttackers || 0) }, (_, i) => i ? d.enemy.hpMax : d.enemy.hp) };
  d.battleStart.playerLife = d.player.life;
  d.battleStart.enemyHp = d.enemy.hp;
  d.battleStart.group = structuredClone(d.group);
}

function _syncGroup(d) {

  if (d.group) d.group.hp[d.group.target] = d.enemy.hp;
}

function _allEnemiesDefeated(d) {

  return d.group ? d.group.hp.every((hp, i) => (i === d.group.target ? d.enemy.hp : hp) <= 0) : d.enemy.hp <= 0;
}

function _advanceTarget(d) {
  const { _syncGroup } = getContext();

  _syncGroup(d);
  if (!d.group || d.enemy.hp > 0) return;
  const next = d.group.hp.findIndex(hp => hp > 0);
  if (next >= 0) { d.group.target = next; d.enemy.hp = d.group.hp[next]; }
}

function _enemyTurn(d) {
  const { _enemyAttackOnce, _resolveExtraAttackers, _syncGroup, t } = getContext();

  if (!d.group) {
    _enemyAttackOnce(d);
    if (d.player.life > 0) _resolveExtraAttackers(d);
    return;
  }
  _syncGroup(d);
  for (let i = 0; i < d.group.hp.length && d.player.life > 0; i++) {
    if (d.group.hp[i] > 0) _enemyAttackOnce(d, t('battlesim286.ui.group_member', { n: i + 1 }));
  }
}

function _weaponMinHit(d) {
  const { WEAPONS } = getContext();

  const w = WEAPONS.find(w => w[0] === d.player.weaponKey);
  if (!w) return 6;
  return w[0] === 'custom' ? (d.player.customMinHit || 0) : w[1];
}

function _weaponIsGlove(d) {
 return d.player.weaponKey === 'glove'; }

function _shieldDef(d) {
  const { SHIELDS } = getContext();

  const s = SHIELDS.find(s => s[0] === d.player.shieldKey);
  return s ? s[1] : 0;
}

function _totalPlayerDef(d) {
  const { _shieldDef } = getContext();

  return _shieldDef(d) + (d.effects.tempShield ? -4 : 0) - (d.player.extraDef || 0);
}

function _playerAttackOnce(d) {
  const { _appendLog, _enemyNameSafe, _roll2d6, _syncGroup, _weaponIsGlove, _weaponMinHit, t } = getContext();

  const roll   = _roll2d6();
  const minHit = _weaponIsGlove(d) ? 4 : _weaponMinHit(d);
  let dmg = Math.max(0, roll - minHit);
  const hit = _weaponIsGlove(d) ? roll >= 4 : roll > minHit;
  if (hit && _weaponIsGlove(d)) dmg += d.player.gloveBonus;
  if (hit && d.effects.pendingBonus > 0) {
    dmg += d.effects.pendingBonus;
    d.effects.pendingBonus = 0;
  }
  if (!hit) dmg = 0;
  d.enemy.hp = Math.max(0, d.enemy.hp - dmg);
  _syncGroup(d);
  _appendLog(d, dmg > 0
    ? t('battlesim286.log.player_hit', { roll, minHit, dmg, enemy: _enemyNameSafe(d), hp: d.enemy.hp, hpMax: d.enemy.hpMax })
    : t('battlesim286.log.player_miss', { roll, minHit }));
}

function _enemyAttackOnce(d, labelOverride = null) {
  const { _appendLog, _enemyNameSafe, _roll2d6, _totalPlayerDef, t } = getContext();

  const label = labelOverride ?? _enemyNameSafe(d);
  if (d.effects.enemyStun > 0) {
    d.effects.enemyStun--;
    _appendLog(d, t('battlesim286.log.enemy_stunned', { label }));
    return;
  }
  const roll = _roll2d6();
  const minHit = d.enemy.minHit || 0;
  const hit  = roll > minHit;
  // Fixed-damage hits still receive normal shield/armour reduction.
  const raw  = hit ? (d.enemy.fixedDamage > 0 ? d.enemy.fixedDamage : (roll - minHit)) : 0;
  const dmg  = Math.max(0, raw + _totalPlayerDef(d));
  if (dmg > 0) {
    d.player.life = Math.max(0, d.player.life - dmg);
    _appendLog(d, t('battlesim286.log.enemy_hit', { label, roll, minHit, dmg, life: d.player.life, lifeMax: d.player.lifeMax }));
  } else {
    _appendLog(d, t('battlesim286.log.enemy_miss', { label, roll, minHit }));
  }
}

function _resolveExtraAttackers(d) {
  const { _enemyAttackOnce, _enemyNameSafe, t } = getContext();

  const n = d.enemy.extraAttackers || 0;
  for (let i = 1; i <= n && d.player.life > 0; i++) {
    _enemyAttackOnce(d, t('battlesim286.ui.extra_attacker_label', { enemy: _enemyNameSafe(d), n: i }));
  }
}

function _runRound() {
  const { SVG_SKULL, SVG_TROPHY, _advanceTarget, _allEnemiesDefeated, _appendLog, _data, _enemyNameSafe, _enemyTurn, _notReady, _playerAttackOnce, _recordOutcome, _renderAll, _startGroup, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.life <= 0 || _allEnemiesDefeated(d) || d.dream3) return;
  if (d.groupRules && !d.group) _startGroup(d);
  _advanceTarget(d);
  d.roundsThisBattle = (d.roundsThisBattle || 0) + 1;

  if (d.player.enemyFirst) {
    _enemyTurn(d);
    if (d.player.life <= 0) {
      _appendLog(d, `${SVG_SKULL} ${t('battlesim286.log.player_fallen')}`);
      _recordOutcome(d, 'loss');
      saveState();
      _renderAll();
      return;
    }
  }

  _playerAttackOnce(d);
  _advanceTarget(d);
  if (d.effects.doubleAttack && !_allEnemiesDefeated(d)) { _playerAttackOnce(d); _advanceTarget(d); }

  if (_allEnemiesDefeated(d)) {
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim286.log.enemy_defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
  } else if (!d.player.enemyFirst) {
    _enemyTurn(d);
    if (d.player.life <= 0) {
      _appendLog(d, `${SVG_SKULL} ${t('battlesim286.log.player_fallen')}`);
      _recordOutcome(d, 'loss');
    }
  }

  saveState();
  _renderAll();
}

function _heal(amount) {
  const { _allEnemiesDefeated, _appendLog, _data, _notReady, _renderAll, saveState, showAlert, t } = getContext();

  const d = _data();
  if (!d || amount <= 0 || d.dream3) return;
  if (_notReady(d)) {
    showAlert(t('battlesim286.alert.not_ready'));
    return;
  }
  if (d.roundsThisBattle > 0 && d.player.life > 0 && !_allEnemiesDefeated(d)) {
    showAlert(t('battlesim286.alert.heal_midfight'));
    return;
  }
  if (d.healUsedThisBattle) {
    showAlert(t('battlesim286.alert.heal_used'));
    return;
  }
  const before = d.player.life;
  d.player.life = Math.min(d.player.lifeMax, d.player.life + amount);
  d.healUsedThisBattle = true;
  _appendLog(d, t('battlesim286.log.heal', { n: amount, before, life: d.player.life, lifeMax: d.player.lifeMax }));
  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, _startGroup, saveState, t } = getContext();

  const d = _data();
  if (!d || d.dream3) return;
  d.enemy.hp    = d.enemy.hpMax;
  d.player.life = d.player.lifeMax;
  d.effects = { tempShield: false, doubleAttack: false, pendingBonus: 0, enemyStun: 0 };
  d.roundsThisBattle = 0;
  d.healUsedThisBattle = false;
  d.battleStart = { playerLife: d.player.life, enemyHp: d.enemy.hp };
  _startGroup(d);
  if (d.log.length) _appendLog(d, t('battlesim286.log.reset_sep'));
  _appendLog(d, t('battlesim286.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

function _activateTech(key) {
  const { SVG_SKULL, SVG_TROPHY, TECH_ATTEMPT_COST, TECH_ITEMS, _advanceTarget, _allEnemiesDefeated, _appendLog, _data, _enemyNameSafe, _notReady, _recordOutcome, _renderAll, _roll2d6, _startGroup, _techDesc, _techName, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  const item  = TECH_ITEMS.find(i => i.key === key);
  const state = d.tech[key];
  if (!item || !state || _notReady(d) || d.dream3) return;

  if (item.kind === 'revive') {
    if (d.dehronatorUsed || d.player.life <= 0) return;
    // Deduct revive's 15 HP from the restored starting life, not the overwritten current value.
    d.player.life = Math.max(0, d.battleStart.playerLife - item.cost);
    d.enemy.hp    = d.battleStart.enemyHp;
    if (d.battleStart.group) d.group = structuredClone(d.battleStart.group);
    d.dehronatorUsed = true;
    state.usesLeft = 0;
    _appendLog(d, t('battlesim286.log.dehronator', { cost: item.cost, life: d.player.life, lifeMax: d.player.lifeMax }));
    if (d.player.life <= 0) {
      _appendLog(d, `${SVG_SKULL} ${t('battlesim286.log.dehronator_death')}`);
      _recordOutcome(d, 'loss');
    }
    saveState();
    _renderAll();
    return;
  }

  // Block actions after resolution to prevent duplicate outcome history.
  if (d.player.life <= 0 || _allEnemiesDefeated(d)) return;
  if (d.groupRules && !d.group) _startGroup(d);
  _advanceTarget(d);

  // Activated charged weapons fire freely; failed activation costs HP but not ammunition.
  if (item.charged && state.activated) {
    if (state.usesLeft <= 0) return;
    state.usesLeft--;
    d.enemy.hp = Math.max(0, d.enemy.hp - item.damage);
    _appendLog(d, t('battlesim286.log.charged_shot', { name: _techName(item.key), dmg: item.damage, enemy: _enemyNameSafe(d), hp: d.enemy.hp, hpMax: d.enemy.hpMax, left: state.usesLeft }));
    _advanceTarget(d);
    if (_allEnemiesDefeated(d)) { _appendLog(d, `${SVG_TROPHY} ${t('battlesim286.log.enemy_defeated', { enemy: _enemyNameSafe(d) })}`); _recordOutcome(d, 'win'); }
    saveState();
    _renderAll();
    return;
  }

  if (item.charged) {
    if (state.usesLeft <= 0) return; // depleted before ever landing an activation roll
  } else if (state.usesLeft <= 0) {
    return; // items 1-5: 3 attempts total, win or lose
  }

  d.player.life = Math.max(0, d.player.life - TECH_ATTEMPT_COST);
  if (!item.charged) state.usesLeft--; // charged items: cost paid, but the attempt itself never spends a charge
  const roll = _roll2d6();
  const ok   = roll >= 6;
  if (!ok) {
    _appendLog(d, t('battlesim286.log.activate_fail', { name: _techName(item.key), roll, cost: TECH_ATTEMPT_COST }));
  } else {
    switch (item.kind) {
      case 'buff_shield': d.effects.tempShield   = true; break;
      case 'buff_next':   d.effects.pendingBonus = 10;   break;
      case 'stun':        d.effects.enemyStun    = 3;    break;
      case 'double':      d.effects.doubleAttack = true; break;
      case 'direct':
        if (item.charged) { state.activated = true; state.usesLeft--; } // first shot spends its own charge
        d.enemy.hp = Math.max(0, d.enemy.hp - item.damage);
        break;
    }
    _appendLog(d, t('battlesim286.log.activate_success', { name: _techName(item.key), roll, cost: TECH_ATTEMPT_COST, desc: _techDesc(item.key) }));
    if (item.kind === 'direct') {
      _appendLog(d, t('battlesim286.log.direct_hit', { enemy: _enemyNameSafe(d), dmg: item.damage, hp: d.enemy.hp, hpMax: d.enemy.hpMax }));
      _advanceTarget(d);
      if (_allEnemiesDefeated(d)) { _appendLog(d, `${SVG_TROPHY} ${t('battlesim286.log.enemy_defeated', { enemy: _enemyNameSafe(d) })}`); _recordOutcome(d, 'win'); }
    }
  }
  if (d.player.life <= 0) {
    _appendLog(d, `${SVG_SKULL} ${t('battlesim286.log.player_fallen')}`);
    _recordOutcome(d, 'loss');
  }
  saveState();
  _renderAll();
}

function _sleepAttempt() {
  const { _allEnemiesDefeated, _appendLog, _data, _notReady, _renderAll, _resolveDream, _roll2d6, saveState, showAlert, t } = getContext();

  const d = _data();
  if (!d || d.dream3) return;
  if (_notReady(d)) {
    showAlert(t('battlesim286.alert.not_ready'));
    return;
  }
  // "Можеш да спиш във всеки епизод, освен когато си нападнат" - sleep is
  // blocked mid-fight for the same reason manual healing is.
  if (d.roundsThisBattle > 0 && d.player.life > 0 && !_allEnemiesDefeated(d)) {
    showAlert(t('battlesim286.alert.sleep_midfight'));
    return;
  }
  const roll = _roll2d6();
  if (roll >= 6) {
    const before = d.player.life;
    d.player.life = Math.min(d.player.lifeMax, d.player.life + roll);
    _appendLog(d, t('battlesim286.log.sleep_calm', { roll, before, life: d.player.life, lifeMax: d.player.lifeMax }));
    saveState();
    _renderAll();
    return;
  }
  _appendLog(d, t('battlesim286.log.sleep_troubled', { roll }));
  const dreamRoll = _roll2d6();
  _appendLog(d, t('battlesim286.log.dream_roll', { roll: dreamRoll, label: t(`battlesim286.dream.${dreamRoll}`) }));
  _resolveDream(d, dreamRoll);
  saveState();
  _renderAll();
}

function _resolveDream(d, n) {
  const { DREAM_ENCOUNTERS, SVG_SKULL, SVG_TROPHY, _appendLog, _recordOutcome, _roll1d6, _roll2d6, t } = getContext();

  const sleepLife = d.player.life; // life at the moment of falling asleep
  switch (n) {
    case 2: {
      const roll = _roll2d6();
      if (roll <= 7) { _appendLog(d, t('battlesim286.dream2.safe', { roll })); }
      else { d.player.life = 0; _appendLog(d, t('battlesim286.dream2.explode', { roll })); }
      break;
    }
    case 3: {
      d.dream3 = { total: 0 };
      _appendLog(d, t('battlesim286.dream3.instructions'));
      break;
    }
    case 4: {
      const days = _roll1d6();
      d.player.life = Math.max(0, d.player.life - days);
      _appendLog(d, t('battlesim286.dream4.result', { days }));
      break;
    }
    case 5: {
      const sum  = _roll1d6() + _roll1d6() + _roll1d6();
      const loss = Math.floor(sum / 2);
      if (loss > sleepLife) {
        d.player.life = 0;
        _appendLog(d, t('battlesim286.dream5.death', { loss, sum }));
      } else {
        d.player.life = sleepLife - loss;
        d.player.life = Math.min(d.player.lifeMax, d.player.life + 25);
        _appendLog(d, t('battlesim286.dream5.survive', { loss, life: d.player.life, lifeMax: d.player.lifeMax }));
      }
      break;
    }
    case 6: {
      const encounter = DREAM_ENCOUNTERS[n];
      const netRoll = _roll2d6();
      if (netRoll >= encounter.netCatchAt) {
        _appendLog(d, t('battlesim286.dream6.net_catch', { roll: netRoll }));
        break;
      }
      _appendLog(d, t('battlesim286.dream6.net_miss', { roll: netRoll }));
      let lionHp = encounter.opponent.hp;
      while (lionHp > 0 && d.player.life > 0) {
        const pr = _roll2d6();
        const pd = pr > encounter.player.minHit ? pr - encounter.player.minHit : 0;
        lionHp = Math.max(0, lionHp - pd);
        _appendLog(d, pd > 0 ? t('battlesim286.dream6.player_hit', { roll: pr, dmg: pd, lionHp }) : t('battlesim286.dream6.player_miss', { roll: pr }));
        if (lionHp <= 0) break;
        const er = _roll2d6();
        const ed = er > encounter.opponent.minHit
          ? Math.max(0, er - encounter.opponent.minHit - encounter.player.damageReduction) : 0;
        d.player.life = Math.max(0, d.player.life - ed);
        _appendLog(d, ed > 0 ? t('battlesim286.dream6.lion_hit', { roll: er, dmg: ed, life: d.player.life, lifeMax: d.player.lifeMax }) : t('battlesim286.dream6.lion_miss', { roll: er }));
      }
      _appendLog(d, lionHp <= 0 ? `${SVG_TROPHY} ${t('battlesim286.dream6.win')}` : `${SVG_SKULL} ${t('battlesim286.dream6.lose')}`);
      break;
    }
    case 7: {
      d.player.life = Math.min(d.player.lifeMax, d.player.life + 15);
      _appendLog(d, t('battlesim286.dream7.result'));
      break;
    }
    case 8: {
      const years = _roll2d6() * 10;
      if (years < 100) {
        d.player.life = d.player.lifeMax;
        _appendLog(d, t('battlesim286.dream8.safe', { years }));
      } else {
        d.player.life = 0;
        _appendLog(d, t('battlesim286.dream8.death', { years }));
      }
      break;
    }
    case 9: {
      d.player.life = 0;
      _appendLog(d, t('battlesim286.dream9.result'));
      break;
    }
    case 10: {
      _appendLog(d, t('battlesim286.dream10.intro'));
      for (let i = 1; i <= DREAM_ENCOUNTERS[n].opponentCount && d.player.life > 0; i++) {
        const pr = _roll1d6(), gr = _roll1d6();
        if (pr > gr) {
          const gain = pr - gr;
          d.player.life = Math.min(d.player.lifeMax, d.player.life + gain);
          _appendLog(d, t('battlesim286.dream10.guard_win', { n: i, pr, gr, gain }));
        } else if (pr < gr) {
          const loss = gr - pr;
          d.player.life = Math.max(0, d.player.life - loss);
          _appendLog(d, t('battlesim286.dream10.guard_lose', { n: i, pr, gr, loss }));
        } else {
          _appendLog(d, t('battlesim286.dream10.guard_tie', { n: i, roll: pr }));
        }
      }
      break;
    }
    case 11: {
      d.player.life = Math.max(0, d.player.life - 5);
      _appendLog(d, t('battlesim286.dream11.result'));
      break;
    }
    case 12: {
      d.player.life = Math.min(d.player.lifeMax, d.player.life + 18);
      _appendLog(d, t('battlesim286.dream12.result'));
      break;
    }
  }
  // Label dream deaths independently of the previous enemy.
  if (d.player.life <= 0) _recordOutcome(d, 'loss', t('battlesim286.log.dream_death_label', { label: t(`battlesim286.dream.${n}`) }));
}

function _dream3Finish(d) {
  const { _appendLog, _recordOutcome, t } = getContext();

  const roll = d.dream3.total;
  const gain = roll >= 9 && roll <= 12;
  d.player.life = gain ? Math.min(d.player.lifeMax, d.player.life + roll) : Math.max(0, d.player.life - roll);
  _appendLog(d, t(gain ? 'battlesim286.dream3.gain' : 'battlesim286.dream3.loss', { roll }));
  delete d.dream3;
  if (d.player.life <= 0) _recordOutcome(d, 'loss', t('battlesim286.log.dream_death_label', { label: t('battlesim286.dream.3') }));
}

function _dream3Roll() {
  const { _appendLog, _data, _dream3Finish, _renderAll, _roll1d6, saveState, t } = getContext();

  const d = _data();
  if (!d?.dream3 || d.player.life <= 0) return;
  const roll = _roll1d6();
  d.dream3.total += roll;
  _appendLog(d, t('battlesim286.dream3.roll', { roll, total: d.dream3.total }));
  if (d.dream3.total >= 9) _dream3Finish(d);
  saveState();
  _renderAll();
}

function _dream3Stop() {
  const { _data, _dream3Finish, _renderAll, saveState } = getContext();

  const d = _data();
  if (!d?.dream3 || !d.dream3.total) return;
  _dream3Finish(d);
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _techName, _techDesc, _loadoutAE, _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _startGroup, _syncGroup, _allEnemiesDefeated, _advanceTarget, _enemyTurn, _weaponMinHit, _weaponIsGlove, _shieldDef, _totalPlayerDef, _playerAttackOnce, _enemyAttackOnce, _resolveExtraAttackers, _runRound, _heal, _resetBattle, _activateTech, _sleepAttempt, _resolveDream, _dream3Finish, _dream3Roll, _dream3Stop };
}
