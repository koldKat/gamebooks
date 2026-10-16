import { ID, core, resources, flags, options, spells, wizardSpells, healing } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createGrailOpponentSetup } from '../../engines/grailquest/setup.js';
let customSetup;

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ customSetup, ALL_PANEL_OVERLAY_IDS, GATEWAY_ENCOUNTERS, GATEWAY_WANDERING, ID, action, active, character, close, confirm, core, currentBookId, currentPlaythrough, data, dreamResult, el, escapeHtml, flags, getPlayBtnRow, healing, initSim528, label, logEvents, open, options, record, registerPanelShortcut, renderSim528, resources, rules, saveState, setSim528Visible, shortcutLabel, showAlert, showConfirm, spells, start, t, tk, update, wizardSpells });
const { data } = createState(simulatorContext);
const { label, record, update, confirm, start, logEvents, dreamResult, action } = createCombat(simulatorContext);
// END SIMULATOR WIRING
import { currentPlaythrough, currentBookId, saveState } from "../../../core/state.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { showAlert, showConfirm } from "../../../ui-helpers/confirm.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import { GATEWAY_ENCOUNTERS, GATEWAY_WANDERING } from "../.././engines/grailquest/gateway-of-doom-roster.js";
import * as rules from "../.././engines/grailquest/gateway-of-doom.js";

const tk = (key, params) => t(`battlesim528.${key}`, params);
const el = key => document.getElementById(`${ID}-${key}`);

const character = d => d.fight?.player ?? d.player;
const active = d => d.fight?.status === 'fighting';

function close() { el('overlay')?.classList.remove('active'); }
function open() {
  if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  renderSim528(); el('overlay').classList.add('active');
}

