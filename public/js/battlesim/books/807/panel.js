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

export function createOutOfTimePanel({document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, registerShortcut = () => {}}) {
  const tk = (key, params) => t(definition.i18nPrefix + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId: getBookId(), currentPlaythrough: getRun, saveState}));
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  let shownRun, rendered, editor, editorRun, characterRun, characterStamp;
  function close() { el('overlay')?.classList.remove('active'); rendered = null; }
  function change(update) {
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) { close(); return; }
    try { if (store.change(update)) render(true); } catch { showAlert(tk('invalid')); }
  }
  function confirmed(key, update) {
    const run = getRun(), before = store.read();
    showConfirm(tk(key), () => { if (getRun() === run && store.read() === before) change(update); });
  }
  function saveSetup() {
    if (!active(store.read()?.fight)) change(data => { data.opponents = editor.snapshot(); });
  }
  function updateFight(data, fight) {
    data.fight = fight;
    for (const event of fight.events) data.log.push(tk('event.' + event.kind, {...event, dice: event.dice?.join(' + ')}));
  }
  function readCharacter() {
    if (!el('determination').value.trim()) throw new RangeError('Missing Determination');
    return combat.validateCharacter({determination: Number(el('determination').value), pills: el('pills').checked});
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id) { close(); return; }
    const data = store.read();
    if (!data || !force && rendered === data) return;
    rendered = data;
    const fight = data.fight, locked = active(fight), character = data.character;
    if (editorRun !== getRun()) {
      editorRun = getRun();
      editor.set(data.opponents ?? ENCOUNTERS[0].enemies);
    }
    editor.lock(locked); editor.fixCount(true);
    const stamp = JSON.stringify(character);
    if (characterRun !== getRun() || characterStamp !== stamp || locked) {
      characterRun = getRun(); characterStamp = stamp;
      el('determination').value = character?.determination ?? '';
      el('pills').checked = Boolean(character?.pills);
    }
    for (const key of ['determination', 'pills', 'newCharacter', 'saveCharacter']) el(key).disabled = locked;
    el('start').disabled = locked || !character;
    el('player').disabled = !locked || fight.phase !== 'player';
    el('reroll').disabled = !locked || fight.phase !== 'decision' || character.determination <= 0;
    el('enemy').disabled = !locked || fight.phase !== 'decision';
    el('cancel').disabled = !locked;
    el('status').textContent = tk('status.' + (fight?.outcome ?? (fight ? 'active' : 'ready')));
    el('phase').textContent = locked ? tk('phase.' + fight.phase) : '';
    el('destination').textContent = fight?.destination ? tk('destination', {section: fight.destination}) : '';
    el('totals').textContent = fight?.playerDice ? tk('totals', {
      player: fight.playerTotal, enemy: fight.enemyTotal ?? '—', rounds: fight.rounds,
    }) : '';
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
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-side"><div class="bsim-side-title">${escape(tk('character'))}</div><label class="inv-edit-row"><span>${escape(tk('determination'))}</span><input class="inv-edit-input" id="${ID}-determination" type="number" min="${Number.MIN_SAFE_INTEGER}" max="${Number.MAX_SAFE_INTEGER}" step="1" required></label><label class="bsim-checkbox"><input type="checkbox" id="${ID}-pills">${escape(tk('pills'))}</label><div class="bsim-btn-row">${button('newCharacter')}${button('saveCharacter')}</div></div><p>${escape(tk('encounter'))}</p><div id="${ID}-editor"></div><p>${escape(tk('combatNote'))}</p><div class="bsim-btn-row">${button('start')}${button('player')}${button('reroll')}${button('enemy')}${button('cancel')}</div></div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-phase"></p><p id="${ID}-destination"></p><p id="${ID}-totals"></p><div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({document, id: ID, t, language: 'bg', fields: [], presets: ENCOUNTERS[0].enemies, onSelect: saveSetup});
    el('editor').appendChild(editor.element);
    editor.element.addEventListener('input', saveSetup); editor.element.addEventListener('change', saveSetup);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
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
      data.character = readCharacter();
      data.fight = null;
    }));
    el('start').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      const opponents = editor.read();
      data.opponents = editor.snapshot();
      data.character = readCharacter();
      updateFight(data, combat.startFight(data.character, opponents[0].displayName || tk('opponent')));
    }));
    el('player').addEventListener('click', () => change(data => updateFight(data, combat.rollPlayer(data.fight))));
    el('reroll').addEventListener('click', () => change(data => updateFight(data, combat.rollPlayer(data.fight, undefined, true))));
    el('enemy').addEventListener('click', () => change(data => updateFight(data, combat.rollEnemy(data.fight))));
    el('cancel').addEventListener('click', () => confirmed('cancelConfirm', data => updateFight(data, combat.cancelFight(data.fight))));
    registerShortcut({button: trigger, overlay, open, close});
  }
  return {init, render, open, close, setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) { close(); shownRun = null; }
  }};
}

const panel = createOutOfTimePanel({document, t, getRun: currentPlaythrough, getBookId: () => currentBookId, saveState,
  showAlert, showConfirm, getButtonRow: getPlayBtnRow, registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export function initSim807() { panel.init(); }
export function renderSim807() { panel.render(); }
export function setSim807Visible(visible) { panel.setVisible(visible); }
export { initSim807 as init, renderSim807 as render, setSim807Visible as setVisible };
