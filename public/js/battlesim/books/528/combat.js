// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function label(section) {
  const { tk } = getContext();

  const enemy = tk(`enemy_names.${section}`), key = String(section);
  if (key.startsWith('level')) {
    const [level, roll] = key.slice(5).split('-');
    return tk('wandering_label', { enemy, level, roll });
  }
  return key.startsWith('dream') ? tk('dream_label', { enemy, number: key.slice(5) })
    : tk('encounter_label', { enemy, section });
}

function record(d, force = false) {
  const { label } = getContext();

  const f = d.fight;
  if (!f || !['win', 'loss'].includes(f.status) || f.recorded ||
    !force && f.status === 'loss' && f.player.life === 0 && f.player.resurrection && !f.spec.dream) return;
  f.recorded = true;
  d.history.push({ enemy: label(f.spec.section), outcome: f.status,
    ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
}

function update(d) {
  const { record, renderSim528, saveState } = getContext();

  record(d); d.log = d.log.slice(-150); saveState(); renderSim528();
}

function confirm(message, apply) {
  const { currentPlaythrough, data, showConfirm, update } = getContext();

  const d = data(), run = currentPlaythrough(), prior = d?.fight;
  if (!d) return;
  showConfirm(message, () => {
    if (data() !== d || currentPlaythrough() !== run || d.fight !== prior) return;
    apply(d); update(d);
  });
}

function start() {
  const { active, character, confirm, data, el, logEvents, options, record, rules, showAlert, tk, update } = getContext();

  const section = el('encounter').value;
  const selected = Object.fromEntries(options.map(key => [key, el(`option-${key}`).checked]));
  const apply = d => {
    try {
      const f = rules.createGatewayFight(section, character(d), selected);
      record(d, true); d.fight = f;
      logEvents(d, f.events);
    } catch { showAlert(tk('invalid')); }
  };
  const d = data(); if (!d) return;
  if (active(d)) confirm(tk('replace_fight'), apply);
  else { apply(d); update(d); }
}

function logEvents(d, events) {
  const { tk } = getContext();

  for (const event of events ?? []) {
    if (['player', 'enemy', 'carrot', 'wizard-bolt'].includes(event.kind)) {
      d.log.push(tk('hit_result', { who: event.kind === 'player' ? tk('player') : tk('enemy'),
        roll: event.roll ?? '-', damage: event.damage }));
    } else if (event.kind === 'baby-fireball') d.log.push(tk('baby_fireball', event));
    else if (event.kind.startsWith('skip')) d.log.push(tk('skip_result', { who: tk(event.kind === 'skip-player' ? 'player' : 'enemy') }));
    else if (event.kind === 'encumbered') d.log.push(tk('encumbered'));
    else if (event.kind === 'wizard-spell') d.log.push(tk('spell_result', { ...event, spell: tk(event.spell), result: tk(event.success ? 'success' : 'failed') }));
    else if (['web', 'water', 'bell'].includes(event.kind)) d.log.push(tk('opening_result', {
      kind: tk(event.kind), roll: event.roll ?? `${event.swim}, ${event.cold}` }));
  }
}

function dreamResult(d, result) {
  const { record, tk } = getContext();

  if (!result) return;
  record(d, true); d.player = result.player; d.fight = result.fight ?? null;
  d.dreamAgain = result.status === 'dream-again';
  d.limerick = result.status === 'limerick';
  d.log.push(result.number ? tk('dream_result', { number: result.number,
    outcome: tk(result.status === 'fight' ? 'fighting' : result.status === 'dream-again' ? 'dream_again' : result.status) })
    : tk('sleep_result', result));
}

function action(apply) {
  const { data, update } = getContext();

  const d = data(); if (!d) return;
  apply(d); update(d);
}
// END EXTRACTED RULES
  return { label, record, update, confirm, start, logEvents, dreamResult, action };
}
