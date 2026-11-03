// Optional quarterstaff and crossbow duel controls and application lifecycle.
import { definition, ENCOUNTERS, loadRoster } from './definition.js';
import { startFight, advanceFight, cancelFight } from './combat.js';
import { createState } from './state.js';
import { createOpponentEditor } from '../../opponents.js';
import { currentBookId, currentPlaythrough, saveState, apiFetch } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';

const ID = definition.stateKey;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const active = fight => Boolean(fight && !fight.outcome);
export const loadData = () => loadRoster(apiFetch);

export function createCrystalMazePanel({document, t, getRun, getBookId, saveState, showAlert, showConfirm,
  getButtonRow, registerShortcut = () => {}}) {
  const tk = (key, params) => t(definition.i18nPrefix + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId: getBookId(), currentPlaythrough: getRun, saveState}));
  let shownRun, rendered, editor, editorMode;
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  function close() { el('overlay')?.classList.remove('active'); rendered = null; }
  function change(update) {
    if (shownRun !== getRun() || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) { close(); return; }
    try { if (store.change(update)) render(true); } catch { showAlert(tk('invalid')); }
  }
  function setup() {
    return {mode: el('mode').value, attribute: el('attribute').value, playerRating: el('playerRating').value,
      first: el('first').value, opponents: editor.snapshot()};
  }
  function saveSetup() {
    if (!active(store.read()?.fight)) change(data => { data.setup = setup(); });
  }
  function buildEditor(mode, opponents) {
    editorMode = mode;
    editor = createOpponentEditor({document, id: ID, t,
      fields: [{key: 'rating', label: tk(mode === 'crossbow' ? 'redFaces' : 'enemyRating'), min: 0, max: mode === 'crossbow' ? 6 : 24, step: 1}],
      presets: ENCOUNTERS.filter(row => row.mode === mode), onSelect(preset) {
        el('attribute').value = preset.attribute ?? 'strength';
        el('first').value = preset.first ?? 'player';
        if (preset.playerRating != null) el('playerRating').value = preset.playerRating;
        saveSetup();
      }});
    editor.set(opponents); editor.fixCount(true);
    editor.element.addEventListener('input', saveSetup);
    editor.element.addEventListener('change', saveSetup);
    el('editor').replaceChildren(editor.element);
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (shownRun !== getRun() || Number(getBookId()) !== definition.id) { close(); return; }
    const data = store.read();
    if (!data || !force && rendered === data) return;
    rendered = data;
    const {setup: options, fight} = data, locked = active(fight), crossbow = options.mode === 'crossbow';
    for (const key of ['mode', 'attribute', 'playerRating', 'first']) {
      el(key).value = options[key]; el(key).disabled = locked;
    }
    if (!editor || editorMode !== options.mode) buildEditor(options.mode, options.opponents);
    editor.lock(locked);
    el('attributeRow').hidden = crossbow;
    el('firstRow').hidden = !crossbow;
    el('playerRating').max = crossbow ? 6 : 24;
    el('playerLabel').textContent = tk(crossbow ? 'playerRedFaces' : options.attribute);
    el('rules').textContent = tk(crossbow ? 'crossbowNote' : 'opposedNote');
    el('start').disabled = locked;
    el('roll').disabled = !locked;
    el('cancel').disabled = !locked;
    el('status').textContent = tk('status.' + (fight?.outcome ?? (fight ? 'active' : 'ready')));
    el('turn').textContent = locked && fight.mode === 'crossbow' ? tk('next.' + fight.next) : '';
    el('log').innerHTML = data.log.slice(-80).map(line => `<div>${escape(line)}</div>`).join('');
    el('history').innerHTML = data.history.slice(-40).reverse().map(row => `<div>${escape(row.enemy + ': ' + tk('status.' + row.outcome))}</div>`).join('');
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    shownRun = getRun(); editor = null;
    try {
      if (!store.read()) store.change(() => {});
      el('overlay').classList.add('active'); render(true); el('close').focus();
    } catch { close(); showAlert(tk('invalid')); }
  }
  function updateFight(data, fight) {
    data.fight = fight;
    for (const event of fight.events) {
      if (event.kind === 'contest') data.log.push(tk('contest', {playerDice: event.playerDice.join(' + '),
        enemyDice: event.enemyDice.join(' + '), playerTotal: event.playerTotal, enemyTotal: event.enemyTotal,
        playerResult: tk(event.playerSuccess ? 'success' : 'failure'), enemyResult: tk(event.enemySuccess ? 'success' : 'failure')}));
      else data.log.push(tk('shot', {actor: tk('actor.' + event.actor), die: event.die, result: tk(event.hit ? 'red' : 'yellow')}));
      if (fight.outcome) data.log.push(tk('status.' + fight.outcome));
      else if (event.kind === 'contest') data.log.push(tk('impasse'));
    }
  }
  function init() {
    if (el('overlay')) return;
    const select = (key, values) => `<select class="inv-edit-input" id="${ID}-${key}">${values.map(value => `<option value="${value}">${escape(tk(value))}</option>`).join('')}</select>`;
    const row = (key, control, rowId = '') => `<label class="inv-edit-row"${rowId ? ` id="${ID}-${rowId}"` : ''}><span>${escape(tk(key))}</span>${control}</label>`;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p>${row('mode', select('mode', ['opposed', 'crossbow']))}${row('attribute', select('attribute', ['strength', 'dexterity']), 'attributeRow')}<label class="inv-edit-row"><span id="${ID}-playerLabel"></span><input class="inv-edit-input" id="${ID}-playerRating" type="number" min="0" max="24" step="1" autocomplete="off" required></label>${row('first', select('first', ['player', 'enemy']), 'firstRow')}<div id="${ID}-editor"></div><p id="${ID}-rules"></p><div class="bsim-btn-row">${button('start')}${button('roll')}${button('cancel')}</div></div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-turn"></p><div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); close(); } });
    for (const key of ['mode', 'attribute', 'playerRating', 'first']) el(key).addEventListener('change', () => {
      if (active(store.read()?.fight)) return;
      change(data => {
        const next = setup();
        if (next.mode !== data.setup.mode) { next.opponents = [{}]; next.playerRating = ''; }
        data.setup = next;
      });
    });
    el('start').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Duel active');
      const options = setup(), opponent = editor.read()[0];
      const fight = startFight({...options, enemyRating: opponent.rating, name: opponent.displayName || opponent.name || tk('opponent')});
      data.setup = options; data.log = []; updateFight(data, fight);
    }));
    el('roll').addEventListener('click', () => change(data => updateFight(data, advanceFight(data.fight))));
    el('cancel').addEventListener('click', () => {
      const run = getRun(), before = store.read();
      showConfirm(tk('cancelConfirm'), () => {
        if (getRun() === run && store.read() === before) change(data => updateFight(data, cancelFight(data.fight)));
      });
    });
    registerShortcut({button: trigger, overlay, open, close});
  }
  return {init, render, open, close, setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) { close(); shownRun = null; }
  }};
}

const panel = createCrystalMazePanel({document, t, getRun: currentPlaythrough, getBookId: () => currentBookId, saveState,
  showAlert, showConfirm, getButtonRow: getPlayBtnRow, registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export function initSim1555() { panel.init(); }
export function renderSim1555() { panel.render(); }
export function setSim1555Visible(visible) { panel.setVisible(visible); }
export {initSim1555 as init, renderSim1555 as render, setSim1555Visible as setVisible};
