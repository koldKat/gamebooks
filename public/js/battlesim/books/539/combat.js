// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function log(d, text) {
 d.log.push(text); d.log = d.log.slice(-150); }

function record(d) {
  const { label } = getContext();

  const fight = d.fight;
  if (!fight || fight.recorded || !['win','loss'].includes(fight.status)) return;
  fight.recorded = true;
  d.history.push({ enemy:label(fight.spec),outcome:fight.status,
    ts:Math.max(Date.now(),(d.history.at(-1)?.ts ?? 0)+1) });
}

function report(d,result) {
  const { log, tk } = getContext();

  if (!result) return;
  const dice = result.streams ? result.streams.map(stream => stream.rolls.join('+')).join(' / ')
    : (result.rolls ?? []).join(' + ');
  log(d,tk('result',{ dice:dice || '-',stamina:result.damage?.stamina ?? 0,
    endurance:result.damage?.endurance ?? 0,
    outcome:typeof result.success === 'boolean' ? tk(result.success ? 'success':'failure') : '' }));
  if (result.destination) log(d,tk('destination',{section:result.destination}));
}

function action(apply) {
  const { data, record, renderSim539, saveState, showAlert, tk } = getContext();

  const d = data(); if (!d) return;
  try { apply(d); record(d); saveState(); renderSim539(); }
  catch { showAlert(tk('invalid')); renderSim539(); }
}

function confirm(message,apply) {
  const { action, currentPlaythrough, data, showConfirm } = getContext();

  const d=data(),run=currentPlaythrough(),previous=d?.fight; if (!d) return;
  showConfirm(message,() => {
    if (data()===d && currentPlaythrough()===run && d.fight===previous) action(apply);
  });
}
// END EXTRACTED RULES
  return { log, record, report, action, confirm };
}
