import { definition, ENCOUNTERS, SPELLS } from './definition.js';
import * as rules from './combat.js';
import * as effects from './effects.js';
import { createState } from './state.js';
import { currentBookId, currentPlaythrough, saveState } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';

const ID = definition.stateKey;
const FIELDS = ['skill', 'skillInitial', 'stamina', 'staminaInitial', 'luck', 'luckInitial', 'provisions', 'gold', 'attackModifier'];
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const active = fight => Boolean(fight && !fight.outcome);

export function createTemplePanel({ document, t, getRun, getBookId, saveState, showAlert, showConfirm,
  getButtonRow, registerShortcut = () => {} }) {
  const tk = (key, params) => t(definition.i18nPrefix + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({ currentBookId: getBookId(), currentPlaythrough: getRun, saveState }));
  let shownRun, rendered;
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const input = key => `<label class="inv-edit-row" id="${ID}-${key}-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${key === 'attackModifier' ? -1000 : key.endsWith('Initial') || key === 'manualStamina' ? 1 : 0}" max="${key === 'attackModifier' ? 1000 : 10000}" step="1"></label>`;
  function number(key) {
    const field = el(key), raw = field.value.trim(), value = Number(raw);
    if (!raw || !Number.isSafeInteger(value) || value < Number(field.min) || value > Number(field.max)) {
      field.closest('details')?.setAttribute('open', ''); field.focus(); throw new RangeError('Invalid field');
    }
    return value;
  }
  function close() { el('overlay')?.classList.remove('active'); rendered = null; }
  function setup() {
    return { encounter: el('encounter').value, manualStamina: el('manualStamina').value,
      target: el('target').value, spell: el('spell').value, cost: el('cost').value };
  }
  function change(update) {
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) { close(); return; }
    try {
      if (store.change(d => { d.setup = setup(); update(d); })) render(true);
    } catch { showAlert(tk('invalid')); }
  }
  function confirmed(message, update) {
    const run = getRun(), previous = store.read();
    showConfirm(tk(message), () => {
      if (getRun() === run && store.read() === previous && Number(getBookId()) === definition.id) change(update);
    });
  }
  function character(dead = false) {
    const result = Object.fromEntries(FIELDS.map(key => [key, number(key)]));
    result.dagger = el('dagger').checked; result.dead = dead || !result.stamina;
    return rules.validateCharacter(result);
  }
  function report(d, fight) {
    d.fight = fight; d.character = structuredClone(fight.player);
    for (const event of fight.events) {
      const actor = fight.config.ally ? tk('enemy.' + fight.config.ally.key) : tk('you');
      if (event.kind === 'attack') d.log.push(tk('attack', { actor, ...event, enemy: tk('enemy.' + fight.enemies[event.enemy].key) }));
      else if (event.kind === 'luck') d.log.push(tk('luckResult', { ...event, result: tk(event.lucky ? 'lucky' : 'unlucky') }));
      else if (event.damage !== undefined) d.log.push(tk('damage', { damage: event.damage,
        target: event.kind === 'outgoing' ? tk('enemy.' + fight.enemies[event.enemy].key) : actor }));
      else d.log.push(tk('specialRoll', { rule: tk('rule.' + event.kind), roll: event.roll }));
    }
    if (fight.outcome) {
      d.log.push(tk('status.' + fight.outcome));
      if (fight.destination) d.log.push(tk('destination', { section: fight.destination }));
    }
  }
  function spellOptions(selectedCost) {
    const costs = SPELLS[el('spell').value];
    el('cost').innerHTML = costs.map(value => `<option value="${value}">${value}</option>`).join('');
    el('cost').value = costs.includes(Number(selectedCost)) ? String(selectedCost) : String(costs[0]);
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (Number(getBookId()) !== definition.id || !getRun() || getRun() !== shownRun) { close(); return; }
    const d = store.read();
    if (!d || !force && d === rendered) return;
    rendered = d;
    const busy = active(d.fight), hero = d.character, fight = d.fight;
    for (const key of FIELDS) { el(key).value = hero?.[key] ?? ''; el(key).disabled = busy; }
    el('dagger').checked = hero?.dagger ?? false; el('dagger').disabled = busy;
    el('encounter').value = d.setup.encounter ?? String(ENCOUNTERS[0].section);
    const selected = ENCOUNTERS.find(e => e.section === Number(el('encounter').value));
    el('manualStamina').value = d.setup.manualStamina ?? '';
    el('manualStamina-row').style.display = selected.manualStamina ? '' : 'none';
    el('unknownStatNote').hidden = !selected.manualStamina;
    el('contextNote').textContent = selected.section === 13 || selected.partialImmunity || selected.paralysis || selected.fireBreath
      || selected.fatalHit || selected.daggerPenalty || selected.simultaneous || selected.ally || selected.lightning
      || selected.manualStamina || selected.section === 380 ? tk('encounterRule.' + selected.section) : '';
    el('spell').value = d.setup.spell ?? 'door'; spellOptions(d.setup.cost);
    for (const key of ['encounter', 'manualStamina', 'spell', 'cost', 'apply', 'roll']) el(key).disabled = busy;
    const dead = !hero || hero.dead || !hero.stamina;
    el('start').disabled = busy || dead;
    el('again').disabled = busy || !fight;
    el('cancel').disabled = !busy;
    el('eat').disabled = busy || dead || !hero.provisions || hero.stamina >= hero.staminaInitial;
    el('cast').disabled = busy || dead || Number(el('cost').value) > hero.stamina;
    el('testLuck').disabled = busy || dead || !hero.luck;
    el('round').disabled = !busy || Boolean(fight.pending.length);
    el('useLuck').disabled = !busy || !fight.pending.length || !hero.luck || Boolean(fight.config.ally);
    el('skipLuck').disabled = !busy || !fight.pending.length;
    const available = rules.targets(fight);
    el('target').innerHTML = available.map(index => `<option value="${index}">${escape(tk('enemy.' + fight.enemies[index].key))}</option>`).join('');
    const target = Number(d.setup.target);
    if (available.includes(target)) el('target').value = String(target);
    el('target').disabled = !busy || Boolean(fight.pending.length) || available.length < 2;
    el('opponents').innerHTML = fight ? `<table class="bsim-combat-table"><thead><tr><th>${escape(tk('opponents'))}</th><th>${escape(tk('skill'))}</th><th>${escape(tk('stamina'))}</th></tr></thead><tbody>${fight.enemies.map(e => `<tr><td>${escape(tk('enemy.' + e.key))}</td><td>${e.skill}</td><td>${e.stamina}/${e.staminaInitial}</td></tr>`).join('')}</tbody></table>` : '';
    const status = [];
    if (hero?.dead) status.push(tk('dead'));
    if (fight) {
      if (fight.ally) status.push(tk('allyStatus', { ...fight.ally, name: tk('enemy.' + fight.ally.key) }));
      status.push(tk('rounds', fight));
      if (fight.outcome) {
        status.push(tk('status.' + fight.outcome));
        if (fight.reason) status.push(tk('reason.' + fight.reason));
        if (fight.destination) status.push(tk('destination', { section: fight.destination }));
      } else if (fight.pending.length) {
        const hit = fight.pending[0];
        status.push(tk('pending', { damage: hit.damage, target: hit.kind === 'outgoing' ? tk('enemy.' + fight.enemies[hit.enemy].key) : tk('you') }));
      }
    } else status.push(tk('ready'));
    el('status').textContent = status.join('\n');
    el('log').textContent = d.log.slice(-100).join('\n');
    el('history').textContent = d.history.slice(-30).reverse().map(h => h.enemy + ': ' + tk('status.' + h.outcome)).join('\n');
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    try { store.ensure(); shownRun = getRun(); el('overlay').classList.add('active'); render(true); el('close').focus(); }
    catch { close(); showAlert(tk('invalid')); }
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div>
      <div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><details open><summary>${escape(tk('character'))}</summary>${FIELDS.map(input).join('')}<label class="bsim-checkbox"><input type="checkbox" id="${ID}-dagger">${escape(tk('dagger'))}</label><div class="bsim-btn-row">${button('roll')}${button('apply')}${button('eat')}${button('testLuck')}</div></details>
      <details><summary>${escape(tk('spells'))}</summary><p>${escape(tk('spellNote'))}</p><label class="inv-edit-row"><span>${escape(tk('spell'))}</span><select class="inv-edit-input" id="${ID}-spell">${Object.keys(SPELLS).map(key => `<option value="${key}">${escape(tk('spell.' + key))}</option>`).join('')}</select></label><label class="inv-edit-row"><span>${escape(tk('cost'))}</span><select class="inv-edit-input" id="${ID}-cost"></select></label>${button('cast')}</details></div>
      <div class="bsim-col bsim-col-right"><label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter">${ENCOUNTERS.map(e => `<option value="${e.section}">${escape(tk('encounter.' + e.section))} (${e.section})</option>`).join('')}</select></label>${input('manualStamina')}<p id="${ID}-unknownStatNote">${escape(tk('unknownStatNote'))}</p><div class="bsim-btn-row">${button('start')}${button('again')}${button('cancel')}</div>
      <p id="${ID}-contextNote"></p><div id="${ID}-opponents"></div><label class="inv-edit-row"><span>${escape(tk('target'))}</span><select class="inv-edit-input" id="${ID}-target"></select></label><div class="bsim-btn-row">${button('round')}${button('useLuck')}${button('skipLuck')}</div><p class="bsim-status" id="${ID}-status" role="status" aria-live="polite"></p><details open><summary>${escape(tk('log'))}</summary><div class="bsim-status bsim-log" id="${ID}-log"></div></details><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-status bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.textContent = t('battlesim.title'); trigger.style.display = 'none';
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    el('close').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    for (const key of ['encounter', 'cost', 'target']) el(key).addEventListener('change', () => change(() => {}));
    el('spell').addEventListener('change', () => { spellOptions(); change(() => {}); });
    el('roll').addEventListener('click', () => {
      const update = d => { d.character = rules.newCharacter(); d.fight = null; d.log.push(tk('newCharacter')); };
      if (store.read()?.character) confirmed('rollConfirm', update); else change(update);
    });
    el('apply').addEventListener('click', () => {
      const update = d => { if (!active(d.fight)) { d.character = character(); d.fight = null; } };
      if (store.read()?.character?.dead) confirmed('restoreConfirm', update); else change(update);
    });
    el('start').addEventListener('click', () => change(d => {
      if (!d.character || active(d.fight) || d.character.dead) return;
      d.character = character(d.character.dead);
      const section = Number(el('encounter').value), config = ENCOUNTERS.find(e => e.section === section);
      const fight = rules.startFight(section, d.character, { manualStamina: config.manualStamina ? number('manualStamina') : null });
      fight.name = tk('encounter.' + section); report(d, fight);
    }));
    el('round').addEventListener('click', () => change(d => report(d, rules.round(d.fight, Number(el('target').value)))));
    el('useLuck').addEventListener('click', () => change(d => report(d, rules.resolveLuck(d.fight, true))));
    el('skipLuck').addEventListener('click', () => change(d => report(d, rules.resolveLuck(d.fight, false))));
    el('again').addEventListener('click', () => change(d => { if (!active(d.fight)) d.fight = null; }));
    el('cancel').addEventListener('click', () => confirmed('cancelConfirm', d => {
      if (active(d.fight)) { d.fight.outcome = 'cancelled'; d.fight.pending = []; }
    }));
    el('eat').addEventListener('click', () => change(d => { if (!active(d.fight)) d.character = effects.eat(d.character); }));
    el('cast').addEventListener('click', () => change(d => {
      if (active(d.fight)) return;
      const spell = el('spell').value, cost = Number(el('cost').value);
      d.character = effects.castSpell(d.character, spell, cost);
      d.log.push(tk('spellPaid', { spell: tk('spell.' + spell), cost }));
    }));
    el('testLuck').addEventListener('click', () => change(d => {
      if (active(d.fight)) return;
      const result = effects.testLuck(d.character); d.character = result.character;
      d.log.push(tk('luckResult', { roll: result.roll, result: tk(result.lucky ? 'lucky' : 'unlucky') }));
    }));
    registerShortcut({ button: trigger, overlay, open, close });
  }
  return { init, render, open, close, setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) { close(); shownRun = null; }
  } };
}

const panel = createTemplePanel({ document, t, getRun: currentPlaythrough, getBookId: () => currentBookId,
  saveState, showAlert, showConfirm, getButtonRow: getPlayBtnRow,
  registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', { getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  },
});
export function initSim710() { panel.init(); }
export function renderSim710() { panel.render(); }
export function setSim710Visible(visible) { panel.setVisible(visible); }
export { initSim710 as init, renderSim710 as render, setSim710Visible as setVisible };
