// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function label(id) {
  const { LEGION_DREAMS, LEGION_ENCOUNTERS, tk, data, t } = getContext();
  if (String(id) === '0' || String(id).startsWith('custom:')) return data()?.fight?.spec.name ?? t('battlesim.editor.custom');

  const spec = [...LEGION_ENCOUNTERS,...LEGION_DREAMS].find(row => row.id === id);
  const enemy = tk('enemy_names.'+id);
  return id === 'dream7' ? tk('dream_label',{enemy,number:7})
    : tk('encounter_label',{enemy,section:spec?.section ?? id});
}

function record(d) {
  const { label } = getContext();

  const f = d.fight;
  if (!f || f.recorded || !['win','loss'].includes(f.status)) return;
  f.recorded = true;
  d.history.push({enemy:f.spec.custom?f.spec.name:label(f.spec.id),outcome:f.status,
    ts:Math.max(Date.now(),(d.history.at(-1)?.ts ?? 0)+1)});
}

function report(d, result, key) {
  const { action, tk } = getContext();

  if (!result) return;
  const rows = result.events ?? [result];
  for (const event of rows) {
    d.log.push(tk('result',{action:tk(result.events ? event.kind : key ?? event.kind ?? event.spell ?? 'action'),
      roll:event.roll ?? '-',damage:event.damage ?? event.loss ?? 0,
      outcome:event.fatal || event.dead ? tk('fatal') : event.manual ? tk('manual_result')
        : typeof event.success === 'boolean' ? tk(event.success ? 'success':'failed') : ''}));
  }
  if (result.healing !== undefined) d.log.push(tk('healing_result',{amount:result.healing}));
}

function action(apply) {
  const { data, record, renderSim533, saveState, showAlert, tk } = getContext();

  const d = data(); if (!d) return;
  try {
    apply(d); record(d); d.log = d.log.slice(-150);
    saveState(); renderSim533();
  } catch { showAlert(tk('invalid')); renderSim533(); }
}

function confirm(message, apply) {
  const { action, currentPlaythrough, data, showConfirm } = getContext();

  const d = data(), run = currentPlaythrough(), previous = d?.fight;
  if (!d) return;
  showConfirm(message,() => {
    if (data() === d && currentPlaythrough() === run && d.fight === previous) action(apply);
  });
}

function start(d,id,options={}) {
  const { customSetup, p, record, rules } = getContext();

  const next = rules.startLegionFight(p(d),id,customSetup?.settings(d,options,id)??options);
  record(d); d.fight = next; d.pendingDream = null;
}

function dream(d,number) {
  const { p, report, rules, start } = getContext();

  const result = rules.legionDream(p(d),number); if (!result) return;
  report(d,result,'dream'); d.pendingDream = result.retry ? 0 : null;
  if (result.encounter) start(d,result.encounter);
}
// END EXTRACTED RULES
  return { label, record, report, action, confirm, start, dream };
}
