import { currentPlaythrough, currentBookId, saveState } from '../core/state.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { showAlert, showConfirm } from '../ui-helpers/confirm.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';
import { FIRE_WOLF_ATTRIBUTES, rollFireWolfCharacter, resolveFireWolfInitiative, rollFireWolfAttack,
  resolveFireWolfDeathLuck, throwFireWolfOrb, healFireWolfWithStone, tryFireWolfCharm,
  tryFireWolfLightbringer, useFireWolfBluePowder, checkFireWolfOutcome } from './engines/demonspawn/fire-wolf.js';
import { FIRE_WOLF_ENCOUNTERS, prepareFireWolfEncounter, createFireWolfEncounterDuel } from './engines/demonspawn/fire-wolf-encounters.js';
import { createFireWolfManualGroup, rollFireWolfManualAttack, advanceFireWolfManualRound } from './engines/demonspawn/fire-wolf-groups.js';
import { FIRE_WOLF_SPELLS, FIRE_WOLF_REGENT_SPELLS, enterFireWolfMagicSection,
  castFireWolfSpell, castFireWolfRegentSpell } from './engines/demonspawn/fire-wolf-magic.js';

const ID = 'sim534';
const tk = (key, params) => t(`battlesim534.${key}`, params);
const el = key => document.getElementById(`${ID}-${key}`);
const fields = [...FIRE_WOLF_ATTRIBUTES, 'skill', 'lifePoints', 'maxLife', 'power', 'maxPower', 'healingStone', 'bluePowder'];
const switches = ['shield', 'lightbringer', 'openFlame', 'orbHeld'];

