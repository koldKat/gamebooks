import { definition, ENCOUNTERS, MECHS } from './definition.js';
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

export function createZendariPanel({document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, registerShortcut = () => {}}) {
  const tk = (key, values) => t(definition.i18nPrefix + '.' + key, values);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId: getBookId(), currentPlaythrough: getRun, saveState}));
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const select = (key, options) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><select class="inv-edit-input" id="${ID}-${key}">${options}</select></label>`;
  const number = (key, min, max) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" type="number" min="${min}" max="${max}" step="1" id="${ID}-${key}" required></label>`;
  const check = key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
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
    const previous = store.read().character;
    const weapons = numeric('weapons'), armour = numeric('armour');
    return combat.validateCharacter({...previous, mech: el('mech').value, difficulty: el('difficulty').value,
      weapons, armour, maxWeapons: Math.max(previous.maxWeapons, weapons), maxArmour: Math.max(previous.maxArmour, armour),
      mechanic: el('mechanic').checked, heavyWeapons: el('heavyWeapons').checked});
  }
  function updateFight(data, fight) {
    data.fight = fight;
    for (const event of fight.events) data.log.push(tk('event.' + event.kind, {...event,
      hit: tk(event.hit ? 'hit' : 'miss'), stat: tk(event.stat ?? 'weapons'), destination: event.destination ?? '—'}));
  }
  function saveOpponent() {
    if (!active(store.read()?.fight)) change(data => { data.opponents = editor.snapshot(); });
  }
  function applyDie(data, die, action) {
    const fight = action === 'escape' ? combat.escapeFight(data.fight, die) : combat.applyRoll(data.fight, die);
    delete fight.pendingRoll;
    updateFight(data, fight);
  }
  function beginRoll(action) {
    change(data => {
      if (!active(data.fight) || data.fight.pendingRoll) throw new RangeError('Roll unavailable');
      if (action === 'escape' && !canEscape(data.fight)) throw new RangeError('Escape unavailable');
      const difficulty = data.fight.character.difficulty;
      const die = difficulty === 'easy' ? numeric('chosenDie') : combat.rollDie();
      combat.chooseDie(difficulty, die);
      if (difficulty === 'normal') data.fight.pendingRoll = {first: die, action};
      else applyDie(data, die, action);
    });
  }
  function canEscape(fight) {
    return active(fight) && !fight.pendingRoll && fight.encounter.kind === 'mech' && fight.encounter.escape
      && fight.character.mech !== 'sparta' && ['attack', 'sniper'].includes(fight.phase);
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id) { close(); return; }
    const data = store.read();
    if (!data || !force && rendered === data) return;
    rendered = data;
    const fight = data.fight, locked = active(fight), character = data.character, pending = fight?.pendingRoll;
    if (editorRun !== getRun()) { editorRun = getRun(); editor.set(data.opponents ?? [{displayName: tk('enemy')}]); }
    editor.lock(locked); editor.fixCount(true);
    const stamp = JSON.stringify(character);
    if (characterRun !== getRun() || characterStamp !== stamp || locked) {
      characterRun = getRun(); characterStamp = stamp;
      for (const key of ['mech', 'difficulty', 'weapons', 'armour']) el(key).value = character[key];
      for (const key of ['mechanic', 'heavyWeapons']) el(key).checked = character[key];
    }
    for (const key of ['mech', 'difficulty', 'weapons', 'armour', 'mechanic', 'heavyWeapons', 'encounter', 'newCharacter', 'saveCharacter']) el(key).disabled = locked;
    const encounter = ENCOUNTERS.find(row => row.section === Number(el('encounter').value));
    for (const key of ['count', 'range']) el(key).disabled = locked || encounter.kind !== 'mech';
    el('start').disabled = locked;
    el('roll').disabled = !locked || Boolean(pending) || !['attack', 'sniper', 'defence', 'personal'].includes(fight.phase);
    el('escape').disabled = !canEscape(fight);
    el('reroll').disabled = !pending || pending.second !== undefined;
    el('acceptFirst').disabled = !pending;
    el('acceptSecond').disabled = pending?.second === undefined;
    el('chosenDie').disabled = !locked || character.difficulty !== 'easy' || Boolean(pending);
    for (const stat of ['weapons', 'armour']) {
      el('damage' + stat).disabled = !locked || fight.phase !== 'damage' || character[stat] <= 0;
      el('repair' + stat).disabled = locked || !fight || fight.outcome !== 'win' || fight.encounter.kind !== 'mech'
        || !character.mechanic || character.armour <= 0 || character[stat] >= character[stat === 'weapons' ? 'maxWeapons' : 'maxArmour'];
    }
    el('cancel').disabled = !locked;
    el('status').textContent = tk('status.' + (fight?.outcome ?? (fight ? 'active' : 'ready')));
    el('phase').textContent = locked ? tk('phase.' + fight.phase) : '';
    el('dice').textContent = pending ? tk('pending', {first: pending.first, second: pending.second ?? '—'}) : '';
    el('destination').textContent = fight?.destination ? tk('destination', {section: fight.destination}) : '';
    el('totals').textContent = fight ? tk('totals', {remaining: fight.remaining, weapons: character.weapons, armour: character.armour, rounds: fight.rounds}) : '';
    el('repairTime').textContent = tk('repairTime', {minutes: character.repairMinutes});
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
    const options = (values, prefix) => values.map(value => `<option value="${value}">${escape(tk(prefix + value))}</option>`).join('');
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-side"><div class="bsim-side-title">${escape(tk('character'))}</div>${select('mech', options(Object.keys(MECHS), 'mech.'))}${select('difficulty', options(['easy', 'normal', 'hard'], 'difficulty.'))}${number('weapons', 0, 6)}${number('armour', 0, 6)}${check('mechanic')}${check('heavyWeapons')}<div class="bsim-btn-row">${button('newCharacter')}${button('saveCharacter')}</div></div>${select('encounter', ENCOUNTERS.map(row => `<option value="${row.section}">${escape(tk('encounter.' + row.section))}</option>`).join(''))}<div id="${ID}-editor"></div>${number('count', 1, 100)}${number('range', 0, 100)}<p>${escape(tk('combatNote'))}</p><div class="bsim-btn-row">${button('start')}</div>${number('chosenDie', 1, 6)}<div class="bsim-btn-row">${button('roll')}${button('escape')}${button('reroll')}${button('acceptFirst')}${button('acceptSecond')}</div><div class="bsim-btn-row">${button('damageweapons')}${button('damagearmour')}${button('cancel')}</div><div class="bsim-btn-row">${button('repairweapons')}${button('repairarmour')}</div><p id="${ID}-repairTime"></p></div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-phase"></p><p id="${ID}-dice"></p><p id="${ID}-destination"></p><p id="${ID}-totals"></p><div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    const presets = [{displayName: tk('enemy')}, {displayName: tk('ravager')}];
    editor = createOpponentEditor({document, id: ID, t, language: 'bg', fields: [], presets, onSelect: saveOpponent});
    el('editor').appendChild(editor.element);
    editor.element.addEventListener('input', saveOpponent); editor.element.addEventListener('change', saveOpponent);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    el('count').value = ENCOUNTERS[0].count; el('range').value = ENCOUNTERS[0].range; el('chosenDie').value = 1;
    el('encounter').addEventListener('change', () => {
      if (active(store.read()?.fight)) return;
      const encounter = ENCOUNTERS.find(row => row.section === Number(el('encounter').value));
      el('count').value = encounter.count; el('range').value = encounter.range;
      editor.set([presets[encounter.kind === 'mech' ? 0 : 1]]);
      saveOpponent(); render(true);
    });
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); close(); } });
    el('newCharacter').addEventListener('click', () => confirmed('newCharacterConfirm', data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = combat.newCharacter(el('mech').value); data.fight = null; data.log = [];
    }));
    el('saveCharacter').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = readCharacter(); data.fight = null;
    }));
    el('start').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      const opponent = editor.read()[0];
      data.opponents = editor.snapshot();
      data.character = readCharacter();
      updateFight(data, combat.startFight(data.character, numeric('encounter'), opponent.displayName,
        {count: numeric('count'), range: numeric('range')}));
    }));
    el('roll').addEventListener('click', () => beginRoll('roll'));
    el('escape').addEventListener('click', () => beginRoll('escape'));
    el('reroll').addEventListener('click', () => change(data => {
      const pending = data.fight?.pendingRoll;
      if (!pending || pending.second !== undefined || data.fight.character.difficulty !== 'normal') throw new RangeError('Reroll unavailable');
      pending.second = combat.rollDie();
    }));
    for (const [key, second] of [['acceptFirst', false], ['acceptSecond', true]]) el(key).addEventListener('click', () => change(data => {
      const pending = data.fight?.pendingRoll;
      if (!pending) throw new RangeError('Missing roll');
      applyDie(data, combat.chooseDie(data.fight.character.difficulty, pending.first, pending.second, second), pending.action);
    }));
    for (const stat of ['weapons', 'armour']) {
      el('damage' + stat).addEventListener('click', () => change(data => updateFight(data, combat.allocateDamage(data.fight, stat))));
      el('repair' + stat).addEventListener('click', () => change(data => {
        if (data.fight?.outcome !== 'win' || data.fight.encounter.kind !== 'mech') throw new RangeError('Repair unavailable');
        data.fight.character = combat.repairCharacter(data.character, stat);
        data.log.push(tk('repaired', {stat: tk(stat)}));
      }));
    }
    el('cancel').addEventListener('click', () => confirmed('cancelConfirm', data => updateFight(data, combat.cancelFight(data.fight))));
    registerShortcut({button: trigger, overlay, open, close});
  }
  return {init, render, open, close, setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) { close(); shownRun = null; }
  }};
}

const panel = createZendariPanel({document, t, getRun: currentPlaythrough, getBookId: () => currentBookId, saveState,
  showAlert, showConfirm, getButtonRow: getPlayBtnRow, registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export function initSim808() { panel.init(); }
export function renderSim808() { panel.render(); }
export function setSim808Visible(visible) { panel.setVisible(visible); }
export { initSim808 as init, renderSim808 as render, setSim808Visible as setVisible };
