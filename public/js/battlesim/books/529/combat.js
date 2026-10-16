// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function label(section) {
  const { tk, data, t } = getContext();
  if (String(section) === '0' || String(section).startsWith('custom:')) return data()?.fight?.spec.name ?? t('battlesim.editor.custom');

  const key = String(section), enemy = tk(`enemy_names.${key}`);
  if (key.startsWith('dream')) return tk('dream_label', { enemy, number: key.slice(5) });
  if (key.startsWith('navigation')) return tk('navigation_label', { enemy, number: key.slice(10) });
  return tk('encounter_label', { enemy, section });
}

function record(d) {
  const { label } = getContext();

  const f = d.fight;
  if (!f || f.recorded || !['win', 'loss'].includes(f.status)
    || f.status === 'win' && f.spec.escapeRoll && !f.escapeChecked) return;
  f.recorded = true;
  d.history.push({ enemy: f.spec.custom ? f.spec.name : label(f.spec.section), outcome: f.status,
    ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
}

function logEvents(d) {
  const { action, tk } = getContext();

  for (const e of d.fight?.events ?? []) {
    if (['player', 'enemy', 'ally'].includes(e.kind)) d.log.push(tk('strike_result', {
      who: e.kind === 'player' ? tk('player') : e.name,
      target: e.kind === 'player' ? e.name : e.target ?? tk('player'), roll: e.roll, damage: e.damage }));
    else if (e.kind === 'armour') d.log.push(tk('armour_result', e));
    else if (e.kind === 'roof') d.log.push(tk('roof_result', e));
    else if (e.kind === 'poison') d.log.push(tk('poison_result', e));
    else if (e.kind === 'resurrection') d.log.push(tk('resurrection'));
    else d.log.push(tk('event_result', { action: tk(['light', 'shadow', 'leave', 'weakening'].includes(e.kind)
      ? e.kind + '_action' : e.kind === 'crystalBlade' ? 'crystalBlade_event' : e.kind),
      roll: e.roll ?? '-', result: tk(e.success === false ? 'failed' : 'success') }));
  }
}

function update(d) {
  const { record, renderSim529, saveState } = getContext();

  record(d); d.log = d.log.slice(-150); saveState(); renderSim529();
}

function action(apply) {
  const { data, showAlert, tk, update } = getContext();

  const d = data(); if (!d) return;
  try { apply(d); update(d); } catch { showAlert(tk('invalid')); }
}

function confirm(message, apply) {
  const { action, currentPlaythrough, data, showConfirm } = getContext();

  const d = data(), run = currentPlaythrough(), prior = d?.fight;
  if (!d) return;
  showConfirm(message, () => {
    if (data() !== d || currentPlaythrough() !== run || d.fight !== prior) return;
    action(apply);
  });
}

function replaceResult(d, result, message) {
  const { record, tk } = getContext();

  if (!result) return;
  record(d); d.player = result.player; d.fight = result.fight ?? null;
  d.dreamAgain = result.status === 'dream-again'; d.limerick = result.status === 'limerick';
  d.returnSection = result.section ?? d.returnSection;
  d.log.push(tk(message, { ...result, outcome: tk(result.status) }));
}
// END EXTRACTED RULES
  return { label, record, logEvents, update, action, confirm, replaceResult };
}
