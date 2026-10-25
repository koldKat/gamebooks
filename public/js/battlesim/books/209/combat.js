// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _roll2d6() {
 return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }

function _roll1d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _activeSide(d) {

  return d.mode === 'vehicle'
    ? { self: d.car, foe: d.enemyCar, selfAtk: 'firepower', selfHp: 'armour', selfHpMax: 'armourInitial', foeAtk: 'firepower', foeHp: 'armour', foeHpMax: 'armourMax', roundsKey: 'roundsVehicle' }
    : { self: d.player, foe: d.enemy, selfAtk: 'skill', selfHp: 'stamina', selfHpMax: 'staminaInitial', foeAtk: 'skill', foeHp: 'stamina', foeHpMax: 'staminaMax', roundsKey: 'roundsPerson' };
}

function _foeName(d) {
  const { t } = getContext();

  const name = d.mode === 'vehicle' ? d.enemyCar.name : d.enemy.name;
  return name.trim() || t('battlesim.default_enemy');
}

function _foeNameSafe(d) {
  const { _foeName, escapeHtml } = getContext();
 return escapeHtml(_foeName(d)); }

function _handOver(d) {
  const { HAND_KO_THRESHOLD } = getContext();
  return d.mode === 'hand' && (d.enemyHandLoss >= HAND_KO_THRESHOLD || d.playerHandLoss >= HAND_KO_THRESHOLD);
}

function _runRound() {
  const { _activeSide, _appendLog, _checkOutcome, _data, _foeNameSafe, _handOver, _notReady, _renderAll, _roll1d6, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || _handOver(d)) return;
  const side = _activeSide(d);
  if (side.self[side.selfHp] <= 0 || side.foe[side.foeHp] <= 0) return;
  d[side.roundsKey]++;

  const selfRoll = _roll2d6() + side.self[side.selfAtk];
  const foeRoll  = _roll2d6() + side.foe[side.foeAtk];
  _appendLog(d, t('battlesim209.log.round', { round: d[side.roundsKey], selfRoll, enemy: _foeNameSafe(d), foeRoll }));

  if (selfRoll === foeRoll) {
    _appendLog(d, t('battlesim209.log.both_miss'));
  } else if (selfRoll > foeRoll) {
    const dmg = d.mode === 'hand' ? d.handDmg : _roll1d6();
    side.foe[side.foeHp] = Math.max(0, side.foe[side.foeHp] - dmg);
    if (d.mode === 'hand') d.enemyHandLoss += dmg;
    _appendLog(d, t('battlesim209.log.you_hit', { enemy: _foeNameSafe(d), dmg, label: side.foeHp.toUpperCase(), hp: side.foe[side.foeHp], hpMax: side.foe[side.foeHpMax] }));
  } else {
    const dmg = d.mode === 'hand' ? d.handDmg : _roll1d6();
    side.self[side.selfHp] = Math.max(0, side.self[side.selfHp] - dmg);
    if (d.mode === 'hand') d.playerHandLoss += dmg;
    _appendLog(d, t('battlesim209.log.enemy_hits', { enemy: _foeNameSafe(d), dmg, label: side.selfHp.toUpperCase(), hp: side.self[side.selfHp], hpMax: side.self[side.selfHpMax] }));
  }

  _checkOutcome(d, side);
  saveState();
  _renderAll();
}

function _checkOutcome(d, side) {
  const { HAND_KO_THRESHOLD, SVG_SKULL, SVG_TROPHY, _appendLog, _foeNameSafe, _recordOutcome, t } = getContext();

  if (side.foe[side.foeHp] <= 0) {
    _appendLog(d, d.mode === 'vehicle' ? t('battlesim209.log.defeated_destroyed', { trophy: SVG_TROPHY, enemy: _foeNameSafe(d) }) : t('battlesim209.log.defeated_dead', { trophy: SVG_TROPHY, enemy: _foeNameSafe(d) }));
    _recordOutcome(d, side, 'win');
    return;
  }
  if (side.self[side.selfHp] <= 0) {
    _appendLog(d, d.mode === 'vehicle' ? t('battlesim209.log.dead_vehicle', { skull: SVG_SKULL }) : t('battlesim209.log.dead_person', { skull: SVG_SKULL }));
    _recordOutcome(d, side, 'loss');
    return;
  }
  // Knocked-out threshold only applies to Hand Fighting.
  if (d.mode === 'hand') {
    if (d.enemyHandLoss >= HAND_KO_THRESHOLD) {
      _appendLog(d, t('battlesim209.log.ko_enemy', { trophy: SVG_TROPHY, enemy: _foeNameSafe(d) }));
      _recordOutcome(d, side, 'win', t('battlesim209.note.ko'));
    } else if (d.playerHandLoss >= HAND_KO_THRESHOLD) {
      _appendLog(d, t('battlesim209.log.ko_player', { skull: SVG_SKULL }));
      _recordOutcome(d, side, 'loss', t('battlesim209.note.ko'));
    }
  }
}

function _fireRocket() {
  const { _activeSide, _appendLog, _data, _foeNameSafe, _notReady, _recordOutcome, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.mode !== 'vehicle' || d.car.rockets <= 0) return;
  if (d.enemyCar.armour <= 0 || d.car.armour <= 0) return;
  d.car.rockets--;
  d.enemyCar.armour = 0;
  d.roundsVehicle++;
  _appendLog(d, t('battlesim209.log.rocket', { enemy: _foeNameSafe(d), n: d.car.rockets }));
  _recordOutcome(d, _activeSide(d), 'win', t('battlesim209.note.rocket'));
  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _activeSide, _appendLog, _data, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  const side = _activeSide(d);
  side.foe[side.foeHp] = side.foe[side.foeHpMax];
  side.self[side.selfHp] = side.self[side.selfHpMax];
  d[side.roundsKey] = 0;
  if (d.mode === 'hand') {
    d.playerHandLoss = 0;
    d.enemyHandLoss = 0;
  }
  if (d.log.length) _appendLog(d, t('battlesim209.log.reset_sep'));
  _appendLog(d, t('battlesim209.log.reset'));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _roll2d6, _roll1d6, _activeSide, _foeName, _foeNameSafe, _handOver, _runRound, _checkOutcome, _fireRocket, _resetBattle };
}
