// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function append(d, value) {
  const { result, tk } = getContext();

  let message;
  if (typeof value !== 'object') message = tk(value ? 'success' : 'failure');
  else if (value.kind === 'attack') {
    message = tk('attack_log', { ...value, side: tk(value.side === 'player' ? 'player' : 'enemy') });
    if (value.footing !== undefined) message += ' ' + tk('footing_log', { roll: value.footing });
  } else if (value.kind === 'spell') message = tk('spell_log', { ...value, spell: tk('spell.' + value.spell), result: tk(value.success ? 'success' : 'failure') });
  else if (value.kind === 'initiative') message = tk('status.' + (value.first ?? 'initiative'));
  else if (['death-luck', 'serpent'].includes(value.kind)) message = tk('check_log', { ...value, result: tk(value.success ? 'success' : 'failure') });
  else if (['manual-damage', 'poison'].includes(value.kind)) message = tk('manual_log', value);
  else message = tk(value.kind ?? 'success');
  d.log.push(message); d.log = d.log.slice(-150);
}

function store(d) {
  const { ANCIENT_EVIL_ROSTER, renderSim537, saveState, tk } = getContext();

  const fight = d.fight;
  if (fight && !fight.recorded && ['win', 'loss'].includes(fight.outcome)) {
    fight.recorded = true;
    d.history.push({ enemy: `${fight.encounter.enemies.map(key => ANCIENT_EVIL_ROSTER[key].name).join(', ')} (${tk('section', { section: fight.encounter.section })})`, outcome: fight.outcome,
      ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
  }
  saveState(); renderSim537();
}

function result(d, value) {
  const { append, showAlert, store, tk } = getContext();

  if (value == null) return;
  if (value.error) showAlert(tk('error', { reason: value.error.replaceAll('-', ' ') }));
  else append(d, value);
  store(d);
}

function start() {
  const { active, character, createAncientEvilFight, data, el, number, prepareAncientEvilEncounter, showAlert, store, tk } = getContext();

  const d = data(); if (!d || active(d) || character(d).lifePoints <= 0) return;
  try {
    d.fight = createAncientEvilFight(prepareAncientEvilEncounter(el('encounter').value, character(d), {
      playerWeapon: number('weapon_bonus'), staffWeapon: number('staff_bonus'),
    }));
    store(d);
  } catch { showAlert(tk('invalid')); }
}

function act(action) {
  const { applyAncientEvilDamage, checkAncientEvilSerpent, data, determineAncientEvilInitiative, el, endAncientEvilGroupRound, finishAncientEvilFight, number, resolveAncientEvilDeathLuck, result, rollAncientEvilAttack } = getContext();

  const d = data(), fight = d?.fight; if (!fight || fight.outcome) return;
  let value;
  if (action === 'death_luck') value = resolveAncientEvilDeathLuck(fight);
  else if (fight.pending) return;
  else if (action === 'initiative') value = determineAncientEvilInitiative(fight);
  else if (action === 'player_attack' || action === 'enemy_attack') value = rollAncientEvilAttack(fight, action === 'player_attack' ? 'player' : 'enemy', Number(el('target').value));
  else if (action === 'end_round') value = endAncientEvilGroupRound(fight);
  else if (action === 'serpent') value = checkAncientEvilSerpent(fight);
  else if (action === 'apply_damage') value = applyAncientEvilDamage(fight, number('manual_damage'));
  else if (action === 'reconsider') value = finishAncientEvilFight(fight, 'reconsider');
  result(d, value);
}
// END EXTRACTED RULES
  return { append, store, result, start, act };
}
