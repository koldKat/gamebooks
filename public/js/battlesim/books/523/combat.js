// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function character(d) {
 return d.fight?.player ?? d.player; }

function saveAndRender() {
  const { renderSim523, saveState } = getContext();
 saveState(); renderSim523(); }

function selectedEncounter() {
  const { MINE_ENCOUNTERS, element } = getContext();
 return MINE_ENCOUNTERS.find(e => String(e.section) === element('encounter').value) ?? {section: 'custom', custom: true}; }

function label(e) {
  const { tk } = getContext();
  if (e.custom) return e.foes.map(enemy => enemy.name).join(' / ');
 return tk('encounter_label', { section: e.section, enemy: e.customNames ? e.foes.map(enemy => enemy.name).join(' / ')
   : tk(`enemy.${e.foes[0].name.split(' ')[0]}`) }); }

function configure() {
  const { element, selectedEncounter, tk } = getContext();

  const e = selectedEncounter();
  for (const [key, visible] of [['underclothes', e.clothing], ['failedLanding', e.landing], ['ambush', e.ambush], ['fedusar', e.mode === 'vretch']]) {
    element(`${key}-wrap`).hidden = !visible;
  }
  element('source-note').textContent = tk(e.mode === 'immune' ? 'immune_note' : 'rewards_note');
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
  const { character, createMineFight, data, element, opponentSetup, options, record, saveAndRender, selectedEncounter, showAlert, tk } = getContext();

  const d = data(); if (!d || d.fight?.pending) return;
  try {
    d.fight = createMineFight(selectedEncounter().section, character(d), {...Object.fromEntries(options.map(key => [key, element(key).checked])), opponents: opponentSetup?.read()});
    opponentSetup?.save(d);
    d.player = { ...d.fight.player };
    d.log.push(tk('started', { section: d.fight.encounter.section })); d.log = d.log.slice(-150);
    record(); saveAndRender();
  } catch { showAlert(tk('invalid_values')); }
}

function act(action) {
  const { data, element, escapeMineFight, number, record, rollMineRound, saveAndRender, settleMineRound, showAlert, tk } = getContext();

  const d = data(); const f = d?.fight; if (!f || f.status !== 'fighting') return;
  try {
    if (action === 'roll') rollMineRound(f, number('target'));
    else if (action === 'settle') {
      const r = settleMineRound(f, { attackBonus: element('bonus').checked,
        bonusHit: number('bonus-hit'), defensePoints: number('defense') });
      if (!r) return;
      d.log.push(tk('round_result', { round: r.round, damage: r.playerLoss, vitality: f.player.vitality,
        fortune: f.player.fortune, result: tk(`status.${r.result}`) })); d.log = d.log.slice(-150);
    } else escapeMineFight(f, action === 'reverse');
    record(); saveAndRender();
  } catch { showAlert(tk('invalid_values')); }
}
// END EXTRACTED RULES
  return { character, saveAndRender, selectedEncounter, label, configure, record, start, act };
}
