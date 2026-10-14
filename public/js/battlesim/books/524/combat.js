// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function character(d) {
 return d.fight?.player ?? d.player; }

function saveAndRender() {
  const { renderSim524, saveState } = getContext();
 saveState(); renderSim524(); }





function selectedEncounter() {
  const { GARDEN_ENCOUNTERS, element } = getContext();
 return GARDEN_ENCOUNTERS.find(e => String(e.section) === element('encounter').value); }

function label(e) {
  const { tk } = getContext();
 return tk('encounter_label', { section: e.section, enemy: tk(`enemy.${e.foes[0].name.split(' ')[0]}`) }); }

function configure() {
  const { element, selectedEncounter, tk } = getContext();

  const e = selectedEncounter();
  element('daggerTaken-wrap').hidden = e.mode !== 'reinforcement';
  element('companions-wrap').hidden = Number(e.section) !== 384;
  element('surprise-wrap').hidden = ![8, 10, 15, 191].includes(Number(e.section));
  element('source-note').textContent = tk('rewards_note');
}

function record() {
  const { data, label } = getContext();

  const d = data(); const f = d?.fight;
  if (f) d.diseased = f.diseased;
  if (!f || f.status === 'fighting' || f.recorded) return;
  f.recorded = true;
  if (['win', 'loss'].includes(f.status)) d.history.push({ enemy: label(f.encounter), outcome: f.status,
    ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
}

function start() {
  const { character, createGardenFight, data, element, number, options, record, saveAndRender, selectedEncounter, showAlert, tk } = getContext();

  const d = data(); if (!d || d.fight?.pending) return;
  try {
    d.fight = createGardenFight(selectedEncounter().section, character(d), { ...Object.fromEntries(options.map(key => [key, element(key).checked])), surprise: element('surprise').value, companions: number('companions'), previous: d.fight });
    d.player = { ...d.fight.player };
    d.log.push(tk('started', { section: d.fight.encounter.section })); d.log = d.log.slice(-150);
    record(); saveAndRender();
  } catch { showAlert(tk('invalid_values')); }
}

function act(action) {
  const { data, element, escapeGardenFight, number, record, rollGardenRound, saveAndRender, settleGardenRound, showAlert, takeGardenHalberd, tk } = getContext();

  const d = data(); const f = d?.fight; if (!f || f.status !== 'fighting') return;
  try {
    if (action === 'roll') rollGardenRound(f, number('target'));
    else if (action === 'settle') {
      const r = settleGardenRound(f, { attackBonus: element('bonus').checked,
        bonusHit: number('bonus-hit'), defensePoints: number('defense'), preventSpecial: element('special').checked });
      if (!r) return;
      d.log.push(tk('round_result', { round: r.round, damage: r.playerLoss, vitality: f.player.vitality,
        fortune: f.player.fortune, result: tk(`status.${r.result}`) })); d.log = d.log.slice(-150);
    } else if (action === 'halberd') takeGardenHalberd(f);
    else escapeGardenFight(f);
    record(); saveAndRender();
  } catch { showAlert(tk('invalid_values')); }
}
// END EXTRACTED RULES
  return { character, saveAndRender, selectedEncounter, label, configure, record, start, act };
}
