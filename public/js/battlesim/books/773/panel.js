import { definition, ENCOUNTERS, encounterFor } from './definition.js';
import * as combat from './combat.js';
import { createState } from './state.js';
import { createOpponentEditor } from '../../opponents.js';
import { currentBookId, currentPlaythrough, saveState } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';

const ID = definition.stateKey;
const SCORES = ['skill', 'stamina', 'luck'];
const FIELDS = [...SCORES, ...SCORES.map(key => key + 'Initial'), 'attackModifier'];
const OPTIONS = ['applyEntry', 'magicSword', 'hammer', 'groupMode'];
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const active = fight => Boolean(fight && (!fight.outcome || fight.outcome === 'paused'));

export function createChampionsPanel({ document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, registerShortcut = () => {} }) {
  const tk = (key, params) => t(definition.i18nPrefix + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({ currentBookId: getBookId(), currentPlaythrough: getRun, saveState }));
  const selected = () => encounterFor(el('encounter').value);
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const input = key => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${key === 'attackModifier' ? -1000 : key.endsWith('Initial') ? 1 : 0}" max="10000" step="1" required></label>`;
  let shownRun, rendered, editor, editorRun;
  function close() { el('overlay')?.classList.remove('active'); rendered = null; }
  function change(update) {
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) { close(); return; }
    try { if (store.change(update)) render(true); }
    catch { showAlert(tk('invalid')); }
  }
  function confirm(key, update) {
    const run = getRun(), before = store.read();
    showConfirm(tk(key), () => { if (getRun() === run && store.read() === before) change(update); });
  }
  function eventText(event, fight) {
    const enemy = event.enemy == null ? '' : fight.enemies[event.enemy]?.displayName || tk('opponent');
    return tk('event.' + event.kind, { ...event, enemy: event.kind === 'tug' ? event.enemy : enemy,
      result: event.kind === 'luck' ? tk(event.lucky ? 'lucky' : 'unlucky') : '',
      stat: event.stat ? tk(event.stat) : '' });
  }
  function updateFight(data, fight) {
    data.fight = fight;
    data.log.push(...fight.events.map(event => eventText(event, fight)));
  }
  function options() { return Object.fromEntries(OPTIONS.map(key => [key, el(key).checked])); }
  function saveSetup() {
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id || active(store.read()?.fight)) return;
    store.change(data => { data.setup = { section: Number(el('encounter').value), opponents: editor.snapshot(), ...options() }; });
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id) { close(); return; }
    const data = store.read();
    if (!data || !force && rendered === data) return;
    rendered = data;
    const fight = data.fight, locked = active(fight), paused = fight?.outcome === 'paused';
    const character = data.character, alive = Boolean(character?.stamina && !character.dead);
    if (editorRun !== getRun()) {
      editorRun = getRun();
      el('encounter').value = data.setup?.section ?? '0';
      editor.set(data.setup?.opponents ?? [{ displayName: '', skill: 7, stamina: 7 }]);
      for (const key of OPTIONS) el(key).checked = data.setup?.[key] ?? key === 'applyEntry';
    }
    editor.lock(locked); editor.fixCount(Boolean(selected()));
    for (const key of FIELDS) { el(key).value = character?.[key] ?? ''; el(key).disabled = locked && !paused; }
    for (const key of [...OPTIONS, 'encounter', 'newCharacter']) el(key).disabled = locked;
    el('saveCharacter').disabled = locked && !paused;
    el('start').disabled = locked || !alive;
    el('cancel').disabled = !locked;
    el('testLuck').disabled = locked || !alive;
    el('resume').hidden = !paused;
    el('resume').disabled = !paused || !alive;
    el('resume').textContent = tk('resumeAt', { section: fight?.config.resumeAt ?? '' });
    const indices = combat.targets(fight);
    el('target').innerHTML = indices.map(index => `<option value="${index}">${escape(fight.enemies[index].displayName || tk('opponent'))}</option>`).join('');
    el('target').disabled = !indices.length || Boolean(fight?.pending.length);
    el('round').disabled = !indices.length || Boolean(fight?.pending.length);
    const pending = fight?.pending[0];
    el('useLuck').disabled = !pending || pending.kind === 'automatic' || Boolean(fight.outcome);
    el('skipLuck').disabled = !pending || Boolean(fight.outcome);
    el('skipLuck').textContent = tk(pending?.kind === 'automatic' ? 'applyDamage' : 'skipLuck');
    el('pending').textContent = pending ? tk(pending.kind === 'automatic' ? 'automaticDamage' : 'optionalLuck') : '';
    el('status').textContent = tk('status.' + (fight?.outcome ?? (fight ? 'active' : 'ready')));
    el('destination').textContent = fight?.destination ? tk('destination', { section: fight.destination }) : '';
    el('opponents').textContent = fight ? fight.enemies.map(enemy => tk('enemyLine', {
      name: enemy.displayName || tk('opponent'), skill: enemy.skill, stamina: enemy.stamina })).join('\n') : '';
    el('log').innerHTML = data.log.slice(-80).map(line => '<div>' + escape(line) + '</div>').join('');
    el('history').innerHTML = data.history.slice(-40).reverse().map(row => '<div>' + escape(row.enemy + ': ' + tk('status.' + row.outcome)) + '</div>').join('');
    const preset = selected();
    const special = preset && ['fear', 'fatalLostRound', 'roundLimit', 'pauseOnLoss', 'fire', 'drainingCompanion',
      'bleedOnLoss', 'bleeding', 'selectableGroupMode', 'twoHeads', 'requiresMagicSword', 'requiresHammer', 'drowning', 'tugOfWar']
      .find(key => preset[key]);
    el('encounterNote').textContent = tk('note.' + (special || (preset ? 'preset' : 'custom')));
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
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-side"><div class="bsim-side-title">${escape(tk('character'))}</div>${SCORES.map(input).join('')}<details><summary>${escape(tk('initialScores'))}</summary>${SCORES.map(key => input(key + 'Initial')).join('')}</details>${input('attackModifier')}<div class="bsim-btn-row">${button('newCharacter')}${button('saveCharacter')}${button('testLuck')}</div></div><label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter"><option value="0">${escape(tk('custom'))}</option>${ENCOUNTERS.map(entry => `<option value="${entry.section}">${escape(entry.name)} (${entry.section})</option>`).join('')}</select></label><div id="${ID}-editor"></div>${OPTIONS.map(key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`).join('')}<p id="${ID}-encounterNote"></p><div class="bsim-btn-row">${button('start')}${button('cancel')}${button('resume')}</div><label class="inv-edit-row"><span>${escape(tk('target'))}</span><select class="inv-edit-input" id="${ID}-target"></select></label><div class="bsim-btn-row">${button('round')}</div><p id="${ID}-pending"></p><div class="bsim-btn-row">${button('useLuck')}${button('skipLuck')}</div></div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-destination"></p><div class="bsim-status" id="${ID}-opponents"></div><div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({ document, id: ID, t, language: 'bg',
      fields: [{ key: 'skill', label: tk('skill'), max: 10000 }, { key: 'stamina', label: tk('stamina'), min: 1, max: 10000 }],
      presets: ENCOUNTERS.flatMap(entry => entry.enemies), onSelect: saveSetup });
    el('editor').appendChild(editor.element);
    el('encounter').addEventListener('change', () => {
      if (active(store.read()?.fight)) return;
      editor.set(selected() ? selected().enemies : [{ displayName: '', skill: 7, stamina: 7 }]);
      saveSetup(); render(true);
    });
    editor.element.addEventListener('input', saveSetup); editor.element.addEventListener('change', saveSetup);
    for (const key of OPTIONS) el(key).addEventListener('change', saveSetup);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    el('newCharacter').addEventListener('click', () => {
      const update = data => { data.character = combat.newCharacter(); data.fight = null; data.log = []; };
      if (store.read()?.character) confirm('newCharacterConfirm', update); else change(update);
    });
    el('saveCharacter').addEventListener('click', () => change(data => {
      if (data.fight && !data.fight.outcome) throw new RangeError('Fight active');
      const character = Object.fromEntries(FIELDS.map(key => {
        const value = el(key).value;
        if (!value.trim()) throw new RangeError('Missing number');
        return [key, combat.integer(Number(value), key === 'attackModifier' ? -1000 : 0)];
      }));
      character.dead = character.stamina === 0;
      combat.validateCharacter(character); data.character = character;
      if (data.fight?.outcome !== 'paused') data.fight = null;
    }));
    el('start').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      const section = Number(el('encounter').value), opponents = editor.read();
      data.setup = { section, opponents: editor.snapshot(), ...options() };
      data.encounterName = selected()?.name ?? opponents.map(enemy => enemy.displayName || tk('opponent')).join(' / ');
      updateFight(data, combat.startFight(section, data.character, { ...options(), opponents }));
    }));
    el('round').addEventListener('click', () => change(data => updateFight(data, combat.round(data.fight, Number(el('target').value)))));
    el('useLuck').addEventListener('click', () => change(data => updateFight(data, combat.resolveLuck(data.fight, true))));
    el('skipLuck').addEventListener('click', () => change(data => updateFight(data, combat.resolveLuck(data.fight, false))));
    el('resume').addEventListener('click', () => confirm('resumeConfirm', data => updateFight(data, combat.resumeFight(data.fight, data.character))));
    el('cancel').addEventListener('click', () => confirm('cancelConfirm', data => {
      if (active(data.fight)) data.fight = { ...data.fight, character: structuredClone(data.character), outcome: 'cancelled', pending: [], events: [], destination: null };
    }));
    el('testLuck').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      const result = combat.testLuck(data.character); data.character = result.character;
      data.log.push(tk('event.luck', { roll: result.roll, result: tk(result.lucky ? 'lucky' : 'unlucky') }));
    }));
    registerShortcut({ button: trigger, overlay, open, close });
  }
  return { init, render, open, close, setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) { close(); shownRun = null; }
  } };
}

const panel = createChampionsPanel({ document, t, getRun: currentPlaythrough, getBookId: () => currentBookId, saveState,
  showAlert, showConfirm, getButtonRow: getPlayBtnRow, registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', { getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  } });
export function initSim773() { panel.init(); }
export function renderSim773() { panel.render(); }
export function setSim773Visible(visible) { panel.setVisible(visible); }
export { initSim773 as init, renderSim773 as render, setSim773Visible as setVisible };