export function renderSim528() {
  if (!el('overlay')) return;
  const d = data(); if (!d) { close(); return; }
  customSetup?.render();
  const p = character(d), f = d.fight, fighting = active(d);
  const display = fighting ? { ...p,
    hit: f.spec.playerHit ?? (p.dark && !f.spec.dream ? 8 : p.hit),
    bonus: f.spec.playerBonus ?? p.bonus,
    armour: f.spec.dream ? 0 : p.armour,
    magicArmour: f.magicArmour, pendingWallop: f.nextBonus,
  } : p;
  for (const key of [...core, ...resources]) {
    if (document.activeElement !== el(key)) el(key).value = display[key] ?? 0;
    el(key).disabled = fighting;
  }
  for (const key of flags) { el(key).checked = !!p[key]; el(key).disabled = fighting; }
  for (const spell of spells) {
    el(`uses-${spell}`).value = p.spellUses[spell] ?? 0;
    el(`uses-${spell}`).disabled = fighting;
  }
  el('friendly').disabled = fighting || p.life <= 0;
  for (const key of options) el(`option-${key}`).disabled = fighting;
  const targets = f ? rules.gatewayTargets(f) : [];
  const available = f?.spec.ants ? targets : targets.slice(0, 1);
  el('target').innerHTML = available.map(({ foe, index }) => `<option value="${index}">${escapeHtml(tk('target_label', { enemy: foe.name, life: foe.life }))}</option>`).join('');
  el('target').disabled = !fighting;
  el('roll').disabled = !fighting || !f.first || !!f.foes[0]?.wizard;
  el('initiative').hidden = !fighting || !!f.first;
  el('wizard-controls').hidden = !fighting || !f.foes[0]?.wizard;
  const wizard = f?.foes[0]?.wizard ? f.foes[0] : null;
  for (const option of el('wizard').options) {
    option.disabled = !wizard || option.value === 'bolt' && !wizard.bolts
      || option.value === 'firefinger' && wizard.boltsCharged
      || !['strike', 'bolt'].includes(option.value) && (wizard.spellUses?.[option.value] ?? 0) >= 3;
  }
  el('wizard-round').disabled = !fighting || !f.first || (el('wizard').selectedOptions[0]?.disabled ?? true);
  const blocked = !fighting || f.spec.dream || p.magicLost || p.magicLock.length > 0;
  for (const option of el('spell').options) {
    const used = p.spellUses[option.value] ?? 0;
    option.textContent = `${tk(option.value)} (${used}/3)`;
    option.disabled = used >= 3 || option.value === 'pip' && f?.poisoned
      || option.value === 'pals' && !available[0]?.foe.vegetable;
  }
  el('cast').disabled = blocked || (el('spell').selectedOptions[0]?.disabled ?? true);
  el('bolt').disabled = blocked || p.bolts < 1;
  el('ball').disabled = blocked || p.fireballs < 1;
  el('bribe').disabled = !fighting || !f.spec.bribe || f.bribeAttempted ||
    p.gold < f.spec.bribe * (f.spec.bribeEach ? targets.length : 1);
  el('antidote').disabled = !fighting || !f.poisoned || p.antidotes < 1;
  el('aardvark-button').disabled = !fighting || !f.spec.ants || !p.aardvark;
  el('djinn').disabled = !fighting || f.spec.dream || !p.tinglering || p.djinnCalls >= 3 || f.companion?.life > 5;
  el('gnurlbash-button').disabled = !fighting || f.spec.dream || !p.gnurlbash || f.companion?.life > 5;
  el('resurrect').disabled = !f || p.life > 0 || !p.resurrection || f.spec.dream;
  el('leave-zapper').hidden = !fighting || !f.spec.oneBlow;
  el('heal').disabled = p.life <= 0 || fighting && f.spec.dream || p[el('healing').value] < 1;
  el('exchange').disabled = fighting || p.experience < 20;
  el('sleep').disabled = fighting || p.life <= 0 || d.limerick || d.dreamAgain;
  el('dream-again').hidden = !d.dreamAgain;
  el('limerick-controls').hidden = !d.limerick;
  el('wandering').disabled = fighting || p.life <= 5;
  el('status').textContent = fighting ? `${label(f.spec.section)}: ${!f.first ? tk('tie') : tk('round', { round: f.rounds + 1 }) + ' / ' + tk('first', { who: tk(f.first) })}`
    : f?.status === 'redirect' ? tk('redirect', { section: f.redirect }) : f ? `${label(f.spec.section)}: ${tk(f.status)}` : tk('pick');
  el('log').innerHTML = d.log.slice(-100).reverse().map(line => `<div>${escapeHtml(line)}</div>`).join('');
  el('history').innerHTML = d.history.slice(-50).reverse().map(row => `<div class="bsim-history-row">${escapeHtml(row.enemy)}: ${escapeHtml(tk(row.outcome))}</div>`).join('');
}
export function setSim528Visible(visible) {
  if (el('btn')) el('btn').style.display = visible ? '' : 'none';
  if (!visible) close();
}
export function initSim528() {
  if (el('overlay')) return;
  const inputs = keys => keys.map(key => `<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk(key)}</span><input id="${ID}-${key}" class="inv-edit-input inv-qty-input" type="number" min="0" step="1"></label>`).join('');
  const button = (key, labelKey = key) => `<button id="${ID}-${key}" class="inv-add-btn">${tk(labelKey)}</button>`;
  const select = (key, choices) => `<label class="inv-edit-row">${tk(key)}<select id="${ID}-${key}" class="inv-edit-input">${choices.map(choice => `<option value="${choice}">${tk(choice)}</option>`).join('')}</select></label>`;
  const overlay = document.createElement('div'); overlay.id = `${ID}-overlay`; overlay.className = 'inv-overlay';
  overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${tk('title')}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><div class="bsim-side"><div class="bsim-side-title">${tk('character')}</div>${inputs(core)}${button('new','new_character')}<details><summary>${tk('resources')}</summary>${inputs(resources)}${flags.map(key => `<label class="inv-edit-row"><input id="${ID}-${key}" type="checkbox">${tk(key)}</label>`).join('')}</details></div><div class="bsim-side"><label class="inv-edit-row">${tk('encounter')}<select id="${ID}-encounter" class="inv-edit-input">${[...GATEWAY_ENCOUNTERS,...GATEWAY_WANDERING].map(spec => `<option value="${spec.section}">${escapeHtml(label(spec.section))}</option>`).join('')}</select></label><details><summary>${tk('pre_fight')}</summary>${options.map(key => `<label class="inv-edit-row"><input id="${ID}-option-${key}" type="checkbox">${tk(['polish','lamp','weedkiller'].includes(key) ? key+'_option' : key)}</label>`).join('')}</details>${button('start')}<div id="${ID}-status" class="bsim-status"></div><label class="inv-edit-row">${tk('target')}<select id="${ID}-target" class="inv-edit-input"></select></label><div class="bsim-btn-row">${button('initiative')}${button('roll')}</div><div id="${ID}-wizard-controls">${select('wizard',wizardSpells)}${button('wizard-round','wizard_round')}</div>${select('spell',spells)}<div class="bsim-btn-row">${button('cast')}${button('bolt')}${button('ball')}${button('bribe')}</div><div class="bsim-btn-row">${button('antidote')}${button('aardvark-button','aardvark_button')}${button('djinn')}${button('gnurlbash-button','gnurlbash_button')}${button('resurrect')}${button('leave-zapper','leave_zapper')}</div>${select('healing',healing)}<div class="bsim-btn-row">${button('heal')}${button('exchange')}${button('sleep')}${button('dream-again','dream_again')}</div><div id="${ID}-limerick-controls"><p>${tk('limerick')}</p><div class="bsim-btn-row">${button('limerick-yes','limerick_yes')}${button('limerick-no','limerick_no')}</div></div><label class="inv-edit-row">${tk('level')}<select id="${ID}-level" class="inv-edit-input"><option>1</option><option>2</option><option>3</option></select></label>${button('wandering')}</div><p>${tk('note')}</p><p>${tk('manual')}</p></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${tk('history')}</summary><div id="${ID}-history" class="bsim-history-list"></div></details><div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
  document.body.appendChild(overlay);
  customSetup = createGrailOpponentSetup({document, id: ID, t, tk, encounters: GATEWAY_ENCOUNTERS,
    getRun: currentPlaythrough, getData: data});
  el('start').insertAdjacentHTML('beforebegin', button('friendly'));
  el('new').insertAdjacentHTML('afterend', `<details><summary>${tk('spell_uses')}</summary>${spells.map(spell => `<label class="inv-edit-row"><span>${tk(spell)}</span><input id="${ID}-uses-${spell}" class="inv-edit-input inv-qty-input" type="number" min="0" max="3" step="1"></label>`).join('')}</details>`);
  const btn = document.createElement('button'); btn.id = `${ID}-btn`; btn.innerHTML = shortcutLabel(t('battlesim.title')); btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn); btn.addEventListener('click', open); el('close').addEventListener('click', close);
  let backdrop = false;
  overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
  overlay.addEventListener('click', event => { if (event.target === overlay && backdrop) close(); });
  registerPanelShortcut('KeyS', { getButton: () => btn, getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== `${ID}-overlay`), open, close });
  el('start').addEventListener('click', start);
  el('healing').addEventListener('change', renderSim528);
  el('spell').addEventListener('change', renderSim528);
  el('wizard').addEventListener('change', renderSim528);
  el('friendly').addEventListener('click', () => action(d => {
    if (active(d) || character(d).life <= 0) return;
    const result = rules.gatewayFriendlyReaction();
    d.log.push(tk(result.friendly ? 'friendly_yes' : 'friendly_no', result));
  }));
  for (const spell of spells) el(`uses-${spell}`).addEventListener('change', () => action(d => {
    if (active(d)) return;
    const input = el(`uses-${spell}`), value = Number(input.value);
    if (!input.value.trim() || !Number.isSafeInteger(value) || value < 0 || value > 3) {
      showAlert(tk('invalid')); return;
    }
    character(d).spellUses[spell] = value;
  }));
  el('new').addEventListener('click', () => confirm(tk('new_confirm'), d => {
    record(d, true);
    const permanent = Math.min(10, character(d).permanent), stats = rules.initialGatewayStats(permanent);
    d.player = { ...rules.createGatewayCharacter(), permanent, life: stats.life, maxLife: stats.life,
      speed: stats.speed, gold: stats.gold }; d.fight = null; d.limerick = d.dreamAgain = false;
  }));
  for (const key of [...core,...resources]) el(key).addEventListener('change', () => action(d => {
    if (active(d)) return;
    const p = character(d), value = Number(el(key).value);
    if (!el(key).value.trim() || !Number.isSafeInteger(value) || value < 0
      || key === 'hit' && (value < 2 || value > 12) || key === 'life' && value > p.maxLife
      || key === 'maxLife' && value < p.life) { showAlert(tk('invalid')); el(key).value = p[key]; return; }
    p[key] = value;
  }));
  for (const key of flags) el(key).addEventListener('change', () => action(d => {
    if (!active(d)) character(d)[key] = el(key).checked;
  }));
  el('initiative').addEventListener('click', () => action(d => { if (d.fight) rules.rerollGatewayInitiative(d.fight); }));
  el('roll').addEventListener('click', () => action(d => {
    if (d.fight) logEvents(d, rules.rollGatewayRound(d.fight, Number(el('target').value)));
  }));
  el('wizard-round').addEventListener('click', () => action(d => {
    if (d.fight) logEvents(d, rules.rollGatewayWizardRound(d.fight, el('wizard').value));
  }));
  el('cast').addEventListener('click', () => action(d => {
    if (!d.fight) return;
    const result = rules.castGatewaySpell(d.fight, el('spell').value, Number(el('target').value));
    if (result) d.log.push(tk('spell_result', { ...result, spell: tk(result.spell),
      roll: result.roll ?? '-', result: tk(result.success ? 'success' : 'failed') }));
  }));
  for (const [key,kind] of [['bolt','bolts'],['ball','fireballs']]) el(key).addEventListener('click', () => action(d => {
    if (!d.fight) return;
    const result = rules.launchGatewayMagic(d.fight, kind, Number(el('target').value));
    if (result) d.log.push(tk('magic_result', result));
  }));
  el('heal').addEventListener('click', () => action(d => {
    if (active(d) && d.fight.spec.dream) return;
    const result = rules.useGatewayHealing(character(d), el('healing').value);
    if (result) d.log.push(tk('heal_result', result));
  }));
  el('exchange').addEventListener('click', () => action(d => { if (!active(d)) rules.exchangeGatewayExperience(character(d)); }));
  el('antidote').addEventListener('click', () => action(d => { if (d.fight) logEvents(d, rules.useGatewayAntidote(d.fight)); }));
  el('aardvark-button').addEventListener('click', () => action(d => { if (d.fight) rules.useGatewayAardvark(d.fight); }));
  el('djinn').addEventListener('click', () => action(d => { if (d.fight) rules.callGatewayDjinn(d.fight); }));
  el('gnurlbash-button').addEventListener('click', () => action(d => { if (d.fight) rules.callGatewayGnurlbash(d.fight); }));
  el('leave-zapper').addEventListener('click', () => action(d => { if (d.fight) rules.leaveGatewayZapper(d.fight); }));
  el('bribe').addEventListener('click', () => action(d => {
    if (!d.fight) return;
    const result = rules.gatewayBribe(d.fight);
    if (result) d.log.push(tk('bribe_result', { ...result, result: tk(result.success ? 'success' : 'failed') }));
  }));
  el('resurrect').addEventListener('click', () => action(d => {
    if (!d.fight) return;
    const result = rules.resurrectGatewayPlayer(d.fight);
    if (result) d.log.push(tk('resurrection_result', { ...result, result: tk(result.success ? 'success' : 'failed') }));
  }));
  el('sleep').addEventListener('click', () => action(d => {
    if (!active(d)) dreamResult(d, rules.gatewaySleep(character(d), currentPlaythrough()?.path?.at(-1) ?? d.fight?.spec.section ?? 1));
  }));
  el('dream-again').addEventListener('click', () => action(d => {
    if (d.dreamAgain) dreamResult(d, rules.gatewayDream(character(d),
      2 + Math.floor(Math.random()*6) + Math.floor(Math.random()*6),
      { section: currentPlaythrough()?.path?.at(-1) ?? d.fight?.spec.section ?? 1 }));
  }));
  for (const [key,success] of [['limerick-yes',true],['limerick-no',false]]) el(key).addEventListener('click', () => action(d => {
    if (!d.limerick) return;
    rules.resolveGatewayLimerick(character(d), success); d.limerick = false;
  }));
  el('wandering').addEventListener('click', () => action(d => {
    if (active(d)) return;
    const result = rules.gatewayWandering(character(d), Number(el('level').value));
    if (!result) return;
    record(d, true); d.player = result.player ?? result.fight.player; d.fight = result.fight ?? null;
    if (!result.fight) d.log.push(tk('trap_result', { roll: result.roll, damage: result.damage }));
  }));
}

export { initSim528 as init, renderSim528 as render, setSim528Visible as setVisible };
