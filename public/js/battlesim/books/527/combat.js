// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function label(section) {
  const { tk } = getContext();

  const enemy = tk(`enemy_names.${section}`);
  return String(section).startsWith('dream') ? tk('dream_label', { enemy, number: String(section).slice(5) })
    : tk('encounter_label', { enemy, section });
}

function update(d) {
  const { label, renderSim527, saveState } = getContext();

  const f = d.fight;
  if (f && f.status !== 'fighting' && !f.recorded) {
    f.recorded = true;
    d.history.push({ enemy: label(f.spec.section), outcome: f.status,
      ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
  }
  d.log = d.log.slice(-150);
  saveState(); renderSim527();
}

function guardedConfirm(message, apply) {
  const { currentPlaythrough, data, showConfirm, update } = getContext();

  const d = data(), run = currentPlaythrough(), prior = d?.fight;
  if (!d) return;
  showConfirm(message, () => {
    if (data() !== d || currentPlaythrough() !== run || d.fight !== prior) return;
    apply(d); update(d);
  });
}

function start() {
  const { active, character, createDenFight, data, el, guardedConfirm, showAlert, tk, update } = getContext();

  const section = Number(el('encounter').value);
  const apply = d => {
    try {
      d.fight = createDenFight(section, character(d));
      if (d.fight.spec.entryDamage) d.log.push(tk('entry_damage', { damage: d.fight.spec.entryDamage }));
      for (const event of d.fight.events) if (event.kind === 'evasion') d.log.push(tk('evasion_result', { roll: event.roll }));
    }
    catch { showAlert(tk('invalid')); }
  };
  const d = data(); if (!d) return;
  if (active(d)) guardedConfirm(tk('replace_fight'), apply);
  else { apply(d); update(d); }
}

function target() {
  const { el } = getContext();
 return Number(el('target').value); }

function sleep() {
  const { active, character, data, denDream, healDenPlayer, tk, update } = getContext();

  const d = data(); if (!d || active(d) || character(d).life <= 0) return;
  const roll = 1 + Math.floor(Math.random() * 6), p = character(d);
  if (roll >= 5) {
    const amount = 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6);
    const before = p.life; healDenPlayer(p, amount);
    d.log.push(tk('sleep_result', { roll, amount: p.life - before }));
  } else {
    const number = 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6);
    const result = denDream(p, number);
    d.player = result.player; d.fight = result.fight ?? null;
    const outcome = result.status === 'sleep-again' ? tk('sleep_again') : result.status === 'tie' ? tk('dream_tie') : tk(result.status);
    d.log.push(tk('dream_result', { number, outcome }));
  }
  update(d);
}
// END EXTRACTED RULES
  return { label, update, guardedConfirm, start, target, sleep };
}
