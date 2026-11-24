import { apiFetch, currentBookId, currentPlaythrough, isReadOnlySimulator, saveState } from '../../run-context.js';
import { createD20Forms } from '../../engines/d20/forms.js';
import { createQuestState } from '../../engines/super-endless-quest/state.js';
import { createOpponentEditor } from '../../opponents.js';
import { decorateOutcome } from '../../outcome.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { ALL_PANEL_OVERLAY_IDS, registerPanelShortcut, shortcutLabel } from '../../../core/util.js';
import { t } from '../../../i18n.js';
import { combatAction, startArmyBattle, startEncounter, validateFight } from './combat.js';
import { definition, encounters, loadRoster } from './definition.js';

const id = definition.stateKey;
const tr = (key, params) => t(definition.i18nPrefix + '.' + key, params);
const store = createQuestState(() => ({
  run: currentPlaythrough(), bookId: currentBookId, definition, saveState,
}), { validateFight });
const customOpponent = () => ({ hp: 10, hit: 6, damage: 3, hitsToWin: 0, poisonOnHit: 'no' });
const opponentRow = profile => ({ ...profile, poisonOnHit: profile.poisonOnHit ? 'yes' : 'no' });
const stats = new Map();
const armyScores = new Map();
let ui, overlay, launcher, editor, mode, playerPanel, armyPanel, repeat, notes, controls, report, start, reset, cancel;
let selected, token, mountedRun, mountedValue;

export const loadData = () => loadRoster(apiFetch);

function close() {
  overlay.classList.remove('active');
}

function edit(update, expected = token) {
  if (isReadOnlySimulator()) return;
  try {
    if (store.update(state => {
      const next = update(state);
      if (next) next.history = next.history.slice(-199);
      return next;
    }, expected)) render();
  } catch {
    showAlert(tr('invalid'));
  }
}

function layout() {
  const army = mode.value === 'army';
  playerPanel.hidden = army;
  armyPanel.hidden = !army;
  repeat.closest('label').hidden = !selected?.repeatable;
  editor.fixCount(Boolean(selected));
  notes.textContent = selected?.sourceNote || tr('customNote');
}

function select(entry) {
  selected = entry;
  editor.set(entry.profiles.map(opponentRow));
  repeat.value = '';
  layout();
}

function prepareFight(state) {
  if (state.fight?.status === 'fighting') return null;
  if (mode.value === 'army') {
    const scores = Object.fromEntries([...armyScores].map(([key, input]) => [key, ui.number(input)]));
    state.setup = { ...state.setup, mode: 'army', scores };
    state.fight = startArmyBattle({ offense: scores.playerOffense, defense: scores.playerDefense },
      { offense: scores.enemyOffense, defense: scores.enemyDefense, name: tr('dragonarmy') });
    return state;
  }
  const player = Object.fromEntries([...stats].map(([key, input]) => [key, ui.number(input)]));
  let profiles = editor.read().map(row => ({
    ...row, name: row.displayName || tr('opponent'), poisonOnHit: row.poisonOnHit === 'yes',
  }));
  if (selected?.repeatable) {
    profiles = Array.from({ length: ui.number(repeat) }, (_, index) => ({
      ...profiles[0], displayName: '', name: profiles[0].name + ' ' + (index + 1),
    }));
  }
  const name = selected?.name ?? profiles.map(row => row.name).join(', ').slice(0, 200);
  const entry = { key: selected?.key, name, section: selected?.section, profiles };
  state.setup = { ...state.setup, mode: 'encounter', selected: selected?.key, player,
    opponents: editor.snapshot(), repeat: repeat.value };
  state.fight = startEncounter(player, entry);
  return state;
}

