import { definition, ENCOUNTERS, DIFFICULTIES, encounterPreset } from './definition.js';
import * as combat from './combat.js';
import { createState } from './state.js';
import { createOpponentEditor } from '../../opponents.js';
import { currentBookId, currentPlaythrough, saveState } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';

const ID = definition.stateKey;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const active = fight => Boolean(fight && !fight.outcome);
const fields = ['life', 'shots', 'grenades', 'bazookas', 'medkits'];

export function createAreaPanel({document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, registerShortcut = () => {}}) {
  const tk = (key, values) => t(definition.i18nPrefix + '.' + key, values);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId: getBookId(), currentPlaythrough: getRun, saveState}));
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const number = (key, min, max) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" type="number" min="${min}" max="${max}" step="1" id="${ID}-${key}" required></label>`;
  const check = key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  const select = (key, values) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><select class="inv-edit-input" id="${ID}-${key}">${values.map(([value, label]) => `<option value="${value}">${escape(label)}</option>`).join('')}</select></label>`;
  let shownRun, editor, editorRun, rendered, characterStamp;
  function close() { el('overlay')?.classList.remove('active'); rendered = null; }
  function change(update) {
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) { close(); return; }
    try { if (store.change(update)) render(true); } catch { showAlert(tk('invalid')); }
  }
  function confirmed(key, update) {
    const run = getRun(), before = store.read();
    showConfirm(tk(key), () => { if (getRun() === run && store.read() === before) change(update); });
  }
  function numeric(key) {
    if (!el(key).value.trim()) throw new RangeError('Missing value');
    return Number(el(key).value);
  }
  function readCharacter() {
    return combat.validateCharacter({...Object.fromEntries(fields.map(key => [key, numeric(key)])), blaster: el('blaster').checked});
  }
  function saveOpponent() {
    if (!active(store.read()?.fight)) change(data => {
      data.opponents = editor.snapshot(); data.section = el('encounter').value; data.difficulty = el('difficulty').value;
    });
  }
  function updateFight(data, fight) {
    data.fight = fight;
    for (const event of fight.events) {
      data.log.push(tk('event.' + event.kind, {...event, weapon: event.weapon ? tk(event.weapon) : '',
        die: event.die ?? '—', destination: event.destination ?? '—'}));
    }
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id) { close(); return; }
    const data = store.read();
    if (!data || !force && rendered === data) return;
    rendered = data;
    const fight = data.fight, locked = active(fight), character = data.character;
    if (editorRun !== getRun()) {
      editorRun = getRun(); characterStamp = null;
      el('difficulty').value = data.difficulty ?? 'easy';
      el('encounter').value = data.section ?? '3';
      editor.set(data.opponents ?? [encounterPreset(el('encounter').value, el('difficulty').value)]);
    }
    editor.lock(locked); editor.fixCount(true);
    const stamp = JSON.stringify(character);
    if (characterStamp !== stamp || locked) {
      characterStamp = stamp;
      for (const key of fields) el(key).value = character[key];
      el('blaster').checked = character.blaster;
    }
    for (const key of [...fields, 'blaster', 'encounter', 'difficulty', 'newCharacter', 'saveCharacter']) el(key).disabled = locked;
    el('start').disabled = locked;
    el('heal').disabled = locked || !character.medkits || character.life <= 0 || character.life >= 10;
    el('cancel').disabled = !locked;
    el('die').disabled = !locked || !el('manual').checked;
    el('melee').disabled = !locked;
    el('blasterAttack').disabled = !locked || fight.encounter.meleeOnly || !character.blaster;
    el('grenade').disabled = !locked || fight.encounter.meleeOnly || !character.grenades;
    el('bazooka').disabled = !locked || fight.encounter.meleeOnly || !character.bazookas;
    el('status').textContent = tk('status.' + (fight?.outcome ?? (fight ? 'active' : 'ready')));
    el('totals').textContent = fight ? tk('totals', {life: character.life, shots: character.shots, remaining: fight.remaining}) : '';
    el('destination').textContent = fight?.destination ? tk('destination', {section: fight.destination}) : '';
    el('warning').textContent = fight?.encounter.hostage ? tk(fight.usedExplosives ? 'hostageLost' : 'hostageWarning') : fight?.encounter.meleeOnly ? tk('labWarning') : '';
    el('log').innerHTML = data.log.slice(-80).map(line => '<div>' + escape(line) + '</div>').join('');
    el('history').innerHTML = data.history.slice(-40).reverse().map(row => '<div>' + escape(row.enemy + ': ' + tk('status.' + row.outcome)) + '</div>').join('');
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    shownRun = getRun(); editorRun = null;
    try {
      if (!store.read()) store.change(data => { data.character = combat.newCharacter(); });
      el('overlay').classList.add('active'); render(true); el('close').focus();
    } catch { close(); showAlert(tk('invalid')); }
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-side"><div class="bsim-side-title">${escape(tk('character'))}</div>${number('life', 0, 10)}${check('blaster')}${number('shots', 0, 10)}${number('grenades', 0, 4)}${number('bazookas', 0, 2)}${number('medkits', 0, 1)}<div class="bsim-btn-row">${button('newCharacter')}${button('saveCharacter')}${button('heal')}</div></div>${select('difficulty', DIFFICULTIES.map(value => [value, tk('difficulty.' + value)]))}${select('encounter', ENCOUNTERS.map(row => [row.section, row.displayName]))}<div id="${ID}-editor"></div><p>${escape(tk('combatNote'))}</p><div class="bsim-btn-row">${button('start')}${button('blasterAttack')}${button('melee')}${button('grenade')}${button('bazooka')}${button('cancel')}</div>${check('manual')}${number('die', 1, 6)}</div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-totals"></p><p id="${ID}-destination"></p><p id="${ID}-warning"></p><div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({document, id: ID, t, language: 'bg', fields: [
      {key: 'count', label: tk('count'), min: 1, max: 1000},
    ], presets: ENCOUNTERS, onSelect(opponent) {
      el('encounter').value = opponent.section;
      editor.set([encounterPreset(opponent.section, el('difficulty').value)]); saveOpponent();
    }});
    el('editor').appendChild(editor.element);
    editor.element.addEventListener('input', saveOpponent); editor.element.addEventListener('change', saveOpponent);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open); el('die').value = 1;
    el('manual').addEventListener('change', () => render(true));
    for (const key of ['encounter', 'difficulty']) el(key).addEventListener('change', () => {
      if (active(store.read()?.fight)) return;
      editor.set([encounterPreset(el('encounter').value, el('difficulty').value)]);
      change(data => { data.difficulty = el('difficulty').value; data.section = el('encounter').value; data.opponents = editor.snapshot(); });
    });
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); close(); } });
    el('newCharacter').addEventListener('click', () => confirmed('newCharacterConfirm', data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = combat.newCharacter(); data.fight = null; data.log = [];
    }));
    el('saveCharacter').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = readCharacter(); data.fight = null;
    }));
    el('heal').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = combat.useMedkit(readCharacter()); data.fight = null;
    }));
    el('start').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = readCharacter(); data.opponents = editor.snapshot(); data.section = el('encounter').value; data.difficulty = el('difficulty').value;
      updateFight(data, combat.startFight(data.character, editor.read()[0], numeric('encounter'), data.difficulty));
    }));
    for (const [key, weapon] of [['blasterAttack', 'blaster'], ['melee', 'melee'], ['grenade', 'grenade'], ['bazooka', 'bazooka']]) {
      el(key).addEventListener('click', () => change(data => updateFight(data, combat.attack(data.fight, weapon,
        el('manual').checked ? numeric('die') : combat.rollDie()))));
    }
    el('cancel').addEventListener('click', () => confirmed('cancelConfirm', data => updateFight(data, combat.cancelFight(data.fight))));
    registerShortcut({button: trigger, overlay, open, close});
  }
  return {init, render, open, close, setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) { close(); shownRun = null; }
  }};
}

const panel = createAreaPanel({document, t, getRun: currentPlaythrough, getBookId: () => currentBookId, saveState,
  showAlert, showConfirm, getButtonRow: getPlayBtnRow, registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export function initSim817() { panel.init(); }
export function renderSim817() { panel.render(); }
export function setSim817Visible(visible) { panel.setVisible(visible); }
export { initSim817 as init, renderSim817 as render, setSim817Visible as setVisible };
