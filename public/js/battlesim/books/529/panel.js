import { ID, core, resources, flags, options, spells } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createGrailOpponentSetup } from '../../engines/grailquest/setup.js';
let customSetup;

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ customSetup, ALL_PANEL_OVERLAY_IDS, ID, VOYAGE_ENCOUNTERS, VOYAGE_NAVIGATION, action, active, character, close, confirm, core, currentBookId, currentPlaythrough, data, el, escapeHtml, flags, getPlayBtnRow, initSim529, label, logEvents, open, options, record, registerPanelShortcut, renderSim529, replaceResult, resources, rules, saveState, setSim529Visible, shortcutLabel, showAlert, showConfirm, spells, t, tk, update });
const { data } = createState(simulatorContext);
const { label, record, logEvents, update, action, confirm, replaceResult } = createCombat(simulatorContext);
// END SIMULATOR WIRING
import { currentPlaythrough, currentBookId, saveState } from "../../../core/state.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { showAlert, showConfirm } from "../../../ui-helpers/confirm.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import { VOYAGE_ENCOUNTERS, VOYAGE_NAVIGATION } from "../.././engines/grailquest/voyage-of-terror-roster.js";
import * as rules from "../.././engines/grailquest/voyage-of-terror.js";

const tk = (key, params) => t(`battlesim529.${key}`, params);
const el = key => document.getElementById(`${ID}-${key}`);

const character = d => d.fight?.player ?? d.player;
const active = d => d.fight?.status === 'fighting';

function close() { el('overlay')?.classList.remove('active'); }
function open() {
  if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  renderSim529(); el('overlay').classList.add('active');
}

