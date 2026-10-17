import { definition, ENCOUNTERS } from './definition.js';
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

export function createForestPanel({document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, registerShortcut = () => {}}) {
  const tk = (key, values) => t(definition.i18nPrefix + '.' + key, values);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId: getBookId(), currentPlaythrough: getRun, saveState}));
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const number = (key, min, max) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" type="number" min="${min}" max="${max}" step="1" id="${ID}-${key}" required></label>`;
  const check = key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  const select = (key, values) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><select class="inv-edit-input" id="${ID}-${key}">${values.map(([value, label]) => `<option value="${value}">${escape(label)}</option>`).join('')}</select></label>`;
  let shownRun, editor, editorRun, rendered, characterRun, characterStamp;
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
    const character = {...store.read().character};
    for (const key of ['attack', 'defence', 'life', 'maximum', 'items']) character[key] = numeric(key);
    for (const key of ['axe', 'shield', 'helmet', 'ring']) character[key] = el(key).checked;
    return combat.validateCharacter(character);
  }
  function saveOpponent() {
    if (!active(store.read()?.fight)) change(data => { data.opponents = editor.snapshot(); });
  }
  function updateFight(data, fight) {
    data.fight = fight;
    for (const event of fight.events) data.log.push(tk('event.' + event.kind, {...event, destination: event.destination ?? '—'}));
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id) { close(); return; }
    const data = store.read();
    if (!data || !force && rendered === data) return;
    rendered = data;
    const fight = data.fight, locked = active(fight), character = data.character;
    if (editorRun !== getRun()) { editorRun = getRun(); editor.set(data.opponents ?? [ENCOUNTERS[0]]); }
    editor.lock(locked); editor.fixCount(true);
    const stamp = JSON.stringify(character);
    if (characterRun !== getRun() || characterStamp !== stamp || locked) {
      characterRun = getRun(); characterStamp = stamp;
      for (const key of ['attack', 'defence', 'life', 'maximum', 'items']) el(key).value = character[key];
      for (const key of ['axe', 'shield', 'helmet', 'ring']) el(key).checked = character[key];
    }
    for (const key of ['attack', 'defence', 'life', 'maximum', 'items', 'axe', 'shield', 'helmet', 'ring', 'encounter', 'mode', 'matchLife', 'newCharacter', 'saveCharacter']) el(key).disabled = locked;
    el('start').disabled = locked;
    el('turn').disabled = !locked || fight.mode !== 'player';
    el('reader').disabled = !locked || fight.mode !== 'reader';
    el('cancel').disabled = !locked;
    for (const key of ['attackDie', 'defenceDie']) el(key).disabled = !locked || fight.mode !== 'player' || !el('manual').checked;
    el('status').textContent = tk('status.' + (fight?.outcome ?? (fight ? 'active' : 'ready')));
    el('phase').textContent = locked ? tk('phase.' + fight.phase) : '';
    el('destination').textContent = fight?.destination ? tk('destination', {section: fight.destination}) : fight?.encounter.unarmed && ['win', 'loss'].includes(fight.outcome) ? tk(fight.outcome === 'win' ? 'romirWin' : fight.mode === 'reader' ? 'romirReaderLoss' : 'romirLoss') : '';
    el('totals').textContent = fight ? tk('totals', {player: character.life, enemy: fight.enemy.life,
      attack: fight.ratings.attack, defence: fight.ratings.defence, turns: fight.turns}) : '';
    el('log').innerHTML = data.log.slice(-80).map(line => '<div>' + escape(line) + '</div>').join('');
    el('history').innerHTML = data.history.slice(-40).reverse().map(row => '<div>' + escape(row.enemy + ': ' + tk('status.' + row.outcome)) + '</div>').join('');
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    shownRun = getRun(); editorRun = null; characterRun = null;
    try {
      if (!store.read()) store.change(data => { data.character = combat.newCharacter(); });
      el('overlay').classList.add('active'); render(true); el('close').focus();
    } catch { close(); showAlert(tk('invalid')); }
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-side"><div class="bsim-side-title">${escape(tk('character'))}</div>${number('attack', 0, 1000)}${number('defence', 0, 1000)}${number('life', 0, 10000)}${number('maximum', 1, 10000)}${number('items', 0, 1000)}${check('axe')}${check('shield')}${check('helmet')}${check('ring')}<div class="bsim-btn-row">${button('newCharacter')}${button('saveCharacter')}</div></div>${select('mode', [['player', tk('mode.player')], ['reader', tk('mode.reader')]])}${select('encounter', ENCOUNTERS.map(row => [row.section, tk('encounter.' + row.section)]))}${check('matchLife')}<div id="${ID}-editor"></div><p>${escape(tk('combatNote'))}</p><div class="bsim-btn-row">${button('start')}${button('turn')}${button('reader')}${button('cancel')}</div>${check('manual')}${number('attackDie', 1, 6)}${number('defenceDie', 1, 6)}</div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-phase"></p><p id="${ID}-destination"></p><p id="${ID}-totals"></p><div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    el('matchLife').checked = true;
    editor = createOpponentEditor({document, id: ID, t, language: 'bg', fields: [
      {key: 'attack', label: tk('enemyAttack'), min: 0, max: 1000},
      {key: 'defence', label: tk('enemyDefence'), min: 0, max: 1000},
      {key: 'life', label: tk('life'), min: 1, max: 10000},
    ], presets: ENCOUNTERS, onSelect(opponent) {
      el('encounter').value = opponent.section; saveOpponent();
    }});
    el('editor').appendChild(editor.element);
    editor.element.addEventListener('input', saveOpponent); editor.element.addEventListener('change', saveOpponent);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    el('attackDie').value = 1; el('defenceDie').value = 1;
    for (const key of ['manual', 'matchLife']) el(key).addEventListener('change', () => render(true));
    el('encounter').addEventListener('change', () => {
      if (active(store.read()?.fight)) return;
      editor.set([ENCOUNTERS.find(row => row.section === Number(el('encounter').value))]);
      saveOpponent(); render(true);
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
      data.character = readCharacter(); data.opponents = editor.snapshot();
      updateFight(data, combat.startFight(data.character, editor.read()[0], numeric('encounter'), el('mode').value, el('matchLife').checked));
    }));
    el('turn').addEventListener('click', () => change(data => updateFight(data,
      combat.turn(data.fight, el('manual').checked ? numeric('attackDie') : combat.rollDie(), el('manual').checked ? numeric('defenceDie') : combat.rollDie()))));
    el('reader').addEventListener('click', () => change(data => updateFight(data, combat.resolveReader(data.fight))));
    el('cancel').addEventListener('click', () => confirmed('cancelConfirm', data => updateFight(data, combat.cancelFight(data.fight))));
    registerShortcut({button: trigger, overlay, open, close});
  }
  return {init, render, open, close, setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) { close(); shownRun = null; }
  }};
}

const panel = createForestPanel({document, t, getRun: currentPlaythrough, getBookId: () => currentBookId, saveState,
  showAlert, showConfirm, getButtonRow: getPlayBtnRow, registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export function initSim812() { panel.init(); }
export function renderSim812() { panel.render(); }
export function setSim812Visible(visible) { panel.setVisible(visible); }
export { initSim812 as init, renderSim812 as render, setSim812Visible as setVisible };
