import {definition, ENCOUNTERS} from './definition.js';
import * as combat from './combat.js';
import {createState} from './state.js';
import {createOpponentEditor} from '../../opponents.js';
import {currentBookId, currentPlaythrough, saveState} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';

const ID = definition.stateKey;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const active = data => Boolean(data?.fight && !data.fight.outcome);

export function createDoubleAgentPanel({document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, registerShortcut = () => {}}) {
  const tk = (key, values) => t(definition.i18nPrefix + '.' + key, values);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId: getBookId(), currentPlaythrough: getRun, saveState}));
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const number = (key, min, max) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" type="number" id="${ID}-${key}" min="${min}" max="${max}" step="1" required></label>`;
  let shownRun, editorRun, editor, rendered, stamp;
  function close() {el('overlay')?.classList.remove('active'); rendered = null;}
  function change(update) {
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) {close(); return;}
    try {if (store.change(update)) render(true);} catch {showAlert(tk('invalid'));}
  }
  function numeric(key) {
    if (!el(key).value.trim()) throw new RangeError('Missing value');
    return Number(el(key).value);
  }
  function character() {return combat.validateCharacter({health: numeric('health'), tracers: numeric('tracers'), aircraftHits: numeric('aircraftHits')});}
  function options() {return {weapon: numeric('weapon'), tracer: el('tracer').checked};}
  function record(data, events) {
    for (const event of events) data.log.push(tk('shot', {actor: tk(event.side), dice: event.attackDice.join(' + '),
      total: event.total, result: tk(event.hit ? 'hit' : 'miss')}));
  }
  function finish(data, outcome, destination, name) {
    data.result = {outcome, destination};
    const ts = Math.max(Date.now(), (data.history.at(-1)?.ts ?? 0) + 1);
    data.history.push({ts, name, outcome, destination});
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id) {close(); return;}
    const data = store.read();
    if (!data || !force && rendered === data) return;
    rendered = data;
    if (editorRun !== getRun()) {
      editorRun = getRun(); stamp = null;
      editor.set(data.opponents ?? [ENCOUNTERS[0]]);
    }
    const locked = active(data);
    editor.fixCount(true); editor.lock(locked);
    const nextStamp = JSON.stringify(data.character);
    if (nextStamp !== stamp || locked) {
      stamp = nextStamp;
      for (const key of ['health', 'tracers', 'aircraftHits']) el(key).value = data.character[key];
    }
    for (const key of ['health', 'tracers', 'aircraftHits', 'saveCharacter', 'newCharacter']) el(key).disabled = locked;
    el('start').disabled = locked || data.character.health === 3;
    el('attack').disabled = !locked;
    el('abandon').disabled = !locked;
    el('reinforcement').hidden = !locked || !data.fight.encounter.reinforcement || data.fight.reinforcementAdded;
    el('tracer').disabled = !data.character.tracers || Boolean(locked && data.fight.encounter.aircraft);
    if (el('tracer').disabled) el('tracer').checked = false;
    el('weapon').disabled = Boolean(locked && data.fight.encounter.aircraft);
    if (el('weapon').disabled) el('weapon').value = 0;
    el('status').textContent = tk('status.' + (locked ? 'active' : data.result?.outcome ?? 'ready'));
    el('totals').textContent = tk('totals', {health: tk('health.' + data.character.health), tracers: data.character.tracers,
      aircraft: data.character.aircraftHits, enemies: locked ? data.fight.remaining : 0, round: data.fight?.round ?? 0});
    el('destination').textContent = data.result?.destination ? tk('destination', {section: data.result.destination}) : '';
    el('log').innerHTML = data.log.slice(-80).map(line => '<div>' + escape(line) + '</div>').join('');
    el('history').innerHTML = data.history.slice().reverse().map(row => '<div>' + escape(row.name + ': ' + tk('status.' + row.outcome)) + '</div>').join('');
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) {showAlert(t('battlesim.no_active_playthrough')); return;}
    shownRun = getRun(); editorRun = null;
    try {
      if (!store.read()) store.change(data => {data.character = combat.newCharacter();});
      el('overlay').classList.add('active'); render(true); el('close').focus();
    } catch {close(); showAlert(tk('invalid'));}
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-side"><div class="bsim-side-title">${escape(tk('character'))}</div><label class="inv-edit-row"><span>${escape(tk('health'))}</span><select class="inv-edit-input" id="${ID}-health">${[0,1,2,3].map(value => `<option value="${value}">${escape(tk('health.' + value))}</option>`).join('')}</select></label>${number('tracers',0,12)}${number('aircraftHits',0,4)}<div class="bsim-btn-row">${button('saveCharacter')}${button('newCharacter')}</div></div><div id="${ID}-editor"></div><p>${escape(tk('customNote'))}</p>${number('weapon',0,2)}<label class="bsim-checkbox"><input type="checkbox" id="${ID}-tracer">${escape(tk('tracer'))}</label><div class="bsim-btn-row">${button('start')}${button('attack')}${button('abandon')}</div><p>${escape(tk('reinforcementNote'))}</p><div class="bsim-btn-row">${button('reinforcement')}</div></div><div class="bsim-col bsim-col-right"><div class="bsim-status" id="${ID}-status" role="status" aria-live="polite"></div><p id="${ID}-totals"></p><p id="${ID}-destination"></p><div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({document, id: ID, t, language: 'bg', presets: ENCOUNTERS,
      fields: [{key: 'enemies', label: tk('enemies'), min: 1, max: 100},
        {key: 'playerThreshold', label: tk('playerThreshold'), min: 2, max: 30},
        {key: 'enemyThreshold', label: tk('enemyThreshold'), min: 2, max: 30}],
      onSelect: () => change(data => {if (!active(data)) data.opponents = editor.snapshot();})});
    el('editor').appendChild(editor.element);
    el('weapon').value = 1;
    for (const event of ['input', 'change']) editor.element.addEventListener(event, () => {
      if (!active(store.read())) change(data => {data.opponents = editor.snapshot();});
    });
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => {backdrop = event.target === overlay;});
    overlay.addEventListener('click', event => {if (backdrop && event.target === overlay) close();});
    overlay.addEventListener('keydown', event => {if (event.key === 'Escape' && !event.defaultPrevented) {event.stopPropagation(); close();}});
    el('saveCharacter').addEventListener('click', () => change(data => {if (active(data)) throw new RangeError('Active fight'); data.character = character();}));
    el('newCharacter').addEventListener('click', () => {
      const run = getRun(), before = store.read();
      showConfirm(tk('newCharacterConfirm'), () => {
        if (getRun() === run && store.read() === before) change(data => {
          if (active(data)) throw new RangeError('Active fight');
          data.character = combat.newCharacter(); data.fight = null; data.result = null;
        });
      });
    });
    el('start').addEventListener('click', () => change(data => {
      if (active(data)) throw new RangeError('Active fight');
      const encounter = combat.validateEncounter(editor.read()[0]);
      data.character = character(); data.opponents = editor.snapshot(); data.result = null;
      if (encounter.exchange) {
        const result = combat.resolveExchange(data.character, encounter, options());
        data.character = result.character; data.fight = null;
        record(data, [{side: result.first, ...(result.first === 'enemy' ? result.opponent : result.player)},
          {side: result.first === 'enemy' ? 'player' : 'enemy', ...(result.first === 'enemy' ? result.player : result.opponent)}]);
        finish(data, result.outcome, result.destination, encounter.displayName);
      } else data.fight = combat.startFight(data.character, encounter);
    }));
    el('attack').addEventListener('click', () => change(data => {
      if (!active(data)) throw new RangeError('No fight');
      const result = combat.resolveFightRound(data.fight, options());
      data.fight = result.fight; data.character = result.fight.character; record(data, result.events);
      if (result.fight.outcome) finish(data, result.fight.outcome, result.destination, result.fight.encounter.displayName);
    }));
    el('reinforcement').addEventListener('click', () => change(data => {data.fight = combat.addReinforcement(data.fight);}));
    el('abandon').addEventListener('click', () => change(data => {
      if (!active(data)) throw new RangeError('No fight');
      data.fight.outcome = 'abandoned'; data.result = {outcome: 'abandoned', destination: null};
    }));
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    registerShortcut({button: trigger, overlay, open, close});
  }
  return {init, render, open, close, setVisible(visible) {if (el('btn')) el('btn').style.display = visible ? '' : 'none'; if (!visible) {close(); shownRun = null;}}};
}

const panel = createDoubleAgentPanel({document, t, getRun: currentPlaythrough, getBookId: () => currentBookId, saveState, showAlert, showConfirm, getButtonRow: getPlayBtnRow,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay, otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export function initSim873() {panel.init();}
export function renderSim873() {panel.render();}
export function setSim873Visible(visible) {panel.setVisible(visible);}
export { initSim873 as init, renderSim873 as render, setSim873Visible as setVisible };