export function renderSim529() {
  if (!el('overlay')) return;
  const d = data(); if (!d) { close(); return; }
  customSetup?.render();
  const p = character(d), f = d.fight, fighting = active(d);
  el('combat-stats').hidden = !fighting || f.spec.shadows;
  if (fighting) {
    const stats = rules.voyageCombatStats(f);
    for (const key of ['hit', 'bonus', 'armour']) el('combat' + key[0].toUpperCase() + key.slice(1)).value = stats[key];
    el('protected-blows').textContent = stats.protectedBlows ? tk('protected_blows', { count: stats.protectedBlows }) : '';
  }
  for (const key of [...core, ...resources]) {
    if (document.activeElement !== el(key)) el(key).value = p[key];
    el(key).disabled = fighting;
  }
  for (const key of flags) { el(key).checked = !!p[key]; el(key).disabled = fighting; }
  el('weapon').value = p.weapon; el('weapon').disabled = fighting;
  el('shape').value = p.shape; el('shape').disabled = fighting;
  for (const [key, field] of [['sprain', 'sprainSections'], ['limp', 'limpSections']]) {
    el(key).value = p[field].length; el(key).disabled = fighting;
  }
  for (const key of options) el(`option-${key}`).disabled = fighting;
  el('enemyWeapon').disabled = fighting;
  const targets = f?.spec.shadows ? f.shadows.map((shadow, index) => ({ shadow, index }))
    .filter(({ shadow }) => !shadow.banished) : f ? rules.voyageTargets(f) : [];
  const pipTargets = f?.spec.splitFerrets ? targets.filter(({ foe, index }) => foe.phase !== 0 || index < rules.VOYAGE_RULES.ferretSplit) : targets;
  const available = f?.spec.splitFerrets ? pipTargets.length ? pipTargets : targets.slice(0, 1)
    : f?.spec.simultaneous || f?.spec.alternating || f?.spec.argonautBattle || f?.spec.shadows ? targets : targets.slice(0, 1);
  const selected = el('target').value;
  el('target').innerHTML = available.map(({ foe, index }) => `<option value="${index}">${escapeHtml(foe
    ? tk('target_label', { enemy: foe.name, life: foe.life }) : tk('shadow_label', { number: index + 1 }))}</option>`).join('');
  if (available.some(({ index }) => String(index) === selected)) el('target').value = selected;
  const opponent = f?.foes[Number(el('target').value)];
  el('target').disabled = !fighting;
  el('roll').disabled = !fighting || !f.first && !f.spec.shadows;
  el('initiative').hidden = !fighting || !!f.first || f.spec.shadows;
  for (const key of ['friendly', 'bribe', 'sleeping_rex', 'leave', 'weakening', 'teeth']) {
    el(key).disabled = !fighting || f.rounds > 0;
  }
  el('friendly').disabled ||= f?.spec.friendly === false || f?.spec.shadows || f?.friendlyForbidden || opponent?.friendlyTried;
  el('bribe').disabled ||= opponent?.bribeTried || f?.bribeTried || f?.spec.bribe && p.gold < f.spec.bribe
    || !f?.spec.bribe && !f?.spec.equipmentBribe && !f?.spec.eggBribe;
  el('sleeping_rex').hidden = !f?.spec.sleepingRoll;
  el('sleeping_rex').disabled ||= f?.sleepChecked;
  el('leave').hidden = !rules.voyageCanLeave(f?.spec);
  el('teeth').disabled ||= p.dragonTeeth === 0 || f?.spec.shadows || f?.spec.dream || p.shape !== 'human';
  el('weakening').disabled ||= !p.weakeningPotion || f?.spec.dream;
  el('gnurlbash_button').disabled = !fighting || !p.gnurlbash || f.spec.dream || f.spec.shadows;
  el('cast').disabled = !fighting || f.spec.dream || p.shape !== 'human' || f.spec.shadows;
  for (const option of el('spell').options) option.disabled = !p[option.value]
    || option.value === 'wallbanger' && p.wallbangerUsed
    || option.value === 'crystalBlade' && f?.spec.weaponImmune
    || option.value === 'illusion' && opponent?.illusionImmune;
  el('cast').disabled ||= el('spell').selectedOptions[0]?.disabled ?? true;
  for (const key of ['heal', 'cure', 'exchange', 'sleep', 'navigation', 'guard_challenge', 'recruit']) {
    el(key).disabled = fighting || p.life <= 0;
  }
  el('heal').disabled = p.life <= 0 || fighting && f.spec.dream || p[el('healing').value] < 1;
  el('exchange').disabled ||= p.experience < 20;
  el('recruit').disabled ||= p.companions.length > 0;
  el('dream_again').hidden = !d.dreamAgain;
  el('limerick-controls').hidden = !d.limerick;
  el('sleep').disabled ||= d.dreamAgain || d.limerick;
  el('escape').hidden = f?.status !== 'win' || !f.spec.escapeRoll || f.escapeChecked;
  el('serpent_loss').hidden = f?.status !== 'win' || !f.spec.victoryEquipmentLost || f.equipmentLost;
  el('status').textContent = fighting ? `${label(f.spec.section)}: ${!f.first && !f.spec.shadows ? tk('tie')
    : tk('round', { round: f.rounds + 1 })}` : f?.status === 'redirect' ? tk('redirect', { section: f.redirect })
    : f ? `${label(f.spec.section)}: ${tk(f.status)}` : tk('pick');
  el('crew').innerHTML = p.companions.map((ally, index) => `<details><summary>${escapeHtml(tk('companion_label', {
    name: ally.name, number: ally.name === rules.voyageCompanionName('argonaut') ? index - 1 : '' }))}</summary>${['life', 'hit', 'bonus', 'armour'].map(key =>
    `<label class="inv-edit-row">${tk(key === 'hit' || key === 'bonus' ? 'companion_' + key : key)}<input class="inv-edit-input inv-qty-input" type="number" min="0" step="1" data-ally="${index}" data-stat="${key}" value="${ally[key]}" ${fighting ? 'disabled' : ''}></label>`).join('')}</details>`).join('');
  const selectedEncounter = rules.voyageEncounter(el('encounter').value);
  const partySpec = fighting ? f.spec : selectedEncounter;
  const party = partySpec?.argonautBattle;
  const assignmentFoes = fighting ? f.foes : partySpec?.foes ?? [];
  const participants = [p, ...(fighting ? f.allies : p.companions)];
  el('assignments').hidden = !party;
  el('assignments-list').innerHTML = party ? assignmentFoes.map((foe, index) =>
    `<label class="inv-edit-row">${tk('assigned_to', { enemy: foe.name, number: index + 1 })}<select class="inv-edit-input" data-assignment="${index}">${participants.map((actor, i) =>
      `<option value="${i}" ${i === (fighting ? f.options.assignments?.[index] ?? 0 : Math.min(index, p.companions.length)) ? 'selected' : ''} ${actor.life <= 0 ? 'disabled' : ''}>${escapeHtml(i ? actor.name : tk('player'))}</option>`).join('')}</select></label>`).join('') : '';
  el('log').innerHTML = d.log.slice(-100).reverse().map(line => `<div>${escapeHtml(line)}</div>`).join('');
  el('history').innerHTML = d.history.slice(-50).reverse().map(row => `<div class="bsim-history-row">${escapeHtml(row.enemy)}: ${escapeHtml(tk(row.outcome))}</div>`).join('');
}

