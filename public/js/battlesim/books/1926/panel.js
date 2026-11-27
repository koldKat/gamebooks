import { apiFetch, currentBookId, currentPlaythrough, isReadOnlySimulator, saveState } from '../../run-context.js';
import { createD20Forms } from '../../engines/d20/forms.js';
import { createQuestState } from '../../engines/super-endless-quest/state.js';
import { decorateOutcome, renderHistory } from '../../outcome.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { ALL_PANEL_OVERLAY_IDS, registerPanelShortcut, shortcutLabel } from '../../../core/util.js';
import { t } from '../../../i18n.js';
import { rollFight, startFight, validateFight } from './combat.js';
import { definition, encounters, initialAttributes, loadRoster } from './definition.js';

const id = definition.stateKey;
const tr = (key, params) => t(`battlesim1926.${key}`, params);
const store = createQuestState(() => ({ run: currentPlaythrough(), bookId: currentBookId, definition, saveState }), { validateFight });

let overlay, launch, report, fields, rollButton, cancelButton, mountedRun, token;
const close = () => overlay?.classList.remove('active');
const selected = () => encounters.find(encounter => String(encounter.section) === fields.encounter.value);

function syncSetup() {
  const custom = !selected();
  for (const key of ['opponent', 'modifier', 'threshold']) fields[key].closest('label').hidden = !custom;
  fields.strength.closest('label').hidden = selected()?.kind === 'dexterity';
}

function present(state, ui) {
  report.replaceChildren();
  const fight = state.fight;
  const heading = ui.text(report, tr(fight?.status ?? 'ready'), 'h4');
  heading.className = 'bsim-side-title';
  decorateOutcome(heading, fight?.status);
  if (fight) {
    ui.text(report, fight.opponent.name);
    if (fight.destination != null) ui.text(report, tr('destination', { section: fight.destination }));
    const log = document.createElement('div');
    log.className = 'bsim-log';
    report.append(log);
    for (const [index, roll] of fight.rolls.entries()) {
      const line = ui.text(log, tr('rollLine', {
        ...roll, round: index + 1, dice: roll.dice.join(' + '),
      }));
      line.className = { fighting: 'bsim-log-muted', win: 'bsim-log-success', loss: 'bsim-log-danger' }[roll.outcome];
    }
  }
  if (state.history.length) {
    ui.text(report, tr('history'), 'h4').className = 'bsim-side-title';
    const history = document.createElement('div');
    history.className = 'bsim-history-list';
    report.append(history);
    renderHistory(history, state.history.slice(-20).reverse(), row => `${row.enemy} · ${tr(row.outcome)}`);
  }
}

const ui = () => createD20Forms(document, id, tr);

export function loadData() { return loadRoster(apiFetch); }

export function render() {
  if (!overlay) return;
  token = store.snapshot();
  if (!token) { close(); return; }
  const { state, run } = token;
  const fight = state.fight;
  if (mountedRun !== run) {
    mountedRun = run;
    fields.encounter.value = fight?.opponent.section ?? '';
    fields.opponent.value = fight?.opponent.section == null ? fight?.opponent.name ?? '' : '';
    fields.modifier.value = fight?.opponent.section == null ? fight?.opponent.modifiers[0] ?? 18 : 18;
    fields.threshold.value = fight?.opponent.section == null ? fight?.opponent.winAtMost ?? 7 : 7;
    for (const [key, value] of Object.entries(initialAttributes)) fields[key].value = state.player?.[key] ?? value;
    fields.first.value = fields.second.value = '';
  }
  syncSetup();
  const fighting = fight?.status === 'fighting';
  const readOnly = isReadOnlySimulator();
  for (const [key, field] of Object.entries(fields)) field.disabled = readOnly || (fighting && key !== 'first' && key !== 'second');
  rollButton.disabled = readOnly;
  cancelButton.disabled = readOnly || !fighting;
  present(state, ui());
}

function roll() {
  if (isReadOnlySimulator() || !token) return;
  try {
    const form = ui();
    const manuallyEntered = fields.first.value.trim() || fields.second.value.trim();
    const dice = manuallyEntered ? [form.number(fields.first), form.number(fields.second)] : undefined;
    const changed = store.update(state => {
      if (state.fight?.status !== 'fighting') {
        let encounter = selected();
        if (!encounter) {
          const threshold = form.number(fields.threshold);
          encounter = { name: fields.opponent.value.trim() || tr('opponent'), kind: 'opposed',
            modifiers: [form.number(fields.modifier)], winAtMost: threshold, loseAtLeast: threshold + 1 };
        }
        state.fight = startFight({ strength: form.number(fields.strength), dexterity: form.number(fields.dexterity) }, encounter);
      }
      state.fight = rollFight(state.fight, dice);
      state.history = state.history.slice(-199);
      return state;
    }, token);
    if (changed) { fields.first.value = fields.second.value = ''; render(); }
  } catch { showAlert(tr('invalid')); }
}

export function init() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.id = `${id}-overlay`;
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form">
    <div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div>
    <div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"><div class="bsim-report"></div></div></div>
  </div>`;
  overlay.querySelector('.inv-modal-title').textContent = tr('title');
  const closer = overlay.querySelector('.inv-close-btn');
  closer.setAttribute('aria-label', t('btn.close'));
  closer.addEventListener('click', close);
  const left = overlay.querySelector('.bsim-col-left');
  report = overlay.querySelector('.bsim-report');
  const form = ui();
  form.text(left, tr('rules'));
  fields = {
    encounter: form.field(left, 'encounter', { entries: [['', tr('custom')], ...encounters.map(item => [String(item.section), `§${item.section} · ${item.name}`])] }),
    strength: form.field(left, 'strength', { type: 'number', min: 2, max: 11, value: initialAttributes.strength }),
    dexterity: form.field(left, 'dexterity', { type: 'number', min: 2, max: 11, value: initialAttributes.dexterity }),
    opponent: form.field(left, 'opponent', { optional: true }),
    modifier: form.field(left, 'modifier', { type: 'number', min: 0, max: 50, value: 18 }),
    threshold: form.field(left, 'threshold', { type: 'number', min: 0, max: 12, value: 7 }),
  };
  fields.opponent.maxLength = 120;
  fields.encounter.addEventListener('change', syncSetup);
  const dice = form.group(left, 'manualDice');
  fields.first = form.field(dice, 'first', { type: 'number', min: 1, max: 6, optional: true });
  fields.second = form.field(dice, 'second', { type: 'number', min: 1, max: 6, optional: true });
  rollButton = form.button(left, 'roll', roll);
  cancelButton = form.button(left, 'cancel', () => {
    const previous = token;
    if (isReadOnlySimulator() || previous?.state.fight?.status !== 'fighting') return;
    showConfirm(tr('cancelConfirm'), () => {
      if (!isReadOnlySimulator() && store.update(state => { state.fight = null; return state; }, previous)) render();
    });
  });
  document.body.append(overlay);
  launch = document.createElement('button');
  launch.id = `${id}-btn`;
  launch.style.display = 'none';
  launch.innerHTML = shortcutLabel(t('battlesim.title'));
  getPlayBtnRow().append(launch);
  launch.addEventListener('click', () => { render(); if (token) overlay.classList.add('active'); });
  registerPanelShortcut('KeyS', { getButton: () => launch, getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(key => key !== overlay.id), open: () => launch.click(), close });
  let backdrop = false;
  overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
  overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
  overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
}

export function setVisible(visible) {
  if (launch) launch.style.display = visible ? '' : 'none';
  if (!visible) close();
}
