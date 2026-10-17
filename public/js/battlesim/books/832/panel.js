import { definition, ENCOUNTERS, MODES, encounterPreset } from './definition.js';
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
const fields = ['speed', 'stealth', 'disguise', 'life', 'money', 'darts', 'medkits'];
const dice = ['player', 'enemy', 'enemyChoice', 'dodge', 'sphere'];
const active = fight => Boolean(fight && !fight.outcome);

export function createScarletPanel({document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, registerShortcut = () => {}}) {
  const tk = (key, values) => t(definition.i18nPrefix + '.' + key, values);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId: getBookId(), currentPlaythrough: getRun, saveState}));
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const number = (key, min, max, label = key) => `<label class="inv-edit-row"><span>${escape(tk(label))}</span><input class="inv-edit-input" type="number" min="${min}" max="${max}" step="1" id="${ID}-${key}" required></label>`;
  const check = key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  const select = (key, choices) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><select class="inv-edit-input" id="${ID}-${key}">${choices.map(([value, label]) => `<option value="${value}">${escape(label)}</option>`).join('')}</select></label>`;
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
  function readCharacter() { return combat.validateCharacter(Object.fromEntries(fields.map(key => [key, numeric(key)]))); }
  function updateFight(data, fight) {
    data.fight = fight;
    for (const event of fight.events) {
      const values = {...event, destination: event.destination ?? '', enemyChoice: event.enemyChoice ? tk('choice.' + event.enemyChoice) : '',
        dice: event.rolls ? Object.entries(event.rolls).map(([key, value]) => tk('die.' + key) + ': ' + value).join(' · ') : ''};
      data.log.push(tk('event.' + event.kind, values));
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
      el('encounter').value = data.section ?? '';
      el('mode').value = data.mode ?? 'tiger';
      editor.set(data.opponents ?? [{displayName: tk('customOpponent'), attack: 7, hp: 10}]);
    }
    editor.lock(locked); editor.fixCount(true);
    const stamp = JSON.stringify(character);
    if (characterStamp !== stamp || locked) {
      characterStamp = stamp;
      for (const key of fields) el(key).value = character[key];
    }
    for (const key of [...fields, 'encounter', 'mode', 'newCharacter', 'saveCharacter', 'start']) el(key).disabled = locked;
    el('heal').disabled = locked || !character.medkits || !character.life || character.life >= 4;
    el('cancel').disabled = !locked; el('round').disabled = !locked;
    const mode = locked ? fight.mode : el('mode').value;
    el('tigerOptions').hidden = mode !== 'tiger';
    el('duelOptions').hidden = mode !== 'persuasion';
    el('clockOptions').hidden = mode !== 'clock';
    el('skillRow').hidden = mode === 'persuasion';
    el('dart').disabled = !locked || !character.darts;
    if (!character.darts) el('dart').checked = false;
    el('work').querySelector('[value="cuckoo"]').disabled = locked && fight.mode === 'clock' && !fight.hp;
    if (locked && fight.mode === 'clock' && !fight.hp && el('work').value === 'cuckoo') el('work').value = 'gears';
    el('manualDice').hidden = !el('manual').checked;
    for (const key of dice) el('die-' + key).disabled = !locked || !el('manual').checked;
    el('status').textContent = tk('status.' + (fight?.outcome ?? (fight ? 'active' : 'ready')));
    el('totals').textContent = fight ? tk('totals', {health: fight.health, hp: fight.hp, darts: character.darts}) : '';
    el('clock').textContent = fight?.mode === 'clock' ? tk('clockTotals', {hours: fight.hours, clock: fight.hours % 12 || 12}) : '';
    el('destination').textContent = fight?.destination ? tk('destination', {section: fight.destination}) : '';
    el('combatNote').textContent = tk('note.' + mode);
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
  function saveSetup() {
    if (!active(store.read()?.fight)) change(data => {
      data.opponents = editor.snapshot(); data.section = el('encounter').value; data.mode = el('mode').value;
    });
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-side"><div class="bsim-side-title">${escape(tk('character'))}</div>${fields.map(key => number(key, 0, key === 'life' ? 4 : 1000)).join('')}<div class="bsim-btn-row">${button('newCharacter')}${button('saveCharacter')}${button('heal')}</div></div>${select('encounter', [['', tk('custom')], ...ENCOUNTERS.map(row => [row.section, row.displayName])])}${select('mode', MODES.map(mode => [mode, tk('mode.' + mode)]))}<div id="${ID}-editor"></div><p id="${ID}-combatNote"></p><div id="${ID}-skillRow">${select('skill', ['speed', 'stealth'].map(key => [key, tk(key)]))}</div><div id="${ID}-tigerOptions">${select('target', ['legs', 'body', 'head'].map(key => [key, tk('choice.' + key)]))}${select('guard', ['legs', 'body', 'head'].map(key => [key, tk('choice.' + key)]))}${check('dart')}</div><div id="${ID}-duelOptions">${select('lie', ['small', 'medium', 'large'].map(key => [key, tk('choice.' + key)]))}${select('counter', ['small', 'medium', 'large'].map(key => [key, tk('choice.' + key)]))}</div><div id="${ID}-clockOptions">${select('work', ['sphere', 'gears', 'cuckoo'].map(key => [key, tk('choice.' + key)]))}</div><div class="bsim-btn-row">${button('start')}${button('round')}${button('cancel')}</div>${check('manual')}<div id="${ID}-manualDice">${dice.map(key => number('die-' + key, 1, 6, 'die.' + key)).join('')}</div></div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-totals"></p><p id="${ID}-clock"></p><p id="${ID}-destination"></p><div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({document, id: ID, t, language: 'bg', fields: [
      {key: 'attack', label: tk('attack'), min: 0, max: 1000}, {key: 'hp', label: tk('hp'), min: 1, max: 1000},
    ], presets: ENCOUNTERS, onSelect(opponent) {
      el('encounter').value = opponent.section; el('mode').value = opponent.mode; saveSetup();
    }});
    el('editor').appendChild(editor.element);
    editor.element.addEventListener('input', saveSetup); editor.element.addEventListener('change', saveSetup);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    for (const key of dice) el('die-' + key).value = 1;
    el('manual').addEventListener('change', () => render(true));
    el('encounter').addEventListener('change', () => {
      if (active(store.read()?.fight)) return;
      if (el('encounter').value) {
        const preset = encounterPreset(el('encounter').value);
        el('mode').value = preset.mode; editor.set([preset]);
      }
      saveSetup();
    });
    el('mode').addEventListener('change', () => { el('encounter').value = ''; saveSetup(); });
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
      const preset = el('encounter').value ? encounterPreset(el('encounter').value) : null;
      data.character = readCharacter(); data.opponents = editor.snapshot(); data.section = el('encounter').value; data.mode = el('mode').value;
      updateFight(data, combat.startFight(data.character, editor.read()[0], data.mode, preset?.destination ?? null));
    }));
    el('round').addEventListener('click', () => change(data => updateFight(data, combat.playRound(data.fight,
      {skill: el('skill').value, target: el('target').value, guard: el('guard').value, dart: el('dart').checked,
        lie: el('lie').value, counter: el('counter').value, work: el('work').value},
      Object.fromEntries(dice.map(key => [key, el('manual').checked ? numeric('die-' + key) : combat.rollDie()]))))));
    el('cancel').addEventListener('click', () => confirmed('cancelConfirm', data => updateFight(data, combat.cancelFight(data.fight))));
    registerShortcut({button: trigger, overlay, open, close});
  }
  return {init, render, open, close, setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) { close(); shownRun = null; }
  }};
}

const panel = createScarletPanel({document, t, getRun: currentPlaythrough, getBookId: () => currentBookId, saveState,
  showAlert, showConfirm, getButtonRow: getPlayBtnRow, registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export function initSim832() { panel.init(); }
export function renderSim832() { panel.render(); }
export function setSim832Visible(visible) { panel.setVisible(visible); }
export { initSim832 as init, renderSim832 as render, setSim832Visible as setVisible };
