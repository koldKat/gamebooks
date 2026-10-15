// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _roll1d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _roll2d6() {
  const { _roll1d6 } = getContext();
 return _roll1d6() + _roll1d6(); }

function _roll3d6() {
  const { _roll1d6 } = getContext();
 return _roll1d6() + _roll1d6() + _roll1d6(); }

function _encounter(id) {
  const { ROSTER } = getContext();
 return ROSTER.find(e => e.id === id) || ROSTER[0]; }

function _fight() {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _data, _encounter, _recordOutcome, _renderAll, saveState, showAlert, t } = getContext();

  const d = _data();
  if (!d) return;
  const enc = _encounter(d.encounterId);
  if (d.player.zhivot < 3) { showAlert(t('battlesim877.log.dead')); return; }
  const before = { ...d.player };
  const res = enc.resolve(d.player, d);
  if (res.cost && res.cost.zhivot) d.player.zhivot = Math.max(0, d.player.zhivot - res.cost.zhivot);
  if (res.cost && res.cost.sila) d.player.sila = Math.max(0, d.player.sila - res.cost.sila);
  if (d.player.zhivot < 3) res.outcome = 'loss';
  if (res.pending) d.pendingDuel = { encounterId: d.encounterId, state: res.pending };
  else delete d.pendingDuel;

  _appendLog(d, t('battlesim877.log.header', { name: t(enc.nameKey) }));
  _appendLog(d, t(`battlesim877.log.${res.key}`, {
    sila: before.sila, zhivot: before.zhivot, esper: before.esper,
    lifeLost: (res.cost && res.cost.zhivot) || 0,
    rounds: res.rounds || 0,
    roll: res.roll || 0,
    section: res.section,
  }));
  if (res.outcome === 'pending' || res.outcome === 'manual') {
    saveState();
    _renderAll();
    return;
  }
  if (d.player.zhivot < 3) _appendLog(d, t('battlesim877.log.dead'));
  else if (res.outcome === 'win') _appendLog(d, t('battlesim877.log.win_footer', { trophy: SVG_TROPHY, section: res.section }));
  else if (res.outcome === 'loss') _appendLog(d, t('battlesim877.log.loss_footer', { skull: SVG_SKULL, section: res.section }));
  else _appendLog(d, t('battlesim877.log.draw_footer', { section: res.section }));

  _recordOutcome(d, res.outcome);
  saveState();
  _renderAll();
}

function _rollSila() {
  const { _appendLog, _data, _renderAll, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  if (d.pendingDuel) return;
  d.player.sila = _roll2d6() + 6;
  _appendLog(d, t('battlesim877.log.rolled_sila', { value: d.player.sila }));
  saveState();
  _renderAll();
}

function _rollZhivot() {
  const { _appendLog, _data, _renderAll, _roll1d6, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  if (d.pendingDuel) return;
  d.player.zhivot = _roll1d6() + 12;
  _appendLog(d, t('battlesim877.log.rolled_zhivot', { value: d.player.zhivot }));
  saveState();
  _renderAll();
}

function _rollEsper() {
  const { _appendLog, _data, _renderAll, _roll3d6, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  if (d.pendingDuel) return;
  d.player.esper = _roll3d6();
  _appendLog(d, t('battlesim877.log.rolled_esper', { value: d.player.esper }));
  saveState();
  _renderAll();
}

function _pickEncounter(id) {
  const { _data, _renderAll, saveState } = getContext();

  const d = _data();
  if (!d) return;
  if (d.pendingDuel) return;
  d.encounterId = id;
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _roll1d6, _roll2d6, _roll3d6, _encounter, _fight, _rollSila, _rollZhivot, _rollEsper, _pickEncounter };
}
