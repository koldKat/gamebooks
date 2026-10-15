import { definition, ENCOUNTERS, SPELL_ENCOUNTERS, encounterFor } from './definition.js';
import * as rules from './combat.js';
import * as effects from './effects.js';
import { createState } from './state.js';
import { currentBookId, currentPlaythrough, saveState } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';

const ID = definition.stateKey;
const STATS = ['skill', 'skillInitial', 'stamina', 'staminaInitial', 'luck', 'luckInitial'];
const RESOURCES = ['gold', 'provisions', 'mealsToday', 'goblinTeeth', 'giantTeeth', 'pebbles', 'medicines', 'attackModifier'];
const FLAGS = ['libraUsed', 'libraRenounced', 'chainmail', 'nosePlugs', 'elementalStaff', 'wax', 'poisoned', 'antidote'];
const ENTRIES = [...ENCOUNTERS, ...SPELL_ENCOUNTERS].sort((a, b) => a.section - b.section);
const active = fight => Boolean(fight && !fight.outcome);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createSerpentsPanel({ document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, registerShortcut = () => {} }) {
  const tk = (key, params) => t(definition.i18nPrefix + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({ currentBookId: getBookId(), currentPlaythrough: getRun, saveState }));
  let shownRun, rendered;
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const checkbox = key => `<label class="bsim-checkbox" id="${ID}-${key}-row"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  const input = (key, min = key === 'attackModifier' ? -1000 : key.endsWith('Initial') ? 1 : 0, max = 10000) => `<label class="inv-edit-row" id="${ID}-${key}-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${min}" max="${max}" step="1" required></label>`;
  const select = (key, values) => `<label class="inv-edit-row" id="${ID}-${key}-row"><span>${escape(tk(key))}</span><select class="inv-edit-input" id="${ID}-${key}">${values.map(([value, label]) => `<option value="${value}">${escape(tk(label))}</option>`).join('')}</select></label>`;
  const selected = () => encounterFor(Number(el('encounter').value));
  const setup = () => ({ encounter: el('encounter').value, count: el('count').value, summonCount: el('summonCount').value,
    excludeEnemy: el('excludeEnemy').value, hasComponent: el('hasComponent').checked, testLuck: el('testLuck').checked,
    enemyOrder: el('enemyOrder').value, target: el('target').value, protectedFromDamage: el('protectedFromDamage').checked });
  function number(key) {
    const field = el(key), value = Number(field.value);
    if (!field.value.trim() || !Number.isSafeInteger(value) || value < Number(field.min) || value > Number(field.max)) {
      field.closest('details')?.setAttribute('open', ''); field.focus(); throw new RangeError('Invalid field');
    }
    return value;
  }
  function character() {
    const result = { ...(store.read()?.character ?? rules.newCharacter(el('role').value, () => 1)),
      ...Object.fromEntries([...STATS, ...RESOURCES].map(key => [key, number(key)])) };
    for (const key of FLAGS) result[key] = el(key).checked;
    result.role = el('role').value; result.dead = !result.stamina;
    return rules.validateCharacter(result);
  }
  function close() { el('overlay')?.classList.remove('active'); rendered = null; }
  function change(update) {
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) { close(); return; }
    try { if (store.change(data => { data.setup = setup(); update(data); })) render(true); }
    catch { showAlert(tk('invalid')); }
  }
  function confirmed(message, update) {
    const run = getRun(), before = store.read();
    showConfirm(tk(message), () => { if (getRun() === run && store.read() === before && Number(getBookId()) === definition.id) change(update); });
  }
  function report(data, fight) {
    const previous = data.fight;
    data.fight = fight; data.character = structuredClone(fight.player);
    for (const event of fight.events) {
      const enemy = event.enemy == null ? '' : tk('enemy.' + fight.enemies[event.enemy].key);
      if (event.kind === 'damage') data.log.push(tk('damage', { target: event.target === 'player' ? tk('you') : enemy, damage: event.damage }));
      else if (event.kind === 'attack') data.log.push(tk('attack', { ...event, enemy }));
      else if (event.kind === 'allyAttack') data.log.push(tk('allyAttack', { ...event, enemy, ally: tk('enemy.' + fight.allies[event.ally].key) }));
      else if (event.kind === 'luck') data.log.push(tk('luckResult', { roll: event.roll, result: tk(event.lucky ? 'lucky' : 'unlucky') }));
      else if (event.kind === 'arrow') data.log.push(tk('arrowResult', { roll: event.roll, result: tk(event.hit ? 'hit' : 'miss') }));
      else if (event.kind === 'escape') data.log.push(tk('escapeResult', { roll: event.roll, result: tk(event.escaped ? 'escaped' : 'trapped') }));
      else if (event.kind === 'acid') data.log.push(tk('acidResult', { roll: event.roll ?? '-', damage: event.damage }));
      else if (event.kind === 'confusion') data.log.push(tk('confusionResult', event));
      else if (event.kind === 'fireCost') data.log.push(tk('fireCost', event));
      else if (event.kind === 'poisonStarts') data.log.push(tk('poisonStarts'));
    }
    if (fight.noticeDestination && fight.noticeDestination !== previous?.noticeDestination) data.log.push(tk('destination', { section: fight.noticeDestination }));
    if (fight.outcome && !previous?.outcome) data.log.push(tk('status.' + fight.outcome));
    if (fight.destination && fight.destination !== previous?.destination) data.log.push(tk('destination', { section: fight.destination }));
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (Number(getBookId()) !== definition.id || !getRun() || getRun() !== shownRun) { close(); return; }
    const data = store.read();
    if (!data || !force && data === rendered) return;
    rendered = data;
    const hero = data.character, fight = data.fight, busy = active(fight), pending = Boolean(fight?.pending.length);
    const dead = !hero || hero.dead || !hero.stamina;
    for (const key of [...STATS, ...RESOURCES]) { el(key).value = hero?.[key] ?? ''; el(key).disabled = busy; }
    for (const key of FLAGS) { el(key).checked = hero?.[key] ?? false; el(key).disabled = busy; }
    el('role').value = hero?.role ?? 'warrior'; el('role').disabled = busy;
    for (const key of ['encounter', 'count', 'summonCount', 'excludeEnemy', 'enemyOrder']) el(key).value = data.setup[key] ?? ({ encounter: '27', count: '1', summonCount: '0', excludeEnemy: '0', enemyOrder: '1,2,3' })[key];
    for (const key of ['hasComponent', 'testLuck', 'protectedFromDamage']) el(key).checked = data.setup[key] ?? false;
    const config = selected();
    for (const [key, shown] of [['count', config.requireManualCount], ['summonCount', config.summonedGoblins],
      ['excludeEnemy', config.excludeEnemy], ['hasComponent', Boolean(config.component)], ['testLuck', config.success?.optionalEntryLuck], ['enemyOrder', config.chooseOrder]]) {
      el(key + '-row').hidden = !shown; el(key).disabled = busy;
    }
    el('componentName').textContent = config.component ? tk('component.' + config.component) : '';
    for (const key of ['encounter', 'roll', 'apply']) el(key).disabled = busy;
    el('start').disabled = busy || dead || hero.role !== 'wizard' && Boolean(config.spell);
    el('cancel').disabled = !busy;
    const current = busy ? fight.config : config;
    el('note').textContent = tk('note.' + (current.mode ?? 'standard'));
    const available = rules.targets(fight);
    el('target').innerHTML = available.map(index => `<option value="${index}">${escape(tk('enemy.' + fight.enemies[index].key))}</option>`).join('');
    if (available.includes(Number(data.setup.target))) el('target').value = data.setup.target;
    el('target').disabled = !busy || pending || available.length < 2;
    el('round').disabled = !busy || pending || dead;
    el('escape').hidden = !busy || current.mode !== 'rock-demon' || fight.escaped;
    el('escape').disabled = pending || Boolean(current.mirrorAlly && fight.allies.some(ally => ally.stamina > 0) && fight.mirrorEscapeRound >= fight.rounds);
    el('spare').hidden = !rules.canSpare(fight);
    el('flee').hidden = !busy || !current.fleeDestination;
    el('flee').disabled = pending;
    for (const key of ['useLuck', 'skipLuck']) el(key).hidden = !pending;
    el('useLuck').disabled = !hero?.luck;
    for (const key of ['eat', 'nextDay', 'medicine', 'luckCheck', 'libraRestore', 'libraCure', 'libraRescue', 'useAntidote', 'liftEarthSerpent', 'protectedFromDamage']) el(key).disabled = busy || dead;
    if (!busy && !dead) {
      el('eat').disabled = !hero.provisions; el('medicine').disabled = !hero.medicines || hero.role !== 'wizard'; el('luckCheck').disabled = !hero.luck;
      for (const key of ['libraRestore', 'libraCure', 'libraRescue']) el(key).disabled = hero.libraUsed || hero.libraRenounced;
      el('useAntidote').disabled = !hero.antidote;
    }
    if (busy && !pending && !dead) for (const key of ['libraRestore', 'libraCure', 'libraRescue']) el(key).disabled = hero.libraUsed || hero.libraRenounced;
    const actors = fight ? [...fight.enemies.map(enemy => ({ ...enemy, ally: false })), ...fight.allies.map(ally => ({ ...ally, ally: true }))] : [];
    el('opponents').innerHTML = actors.length ? `<table class="bsim-combat-table"><thead><tr><th>${escape(tk('opponents'))}</th><th>${escape(tk('skill'))}</th><th>${escape(tk('stamina'))}</th></tr></thead><tbody>${actors.map(actor => `<tr><td>${escape(tk('enemy.' + actor.key))}${actor.ally ? ' · ' + escape(tk('ally')) : ''}</td><td>${actor.skill}</td><td>${actor.stamina}/${actor.staminaInitial}</td></tr>`).join('')}</tbody></table>` : '';
    const status = [dead ? tk('dead') : tk('ready')];
    if (fight) {
      status.length = 0; status.push(tk('rounds', fight));
      if (fight.outcome) { status.push(tk('status.' + fight.outcome)); if (fight.destination) status.push(tk('destination', { section: fight.destination })); }
      else if (pending) status.push(tk('pending', { target: fight.pending[0].kind === 'player-hit' ? tk('enemy.' + fight.enemies[fight.pending[0].enemy].key) : tk('you'), damage: fight.pending[0].damage }));
    }
    el('status').textContent = status.join('\n'); el('log').textContent = data.log.join('\n');
    el('history').textContent = data.history.slice(-30).reverse().map(item => item.enemy + ': ' + tk('status.' + item.outcome)).join('\n');
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    shownRun = getRun();
    try { if (!store.read()) store.change(() => {}); el('overlay').classList.add('active'); render(true); el('close').focus(); }
    catch { close(); showAlert(tk('invalid')); }
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><details open><summary>${escape(tk('character'))}</summary>${select('role', [['warrior','warrior'],['wizard','wizard']])}${STATS.map(key => input(key)).join('')}<div class="bsim-btn-row">${button('roll')}${button('apply')}</div></details><details><summary>${escape(tk('equipment'))}</summary>${RESOURCES.map(key => input(key)).join('')}${FLAGS.map(checkbox).join('')}</details><details><summary>${escape(tk('recovery'))}</summary><p>${escape(tk('recoveryNote'))}</p><div class="bsim-btn-row">${['eat','nextDay','medicine','luckCheck','libraRestore','libraCure','libraRescue'].map(button).join('')}</div></details></div><div class="bsim-col bsim-col-right"><label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter">${ENTRIES.map(item => `<option value="${item.section}">${escape(tk('encounter.' + item.section))} (${item.section})</option>`).join('')}</select></label><p class="bsim-status" id="${ID}-note"></p><details open><summary>${escape(tk('fightSetup'))}</summary>${input('count',1,1000)}${input('summonCount',0,1000)}${select('excludeEnemy', [[0,'enemy.centaur1'],[1,'enemy.centaur2'],[2,'enemy.centaur3']])}<label class="inv-edit-row" id="${ID}-enemyOrder-row"><span>${escape(tk('enemyOrder'))}</span><input class="inv-edit-input" id="${ID}-enemyOrder" value="0,1,2"></label>${checkbox('hasComponent')}<p id="${ID}-componentName"></p>${checkbox('testLuck')}</details><div class="bsim-btn-row">${button('start')}${button('cancel')}</div><div id="${ID}-opponents"></div><label class="inv-edit-row"><span>${escape(tk('target'))}</span><select class="inv-edit-input" id="${ID}-target"></select></label><div class="bsim-btn-row">${['round','escape','spare','flee','useLuck','skipLuck'].map(button).join('')}</div><p class="bsim-status" id="${ID}-status" role="status" aria-live="polite"></p><details open><summary>${escape(tk('log'))}</summary><div class="bsim-status bsim-log" id="${ID}-log"></div></details><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-status bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    el('eat').parentElement.insertAdjacentHTML('beforeend', button('useAntidote') + button('liftEarthSerpent'));
    el('eat').parentElement.insertAdjacentHTML('afterend', checkbox('protectedFromDamage'));
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.textContent = t('battlesim.title'); trigger.style.display = 'none';
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    el('close').addEventListener('click', close); overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    for (const key of ['encounter','count','summonCount','excludeEnemy','hasComponent','testLuck','enemyOrder','target','protectedFromDamage']) el(key).addEventListener('change', () => change(data => {
      if (data.character && !active(data.fight)) data.character = character();
      if (key === 'encounter') data.setup.enemyOrder = selected().excludeEnemy ? '1,2' : '1,2,3';
    }));
    el('roll').addEventListener('click', () => {
      const update = data => { if (!active(data.fight)) { data.character = rules.newCharacter(el('role').value); data.fight = null; data.log.push(tk('newCharacter')); } };
      if (store.read()?.character) confirmed('rollConfirm', update); else change(update);
    });
    el('apply').addEventListener('click', () => {
      const update = data => { if (!active(data.fight)) { data.character = character(); data.fight = null; } };
      if (store.read()?.character?.dead) confirmed('restoreConfirm', update); else change(update);
    });
    el('start').addEventListener('click', () => change(data => {
      if (active(data.fight) || !data.character || data.character.dead) return;
      data.character = character(); const config = selected();
      const options = { hasComponent: el('hasComponent').checked, testLuck: el('testLuck').checked };
      if (config.requireManualCount) options.count = number('count');
      if (config.summonedGoblins) options.summonCount = number('summonCount');
      if (config.excludeEnemy) options.excludeEnemy = Number(el('excludeEnemy').value);
      if (config.chooseOrder) options.enemyOrder = el('enemyOrder').value.split(',').map(value => Number(value.trim()) - 1);
      const fight = rules.startFight(config.section, data.character, options); fight.name = tk('encounter.' + config.section); report(data, fight);
    }));
    const action = (key, transform) => el(key).addEventListener('click', () => change(data => report(data, transform(data.fight))));
    action('round', fight => rules.round(fight, rules.targets(fight).length ? Number(el('target').value) : undefined));
    action('escape', rules.attemptEscape); action('spare', rules.spare); action('flee', rules.flee);
    action('useLuck', fight => rules.resolveLuck(fight,true)); action('skipLuck', fight => rules.resolveLuck(fight,false));
    el('cancel').addEventListener('click', () => confirmed('cancelConfirm', data => { if (active(data.fight)) report(data, { ...data.fight, outcome: 'cancelled', pending: [], events: [], destination: null }); }));
    for (const [key, effect] of [['eat',effects.eat],['medicine',effects.healingSpell],['nextDay',effects.nextDay],['useAntidote',effects.antidote],['libraRestore',value=>effects.useLibra(value,'restore')],['libraCure',value=>effects.useLibra(value,'cure')],['libraRescue',value=>effects.useLibra(value,'rescue')]]) {
      el(key).addEventListener('click', () => {
        const update = data => {
          if (active(data.fight)) {
            if (!key.startsWith('libra') || data.fight.pending.length) return;
            const fight = structuredClone(data.fight);
            fight.player = effect(fight.player); fight.events = [];
            if (key === 'libraRescue') { fight.outcome = 'continue'; fight.destination = null; }
            report(data,fight);
          } else data.character = effect(data.character);
          data.log.push(tk('effectUsed',{effect:tk(key)}));
        };
        if (key === 'nextDay' && store.read()?.character?.poisoned) confirmed('poisonDeadlineConfirm',update); else change(update);
      });
    }
    el('liftEarthSerpent').addEventListener('click', () => change(data => {
      if (active(data.fight)) return;
      const result = effects.liftEarthSerpent(data.character,el('protectedFromDamage').checked);
      data.character = result.character;
      data.log.push(tk('liftResult',{luck:result.luckRoll,skill:result.skillRoll??'-',result:tk(result.success?'lucky':'unlucky')}));
      if (result.destination) data.log.push(tk('destination',{section:result.destination}));
    }));
    el('luckCheck').addEventListener('click', () => change(data => { if (!active(data.fight)) { const result = rules.testLuck(data.character); data.character = result.character; data.log.push(tk('luckResult',{roll:result.roll,result:tk(result.lucky?'lucky':'unlucky')})); } }));
    registerShortcut({button:trigger,overlay,open,close});
  }
  return {init,render,open,close,setVisible(visible) { if (el('btn')) el('btn').style.display = visible ? '' : 'none'; if (!visible) { close(); shownRun = null; } }};
}

const panel = createSerpentsPanel({document,t,getRun:currentPlaythrough,getBookId:()=>currentBookId,saveState,showAlert,showConfirm,getButtonRow:getPlayBtnRow,
  registerShortcut({button,overlay,open,close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  },
});
export function initSim723() { panel.init(); }
export function renderSim723() { panel.render(); }
export function setSim723Visible(visible) { panel.setVisible(visible); }
export { initSim723 as init, renderSim723 as render, setSim723Visible as setVisible };
