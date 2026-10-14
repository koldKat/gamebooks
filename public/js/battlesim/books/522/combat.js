// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function character(d) {
 return d.fight?.player ?? d.player; }

function saveAndRender() {
  const { renderSim522, saveState } = getContext();
 saveState(); renderSim522(); }





function selectedEncounter() {
  const { PYRAMID_ENCOUNTERS, element } = getContext();
 return PYRAMID_ENCOUNTERS.find(e => String(e.section) === element('encounter').value); }

function label(e) {
  const { tk } = getContext();

  const enemy = tk(`enemy.${e.mode === 'scorpion' ? 'Scorpion' : e.foes[0].name.split(' ')[0]}`);
  const base = tk('encounter_label', { section: e.sourceSection ?? e.section, enemy });
  return typeof e.section === 'string' ? `${base} (${tk(e.section.split('-')[1])})` : base;
}

function configure() {
  const { element, selectedEncounter, tk } = getContext();

  const e = selectedEncounter();
  element('opening-wrap').hidden = !e.openingHit;
  element('cutting-wrap').hidden = e.mode !== 'tendrils';
  element('source-note').textContent = tk(e.carryTroll ? 'carry_troll' : e.mode === 'tendrils' ? 'tendrils_note' : 'rewards_note');
}

function record() {
  const { data, label } = getContext();

  const d = data(); const f = d?.fight;
  if (!f || f.status === 'fighting' || f.recorded) return;
  f.recorded = true;
  if (['win', 'loss'].includes(f.status)) d.history.push({ enemy: label(f.encounter), outcome: f.status,
    ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
}

function start() {
  const { character, createPyramidFight, data, element, record, saveAndRender, selectedEncounter, showAlert, tk } = getContext();

  const d = data(); if (!d || d.fight?.pending) return;
  const e = selectedEncounter();
  try {
    if (d.fight?.encounter.rabies && d.fight.status === 'win' && d.fight.bites && !d.fight.rabiesTreated) {
      showAlert(tk('treat_first')); return;
    }
    d.poisoned ||= Boolean(d.fight?.poisoned && !d.fight.poisonCured);
    if (e.carryTroll) {
      if (d.fight?.encounter.mode !== 'troll' || d.fight.status !== 'fighting') {
        showAlert(tk('carry_required')); return;
      }
      d.fight.encounter.stunning = true;
    } else {
      d.fight = createPyramidFight(e.section, character(d), {
        openingBonus: element('opening').checked, cuttingWeapon: element('cutting').checked,
      });
    }
    d.player = { ...d.fight.player };
    d.log.push(tk('started', { section: e.sourceSection ?? e.section })); d.log = d.log.slice(-150);
    record(); saveAndRender();
  } catch { showAlert(tk('invalid_values')); }
}

function act(action) {
  const { data, element, escapePyramidFight, number, record, rollPyramidRound, saveAndRender, settlePyramidRound, showAlert, tk } = getContext();

  const d = data(); const f = d?.fight; if (!f || f.status !== 'fighting') return;
  if (action === 'roll') rollPyramidRound(f, number('target'));
  else if (action === 'settle') {
    try {
      const r = settlePyramidRound(f, { attackBonus: element('bonus').checked,
        bonusHit: number('bonus-hit'), defensePoints: number('defense') });
      if (!r) return;
      d.log.push(tk('round_result', { round: r.round, damage: r.playerLoss, vitality: f.player.vitality,
        fortune: f.player.fortune, result: tk(`status.${r.result}`) })); d.log = d.log.slice(-150);
    } catch { showAlert(tk('invalid_values')); return; }
  } else if (action === 'escape') escapePyramidFight(f);
  d.poisoned ||= Boolean(f.poisoned && !f.poisonCured);
  record(); saveAndRender();
}
// END EXTRACTED RULES
  return { character, saveAndRender, selectedEncounter, label, configure, record, start, act };
}
