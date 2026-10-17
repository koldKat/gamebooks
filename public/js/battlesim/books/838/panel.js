import { definition, ENCOUNTERS, ENEMIES, MODES, encounterPreset } from './definition.js';
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
const fields = ['life', 'agility', 'gold'];
const dice = ['one', 'two', 'damage'];
const active = fight => Boolean(fight && !fight.outcome);

export function createIslandPanel({document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, registerShortcut = () => {}}) {
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
      const key = event.kind === 'win' && !event.destination ? 'customWin' : event.kind;
      data.log.push(tk('event.' + key, {...event, extra: event.extra ? tk('extraDie', {die: event.extra}) : ''}));
    }
  }
  function defaults(mode) {
    if (mode === 'pirates') return [{...ENEMIES[1]}, {...ENEMIES[2]}];
    if (mode === 'dogs') return Array.from({length: 3}, () => ({...ENEMIES[7]}));
    return [{displayName: tk('customOpponent'), hp: mode === 'octopus' ? 15 : 12}];
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
      el('mode').value = data.mode ?? 'duel';
      el('hitAt').value = data.hitAt ?? 7;
      editor.set(data.opponents ?? defaults('duel'));
    }
    const mode = locked ? fight.mode : el('mode').value;
    editor.lock(locked); editor.fixCount(Boolean(data.section) || mode === 'pirates');
    const stamp = JSON.stringify(character);
    if (characterStamp !== stamp || locked) {
      characterStamp = stamp;
      for (const key of fields) el(key).value = character[key];
    }
    for (const key of [...fields, 'encounter', 'mode', 'hitAt', 'newCharacter', 'saveCharacter', 'start', 'agilityCheck', 'whirlpoolCheck', 'magicSail']) el(key).disabled = locked;
    el('hitRow').hidden = ['pirates', 'dogs'].includes(mode);
    el('remainingNote').hidden = Number(data.section) !== 38;
    el('combatNote').textContent = tk('note.' + mode);
    el('cancel').disabled = !locked; el('round').disabled = !locked;
    const previousTarget = el('target').value;
    el('target').innerHTML = fight ? fight.enemies.map((enemy, index) => `<option value="${index}" ${enemy.hp ? '' : 'disabled'}>${escape(enemy.name)} · ${enemy.hp}</option>`).join('') : '';
    const selected = Number(previousTarget);
    el('target').value = fight?.enemies[selected]?.hp ? String(selected) : String(fight?.enemies.findIndex(enemy => enemy.hp > 0) ?? 0);
    el('target').disabled = !locked;
    el('manualDice').hidden = !el('manual').checked;
    for (const key of dice) el('die-' + key).disabled = !el('manual').checked || key === 'damage' && (!locked || mode !== 'octopus');
    el('status').textContent = tk('status.' + (fight?.outcome ?? (fight ? 'active' : 'ready')));
    el('totals').textContent = fight ? tk('totals', {life: character.life, enemies: fight.enemies.map(enemy => enemy.name + ': ' + enemy.hp).join(' · ')}) : '';
    el('destination').textContent = fight?.destination ? tk('destination', {section: fight.destination}) : '';
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
      data.opponents = editor.snapshot(); data.section = el('encounter').value;
      data.mode = el('mode').value; data.hitAt = numeric('hitAt');
    });
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-side"><div class="bsim-side-title">${escape(tk('character'))}</div>${fields.map(key => number(key, 0, 1000000)).join('')}<div class="bsim-btn-row">${button('newCharacter')}${button('saveCharacter')}</div></div>${select('encounter', [['', tk('custom')], ...ENCOUNTERS.map(row => [row.section, row.displayName])])}${select('mode', MODES.map(mode => [mode, tk('mode.' + mode)]))}<div id="${ID}-hitRow">${number('hitAt', 2, 12)}</div><div id="${ID}-editor"></div><p id="${ID}-remainingNote">${escape(tk('remainingNote'))}</p><p id="${ID}-combatNote"></p>${select('target', [])}<div class="bsim-btn-row">${button('start')}${button('round')}${button('cancel')}</div>${check('manual')}<div id="${ID}-manualDice">${dice.map(key => number('die-' + key, 1, 6, 'die.' + key)).join('')}</div><div class="bsim-btn-row">${button('agilityCheck')}${button('whirlpoolCheck')}</div>${check('magicSail')}</div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-totals"></p><p id="${ID}-destination"></p><div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({document, id: ID, t, language: 'bg', fields: [{key: 'hp', label: tk('hp'), min: 1, max: 1000000}], presets: ENEMIES, onSelect() { saveSetup(); }});
    el('editor').appendChild(editor.element);
    editor.element.addEventListener('input', saveSetup); editor.element.addEventListener('change', saveSetup);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    for (const key of dice) el('die-' + key).value = 1;
    el('manual').addEventListener('change', () => render(true));
    el('hitAt').addEventListener('change', saveSetup);
    el('encounter').addEventListener('change', () => {
      if (active(store.read()?.fight)) return;
      if (el('encounter').value) {
        const preset = encounterPreset(el('encounter').value);
        el('mode').value = preset.mode; el('hitAt').value = preset.hitAt; editor.set(preset.enemies);
      }
      saveSetup();
    });
    el('mode').addEventListener('change', () => {
      el('encounter').value = ''; el('hitAt').value = el('mode').value === 'octopus' ? 5 : 7;
      editor.set(defaults(el('mode').value)); saveSetup();
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
    el('start').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      const preset = el('encounter').value ? encounterPreset(el('encounter').value) : null;
      data.character = readCharacter(); data.opponents = editor.snapshot(); data.section = el('encounter').value;
      data.mode = el('mode').value; data.hitAt = numeric('hitAt');
      updateFight(data, combat.startFight(data.character, editor.read(), {mode: data.mode, hitAt: data.hitAt, encounter: preset}));
    }));
    el('round').addEventListener('click', () => change(data => updateFight(data, combat.playRound(data.fight, {
      target: numeric('target'), dice: el('manual').checked ? [numeric('die-one'), numeric('die-two')] : undefined,
      damageDie: el('manual').checked && data.fight?.mode === 'octopus' ? numeric('die-damage') : undefined,
    }))));
    el('cancel').addEventListener('click', () => confirmed('cancelConfirm', data => updateFight(data, combat.cancelFight(data.fight))));
    el('agilityCheck').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = readCharacter(); data.fight = null;
      const rolls = el('manual').checked ? [numeric('die-one'), numeric('die-two')] : [combat.rollDie(), combat.rollDie()];
      const result = combat.checkAgility(data.character, rolls);
      data.log.push(tk('agilityResult', {dice: rolls.join(' + '), sum: result.sum, agility: data.character.agility, result: tk(result.success ? 'success' : 'failure')}));
    }));
    el('whirlpoolCheck').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = readCharacter(); data.fight = null;
      const value = el('manual').checked ? numeric('die-one') : combat.rollDie();
      const result = combat.checkWhirlpool(value, el('magicSail').checked);
      data.log.push(tk('whirlpoolResult', {die: value, total: result.total, section: result.destination}));
    }));
    registerShortcut({button: trigger, overlay, open, close});
  }
  return {init, render, open, close, setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) { close(); shownRun = null; }
  }};
}

const panel = createIslandPanel({document, t, getRun: currentPlaythrough, getBookId: () => currentBookId, saveState,
  showAlert, showConfirm, getButtonRow: getPlayBtnRow, registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export function initSim838() { panel.init(); }
export function renderSim838() { panel.render(); }
export function setSim838Visible(visible) { panel.setVisible(visible); }
export { initSim838 as init, renderSim838 as render, setSim838Visible as setVisible };