export function setSim529Visible(visible) {
  if (el('btn')) el('btn').style.display = visible ? '' : 'none';
  if (!visible) close();
}

export function initSim529() {
  if (el('overlay')) return;
  const inputs = keys => keys.map(key => `<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk(key)}</span><input id="${ID}-${key}" class="inv-edit-input inv-qty-input" type="number" min="0" step="1"></label>`).join('');
  const button = key => `<button id="${ID}-${key}" class="inv-add-btn">${tk(key)}</button>`;
  const select = (key, choices) => `<label class="inv-edit-row">${tk(key)}<select id="${ID}-${key}" class="inv-edit-input">${choices.map(choice => `<option value="${choice}">${tk(spells.includes(choice) ? choice + '_action' : choice)}</option>`).join('')}</select></label>`;
  const overlay = document.createElement('div'); overlay.id = `${ID}-overlay`; overlay.className = 'inv-overlay';
  overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${tk('title')}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><div class="bsim-side"><div class="bsim-side-title">${tk('character')}</div>${inputs(core)}${select('weapon', Object.keys(rules.VOYAGE_WEAPONS))}${button('new_character')}<details><summary>${tk('resources')}</summary>${inputs(resources)}${inputs(['sprain', 'limp'])}${flags.map(key => `<label class="inv-edit-row"><input id="${ID}-${key}" type="checkbox">${tk(key)}</label>`).join('')}</details><details><summary>${tk('companions')}</summary>${button('recruit')}<div id="${ID}-crew"></div></details></div><div class="bsim-side"><label class="inv-edit-row">${tk('encounter')}<select id="${ID}-encounter" class="inv-edit-input">${[...VOYAGE_ENCOUNTERS, ...VOYAGE_NAVIGATION].map(spec => `<option value="${spec.section}">${escapeHtml(label(spec.section))}</option>`).join('')}</select></label><details><summary>${tk('pre_fight')}</summary>${options.map(key => `<label class="inv-edit-row"><input id="${ID}-option-${key}" type="checkbox">${tk(key)}</label>`).join('')}${select('enemyWeapon', ['other', 'enemy_sword', 'enemy_spear'])}</details><details id="${ID}-assignments"><summary>${tk('assign')}</summary><div id="${ID}-assignments-list"></div></details>${button('start')}<div id="${ID}-status" class="bsim-status"></div><label class="inv-edit-row">${tk('target')}<select id="${ID}-target" class="inv-edit-input"></select></label><div class="bsim-btn-row">${button('initiative')}${button('roll')}${button('friendly')}${button('bribe')}${button('sleeping_rex')}${button('leave')}</div>${select('spell', spells)}<div class="bsim-btn-row">${button('cast')}${button('weakening')}${button('gnurlbash_button')}</div>${inputs(['tooth_count'])}${button('teeth')}${select('healing', ['potions', 'salves'])}<div class="bsim-btn-row">${button('heal')}${button('exchange')}${button('sleep')}${button('dream_again')}</div>${select('cure_type', ['antidotes', 'eggSpinach', 'quinine', 'malariaSupplies'])}${button('cure')}<div id="${ID}-limerick-controls"><p>${tk('limerick')}</p><div class="bsim-btn-row">${button('limerick_yes')}${button('limerick_no')}</div></div>${inputs(['destination'])}<div class="bsim-btn-row">${button('navigation')}${button('guard_challenge')}${button('escape')}${button('serpent_loss')}</div></div><p>${tk('note')}</p><p>${tk('manual')}</p></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${tk('history')}</summary><div id="${ID}-history" class="bsim-history-list"></div></details><div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
  document.body.appendChild(overlay);
  customSetup = createGrailOpponentSetup({document, id: ID, t, tk, encounters: VOYAGE_ENCOUNTERS,
    getRun: currentPlaythrough, getData: data, labels: {hit: 'companion_hit', bonus: 'companion_bonus'}});
  el('weapon').closest('label').insertAdjacentHTML('afterend', select('shape', ['human', 'beetle', 'pig']));
  el('status').insertAdjacentHTML('afterend', `<div id="${ID}-combat-stats"><div class="bsim-side-title">${tk('combat_stats')}</div>${inputs(['combatHit', 'combatBonus', 'combatArmour'])}<p id="${ID}-protected-blows"></p></div>`);
  for (const key of ['combatHit', 'combatBonus', 'combatArmour']) el(key).readOnly = true;
  el('tooth_count').value = 1; el('destination').value = 122;
  const btn = document.createElement('button'); btn.id = `${ID}-btn`; btn.innerHTML = shortcutLabel(t('battlesim.title')); btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn); btn.addEventListener('click', open); el('close').addEventListener('click', close);
  let backdrop = false;
  overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
  overlay.addEventListener('click', event => { if (event.target === overlay && backdrop) close(); });
  registerPanelShortcut('KeyS', { getButton: () => btn, getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== `${ID}-overlay`), open, close });
  el('start').addEventListener('click', () => {
    const settings = Object.fromEntries(options.map(key => [key, el(`option-${key}`).checked]));
    settings.enemyWeapon = el('enemyWeapon').value.replace('enemy_', '');
    if (rules.voyageEncounter(el('encounter').value)?.argonautBattle) settings.assignments = Array.from(el('assignments-list').querySelectorAll('select'), input => Number(input.value));
    const section = el('encounter').value;
    const apply = d => { const next = rules.createVoyageFight(section, character(d), customSetup.settings(d, settings, section));
      record(d); d.fight = next; d.dreamAgain = d.limerick = false; logEvents(d); };
    if (active(data() ?? {})) confirm(tk('replace_fight'), apply); else action(apply);
  });
  for (const key of ['encounter', 'spell', 'healing', 'cure_type', 'target']) el(key).addEventListener('change', renderSim529);
  el('new_character').addEventListener('click', () => confirm(tk('new_confirm'), d => {
    record(d); const stats = rules.initialVoyageLife(character(d).permanent);
    const goldenKeys = rules.voyageRetainsKeysOnLoss(d.fight) ? character(d).goldenKeys : 0;
    d.player = { ...rules.createVoyageCharacter(), ...stats, goldenKeys }; d.fight = null; d.dreamAgain = d.limerick = false;
  }));
  for (const key of [...core, ...resources, 'sprain', 'limp']) el(key).addEventListener('change', () => action(d => {
    if (active(d)) return;
    const p = character(d), value = Number(el(key).value);
    if (!el(key).value.trim() || !Number.isSafeInteger(value) || value < 0
      || key === 'life' && value > p.maxLife || key === 'maxLife' && value < p.life
      || key === 'armourPieces' && value > 3 || key === 'sprain' && value > 12 || key === 'limp' && value > 3) {
      el(key).value = key === 'sprain' ? p.sprainSections.length : key === 'limp' ? p.limpSections.length : p[key];
      showAlert(tk('invalid')); return;
    }
    if (key === 'sprain' || key === 'limp') p[key === 'sprain' ? 'sprainSections' : 'limpSections'] = Array(value).fill('manual');
    else p[key] = value;
  }));
  for (const key of flags) el(key).addEventListener('change', () => action(d => { if (!active(d)) character(d)[key] = el(key).checked; }));
  el('weapon').addEventListener('change', () => action(d => { if (!active(d)) character(d).weapon = el('weapon').value; }));
  el('shape').addEventListener('change', () => {
    const shape = el('shape').value;
    confirm(tk('shape_confirm'), d => {
      if (active(d)) return;
      const p = character(d);
      if (p.shape === shape) return;
      p.shape = shape;
      if (shape !== 'human') { p.life = shape === 'beetle' ? 25 : 15; p.maxLife = Math.max(p.maxLife, p.life); }
    });
  });
  el('crew').addEventListener('change', event => action(d => {
    if (active(d) || !event.target.matches('[data-ally]')) return;
    const input = event.target, value = Number(input.value), key = input.dataset.stat;
    if (!input.value.trim() || !Number.isSafeInteger(value) || value < 0 || key === 'hit' && (value < 2 || value > 12)) { showAlert(tk('invalid')); return; }
    character(d).companions[Number(input.dataset.ally)][key] = value;
  }));
  el('assignments-list').addEventListener('change', event => action(d => {
    if (!active(d) || !d.fight.spec.argonautBattle || !event.target.matches('[data-assignment]')) return;
    const index = Number(event.target.dataset.assignment), target = Number(event.target.value);
    const actor = [d.fight.player, ...d.fight.allies][target];
    if (!Number.isSafeInteger(index) || index < 0 || index >= d.fight.foes.length || !actor || actor.life <= 0) throw new RangeError('Invalid target');
    d.fight.options.assignments ||= Array(d.fight.foes.length).fill(0);
    d.fight.options.assignments[index] = target;
  }));
  el('recruit').addEventListener('click', () => confirm(tk('recruit_confirm'), d => { if (!active(d)) rules.recruitVoyageArgonauts(character(d)); }));
  el('initiative').addEventListener('click', () => action(d => { if (active(d)) rules.rerollVoyageInitiative(d.fight); }));
  const fightAction = (key, apply) => el(key).addEventListener('click', () => action(d => {
    if (!d.fight) return; d.fight.events = []; apply(d.fight, Number(el('target').value)); logEvents(d);
  }));
  fightAction('roll', (f, target) => f.spec.shadows ? rules.voyageShadowRound(f, target) : rules.rollVoyageRound(f, target));
  fightAction('friendly', rules.voyageFriendly); fightAction('bribe', rules.voyageBribe);
  fightAction('weakening', rules.voyageThrowWeakening);
  fightAction('sleeping_rex', f => rules.voyageSleepingRex(f));
  fightAction('leave', rules.voyageLeaveFight);
  fightAction('teeth', f => rules.voyageSowTeeth(f, Number(el('tooth_count').value)));
  fightAction('gnurlbash_button', rules.callVoyageGnurlbash);
  fightAction('escape', f => rules.escapeVoyageCannibals(f));
  fightAction('serpent_loss', rules.voyageAfterSerpent);
  el('cast').addEventListener('click', () => {
    const spell = el('spell').value, target = Number(el('target').value);
    const apply = d => { if (!active(d)) return; d.fight.events = []; rules.voyageCast(d.fight, spell, target); logEvents(d); };
    if (spell === 'wallbanger') confirm(tk('wallbanger_confirm'), apply); else action(apply);
  });
  el('heal').addEventListener('click', () => action(d => { if (active(d) && d.fight.spec.dream) return;
    const result = rules.useVoyageHealing(character(d), el('healing').value); if (result) d.log.push(tk('heal_result', result)); }));
  el('cure').addEventListener('click', () => action(d => { if (!active(d)) rules.cureVoyageAilment(character(d), el('cure_type').value); }));
  el('exchange').addEventListener('click', () => action(d => { if (!active(d)) rules.exchangeVoyageExperience(character(d)); }));
  el('sleep').addEventListener('click', () => action(d => { if (active(d) || d.dreamAgain || d.limerick) return;
    replaceResult(d, rules.voyageSleep(character(d), currentPlaythrough()?.path?.at(-1) ?? 1), 'sleep_result'); }));
  el('dream_again').addEventListener('click', () => action(d => { if (!d.dreamAgain || active(d)) return;
    replaceResult(d, rules.voyageDream(character(d), 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6), d.returnSection), 'dream_result'); }));
  for (const [key, success] of [['limerick_yes', true], ['limerick_no', false]]) el(key).addEventListener('click', () => action(d => {
    if (!d.limerick) return; rules.resolveVoyageLimerick(character(d), success); d.limerick = false;
  }));
  el('navigation').addEventListener('click', () => action(d => { if (active(d)) return;
    const destination = Number(el('destination').value);
    if (!Number.isSafeInteger(destination) || destination < 1 || destination > 203) throw new RangeError('Invalid destination');
    replaceResult(d, rules.navigateVoyage(character(d), destination), 'navigation_result'); }));
  el('guard_challenge').addEventListener('click', () => action(d => { if (active(d)) return;
    const result = rules.voyageGuardChallenge(); if (result.status === 'death') character(d).life = 0;
    d.log.push(tk('event_result', { action: tk('guard_challenge'), roll: result.rolls.join(', '), result: tk(result.status) })); }));
}

export { initSim529 as init, renderSim529 as render, setSim529Visible as setVisible };
