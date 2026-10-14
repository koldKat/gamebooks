// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function character(d) {
 return d.fight?.player ?? d.player; }

function active(d) {
 return d.fight && !d.fight.outcome; }

function store() {
  const { renderSim534, saveState } = getContext();
 saveState(); renderSim534(); }







function label(section) {
  const { tk } = getContext();
 return section === 'prologue' ? tk('prologue') : tk('section', { section }); }

function enemyLabel(encounter) {

  const counts = new Map();
  for (const name of encounter.enemies) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) => count > 1 ? `${name} x${count}` : name).join(', ');
}

function append(d, message) {
 d.log.push(message); d.log = d.log.slice(-150); }

function hasNext(d) {
 return !d.fight?.manualGroup && d.fight?.outcome === 'win' && d.opponent + 1 < d.prepared.enemies.length; }

function record(d) {
  const { enemyLabel, hasNext, label } = getContext();

  const f = d.fight;
  if (!f || !['win', 'loss'].includes(f.outcome) || hasNext(d) || f.recorded) return;
  f.recorded = true;
  d.history.push({ enemy: `${enemyLabel(d.prepared.encounter)} (${label(d.prepared.encounter.section)})`, outcome: f.outcome,
    ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
}

function start() {
  const { FIRE_WOLF_ATTRIBUTES, active, append, character, createFireWolfEncounterDuel, createFireWolfManualGroup, data, el, enterFireWolfMagicSection, hasNext, label, prepareFireWolfEncounter, showAlert, store, switches, tk } = getContext();

  const d = data(); if (!d || active(d) || hasNext(d)) return;
  try {
    const illusion = Object.fromEntries([...FIRE_WOLF_ATTRIBUTES, 'skill'].map(key => [key, Number(el(`illusion-${key}`).value)]));
    if ([...FIRE_WOLF_ATTRIBUTES, 'skill'].some(key => el(`illusion-${key}`).value === '')) {
      for (const key of [...FIRE_WOLF_ATTRIBUTES, 'skill']) if (el(`illusion-${key}`).value === '') illusion[key] = null;
    }
    const p = { ...character(d) };
    if (d.magic?.section !== el('encounter').value) p.magicArmour = 0;
    d.prepared = prepareFireWolfEncounter(el('encounter').value, p, {
      illusion, ...Object.fromEntries(switches.map(key => [key, el(key).checked])),
    });
    d.opponent = 0;
    d.fight = d.prepared.encounter.manualGroup ? createFireWolfManualGroup(d.prepared) : createFireWolfEncounterDuel(d.prepared);
    const previousMagic = d.magic;
    const previousPower = d.fight.player.power;
    d.magic = enterFireWolfMagicSection(previousMagic, d.prepared.encounter.section, d.fight.player, d.fight.enemy);
    if (d.fight.player.power > previousPower) append(d, tk('power_recovered', { amount: d.fight.player.power - previousPower }));
    if (d.magic !== previousMagic) d.magic.opening.enemyLives = d.prepared.enemies.map(enemy => enemy.lifePoints);
    d.fight.player.magicArmour = d.magic.armour;
    if (d.magic.invisible) d.fight.outcome = 'avoided';
    d.player = { ...d.fight.player };
    append(d, label(d.prepared.encounter.section)); store();
  } catch { showAlert(tk('invalid')); }
}

function next() {
  const { createFireWolfEncounterDuel, data, hasNext, store } = getContext();

  const d = data(); if (!d || !hasNext(d)) return;
  d.prepared.player = { ...d.fight.player };
  d.opponent += 1;
  d.fight = createFireWolfEncounterDuel(d.prepared, d.opponent);
  store();
}

function act(action) {
  const { advanceFireWolfManualRound, append, data, el, healFireWolfWithStone, record, resolveFireWolfDeathLuck, resolveFireWolfInitiative, rollFireWolfAttack, rollFireWolfManualAttack, store, throwFireWolfOrb, tk, tryFireWolfCharm, tryFireWolfLightbringer, useFireWolfBluePowder } = getContext();

  const d = data(), f = d?.fight; if (!f || f.outcome) return;
  let result;
  if (action === 'death_luck') result = resolveFireWolfDeathLuck(f);
  else if (f.pending) return;
  else if (action === 'roll') {
    if (!f.turn) {
      resolveFireWolfInitiative(f);
      const last = f.log.at(-1);
      if (last) append(d, tk('initiative_log', last));
      store(); return;
    }
    result = rollFireWolfAttack(f);
  } else if (action === 'player_attack' || action === 'enemy_attack') {
    result = rollFireWolfManualAttack(f, action === 'player_attack' ? 'player' : 'enemy', Number(el('target').value));
  } else if (action === 'end_round') result = advanceFireWolfManualRound(f);
  else if (action === 'charm_test') result = tryFireWolfCharm(f);
  else if (action === 'light_test') result = tryFireWolfLightbringer(f);
  else if (action === 'powder') result = useFireWolfBluePowder(f);
  else if (action === 'stone') result = healFireWolfWithStone(f);
  else if (action === 'throw_orb') result = throwFireWolfOrb(f);
  if (action === 'throw_orb' && result) d.nextOptions.orbHeld = false;
  if (result === null || result === undefined || result === false && action === 'powder') return;
  if (result?.kind === 'attack') append(d, tk('attack_log', { ...result, side: result.side === 'player' ? tk('character') : tk('enemy') }));
  else append(d, tk('event_log', { event: tk(action), result: typeof result === 'boolean' ? tk(result ? 'success' : 'failure') : typeof result === 'number' ? result : result.damage ?? result.kind ?? '' }));
  record(d); store();
}
// END EXTRACTED RULES
  return { character, active, store, label, enemyLabel, append, hasNext, record, start, next, act };
}
