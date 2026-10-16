import { definition, ENCOUNTERS, ENEMY_NAMES, encounterFor } from './definition.js';
import * as combat from './combat.js';
import * as effects from './effects.js';
import { createState } from './state.js';
import { createOpponentEditor } from '../../opponents.js';
import { currentBookId, currentPlaythrough, saveState } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';

const ID = definition.stateKey;
const SCORES = ['skill', 'stamina', 'luck'];
const FIELDS = [...SCORES, ...SCORES.map(key => key + 'Initial'), 'provisions', 'potionUses', 'attackModifier'];
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const active = fight => Boolean(fight && (!fight.outcome || fight.outcome === 'continue'));
const named = enemies => enemies.map(enemy => ({ ...enemy, displayName: enemy.displayName || ENEMY_NAMES[enemy.key] || '' }));

export function createDungeonPanel({ document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, registerShortcut = () => {} }) {
  const tk = (key, params) => t(definition.i18nPrefix + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({ currentBookId: getBookId(), currentPlaythrough: getRun, saveState }));
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const input = key => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${key === 'attackModifier' ? -1000 : key.endsWith('Initial') ? 1 : 0}" max="10000" step="1" required></label>`;
  let shownRun, rendered, editor, editorRun;
  const selected = () => encounterFor(el('encounter').value);
  const entryLabel = entry => tk('encounter.' + entry.key) + ` (${entry.section})`;
  const enemyLabel = enemy => enemy.displayName || ENEMY_NAMES[enemy.key] || tk('opponent');
  function close() { el('overlay')?.classList.remove('active'); rendered = null; }
  function change(update) {
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) { close(); return; }
    try { if (store.change(update)) render(true); }
    catch { showAlert(tk('invalid')); }
  }
  function confirmed(key, update) {
    const run = getRun(), before = store.read();
    showConfirm(tk(key), () => { if (getRun() === run && store.read() === before) change(update); });
  }
  function number(key) {
    const field = el(key);
    if (!field.value.trim()) throw new RangeError('Missing number');
    return combat.integer(Number(field.value), key === 'attackModifier' ? -1000 : 0);
  }
  function eventText(event, fight) {
    if (event.kind === 'attack') return tk('event.attack', { enemy: enemyLabel(fight.enemies[event.enemy]),
      player: event.playerAttack, enemyAttack: event.enemyAttack });
    if (event.kind === 'luck') return tk('event.luck', { roll: event.roll, result: tk(event.lucky ? 'lucky' : 'unlucky') });
    return tk('event.' + event.kind, { damage: event.damage, enemy: event.enemy == null ? '' : enemyLabel(fight.enemies[event.enemy]) });
  }
  function updateFight(data, fight) {
    data.fight = fight;
    data.log.push(...fight.events.map(event => eventText(event, fight)));
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id) { close(); return; }
    const data = store.read();
    if (!data || !force && rendered === data) return;
    rendered = data;
    const fight = data.fight, locked = active(fight), character = data.character, alive = Boolean(character?.stamina && !character.dead);
    if (editorRun !== getRun()) {
      editorRun = getRun();
      el('encounter').value = data.setup?.section ?? '0';
      editor.set(data.setup?.opponents ?? [{ displayName: '', skill: 7, stamina: 7 }]);
      el('applyEntry').checked = data.setup?.applyEntry ?? true;
    }
    editor.lock(locked); editor.fixCount(Boolean(selected()));
    for (const key of FIELDS) { el(key).value = character?.[key] ?? ''; el(key).disabled = locked; }
    el('potion').value = character?.potion ?? 'skill';
    for (const key of ['potion', 'encounter', 'applyEntry', 'newCharacter', 'saveCharacter']) el(key).disabled = locked;
    el('start').disabled = locked || !alive;
    el('cancel').disabled = !locked;
    el('eat').disabled = locked || !alive || !character.provisions || character.stamina >= character.staminaInitial;
    el('drinkPotion').disabled = locked || !alive || !character.potionUses;
    el('testLuck').disabled = locked || !alive;
    const indices = combat.targets(fight);
    el('target').innerHTML = indices.map(index => `<option value="${index}">${escape(fight.config.mode === 'two-claws' ? tk('claw', { n: index + 1 }) : enemyLabel(fight.enemies[index]))}</option>`).join('');
    el('target').disabled = !indices.length || Boolean(fight?.pending.length);
    el('round').disabled = !indices.length || Boolean(fight?.pending.length);
    const pending = fight?.pending[0];
    el('useLuck').disabled = !pending || Boolean(fight.outcome);
    el('skipLuck').disabled = !pending || pending.kind === 'weakPoint' || Boolean(fight.outcome);
    el('escapeFight').disabled = !combat.canEscape(fight);
    el('continueFight').hidden = fight?.outcome !== 'continue';
    el('status').textContent = tk('status.' + (fight?.outcome ?? (fight ? 'active' : 'ready')));
    el('destination').textContent = fight?.destination ? tk('destination', { section: fight.destination }) : '';
    el('pending').textContent = pending ? tk(pending.kind === 'weakPoint' ? 'mandatoryLuck' : 'optionalLuck') : '';
    el('opponents').textContent = fight ? fight.enemies.map(enemy => tk('enemyLine', { name: enemyLabel(enemy), stamina: enemy.stamina, skill: enemy.skill })).join('\n') : '';
    el('log').innerHTML = data.log.slice(-80).map(line => '<div>' + escape(line) + '</div>').join('');
    el('history').innerHTML = data.history.slice(-40).reverse().map(row => '<div>' + escape(row.enemy + ': ' + tk('status.' + row.outcome)) + '</div>').join('');
    el('encounterNote').textContent = selected() ? tk('note.' + (selected().weakPoint ? 'weakPoint' : selected().mode === 'two-claws' ? 'scorpion' : 'preset')) : tk('note.custom');
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    shownRun = getRun(); editorRun = null;
    try { if (!store.read()) store.change(() => {}); el('overlay').classList.add('active'); render(true); el('close').focus(); }
    catch { close(); showAlert(tk('invalid')); }
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-side"><div class="bsim-side-title">${escape(tk('character'))}</div>${SCORES.map(input).join('')}<details><summary>${escape(tk('initialScores'))}</summary>${SCORES.map(key => input(key + 'Initial')).join('')}</details>${['provisions', 'potionUses', 'attackModifier'].map(input).join('')}<label class="inv-edit-row"><span>${escape(tk('potion'))}</span><select class="inv-edit-input" id="${ID}-potion">${['skill', 'strength', 'fortune'].map(key => `<option value="${key}">${escape(tk('potion.' + key))}</option>`).join('')}</select></label><div class="bsim-btn-row">${button('newCharacter')}${button('saveCharacter')}</div><div class="bsim-btn-row">${button('eat')}${button('drinkPotion')}${button('testLuck')}</div></div><label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter"><option value="0">${escape(tk('custom'))}</option>${ENCOUNTERS.map(entry => `<option value="${entry.section}">${escape(entryLabel(entry))}</option>`).join('')}</select></label><div id="${ID}-editor"></div><label class="bsim-checkbox"><input type="checkbox" id="${ID}-applyEntry" checked>${escape(tk('applyEntry'))}</label><p id="${ID}-encounterNote"></p><div class="bsim-btn-row">${button('start')}${button('cancel')}</div><label class="inv-edit-row"><span>${escape(tk('target'))}</span><select class="inv-edit-input" id="${ID}-target"></select></label><div class="bsim-btn-row">${button('round')}${button('escapeFight')}</div><p id="${ID}-pending"></p><div class="bsim-btn-row">${button('useLuck')}${button('skipLuck')}${button('continueFight')}</div></div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-destination"></p><div class="bsim-status" id="${ID}-opponents"></div><div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({ document, id: ID, t, language: 'bg',
      fields: [{ key: 'skill', label: tk('skill'), max: 10000 }, { key: 'stamina', label: tk('stamina'), min: 1, max: 10000 }],
      presets: ENCOUNTERS.flatMap(entry => named(entry.enemies)), onSelect: () => saveSetup() });
    el('editor').appendChild(editor.element);
    function saveSetup() {
      if (getRun() !== shownRun || Number(getBookId()) !== definition.id || active(store.read()?.fight)) return;
      store.change(data => { data.setup = { section: Number(el('encounter').value), opponents: editor.snapshot(), applyEntry: el('applyEntry').checked }; });
    }
    el('encounter').addEventListener('change', () => {
      if (active(store.read()?.fight)) return;
      editor.set(selected() ? named(selected().enemies) : [{ displayName: '', skill: 7, stamina: 7 }]);
      saveSetup(); render(true);
    });
    editor.element.addEventListener('input', saveSetup); editor.element.addEventListener('change', saveSetup);
    el('applyEntry').addEventListener('change', saveSetup);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    el('newCharacter').addEventListener('click', () => {
      const update = data => { data.character = combat.newCharacter(); data.fight = null; data.log = []; };
      if (store.read()?.character) confirmed('newCharacterConfirm', update); else change(update);
    });
    el('saveCharacter').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      const character = Object.fromEntries(FIELDS.map(key => [key, number(key)])); character.potion = el('potion').value;
      character.dead = character.stamina === 0;
      combat.validateCharacter(character); data.character = character; data.fight = null;
    }));
    el('start').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      const section = Number(el('encounter').value), opponents = editor.read();
      data.setup = { section, opponents: editor.snapshot(), applyEntry: el('applyEntry').checked };
      const fight = combat.startFight(section, data.character, { opponents, applyEntry: el('applyEntry').checked });
      data.encounterName = selected() ? entryLabel(selected()) : opponents.map(enemy => enemy.displayName || tk('opponent')).join(' / ');
      updateFight(data, fight);
    }));
    el('round').addEventListener('click', () => change(data => updateFight(data, combat.round(data.fight, Number(el('target').value)))));
    el('useLuck').addEventListener('click', () => change(data => updateFight(data, combat.resolveLuck(data.fight, true))));
    el('skipLuck').addEventListener('click', () => change(data => updateFight(data, combat.resolveLuck(data.fight, false))));
    el('escapeFight').addEventListener('click', () => change(data => updateFight(data, combat.escapeFight(data.fight))));
    el('continueFight').addEventListener('click', () => change(data => updateFight(data, combat.continueWeakPoint(data.fight))));
    el('cancel').addEventListener('click', () => confirmed('cancelConfirm', data => {
      if (active(data.fight)) data.fight = { ...data.fight, outcome: 'cancelled', pending: [], events: [], destination: null };
    }));
    for (const [key, effect] of [['eat', effects.eat], ['drinkPotion', effects.drinkPotion]]) {
      el(key).addEventListener('click', () => change(data => { if (active(data.fight)) throw new RangeError('Fight active'); data.character = effect(data.character); }));
    }
    el('testLuck').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      const result = combat.testLuck(data.character); data.character = result.character;
      data.log.push(tk('event.luck', { roll: result.roll, result: tk(result.lucky ? 'lucky' : 'unlucky') }));
    }));
    registerShortcut({ button: trigger, overlay, open, close });
  }
  return { init, render, open, close, setVisible(visible) { if (el('btn')) el('btn').style.display = visible ? '' : 'none'; if (!visible) { close(); shownRun = null; } } };
}

const panel = createDungeonPanel({ document, t, getRun: currentPlaythrough, getBookId: () => currentBookId, saveState,
  showAlert, showConfirm, getButtonRow: getPlayBtnRow, registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', { getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  } });
export function initSim769() { panel.init(); }
export function renderSim769() { panel.render(); }
export function setSim769Visible(visible) { panel.setVisible(visible); }
export { initSim769 as init, renderSim769 as render, setSim769Visible as setVisible };
