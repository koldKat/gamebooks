import { currentBookId, currentPlaythrough, isReadOnlySimulator, saveState } from '../../run-context.js';
import { createOpponentEditor } from '../../opponents.js';
import { decorateOutcome, renderHistory } from '../../outcome.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert } from '../../../ui-helpers/confirm.js';
import { createThemedSelect } from '../../../ui-helpers/themed-select.js';
import { ALL_PANEL_OVERLAY_IDS, registerPanelShortcut, shortcutLabel } from '../../../core/util.js';
import { t } from '../../../i18n.js';
import { definition, encounters, findEncounter } from './definition.js';
import { rollStartingStats } from './combat.js';
import { attackOptions, beginAttempt, completeAttempt, concede, startFight } from './fight.js';
import { createState } from './state.js';

const id = definition.stateKey;
const el = key => document.getElementById(`${id}-${key}`);
const tr = (key, params) => t(`${definition.i18nPrefix}.${key}`, params);
const escape = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const playerFields = {
  elan: [1, 100], effort: [0, 10000], fists: [1, 20], elanModifier: [-100, 100],
  hitDamage: [1, 20], guards: [0, 100],
};
const opponentFields = { difficulty: [0, 1000], fists: [0, 20], toughness: [1, 1000] };
const customEnemy = { displayName: '', difficulty: 6, fists: 1, toughness: 1 };
const defaults = { elan: 8, effort: 70, fists: 2, elanModifier: 0, hitDamage: 1, guards: 0 };
const conditionFields = {
  inWater: ['inWater'], problems: ['problems'], skeletonFriend: ['skeletonFriend'],
  wormGear: ['blade', 'ring'], ring: ['ring'], droppedItems: ['droppedItems'],
};
const store = createState(() => ({
  bookId: currentBookId, run: currentPlaythrough(), readOnly: isReadOnlySimulator(), save: saveState,
}));
let editor;
let shownRun;
let menus = [];

