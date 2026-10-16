import {definition, DEFAULT_CHARACTER, ATTACKERS, SPELL_COSTS} from './definition.js';
import {startFight, advanceRitual, advanceAttackers, advanceDuel, spendSpell} from './combat.js';
import {createState} from './state.js';
import {currentBookId, currentPlaythrough, saveState} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';

const ID = definition.stateKey;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const FIELDS = ['attack', 'defence', 'mobility', 'skill', 'stamina', 'armour', 'shield'];
const ROLLS = ['player', 'enemy', 'enemyAttack', 'playerDefence', 'playerAttack', 'enemyDefence'];

export function createTrueMagicPanel({document, t, getRun, getBookId, saveState, showAlert, getButtonRow, registerShortcut = () => {}}) {
  const tk = (key, params) => t(definition.i18nPrefix + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId: getBookId(), currentPlaythrough: getRun, saveState}));
  let rendered, displayedRun;
  const button = key => `<button type="button" class="bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const field = (key, label = key, value = '', minimum = 0) => `<label class="inv-edit-row"><span>${escape(tk(label))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${minimum}" max="1000000" step="1" value="${value}"></label>`;
  function number(key) {
    const node = el(key), raw = node.value.trim(), value = Number(raw);
    if (!raw || !Number.isSafeInteger(value) || value < Number(node.min) || value > Number(node.max)) {
      node.closest('details')?.setAttribute('open', ''); node.focus(); throw new RangeError('Invalid field');
    }
    return value;
  }
  function close() {el('overlay')?.classList.remove('active');}
  function mode() {
    const kind = el('encounter').value;
    el('enemy-setup').hidden = kind !== 'attackers';
    el('lizard-row').hidden = kind !== 'ritual';
    el('worm-row').hidden = kind !== 'duel';
  }
  function render(force = false) {
    if (Number(getBookId()) !== definition.id || !getRun()) {close(); rendered = null; return;}
    if (el('overlay')?.classList.contains('active') && getRun() !== displayedRun) {close(); return;}
    const data = store.read();
    if (!data || !force && data === rendered) return;
    rendered = data;
    const fight = data.fight, active = Boolean(fight && !fight.outcome);
    for (const key of FIELDS) {
      el(key).value = data.character?.[key] ?? DEFAULT_CHARACTER[key] ?? 0;
      el(key).disabled = active;
    }
    el('apply').disabled = active;
    el('start').disabled = !data.character || Boolean(fight) || data.character.stamina < 0;
    el('again').disabled = !fight || active;
    el('encounter').disabled = Boolean(fight);
    el('spend').disabled = !data.character || Boolean(fight) || data.character.stamina < 0;
    el('ritual-rolls').hidden = !active || fight.kind !== 'ritual' || !fight.choices.some(id => id === 45 || id === 48);
    el('attacker-rolls').hidden = !active || fight.kind !== 'attackers';
    el('round').disabled = !active || fight.kind !== 'attackers';
    el('actions').innerHTML = active ? fight.choices.map(section => `<button type="button" class="bsim-action-btn" data-section="${section}">${escape(tk('action.' + section))} (${section})</button>`).join('') : '';
    const lines = [];
    if (fight) {
      lines.push(fight.name, tk('section', {section: fight.section}), tk('remaining', {amount: fight.character.stamina}));
      if (fight.kind === 'ritual') lines.push(tk('ritualLoss', {player: fight.lost, enemy: fight.enemyLost}));
      if (fight.enemies) {
        fight.enemies.forEach((enemy, index) => lines.push(tk('enemyRemaining', {enemy: index + 1, amount: enemy.stamina})));
        if (active) lines.push(tk('attackerTurn', {enemy: fight.enemyIndex + 1}));
      }
      if (fight.lastComparison) lines.push(Object.entries(fight.lastComparison).map(([key, value]) => tk('comparison.' + key) + ': ' + value).join(' | '));
      if (fight.outcome) lines.push(tk('outcome.' + fight.outcome));
    } else lines.push(tk('ready'));
    el('result').textContent = lines.join('\n');
    el('history').textContent = data.history.slice(-40).reverse().map(entry => entry.enemy + ': ' + tk('outcome.' + entry.outcome)).join('\n');
    mode();
  }
  function change(update) {
    if (getRun() !== displayedRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) {close(); return;}
    try {if (store.change(update)) render(true);} catch {showAlert(tk('invalid'));}
  }
  function advance(target) {
    change(data => {
      const fight = data.fight;
      if (!fight || fight.outcome) return;
      if (fight.kind === 'ritual') data.fight = advanceRitual(fight, target,
        [45, 48].includes(target) ? {player: number('roll-player'), enemy: number('roll-enemy')} : {});
      else if (fight.kind === 'attackers') data.fight = advanceAttackers(fight,
        Object.fromEntries(ROLLS.slice(2).map(key => [key, number('roll-' + key)])));
      else data.fight = advanceDuel(fight, target);
      data.character.stamina = data.fight.character.stamina;
      for (const key of ROLLS) el('roll-' + key).value = '';
    });
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) {showAlert(t('battlesim.no_active_playthrough')); return;}
    try {store.ensure(); displayedRun = getRun(); el('overlay').classList.add('active'); render(true); el('close').focus();}
    catch {close(); showAlert(tk('invalid'));}
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    const enemies = ATTACKERS.map((stats, index) => `<details><summary>${escape(tk('enemy', {enemy: index + 1}))}</summary><p>${escape(tk('enemyStats', stats))}</p>${field('enemy-' + index + '-defence', 'defence')}${field('enemy-' + index + '-stamina', 'stamina')}</details>`).join('');
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title">
      <div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div>
      <div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p>
      <details open><summary>${escape(tk('character'))}</summary>${FIELDS.map(key => field(key, key, DEFAULT_CHARACTER[key] ?? 0, key === 'stamina' ? -1000000 : 0)).join('')}${button('apply')}</details>
      <details><summary>${escape(tk('spellLedger'))}</summary><p>${escape(tk('spellNote'))}</p>
      <label class="inv-edit-row"><span>${escape(tk('spell'))}</span><select class="inv-edit-input" id="${ID}-spell">${Object.keys(SPELL_COSTS).map(key => `<option value="${key}">${escape(tk('spell.' + key))}</option>`).join('')}</select></label>
      <label class="bsim-checkbox"><input type="checkbox" id="${ID}-staff">${escape(tk('staff'))}</label>${button('spend')}</details></div>
      <div class="bsim-col bsim-col-right"><label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter">${['ritual','attackers','duel'].map(kind => `<option value="${kind}">${escape(tk('encounter.' + kind))}</option>`).join('')}</select></label>
      <label class="bsim-checkbox" id="${ID}-lizard-row"><input type="checkbox" id="${ID}-lizard">${escape(tk('lizard'))}</label>
      <label class="bsim-checkbox" id="${ID}-worm-row"><input type="checkbox" id="${ID}-worm">${escape(tk('worm'))}</label>
      <div id="${ID}-enemy-setup"><p>${escape(tk('unknownEnemies'))}</p>${enemies}</div>
      <div class="bsim-btn-row">${button('start')}${button('again')}</div>
      <div id="${ID}-ritual-rolls">${field('roll-player', 'roll.player')}${field('roll-enemy', 'roll.enemy')}</div>
      <div id="${ID}-attacker-rolls">${ROLLS.slice(2).map(key => field('roll-' + key, 'roll.' + key)).join('')}${button('round')}</div>
      <div class="bsim-btn-row" id="${ID}-actions"></div><p class="bsim-status" id="${ID}-result" role="status" aria-live="polite"></p>
      <details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list bsim-status" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.textContent = t('battlesim.title'); trigger.style.display = 'none';
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    el('close').addEventListener('click', close);
    overlay.addEventListener('click', event => {if (event.target === overlay) close();});
    overlay.addEventListener('keydown', event => {if (event.key === 'Escape') {event.stopPropagation(); close();}});
    el('encounter').addEventListener('change', mode); mode();
    el('apply').addEventListener('click', () => change(data => {
      if (data.fight && !data.fight.outcome) return;
      data.character = Object.fromEntries(FIELDS.map(key => [key, number(key)]));
    }));
    el('start').addEventListener('click', () => change(data => {
      if (!data.character || data.fight) return;
      const kind = el('encounter').value;
      const options = {lizard: el('lizard').checked, wormAloft: el('worm').checked};
      if (kind === 'attackers') options.enemies = ATTACKERS.map((_, index) => ({
        defence: number('enemy-' + index + '-defence'), stamina: number('enemy-' + index + '-stamina'),
      }));
      data.fight = {...startFight(kind, data.character, options), name: tk('encounter.' + kind)};
    }));
    el('again').addEventListener('click', () => change(data => {if (data.fight?.outcome) data.fight = null;}));
    el('round').addEventListener('click', () => advance());
    el('actions').addEventListener('click', event => {
      const target = event.target.closest('button[data-section]');
      if (target && el('actions').contains(target)) advance(Number(target.dataset.section));
    });
    el('spend').addEventListener('click', () => change(data => {
      if (!data.character || data.fight) return;
      data.character.stamina = spendSpell(data.character.stamina, el('spell').value, el('staff').checked).stamina;
    }));
    registerShortcut({button: trigger, overlay, open, close});
  }
  return {init, render, open, close, setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) close();
  }};
}

const panel = createTrueMagicPanel({document, t, getRun: currentPlaythrough, getBookId: () => currentBookId,
  saveState, showAlert, getButtonRow: getPlayBtnRow,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  },
});
export function initSim757() {panel.init();}
export function renderSim757() {panel.render();}
export function setSim757Visible(visible) {panel.setVisible(visible);}
export { initSim757 as init, renderSim757 as render, setSim757Visible as setVisible };
