import {definition, ENCOUNTERS, encounterFor} from './definition.js';
import * as combat from './combat.js';
import {createState} from './state.js';
import {createOpponentEditor} from '../../opponents.js';
import {currentBookId, currentPlaythrough, saveState} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';

const ID = definition.stateKey;
const SCORES = ['skill', 'stamina', 'luck'];
const NUMBERS = [...SCORES, ...SCORES.map(key => key + 'Initial'), 'attackModifier', 'weaponBonus', 'provisions', 'potionUses'];
const active = fight => Boolean(fight && !fight.outcome);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const PRESETS = [...new Map(ENCOUNTERS.flatMap(row => row.enemies).map(enemy =>
  [[enemy.displayName, enemy.skill, enemy.stamina].join('|'), enemy])).values()];

export function createTalismanPanel({document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, registerShortcut = () => {}}) {
  const tk = (key, params) => t(definition.i18nPrefix + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId: getBookId(), currentPlaythrough: getRun, saveState}));
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const input = key => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${key === 'attackModifier' ? -1000 : key.endsWith('Initial') ? 1 : 0}" max="${['weaponBonus', 'potionUses'].includes(key) ? 1 : key === 'attackModifier' ? 1000 : 10000}" step="1" required></label>`;
  const checkbox = key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}"><span>${escape(tk(key))}</span></label>`;
  let shownRun, rendered, editor, editorRun;
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
    if (getRun() !== shownRun || active(store.read()?.fight)) return;
    change(data => { data.setup = {section: Number(el('encounter').value), opponents: editor.snapshot(), applyOpening: el('opening').checked}; });
  }
  function updateFight(data, fight) {
    data.fight = fight;
    for (const event of fight.events) data.log.push(tk('event.' + event.kind, {
      ...event, playerDice: event.playerDice?.join(' + '), enemyDice: event.enemyDice?.join(' + '),
      side: tk('side.' + (event.outgoing ? 'enemy' : 'player')),
      result: tk(event.lucky ? 'lucky' : 'unlucky'),
    }));
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id) { close(); return; }
    const data = store.read();
    if (!data || !force && rendered === data) return;
    rendered = data;
    const fight = data.fight, locked = active(fight), c = data.character, alive = Boolean(c?.stamina && !c.dead);
    if (editorRun !== getRun()) {
      editorRun = getRun();
      el('encounter').value = data.setup?.section ?? ENCOUNTERS[0].section;
      el('opening').checked = data.setup?.applyOpening ?? false;
      editor.set(data.setup?.opponents ?? ENCOUNTERS[0].enemies);
    }
    const preset = encounterFor(el('encounter').value);
    editor.lock(locked); editor.fixCount(Boolean(preset));
    for (const key of NUMBERS) { el(key).value = c?.[key] ?? ''; el(key).disabled = locked; }
    for (const key of ['ring', 'armour']) { el(key).checked = c?.[key] ?? false; el(key).disabled = locked; }
    el('potion').value = c?.potion ?? 'skill';
    for (const key of ['encounter', 'opening', 'potion', 'newCharacter', 'saveCharacter']) el(key).disabled = locked;
    el('opening-note').textContent = preset?.openingStamina || preset?.openingSkill
      ? tk('openingNote', {skill: preset.openingSkill ?? 0, stamina: preset.openingStamina ?? 0}) : '';
    el('meal').disabled = locked || !alive || !c.provisions || c.stamina === c.staminaInitial;
    el('drink').disabled = locked || !alive || !c.potionUses;
    el('testLuck').disabled = locked || !alive;
    el('start').disabled = locked || !alive;
    el('round').disabled = !locked || Boolean(fight.pending);
    el('cancel').disabled = !locked;
    el('luck-options').hidden = !locked || !fight.pending;
    el('pending').textContent = tk(fight?.pending?.kind === 'route' ? 'routeLuck' : 'pending');
    el('skipLuck').disabled = !locked || !fight.pending || fight.pending.kind === 'route';
    el('useLuck').disabled = !locked || !fight.pending;
    const currentTarget = Number(el('target').value);
    let indices = locked ? fight.config.groups[fight.group].filter(index => fight.enemies[index].stamina > (fight.enemies[index].floor ?? 0)) : [];
    const required = fight?.config.targetOrder?.find(index => indices.includes(index));
    if (required !== undefined) indices = [required];
    el('target').innerHTML = indices.map(index => `<option value="${index}">${escape(fight.enemies[index].displayName)}</option>`).join('');
    el('target').value = indices.includes(currentTarget) ? currentTarget : indices[0] ?? '';
    el('target').disabled = !locked || Boolean(fight.pending);
    el('status').textContent = tk('status.' + (fight?.outcome ?? (fight ? 'active' : 'ready')));
    el('destination').textContent = fight?.destination ? tk('destination', {section: fight.destination}) : '';
    el('consultation').textContent = (locked ? fight.config : preset)?.consultation ? tk('consultation') : '';
    el('opponents').innerHTML = fight ? fight.enemies.map(enemy => '<div>' + escape(tk('enemyLine', {...enemy, name: enemy.displayName})) + '</div>').join('') : '';
    el('log').innerHTML = data.log.slice(-80).map(line => '<div>' + escape(line) + '</div>').join('');
    el('history').innerHTML = data.history.slice(-40).reverse().map(row => '<div>' + escape(row.enemy + ': ' + tk('status.' + row.outcome)) + '</div>').join('');
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
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-side"><div class="bsim-side-title">${escape(tk('character'))}</div>${SCORES.map(input).join('')}<details><summary>${escape(tk('initialScores'))}</summary>${SCORES.map(key => input(key + 'Initial')).join('')}</details>${['attackModifier', 'weaponBonus'].map(input).join('')}${checkbox('ring')}${checkbox('armour')}${input('provisions')}<label class="inv-edit-row"><span>${escape(tk('potion'))}</span><select class="inv-edit-input" id="${ID}-potion">${['skill', 'strength', 'fortune'].map(key => `<option value="${key}">${escape(tk('potion.' + key))}</option>`).join('')}</select></label>${input('potionUses')}<div class="bsim-btn-row">${['newCharacter', 'saveCharacter', 'meal', 'drink', 'testLuck'].map(button).join('')}</div></div><label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter"><option value="0">${escape(tk('custom'))}</option>${ENCOUNTERS.map(e => `<option value="${e.section}">${escape(e.name)} (${e.section})</option>`).join('')}</select></label><div id="${ID}-editor"></div>${checkbox('opening')}<p id="${ID}-opening-note"></p><p>${escape(tk('combatNote'))}</p><label class="inv-edit-row"><span>${escape(tk('target'))}</span><select class="inv-edit-input" id="${ID}-target"></select></label><div class="bsim-btn-row">${['start', 'round', 'cancel'].map(button).join('')}</div><div id="${ID}-luck-options" hidden><p id="${ID}-pending"></p><div class="bsim-btn-row">${button('useLuck')}${button('skipLuck')}</div></div></div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-destination"></p><p id="${ID}-consultation"></p><div class="bsim-status" id="${ID}-opponents"></div><div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({document, id: ID, t, language: 'bg', fields: [
      {key: 'skill', label: tk('skill'), max: 10000}, {key: 'stamina', label: tk('stamina'), min: 1, max: 10000},
    ], presets: PRESETS, onSelect: saveSetup});
    el('editor').appendChild(editor.element);
    el('encounter').addEventListener('change', () => {
      if (active(store.read()?.fight)) return;
      editor.set(encounterFor(el('encounter').value)?.enemies ?? [{displayName: '', skill: 7, stamina: 7}]);
      el('opening').checked = false; saveSetup();
    });
    editor.element.addEventListener('input', saveSetup); editor.element.addEventListener('change', saveSetup);
    el('opening').addEventListener('change', saveSetup);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); close(); } });
    el('newCharacter').addEventListener('click', () => {
      const update = data => { data.character = combat.newCharacter(); data.fight = null; data.log = []; };
      if (store.read()?.character) confirmed('newConfirm', update); else change(update);
    });
    el('saveCharacter').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      const c = Object.fromEntries(NUMBERS.map(key => {
        if (!el(key).value.trim()) throw new RangeError('Missing number');
        return [key, Number(el(key).value)];
      }));
      c.ring = el('ring').checked; c.armour = el('armour').checked; c.potion = el('potion').value;
      c.dead = c.stamina === 0; combat.validateCharacter(c); data.fight = null; data.character = c;
    }));
    for (const [key, kind] of [['meal', 'meal'], ['drink', 'potion']]) el(key).addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = combat.recover(data.character, kind); data.fight = null;
    }));
    el('testLuck').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      const result = combat.testLuck(data.character); data.character = result.character; data.fight = null;
      data.log.push(tk('event.luck', {value: result.value, result: tk(result.lucky ? 'lucky' : 'unlucky')}));
    }));
    el('start').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      const section = Number(el('encounter').value), opponents = editor.read(), applyOpening = el('opening').checked;
      data.setup = {section, opponents: editor.snapshot(), applyOpening};
      data.encounterName = opponents.map(enemy => enemy.displayName).filter(Boolean).join(' / ') || tk('custom');
      updateFight(data, combat.startFight(section, data.character, {opponents, applyOpening}));
    }));
    el('round').addEventListener('click', () => change(data => updateFight(data, combat.round(data.fight, Number(el('target').value)))));
    for (const [key, useLuck] of [['useLuck', true], ['skipLuck', false]]) el(key).addEventListener('click', () => change(data => updateFight(data, combat.resolveLuck(data.fight, useLuck))));
    el('cancel').addEventListener('click', () => confirmed('cancelConfirm', data => {
      if (active(data.fight)) data.fight = {...data.fight, outcome: 'cancelled', events: [], pending: null, exchanges: []};
    }));
    registerShortcut({button: trigger, overlay, open, close});
  }
  return {init, render, open, close, setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) { close(); shownRun = null; }
  }};
}

const panel = createTalismanPanel({document, t, getRun: currentPlaythrough, getBookId: () => currentBookId, saveState,
  showAlert, showConfirm, getButtonRow: getPlayBtnRow, registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export function initSim904() { panel.init(); }
export function renderSim904() { panel.render(); }
export function setSim904Visible(visible) { panel.setVisible(visible); }
export { initSim904 as init, renderSim904 as render, setSim904Visible as setVisible };
