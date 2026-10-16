// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES

function log(d, text) {
 d.log.push(text); d.log = d.log.slice(-150); }

function record(d) {
  const { label } = getContext();

  const f = d.fight;
  if (!f || f.recorded || !['win', 'loss'].includes(f.status)) return;
  f.recorded = true;
  d.history.push({ enemy: label(f.encounter), outcome: f.status, ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
}

function update(d) {
  const { record, renderSim548, saveState } = getContext();
 record(d); saveState(); renderSim548(); }

function start() {
  const { customSetup, character, createInnsmouthFight, currentPlaythrough, data, el, log, showAlert, showConfirm, tk, update } = getContext();

  const d = data(); if (!d) return;
  const run = currentPlaythrough(), section = el('encounter').value, prior = d.fight;
  const apply = () => {
    if (data() !== d || currentPlaythrough() !== run || d.fight !== prior) return;
    try { d.fight = createInnsmouthFight(section, character(d), customSetup?.settings(d)); log(d, section === '0' ? d.fight.enemies.map(e => e.displayName).join(' / ') : tk('started', { section })); update(d); }
    catch { showAlert(tk('invalid')); }
  };
  if (d.fight?.status === 'fighting') showConfirm(tk('replace_fight'), apply);
  else apply();
}

function action(kind) {
  const { attackInnsmouth, data, el, enemyName, log, openingInnsmouthShot, throwInnsmouthKnife, tk, update } = getContext();

  const d = data(), f = d?.fight; if (!f) return;
  const target = Number(el('target').value);
  let result;
  if (kind === 'attack' || kind === 'enemy_attack') result = attackInnsmouth(f, target);
  else if (kind === 'gun') result = attackInnsmouth(f, target, true);
  else if (kind === 'opening') result = openingInnsmouthShot(f, true);
  else if (kind === 'skip') result = openingInnsmouthShot(f, false);
  else if (kind === 'knife') result = throwInnsmouthKnife(f, target);
  if (!result) return;
  if (!result.skipped) log(d, tk('damage_result', { actor: result.actor >= 0 ? enemyName(f.enemies[result.actor]) : tk('you'), dice: result.rolls?.join(' + ') ?? result.roll, damage: result.damage }));
  update(d);
}
// END EXTRACTED RULES
  return { log, record, update, start, action };
}
