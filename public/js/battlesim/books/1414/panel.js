import { createD20Forms } from '../../engines/d20/forms.js';
import { createOpponentEditor } from '../../opponents.js';
import { decorateOutcome, renderHistory } from '../../outcome.js';
import { apiFetch, currentBookId, currentPlaythrough, isReadOnlySimulator, saveState } from '../../run-context.js';
import { ALL_PANEL_OVERLAY_IDS, registerPanelShortcut, shortcutLabel } from '../../../core/util.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { t } from '../../../i18n.js';
import { beginFight, defaults, exchange } from './combat.js';
import { definition, encounters, loadRoster } from './definition.js';
import { createState } from './state.js';

const id = definition.stateKey;
const translate = (key, values) => t(definition.i18nPrefix + '.' + key, values);
const store = createState(() => ({
  run: currentPlaythrough(), bookId: currentBookId, readOnly: isReadOnlySimulator(), save: saveState,
}));
const active = fight => Boolean(fight && !fight.outcome);
const defaultsForOpponent = { strength: 4, fighting: 3 };
let ui, overlay, launcher, editor, start, abandon, controls, log, report, history, hint;
let mountedRun, renderedData;
const fields = {};

export const loadData = () => loadRoster(apiFetch);

function selectedEncounter() {
  return encounters.find(entry => entry.section === Number(fields.encounter.value));
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

function showSetup(busy, readOnly) {
  const encounter = selectedEncounter();
  const guards = encounter?.kind === 'guards';
  const duel = encounter?.kind === 'duel';
  const disabled = busy || readOnly;
  const options = { strategist: encounter, guardWord: guards, prayerUsed: guards, wounds: duel, positionWord: duel };
  for (const [key, visible] of Object.entries(options)) fields[key].parentElement.hidden = !visible;
  for (const input of Object.values(fields)) input.disabled = disabled;
  if (renderedData?.prayerUsed) fields.prayerUsed.disabled = true;
  editor.element.hidden = Boolean(encounter);
  editor.lock(disabled);
  start.disabled = disabled;
  abandon.hidden = !busy;
  hint.textContent = encounter ? translate(guards ? 'guardsHint' : 'duelHint') : '';
  hint.hidden = !encounter;
}

function startFight(data) {
  if (active(data.fight)) return;
  let encounter = selectedEncounter();
  const custom = encounter ? null : editor.read()[0];
  if (!encounter) {
    const name = custom.displayName || translate('opponent');
    encounter = { section: 0, kind: 'duel', name, opponent: { ...custom, name } };
  }
  const guards = encounter.kind === 'guards';
  const thorvald = encounter.kind === 'duel' && encounter.section !== 0;
  const player = { strength: ui.number(fields.strength), fighting: ui.number(fields.fighting) };
  const options = {
    strategist: Boolean(encounter.section && fields.strategist.checked),
    guardWord: guards && fields.guardWord.checked,
    positionWord: thorvald && fields.positionWord.checked,
    wounds: thorvald ? ui.number(fields.wounds) : 0,
    prayerUsed: Boolean(data.prayerUsed || guards && fields.prayerUsed.checked),
  };
  data.setup = { section: encounter.section, custom, ...options };
  data.prayerUsed = options.prayerUsed;
  data.player = player;
  data.fight = beginFight(player, encounter, options);
  data.log = data.fight.outcome ? [{ outcome: data.fight.outcome }] : [];
}

function renderControls(fight) {
  controls.replaceChildren();
  if (!active(fight)) return;
  const manual = ui.group(controls, 'manual');
  const yourRoll = ui.field(manual, 'yourRoll', { type: 'number', min: 1, max: 6, optional: true });
  const opponentRoll = fight.kind === 'duel'
    ? ui.field(manual, 'opponentRoll', { type: 'number', min: 1, max: 6, optional: true }) : null;
  const play = prayer => change(data => {
    const options = { prayer };
    if (!prayer) {
      const yours = ui.number(yourRoll, true);
      const theirs = opponentRoll ? ui.number(opponentRoll, true) : undefined;
      if (opponentRoll && (yours === undefined) !== (theirs === undefined)) throw new RangeError('Enter both dice');
      if (yours !== undefined) {
        const rolls = [yours, theirs];
        options.chance = () => rolls.shift();
      }
    }
    const next = exchange(data.fight, options);
    data.fight = next.fight;
    data.player.strength = next.fight.strength;
    if (prayer) data.prayerUsed = true;
    data.log.push(next.event);
    if (next.fight.outcome) data.log.push({ outcome: next.fight.outcome });
  });
  ui.button(controls, 'exchange', () => play(false));
  if (fight.prayerAvailable) ui.button(controls, 'prayer', () => play(true));
}

function renderReport(data) {
  report.replaceChildren();
  const fight = data?.fight;
  if (fight) {
    ui.text(report, translate('yourStrength', fight));
    if (fight.enemy) ui.text(report, translate('enemyStrength', fight.enemy));
    else ui.text(report, translate('guardsRemaining', fight));
    if (fight.destination) ui.text(report, translate('continueAt', { section: fight.destination }));
    else if (fight.outcome === 'loss' && fight.strength === 0) ui.text(report, translate('fatal'));
  }
  log.replaceChildren();
  for (const event of data?.log ?? []) {
    const key = event.outcome ?? (event.prayer ? 'prayerLog' : event.target != null ? 'guardLog' : 'duelLog');
    const line = ui.text(log, translate(key, {
      ...event, result: event.hit ? translate(event.hit + 'Hit') : '',
    }), 'div');
    if (event.outcome) decorateOutcome(line, event.outcome);
    else if (event.hit === 'player') line.classList.add('bsim-log-success');
    else if (event.hit === 'enemy') line.classList.add('bsim-log-danger');
  }
  log.scrollTop = log.scrollHeight;
  renderHistory(history, [...(data?.history ?? [])].reverse(), entry => entry.enemy + ' · ' + translate(entry.outcome));
}

export function render() {
  if (!overlay) return;
  const run = currentPlaythrough();
  const data = store.read();
  const freshRun = run !== mountedRun;
  if (freshRun || data !== renderedData) {
    mountedRun = run;
    renderedData = data;
    const player = data?.player ?? defaults;
    fields.strength.value = player.strength;
    fields.fighting.value = player.fighting;
    if (freshRun) {
      const setup = data?.setup ?? {};
      fields.encounter.value = String(setup.section ?? 0);
      for (const key of ['strategist', 'guardWord', 'positionWord']) fields[key].checked = Boolean(setup[key]);
      fields.wounds.value = setup.wounds ?? 0;
      editor.set([setup.custom ?? defaultsForOpponent]);
    }
    fields.prayerUsed.checked = Boolean(data?.prayerUsed);
    renderControls(data?.fight);
    renderReport(data);
  }
  showSetup(active(data?.fight), isReadOnlySimulator());
}

export function init() {
  if (overlay) return;
  ui = createD20Forms(document, id, translate);
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
  fields.strength = ui.field(left, 'strength', { type: 'number', min: 1, max: 99, value: defaults.strength });
  fields.fighting = ui.field(left, 'fighting', { type: 'number', min: 0, max: 99, value: defaults.fighting });
  fields.encounter = ui.field(left, 'encounter', {
    entries: [[0, translate('custom')], ...encounters.map(entry => [entry.section, entry.name + ' (§' + entry.section + ')'])],
  });
  fields.encounter.addEventListener('change', () => showSetup(active(store.read()?.fight), isReadOnlySimulator()));
  fields.strategist = ui.checkbox(left, 'strategist');
  fields.guardWord = ui.checkbox(left, 'guardWord');
  fields.prayerUsed = ui.checkbox(left, 'prayerUsed');
  fields.positionWord = ui.checkbox(left, 'positionWord');
  fields.wounds = ui.field(left, 'wounds', { type: 'number', min: 0, max: 99, value: 0 });
  editor = createOpponentEditor({
    document, id, t, language: 'bg',
    fields: [
      { key: 'strength', label: translate('strength'), min: 1, max: 99 },
      { key: 'fighting', label: translate('fighting'), max: 99 },
    ],
    presets: encounters.filter(entry => entry.opponent).map(entry => entry.opponent),
  });
  editor.fixCount(true);
  left.append(editor.element);
  hint = ui.text(left, '');
  start = ui.button(left, 'start', () => change(startFight));
  controls = document.createElement('div');
  left.append(controls);
  abandon = ui.button(left, 'abandon', () => {
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
  const past = ui.group(right, 'history');
  past.id = id + '-history';
  history = document.createElement('div');
  past.append(history);
  document.body.append(overlay);
  launcher = document.createElement('button');
  launcher.id = id + '-btn';
  launcher.style.display = 'none';
  launcher.innerHTML = shortcutLabel(t('battlesim.title'));
  getPlayBtnRow().append(launcher);
  launcher.addEventListener('click', () => { render(); overlay.classList.add('active'); });
  registerPanelShortcut('KeyS', {
    getButton: () => launcher, getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(key => key !== overlay.id),
    open: () => launcher.click(), close,
  });
  let backdrop = false;
  overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
  overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
  overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
}

export function setVisible(visible) {
  if (launcher) launcher.style.display = visible ? '' : 'none';
  if (!visible) close();
}
