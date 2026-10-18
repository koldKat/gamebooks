import {definition, EASY_PRESETS, HARD_PRESETS, MANOEUVRES} from './definition.js';
import * as combat from './combat.js';
import {createState} from './state.js';
import {createOpponentEditor} from '../../opponents.js';
import {currentBookId, currentPlaythrough, saveState} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';

const ID = definition.stateKey;
const FIELDS = ['attack', 'defence', 'damage', 'hp', 'energy', 'energyCost', 'feedback', 'range'];
const active = fight => Boolean(fight && !fight.outcome);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

export function createCyberneticWarsPanel({document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, registerShortcut = () => {}}) {
  const tk = (key, args) => t(definition.i18nPrefix + '.' + key, args);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId: getBookId(), currentPlaythrough: getRun, saveState}));
  const presets = [...EASY_PRESETS];
  const editors = {};
  let shownRun, rendered, mode, editing = false;
  const button = key => `<button type="button" class="bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const select = (key, options) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><select class="inv-edit-input" id="${ID}-${key}">${options.map(value => `<option value="${value}">${escape(tk((key.endsWith('Manoeuvre') ? 'manoeuvre' : key) + '.' + value))}</option>`).join('')}</select></label>`;
  const number = (key, min = 0, max = 1000000) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${min}" max="${max}" step="1"></label>`;
  const checkbox = key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  function current() {return shownRun === getRun() && Number(getBookId()) === definition.id && el('overlay')?.classList.contains('active');}
  function close() {el('overlay')?.classList.remove('active'); rendered = null; editing = false;}
  function change(update) {
    if (!current()) {close(); return;}
    try {if (store.change(update)) render(true);} catch {showAlert(tk('invalid'));}
  }
  function numeric(key) {
    const input = el(key), value = Number(input.value);
    if (!input.value.trim() || !Number.isSafeInteger(value) || value < Number(input.min) || value > Number(input.max)) {
      input.focus(); throw new RangeError('Invalid field');
    }
    return value;
  }
  function fighter(who) {
    const [row] = editors[who].snapshot();
    return combat.validateFighter({...row, ...Object.fromEntries(FIELDS.map(key =>
      [key, row[key] == null || row[key] === '' ? null : Number(row[key])]))});
  }
  function setFighter(who, value) {
    editors[who].set([value]);
    const row = editors[who].element.querySelector('fieldset');
    row.querySelector('[role="combobox"]').closest('label').querySelector('span').textContent = tk('unitName');
    const extra = document.createElement('details'), summary = document.createElement('summary');
    summary.textContent = tk('extraStats'); extra.appendChild(summary);
    for (const input of row.querySelectorAll('[data-stat]')) {
      if (['energy', 'energyCost', 'feedback', 'range'].includes(input.dataset.stat)) extra.appendChild(input.closest('label'));
    }
    row.insertBefore(extra, row.querySelector('button'));
  }
  function saveSetup() {
    if (!current() || active(store.read()?.fight)) return;
    store.change(data => {data.setup = {mode: el('mode').value, domain: el('domain').value, oneHit: el('oneHit').checked,
      player: editors.player.snapshot()[0], enemy: editors.enemy.snapshot()[0]};});
  }
  function updateFight(data, next) {
    data.fight = next;
    for (const event of next.events) {
      const args = {...event};
      for (const key of ['attacker', 'defender', 'winner', 'loser', 'side']) if (args[key]) args[key] = tk('side.' + args[key]);
      if (event.kind === 'hard') args.defenceChance = event.distance ?? event.defenceChance;
      data.log.push(tk('event.' + event.kind, args));
    }
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (!current()) {close(); return;}
    const data = store.read();
    if (!data || !force && rendered === data) return;
    rendered = data;
    const fight = data.fight, locked = active(fight), pending = Boolean(fight?.pendingDamage);
    mode = locked ? fight.mode : el('mode').value;
    presets.splice(0, presets.length, ...(mode === 'hard' ? HARD_PRESETS : EASY_PRESETS));
    for (const who of ['player', 'enemy']) {
      if (locked && !editing) setFighter(who, fight[who]);
      editors[who].lock(locked && !editing);
    }
    for (const key of ['mode', 'domain', 'oneHit']) el(key).disabled = locked;
    el('hard').hidden = mode !== 'hard';
    el('oneHit').closest('label').hidden = mode !== 'easy';
    el('manualNumbers').hidden = !el('manual').checked;
    el('distance').disabled = !el('hasDistance').checked;
    el('start').disabled = locked;
    el('exchange').disabled = !locked || pending || editing;
    el('abandon').disabled = !locked;
    el('edit').disabled = !locked || pending || editing;
    el('apply').hidden = el('cancel').hidden = !editing;
    el('turn').disabled = !locked || pending || editing;
    if (locked) el('turn').value = fight.turn;
    el('pending').hidden = !pending;
    el('resolve').disabled = !pending;
    el('status').textContent = tk('status.' + (fight?.outcome ?? (locked ? 'active' : 'ready')));
    el('totals').textContent = fight ? ['player', 'enemy'].map(who => tk('remaining', {
      name: fight[who].displayName, hp: fight[who].hp, energy: fight[who].energy ?? '—'})).join('\n') : '';
    el('log').textContent = data.log.slice(-80).reverse().join('\n');
    el('history').textContent = data.history.slice(-40).reverse().map(entry => entry.enemy + ': ' + tk('status.' + entry.outcome)).join('\n');
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) {showAlert(t('battlesim.no_active_playthrough')); return;}
    shownRun = getRun(); rendered = null; editing = false;
    try {
      if (!store.read()) store.change(() => {});
      const data = store.read(), setup = data.setup;
      el('mode').value = data.fight && active(data.fight) ? data.fight.mode : setup?.mode ?? 'easy';
      el('domain').value = data.fight && active(data.fight) ? data.fight.domain : setup?.domain ?? 'space';
      el('oneHit').checked = setup?.oneHit ?? false;
      const controls = data.controls;
      el('manual').checked = controls?.manual ?? false;
      el('hasDistance').checked = controls?.hasDistance ?? false;
      for (const key of ['distance', 'playerChance', 'enemyChance', 'playerManoeuvre', 'enemyManoeuvre']) {
        el(key).value = controls?.[key] ?? (key.endsWith('Manoeuvre') ? 'none' : key === 'distance' ? 0 : 1);
      }
      for (const who of ['player', 'enemy']) setFighter(who, data.fight?.[who] ?? setup?.[who] ?? EASY_PRESETS[0]);
      el('overlay').classList.add('active'); render(true); el('close').focus();
    } catch {close(); showAlert(tk('invalid'));}
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title">
      <div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div>
      <div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p>
      ${select('mode', ['easy', 'hard'])}${select('domain', ['space', 'ground'])}${checkbox('oneHit')}
      <div id="${ID}-player"></div><div id="${ID}-enemy"></div><p>${escape(tk('missingNote'))}</p>
      <div class="bsim-btn-row">${button('start')}${button('exchange')}${button('abandon')}</div>
      <details id="${ID}-hard" open><summary>${escape(tk('tactics'))}</summary>${select('turn', ['player', 'enemy'])}
      ${checkbox('hasDistance')}${number('distance')}${select('playerManoeuvre', Object.keys(MANOEUVRES))}${select('enemyManoeuvre', Object.keys(MANOEUVRES))}<p>${escape(tk('tacticsNote'))}</p></details>
      ${checkbox('manual')}<div id="${ID}-manualNumbers">${number('playerChance', 1, 12)}${number('enemyChance', 1, 12)}</div>
      <div id="${ID}-pending"><p>${escape(tk('damageNote'))}</p>${number('manualDamage')}${button('resolve')}</div>
      <details><summary>${escape(tk('corrections'))}</summary><p>${escape(tk('correctionNote'))}</p><div class="bsim-btn-row">${button('edit')}${button('apply')}${button('cancel')}</div></details>
      </div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-totals" style="white-space:pre-line"></p><div class="bsim-log" id="${ID}-log" style="white-space:pre-line"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history" style="white-space:pre-line"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    for (const who of ['player', 'enemy']) {
      editors[who] = createOpponentEditor({document, id: ID + '-' + who, t, language: 'bg', presets,
        fields: FIELDS.map(key => ({key, label: tk(key), min: ['attack', 'defence'].includes(key) ? -1000000 : 0, max: 1000000})),
        onSelect: saveSetup});
      editors[who].fixCount(true);
      editors[who].element.querySelector(':scope > summary').textContent = tk('side.' + who);
      el(who).appendChild(editors[who].element);
      editors[who].element.addEventListener('change', saveSetup);
    }
    for (const key of ['playerChance', 'enemyChance']) el(key).value = 1;
    el('distance').value = 0;
    el('manualDamage').value = 0;
    for (const key of ['manual', 'hasDistance']) el(key).addEventListener('change', () => render(true));
    el('mode').addEventListener('change', () => {
      if (active(store.read()?.fight)) return;
      const defaults = el('mode').value === 'hard' ? HARD_PRESETS[0] : EASY_PRESETS[0];
      el('hasDistance').checked = false;
      for (const who of ['player', 'enemy']) setFighter(who, defaults);
      saveSetup(); render(true);
    });
    for (const key of ['domain', 'oneHit']) el(key).addEventListener('change', saveSetup);
    el('turn').addEventListener('change', () => change(data => updateFight(data, combat.setTurn(data.fight, el('turn').value))));
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => {backdrop = event.target === overlay;});
    overlay.addEventListener('click', event => {if (backdrop && event.target === overlay) close();});
    overlay.addEventListener('keydown', event => {if (event.key === 'Escape' && !event.defaultPrevented) {event.stopPropagation(); close();}});
    el('start').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.setup = {mode: el('mode').value, domain: el('domain').value, oneHit: el('oneHit').checked, player: fighter('player'), enemy: fighter('enemy')};
      data.log = [];
      updateFight(data, combat.startFight(data.setup.player, data.setup.enemy, {...data.setup, first: el('turn').value}));
    }));
    el('exchange').addEventListener('click', () => change(data => {
      const manual = el('manual').checked;
      data.controls = {manual, hasDistance: el('hasDistance').checked,
        ...Object.fromEntries(['distance', 'playerChance', 'enemyChance', 'playerManoeuvre', 'enemyManoeuvre'].map(key => [key, el(key).value]))};
      updateFight(data, combat.exchange(data.fight, {
        playerChance: manual ? numeric('playerChance') : undefined, enemyChance: manual ? numeric('enemyChance') : undefined,
        distance: el('hasDistance').checked ? numeric('distance') : null,
        playerManoeuvre: el('playerManoeuvre').value, enemyManoeuvre: el('enemyManoeuvre').value}));
    }));
    el('resolve').addEventListener('click', () => change(data => updateFight(data, combat.resolveDamage(data.fight, numeric('manualDamage')))));
    el('edit').addEventListener('click', () => {if (current() && active(store.read()?.fight) && !store.read().fight.pendingDamage) {editing = true; render(true);}});
    el('cancel').addEventListener('click', () => {editing = false; render(true);});
    el('apply').addEventListener('click', () => change(data => {
      if (!editing) return;
      const players = {player: fighter('player'), enemy: fighter('enemy')};
      // Validate both edits before applying either, preserving atomicity.
      updateFight(data, combat.amendFighters(data.fight, players)); editing = false;
    }));
    el('abandon').addEventListener('click', () => {
      const run = getRun(), before = store.read()?.fight;
      if (!active(before)) return;
      showConfirm(tk('abandonConfirm'), () => {
        if (getRun() === run && store.read()?.fight === before) change(data => {updateFight(data, combat.abandon(data.fight)); editing = false;});
      });
    });
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    registerShortcut({button: trigger, overlay, open, close});
  }
  return {init, open, close, render, setVisible(visible) {if (el('btn')) el('btn').style.display = visible ? '' : 'none'; if (!visible) close();}};
}

const panel = createCyberneticWarsPanel({document, t, getRun: currentPlaythrough, getBookId: () => currentBookId, saveState, showAlert, showConfirm, getButtonRow: getPlayBtnRow,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay, otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export function initSim891() {panel.init();}
export function renderSim891() {panel.render();}
export function setSim891Visible(visible) {panel.setVisible(visible);}
export { initSim891 as init, renderSim891 as render, setSim891Visible as setVisible };
