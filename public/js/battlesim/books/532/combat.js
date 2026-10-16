// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function label(id) {
  const { tk, data, t } = getContext();
  if (String(id) === '0' || String(id).startsWith('custom:')) return data()?.fight?.spec.name ?? t('battlesim.editor.custom');

  const enemy = tk(`enemy_names.${id}`);
  return String(id).startsWith('dream') ? tk('dream_label', { enemy, number: String(id).slice(5) })
    : tk('encounter_label', { enemy, section: id === '204-grott' ? 204 : id });
}

function record(d) {
  const { label } = getContext();

  const f = d.fight;
  if (!f || f.recorded || !['win', 'loss'].includes(f.status)) return;
  f.recorded = true;
  d.history.push({ enemy: f.spec.custom ? f.spec.name : label(f.spec.id), outcome: f.status,
    ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
}

function log(d, result, kind) {
  const { action, spells, tk } = getContext();

  if (!result) return;
  for (const event of Array.isArray(result) ? result : [result]) {
    const outcome = event.fatal ? tk('fatal') : event.skipped ? tk('skipped')
      : typeof event.success === 'boolean' ? tk(event.success ? 'success' : 'failed') : '';
    const label = kind ?? (event.kind ? spells.includes(event.kind) ? event.kind : 'event_' + event.kind : event.spell ?? 'cast');
    d.log.push(tk('result', { action: tk(label),
      roll: event.roll ?? '-', damage: event.damage ?? event.loss ?? 0, outcome }));
  }
}

function action(apply) {
  const { data, log, record, renderSim532, saveState, showAlert, tk } = getContext();

  const d = data(); if (!d) return;
  try {
    apply(d); record(d);
    d.log = d.log.slice(-150);
    if (d.fight) { d.fight.logs = d.fight.logs.slice(-150); d.fight.actions = d.fight.actions.slice(-150); }
    saveState(); renderSim532();
  } catch { showAlert(tk('invalid')); renderSim532(); }
}

function confirm(message, apply) {
  const { action, currentPlaythrough, data, showConfirm } = getContext();

  const d = data(), run = currentPlaythrough(), previous = d?.fight;
  if (!d) return;
  showConfirm(message, () => {
    if (data() === d && currentPlaythrough() === run && d.fight === previous) action(apply);
  });
}

function start(d, id, options = {}) {
  const { character, customSetup, record, rules } = getContext();

  const next = rules.startTombFight(character(d), id, customSetup?.settings(d, options, id) ?? options);
  record(d); d.fight = next;
}

function dream(d, number) {
  const { character, log, rules, start, tk } = getContext();

  const result = rules.tombDream(character(d), number); if (!result) return;
  d.dream = result; d.sleepDream = false;
  d.log.push(tk('dream_result', { number, outcome: tk(result.dead ? 'dream_dead'
    : result.retry || result.redream ? 'dream_retry' : result.encounter ? 'dream_fight' : 'dream_done') }));
  if (result.encounter) start(d, result.encounter);
}
// END EXTRACTED RULES
  return { label, record, log, action, confirm, start, dream };
}
