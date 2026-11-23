import { createD20Forms } from '../../engines/d20/forms.js';
import { createOpponentEditor } from '../../opponents.js';
import { decorateOutcome, renderHistory } from '../../outcome.js';
import { apiFetch, currentBookId, currentPlaythrough, isReadOnlySimulator, saveState } from '../../run-context.js';
import { ALL_PANEL_OVERLAY_IDS, registerPanelShortcut, shortcutLabel } from '../../../core/util.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { t } from '../../../i18n.js';
import { beginFight, defaults, exchange, heal, useProjectile } from './combat.js';
import { definition, encounters, loadRoster } from './definition.js';
import { createState } from './state.js';

const id = definition.stateKey;
const store = createState(() => ({
  run: currentPlaythrough(), bookId: currentBookId, readOnly: isReadOnlySimulator(), save: saveState,
}));
const translate = (key, values) => t(definition.i18nPrefix + '.' + key, values);
const fightActive = fight => Boolean(fight && !fight.outcome);
const limits = { skill: 999, endurance: 999, magic: 999, bolts: 3, knives: 2 };
const defaultOpponent = { skill: 10, endurance: 10, unarmed: false };
let overlay, launch, editor, select, note, controls, start, healButton, abandon, report, log, history;
let mountedRun, renderedData;
let selectedTarget = 0;
const fields = new Map();

export const loadData = () => loadRoster(apiFetch);

function currentSelection() {
  return encounters.find(entry => entry.section === Number(select.value));
}

function readPlayer() {
  const player = {};
  for (const [key, input] of fields) player[key] = input.type === 'checkbox' ? input.checked : ui().number(input);
  player.magicLost = Boolean(store.read()?.player.magicLost || player.magic === 0);
  if (player.magicLost) player.magic = 0;
  return player;
}

function ui() {
  return forms ??= createD20Forms(document, id, translate);
}
let forms;

function showSelection(encounter, opponents) {
  editor.fixCount(Boolean(encounter));
  editor.set((opponents ?? encounter?.opponents ?? [defaultOpponent]).map(enemy => ({
    ...enemy, unarmed: String(enemy.unarmed === true || enemy.unarmed === 'true'),
  })));
  note.textContent = [encounter?.rotation ? translate('rotation') : '', encounter?.note].filter(Boolean).join(' ');
  note.hidden = !note.textContent;
}

function close() { overlay?.classList.remove('active'); }

function change(update) {
  if (mountedRun !== currentPlaythrough() || !overlay?.classList.contains('active') || store.read() !== renderedData) return;
  try {
    if (store.change(update)) render();
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    showAlert(translate('invalid'));
  }
}

function recordAction(data, result) {
  data.fight = result.fight;
  data.player = { ...result.fight.player, unarmed: data.player.unarmed };
  data.log.push({ ...result.event, enemy: result.fight.opponents[result.event.index].name });
  if (result.fight.outcome) data.log.push({ outcome: result.fight.outcome });
}

function drawManual(value) {
  return value === undefined ? undefined : () => value;
}

function renderControls(fight) {
  controls.replaceChildren();
  if (!fightActive(fight)) return;
  const options = fight.opponents.flatMap((enemy, index) => enemy.endurance > 0 ? [[index, enemy.name]] : []);
  const target = fight.rotation ? null : ui().field(controls, 'target', { entries: options });
  if (target && options.some(([index]) => index === selectedTarget)) target.value = String(selectedTarget);
  const chosen = () => target ? Number(target.value) : fight.target;
  target?.addEventListener('change', () => { selectedTarget = chosen(); });
  if (fight.rotation) ui().text(controls, translate('nextTarget', { enemy: fight.opponents[fight.target].name }));
  const manual = ui().group(controls, 'manual');
  const yours = ui().field(manual, 'playerDraw', { type: 'number', min: 1, max: 12, optional: true });
  const theirs = ui().field(manual, 'enemyDraw', { type: 'number', min: 1, max: 12, optional: true });
  ui().button(controls, 'exchange', () => change(data => {
    const playerDraw = ui().number(yours, true), enemyDraw = ui().number(theirs, true);
    if ((playerDraw === undefined) !== (enemyDraw === undefined)) throw new RangeError('Enter both draws');
    const values = [playerDraw, enemyDraw];
    recordAction(data, exchange(data.fight, chosen(), playerDraw === undefined ? undefined : () => values.shift()));
  }));
  if (fight.section !== 354 && fight.player.bolts && !fight.firedBolt) {
    ui().button(controls, 'crossbow', () => change(data => recordAction(data, useProjectile(data.fight, chosen(), 'bolts'))));
  }
  if (fight.section !== 354 && fight.player.knives) {
    ui().button(controls, 'throwKnife', () => change(data => recordAction(data, useProjectile(data.fight, chosen(), 'knives'))));
  }
}

function renderReport(data) {
  report.replaceChildren();
  const fight = data?.fight;
  if (fight) {
    ui().text(report, translate('playerStatus', fight.player));
    for (const enemy of fight.opponents) ui().text(report, translate('enemyStatus', enemy));
  }
  log.replaceChildren();
  for (const entry of data?.log ?? []) {
    const key = entry.outcome ?? (entry.side ? entry.side + 'Log' : entry.item ? entry.item + 'Log' : 'recovered');
    const line = ui().text(log, translate(key, entry), 'div');
    if (entry.outcome) decorateOutcome(line, entry.outcome);
    else if (entry.side === 'enemy') line.classList.add('bsim-log-danger');
    else if (entry.side === 'player' || entry.item || entry.recovered) line.classList.add('bsim-log-success');
  }
  log.scrollTop = log.scrollHeight;
  renderHistory(history, [...(data?.history ?? [])].reverse(), entry => entry.enemy + ' · ' + translate(entry.outcome));
}

