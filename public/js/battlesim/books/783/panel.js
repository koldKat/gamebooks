import { definition, CHARACTER_FIELDS, ENCOUNTERS, encounterFor } from './definition.js';
import * as combat from './combat.js';
import { createState } from './state.js';
import { createOpponentEditor } from '../../opponents.js';
import { currentBookId, currentPlaythrough, saveState } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';

const ID = definition.stateKey;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const active = fight => Boolean(fight && !fight.outcome);

export function createSamsonPanel({ document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, registerShortcut = () => {} }) {
  const tk = (key, params) => t(definition.i18nPrefix + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({ currentBookId: getBookId(), currentPlaythrough: getRun, saveState }));
  const selected = () => encounterFor(el('encounter').value);
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const input = key => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${['justice', 'debate'].includes(key) ? -10000 : 0}" max="10000" step="1" required></label>`;
  const optionValues = () => ({ damageAtThree: Number(el('damageAtThree').value), kratuna: el('kratuna').checked, applyEntry: el('applyEntry').checked });
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
  function saveSetup() {
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id || active(store.read()?.fight)) return;
    store.change(data => { data.setup = { section: Number(el('encounter').value), opponents: editor.snapshot(), ...optionValues() }; });
  }
  function updateFight(data, fight) {
    data.fight = fight;
    data.log.push(...fight.events.map(event => tk('event.' + event.kind, { ...event,
      enemy: fight.enemies[event.enemy]?.displayName || tk('opponent') })));
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
      el('encounter').value = data.setup?.section ?? '0';
      editor.set(data.setup?.opponents ?? [{ displayName: '', strength: 7, life: 10 }]);
      el('damageAtThree').value = data.setup?.damageAtThree || '';
      for (const key of ['kratuna', 'applyEntry']) el(key).checked = Boolean(data.setup?.[key]);
    }
    editor.lock(locked); editor.fixCount(Boolean(selected()));
    for (const key of CHARACTER_FIELDS) { el(key).value = character?.[key] ?? combat.newCharacter()[key]; el(key).disabled = locked; }
    for (const key of ['encounter', 'damageAtThree', 'kratuna', 'applyEntry', 'newCharacter', 'saveCharacter']) el(key).disabled = locked;
    el('start').disabled = locked || !character || character.dead || character.life <= 0 || character.faith <= 0 || ![1, 2].includes(Number(el('damageAtThree').value));
    el('cancel').disabled = !locked;
    const indices = combat.targets(fight), before = el('target').value;
    el('target').innerHTML = indices.map(index => `<option value="${index}">${escape(fight.enemies[index].displayName || tk('opponent'))}</option>`).join('');
    if (indices.includes(Number(before))) el('target').value = before;
    el('target').disabled = !indices.length; el('round').disabled = !indices.length;
    el('status').textContent = tk('status.' + (fight?.outcome ?? (fight ? 'active' : 'ready')));
    el('destination').textContent = fight?.destination ? tk('destination', { section: fight.destination }) : '';
    el('opponents').textContent = fight ? fight.enemies.map(enemy => enemy.life == null
      ? tk('nonlethalLine', { name: enemy.displayName || tk('opponent'), strength: enemy.strength, lost: enemy.lost, limit: fight.config.lossLimit })
      : tk('enemyLine', { name: enemy.displayName || tk('opponent'), strength: enemy.strength, life: enemy.life })).join('\n') : '';
    el('log').innerHTML = data.log.slice(-80).map(line => '<div>' + escape(line) + '</div>').join('');
    el('history').innerHTML = data.history.slice(-40).reverse().map(row => '<div>' + escape(row.enemy + ': ' + tk('status.' + row.outcome)) + '</div>').join('');
    const preset = selected();
    el('encounterNote').textContent = preset?.lossLimit ? tk('nonlethal', { limit: preset.lossLimit })
      : preset?.bonus ? tk('bonus', { bonus: preset.bonus }) : tk('groupNote');
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
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-side"><div class="bsim-side-title">${escape(tk('character'))}</div>${CHARACTER_FIELDS.map(input).join('')}<div class="bsim-btn-row">${button('newCharacter')}${button('saveCharacter')}</div></div><label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter"><option value="0">${escape(tk('custom'))}</option>${ENCOUNTERS.map(entry => `<option value="${entry.section}">${escape(entry.name)} (${entry.section})</option>`).join('')}</select></label><div id="${ID}-editor"></div><p>${escape(tk('ambiguity'))}</p><label class="inv-edit-row"><span>${escape(tk('damageAtThree'))}</span><select class="inv-edit-input" id="${ID}-damageAtThree"><option value="">${escape(tk('choose'))}</option><option value="1">1</option><option value="2">2</option></select></label>${['kratuna', 'applyEntry'].map(key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`).join('')}<p id="${ID}-encounterNote"></p><div class="bsim-btn-row">${button('start')}${button('cancel')}</div><label class="inv-edit-row"><span>${escape(tk('target'))}</span><select class="inv-edit-input" id="${ID}-target"></select></label><div class="bsim-btn-row">${button('round')}</div></div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-destination"></p><div class="bsim-status" id="${ID}-opponents"></div><div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({ document, id: ID, t, language: 'bg',
      fields: [{ key: 'strength', label: tk('strength'), max: 10000 }, { key: 'life', label: tk('life'), min: 1, max: 10000 }],
      isStatUnavailable: key => key === 'life' && Boolean(selected()?.lossLimit),
      presets: ENCOUNTERS.flatMap(entry => entry.enemies), onSelect: saveSetup });
    el('editor').appendChild(editor.element);
    el('encounter').addEventListener('change', () => {
      if (active(store.read()?.fight)) return;
      editor.set(selected()?.enemies ?? [{ displayName: '', strength: 7, life: 10 }]);
      saveSetup(); render(true);
    });
    editor.element.addEventListener('input', saveSetup); editor.element.addEventListener('change', saveSetup);
    for (const key of ['damageAtThree', 'kratuna', 'applyEntry']) el(key).addEventListener('change', () => { saveSetup(); render(true); });
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    el('newCharacter').addEventListener('click', () => {
      const update = data => { data.character = combat.newCharacter(Object.fromEntries(['strength', 'wisdom', 'charm'].map(key => [key, Number(el(key).value)]))); data.fight = null; data.log = []; };
      if (store.read()?.character) confirm('newCharacterConfirm', update); else change(update);
    });
    el('saveCharacter').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      const character = Object.fromEntries(CHARACTER_FIELDS.map(key => {
        if (!el(key).value.trim()) throw new RangeError('Missing number');
        return [key, Number(el(key).value)];
      }));
      character.dead = character.life <= 0 || character.faith <= 0;
      combat.validateCharacter(character); data.character = character; data.fight = null;
    }));
    el('start').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      const section = Number(el('encounter').value), opponents = editor.snapshot();
      data.setup = { section, opponents, ...optionValues() };
      data.encounterName = selected()?.name ?? opponents.map(enemy => enemy.displayName || tk('opponent')).join(' / ');
      updateFight(data, combat.startFight(section, data.character, { ...optionValues(), opponents }));
    }));
    el('round').addEventListener('click', () => change(data => updateFight(data, combat.round(data.fight, Number(el('target').value)))));
    el('cancel').addEventListener('click', () => confirm('cancelConfirm', data => {
      if (active(data.fight)) data.fight = { ...data.fight, character: structuredClone(data.character), outcome: 'cancelled', events: [], destination: null };
    }));
    registerShortcut({ button: trigger, overlay, open, close });
  }
  return { init, render, open, close, setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) { close(); shownRun = null; }
  } };
}

const panel = createSamsonPanel({ document, t, getRun: currentPlaythrough, getBookId: () => currentBookId, saveState,
  showAlert, showConfirm, getButtonRow: getPlayBtnRow, registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', { getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  } });
export function initSim783() { panel.init(); }
export function renderSim783() { panel.render(); }
export function setSim783Visible(visible) { panel.setVisible(visible); }
export { initSim783 as init, renderSim783 as render, setSim783Visible as setVisible };
