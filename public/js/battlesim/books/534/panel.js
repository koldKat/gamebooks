import { ID, switches } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, FIRE_WOLF_ATTRIBUTES, FIRE_WOLF_ENCOUNTERS, FIRE_WOLF_REGENT_SPELLS, FIRE_WOLF_SPELLS, ID, act, active, advanceFireWolfManualRound, append, button, cast, castFireWolfRegentSpell, castFireWolfSpell, character, checkFireWolfOutcome, close, createFireWolfEncounterDuel, createFireWolfManualGroup, currentBookId, currentPlaythrough, data, el, enemyLabel, enterFireWolfMagicSection, escapeHtml, field, fields, getPlayBtnRow, hasNext, healFireWolfWithStone, initSim534, label, next, open, prepareFireWolfEncounter, record, regentSpell, registerPanelShortcut, renderSim534, resolveFireWolfDeathLuck, resolveFireWolfInitiative, rollFireWolfAttack, rollFireWolfCharacter, rollFireWolfManualAttack, saveState, setSim534Visible, shortcutLabel, showAlert, showConfirm, start, store, switches, t, throwFireWolfOrb, tk, toggle, tryFireWolfCharm, tryFireWolfLightbringer, useFireWolfBluePowder });
const { data } = createState(simulatorContext);
const { character, active, store, label, enemyLabel, append, hasNext, record, start, next, act } = createCombat(simulatorContext);
const { cast, regentSpell } = createEffects(simulatorContext);
// END SIMULATOR WIRING
import { currentPlaythrough, currentBookId, saveState } from "../../../core/state.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { showAlert, showConfirm } from "../../../ui-helpers/confirm.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import { FIRE_WOLF_ATTRIBUTES, rollFireWolfCharacter, resolveFireWolfInitiative, rollFireWolfAttack,
  resolveFireWolfDeathLuck, throwFireWolfOrb, healFireWolfWithStone, tryFireWolfCharm,
  tryFireWolfLightbringer, useFireWolfBluePowder, checkFireWolfOutcome } from "../.././engines/demonspawn/fire-wolf.js";
import { FIRE_WOLF_ENCOUNTERS, prepareFireWolfEncounter, createFireWolfEncounterDuel } from "../.././engines/demonspawn/fire-wolf-encounters.js";
import { createFireWolfManualGroup, rollFireWolfManualAttack, advanceFireWolfManualRound } from "../.././engines/demonspawn/fire-wolf-groups.js";
import { FIRE_WOLF_SPELLS, FIRE_WOLF_REGENT_SPELLS, enterFireWolfMagicSection,
  castFireWolfSpell, castFireWolfRegentSpell } from "../.././engines/demonspawn/fire-wolf-magic.js";


const tk = (key, params) => t(`battlesim534.${key}`, params);
const el = key => document.getElementById(`${ID}-${key}`);
const fields = [...FIRE_WOLF_ATTRIBUTES, 'skill', 'lifePoints', 'maxLife', 'power', 'maxPower', 'healingStone', 'bluePowder'];





function close() { el('overlay')?.classList.remove('active'); }
function open() {
  if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  renderSim534(); el('overlay').classList.add('active');
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
  overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${tk('title')}</span>
    <button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div>
    <div class="bsim-body"><div class="bsim-col bsim-col-left"><div class="bsim-side"><div class="bsim-side-title">${tk('character')}</div>
    ${fields.map(key => field(key)).join('')}<label class="inv-edit-row">${tk('armour')}<select id="${ID}-armour" class="inv-edit-input">
    ${['none', 'leather', 'chain', 'plate'].map(key => `<option value="${key}">${tk(key)}</option>`).join('')}</select></label>
    ${switches.map(toggle).join('')}${button('roll_character')}</div><div class="bsim-side"><label class="inv-edit-row">${tk('encounter')}
    <select id="${ID}-encounter" class="inv-edit-input">${FIRE_WOLF_ENCOUNTERS.map(e => `<option value="${e.section}">${escapeHtml(enemyLabel(e))} (${escapeHtml(label(e.section))})</option>`).join('')}</select></label>
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

function field(key, prefix = '') {

  return `<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk(key)}</span>
    <input id="${ID}-${prefix}${key}" class="inv-edit-input inv-qty-input" type="number" min="0" step="1"></label>`;
}

function toggle(key) {
 return `<label class="inv-edit-row"><input id="${ID}-${key}" type="checkbox">${tk(key)}</label>`; }

function button(key) {
 return `<button id="${ID}-${key}" class="inv-add-btn">${tk(key)}</button>`; }

export { initSim534 as init, renderSim534 as render, setSim534Visible as setVisible };
