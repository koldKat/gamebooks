import { createCustomOpponentSetup } from '../../custom-setup.js';
import { definition, ENCOUNTERS, DEEP_RULES } from './definition.js';
import * as rules from './combat.js';
import * as effects from './effects.js';
import { createState } from './state.js';
import { currentBookId, currentPlaythrough, saveState } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';

const ID = definition.stateKey;
const batFishCount = () => ENCOUNTERS.find(entry=>entry.remainingBatFish).enemies.length;
const allyLimit = () => Math.max(0,...ENCOUNTERS.filter(entry=>entry.ally).map(entry=>entry.ally.stamina));
const FIELDS = ['skill', 'skillInitial', 'stamina', 'staminaInitial', 'luck', 'luckInitial', 'provisions', 'gold',
  'attackModifier', 'weaponModifier', 'nextFightModifier'];
const EQUIPMENT = ['unarmed', 'swiftstinger', 'talisman', 'anemoneRing'];
const SIGNED = new Set(['attackModifier', 'weaponModifier', 'nextFightModifier']);
const active = fight => Boolean(fight && !fight.outcome);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createDemonsPanel({ document, t, getRun, getBookId, saveState, showAlert, showConfirm,
  getButtonRow, registerShortcut = () => {} }) {
  const tk = (key, params) => t(definition.i18nPrefix + '.' + key, params);
  let customSetup;
  const enemyLabel = enemy => enemy.displayName || tk('enemy.' + (enemy.key ?? enemy.name));
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({ currentBookId: getBookId(), currentPlaythrough: getRun, saveState }));
  let shownRun, rendered;
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const input = (key, optional = false) => `<label class="inv-edit-row" id="${ID}-${key}-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${SIGNED.has(key) ? -1000 : key.endsWith('Initial') || key === 'previousOgreStamina' || key === 'remainingBatFish' ? 1 : 0}" max="${key === 'remainingBatFish' ? batFishCount() : key === 'allyStamina' ? allyLimit() : SIGNED.has(key) ? 1000 : 10000}" step="1"${optional ? '' : ' required'}></label>`;
  const checkbox = key => `<label class="bsim-checkbox" id="${ID}-${key}-row"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  function number(key, optional = false) {
    const field = el(key), raw = field.value.trim(), value = Number(raw);
    if (optional && !raw) return undefined;
    if (!raw || !Number.isSafeInteger(value) || value < Number(field.min) || value > Number(field.max)) {
      field.closest('details')?.setAttribute('open', ''); field.focus(); throw new RangeError('Invalid field');
    }
    return value;
  }
  function close() { el('overlay')?.classList.remove('active'); rendered = null; }
  function selected() { return ENCOUNTERS.find(encounter => encounter.section === Number(el('encounter').value)) ?? {section: 0, custom: true, enemies: []}; }
  function setup() {
    return { encounter: el('encounter').value, target: el('target').value,
      remainingBatFish: el('remainingBatFish').value, previousOgreStamina: el('previousOgreStamina').value,
      allyStamina: el('allyStamina').value, axeFish: el('axeFish').checked, sawFish: el('sawFish').checked,
      preWoundApplied: el('preWoundApplied').checked,
      enemyStamina: [...el('enemyOverrides').querySelectorAll('input')].map(field => field.value) };
  }
  function character(dead = false) {
    const result = Object.fromEntries(FIELDS.map(key => [key, number(key)]));
    for (const key of EQUIPMENT) result[key] = el(key).checked;
    result.dead = dead || !result.stamina;
    return rules.validateCharacter(result);
  }
  function change(update) {
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) { close(); return; }
    try { if (store.change(data => { data.setup = setup(); update(data); })) render(true); }
    catch { showAlert(tk('invalid')); }
  }
  function confirmed(message, update) {
    const run = getRun(), previous = store.read();
    showConfirm(tk(message), () => {
      if (getRun() === run && store.read() === previous && Number(getBookId()) === definition.id) change(update);
    });
  }
  function report(data, fight) {
    data.fight = fight; data.character = structuredClone(fight.player);
    for (const event of fight.events) {
      if (event.kind === 'attack') data.log.push(tk('attack', { ...event, enemy: enemyLabel(fight.enemies[event.enemy]) }));
      else if (event.kind === 'allyAttack') data.log.push(tk('allyAttack', {
        ...event, victim: event.victim === 'player' ? tk('you') : tk('enemy.dolphin'),
      }));
      else if (event.kind === 'luck' || event.kind === 'talisman') data.log.push(tk('luckResult', {
        roll: event.roll ?? tk('talisman'), result: tk(event.lucky ? 'lucky' : 'unlucky'),
      }));
      else if (event.kind === 'curse') data.log.push(tk('curseRoll', event));
      else if (event.damage !== undefined) data.log.push(tk('damage', { damage: event.damage,
        target: event.kind === 'outgoing' ? enemyLabel(fight.enemies[event.enemy])
          : event.kind === 'allyIncoming' ? tk('enemy.dolphin') : tk('you') }));
    }
    if (fight.outcome) {
      data.log.push(tk('status.' + fight.outcome));
      if (fight.destination) data.log.push(tk('destination', { section: fight.destination }));
      if (fight.config.rememberOgre && fight.reason === 'surrender') data.setup.previousOgreStamina = String(fight.ogreStamina);
    }
  }
  function ruleNotes(config) {
    const notes = [];
    for (const [flag, key] of [['remainingBatFish', 'batFish'], ['training', 'practice'], ['injuredOgre', 'ogre'],
      ['victoryHits', 'grouper'], ['trapped', 'clam'], ['noPrecombatRecovery', 'noRecovery'], ['mercyAt', 'mercy'],
      ['ally', 'ally'], ['krakenInjuries', 'kraken'], ['curse', 'witch'], ['anemoneRing', 'ring'], ['playerFloor', 'nonfatal']]) {
      if (config[flag]) notes.push(tk('rule.' + key));
    }
    if (config.preWound) notes.push(tk('rule.preWound', { damage: config.preWound }));
    if (config.incomingDamage === DEEP_RULES.noteIncomingDamage) notes.push(tk('rule.snakes'));
    if (config.mode) notes.push(tk('rule.' + config.mode));
    if (config.attackModifier) notes.push(tk('rule.slime'));
    if (config.escape?.damage === 0 && !config.escape.fatal) notes.push(tk('rule.freeEscape'));
    return notes.length ? notes.join('\n') : tk('rule.standard');
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (Number(getBookId()) !== definition.id || !getRun() || getRun() !== shownRun) { close(); return; }
    const data = store.read();
    if (!data || !force && data === rendered) return;
    rendered = data;
    const hero = data.character, fight = data.fight, busy = active(fight), pending = Boolean(fight?.pending.length);
    const deciding = pending || Boolean(fight?.mercyPending), dead = !hero || hero.dead || !hero.stamina;
    for (const key of FIELDS) { el(key).value = hero?.[key] ?? ''; el(key).disabled = busy; }
    for (const key of EQUIPMENT) { el(key).checked = hero?.[key] ?? false; el(key).disabled = busy; }
    el('encounter').value = data.setup.encounter ?? '0';
    customSetup.render();
    const config = selected();
    for (const key of ['remainingBatFish', 'previousOgreStamina', 'allyStamina']) el(key).value = data.setup[key] ?? (key === 'remainingBatFish' ? String(batFishCount()) : '');
    for (const key of ['axeFish', 'sawFish', 'preWoundApplied']) el(key).checked = data.setup[key] ?? false;
    for (const [key, visible] of [['remainingBatFish', config.remainingBatFish], ['previousOgreStamina', config.injuredOgre],
      ['allyStamina', config.ally], ['axeFish', config.krakenInjuries], ['sawFish', config.krakenInjuries], ['preWoundApplied', config.preWound]]) {
      el(key + '-row').hidden = !visible; el(key).disabled = busy;
    }
    el('contextNote').textContent = ruleNotes(busy ? fight.config : config);
    el('enemyOverrides').innerHTML = config.enemies.map((enemy, index) => `<label class="inv-edit-row"><span>${escape(enemyLabel(enemy))}</span><input class="inv-edit-input" type="number" min="1" max="10000" step="1" placeholder="${enemy.stamina}" value="${escape(data.setup.enemyStamina?.[index] ?? '')}"${busy ? ' disabled' : ''}></label>`).join('');
    for (const key of ['encounter', 'apply', 'roll']) el(key).disabled = busy;
    el('start').disabled = busy || dead; el('again').disabled = busy || !fight; el('cancel').disabled = !busy;
    const noRecovery = busy || dead || config.noPrecombatRecovery;
    el('eat').disabled = noRecovery || !hero.provisions || hero.stamina >= hero.staminaInitial;
    for (const key of ['strength', 'fortune', 'sauna']) el(key).disabled = noRecovery;
    el('testLuck').disabled = busy || dead || !hero.luck;
    el('testTalisman').disabled = busy || dead || !hero.talisman;
    el('round').disabled = !busy || deciding;
    el('swiftAttack').disabled = !busy || deciding || !hero.swiftstinger;
    el('useLuck').disabled = !busy || !pending || !hero.luck;
    el('useTalisman').disabled = !busy || !pending || !hero.talisman;
    el('skipLuck').disabled = !busy || !pending;
    el('escape').disabled = !busy || deciding || !fight.config.escape || fight.trapped;
    el('freeFoot').disabled = !busy || deciding || !fight.trapped;
    for (const key of ['spare', 'continueFight']) el(key).disabled = !busy || !fight.mercyPending;
    const available = rules.targets(fight);
    el('target').innerHTML = available.map(index => `<option value="${index}">${escape(enemyLabel(fight.enemies[index]))}</option>`).join('');
    if (available.includes(Number(data.setup.target))) el('target').value = data.setup.target;
    el('target').disabled = !busy || deciding || available.length < 2;
    el('opponents').innerHTML = fight ? `<table class="bsim-combat-table"><thead><tr><th>${escape(tk('opponents'))}</th><th>${escape(tk('skill'))}</th><th>${escape(tk('stamina'))}</th></tr></thead><tbody>${fight.enemies.map(enemy => `<tr><td>${escape(enemyLabel(enemy))}</td><td>${enemy.skill}</td><td>${enemy.stamina}/${enemy.staminaInitial}</td></tr>`).join('')}</tbody></table>` : '';
    const status = [dead ? tk('dead') : tk('ready')];
    if (fight) {
      status.length = 0;
      status.push(tk('rounds', fight));
      if (fight.ally) status.push(tk('allyStatus', fight.ally));
      if (fight.outcome) {
        status.push(tk('status.' + fight.outcome), tk('reason.' + fight.reason));
        if (fight.destination) status.push(tk('destination', { section: fight.destination }));
      } else if (fight.mercyPending) status.push(tk('mercyPrompt'));
      else if (pending) status.push(tk('pending', { damage: fight.pending[0].damage * (fight.pending[0].multiplier ?? 1) }));
    }
    el('status').textContent = status.join('\n');
    el('log').textContent = data.log.join('\n');
    el('history').textContent = data.history.slice(-30).reverse().map(item => item.enemy + ': ' + tk('status.' + item.outcome)).join('\n');
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
      <div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><details open><summary>${escape(tk('character'))}</summary>${FIELDS.map(key => input(key)).join('')}<div class="bsim-btn-row">${button('roll')}${button('apply')}${button('eat')}${button('testLuck')}${button('testTalisman')}</div></details><details><summary>${escape(tk('equipment'))}</summary>${EQUIPMENT.map(checkbox).join('')}<p>${escape(tk('recoveryNote'))}</p><div class="bsim-btn-row">${button('strength')}${button('fortune')}${button('sauna')}</div></details></div>
      <div class="bsim-col bsim-col-right"><label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter">${ENCOUNTERS.map(encounter => `<option value="${encounter.section}">${escape(tk('encounter.' + encounter.section))} (${encounter.section})</option>`).join('')}</select></label><p class="bsim-status" id="${ID}-contextNote"></p><details><summary>${escape(tk('fightSetup'))}</summary>${input('remainingBatFish')}${input('previousOgreStamina', true)}${input('allyStamina', true)}${checkbox('axeFish')}${checkbox('sawFish')}${checkbox('preWoundApplied')}<p>${escape(tk('overridesNote'))}</p><div id="${ID}-enemyOverrides"></div></details><div class="bsim-btn-row">${button('start')}${button('again')}${button('cancel')}</div>
      <div id="${ID}-opponents"></div><label class="inv-edit-row"><span>${escape(tk('target'))}</span><select class="inv-edit-input" id="${ID}-target"></select></label><div class="bsim-btn-row">${['round', 'swiftAttack', 'useLuck', 'useTalisman', 'skipLuck', 'freeFoot', 'escape', 'spare', 'continueFight'].map(button).join('')}</div><p class="bsim-status" id="${ID}-status" role="status" aria-live="polite"></p><details open><summary>${escape(tk('log'))}</summary><div class="bsim-status bsim-log" id="${ID}-log"></div></details><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-status bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    customSetup = createCustomOpponentSetup({document, id: ID, t, language: 'bg', selectKey: "encounter", getRun, getData: () => store.read(),
      fields: [{key: 'skill', label: tk('skill'), max: 10000}, {key: 'stamina', label: tk('stamina'), min: 1, max: 10000}],
      presets: ENCOUNTERS.flatMap(entry => entry.enemies.map(enemy => ({...enemy, displayName: enemyLabel(enemy)})))});
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.textContent = t('battlesim.title'); trigger.style.display = 'none';
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    el('close').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    el('encounter').addEventListener('change', () => change(data => {
      if (active(data.fight)) return;
      if (data.character) data.character = character(data.character.dead);
      data.setup.enemyStamina = []; data.setup.target = '';
    }));
    el('target').addEventListener('change', () => change(() => {}));
    el('roll').addEventListener('click', () => {
      const update = data => { if (!active(data.fight)) { data.character = rules.newCharacter(); data.fight = null; data.log.push(tk('newCharacter')); } };
      if (store.read()?.character) confirmed('rollConfirm', update); else change(update);
    });
    el('apply').addEventListener('click', () => {
      const update = data => { if (!active(data.fight)) { data.character = character(); data.fight = null; } };
      if (store.read()?.character?.dead) confirmed('restoreConfirm', update); else change(update);
    });
    el('start').addEventListener('click', () => change(data => {
      if (!data.character || active(data.fight) || data.character.dead) return;
      data.character = character(data.character.dead);
      const config = selected(), remainingBatFish = config.remainingBatFish ? number('remainingBatFish') : undefined;
      const enemyStamina = [...el('enemyOverrides').querySelectorAll('input')].map(field => {
        const raw = field.value.trim(), value = Number(raw);
        if (!raw) return undefined;
        if (!Number.isSafeInteger(value) || value < 1 || value > 10000) { field.focus(); throw new RangeError('Invalid enemy health'); }
        return value;
      }).slice(0, remainingBatFish ?? config.enemies.length);
      const fight = rules.startFight(config.section, data.character, customSetup.settings(data, { remainingBatFish, enemyStamina: config.custom ? undefined : enemyStamina,
        previousOgreStamina: config.injuredOgre ? number('previousOgreStamina', true) : undefined,
        allyStamina: config.ally ? number('allyStamina', true) : undefined,
        axeFish: el('axeFish').checked, sawFish: el('sawFish').checked, preWoundApplied: el('preWoundApplied').checked }));
      fight.name = config.custom ? fight.config.name : tk('encounter.' + config.section); report(data, fight);
    }));
    el('round').addEventListener('click', () => change(data => report(data, rules.round(data.fight, Number(el('target').value)))));
    el('swiftAttack').addEventListener('click', () => change(data => report(data, rules.round(data.fight, Number(el('target').value), undefined, { swiftstinger: true }))));
    for (const [key, mode] of [['useLuck', 'luck'], ['useTalisman', 'talisman'], ['skipLuck', 'skip']]) {
      el(key).addEventListener('click', () => change(data => report(data, rules.resolveWound(data.fight, mode))));
    }
    el('escape').addEventListener('click', () => change(data => report(data, rules.escapeFight(data.fight))));
    el('freeFoot').addEventListener('click', () => change(data => report(data, rules.freeFoot(data.fight))));
    for (const [key, spare] of [['spare', true], ['continueFight', false]]) el(key).addEventListener('click', () => change(data => report(data, rules.decideMercy(data.fight, spare))));
    el('again').addEventListener('click', () => change(data => { if (!active(data.fight)) data.fight = null; }));
    el('cancel').addEventListener('click', () => confirmed('cancelConfirm', data => {
      if (active(data.fight)) report(data, { ...data.fight, outcome: 'cancelled', reason: 'cancelled', pending: [], events: [], destination: null });
    }));
    for (const [key, effect] of [['eat', effects.eat], ['strength', effects.restoreStrength], ['fortune', effects.restoreFortune]]) {
      el(key).addEventListener('click', () => change(data => { if (!active(data.fight) && !selected().noPrecombatRecovery) data.character = effect(data.character); }));
    }
    el('sauna').addEventListener('click', () => confirmed('saunaConfirm', data => {
      if (!active(data.fight) && !selected().noPrecombatRecovery) data.character = effects.sauna(data.character);
    }));
    for (const [key, talisman] of [['testLuck', false], ['testTalisman', true]]) el(key).addEventListener('click', () => change(data => {
      if (active(data.fight)) return;
      const result = effects.testLuck(data.character, undefined, { talisman }); data.character = result.character;
      data.log.push(tk('luckResult', { roll: result.roll ?? tk('talisman'), result: tk(result.lucky ? 'lucky' : 'unlucky') }));
    }));
    registerShortcut({ button: trigger, overlay, open, close });
  }
  return { init, render, open, close, setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) { close(); shownRun = null; }
  } };
}

const panel = createDemonsPanel({ document, t, getRun: currentPlaythrough, getBookId: () => currentBookId,
  saveState, showAlert, showConfirm, getButtonRow: getPlayBtnRow,
  registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', { getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  },
});
export function initSim718() { panel.init(); }
export function renderSim718() { panel.render(); }
export function setSim718Visible(visible) { panel.setVisible(visible); }
export { initSim718 as init, renderSim718 as render, setSim718Visible as setVisible };
