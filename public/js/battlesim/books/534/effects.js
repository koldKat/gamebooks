// Book-specific spells, items and recovery; UI and persistence callbacks are injected.
export function createEffects(getContext) {
// BEGIN EXTRACTED RULES
function cast() {
  const { append, castFireWolfSpell, checkFireWolfOutcome, createFireWolfEncounterDuel, createFireWolfManualGroup, currentPlaythrough, data, el, record, renderSim534, rollFireWolfCharacter, showAlert, store, tk } = getContext();

  const d = data(), f = d?.fight;
  if (!f || !d.magic) return;
  const spell = el('spell').value;
  if (f.pending && spell !== 'resurrection') return;
  if (f.manualGroup) f.enemy = f.enemies[Number(el('target').value)] ?? f.enemy;
  const result = castFireWolfSpell(d.magic, f.player, spell, { enemy: f.enemy,
    destination: el('destination').value.trim(), visited: currentPlaythrough()?.path ?? [], useLife: el('useLife').checked });
  if (result.error) { showAlert(tk('invalid')); renderSim534(); return; }
  append(d, tk('spell_log', { spell: tk(`spell.${spell}`), result: tk(result.success ? 'success' : 'failure'),
    cost: result.cost, life: result.lifeCost, destination: result.destination == null ? '' : tk('go_to', { section: result.destination }) }));
  if (result.success) {
    f.player.magicArmour = d.magic.armour;
    if (result.rerollCharacter) {
      Object.assign(f.player, rollFireWolfCharacter());
      f.pending = f.outcome = null; f.recorded = false; f.skillAwarded = false;
      f.turn = null; f.round = f.attacks = f.enemyTurns = f.rest = f.freePlayerAttacks = f.paralysedPlayerRounds = 0;
    } else if (spell === 'timewarp') {
      d.prepared.player = { ...f.player };
      d.prepared.enemies.forEach((enemy, index) => { enemy.lifePoints = d.magic.opening.enemyLives[index]; });
      d.opponent = 0;
      d.fight = d.prepared.encounter.manualGroup ? createFireWolfManualGroup(d.prepared) : createFireWolfEncounterDuel(d.prepared);
    } else if (result.destination != null || d.magic.invisible) f.outcome = 'warped';
    else if (result.avoidCombat) {
      if (f.manualGroup) f.enemy.paralysed = true;
      else f.outcome = 'avoided';
    }
  }
  checkFireWolfOutcome(d.fight); record(d); store();
}

function regentSpell() {
  const { active, append, castFireWolfRegentSpell, checkFireWolfOutcome, data, el, record, store, tk } = getContext();

  const d = data(), f = d?.fight;
  if (!f || !active(d) || f.pending || !f.options.regentSword || f.turn !== 'enemy') return;
  const spell = el('regent-spell').value, result = castFireWolfRegentSpell(f.enemy, spell);
  if (result.error) return;
  let effect = tk(result.success ? 'success' : 'failure');
  if (result.success) {
    if (result.damage) {
      const damage = Math.max(0, result.damage - (f.player.magicArmour || 0) - (f.enemy.magicFear || 0));
      f.player.lifePoints -= damage; effect = tk('damage_effect', { damage });
    }
    if (result.paralysisRounds) { f.paralysedPlayerRounds = result.paralysisRounds; effect = tk('paralysis_effect', { rounds: result.paralysisRounds }); }
    if (result.destination) { f.outcome = 'warped'; effect = tk('go_to', { section: result.destination }); }
    if (result.leprosyPercent) effect = tk('leprosy_effect');
  }
  f.enemyTurns += 1;
  if (f.rest) {
    f.rest -= 1;
    if (!f.rest) f.attacks = 0;
  }
  f.turn = 'player';
  append(d, tk('event_log', { event: tk(`spell.${spell}`), result: effect }));
  checkFireWolfOutcome(f); record(d); store();
}
// END EXTRACTED RULES
  return { cast, regentSpell };
}
