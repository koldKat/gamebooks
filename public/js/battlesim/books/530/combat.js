// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function label(id) {
  const { tk, data, t } = getContext();
  if (String(id) === '0' || String(id).startsWith('custom:')) return data()?.fight?.spec.name ?? t('battlesim.editor.custom');

  const enemy = tk(`enemy_names.${id}`);
  return String(id).startsWith('dream') ? tk('dream_label', { enemy, number: String(id).slice(5) })
    : tk('encounter_label', { enemy, section: id });
}

function record(d) {
  const { label, magic } = getContext();

  const f = d.fight;
  if (!f || f.recorded || !['win', 'loss', 'knockout'].includes(f.status)) return;
  if (f.status === 'loss' && f.player.life === 0 && f.player.resurrectionCharged
    && f.player.magic.resurrectionWand > 0 && !f.resurrectionDeclined) return;
  f.recorded = true;
  d.history.push({ enemy: f.spec.custom ? f.spec.name : label(f.spec.id), outcome: f.status === 'win' ? 'win' : 'loss',
    ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
}

function update(d) {
  const { action, record, renderSim530, saveState, tk } = getContext();

  const f = d.fight;
  for (const event of f?.events.slice(d.loggedEvents ?? 0) ?? []) {
    d.log.push(tk('event_result', { action: tk(`event_${event.kind}`),
      roll: event.roll ?? '-', damage: event.damage ?? 0,
      result: typeof event.success === 'boolean' ? tk(event.success ? 'success' : 'failed') : '' }));
  }
  d.loggedEvents = f?.events.length ?? 0;
  record(d);
  d.log = d.log.slice(-150);
  saveState(); renderSim530();
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

function replace(d, result) {
  const { record, tk } = getContext();

  if (!result) return;
  record(d);
  d.player = result.player;
  d.fight = result.fight ?? null;
  d.dream = result;
  d.loggedEvents = 0;
  d.log.push(tk('dream_result', { number: result.number ?? '-', outcome: tk(result.status) }));
}
// END EXTRACTED RULES
  return { label, record, update, action, confirm, replace };
}
