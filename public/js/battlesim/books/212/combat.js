// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _roll2d6() {
 return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }

function _roll1d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _activeSide(d) {

  return d.mode === 'crew'
    ? { self: d.crew, foe: d.enemyCrew, selfAtk: 'strike', selfHp: 'strength', selfHpMax: 'strengthInitial', foeAtk: 'strike', foeHp: 'strength', foeHpMax: 'strengthMax', roundsKey: 'roundsCrew', label: 'STRENGTH' }
    : { self: d.player, foe: d.enemyPerson, selfAtk: 'skill', selfHp: 'stamina', selfHpMax: 'staminaInitial', foeAtk: 'skill', foeHp: 'stamina', foeHpMax: 'staminaMax', roundsKey: 'roundsPerson', label: 'STAMINA' };
}

function _selfMaxHp(d, side) {

  return d.mode === 'crew' ? d.crew.strengthInitial : d.player.staminaInitial;
}

function _foeName(d) {
  const { _activeSide, t } = getContext();

  const side = _activeSide(d);
  return side.foe.name.trim() || t('battlesim.default_enemy');
}

function _foeNameSafe(d) {
  const { _foeName, escapeHtml } = getContext();
 return escapeHtml(_foeName(d)); }

function _runRound() {
  const { _activeSide, _appendLog, _checkOutcome, _data, _foeNameSafe, _notReady, _renderAll, _roll1d6, _roll2d6, _selfMaxHp, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d)) return;
  const side = _activeSide(d);
  if (side.self[side.selfHp] <= 0 || side.foe[side.foeHp] <= 0) return;
  d[side.roundsKey]++;

  const selfAS = _roll2d6() + side.self[side.selfAtk];
  const foeAS  = _roll2d6() + side.foe[side.foeAtk];
  _appendLog(d, t('battlesim212.log.round', { round: d[side.roundsKey], selfAS, enemy: _foeNameSafe(d), enemyAS: foeAS }));

  if (selfAS === foeAS) {
    _appendLog(d, t('battlesim212.log.both_avoided'));
  } else if (selfAS > foeAS) {
    if (d.mode === 'person' && d.player.hasStaff && _roll1d6() <= 2) {
      side.foe.skill = Math.max(0, side.foe.skill - 1);
      _appendLog(d, t('battlesim212.log.staff_strike', { enemy: _foeNameSafe(d), skill: side.foe.skill }));
    } else {
      side.foe[side.foeHp] = Math.max(0, side.foe[side.foeHp] - 2);
      _appendLog(d, t('battlesim212.log.you_wound', { enemy: _foeNameSafe(d), label: side.label, hp: side.foe[side.foeHp], hpMax: side.foe[side.foeHpMax] }));
    }
  } else {
    side.self[side.selfHp] = Math.max(0, side.self[side.selfHp] - 2);
    _appendLog(d, t('battlesim212.log.enemy_wounds', { enemy: _foeNameSafe(d), label: side.label, hp: side.self[side.selfHp], hpMax: _selfMaxHp(d, side) }));
  }

  _checkOutcome(d, side);
  saveState();
  _renderAll();
}

function _checkOutcome(d, side) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _foeNameSafe, _recordOutcome, t } = getContext();

  if (side.foe[side.foeHp] <= 0) {
    _appendLog(d, t('battlesim212.log.defeated', { trophy: SVG_TROPHY, enemy: _foeNameSafe(d) }));
    _recordOutcome(d, side, 'win');
  } else if (side.self[side.selfHp] <= 0) {
    _appendLog(d, d.mode === 'crew' ? t('battlesim212.log.dead_crew', { skull: SVG_SKULL }) : t('battlesim212.log.dead_person', { skull: SVG_SKULL }));
    _recordOutcome(d, side, 'loss');
  }
}

function _escape() {
  const { ESCAPE_CREW_COST, _appendLog, _data, _notReady, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.mode !== 'crew') return;
  if (d.crew.strength <= 0 || d.enemyCrew.strength <= 0) return;
  d.crew.strength = Math.max(0, d.crew.strength - ESCAPE_CREW_COST);
  _appendLog(d, t('battlesim212.log.escape', { cost: ESCAPE_CREW_COST, strength: d.crew.strength, strengthMax: d.crew.strengthInitial }));
  d.roundsCrew = 0;
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
  if (d.log.length) _appendLog(d, t('battlesim212.log.reset_sep'));
  _appendLog(d, t('battlesim212.log.reset'));
  saveState();
  _renderAll();
}


// END EXTRACTED RULES
  return { _roll2d6, _roll1d6, _activeSide, _selfMaxHp, _foeName, _foeNameSafe, _runRound, _checkOutcome, _escape, _resetBattle };
}
