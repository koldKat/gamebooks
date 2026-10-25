import {definition, ABILITIES, ENCOUNTERS, OPPONENT_PRESETS} from './definition.js';
import * as combat from './combat.js';
import {recover} from './effects.js';
import {createState} from './state.js';
import {createOpponentEditor} from '../../opponents.js';
import {currentBookId, currentPlaythrough, saveState} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';

const ID = definition.stateKey;
const CHARACTER_FIELDS = ['skill', 'stamina', 'maxStamina', 'courage', 'luck', 'coins', 'healingUses', 'magicUses', 'invisibilityUses', 'leafUses', 'ointmentUses', 'balmUses', 'arrows'];
const RULE_NUMBERS = ['enemyDamage', 'magicDamage', 'playerDamageAdjustment', 'physicalDamage', 'archeryKills'];
const RULE_CHECKS = ['magicAllowed', 'firstWound', 'weaponProtection', 'applyInjuries', 'invisibility', 'leaf'];
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

export function createMountainOfDeathPanel({document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, registerShortcut = () => {}}) {
  const tk = (key, args) => t(definition.i18nPrefix + '.' + key, args);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId: getBookId(), currentPlaythrough: getRun, saveState}));
  const number = (key, min = 0, max = 1000000) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${min}" max="${max}" step="1"></label>`;
  const check = key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  const button = key => `<button type="button" class="bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  let editor, shownRun, rendered;
  function current() {return shownRun === getRun() && Number(getBookId()) === definition.id && el('overlay')?.classList.contains('active');}
  function close() {el('overlay')?.classList.remove('active'); rendered = null;}
  function change(update) {
    if (!current()) {close(); return;}
    try {if (store.change(update)) render(true);} catch {showAlert(tk('invalid'));}
  }
  function numeric(key) {
    const input = el(key);
    if (!input.value.trim()) throw new RangeError('Empty field');
    return combat.integer(input.value, Number(input.min), Number(input.max));
  }
  function readCharacter() {
    return combat.character({...Object.fromEntries(CHARACTER_FIELDS.map(key => [key, numeric(key)])),
      abilities: ABILITIES.filter(key => el('ability-' + key).checked), scimitar: el('scimitar').checked});
  }
  function setup() {
    return {encounterId: el('encounter').value, enemies: editor.snapshot(),
      ...Object.fromEntries(RULE_NUMBERS.map(key => [key, numeric(key)])),
      ...Object.fromEntries(RULE_CHECKS.map(key => [key, el(key).checked]))};
  }
  function restoreSetup(value) {
    const preset = ENCOUNTERS.find(row => row.id === value?.encounterId);
    el('encounter').value = preset?.id ?? '';
    editor.fixCount(Boolean(preset));
    editor.set(value?.enemies ?? [{displayName: '', skill: 7, stamina: 10}]);
    for (const key of RULE_NUMBERS) el(key).value = value?.[key] ?? ({enemyDamage: 3, magicDamage: 10, playerDamageAdjustment: 0, physicalDamage: -1, archeryKills: 0}[key]);
    for (const key of RULE_CHECKS) el(key).checked = value?.[key] ?? false;
  }
  function saveSetup() {
    if (!current() || combat.active(store.read()?.fight)) return;
    try {store.change(data => {data.setup = setup();});} catch {showAlert(tk('invalid'));}
  }
  function updateFight(data, fight) {
    data.fight = fight;
    data.character = structuredClone(fight.player);
    for (const event of fight.events) data.log.push(tk('event.' + event.kind, event));
    if (fight.outcome) data.log.push(tk(fight.finishReason === 'firstWound' ? 'firstWoundDone' : 'status.' + fight.outcome));
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (!current()) {close(); return;}
    const data = store.read();
    if (!data || !force && rendered === data) return;
    rendered = data;
    const fight = data.fight, locked = combat.active(fight), character = data.character;
    for (const key of CHARACTER_FIELDS) {el(key).value = character[key]; el(key).disabled = locked;}
    for (const key of ABILITIES) {el('ability-' + key).checked = character.abilities.includes(key); el('ability-' + key).disabled = locked;}
    el('scimitar').checked = character.scimitar;
    el('scimitar').disabled = locked;
    el('encounter').disabled = locked;
    for (const key of [...RULE_NUMBERS, ...RULE_CHECKS, 'saveCharacter', 'rollSkill', 'start']) el(key).disabled = locked;
    editor.lock(locked);
    el('round').disabled = el('abandon').disabled = !locked;
    el('magic').disabled = !locked || !fight.rules.magicAllowed || !character.abilities.includes('magic') || !character.magicUses;
    for (const effect of ['healing', 'ointment', 'balm']) {
      el(effect).disabled = !character.stamina || character.stamina >= character.maxStamina || !character[effect + 'Uses'] || effect === 'healing' && !character.abilities.includes('healing');
    }
    el('manualRolls').hidden = !el('manual').checked;
    el('archeryKills').disabled = locked || !ENCOUNTERS.find(row => row.id === el('encounter').value)?.rules.archery;
    el('status').textContent = tk('status.' + (fight?.outcome ?? (locked ? 'active' : 'ready')));
    el('totals').textContent = fight ? tk('remaining', {stamina: character.stamina, max: character.maxStamina,
      current: Math.min(fight.index + 1, fight.enemies.length), count: fight.enemies.length,
      name: fight.enemies[fight.index]?.displayName || '', hp: fight.enemies[fight.index]?.stamina ?? 0}) : '';
    el('log').textContent = data.log.slice(-80).reverse().join('\n');
    el('history').textContent = data.history.slice(-40).reverse().map(entry => entry.enemy + ': ' + tk('status.' + entry.outcome)).join('\n');
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) {showAlert(t('battlesim.no_active_playthrough')); return;}
    shownRun = getRun(); rendered = null;
    try {
      if (!store.read()) store.change(() => {});
      restoreSetup(store.read().setup);
      el('overlay').classList.add('active'); render(true); el('close').focus();
    } catch {close(); showAlert(tk('invalid'));}
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title">
      <div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div>
      <div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p>
      <details open><summary>${escape(tk('character'))}</summary>${['skill', 'stamina', 'maxStamina', 'courage', 'luck', 'coins'].map(key => number(key)).join('')}
      <div class="bsim-btn-row">${button('rollSkill')}${button('saveCharacter')}</div>
      <details><summary>${escape(tk('abilities'))}</summary>${ABILITIES.map(key => check('ability-' + key)).join('')}</details>
      <details><summary>${escape(tk('resources'))}</summary>${CHARACTER_FIELDS.slice(6).map(key => number(key)).join('')}${check('scimitar')}</details></details>
      <label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter"><option value="">${escape(tk('custom'))}</option>${ENCOUNTERS.map(row => `<option value="${row.id}">${escape(row.title)} (${row.id})</option>`).join('')}</select></label>
      <div id="${ID}-opponents"></div>
      ${number('enemyDamage', 0, 1000)}<p>${escape(tk('damageNote'))}</p>
      ${check('invisibility')}${check('leaf')}${number('archeryKills', 0, 10)}
      <details><summary>${escape(tk('rules'))}</summary>${check('applyInjuries')}<p>${escape(tk('injuryNote'))}</p>
      ${check('magicAllowed')}${check('firstWound')}${check('weaponProtection')}${number('magicDamage', 0, 1000)}${number('playerDamageAdjustment', -1000, 1000)}${number('physicalDamage', -1, 1000)}<p>${escape(tk('physicalNote'))}</p></details>
      <div class="bsim-btn-row">${button('start')}${button('round')}${button('magic')}${button('abandon')}</div>
      <div class="bsim-btn-row">${button('healing')}${button('ointment')}${button('balm')}</div>
      ${check('manual')}<div id="${ID}-manualRolls">${number('playerRoll', 1, 6)}${number('enemyRoll', 1, 6)}</div>
      </div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-totals" style="white-space:pre-line"></p><div class="bsim-log" id="${ID}-log" style="white-space:pre-line"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history" style="white-space:pre-line"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({document, id: ID, t, language: 'bg', presets: OPPONENT_PRESETS,
      fields: [{key: 'skill', label: tk('skill'), min: 0}, {key: 'stamina', label: tk('stamina'), min: 1}], onSelect: saveSetup});
    el('opponents').appendChild(editor.element);
    editor.element.addEventListener('change', saveSetup);
    for (const key of ['playerRoll', 'enemyRoll']) el(key).value = 1;
    el('manual').addEventListener('change', () => render(true));
    for (const key of [...RULE_NUMBERS, ...RULE_CHECKS]) el(key).addEventListener('change', saveSetup);
    el('encounter').addEventListener('change', () => {
      if (!current() || combat.active(store.read()?.fight)) return;
      const preset = ENCOUNTERS.find(row => row.id === el('encounter').value);
      const rules = preset?.rules ?? {};
      restoreSetup({encounterId: preset?.id, enemies: preset?.enemies,
        magicAllowed: rules.magicAllowed, firstWound: rules.firstWound, weaponProtection: rules.goldenScimitarBonusApplies === false,
        magicDamage: rules.magicDamage, playerDamageAdjustment: rules.playerDamageAdjustment,
        physicalDamage: rules.physicalPlayerDamage ?? -1});
      saveSetup(); render(true);
    });
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => {backdrop = event.target === overlay;});
    overlay.addEventListener('click', event => {if (backdrop && event.target === overlay) close();});
    overlay.addEventListener('keydown', event => {if (event.key === 'Escape' && !event.defaultPrevented) {event.stopPropagation(); close();}});
    el('saveCharacter').addEventListener('click', () => change(data => {if (combat.active(data.fight)) throw new RangeError('Fight active'); data.character = readCharacter();}));
    el('rollSkill').addEventListener('click', () => change(data => {if (combat.active(data.fight)) throw new RangeError('Fight active'); data.character = readCharacter(); data.character.skill = Math.floor(Math.random() * 6) + 6;}));
    el('start').addEventListener('click', () => change(data => {
      if (combat.active(data.fight)) throw new RangeError('Fight active');
      const selected = setup(), preset = ENCOUNTERS.find(row => row.id === selected.encounterId);
      const enemies = editor.read(), player = readCharacter();
      data.setup = selected; data.log = [];
      updateFight(data, combat.startFight(player, enemies, {...preset?.rules, ...selected,
        physicalPlayerDamage: selected.physicalDamage === -1 ? null : selected.physicalDamage,
        goldenScimitarBonusApplies: !selected.weaponProtection, archery: Boolean(preset?.rules.archery),
        name: preset?.title || enemies.map(row => row.displayName).join(', ')}));
    }));
    el('round').addEventListener('click', () => change(data => updateFight(data, combat.exchange(data.fight, {
      player: el('manual').checked ? numeric('playerRoll') : Math.floor(Math.random() * 6) + 1,
      enemy: el('manual').checked ? numeric('enemyRoll') : Math.floor(Math.random() * 6) + 1}))));
    el('magic').addEventListener('click', () => change(data => updateFight(data, combat.castMagic(data.fight))));
    for (const effect of ['healing', 'ointment', 'balm']) el(effect).addEventListener('click', () => change(data => {
      data.character = recover(data.character, effect);
      if (combat.active(data.fight)) data.fight.player = structuredClone(data.character);
      data.log.push(tk('event.recovery', {stamina: data.character.stamina}));
    }));
    el('abandon').addEventListener('click', () => {
      const run = getRun(), fight = store.read()?.fight;
      if (!combat.active(fight)) return;
      showConfirm(tk('abandonConfirm'), () => {if (getRun() === run && store.read()?.fight === fight) change(data => updateFight(data, combat.abandon(data.fight)));});
    });
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    registerShortcut({button: trigger, overlay, open, close});
  }
  return {init, open, close, render, setVisible(visible) {if (el('btn')) el('btn').style.display = visible ? '' : 'none'; if (!visible) close();}};
}

const panel = createMountainOfDeathPanel({document, t, getRun: currentPlaythrough, getBookId: () => currentBookId, saveState, showAlert, showConfirm, getButtonRow: getPlayBtnRow,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay, otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export function initSim895() {panel.init();}
export function renderSim895() {panel.render();}
export function setSim895Visible(visible) {panel.setVisible(visible);}
export { initSim895 as init, renderSim895 as render, setSim895Visible as setVisible };