function data() {
  if (Number(currentBookId) !== 534) return null;
  const pt = currentPlaythrough();
  if (!pt) return null;
  return pt[ID] ||= { player: { ...rollFireWolfCharacter(), power: 0, maxPower: 0,
    healingStone: 0, bluePowder: 0, armour: 'none', shield: false }, fight: null,
    prepared: null, opponent: 0, nextOptions: {}, magic: null, history: [], log: [] };
}
function character(d) { return d.fight?.player ?? d.player; }
function active(d) { return d.fight && !d.fight.outcome; }
function close() { el('overlay')?.classList.remove('active'); }
function open() {
  if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  renderSim534(); el('overlay').classList.add('active');
}
function store() { saveState(); renderSim534(); }
function field(key, prefix = '') {
  return `<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk(key)}</span>
    <input id="${ID}-${prefix}${key}" class="inv-edit-input inv-qty-input" type="number" min="0" step="1"></label>`;
}
function toggle(key) { return `<label class="inv-edit-row"><input id="${ID}-${key}" type="checkbox">${tk(key)}</label>`; }
function button(key) { return `<button id="${ID}-${key}" class="inv-add-btn">${tk(key)}</button>`; }
function label(section) { return section === 'prologue' ? tk('prologue') : tk('section', { section }); }
function enemyLabel(encounter) {
  const counts = new Map();
  for (const name of encounter.enemies) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) => count > 1 ? `${name} x${count}` : name).join(', ');
}
function append(d, message) { d.log.push(message); d.log = d.log.slice(-150); }
function hasNext(d) { return !d.fight?.manualGroup && d.fight?.outcome === 'win' && d.opponent + 1 < d.prepared.enemies.length; }
function record(d) {
  const f = d.fight;
  if (!f || !['win', 'loss'].includes(f.outcome) || hasNext(d) || f.recorded) return;
  f.recorded = true;
  d.history.push({ enemy: label(d.prepared.encounter.section), outcome: f.outcome,
    ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
}
function start() {
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
  const d = data(); if (!d || !hasNext(d)) return;
  d.prepared.player = { ...d.fight.player };
  d.opponent += 1;
  d.fight = createFireWolfEncounterDuel(d.prepared, d.opponent);
  store();
}
function act(action) {
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

function cast() {
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

export function renderSim534() {
  if (!el('overlay')) return;
  const d = data(); if (!d) { close(); return; }
  const f = d.fight, p = character(d), pending = Boolean(f?.pending), fighting = Boolean(active(d));
  for (const key of fields) {
    if (document.activeElement !== el(key)) el(key).value = p[key] ?? 0;
    el(key).disabled = pending;
  }
  el('armour').value = p.armour ?? 'none'; el('armour').disabled = pending;
  el('shield').checked = !!p.shield; el('shield').disabled = pending;
  el('encounter').disabled = fighting || hasNext(d);
  el('start').disabled = fighting || hasNext(d) || p.lifePoints <= 0;
  el('roll_character').disabled = fighting || hasNext(d);
  const selected = FIRE_WOLF_ENCOUNTERS.find(e => String(e.section) === el('encounter').value);
  el('illusion').hidden = selected?.dynamic !== 'illusion';
  for (const key of switches.filter(key => key !== 'shield')) {
    el(key).checked = Boolean(fighting ? f.options[key] : d.nextOptions?.[key]);
    el(key).disabled = fighting || hasNext(d);
  }
  el('next').hidden = !hasNext(d);
  el('manual_group').hidden = !f?.manualGroup;
  el('target').hidden = !f?.manualGroup;
  if (f?.manualGroup) {
    const previous = el('target').value;
    el('target').innerHTML = f.enemies.map((e, index) => `<option value="${index}" ${e.lifePoints <= 0 ? 'disabled' : ''}>${escapeHtml(e.name)} (${Math.max(0, e.lifePoints)} LP)</option>`).join('');
    if (f.enemies[Number(previous)]?.lifePoints > 0) el('target').value = previous;
    else el('target').value = String(f.enemies.findIndex(e => e.lifePoints > 0));
  }
  for (const action of ['player_attack', 'enemy_attack', 'end_round']) {
    el(action).hidden = !f?.manualGroup; el(action).disabled = !fighting || pending;
  }
  el('enemy_attack').disabled ||= f?.freePlayerAttacks > 0;
  el('roll').hidden = !!f?.manualGroup; el('roll').disabled = !fighting || pending;
  el('death_luck').hidden = f?.pending !== 'death-luck';
  for (const action of ['charm_test', 'light_test', 'powder', 'stone', 'throw_orb']) el(action).disabled = !fighting || pending;
  el('charm_test').disabled ||= !f?.options.charmEscape || f.charmTested || f.round > 0 || f.enemyTurns > 0;
  el('light_test').disabled ||= !f?.options.lightbringer || f.lightbringerTested || f.round > 0 || f.enemyTurns > 0;
  el('powder').disabled ||= !f?.options.openFlame || p.bluePowder < 1;
  const stoneBoundary = f?.manualGroup ? f.manualRound : f?.enemyTurns;
  el('stone').disabled ||= p.healingStone < 1 || p.lifePoints >= p.maxLife || p.lifePoints <= 0 || !stoneBoundary || f?.stoneUsedAt === stoneBoundary;
  el('throw_orb').disabled ||= !f?.options.orbHeld;
  const selectedSpell = el('spell').value, cost = FIRE_WOLF_SPELLS[selectedSpell];
  el('cast').disabled = !f || !d.magic || d.magic.used.includes(selectedSpell) || d.magic.inclination === false
    || (pending && selectedSpell !== 'resurrection') || (selectedSpell === 'resurrection' ? p.lifePoints > 0 : p.lifePoints <= 0)
    || (p.power < cost && (!el('useLife').checked || p.lifePoints <= cost - p.power));
  el('regent-panel').hidden = !f?.options.regentSword;
  el('regent_cast').disabled = !fighting || pending || f?.turn !== 'enemy';
  el('status').textContent = tk(`status.${f?.outcome ?? f?.pending ?? (f ? f.turn ?? 'initiative' : 'ready')}`);
  el('foes').innerHTML = (f?.enemies ?? (f ? [f.enemy] : [])).map((enemy, index) => `<label class="inv-edit-row">
    <span class="inv-edit-label">${escapeHtml(enemy.name)} LP</span><input class="inv-edit-input inv-qty-input" type="number" min="0" max="${enemy.maxLife}"
    step="1" data-enemy="${index}" value="${Math.max(0, enemy.lifePoints)}" ${pending || !fighting ? 'disabled' : ''}></label>`).join('');
  el('log').innerHTML = d.log.slice().reverse().map(line => `<div>${escapeHtml(line)}</div>`).join('');
  el('history').innerHTML = d.history.slice(-50).reverse().map(entry => `<div class="bsim-history-row">${escapeHtml(entry.enemy)}: ${tk(`status.${entry.outcome}`)}</div>`).join('');
}

export function setSim534Visible(value) {
  if (el('btn')) el('btn').style.display = value ? '' : 'none';
  if (!value) close();
}

export function initSim534() {
  if (el('overlay')) return;
  const overlay = document.createElement('div'); overlay.id = `${ID}-overlay`; overlay.className = 'inv-overlay';
  overlay.innerHTML = `<div class="inv-modal bsim-modal"><div class="inv-modal-hdr"><span class="inv-modal-title">${tk('title')}</span>
    <button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div>
    <div class="bsim-body"><div class="bsim-col bsim-col-left"><div class="bsim-side"><div class="bsim-side-title">${tk('character')}</div>
    ${fields.map(key => field(key)).join('')}<label class="inv-edit-row">${tk('armour')}<select id="${ID}-armour" class="inv-edit-input">
    ${['none', 'leather', 'chain', 'plate'].map(key => `<option value="${key}">${tk(key)}</option>`).join('')}</select></label>
    ${switches.map(toggle).join('')}${button('roll_character')}</div><div class="bsim-side"><label class="inv-edit-row">${tk('encounter')}
    <select id="${ID}-encounter" class="inv-edit-input">${FIRE_WOLF_ENCOUNTERS.map(e => `<option value="${e.section}">${escapeHtml(label(e.section))}: ${escapeHtml(enemyLabel(e))}</option>`).join('')}</select></label>
    <div id="${ID}-illusion" hidden><p>${tk('illusion_note')}</p>${[...FIRE_WOLF_ATTRIBUTES, 'skill'].map(key => field(key, 'illusion-')).join('')}</div>
    <p>${tk('manual_note')}</p>${button('start')}${button('next')}<p id="${ID}-manual_group" hidden>${tk('manual_group')}</p>
    <select id="${ID}-target" class="inv-edit-input" aria-label="${tk('enemy')}" hidden></select><div id="${ID}-foes"></div>
    <div id="${ID}-status" class="bsim-status"></div>${['roll', 'player_attack', 'enemy_attack', 'end_round', 'death_luck', 'charm_test', 'light_test', 'powder', 'stone', 'throw_orb'].map(button).join('')}</div>
    <div class="bsim-side"><label class="inv-edit-row">${tk('spell')}<select id="${ID}-spell" class="inv-edit-input">${Object.entries(FIRE_WOLF_SPELLS).map(([spell, cost]) => `<option value="${spell}">${tk(`spell.${spell}`)} (${cost})</option>`).join('')}</select></label>
    ${toggle('useLife')}<label class="inv-edit-row">${tk('destination')}<input id="${ID}-destination" class="inv-edit-input"></label>${button('cast')}
    <div id="${ID}-regent-panel" hidden><label class="inv-edit-row">${tk('regent')}<select id="${ID}-regent-spell" class="inv-edit-input">${Object.keys(FIRE_WOLF_REGENT_SPELLS).map(spell => `<option value="${spell}">${tk(`spell.${spell}`)}</option>`).join('')}</select></label>${button('regent_cast')}</div></div></div>
    <div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${tk('history')}</summary><div id="${ID}-history" class="bsim-history-list"></div></details>
    <div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
  document.body.appendChild(overlay);
  const btn = document.createElement('button'); btn.id = `${ID}-btn`; btn.innerHTML = shortcutLabel(t('battlesim.title')); btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn); btn.addEventListener('click', open); el('close').addEventListener('click', close);
  let backdropDown = false;
  overlay.addEventListener('mousedown', event => { backdropDown = event.target === overlay; });
  overlay.addEventListener('click', event => { if (backdropDown && event.target === overlay) close(); });
  registerPanelShortcut('KeyS', { getButton: () => btn, getOverlay: () => overlay, otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  el('start').addEventListener('click', start); el('next').addEventListener('click', next);
  el('encounter').addEventListener('change', renderSim534);
  el('cast').addEventListener('click', cast); el('regent_cast').addEventListener('click', regentSpell);
  el('spell').addEventListener('change', renderSim534); el('useLife').addEventListener('change', renderSim534);
  for (const action of ['roll', 'player_attack', 'enemy_attack', 'end_round', 'death_luck', 'charm_test', 'light_test', 'powder', 'stone', 'throw_orb']) el(action).addEventListener('click', () => act(action));
  for (const key of fields) el(key).addEventListener('change', () => {
    const d = data(), value = Number(el(key).value); if (!d || d.fight?.pending) return;
    if (!el(key).value || !Number.isInteger(value) || value < 0) { renderSim534(); return; }
    character(d)[key] = value;
    if (d.fight) checkFireWolfOutcome(d.fight);
    record(d); store();
  });
  for (const key of ['armour', 'shield']) el(key).addEventListener('change', () => {
    const d = data(); if (!d || d.fight?.pending) return;
    character(d)[key] = key === 'shield' ? el(key).checked : el(key).value; store();
  });
  el('foes').addEventListener('change', event => {
    const d = data(), f = d?.fight, input = event.target.closest('[data-enemy]');
    if (!input || !f || f.pending || f.outcome) return;
    const enemy = (f.enemies ?? [f.enemy])[Number(input.dataset.enemy)], value = Number(input.value);
    if (enemy && input.value !== '' && Number.isInteger(value) && value >= 0 && value <= enemy.maxLife) {
      enemy.lifePoints = value; checkFireWolfOutcome(f); record(d);
    }
    store();
  });
  for (const key of switches.filter(key => key !== 'shield')) el(key).addEventListener('change', () => {
    const d = data(); if (!d || active(d) || hasNext(d)) return;
    (d.nextOptions ||= {})[key] = el(key).checked; store();
  });
  el('roll_character').addEventListener('click', () => {
    const d = data(), pt = currentPlaythrough(); if (!d || active(d) || hasNext(d)) return;
    showConfirm(tk('new_character_confirm'), () => {
      if (Number(currentBookId) !== 534 || currentPlaythrough() !== pt || active(d) || hasNext(d)) return;
      d.player = { ...character(d), ...rollFireWolfCharacter() }; d.fight = null; d.prepared = null; store();
    });
  });
}
