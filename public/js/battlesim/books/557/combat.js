// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function update(d) {
  const { encounterLabel, renderSim557, saveState } = getContext();

  const f = d.fight;
  if (f && ['win', 'loss'].includes(f.status) && !f.recorded) {
    f.recorded = true;
    d.history.push({ enemy: encounterLabel(f.spec.section), outcome: f.status, ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
  }
  d.log = d.log.slice(-150); saveState(); renderSim557();
}

function start() {
  const { character, createKingsportFight, currentPlaythrough, data, el, showAlert, showConfirm, tk, update } = getContext();

  const d = data(), run = currentPlaythrough(); if (!d) return;
  const prior = d.fight, section = el('encounter').value;
  const apply = () => {
    if (data() !== d || currentPlaythrough() !== run || d.fight !== prior) return;
    try { d.fight = createKingsportFight(section, character(d)); update(d); }
    catch { showAlert(tk('invalid')); }
  };
  if (prior?.status === 'fighting') showConfirm(tk('replace_fight'), apply); else apply();
}
// END EXTRACTED RULES
  return { update, start };
}
