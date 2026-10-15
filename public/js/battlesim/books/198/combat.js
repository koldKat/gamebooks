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

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _effectiveSkill(d) {
  const { HELMET_SKILL_BONUS, INVIS_SKILL_BONUS, MAGICSWORD_SKILL_BONUS, RIVERSWORD_SKILL_BONUS } = getContext();

  let skill = d.player.skill;
  if (d.player.hasMagicSword) skill += MAGICSWORD_SKILL_BONUS;
  if (d.player.hasRiverSword) skill += RIVERSWORD_SKILL_BONUS;
  if (d.player.hasMagicHelmet) skill += HELMET_SKILL_BONUS;
  if (d.player.invisibilityActive) skill += INVIS_SKILL_BONUS;
  return skill;
}

function _runRound() {
  const { INVIS_PLAYER_DMG, SVG_SKULL, SVG_TROPHY, _appendLog, _data, _effectiveSkill, _enemyNameSafe, _notReady, _recordOutcome, _renderAll, _roll1d6, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0) return;
  d.roundsThisBattle++;
  d.pendingLuck = null;

  const attack = () => {
    const playerRoll = _roll2d6() + _effectiveSkill(d);
    const enemyRoll   = _roll2d6() + d.enemy.skill;
    _appendLog(d, t('battlesim198.log.round', { round: d.roundsThisBattle, playerAS: playerRoll, enemy: _enemyNameSafe(d), enemyAS: enemyRoll }));
    if (playerRoll === enemyRoll) {
      _appendLog(d, t('battlesim198.log.both_avoided'));
      return;
    }
    if (playerRoll > enemyRoll) {
      const dmg = d.player.invisibilityActive ? INVIS_PLAYER_DMG : 2;
      d.enemy.stamina = Math.max(0, d.enemy.stamina - dmg);
      _appendLog(d, t('battlesim198.log.you_wound', { enemy: _enemyNameSafe(d), n: dmg, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
      if (d.enemy.stamina > 0) d.pendingLuck = 'player-hit';
    } else {
      let dmg = 2;
      if (d.player.invisibilityActive) {
        const r = _roll1d6();
        dmg = r === 6 ? 0 : (r === 2 || r === 4) ? 1 : 2;
        _appendLog(d, t('battlesim198.log.invis_dodge', { enemy: _enemyNameSafe(d), roll: r }));
      }
      d.player.stamina = Math.max(0, d.player.stamina - dmg);
      _appendLog(d, t('battlesim198.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: dmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0 && dmg > 0) d.pendingLuck = 'enemy-hit';
    }
  };
  attack();

  if (d.enemy.stamina <= 0) {
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim198.log.defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, `${SVG_SKULL} ${t('battlesim198.log.fallen')}`);
    _recordOutcome(d, 'loss');
  }

  saveState();
  _renderAll();
}

function _testLuck() {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _data, _enemyNameSafe, _recordOutcome, _renderAll, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingLuck || d.player.luck <= 0) return;
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (d.pendingLuck === 'player-hit') {
    if (lucky) {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
      _appendLog(d, t('battlesim198.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim198.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.enemy.stamina <= 0) { _appendLog(d, `${SVG_TROPHY} ${t('battlesim198.log.defeated', { enemy: _enemyNameSafe(d) })}`); _recordOutcome(d, 'win'); }
  } else {
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim198.log.luck_hit_lucky', { roll, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim198.log.luck_hit_unlucky', { roll, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) { _appendLog(d, `${SVG_SKULL} ${t('battlesim198.log.fallen')}`); _recordOutcome(d, 'loss'); }
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
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.enemy.stamina = d.enemy.staminaMax;
  d.player.stamina = d.player.staminaInitial;
  d.roundsThisBattle = 0;
  d.pendingLuck = null;
  if (d.log.length) _appendLog(d, t('battlesim198.log.reset_sep'));
  _appendLog(d, t('battlesim198.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _effectiveSkill, _runRound, _testLuck, _skipLuck, _resetBattle };
}