export function render() {
  if (!overlay) return;
  const run = currentPlaythrough();
  const data = store.read();
  const fight = data?.fight;
  if (mountedRun !== run || renderedData !== data) {
    const freshRun = mountedRun !== run;
    mountedRun = run;
    renderedData = data;
    const player = data?.player ?? defaults;
    for (const [key, input] of fields) {
      if (input.type === 'checkbox') input.checked = player[key];
      else input.value = player[key];
    }
    if (freshRun) {
      selectedTarget = 0;
      select.value = String(data?.encounter ?? 0);
      showSelection(currentSelection(), data?.opponents);
    }
    renderControls(fight);
    renderReport(data);
  }
  const busy = fightActive(fight);
  const readOnly = isReadOnlySimulator();
  for (const [key, input] of fields) input.disabled = busy || readOnly || (key === 'magic' && Boolean(data?.player.magicLost));
  select.disabled = start.disabled = healButton.disabled = busy || readOnly;
  editor.lock(busy || readOnly);
  abandon.hidden = !busy;
}

export function init() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.id = id + '-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = '<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
  overlay.querySelector('.inv-modal-title').textContent = translate('title');
  const closeButton = overlay.querySelector('.inv-close-btn');
  closeButton.setAttribute('aria-label', t('btn.close'));
  closeButton.addEventListener('click', close);
  const left = overlay.querySelector('.bsim-col-left');
  const right = overlay.querySelector('.bsim-col-right');
  const setUp = ui().group(left, 'setup', true);
  for (const [key, max] of Object.entries(limits)) {
    fields.set(key, ui().field(setUp, key, { type: 'number', min: 0, max, value: defaults[key] }));
  }
  for (const key of ['unarmed', 'chainmail', 'healing']) fields.set(key, ui().checkbox(setUp, key));
  const manualHeal = ui().field(setUp, 'healingDraw', { type: 'number', min: 1, max: 12, optional: true });
  healButton = ui().button(setUp, 'heal', () => change(data => {
    if (fightActive(data.fight)) return;
    const result = heal(readPlayer(), drawManual(ui().number(manualHeal, true)));
    data.player = result.character;
    data.log.push({ recovered: result.recovered });
    manualHeal.value = '';
  }));
  select = ui().field(left, 'encounter', {
    entries: [[0, translate('custom')], ...encounters.map(entry => [entry.section, entry.name + ' (§' + entry.section + ')'])],
  });
  select.id = id + '-encounter';
  editor = createOpponentEditor({
    document, id, t, language: 'bg',
    fields: [
      { key: 'skill', label: translate('skill'), max: 999 },
      { key: 'endurance', label: translate('endurance'), min: 1, max: 999 },
      { key: 'unarmed', label: translate('weapon'), defaultValue: 'false', options: [
        { value: 'false', label: translate('armed') }, { value: 'true', label: translate('unarmed') },
      ] },
    ],
    presets: encounters.flatMap(entry => entry.opponents.map(enemy => ({
      ...enemy, displayName: enemy.name + ' (§' + entry.section + ')', unarmed: String(enemy.unarmed),
    }))),
  });
  left.append(editor.element);
  note = ui().text(left, '');
  select.addEventListener('change', () => showSelection(currentSelection()));
  start = ui().button(left, 'start', () => change(data => {
    if (fightActive(data.fight)) return;
    const encounter = currentSelection() ?? { section: 0 };
    const opponents = editor.read();
    data.encounter = encounter.section;
    data.opponents = opponents;
    const roster = opponents.map(enemy => ({
      ...enemy, name: enemy.displayName || translate('enemy'), unarmed: enemy.unarmed === 'true',
    }));
    selectedTarget = 0;
    data.player = readPlayer();
    data.fight = beginFight(data.player, encounter, roster);
  }));
  controls = document.createElement('div');
  left.append(controls);
  abandon = ui().button(left, 'abandon', () => {
    const data = renderedData, run = mountedRun;
    showConfirm(translate('confirmAbandon'), () => {
      if (run === mountedRun && data === renderedData) change(state => { state.fight = null; });
    });
  });
  report = document.createElement('div');
  report.className = 'bsim-report';
  report.setAttribute('role', 'status');
  right.append(report);
  log = document.createElement('div');
  log.className = 'bsim-log';
  right.append(log);
  const past = ui().group(right, 'history');
  past.id = id + '-history';
  history = document.createElement('div');
  past.append(history);
  document.body.append(overlay);
  launch = document.createElement('button');
  launch.id = id + '-btn';
  launch.style.display = 'none';
  launch.innerHTML = shortcutLabel(t('battlesim.title'));
  getPlayBtnRow().append(launch);
  launch.addEventListener('click', () => { render(); overlay.classList.add('active'); });
  registerPanelShortcut('KeyS', {
    getButton: () => launch, getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(key => key !== overlay.id),
    open: () => launch.click(), close,
  });
  let backdrop = false;
  overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
  overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
  overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
}

export function setVisible(visible) {
  if (launch) launch.style.display = visible ? '' : 'none';
  if (!visible) close();
}
