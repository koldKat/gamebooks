import { definition, ENCOUNTERS } from './definition.js';
import { prepareEncounter } from './combat.js';
import { createState } from './state.js';
import * as effects from './effects.js';
import * as combat from '../../engines/space-assassin/core.js';
import * as tank from '../../engines/space-assassin/tank.js';
import { tankRules } from './tank.js';
import { currentBookId, currentPlaythrough, saveState, apiFetch } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';
import { createOpponentEditor } from '../../opponents.js';

const ID = definition.stateKey;
const SCORES = ['skill', 'stamina', 'luck', 'armour'];
const ITEMS = ['pills', 'grenades', 'gravityBombs', 'nerveGas', 'energyBars'];
const FIELDS = [...SCORES, ...SCORES.map(key => key + 'Initial'), ...ITEMS];
const MAP = '/api/books/735/reading-images/99420122193e40f20e756d63c4b07736be49fcd3b0ff7708d3cc631f1ff4fd85.png';
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const active = battle => Boolean(battle && !battle.outcome);

export function createSpaceAssassinPanel({ document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow,
  authorizeImages = () => Promise.resolve(), registerShortcut = () => {} }) {
  const tk = (key, params) => t(definition.i18nPrefix + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({ currentBookId: getBookId(), currentPlaythrough: getRun, saveState }));
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const input = key => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="0" max="1000000" step="1" required></label>`;
  const select = (key, options) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><select class="inv-edit-input" id="${ID}-${key}">${options.map(value => `<option value="${value}">${escape(tk(key + '.' + value))}</option>`).join('')}</select></label>`;
  const check = key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  let shownRun, rendered, imageAccess, imageGeneration = 0, opponents, editorRun;

  function number(key) {
    const field = el(key), value = Number(field.value);
    if (!field.value.trim()) throw new RangeError('Missing field');
    return combat.integer(value);
  }
  function close() { el('overlay')?.classList.remove('active'); rendered = null; imageGeneration++; }
  function action(update) {
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) { close(); return; }
    try { if (store.change(update)) render(true); }
    catch { showAlert(tk('invalid')); }
  }
  function confirm(key, update) {
    const run = getRun(), original = store.read();
    showConfirm(tk(key), () => { if (getRun() === run && store.read() === original) action(update); });
  }
  function selected() { return ENCOUNTERS.find(entry => entry.section === Number(el('encounter').value))
    ?? {custom: true, requiresModeChoice: true, requiresEnemyWeaponChoice: true}; }
  function configure() {
    const preset = selected(), data = store.read(), locked = active(data?.fight) || active(data?.tank);
    el('mode-row').hidden = !preset?.requiresModeChoice;
    el('enemyWeapon-row').hidden = !preset?.requiresEnemyWeaponChoice || el('mode').value !== 'gunfire';
    el('modeNote').hidden = !preset?.requiresModeChoice;
    el('knowledge').disabled = locked || !preset?.knowledgeBonus;
    el('ballBearings').disabled = locked || !preset?.ballBearingPenalty;
    el('openingHit').disabled = locked || !preset?.optionalOpeningArmourLoss;
    if (!preset?.knowledgeBonus) el('knowledge').checked = false;
    if (!preset?.ballBearingPenalty) el('ballBearings').checked = false;
    if (!preset?.optionalOpeningArmourLoss) el('openingHit').checked = false;
  }
  function eventText(event) {
    const line = tk('event.' + event.kind, { amount: 0, damage: 0, target: 0, roll: '', ...event,
      target: (event.target ?? 0) + 1,
      actor: tk(event.actor === 'player' ? 'you' : 'opponent'),
      result: tk(event.failed ? 'ineffective' : event.kind === 'gas' ? 'hit' : event.blocked ? 'blocked' : event.hit ? 'hit' : 'miss'),
      lucky: tk(event.lucky ? 'lucky' : 'unlucky') });
    return line + (event.armourRoll !== undefined ? ' ' + tk('armourLine', event) : '');
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (Number(getBookId()) !== definition.id || getRun() !== shownRun || !getRun()) { close(); return; }
    const data = store.read();
    if (!data || !force && data === rendered) return;
    rendered = data;
    const battle = data.battleKind === 'tank' ? data.tank : data.fight;
    const locked = active(data.fight) || active(data.tank), player = data.character;
    if (editorRun !== getRun()) {
      editorRun = getRun();
      el('encounter').value = data.setup?.encounter ?? '0';
      opponents.set(data.setup?.opponents ?? selected().enemies);
    }
    opponents.lock(locked); opponents.fixCount(!selected().custom);
    for (const key of FIELDS) { el(key).value = player?.[key] ?? (ITEMS.includes(key) ? 0 : ''); el(key).disabled = locked; }
    el('weapon').value = player?.weapon ?? 'unarmed';
    for (const key of ['weapon', 'encounter', 'mode', 'enemyWeapon', 'newCharacter', 'saveCharacter', 'replaceSuit']) el(key).disabled = locked;
    const alive = Boolean(player?.stamina), needsLoadout = player?.loadoutPurchased === false;
    el('start').disabled = el('startTank').disabled = locked || !alive || needsLoadout;
    el('cancel').disabled = !locked;
    el('loadout').hidden = !needsLoadout;
    el('buyLoadout').disabled = locked || !needsLoadout;
    el('budget').textContent = needsLoadout ? tk('budgetLine', { amount: player.equipmentBudget }) : '';
    const activeTank = active(data.tank);
    el('pill').disabled = !alive || activeTank || !player?.pills || player.stamina >= player.staminaInitial;
    el('energyBar').disabled = !alive || activeTank || !player?.energyBars || player.stamina >= player.staminaInitial;
    el('testLuck').disabled = !alive || activeTank;
    el('replaceSuit').disabled = locked || !alive || Boolean(player?.replacementSuitEquipped);
    const fight = data.fight, liveFight = active(fight);
    el('combatActions').hidden = !liveFight;
    el('opening').disabled = !fight?.openingPending;
    el('round').disabled = !liveFight || fight?.openingPending;
    const precombat = liveFight && !fight.rounds && !fight.openingPending;
    el('grenade').disabled = !precombat || !fight.grenadeAllowed || !player?.grenades || fight.grenadesUsed >= fight.grenadeLimit;
    el('gas').disabled = !precombat || ![108, 312].includes(fight.encounterSection) || !player?.nerveGas;
    el('gravityBomb').disabled = !precombat || fight.encounterSection !== 267 || !player?.gravityBombs;
    el('escapeFight').disabled = !liveFight || fight.openingPending || fight.escapeCost === null;
    el('status').textContent = battle ? tk('status.' + (battle.outcome ?? 'active')) : data.notice ? tk(data.notice) : tk('ready');
    const destination = battle?.destination ?? (battle?.outcome === 'win' ? battle.winDestination : null);
    el('destination').textContent = destination ? tk('destinationLine', { section: destination }) : '';
    el('opponents').textContent = data.battleKind === 'combat' && fight ? fight.enemies.map(enemy => tk('opponentLine', enemy)).join('\n') : '';
    el('tankActions').hidden = !activeTank;
    el('tankMoves').innerHTML = '';
    el('resolveTank').disabled = !activeTank || data.tank.phase !== 'encounter';
    el('tankStatus').textContent = '';
    if (data.tank && data.battleKind === 'tank') {
      const position = tankRules.positions[data.tank.section];
      el('tankStatus').textContent = tk('tankLine', { ...data.tank, marker: position.marker, facing: tk('facing.' + position.facing) });
      if (activeTank && data.tank.phase === 'move') el('tankMoves').innerHTML = position.routes.map(section => {
        const next = tankRules.positions[section];
        return `<button type="button" class="inv-add-btn bsim-action-btn" data-tank-move="${section}">${escape(tk('moveLine', { marker: next.marker, facing: tk('facing.' + next.facing) }))}</button>`;
      }).join('');
    }
    el('map').hidden = !data.tank || data.battleKind !== 'tank';
    if (!el('map').hidden) {
      const generation = imageGeneration, run = shownRun;
      imageAccess.then(() => {
        if (generation !== imageGeneration || getRun() !== run || Number(getBookId()) !== definition.id || !el('overlay').classList.contains('active') || store.read()?.battleKind !== 'tank') return;
        if (el('map').getAttribute('src') !== MAP) el('map').src = MAP;
      }).catch(() => {
        if (generation === imageGeneration && getRun() === run && Number(getBookId()) === definition.id && el('overlay').classList.contains('active')) { el('map').hidden = true; el('destination').textContent = tk('imagesUnavailable'); }
      });
    }
    el('log').innerHTML = (battle?.events ?? data.events ?? []).slice(-60).map(event => '<div>' + escape(eventText(event)) + '</div>').join('');
    el('history').innerHTML = data.history.slice(-40).reverse().map(value => '<div>' + escape(value.enemy + ': ' + tk('status.' + value.outcome)) + '</div>').join('');
    el('luckResult').textContent = data.lastLuck ? tk('event.luck', { ...data.lastLuck, lucky: tk(data.lastLuck.lucky ? 'lucky' : 'unlucky') }) : '';
    configure();
  }
  function recover(data, apply) {
    const player = apply(data.character);
    data.character = player;
    if (active(data.fight)) data.fight = { ...data.fight, player };
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    shownRun = getRun(); imageGeneration++;
    imageAccess = Promise.resolve().then(authorizeImages); imageAccess.catch(() => {});
    try {
      if (!store.read()) store.change(() => {});
      el('overlay').classList.add('active'); render(true); el('close').focus();
    } catch { close(); showAlert(tk('invalid')); }
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-side"><div class="bsim-side-title">${escape(tk('character'))}</div>${SCORES.map(input).join('')}<details><summary>${escape(tk('initialScores'))}</summary>${SCORES.map(key => input(key + 'Initial')).join('')}</details>${ITEMS.map(input).join('')}${select('weapon', ['unarmed', 'lash', 'blaster'])}<div class="bsim-btn-row">${button('newCharacter')}${button('saveCharacter')}</div><div class="bsim-btn-row">${button('pill')}${button('energyBar')}${button('testLuck')}${button('replaceSuit')}</div></div><details id="${ID}-loadout" open><summary>${escape(tk('loadout'))}</summary><p id="${ID}-budget"></p>${select('startingWeapon', ['lash', 'blaster'])}${input('buyGrenades')}${input('buyBombs')}${input('buyArmour')}${button('buyLoadout')}</details></div><div class="bsim-col bsim-col-right"><label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter">${ENCOUNTERS.map(entry => `<option value="${entry.section}">${escape(tk('encounter.' + entry.section))} (${entry.section})</option>`).join('')}</select></label><div id="${ID}-mode-row">${select('mode', ['', 'melee', 'gunfire'])}</div><div id="${ID}-enemyWeapon-row">${select('enemyWeapon', ['', 'none', 'unarmed', 'lash', 'blaster'])}</div><p id="${ID}-modeNote">${escape(tk('modeNote'))}</p>${check('knowledge')}${check('ballBearings')}<div class="bsim-btn-row">${button('start')}${button('startTank')}${button('cancel')}</div><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><div class="bsim-status" id="${ID}-destination"></div><div class="bsim-status" id="${ID}-opponents"></div><div class="bsim-btn-row" id="${ID}-combatActions">${['opening', 'round', 'grenade', 'gas', 'gravityBomb', 'escapeFight'].map(button).join('')}</div><div id="${ID}-tankActions">${button('resolveTank')}<div class="bsim-btn-row" id="${ID}-tankMoves"></div></div><p id="${ID}-tankStatus"></p><img class="bsim-galleon-diagram" id="${ID}-map" alt="${escape(tk('mapAlt'))}" hidden><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details><div class="bsim-log" id="${ID}-log"></div></div></div></div>`;
    document.body.appendChild(overlay);
    el('encounter').insertAdjacentHTML('afterbegin', `<option value="0">${escape(t('battlesim.editor.bg.custom'))}</option>`);
    opponents = createOpponentEditor({document, id: ID, t, language: 'bg',
      fields: [{key: 'skill', label: tk('skill')}, {key: 'stamina', label: tk('stamina'), min: 1}],
      presets: ENCOUNTERS.flatMap(entry => entry.enemies)});
    el('encounter').closest('label').after(opponents.element);
    el('encounter').addEventListener('change', () => {
      if (active(store.read()?.fight) || active(store.read()?.tank)) return;
      if (selected().enemies) opponents.set(selected().enemies);
      opponents.fixCount(!selected().custom);
    });
    const luckResult = document.createElement('p'); luckResult.id = ID + '-luckResult';
    el('testLuck').parentElement.after(luckResult);
    const openingHit = document.createElement('label'); openingHit.className = 'bsim-checkbox';
    openingHit.innerHTML = `<input type="checkbox" id="${ID}-openingHit">${escape(tk('openingHit'))}`;
    el('ballBearings').parentElement.after(openingHit);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    el('encounter').addEventListener('change', configure); el('mode').addEventListener('change', configure);
    el('newCharacter').addEventListener('click', () => {
      const update = data => { data.character = effects.rollCharacter(); data.fight = data.tank = null; data.notice = null; data.lastLuck = null; data.events = []; };
      if (store.read()?.character) confirm('newCharacterConfirm', update); else action(update);
    });
    el('saveCharacter').addEventListener('click', () => action(data => {
      if (active(data.fight) || active(data.tank)) throw new RangeError('Battle is active');
      data.character = combat.validateCharacter({ ...data.character, ...Object.fromEntries(FIELDS.map(key => [key, number(key)])),
        weapon: el('weapon').value, loadoutPurchased: data.character?.loadoutPurchased ?? true });
    }));
    el('buyLoadout').addEventListener('click', () => action(data => {
      data.character = effects.buyLoadout(data.character, { weapon: el('startingWeapon').value,
        grenades: number('buyGrenades'), gravityBombs: number('buyBombs'), armour: number('buyArmour') });
    }));
    for (const key of ['buyGrenades', 'buyBombs', 'buyArmour']) el(key).value = 0;
    el('start').addEventListener('click', () => action(data => {
      if (active(data.fight) || active(data.tank) || data.character?.loadoutPurchased === false) throw new RangeError('Not ready');
      const result = prepareEncounter({ ...data.character, weapon: el('weapon').value }, Number(el('encounter').value), {
        mode: selected().mode ?? el('mode').value, weapon: el('weapon').value, enemyWeapon: el('enemyWeapon').value,
        knowledge: el('knowledge').checked, ballBearings: el('ballBearings').checked, openingHit: el('openingHit').checked,
        opponents: opponents.read() });
      data.setup = {encounter: el('encounter').value, opponents: opponents.snapshot()};
      Object.assign(data, { character: result.player, fight: result.fight, tank: null, battleKind: 'combat',
        encounterName: selected().custom ? result.fight.enemies.map(enemy => enemy.name).join(' / ')
          : tk('encounter.' + el('encounter').value), notice: result.outcome, events: result.events ?? [] });
    }));
    el('startTank').addEventListener('click', () => action(data => {
      if (active(data.fight) || active(data.tank) || data.character?.loadoutPurchased === false) throw new RangeError('Not ready');
      data.tank = tank.startTank(data.character, tankRules); data.fight = null; data.battleKind = 'tank'; data.encounterName = tk('tankTitle'); data.notice = null;
    }));
    el('cancel').addEventListener('click', () => confirm('cancelConfirm', data => {
      if (active(data.fight)) data.fight = { ...data.fight, outcome: 'cancelled' };
      if (active(data.tank)) data.tank = { ...data.tank, outcome: 'cancelled' };
    }));
    const actions = { opening: combat.openingVolley, round: combat.round, grenade: combat.throwGrenade,
      gas: effects.useNerveGas, gravityBomb: effects.useGravityBomb, escapeFight: combat.escapeFight };
    for (const [key, apply] of Object.entries(actions)) el(key).addEventListener('click', () => action(data => { data.fight = apply(data.fight); }));
    el('pill').addEventListener('click', () => action(data => recover(data, combat.takePill)));
    el('energyBar').addEventListener('click', () => action(data => recover(data, effects.eatEnergyBar)));
    el('testLuck').addEventListener('click', () => action(data => recover(data, player => {
      const result = combat.testLuck(player);
      data.lastLuck = { roll: result.roll, before: result.before, lucky: result.lucky };
      if (active(data.fight)) data.fight = { ...data.fight, events: [...data.fight.events, { kind: 'luck', ...data.lastLuck }].slice(-160) };
      return result.player;
    })));
    el('replaceSuit').addEventListener('click', () => confirm('suitConfirm', data => { data.character = effects.replaceSuit(data.character); }));
    el('resolveTank').addEventListener('click', () => action(data => { data.tank = tank.resolveTankEncounter(data.tank, tankRules); }));
    el('tankMoves').addEventListener('click', event => {
      const button = event.target.closest('[data-tank-move]');
      if (button) action(data => { data.tank = tank.moveTank(data.tank, Number(button.dataset.tankMove), tankRules); });
    });
    registerShortcut({ button: trigger, overlay, open, close });
  }
  return { init, render, open, close, setVisible(visible) { if (el('btn')) el('btn').style.display = visible ? '' : 'none'; if (!visible) close(); } };
}

const panel = createSpaceAssassinPanel({ document, t, getRun: currentPlaythrough, getBookId: () => currentBookId, saveState,
  showAlert, showConfirm, getButtonRow: getPlayBtnRow,
  async authorizeImages() {
    const response = await apiFetch('/api/books/735/reading-matter');
    if (!response.ok) throw new Error('Reading image access unavailable');
    await response.arrayBuffer();
  },
  registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', { getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  },
});
export function initSim735() { panel.init(); }
export function renderSim735() { panel.render(); }
export function setSim735Visible(visible) { panel.setVisible(visible); }
export { initSim735 as init, renderSim735 as render, setSim735Visible as setVisible };