function input(key, [min, max]) {
  return `<label class="inv-edit-row"><span>${escape(tr(key))}</span>
    <input id="${id}-${key}" class="inv-edit-input" type="number" min="${min}" max="${max}" step="1" autocomplete="off" required>
  </label>`;
}
function checkbox(key) {
  return `<label class="bsim-checkbox"><input id="${id}-${key}" type="checkbox"><span>${escape(tr(key))}</span></label>`;
}
function button(key) {
  return `<button id="${id}-${key}" class="bsim-action-btn" type="button">${escape(tr(key))}</button>`;
}
function select(key, options = '') {
  return `<label class="inv-edit-row"><span>${escape(tr(key))}</span>
    <select id="${id}-${key}" class="inv-edit-input">${options}</select></label>`;
}
function option(value, label) {
  return `<option value="${escape(value)}">${escape(label)}</option>`;
}
function updateOptions(name, values, fallback = '') {
  const select = el(name);
  const current = select.value;
  const rendered = values.map(([value, label]) => option(value, label)).join('');
  select.innerHTML = rendered;
  select.value = values.some(([value]) => String(value) === current) ? current : String(fallback);
}
function setShown(key, shown) {
  el(key).closest('label').hidden = !shown;
  el(key).disabled = !shown || isReadOnlySimulator() || Boolean(activeFight());
}
function activeFight() {
  const fight = store.read()?.fight;
  return fight && !fight.outcome ? fight : null;
}
function currentPreset() {
  return findEncounter(el('encounter').value);
}
function updatePreset() {
  const preset = currentPreset();
  const controls = conditionFields[preset?.condition] ?? [];
  for (const key of ['inWater', 'problems', 'skeletonFriend', 'blade', 'ring', 'droppedItems']) {
    setShown(key, controls.includes(key));
  }
  setShown('guards', !preset || preset.mode === 'guards' || preset.condition === 'skeletonFriend'
    || ['guardOrElan', 'loseGuard'].includes(preset.onMiss));
  setShown('simultaneous', !preset);
  el('note').textContent = preset?.note ?? '';
  editor.fixCount(Boolean(preset));
}
function readInputs() {
  const numbers = keys => Object.fromEntries(keys.map(key => {
    const input = el(key);
    if (!input.checkValidity()) throw new RangeError('Invalid combat input');
    return [key, Number(input.value)];
  }));
  return {
    key: el('encounter').value,
    stats: numbers(Object.keys(playerFields)),
    options: {
      ...numbers(['problems', 'droppedItems']),
      ...Object.fromEntries(['inWater', 'skeletonFriend', 'blade', 'ring', 'simultaneous']
        .map(key => [key, el(key).checked])),
    },
    opponents: editor.read(),
  };
}
function loadSetup(setup) {
  const saved = setup ?? {};
  el('encounter').value = saved.key ?? '';
  for (const [key, value] of Object.entries({ ...defaults, ...saved.stats })) el(key).value = value;
  for (const key of ['problems', 'droppedItems']) el(key).value = saved.options?.[key] ?? 0;
  for (const key of ['inWater', 'skeletonFriend', 'blade', 'ring', 'simultaneous']) {
    el(key).checked = Boolean(saved.options?.[key]);
  }
  editor.set(saved.opponents ?? currentPreset()?.enemies ?? [customEnemy]);
}
function appendLog(holder, line) {
  const row = document.createElement('div');
  if (line.round) {
    row.textContent = tr('roundScore', line);
    for (const foe of line.comparisons) {
      const comparison = document.createElement('div');
      comparison.className = foe.success ? 'bsim-log-success' : 'bsim-log-danger';
      comparison.textContent = tr(foe.success ? 'overcame' : 'failed', foe);
      row.append(comparison);
    }
  } else if (line.inventory) {
    row.className = 'bsim-log-danger';
    row.textContent = tr(line.inventory);
  } else if (line.reward) {
    row.className = 'bsim-log-success';
    row.textContent = tr('rewardHint', line);
  } else {
    row.className = 'bsim-log-accent';
    row.textContent = tr('resourceLoss', { loss: line.loss, resource: tr(line.resource) });
  }
  holder.append(row);
}
function render() {
  if (!el('overlay')?.classList.contains('active')) return;
  if (currentPlaythrough() !== shownRun || Number(currentBookId) !== definition.id) {
    close();
    return;
  }
  const data = store.read();
  const fight = data?.fight;
  const active = activeFight();
  const readOnly = isReadOnlySimulator();
  const locked = Boolean(active) || readOnly;
  el('encounter').disabled = locked;
  for (const key of Object.keys(playerFields)) el(key).disabled = locked;
  updatePreset();
  editor.lock(locked);
  el('start').disabled = locked;
  el('startingStats').disabled = locked;
  const valid = active ? attackOptions(active) : null;
  const pending = active?.pending;
  const targets = valid?.targets.map(index => [index, active.enemies[index].name]) ?? [];
  updateOptions('target', targets, targets[0]?.[0]);
  el('target').disabled = readOnly || Boolean(pending) || targets.length < 2;
  const maxEffort = valid?.maxEffort ?? 0;
  el('commit').max = maxEffort;
  el('commit').value = pending ? pending.effort : Math.max(0, Math.min(maxEffort, Number(el('commit').value) || 0));
  el('commit').disabled = readOnly || !active || Boolean(pending);
  el('roll').disabled = readOnly || !active || Boolean(pending) || !valid?.fists;
  el('concede').disabled = readOnly || !active || Boolean(pending) || active.rules.noSurrender
    || active.turn < (active.rules.surrenderAfter ?? 0);
  const dice = pending?.dice ?? [];
  const bestDie = dice.reduce((best, die, index) => die.result > dice[best].result ? index : best, 0);
  updateOptions('die', dice.map((die, index) => [index,
    die.rerolled ? tr('rerolledDie', die) : String(die.result)]), bestDie);
  el('die').disabled = readOnly || !pending;
  el('resolve').disabled = readOnly || !pending;
  el('status').textContent = tr(readOnly ? 'readOnly' : fight?.outcome ?? (fight ? 'active' : 'ready'));
  decorateOutcome(el('status'), fight?.outcome);
  el('destination').textContent = fight?.section ? tr('section', { section: fight.section }) : '';
  el('battleStats').textContent = fight ? tr('playerStats', {
    ...fight.player, elan: attackOptions(fight).effectiveElan,
  }) : '';
  el('opponents').replaceChildren(...(fight?.enemies ?? []).map(enemy => {
    const item = document.createElement('div');
    item.textContent = tr('enemyStats', enemy);
    if (!enemy.toughness) item.className = 'bsim-log-success';
    return item;
  }));
  const log = el('log');
  log.replaceChildren();
  (data?.log ?? []).forEach(line => appendLog(log, line));
  log.scrollTop = log.scrollHeight;
  renderHistory(el('history'), (data?.history ?? []).slice(-40).reverse(),
    item => tr('historyRow', { ...item, outcome: tr(item.outcome) }));
  menus.forEach(menu => menu.sync());
}
function change(update) {
  if (shownRun !== currentPlaythrough() || !el('overlay').classList.contains('active')) return;
  try {
    if (store.change(update)) render();
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    showAlert(tr('invalid'));
  }
}
function close() {
  menus.forEach(menu => menu.close());
  el('overlay')?.classList.remove('active');
}
function open() {
  if (Number(currentBookId) !== definition.id) return;
  shownRun = currentPlaythrough();
  const data = store.read();
  loadSetup(data?.setup);
  if (!activeFight() && data?.fight) {
    for (const key of ['elan', 'effort', 'guards']) el(key).value = data.fight.player[key];
  }
  el('overlay').classList.add('active');
  render();
  el('close').focus();
}
function init() {
  if (el('overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = id + '-overlay';
  overlay.className = 'inv-overlay';
  const presets = option('', tr('custom')) + encounters.map(entry =>
    option(entry.key, tr('preset', entry))).join('');
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
      <div class="inv-modal-hdr">
        <span id="${id}-title" class="inv-modal-title">${escape(tr('title'))}</span>
        <button id="${id}-close" class="inv-close-btn" type="button" aria-label="${escape(t('btn.close'))}">&times;</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <p>${escape(tr('rules'))}</p>
          <details class="bsim-opponent-editor" open>
            <summary>${escape(tr('setup'))}</summary>
            ${Object.entries(playerFields).map(([key, bounds]) => input(key, bounds)).join('')}
            ${button('startingStats')}
          </details>
          ${select('encounter', presets)}
          <p id="${id}-note"></p>
          ${input('problems', [0, 100])}${input('droppedItems', [0, 100])}
          ${['inWater', 'skeletonFriend', 'blade', 'ring', 'simultaneous'].map(checkbox).join('')}
          <div id="${id}-editor"></div>
          <div class="bsim-btn-row">${button('start')}</div>
          ${select('target')}${input('commit', [0, 0])}
          <div class="bsim-btn-row">${button('roll')}</div>
          ${select('die')}
          <div class="bsim-btn-row">${button('resolve')}${button('concede')}</div>
        </div>
        <div class="bsim-col bsim-col-right">
          <div id="${id}-status" class="bsim-status" role="status" aria-live="polite"></div>
          <p id="${id}-destination"></p>
          <div id="${id}-battleStats" class="bsim-status"></div>
          <div id="${id}-opponents"></div>
          <div id="${id}-log" class="bsim-log"></div>
          <details class="bsim-history">
            <summary>${escape(tr('history'))}</summary><div id="${id}-history" class="bsim-history-list"></div>
          </details>
        </div>
      </div>
    </div>`;
  document.body.append(overlay);
  editor = createOpponentEditor({
    document, id, t, presets: encounters.flatMap(entry => entry.enemies),
    fields: Object.entries(opponentFields).map(([key, [min, max]]) => ({ key, label: tr(key), min, max })),
  });
  el('editor').append(editor.element);
  el('encounter').addEventListener('change', () => {
    if (activeFight() || isReadOnlySimulator()) return;
    editor.set(currentPreset()?.enemies ?? [customEnemy]);
    updatePreset();
  });
  el('startingStats').addEventListener('click', () => {
    if (activeFight() || isReadOnlySimulator()) return;
    for (const [key, value] of Object.entries(rollStartingStats())) el(key).value = value;
  });
  el('start').addEventListener('click', () => change(data => {
    if (activeFight()) return;
    const setup = readInputs();
    const preset = currentPreset();
    const rules = preset ?? { mode: setup.options.simultaneous ? 'group' : 'ordered' };
    const opponents = setup.opponents.map(row => ({ ...row, name: row.displayName || tr('opponent') }));
    const fight = startFight(setup.stats, opponents, rules, setup.options);
    if (!attackOptions(fight).fists) throw new RangeError('No usable fists');
    data.setup = setup;
    data.fight = fight;
    data.log = [];
  }));
  el('roll').addEventListener('click', () => change(data => {
    if (!el('commit').checkValidity()) throw new RangeError('Invalid effort');
    beginAttempt(data.fight, Number(el('target').value), Number(el('commit').value));
  }));
  el('resolve').addEventListener('click', () => change(data => {
    completeAttempt(data.fight, Number(el('die').value));
    data.log.push(...data.fight.events);
    if (data.fight.outcome) {
      for (const key of ['elan', 'effort', 'guards']) el(key).value = data.fight.player[key];
    }
  }));
  el('concede').addEventListener('click', () => change(data => {
    concede(data.fight);
    for (const key of ['elan', 'effort', 'guards']) el(key).value = data.fight.player[key];
  }));
  el('close').addEventListener('click', close);
  let backdrop = false;
  overlay.addEventListener('pointerdown', event => { backdrop = event.target === overlay; });
  overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); close(); }
  });
  menus = ['encounter', 'target', 'die'].map(key => createThemedSelect(el(key)));
  const trigger = document.createElement('button');
  trigger.id = id + '-btn';
  trigger.style.display = 'none';
  trigger.innerHTML = shortcutLabel(t('battlesim.title'));
  trigger.setAttribute('aria-keyshortcuts', 'S');
  trigger.addEventListener('click', open);
  getPlayBtnRow().append(trigger);
  registerPanelShortcut('KeyS', {
    getButton: () => trigger, getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(overlayId => overlayId !== overlay.id), open, close,
  });
}
function setVisible(visible) {
  if (el('btn')) el('btn').style.display = visible ? '' : 'none';
  if (!visible) close();
}

export { init, render, setVisible, init as initSim1526, render as renderSim1526, setVisible as setSim1526Visible };
