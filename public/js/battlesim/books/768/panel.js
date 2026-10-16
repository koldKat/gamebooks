import {definition, CHARACTER_FIELDS, WARRIORS, NECROMOR, IRON_DRAGON, TABLE_IMAGES} from './definition.js';
import {startFight, prepareStrike, resolveStrike, castMagic, amendFighter, setBattleCode, finishFight, chance} from './combat.js';
import {createState} from './state.js';
import {createOpponentEditor} from '../../opponents.js';
import {currentBookId, currentPlaythrough, saveState, apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';

const ID = definition.stateKey;
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));

export function createDragonRoadPanel({document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow,
  requestReadingAccess = () => apiFetch('/api/books/768/reading-access'), registerShortcut = () => {}}) {
  const tk = (key, params) => t(definition.i18nPrefix + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId: getBookId(), currentPlaythrough: getRun, saveState}));
  let shownRun, editorRun, rendered, enemies, allies, tableRequest;
  const field = (key, label = key, value = '', min = 0) => `<label class="inv-edit-row"><span>${escape(tk(label))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${min}" max="1000000" step="1" value="${value}"></label>`;
  const button = key => `<button type="button" class="bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const select = (key, choices) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><select class="inv-edit-input" id="${ID}-${key}">${choices.map(value => `<option value="${value}">${escape(tk(key + '.' + value))}</option>`).join('')}</select></label>`;
  function number(key) {
    const input = el(key), value = Number(input.value);
    if (!input.value.trim() || !Number.isSafeInteger(value) || value < Number(input.min) || value > Number(input.max)) {
      input.closest('details')?.setAttribute('open', ''); input.focus(); throw new RangeError('Invalid field');
    }
    return value;
  }
  function close() {el('overlay')?.classList.remove('active');}
  async function loadTables() {
    if (!el('tables').open || tableRequest || shownRun !== getRun() || Number(getBookId()) !== definition.id) return;
    const run = getRun();
    tableRequest = true; el('table-status').textContent = tk('loadingTables');
    try {
      const response = await requestReadingAccess();
      if (!response.ok) throw new Error('Reading access unavailable');
      if (run !== getRun() || shownRun !== run || !el('overlay').classList.contains('active')) return;
      for (const image of el('tables').querySelectorAll('img[data-source]')) image.src = image.dataset.source;
      el('table-status').textContent = '';
    } catch {
      if (run === getRun() && shownRun === run) el('table-status').textContent = tk('tablesUnavailable');
    } finally {
      tableRequest = false;
      if (run !== getRun() && shownRun === getRun() && el('overlay').classList.contains('active')) void loadTables();
    }
  }
  function change(update) {
    if (shownRun !== getRun() || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) {close(); return;}
    try {
      store.change(data => {
        update(data);
        if (data.fight) {
          data.character = structuredClone(data.fight.players[0]);
          data.allySetup = structuredClone(data.fight.players.slice(1));
        }
      });
      render(true);
    } catch {showAlert(tk('invalid'));}
  }
  const active = data => Boolean(data?.fight && !data.fight.outcome);
  const chosen = () => ({side: el('side').value, actorIndex: Number(el('actor').value), targetIndex: Number(el('target').value)});
  function choices(selectNode, values) {
    const previous = selectNode.value;
    selectNode.innerHTML = values.map((actor, index) => `<option value="${index}">${escape(actor.displayName || tk('fighter', {n: index + 1}))}</option>`).join('');
    if ([...selectNode.options].some(option => option.value === previous)) selectNode.value = previous;
  }
  function actorFields() {
    const fight = store.read()?.fight;
    if (!fight) return;
    const side = el('side').value;
    choices(el('actor'), side === 'player' ? fight.players : fight.enemies);
    choices(el('target'), side === 'player' ? fight.enemies : fight.players);
    const actor = (side === 'player' ? fight.players : fight.enemies)[Number(el('actor').value)];
    el('action-mastery').value = actor?.mastery ?? '';
    el('action-mastery').disabled = side === 'enemy' || Boolean(fight.pending) || Boolean(fight.outcome);
    el('action-shooting').value = actor?.shooting ?? '';
    el('strength').value = actor?.magicStrength ?? '';
    el('energy').value = actor?.magicEnergy ?? '';
    el('attack-part-row').hidden = !actor?.attacks;
    el('attack-part').innerHTML = (actor?.attacks || []).map((attack, index) => `<option value="${index}">${escape(tk('attackPart.' + attack.kind))} · ${attack.attack}</option>`).join('');
    for (const key of CHARACTER_FIELDS) el('amend-' + key).value = actor?.[key] ?? '';
  }
  function render(force = false) {
    if (!el('overlay')) return;
    if (Number(getBookId()) !== definition.id || !getRun()) {close(); rendered = null; return;}
    if (el('overlay').classList.contains('active') && shownRun !== getRun()) {close(); return;}
    const data = store.read();
    if (!data || !force && rendered === data) return;
    rendered = data;
    if (editorRun !== getRun()) {
      editorRun = getRun();
      enemies.set(data.enemySetup || [{}]); allies.set(data.allySetup || [{}]);
      el('has-allies').checked = Boolean(data.allySetup?.length);
      el('system').value = data.setup?.system ?? 'normal'; el('level').value = data.setup?.level ?? 'normal';
    }
    const fighting = active(data), fight = data.fight, pending = Boolean(fighting && fight.pending);
    for (const key of CHARACTER_FIELDS) {el(key).value = data.character?.[key] ?? ''; el(key).disabled = fighting;}
    enemies.lock(fighting); allies.lock(fighting);
    for (const key of ['apply', 'system', 'level', 'has-allies']) el(key).disabled = fighting;
    el('allies').hidden = !el('has-allies').checked;
    el('start').disabled = Boolean(fight) || !data.character;
    el('again').disabled = !fight?.outcome;
    for (const key of ['side', 'actor', 'target', 'kind', 'manoeuvre', 'action-mastery', 'action-shooting', 'requested', 'attack-part', 'prepare', 'cast', 'amend', 'code', 'set-code', 'win', 'loss', 'escape']) el(key).disabled = !fighting || pending;
    el('escape').disabled ||= Boolean(fight?.enemies.some(enemy => enemy.canEscape === false));
    el('resolve').disabled = !pending; el('tableDamage').disabled = !pending; el('damageBonus').disabled = !pending || fight.system === 'simple';
    el('tableDamage').value = ''; el('damageBonus').value = '0';
    if (fight) {el('code').value = fight.battleCode; actorFields();}
    const lines = [];
    if (fight) {
      lines.push(tk('firstSide', {side: tk('side.' + fight.firstSide)}), tk('currentCode', {code: fight.battleCode}));
      for (const side of ['player', 'enemy']) {
        for (const [index, actor] of (side === 'player' ? fight.players : fight.enemies).entries()) {
          lines.push(tk('remaining', {name: actor.displayName || tk('fighter', {n: index + 1}), life: actor.life}));
        }
      }
      if (fight.pending) lines.push(tk('pending', {strikes: fight.pending.strikes, attack: fight.pending.attackValue, defence: fight.pending.defenceValue}));
      if (fight.outcome) lines.push(tk('outcome.' + fight.outcome));
    } else lines.push(tk('ready'));
    if (data.lastChance) lines.push(tk('chanceResult', data.lastChance));
    el('result').textContent = lines.join('\n');
    el('log').textContent = (fight?.actions || []).slice(-40).reverse().map(action => {
      if (action.kind === 'amend') return tk('amended');
      return tk(action.kind === 'magic' ? 'magicLog' : 'strikeLog', {...action, spell: action.spell || tk('spell')});
    }).join('\n');
    el('history').textContent = data.history.slice(-40).reverse().map(entry => entry.enemy + ': ' + tk('outcome.' + entry.outcome)).join('\n');
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) {showAlert(t('battlesim.no_active_playthrough')); return;}
    try {store.ensure(); shownRun = getRun(); el('overlay').classList.add('active'); render(true); el('close').focus(); void loadTables();}
    catch {close(); showAlert(tk('invalid'));}
  }
  function finish(outcome) {
    const run = getRun(), fight = store.read()?.fight;
    if (!fight || fight.outcome || fight.pending) return;
    showConfirm(tk('confirm.' + outcome), () => {
      if (run !== getRun() || store.read()?.fight !== fight) return;
      change(data => {data.fight = finishFight(data.fight, outcome);});
    }, {confirmLabel: tk(outcome), danger: outcome === 'loss', win: outcome === 'win'});
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title">
      <div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div>
      <div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p>
      <details open><summary>${escape(tk('character'))}</summary>${CHARACTER_FIELDS.map(key => field(key)).join('')}${button('apply')}</details>
      ${select('system', ['normal', 'simple'])}${select('level', ['easy', 'normal', 'hard', 'fanatic'])}
      <label class="bsim-checkbox"><input type="checkbox" id="${ID}-has-allies">${escape(tk('hasAllies'))}</label><div id="${ID}-allies"></div><div id="${ID}-enemies"></div>
      <div class="bsim-btn-row">${button('start')}${button('again')}</div>
      <details open><summary>${escape(tk('physical'))}</summary>${select('side', ['player', 'enemy'])}
      <label class="inv-edit-row"><span>${escape(tk('actor'))}</span><select class="inv-edit-input" id="${ID}-actor"></select></label>
      <label class="inv-edit-row"><span>${escape(tk('target'))}</span><select class="inv-edit-input" id="${ID}-target"></select></label>
      ${select('kind', ['melee', 'shoot', 'throw'])}${select('manoeuvre', ['none', 'attack', 'defence'])}
      ${field('action-mastery', 'mastery')}${field('action-shooting', 'shooting')}${field('requested', 'requested', 1, 1)}
      <label class="inv-edit-row" id="${ID}-attack-part-row"><span>${escape(tk('attackPart'))}</span><select class="inv-edit-input" id="${ID}-attack-part"></select></label>${button('prepare')}
      <p>${escape(tk('tableNote'))}</p>${field('tableDamage')}${field('damageBonus', 'damageBonus', 0, -1000000)}${button('resolve')}</details>
      <details id="${ID}-tables"><summary>${escape(tk('tables'))}</summary><p id="${ID}-table-status" role="status"></p>${Object.entries(TABLE_IMAGES).map(([key, url]) => `<p>${escape(tk('table.' + key))}</p><img data-source="${url}" alt="${escape(tk('table.' + key))}" loading="lazy" style="max-width:100%;height:auto">`).join('')}</details>
      <details><summary>${escape(tk('spell'))}</summary><p>${escape(tk('spellNote'))}</p>
      <label class="inv-edit-row"><span>${escape(tk('spell'))}</span><input class="inv-edit-input" id="${ID}-spell" maxlength="200"></label>
      ${field('strength', 'magicStrength')}${field('energy', 'magicEnergy')}${field('requiredStrength')}${field('energyCost')}${field('spellDamage')}${button('cast')}</details>
      <details><summary>${escape(tk('manual'))}</summary><p>${escape(tk('manualNote'))}</p>${CHARACTER_FIELDS.map(key => field('amend-' + key, key, '', key === 'life' ? -1000000 : 0)).join('')}${button('amend')}${field('code', 'code', 0, -1000000)}${button('set-code')}</details>
      <details><summary>${escape(tk('chance'))}</summary>${select('sides', ['6', '8', '12', '16'])}${button('roll')}</details>
      <div class="bsim-btn-row">${button('win')}${button('loss')}${button('escape')}</div></div>
      <div class="bsim-col bsim-col-right"><p class="bsim-status" id="${ID}-result" role="status" aria-live="polite"></p>
      <div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list bsim-status" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    const fields = ['attack', 'defence', 'life'].map(key => ({key, label: tk(key), min: 0}));
    enemies = createOpponentEditor({document, id: ID + '-enemies', t, fields, presets: [...WARRIORS, NECROMOR, IRON_DRAGON], language: 'bg'});
    allies = createOpponentEditor({document, id: ID + '-allies', t, fields, presets: WARRIORS, language: 'bg'});
    el('enemies').append(enemies.element); el('allies').append(allies.element);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.textContent = t('battlesim.title'); trigger.style.display = 'none';
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let downOnOverlay = false;
    overlay.addEventListener('mousedown', event => {downOnOverlay = event.target === overlay;});
    overlay.addEventListener('click', event => {if (event.target === overlay && downOnOverlay) close();});
    overlay.addEventListener('keydown', event => {if (event.key === 'Escape') {event.stopPropagation(); close();}});
    el('has-allies').addEventListener('change', () => {el('allies').hidden = !el('has-allies').checked;});
    el('tables').addEventListener('toggle', loadTables);
    el('side').addEventListener('change', actorFields); el('actor').addEventListener('change', actorFields);
    el('apply').addEventListener('click', () => change(data => {
      if (active(data)) return;
      data.fight = null;
      data.character = {...Object.fromEntries(CHARACTER_FIELDS.map(key => [key, number(key)])), displayName: tk('character')};
    }));
    el('start').addEventListener('click', () => change(data => {
      if (data.fight || !data.character) return;
      data.enemySetup = enemies.snapshot(); data.allySetup = el('has-allies').checked ? allies.snapshot() : [];
      data.setup = {system: el('system').value, level: el('level').value, openingRoll: chance(6)};
      data.fight = startFight([data.character, ...(el('has-allies').checked ? allies.read() : [])], enemies.read(), data.setup);
    }));
    el('again').addEventListener('click', () => {
      change(data => {if (data.fight?.outcome) data.fight = null;});
      allies.set(store.read()?.allySetup || [{}]);
    });
    el('prepare').addEventListener('click', () => change(data => {
      const options = {...chosen(), kind: el('kind').value, manoeuvre: el('manoeuvre').value,
        requested: number('requested'), attackIndex: Number(el('attack-part').value)};
      if (options.side === 'player') options.mastery = number('action-mastery');
      if (options.kind !== 'melee') options.shooting = number('action-shooting');
      data.fight = prepareStrike(data.fight, options);
    }));
    el('resolve').addEventListener('click', () => change(data => {data.fight = resolveStrike(data.fight, number('tableDamage'), number('damageBonus'));}));
    el('cast').addEventListener('click', () => change(data => {data.fight = castMagic(data.fight, {...chosen(),
      strength: number('strength'), energy: number('energy'), requiredStrength: number('requiredStrength'),
      energyCost: number('energyCost'), damage: number('spellDamage'), spell: el('spell').value});}));
    el('amend').addEventListener('click', () => change(data => {
      const values = Object.fromEntries(CHARACTER_FIELDS.filter(key => el('amend-' + key).value.trim()).map(key => [key, number('amend-' + key)]));
      const {side, actorIndex} = chosen(); data.fight = amendFighter(data.fight, side, actorIndex, values);
    }));
    el('set-code').addEventListener('click', () => change(data => {data.fight = setBattleCode(data.fight, number('code'));}));
    el('roll').addEventListener('click', () => change(data => {const sides = Number(el('sides').value); data.lastChance = {sides, result: chance(sides)};}));
    for (const outcome of ['win', 'loss', 'escape']) el(outcome).addEventListener('click', () => finish(outcome));
    registerShortcut({button: trigger, overlay, open, close});
  }
  return {init, render, open, close, setVisible(visible) {if (el('btn')) el('btn').style.display = visible ? '' : 'none'; if (!visible) close();}};
}

const panel = createDragonRoadPanel({document, t, getRun: currentPlaythrough, getBookId: () => currentBookId,
  saveState, showAlert, showConfirm, getButtonRow: getPlayBtnRow, registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export function initSim768() {panel.init();}
export function renderSim768() {panel.render();}
export function setSim768Visible(visible) {panel.setVisible(visible);}
export { initSim768 as init, renderSim768 as render, setSim768Visible as setVisible };
