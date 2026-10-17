import { definition, ENCOUNTERS, SKILLS, PRICES, encounterPreset } from './definition.js';
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
const outsideServices = ['codeine', 'subcontractor', 'premonition'];
const numberText = value => Number(value).toLocaleString('bg-BG');

export function createPaymentPanel({document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, registerShortcut = () => {}}) {
  const tk = (key, values) => t(definition.i18nPrefix + '.' + key, values);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId: getBookId(), currentPlaythrough: getRun, saveState}));
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const number = (key, min, max) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" type="number" min="${min}" max="${max}" step="1" id="${ID}-${key}" required></label>`;
  const check = key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
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
    return combat.validateCharacter({life: numeric('life'), money: numeric('money'), skills: SKILLS.filter(key => el('skill-' + key).checked)});
  }
  function updateFight(data, fight) {
    data.fight = fight;
    for (const event of fight.events) {
      const values = {...event, hp: Math.max(0, event.hp ?? 0), destination: event.destination ?? '',
        repeated: event.repeated ? tk('repeated') : tk('newDie'), service: event.service ? tk(event.service) : ''};
      for (const field of ['money', 'price', 'reward']) if (field in values) values[field] = numberText(values[field]);
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
      el('securityChip').checked = Boolean(data.securityChip);
      editor.set(data.opponents ?? [{displayName: tk('customOpponent'), multiplier: 3, bonus: 0, hp: 30}]);
    }
    editor.lock(locked); editor.fixCount(true);
    const stamp = JSON.stringify(character);
    if (characterStamp !== stamp || locked) {
      characterStamp = stamp; el('life').value = character.life; el('money').value = character.money;
      for (const key of SKILLS) el('skill-' + key).checked = character.skills.includes(key);
    }
    for (const key of ['life', 'money', 'encounter', 'newCharacter', 'saveCharacter', 'start', ...SKILLS.map(key => 'skill-' + key)]) el(key).disabled = locked;
    const preset = el('encounter').value ? encounterPreset(el('encounter').value) : null;
    el('securityChip').disabled = locked || !preset?.securityChipOption;
    if (!preset?.securityChipOption) el('securityChip').checked = false;
    const money = locked ? character.money : Number(el('money').value), life = locked ? character.life : Number(el('life').value);
    for (const service of outsideServices) el(service).disabled = locked || life <= 0 || money < PRICES[service] || !Number.isSafeInteger(money)
      || service === 'codeine' && life >= 100;
    el('adrenaline').disabled = !locked || fight.phase !== 'repeated' || money < PRICES.adrenaline;
    el('mindhack').disabled = !locked || fight.phase === 'enemy' || money < PRICES.mindhack;
    el('roll').disabled = !locked || fight.phase === 'repeated';
    el('roll').textContent = tk(locked && fight.phase === 'enemy' ? 'rollEnemy' : 'roll');
    el('attack').disabled = !locked || fight.phase !== 'repeated';
    el('cancel').disabled = !locked;
    el('manualRow').hidden = !el('manual').checked;
    el('die').disabled = !locked || !el('manual').checked;
    el('status').textContent = tk(fight?.outcome ? 'status.' + fight.outcome : fight ? 'phase.' + fight.phase : 'status.ready');
    el('totals').textContent = tk('totals', {life: character.life, money: numberText(character.money), hp: fight ? Math.max(0, fight.hp) : '-'});
    el('progress').textContent = locked ? tk('progress', {seen: fight.seen.join(', ') || '-', bonus: fight.bonusCounts, damage: (fight.seen.length + fight.bonusCounts) ** 2}) : '';
    el('destination').textContent = fight?.destination ? tk('destination', {section: fight.destination}) : '';
    el('exception').textContent = preset ? tk('exception.' + (preset.surviveRounds ? 'survive' : preset.threshold != null ? 'threshold' : preset.deadline ? 'deadline' : preset.repeatEnemyOnOne ? 'repeat' : preset.securityChipOption ? 'chip' : 'normal'),
      {rounds: preset.surviveRounds ?? preset.deadline ?? '', threshold: preset.threshold ?? ''}) : tk('exception.normal');
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
      data.opponents = editor.snapshot(); data.section = el('encounter').value; data.securityChip = el('securityChip').checked;
    });
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-side"><div class="bsim-side-title">${escape(tk('character'))}</div>${number('life', 0, 100)}${number('money', -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)}${SKILLS.map(key => check('skill-' + key)).join('')}<div class="bsim-btn-row">${button('newCharacter')}${button('saveCharacter')}</div><div class="bsim-btn-row">${outsideServices.map(button).join('')}</div></div><label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter"><option value="">${escape(tk('custom'))}</option>${ENCOUNTERS.map(row => `<option value="${row.section}">${escape(row.label)}</option>`).join('')}</select></label><div id="${ID}-editor"></div>${check('securityChip')}<p id="${ID}-exception"></p><div class="bsim-btn-row">${button('start')}${button('roll')}${button('attack')}</div><div class="bsim-btn-row">${button('adrenaline')}${button('mindhack')}${button('cancel')}</div>${check('manual')}<div id="${ID}-manualRow">${number('die', 1, 6)}</div></div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-totals"></p><p id="${ID}-progress"></p><p id="${ID}-destination"></p><div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({document, id: ID, t, language: 'bg', fields: [
      {key: 'multiplier', label: tk('multiplier'), min: 0, max: 1000}, {key: 'bonus', label: tk('bonus'), min: 0, max: 1000},
      {key: 'hp', label: tk('hp'), min: 1, max: 1000000},
    ], presets: ENCOUNTERS, onSelect(opponent) { el('encounter').value = opponent.section; saveSetup(); }});
    el('editor').appendChild(editor.element);
    editor.element.addEventListener('input', saveSetup); editor.element.addEventListener('change', saveSetup);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open); el('die').value = 1;
    el('manual').addEventListener('change', () => render(true));
    for (const key of ['life', 'money']) el(key).addEventListener('input', () => render(true));
    el('securityChip').addEventListener('change', saveSetup);
    el('encounter').addEventListener('change', () => {
      if (active(store.read()?.fight)) return;
      if (el('encounter').value) editor.set([encounterPreset(el('encounter').value)]);
      saveSetup();
    });
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); close(); } });
    el('newCharacter').addEventListener('click', () => confirmed('newCharacterConfirm', data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = combat.newCharacter(); data.fight = null; data.log = []; data.securityChip = false;
      el('securityChip').checked = false;
    }));
    el('saveCharacter').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = readCharacter(); data.fight = null;
    }));
    for (const service of outsideServices) el(service).addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = combat.purchase(readCharacter(), service); data.fight = null;
      data.log.push(tk('event.purchase', {service: tk(service), price: numberText(PRICES[service]), money: numberText(data.character.money)}));
    }));
    el('start').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = readCharacter(); data.opponents = editor.snapshot(); data.section = el('encounter').value; data.securityChip = el('securityChip').checked;
      updateFight(data, combat.startFight(data.character, editor.read()[0], data.section ? encounterPreset(data.section) : null, data.securityChip));
    }));
    el('roll').addEventListener('click', () => change(data => {
      const die = el('manual').checked ? numeric('die') : combat.rollDie();
      updateFight(data, data.fight.phase === 'enemy' ? combat.rollEnemy(data.fight, die) : combat.rollPlayer(data.fight, die));
    }));
    el('attack').addEventListener('click', () => change(data => updateFight(data, combat.resolveAttack(data.fight))));
    for (const service of ['adrenaline', 'mindhack']) el(service).addEventListener('click', () => change(data => updateFight(data, combat.buyInFight(data.fight, service))));
    el('cancel').addEventListener('click', () => confirmed('cancelConfirm', data => updateFight(data, combat.cancelFight(data.fight))));
    registerShortcut({button: trigger, overlay, open, close});
  }
  return {init, render, open, close, setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) { close(); shownRun = null; }
  }};
}

const panel = createPaymentPanel({document, t, getRun: currentPlaythrough, getBookId: () => currentBookId, saveState,
  showAlert, showConfirm, getButtonRow: getPlayBtnRow, registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export function initSim833() { panel.init(); }
export function renderSim833() { panel.render(); }
export function setSim833Visible(visible) { panel.setVisible(visible); }
export { initSim833 as init, renderSim833 as render, setSim833Visible as setVisible };
