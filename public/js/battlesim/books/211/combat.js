// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _roll2d6() {
 return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }

function _roll1d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _activeSide(d) {

  return d.mode === 'ship'
    ? { self: d.ship, foe: d.enemyShip, selfAtk: 'weaponsStrength', selfHp: 'shields', selfHpMax: 'weaponsStrengthInitial', foeAtk: 'weaponsStrength', foeHp: 'shields', foeHpMax: 'shieldsMax', roundsKey: 'roundsShip', dmg: 1 }
    : { self: d.player, foe: d.enemy, selfAtk: 'skill', selfHp: 'stamina', selfHpMax: 'staminaInitial', foeAtk: 'skill', foeHp: 'stamina', foeHpMax: 'staminaMax', roundsKey: 'roundsPerson', dmg: d.mode === 'blaster' ? 4 : 2 };
}

function _selfMaxHp(d, side) {

  return d.mode === 'ship' ? d.ship.shieldsInitial : d.player.staminaInitial;
}

function _foeName(d) {
  const { t } = getContext();

  const name = d.mode === 'ship' ? d.enemyShip.name : d.enemy.name;
  return name.trim() || t('battlesim.default_enemy');
}

function _foeNameSafe(d) {
  const { _foeName, escapeHtml } = getContext();
 return escapeHtml(_foeName(d)); }

function _runRound() {
  const { _activeSide, _appendLog, _checkOutcome, _data, _foeNameSafe, _notReady, _renderAll, _roll2d6, _selfMaxHp, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d)) return;
  const side = _activeSide(d);
  if (side.self[side.selfHp] <= 0 || side.foe[side.foeHp] <= 0) return;
  d[side.roundsKey]++;

  if (d.mode === 'handtohand') {
    const playerAS = _roll2d6() + side.self[side.selfAtk];
    const enemyAS  = _roll2d6() + side.foe[side.foeAtk];
    _appendLog(d, t('battlesim211.log.round', { round: d[side.roundsKey], playerAS, enemy: _foeNameSafe(d), enemyAS }));
    if (playerAS === enemyAS) {
      _appendLog(d, t('battlesim211.log.both_avoided'));
    } else if (playerAS > enemyAS) {
      side.foe[side.foeHp] = Math.max(0, side.foe[side.foeHp] - side.dmg);
      _appendLog(d, t('battlesim211.log.you_wound', { enemy: _foeNameSafe(d), dmg: side.dmg, hp: side.foe[side.foeHp], hpMax: side.foe[side.foeHpMax] }));
    } else {
      side.self[side.selfHp] = Math.max(0, side.self[side.selfHp] - side.dmg);
      _appendLog(d, t('battlesim211.log.enemy_wounds', { enemy: _foeNameSafe(d), dmg: side.dmg, hp: side.self[side.selfHp], hpMax: _selfMaxHp(d, side) }));
    }
  } else {
    // Blaster / Ship: independent rolls, not opposed - you roll against your
    // own stat, then (if the foe survived) they roll against theirs.
    const label = d.mode === 'ship' ? 'SHIELDS' : 'STAMINA';
    const atkLabel = side.selfAtk === 'weaponsStrength' ? t('battlesim211.ui.weapons_strength') : t('battlesim211.ui.skill');
    const selfRoll = _roll2d6();
    if (selfRoll < side.self[side.selfAtk]) {
      side.foe[side.foeHp] = Math.max(0, side.foe[side.foeHp] - side.dmg);
      _appendLog(d, t('battlesim211.log.self_roll_hit', { round: d[side.roundsKey], roll: selfRoll, atkLabel, atk: side.self[side.selfAtk], enemy: _foeNameSafe(d), label, hp: side.foe[side.foeHp], hpMax: side.foe[side.foeHpMax] }));
    } else {
      _appendLog(d, t('battlesim211.log.self_roll_miss', { round: d[side.roundsKey], roll: selfRoll, atkLabel, atk: side.self[side.selfAtk] }));
    }
    if (side.foe[side.foeHp] > 0) {
      const foeRoll = _roll2d6();
      if (foeRoll < side.foe[side.foeAtk]) {
        side.self[side.selfHp] = Math.max(0, side.self[side.selfHp] - side.dmg);
        _appendLog(d, t('battlesim211.log.foe_roll_hit', { enemy: _foeNameSafe(d), roll: foeRoll, atkLabel, atk: side.foe[side.foeAtk], label, hp: side.self[side.selfHp], hpMax: _selfMaxHp(d, side) }));
      } else {
        _appendLog(d, t('battlesim211.log.foe_roll_miss', { enemy: _foeNameSafe(d), roll: foeRoll, atkLabel, atk: side.foe[side.foeAtk] }));
      }
    }
  }

  _checkOutcome(d, side);
  saveState();
  _renderAll();
}

function _checkOutcome(d, side) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _foeNameSafe, _recordOutcome, t } = getContext();

  if (side.foe[side.foeHp] <= 0) {
    _appendLog(d, d.mode === 'ship'
      ? t('battlesim211.log.defeated_destroyed', { trophy: SVG_TROPHY, enemy: _foeNameSafe(d) })
      : t('battlesim211.log.defeated_generic',   { trophy: SVG_TROPHY, enemy: _foeNameSafe(d) }));
    _recordOutcome(d, side, 'win');
  } else if (side.self[side.selfHp] <= 0) {
    _appendLog(d, d.mode === 'ship'
      ? t('battlesim211.log.dead_ship',   { skull: SVG_SKULL })
      : t('battlesim211.log.dead_person', { skull: SVG_SKULL }));
    _recordOutcome(d, side, 'loss');
  }
}

function _fireMissile() {
  const { _activeSide, _appendLog, _checkOutcome, _data, _foeNameSafe, _notReady, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.mode !== 'ship' || d.ship.smartMissiles <= 0) return;
  if (d.enemyShip.shields <= 0 || d.ship.shields <= 0) return;
  d.ship.smartMissiles--;
  d.roundsShip++;
  const dmg = Math.max(1, d.missileDamage);
  d.enemyShip.shields = Math.max(0, d.enemyShip.shields - dmg);
  _appendLog(d, t('battlesim211.log.missile', { dmg, enemy: _foeNameSafe(d), shields: d.enemyShip.shields, shieldsMax: d.enemyShip.shieldsMax, left: d.ship.smartMissiles }));
  _checkOutcome(d, _activeSide(d));
  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _activeSide, _appendLog, _data, _renderAll, _selfMaxHp, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  const side = _activeSide(d);
  side.foe[side.foeHp] = side.foe[side.foeHpMax];
  side.self[side.selfHp] = _selfMaxHp(d, side);
  d[side.roundsKey] = 0;
  if (d.log.length) _appendLog(d, t('battlesim211.log.reset_sep'));
  _appendLog(d, t('battlesim211.log.reset'));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _roll2d6, _roll1d6, _activeSide, _selfMaxHp, _foeName, _foeNameSafe, _runRound, _checkOutcome, _fireMissile, _resetBattle };
}