function opponentLog(event, fight) {
  const die = event.die ?? tr('opening');
  if (event.kind === 'opening' || event.kind === 'player') {
    return [tr(fight.mode === 'army' ? 'armyAttack' : 'playerAttack', {
      ...event, die, result: tr(event.hit ? 'hit' : 'miss'),
    }), event.hit ? 'success' : 'muted'];
  }
  if (event.kind === 'enemy') {
    return [tr('enemyAttack', { ...event, result: tr(event.hit ? 'hit' : 'miss') }), event.hit ? 'danger' : 'muted'];
  }
  if (event.kind === 'hitLimit') return [tr('hitLimit', event), 'danger'];
  if (event.kind === 'defense') return [tr('defenseOutcome'), fight.status === 'win' ? 'success' : 'danger'];
  if (event.kind === 'impTail') return [tr('impTail', { ...event, die: event.die ?? tr('noRoll') }), event.life ? 'danger' : 'accent'];
  return [tr('poisonDamage', event), 'danger'];
}

function showReport(state) {
  report.replaceChildren();
  const fight = state.fight;
  const heading = ui.text(report, tr(fight ? 'status.' + fight.status : 'ready'), 'h4');
  heading.className = 'bsim-side-title';
  decorateOutcome(heading, fight?.status);
  if (fight) {
    if (fight.mode === 'encounter') ui.text(report, tr('ryeStats', fight.player));
    else ui.text(report, tr('armyLife', fight.player));
    for (const enemy of fight.enemies) ui.text(report, tr('opponentLife', enemy));
    const log = document.createElement('div');
    log.className = 'bsim-log';
    report.append(log);
    for (const event of [...fight.events].reverse()) {
      const [message, tone] = opponentLog(event, fight);
      ui.text(log, event.round ? event.round + '. ' + message : message).className = 'bsim-log-' + tone;
    }
  }
  if (state.history.length) {
    ui.text(report, tr('history'), 'h4').className = 'bsim-side-title';
    for (const event of state.history.slice(-20).reverse()) {
      decorateOutcome(ui.text(report, event.enemy + ' · ' + tr('status.' + event.outcome)), event.outcome);
    }
  }
}

function roundControls(fight, snapshot) {
  const opening = fight.mode === 'army' && fight.round === 0;
  const enemy = fight.enemies[fight.currentEnemy ?? 0];
  const optionalDie = key => ui.field(controls, key, { type: 'number', min: 1, max: 12, optional: true });
  const diceFields = opening ? {} : { player: optionalDie('playerDie'), enemy: optionalDie('enemyDie') };
  if (enemy.impTactic) diceFields.tail = optionalDie('tailDie');
  const modifier = fight.mode === 'encounter'
    ? ui.field(controls, 'hitModifier', { type: 'number', value: 0, min: -12, max: 12 }) : null;
  const weapon = fight.mode === 'encounter'
    ? ui.field(controls, 'weaponDamage', { type: 'number', max: 1000, optional: true }) : null;
  ui.button(controls, opening ? 'openingStrike' : 'rollRound', () => edit(state => {
    const dice = Object.fromEntries(Object.entries(diceFields).map(([key, field]) => [key, ui.number(field, true)]));
    state.fight = combatAction(state.fight, { kind: 'round', revision: fight.revision, dice,
      hitModifier: modifier ? ui.number(modifier) : 0, weaponDamage: weapon ? ui.number(weapon, true) : undefined });
    return state;
  }, snapshot));
}

export function render() {
  if (!overlay) return;
  const snapshot = store.snapshot();
  if (!snapshot) { close(); return; }
  const { state } = snapshot;
  if (snapshot.run !== mountedRun || snapshot.original !== mountedValue) {
    const setup = state.setup || {};
    mode.value = setup.mode || 'encounter';
    const player = state.fight?.mode === 'encounter' ? state.fight.player : setup.player;
    stats.get('hp').value = player?.hp ?? 10;
    stats.get('armor').value = player?.armor ?? 40;
    for (const [key, input] of armyScores) input.value = setup.scores?.[key] ?? '';
    editor.set(setup.opponents || [customOpponent()]);
    selected = encounters.find(entry => entry.key === setup.selected);
    repeat.value = setup.repeat ?? '';
    mountedRun = snapshot.run;
    mountedValue = snapshot.original;
  }
  token = snapshot;
  layout();
  const locked = state.fight?.status === 'fighting';
  const readOnly = isReadOnlySimulator();
  mode.disabled = start.disabled = reset.disabled = Boolean(locked || readOnly);
  for (const input of [...stats.values(), ...armyScores.values(), repeat]) input.disabled = Boolean(locked || readOnly);
  editor.lock(locked || readOnly);
  cancel.disabled = !locked || readOnly;
  controls.replaceChildren();
  if (readOnly) ui.text(controls, t('battlesim.no_active_playthrough'));
  else if (locked) roundControls(state.fight, snapshot);
  showReport(state);
}

