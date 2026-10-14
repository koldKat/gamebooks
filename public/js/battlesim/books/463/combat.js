// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _log(d, line) {
 d.log.push(line); if (d.log.length > 300) d.log.shift(); }

function _startFight(d) {
  const { _enemyName, _half, _log, _tableRoll, escapeHtml, tk } = getContext();

  const pr = _tableRoll(), er = _tableRoll();
  d.fight = {
    ready: true,
    pStr: d.player.sila + _half(pr),
    eStr: d.enemy.sila + _half(er),
    recorded: false,
    rulesVersion: 1,
  };
  d.enemy.curEnergy = d.enemy.energy;
  _log(d, tk('log.fight_start', {
    pbase: d.player.sila, proll: pr, phalf: _half(pr), pstr: d.fight.pStr,
    name: escapeHtml(_enemyName(d)), ebase: d.enemy.sila, eroll: er, ehalf: _half(er), estr: d.fight.eStr,
  }));
}

function _record(d, outcome) {
  const { _enemyName } = getContext();
 d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() }); }

function _blow(d) {
  const { SVG_SKULL, SVG_TROPHY, _enemyName, _fighting, _half, _log, _record, _tableRoll, escapeHtml, tk } = getContext();

  if (!_fighting(d)) return;
  const pr = _tableRoll(), er = _tableRoll();
  const pb = d.fight.pStr + _half(pr), eb = d.fight.eStr + _half(er);
  const diff = pb - eb;
  let line;
  if (Math.abs(diff) <= 1) {
    d.player.energy = Math.max(0, d.player.energy - 1);
    d.enemy.curEnergy = Math.max(0, d.enemy.curEnergy - 1);
    line = tk('log.blow_even', { proll: pr, pb, eroll: er, eb, pe: d.player.energy, ee: d.enemy.curEnergy });
  } else if (diff >= 2) {
    d.enemy.curEnergy = Math.max(0, d.enemy.curEnergy - 3);
    line = tk('log.blow_hit', { proll: pr, pb, eroll: er, eb, name: escapeHtml(_enemyName(d)), ee: d.enemy.curEnergy });
  } else {
    d.player.energy = Math.max(0, d.player.energy - 3);
    line = tk('log.blow_taken', { proll: pr, pb, eroll: er, eb, pe: d.player.energy });
  }
  _log(d, line);
  if (d.player.energy <= 0 && d.fight.rulesVersion >= 1) { _log(d, `${SVG_SKULL} ${tk('log.loss')}`); if (!d.fight.recorded) { _record(d, 'loss'); d.fight.recorded = true; } }
  else if (d.enemy.curEnergy <= 0) { _log(d, `${SVG_TROPHY} ${tk('log.win')}`); if (!d.fight.recorded) { _record(d, 'win'); d.fight.recorded = true; } }
  else if (d.player.energy <= 0) { _log(d, `${SVG_SKULL} ${tk('log.loss')}`); if (!d.fight.recorded) { _record(d, 'loss'); d.fight.recorded = true; } }
}

function _runBlow() {
  const { _blow, _data, _renderAll, saveState } = getContext();
 const d = _data(); if (!d) return; _blow(d); saveState(); _renderAll(); }

function _runToEnd() {
  const { _blow, _data, _fighting, _renderAll, saveState } = getContext();

  const d = _data(); if (!d || !_fighting(d)) return;
  let guard = 0; while (_fighting(d) && guard++ < 1000) _blow(d);
  saveState(); _renderAll();
}

function _newFight() {
  const { _data, _log, _renderAll, _startFight, saveState, showAlert, tk } = getContext();

  const d = _data(); if (!d || !d.enemy.hasStats) { showAlert(tk('status.pick')); return; }
  if (d.log.length) _log(d, tk('log.sep'));
  _startFight(d); saveState(); _renderAll();
}

function _applyEnemy(d, enemy) {
  const { _startFight } = getContext();

  d.enemy = {
    name: enemy.name,
    sila: enemy.attack || 0,
    energy: enemy.hp || 0,
    curEnergy: enemy.hp || 0,
    hasStats: enemy.attack != null && enemy.hp != null,
  };
  if (d.enemy.hasStats) _startFight(d);
}


// END EXTRACTED RULES
  return { _log, _startFight, _record, _blow, _runBlow, _runToEnd, _newFight, _applyEnemy };
}
