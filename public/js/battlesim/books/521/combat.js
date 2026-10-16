// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function character(d) {
 return d.fight?.player ?? d.player; }

function saveAndRender() {
  const { renderSim521, saveState } = getContext();
 saveState(); renderSim521(); }

function number(key) {
  const { element } = getContext();
 return Number(element(key).value); }

function selectedEncounter() {
  const { MARSH_ENCOUNTERS, element } = getContext();

  return MARSH_ENCOUNTERS.find(e => String(e.section) === element('encounter').value) ?? {section: 'custom', custom: true};
}

function start() {
  const { character, createMarshFight, data, element, number, opponentSetup, saveAndRender, selectedEncounter, showAlert, tk } = getContext();

  const d = data();
  if (!d || d.fight?.pending) return;
  const e = selectedEncounter();
  const manualDamage = element('manual').value === '' ? undefined : number('manual');
  const raw = element('companions').value.trim();
  const damages = raw ? raw.split(',').map(value => value.trim()) : [];
  if (e.mode === 'ambush' && damages.some(value => !/^\d+$/.test(value))) {
    showAlert(tk('invalid_companions')); return;
  }
  try {
    const previous = d.fight;
    const fight = createMarshFight(e.section, character(d), {
      count: e.configurableCount ? number('count') : undefined,
      manualDamage,
      companions: e.mode === 'ambush' ? damages.map(value => ({ damage: Number(value) })) : [],
      cuttingWeapon: element('cutting').checked,
      poisonProtected: element('poison').checked,
      opponents: opponentSetup?.read(),
    });
    if (e.carryEnemyVitality && [342, 363].includes(previous?.encounter.section)) {
      fight.encounter.foes[0].vitality = previous.encounter.foes[0].vitality;
      fight.encounter.expertiseModifier = previous.encounter.expertiseModifier ?? 0;
    }
    if (e.section === 376 && fight.encounter.foes.length === 6 && previous?.encounter.section === 274) {
      fight.encounter.foes[0].vitality = previous.encounter.foes[0].vitality;
    }
    d.fight = fight;
    opponentSetup?.save(d);
    d.player = { ...fight.player };
    d.log.push(tk('started', { section: e.sourceSection ?? e.section }));
    d.log = d.log.slice(-150);
    saveAndRender();
  } catch { showAlert(tk(e.manualDamageRequired && manualDamage === undefined ? 'missing_damage' : 'invalid_values')); }
}

function finish() {
  const { data, tk } = getContext();

  const d = data();
  const fight = d?.fight;
  if (!fight || fight.status === 'fighting' || fight.recorded) return;
  fight.recorded = true;
  if (!['win', 'loss'].includes(fight.status)) return;
  const last = d.history.at(-1)?.ts ?? 0;
  d.history.push({ enemy: fight.encounter.custom ? fight.encounter.foes.map(enemy => enemy.name).join(' / ')
    : tk('encounter_label', { section: fight.encounter.sourceSection ?? fight.encounter.section,
      enemy: fight.encounter.foes[0].name }), outcome: fight.status, ts: Math.max(Date.now(), last + 1) });
}

function act(action) {
  const { data, element, escapeMarshCanoe, escapeMarshTree, finish, number, rollMarshRound, saveAndRender, settleMarshRound, tk } = getContext();

  const d = data();
  const fight = d?.fight;
  if (!fight || fight.status !== 'fighting') return;
  if (action === 'roll') {
    rollMarshRound(fight, number('target'));
  } else if (action === 'settle') {
    const result = settleMarshRound(fight, {
      attackBonus: element('bonus').checked, bonusHit: number('bonus-hit'),
      defensePoints: number('defense'), blockFlanks: element('flanks').checked,
    });
    if (!result) return;
    d.log.push(tk('round_result', { round: result.round, damage: result.playerLoss,
      vitality: fight.player.vitality, fortune: fight.player.fortune, result: tk(`status.${result.result}`) }));
    d.log = d.log.slice(-150);
  } else if (action === 'tree') escapeMarshTree(fight);
  else if (action === 'canoe') escapeMarshCanoe(fight);
  finish();
  saveAndRender();
}
// END EXTRACTED RULES
  return { character, saveAndRender, number, selectedEncounter, start, finish, act };
}