export function init() {
  if (overlay) return;
  ui = createD20Forms(document, id, tr);
  overlay = document.createElement('div');
  overlay.id = id + '-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = '<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
  overlay.querySelector('.inv-modal-title').textContent = tr('title');
  const closer = overlay.querySelector('.inv-close-btn');
  closer.setAttribute('aria-label', t('btn.close'));
  closer.addEventListener('click', close);
  const left = overlay.querySelector('.bsim-col-left');
  report = overlay.querySelector('.bsim-col-right');
  mode = ui.field(left, 'mode', { entries: [['encounter', tr('duel')], ['army', tr('army')]] });
  mode.addEventListener('change', layout);

  playerPanel = document.createElement('section');
  left.append(playerPanel);
  ui.text(playerPanel, tr('rules'));
  stats.set('hp', ui.field(playerPanel, 'hp', { type: 'number', min: 1, max: 1000 }));
  stats.set('armor', ui.field(playerPanel, 'armor', { type: 'number', max: 1000 }));
  editor = createOpponentEditor({ document, id, t,
    fields: [
      { key: 'hp', label: tr('opponentHp'), min: 1, max: 1000 },
      { key: 'hit', label: tr('hitThrough'), min: 0, max: 12 },
      { key: 'damage', label: tr('damage'), max: 1000 },
      { key: 'hitsToWin', label: tr('hitsToWin'), max: 100, defaultValue: 0 },
      { key: 'poisonOnHit', label: tr('poisonOnHit'), options: [{ value: 'no', label: tr('no') }, { value: 'yes', label: tr('yes') }] },
    ],
    presets: encounters.map(entry => ({ ...opponentRow(entry.profiles[0]),
      displayName: entry.name + (entry.section ? ' (§' + entry.section + ')' : ''), entry })),
    onSelect: option => select(option.entry),
  });
  playerPanel.append(editor.element);
  repeat = ui.field(playerPanel, 'repeat', { type: 'number', min: 1, max: 100 });
  notes = ui.text(playerPanel, tr('customNote'));
  reset = ui.button(playerPanel, 'custom', () => {
    selected = null;
    editor.set([customOpponent()]);
    layout();
  });

  armyPanel = document.createElement('section');
  left.append(armyPanel);
  ui.text(armyPanel, tr('armyRules'));
  for (const key of ['playerOffense', 'playerDefense', 'enemyOffense', 'enemyDefense']) {
    armyScores.set(key, ui.field(armyPanel, key, { type: 'number', max: 1000 }));
  }
  start = ui.button(left, 'start', () => edit(prepareFight));
  controls = document.createElement('div');
  left.append(controls);
  cancel = ui.button(left, 'cancel', () => {
    const expected = token;
    if (expected?.state.fight?.status !== 'fighting') return;
    showConfirm(tr('confirmCancel'), () => edit(state => {
      state.fight = combatAction(state.fight, { kind: 'cancel', revision: state.fight.revision });
      return state;
    }, expected));
  });

  launcher = document.createElement('button');
  launcher.id = id + '-btn';
  launcher.style.display = 'none';
  launcher.innerHTML = shortcutLabel(t('battlesim.title'));
  getPlayBtnRow().append(launcher);
  document.body.append(overlay);
  launcher.addEventListener('click', () => { render(); overlay.classList.add('active'); });
  registerPanelShortcut('KeyS', {
    getButton: () => launcher, getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(value => value !== overlay.id),
    open: () => launcher.click(), close,
  });
  let pressedBackdrop = false;
  overlay.addEventListener('mousedown', event => { pressedBackdrop = event.target === overlay; });
  overlay.addEventListener('click', event => { if (pressedBackdrop && event.target === overlay) close(); });
  overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
}

export function setVisible(value) {
  if (!launcher) return;
  launcher.style.display = value ? '' : 'none';
  if (!value) close();
}
