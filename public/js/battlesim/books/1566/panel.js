// Present optional Shinté encounters, current combat values and explicit chart decisions.
import { definition, ENCOUNTERS, RULES, loadRoster } from './definition.js';
import { startFight, attack, resolveK, chooseZeroColumn, switchWeapon, useNet, retreat, cancelFight, integer } from '../../engines/shinte/core.js';
import { encounterRules, missileDamage, turtleRecovery } from './effects.js';
import { createState } from './state.js';
import { createOpponentEditor } from '../../opponents.js';
import { currentBookId, currentPlaythrough, saveState, apiFetch } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';

const ID = definition.stateKey;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const active = fight => Boolean(fight && !fight.outcome);
const heroFields = ['cs', 'ds', 'pp', 'maxPP', 'sp', 'maxSP', 'agility', 'guile'];
const styles = ['snake', 'wolf', 'tiger', 'horse', 'eagle', 'monkey', 'turtle'];
export const loadData = () => loadRoster(apiFetch);

export function createShintePanel({document, t, getRun, getBookId, saveState, showAlert, showConfirm,
  getButtonRow, getEncounters = () => ENCOUNTERS, getRules = () => RULES, registerShortcut = () => {}}) {
  const tk = (key, args) => t(definition.i18nPrefix + '.' + key, args);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId: getBookId(), currentPlaythrough: getRun, saveState}));
  let shownRun, rendered, editor, pendingShown;
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const numeric = (key, min = 0) => `<input class="inv-edit-input" id="${ID}-${key}" type="number" min="${min}" max="10000" step="1" autocomplete="off">`;
  const row = (key, control) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span>${control}</label>`;
  const checkbox = key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}"> ${escape(tk(key))}</label>`;
  function close() { el('overlay')?.classList.remove('active'); rendered = null; }
  function change(update) {
    if (shownRun !== getRun() || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) { close(); return; }
    try { if (store.change(update)) render(true); } catch (error) { showAlert(error.message || tk('invalid')); }
  }
  function setup() {
    return {hero: Object.fromEntries(heroFields.map(key => [key, el(key).value])),
      section: el('encounter').value, first: el('first').value, zeroColumn: el('zeroColumn').value,
      styles: Object.fromEntries(styles.map(key => [key, el(key).checked])),
      shinGuards: el('shinGuards').checked, ambush: el('ambush').checked, indigo: el('indigo').checked,
      retreatAllowed: el('retreatAllowed').checked, openingDamage: el('openingDamage').value,
      opponents: editor.snapshot()};
  }
  function saveSetup() {
    if (!active(store.read()?.fight)) change(data => { data.setup = setup(); });
  }
  function selectPreset(preset) {
    if (active(store.read()?.fight)) return;
    change(data => {
      data.setup = {...setup(), section: String(preset.section), first: '', openingDamage: 0, opponents: [{...preset}]};
      editor.set(data.setup.opponents); editor.fixCount(true);
    });
  }
  function makeEditor(options) {
    editor = createOpponentEditor({document, id: ID, t,
      fields: [{key:'cs', label:tk('enemyCs'), min:0, max:10000}, {key:'ds', label:tk('enemyDs'), min:0, max:10000},
        {key:'pp', label:tk('enemyPp'), min:1, max:10000}],
      presets: getEncounters(), onSelect: selectPreset});
    editor.set(options.opponents); editor.fixCount(options.section && options.section !== 'custom');
    editor.element.addEventListener('change', saveSetup);
    editor.element.addEventListener('input', saveSetup);
    el('editor').replaceChildren(editor.element);
  }
  function eventText(event, fight) {
    if (event.kind === 'attack') return tk('attackLog', {actor:event.actor === 'player' ? tk('player') : event.enemy,
      enemy:event.actor === 'player' ? event.enemy : fight.receiver,
      dice:event.dice?.join(' + ') ?? event.total, total:event.total, difference:event.difference,
      column:event.columnLabel, result:event.result});
    if (event.kind === 'opening') return tk('openingLog', event);
    if (event.kind === 'manual-k') return tk('manualLog', event);
    if (event.kind === 'net') return tk('netLog', {dice:event.dice.join(' + '), damage:event.damage});
    if (event.kind === 'turtle') return tk('turtleLog', event);
    if (event.kind === 'weapon-switch') return tk('weaponLog', event);
    return tk(event.kind);
  }
  function updateFight(data, fight) {
    data.fight = fight;
    if (fight.receiver === 'Tsai') data.setup.hero.pp = fight.playerPP;
    data.setup.hero.cs = fight.player.cs; data.setup.hero.ds = fight.player.ds;
    data.log.push(...fight.events.map(event => eventText(event, fight)));
    if (fight.outcome && !fight.recorded) data.log.push(tk('status.' + fight.outcome));
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (shownRun !== getRun() || Number(getBookId()) !== definition.id) { close(); return; }
    const data = store.read();
    if (!data || !force && rendered === data) return;
    rendered = data;
    const options = data.setup, fight = data.fight, locked = active(fight), pending = locked && fight.pending;
    if (!editor) makeEditor(options);
    for (const key of heroFields) { el(key).value = options.hero[key]; el(key).disabled = locked; }
    for (const key of styles) { el(key).checked = options.styles[key] === true; el(key).disabled = locked; }
    for (const key of ['shinGuards', 'ambush', 'indigo', 'retreatAllowed']) { el(key).checked = options[key] === true; el(key).disabled = locked; }
    el('encounter').value = options.section || 'custom'; el('encounter').disabled = locked;
    for (const key of ['first', 'openingDamage']) { el(key).value = options[key]; el(key).disabled = locked; }
    el('zeroColumn').value = locked ? fight.zeroColumn ?? '' : options.zeroColumn;
    el('zeroColumn').disabled = Boolean(pending);
    editor.lock(locked);
    const preset = getEncounters().find(item => String(item.section) === options.section);
    if (preset?.modifierRule === 'stealth') { el('openingDamage').value = options.hero.guile; el('openingDamage').disabled = true; }
    el('encounterNote').textContent = preset?.note || tk('customNote');
    el('missiles').hidden = !preset?.missileRules;
    for (const key of ['missileType', 'missileQuantity', 'calculateMissile']) el(key).disabled = locked;
    if (preset?.missileRules) {
      const spec = getRules().missiles[preset.missileRules], selected = el('missileType').value;
      el('missileType').innerHTML = Object.keys(spec).map(key => `<option value="${escape(key)}">${escape(tk('missile.' + key))}</option>`).join('');
      if (Object.hasOwn(spec, selected)) el('missileType').value = selected;
    }
    el('start').disabled = locked;
    el('attack').disabled = !locked || Boolean(pending);
    el('cancel').disabled = !locked;
    el('net').disabled = !locked || !fight.netAllowed || fight.netUsed || Boolean(pending);
    el('turtleRecovery').disabled = !fight?.turtleEligible || !fight.turns || fight.turtleUsed || Boolean(pending)
      || ['cancelled', 'retreated', 'loss'].includes(fight?.outcome);
    el('retreat').disabled = !locked || !fight.retreatAllowed || fight.next !== 'player' || Boolean(pending);
    for (const key of ['switchWeapon', 'newCs', 'newDs']) el(key).disabled = !locked || fight.next !== 'player' || Boolean(pending);
    el('manual').hidden = !pending;
    if (pending && pendingShown !== pending) {
      el('manualPlayerPp').value = fight.playerPP; el('manualPlayerPp').max = fight.playerMaxPP;
      el('manualEnemyPp').value = fight.enemies[fight.enemyIndex].pp;
      el('manualEnemyPp').max = fight.enemies[fight.enemyIndex].maxPP;
    }
    pendingShown = pending;
    el('status').textContent = tk('status.' + (fight?.outcome ?? (pending ? 'manual' : fight ? 'active' : 'ready')));
    el('totals').textContent = fight ? tk('totals', {receiver:fight.receiver, pp:fight.playerPP,
      enemy:fight.enemies[Math.min(fight.enemyIndex, fight.enemies.length - 1)].name,
      enemyPP:fight.outcome === 'win' ? 0 : fight.enemies[fight.enemyIndex].pp}) : '';
    el('next').textContent = locked ? tk('next', {actor:tk(fight.next)}) : '';
    el('log').innerHTML = data.log.slice(-80).map(text => '<div>' + escape(text) + '</div>').join('');
    el('history').innerHTML = data.history.slice(-40).reverse().map(entry => '<div>'
      + escape(entry.enemy + ': ' + tk('status.' + entry.outcome)) + '</div>').join('');
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    if (!getRules()) { showAlert(tk('unavailable')); return; }
    shownRun = getRun(); editor = null; pendingShown = null;
    try { if (!store.read()) store.change(() => {}); el('overlay').classList.add('active'); render(true); el('close').focus(); }
    catch (error) { close(); showAlert(error.message || tk('invalid')); }
  }
  function init() {
    if (el('overlay')) return;
    const choose = (key, choices) => `<select class="inv-edit-input" id="${ID}-${key}">${choices.map(([value,label]) => `<option value="${escape(value)}">${escape(label)}</option>`).join('')}</select>`;
    const first = choose('first', [['',tk('choose')], ['player',tk('player')], ['enemy',tk('enemy')]]);
    const encounter = choose('encounter', [['custom',tk('custom')], ...getEncounters().map(item => [String(item.section),item.displayName])]);
    const zero = choose('zeroColumn', [['',tk('choose')], ...getRules().chart.columnLabels.map((label,index) => [index,label])]);
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p>${row('encounter',encounter)}<details open><summary>${escape(tk('hero'))}</summary>${heroFields.map(key => row(key,numeric(key))).join('')}</details><details><summary>${escape(tk('proficiencies'))}</summary>${styles.map(checkbox).join('')}</details>${['shinGuards','ambush','indigo','retreatAllowed'].map(checkbox).join('')}${row('first',first)}<p id="${ID}-encounterNote"></p><div id="${ID}-editor"></div>${row('openingDamage',numeric('openingDamage'))}<details id="${ID}-missiles"><summary>${escape(tk('missiles'))}</summary>${row('missileType',choose('missileType',[]))}${row('missileQuantity',numeric('missileQuantity',1))}${button('calculateMissile')}<p>${escape(tk('missileNote'))}</p></details>${row('zeroColumn',zero)}<p>${escape(tk('zeroNote'))}</p>${row('manualTotal',numeric('manualTotal',2))}<div class="bsim-btn-row">${button('start')}${button('attack')}${button('retreat')}${button('cancel')}</div><div class="bsim-btn-row">${button('net')}${button('turtleRecovery')}</div><details><summary>${escape(tk('switchWeapon'))}</summary>${row('newCs',numeric('newCs'))}${row('newDs',numeric('newDs'))}${button('switchWeapon')}</details><div id="${ID}-manual" hidden><p>${escape(tk('kNote'))}</p>${row('manualPlayerPp',numeric('manualPlayerPp'))}${row('manualEnemyPp',numeric('manualEnemyPp'))}${button('resolveK')}</div></div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-totals"></p><p id="${ID}-next"></p><div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); close(); } });
    for (const key of [...heroFields, ...styles, 'shinGuards','ambush','indigo','retreatAllowed','first','openingDamage']) el(key).addEventListener('change', saveSetup);
    el('encounter').addEventListener('change', () => {
      const preset = getEncounters().find(item => String(item.section) === el('encounter').value);
      if (preset) selectPreset(preset);
      else change(data => { data.setup = {...setup(), section:'custom', first:'', openingDamage:0}; editor.fixCount(false); });
    });
    el('zeroColumn').addEventListener('change', () => {
      if (active(store.read()?.fight)) change(data => updateFight(data, chooseZeroColumn(data.fight,el('zeroColumn').value,getRules().chart)));
      else saveSetup();
    });
    el('start').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError(tk('active'));
      const options = setup(), hero = Object.fromEntries(heroFields.map(key => [key,integer(options.hero[key])]));
      if (hero.pp > hero.maxPP || hero.sp > hero.maxSP) throw new RangeError(tk('maxHealth'));
      const preset = getEncounters().find(item => String(item.section) === options.section), enemies = editor.read();
      if (preset && enemies.length !== 1) throw new RangeError(tk('singleGroup'));
      const config = encounterRules(preset,hero,options);
      data.setup = {...options,hero}; data.log = [];
      updateFight(data,startFight({player:hero,enemies,zeroColumn:options.zeroColumn,...config}));
    }));
    el('attack').addEventListener('click', () => change(data => updateFight(data,attack(data.fight,getRules().chart,{total:el('manualTotal').value}))));
    el('resolveK').addEventListener('click', () => change(data => updateFight(data,resolveK(data.fight,{playerPP:el('manualPlayerPp').value,enemyPP:el('manualEnemyPp').value}))));
    el('switchWeapon').addEventListener('click', () => change(data => updateFight(data,switchWeapon(data.fight,{cs:el('newCs').value,ds:el('newDs').value}))));
    el('net').addEventListener('click', () => change(data => updateFight(data,useNet(data.fight))));
    el('retreat').addEventListener('click', () => change(data => updateFight(data,retreat(data.fight))));
    el('turtleRecovery').addEventListener('click', () => change(data => {
      const result = turtleRecovery(data.setup.hero,data.fight,data.fight?.turtleEligible);
      data.setup.hero = result.hero; updateFight(data,result.fight);
    }));
    el('calculateMissile').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError(tk('active'));
      const options = setup(), preset = getEncounters().find(item => String(item.section) === options.section);
      const spec = getRules().missiles[preset?.missileRules];
      const damage = missileDamage(spec,el('missileType').value,el('missileQuantity').value,options.hero,options.styles);
      data.setup = {...options,openingDamage:damage};
    }));
    el('cancel').addEventListener('click', () => {
      const run = getRun(), before = store.read();
      showConfirm(tk('cancelConfirm'), () => {
        if (getRun() === run && store.read() === before) change(data => updateFight(data,cancelFight(data.fight)));
      });
    });
    registerShortcut({button:trigger,overlay,open,close});
  }
  return {init,render,open,close,setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) { close(); shownRun = null; }
  }};
}

const panel = createShintePanel({document,t,getRun:currentPlaythrough,getBookId:() => currentBookId,saveState,
  showAlert,showConfirm,getButtonRow:getPlayBtnRow,registerShortcut({button,overlay,open,close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:() => button,getOverlay:() => overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id),open,close});
  }});
export function initSim1566() { panel.init(); }
export function renderSim1566() { panel.render(); }
export function setSim1566Visible(visible) { panel.setVisible(visible); }
export {initSim1566 as init,renderSim1566 as render,setSim1566Visible as setVisible};
