import {definition, CREW, COMPANIONS, ENCOUNTERS, encounterFor} from './definition.js';
import * as combat from './combat.js';
import {createState} from './state.js';
import {createOpponentEditor} from '../../opponents.js';
import {currentBookId, currentPlaythrough, saveState} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';

const ID = definition.stateKey, MEMBERS = [...CREW, ...COMPANIONS];
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const active = fight => Boolean(fight && !fight.outcome);
const PRESETS = [...new Map(ENCOUNTERS.flatMap(e => e.enemies).map(e => [[e.displayName, e.skill, e.stamina].join('|'), e])).values()];
const CREW_FIELDS = ['skill', 'skillInitial', 'stamina', 'staminaInitial'];
const SHIP_FIELDS = ['weapons', 'weaponsInitial', 'shields', 'shieldsInitial'];

export function createStarshipPanel({document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, registerShortcut = () => {}}) {
  const tk = (key, params) => t(definition.i18nPrefix + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId: getBookId(), currentPlaythrough: getRun, saveState}));
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const input = (id, label = id) => `<label class="inv-edit-row"><span>${escape(tk(label))}</span><input class="inv-edit-input" type="number" id="${ID}-${id}" min="${id === 'attackModifier' ? -1000 : 0}" max="10000" step="1" required></label>`;
  const checkbox = key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}"><span>${escape(tk(key))}</span></label>`;
  const select = (key, options) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><select class="inv-edit-input" id="${ID}-${key}">${options}</select></label>`;
  let crewOptions;
  let shownRun, rendered, editor, setupRun;
  function close() { el('overlay')?.classList.remove('active'); rendered = null; }
  function change(update) {
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) { close(); return; }
    try { if (store.change(update)) render(true); } catch { showAlert(tk('invalid')); }
  }
  function confirm(key, update) {
    const run = getRun(), before = store.read();
    showConfirm(tk(key), () => { if (getRun() === run && store.read() === before) change(update); });
  }
  function party() { return MEMBERS.filter(key => el('party-' + key).checked); }
  function snapshot() {
    return {section: Number(el('encounter').value), mode: el('mode').value, opponents: editor.snapshot(), party: party(),
      attackModifier: Number(el('attackModifier').value), enemyFirst: el('enemyFirst').checked,
      phaserSetting: el('phaserSetting').value, madKey: el('madKey').value};
  }
  function saveSetup() { if (!active(store.read()?.fight)) change(data => { data.setup = snapshot(); }); }
  function events(data, fight) {
    data.fight = fight;
    const crewName = key => tk('crew.' + key);
    const enemyName = i => fight.enemies[i]?.displayName || tk('opponent');
    for (const event of fight.events) {
      const params = {...event};
      if (event.kind === 'hand') {
        params.players = Object.entries(event.playerScores).map(([key, score]) => crewName(key) + ': ' + score).join('; ');
        params.enemies = Object.entries(event.enemyScores).map(([i, score]) => enemyName(i) + ': ' + score).join('; ');
      }
      params.player = event.player ? crewName(event.player) : '';
      params.enemy = event.enemy != null ? enemyName(event.enemy) : '';
      params.target = event.kind === 'phaser' ? event.outgoing ? enemyName(event.target) : crewName(event.target)
        : event.outgoing ? params.enemy : params.player;
      params.shooter = event.kind === 'phaser' ? event.outgoing ? crewName(event.shooter) : enemyName(event.shooter) : '';
      params.result = tk(event.hit ? 'hit' : 'miss'); params.side = tk(event.outgoing ? 'ourShip' : 'enemyShip');
      data.log.push(tk('event.' + event.kind, params));
    }
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id) { close(); return; }
    const data = store.read(); if (!data || !force && rendered === data) return; rendered = data;
    const fight = data.fight, locked = active(fight), c = data.character;
    if (setupRun !== getRun()) {
      setupRun = getRun(); const setup = data.setup ?? {};
      el('encounter').value = setup.section ?? 0; el('mode').value = setup.mode ?? 'hand';
      el('attackModifier').value = setup.attackModifier ?? 0; el('enemyFirst').checked = setup.enemyFirst ?? false;
      el('phaserSetting').value = setup.phaserSetting ?? 'kill'; el('madKey').value = setup.madKey ?? 'guard1';
      for (const key of MEMBERS) el('party-' + key).checked = (setup.party ?? ['captain']).includes(key);
      editor.set(setup.opponents ?? [{displayName: '', skill: 7, stamina: 7}]);
    }
    const preset = encounterFor(el('encounter').value), mode = preset?.mode ?? el('mode').value;
    editor.lock(locked); editor.fixCount(Boolean(preset) || mode === 'ship');
    el('mode').disabled = locked || Boolean(preset);
    for (const key of ['encounter', 'attackModifier', 'enemyFirst', 'phaserSetting', 'madKey', 'newCharacter', 'newCharacterQuick', 'saveCharacter', 'crew']) el(key).disabled = locked;
    el('attackModifier').disabled = locked;
    el('enemyFirst').disabled = locked || preset?.enemyFirst != null;
    for (const key of CREW_FIELDS) { el('crew-' + key).value = c?.crew[el('crew').value]?.[key] ?? ''; el('crew-' + key).disabled = locked || !c; }
    for (const key of SHIP_FIELDS) { el(key).value = c?.ship[key] ?? ''; el(key).disabled = locked || !c; }
    for (const key of ['luck', 'luckInitial']) { el(key).value = c?.[key] ?? ''; el(key).disabled = locked || !c; }
    el('helmet').checked = c?.helmet ?? false; el('helmet').disabled = locked || !c;
    for (const key of MEMBERS) el('party-' + key).disabled = locked || Boolean(preset?.party) || !c?.crew[key]?.stamina || c.crew[key].replaced;
    el('planet').disabled = locked || !c?.crew.medical.stamina || !c.crew.captain.stamina;
    el('replace').disabled = locked || !c || el('crew').value === 'captain' || !CREW.includes(el('crew').value)
      || c.crew[el('crew').value].stamina > 0 || c.crew[el('crew').value].replaced;
    el('testLuck').disabled = locked || !c?.crew.captain.stamina;
    el('start').disabled = locked || !c?.crew.captain.stamina || c.ship.destroyed;
    el('round').disabled = !locked || Boolean(fight.pending || fight.pendingConflict);
    el('cancel').disabled = !locked;
    el('surrender').disabled = !locked || !fight.config.surrender || fight.config.surrenderBelow != null
      && !fight.party.some(key => fight.character.crew[key].stamina < fight.config.surrenderBelow);
    el('reroll-options').hidden = !fight?.pending;
    el('reroll-note').textContent = fight?.pending ? tk('rerollNote', {roll: fight.pending.rolls.player.macom.join(' + ')}) : '';
    el('conflict-options').hidden = !fight?.pendingConflict || Boolean(fight.outcome);
    el('conflictTarget').innerHTML = (fight?.pendingConflict?.options ?? []).map(key => `<option value="${key}">${escape(fight.pendingConflict.outgoing ? fight.enemies[key].displayName : tk('crew.' + key))}</option>`).join('');
    el('targets').innerHTML = (locked && mode !== 'ship' ? fight.party.filter(key => fight.character.crew[key].stamina > 0) : []).map((key, i) => {
      const targets = fight.enemies.map((e, n) => ({...e, n})).filter(e => e.stamina > (fight.config.enemyFloor ?? 0));
      return `<label class="inv-edit-row"><span>${escape(tk('crew.' + key))}</span><select class="inv-edit-input" data-target="${key}">${targets.map((e, n) => `<option value="${e.n}" ${n === i % targets.length ? 'selected' : ''}>${escape(e.displayName || tk('opponent'))}</option>`).join('')}</select></label>`;
    }).join('');
    el('encounter-note').textContent = preset ? tk('encounterNote.' + preset.section) : tk('customNote');
    el('status').textContent = fight ? tk('outcome.' + (fight.outcome ?? 'active'), {round: fight.rounds}) : tk('ready');
    el('destination').textContent = fight?.destination ? tk('destination', {section: fight.destination}) : '';
    el('report').textContent = fight ? fight.enemies.map(e => `${e.displayName || tk('opponent')}: ${e.stamina}`).join('; ') : '';
    el('log').replaceChildren(...data.log.map(line => { const p = document.createElement('p'); p.textContent = line; return p; }));
    el('log').scrollTop = el('log').scrollHeight;
    el('history').replaceChildren(...data.history.slice().reverse().map(row => { const p = document.createElement('p'); p.textContent = (row.enemy || tk('custom')) + ': ' + tk('outcome.' + row.outcome); return p; }));
  }
  function open() {
    if (!getRun() || Number(getBookId()) !== definition.id) { showAlert(tk('noRun')); return; }
    shownRun = getRun(); setupRun = null;
    try { if (!store.read()) store.change(() => {}); el('overlay').classList.add('active'); render(true); el('close').focus(); }
    catch { close(); showAlert(tk('invalid')); }
  }
  function init() {
    if (el('overlay')) return;
    crewOptions = MEMBERS.map(key => `<option value="${key}">${escape(tk('crew.' + key))}</option>`).join('');
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><details><summary>${escape(tk('character'))}</summary>${select('crew', crewOptions)}${CREW_FIELDS.map(k => input('crew-' + k, k)).join('')}<div class="bsim-btn-row">${button('replace')}</div>${SHIP_FIELDS.map(k => input(k)).join('')}${input('luck')}${input('luckInitial')}${checkbox('helmet')}<div class="bsim-btn-row">${['newCharacter', 'saveCharacter', 'planet', 'testLuck'].map(button).join('')}</div></details><div class="bsim-btn-row">${button('newCharacterQuick')}</div>${select('encounter', '<option value="0">' + escape(tk('custom')) + '</option>' + ENCOUNTERS.map(e => `<option value="${e.section}">${escape(e.name)} (${e.section})</option>`).join(''))}${select('mode', ['hand', 'phaser', 'ship'].map(k => `<option value="${k}">${escape(tk('mode.' + k))}</option>`).join(''))}<details><summary>${escape(tk('party'))}</summary>${MEMBERS.map(key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-party-${key}"><span>${escape(tk('crew.' + key))}</span></label>`).join('')}</details><div id="${ID}-editor"></div>${input('attackModifier')}${checkbox('enemyFirst')}${select('phaserSetting', ['kill', 'stun'].map(k => `<option value="${k}">${escape(tk(k))}</option>`).join(''))}${select('madKey', crewOptions)}<p id="${ID}-encounter-note"></p><div id="${ID}-targets"></div><div class="bsim-btn-row">${['start', 'round', 'surrender', 'cancel'].map(button).join('')}</div><div id="${ID}-reroll-options" hidden><p id="${ID}-reroll-note"></p><div class="bsim-btn-row">${button('keep')}${button('reroll')}</div></div><div id="${ID}-conflict-options" hidden>${select('conflictTarget', '')}${button('resolveConflict')}</div></div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-destination"></p><p id="${ID}-report"></p><div class="bsim-log" id="${ID}-log"></div><details><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({document, id: ID, t, language: 'bg', fields: [
      {key: 'skill', label: tk('opponentSkill'), max: 10000}, {key: 'stamina', label: tk('opponentStamina'), max: 10000},
    ], presets: PRESETS, onSelect: saveSetup,
      isStatUnavailable: key => key === 'stamina' && (encounterFor(el('encounter').value)?.mode ?? el('mode').value) === 'phaser',
    }); el('editor').appendChild(editor.element);
    el('crew').addEventListener('change', () => render(true));
    el('encounter').addEventListener('change', () => {
      if (active(store.read()?.fight)) return;
      const preset = encounterFor(el('encounter').value); el('mode').value = preset?.mode ?? 'hand';
      editor.set(preset?.enemies ?? [{displayName: '', skill: 7, stamina: 7}]);
      for (const key of MEMBERS) el('party-' + key).checked = (preset?.party ?? ['captain']).includes(key);
      el('enemyFirst').checked = preset?.enemyFirst ?? false; saveSetup();
    });
    el('mode').addEventListener('change', () => {
      if (active(store.read()?.fight)) return;
      let rows = editor.snapshot().map(row => ({...row, stamina: row.stamina ?? 1}));
      if (el('mode').value === 'ship') rows = rows.slice(0, 1);
      editor.set(rows); saveSetup();
    });
    for (const key of ['attackModifier', 'enemyFirst', 'phaserSetting', 'madKey', ...MEMBERS.map(k => 'party-' + k)]) el(key).addEventListener('change', saveSetup);
    editor.element.addEventListener('change', saveSetup);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open); el('close').addEventListener('click', close);
    let backdrop = false; overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); close(); } });
    const fresh = () => {
      if (active(store.read()?.fight)) return;
      const update = data => { data.character = combat.newCharacter(); data.fight = null; data.log = []; };
      if (store.read()?.character) confirm('newConfirm', update); else change(update);
    };
    el('newCharacter').addEventListener('click', fresh); el('newCharacterQuick').addEventListener('click', fresh);
    el('saveCharacter').addEventListener('click', () => change(data => {
      if (active(data.fight) || !data.character) throw new RangeError('No editable character');
      const c = structuredClone(data.character), key = el('crew').value;
      const number = id => { if (!el(id).value.trim()) throw new RangeError('Missing score'); return Number(el(id).value); };
      for (const field of CREW_FIELDS) c.crew[key][field] = number('crew-' + field);
      for (const field of SHIP_FIELDS) c.ship[field] = number(field);
      for (const field of ['luck', 'luckInitial']) c[field] = number(field);
      c.helmet = el('helmet').checked; combat.validateCharacter(c); data.fight = null; data.character = c;
    }));
    for (const [key, kind] of [['replace', 'replace'], ['planet', 'planet'], ['testLuck', 'luck']]) el(key).addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      const result = combat.recover(data.character, kind, el('crew').value); data.fight = null;
      data.character = kind === 'luck' ? result.character : result;
      if (kind === 'luck') data.log.push(tk('event.luck', {roll: result.roll, result: tk(result.lucky ? 'lucky' : 'unlucky')}));
    }));
    el('start').addEventListener('click', () => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.setup = snapshot();
      data.setup.opponents = (encounterFor(data.setup.section)?.mode ?? data.setup.mode) === 'phaser'
        ? editor.snapshot().map(row => {
          if (!String(row.skill ?? '').trim()) throw new RangeError('Missing skill');
          return {...row, skill: Number(row.skill), stamina: 1};
        }) : editor.read();
      data.encounterName = data.setup.opponents.map(e => e.displayName).filter(Boolean).join(' / ') || tk('custom');
      events(data, combat.startFight(data.setup.section, data.character, data.setup));
    }));
    el('round').addEventListener('click', () => change(data => events(data, combat.round(data.fight,
      Object.fromEntries([...el('targets').querySelectorAll('[data-target]')].map(select => [select.dataset.target, Number(select.value)]))))));
    for (const [key, value] of [['keep', false], ['reroll', true]]) el(key).addEventListener('click', () => change(data => events(data, combat.resolveReroll(data.fight, value))));
    el('resolveConflict').addEventListener('click', () => change(data => events(data, combat.resolveConflict(data.fight,
      data.fight.pendingConflict.outgoing ? Number(el('conflictTarget').value) : el('conflictTarget').value))));
    el('surrender').addEventListener('click', () => confirm('surrenderConfirm', data => events(data, combat.surrender(data.fight))));
    el('cancel').addEventListener('click', () => confirm('cancelConfirm', data => {
      if (active(data.fight)) data.fight = {...data.fight, outcome: 'cancelled', events: [], pending: null, pendingConflict: null};
    }));
    registerShortcut({button: trigger, overlay, open, close});
  }
  return {init, render, open, close, setVisible(visible) { if (el('btn')) el('btn').style.display = visible ? '' : 'none'; if (!visible) { close(); shownRun = null; } }};
}

const panel = createStarshipPanel({document, t, getRun: currentPlaythrough, getBookId: () => currentBookId, saveState,
  showAlert, showConfirm, getButtonRow: getPlayBtnRow, registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export function initSim906() { panel.init(); }
export function renderSim906() { panel.render(); }
export function setSim906Visible(visible) { panel.setVisible(visible); }
export {initSim906 as init, renderSim906 as render, setSim906Visible as setVisible};
