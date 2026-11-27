import { apiFetch, currentBookId, currentPlaythrough, isReadOnlySimulator, saveState } from '../../run-context.js';
import { createD20Forms } from '../../engines/d20/forms.js';
import { createQuestState } from '../../engines/super-endless-quest/state.js';
import { decorateOutcome, renderHistory } from '../../outcome.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { ALL_PANEL_OVERLAY_IDS, registerPanelShortcut, shortcutLabel } from '../../../core/util.js';
import { t } from '../../../i18n.js';
import { diceFor, rollFight, startFight, validateFight } from './combat.js';
import { definition, encounters, initialAttributes, loadRoster } from './definition.js';

const id = definition.stateKey;
const tr = (key, params) => t(`battlesim1927.${key}`, params);
const store = createQuestState(() => ({ run: currentPlaythrough(), bookId: currentBookId, definition, saveState }), { validateFight });
let overlay, launcher, form, report, fields, bonusLabel, note, rollButton, cancel, mountedRun, token;
const close = () => overlay?.classList.remove('active');
const selected = () => encounters.find(item => item.key === fields.encounter.value);

function syncSetup() {
  const encounter = selected();
  for (const key of ['opponent', 'opponentDice', 'opponentModifier']) fields[key].closest('label').hidden = Boolean(encounter);
  fields.bonus.closest('label').hidden = !encounter?.bonus;
  bonusLabel.textContent = encounter?.bonus ? tr(`bonus.${encounter.bonus.key}`) : '';
  note.textContent = encounter?.note ?? '';
  note.hidden = !note.textContent;
}

function display(fight, history) {
  report.replaceChildren();
  const heading = form.text(report, tr(fight?.status ?? 'ready'), 'h4');
  heading.className = 'bsim-side-title';
  decorateOutcome(heading, fight?.status);
  if (fight) {
    if (fight.destinations.length) {
      const destination = fight.status === 'win' && fight.opponent.destinationLabel
        ? fight.opponent.destinationLabel : fight.destinations.join(' / ');
      form.text(report, tr('destination', { destination }));
    }
    if (fight.status === 'tie') form.text(report, tr('tieNote'));
    const adjusted = Object.entries(fight.player).filter(([key, value]) => fight.initial[key] !== value);
    if (adjusted.length) form.text(report, adjusted.map(([key, value]) => `${tr(key)} ${fight.initial[key]} → ${value}`).join(' · '));
    const log = document.createElement('div');
    log.className = 'bsim-log';
    report.append(log);
    for (const roll of fight.rolls) {
      const dice = roll.dice.join(' + ');
      const modifier = roll.modifier == null ? '' : roll.modifier >= 0 ? ` + ${roll.modifier}` : ` − ${-roll.modifier}`;
      const stat = roll.stat ? tr(roll.stat) : '';
      const line = form.text(log, tr(`log.${roll.phase}`, { ...roll, result: roll.total + (roll.modifier ?? 0), dice, modifier, stat }));
      if (roll.phase === 'attack' && fight.rolls.at(-1) === roll && fight.status !== 'fighting') decorateOutcome(line, fight.status);
    }
  }
  if (history.length) {
    form.text(report, tr('history'), 'h4').className = 'bsim-side-title';
    const list = document.createElement('div');
    list.className = 'bsim-history-list';
    report.append(list);
    renderHistory(list, history.slice(-20).reverse(), item => `${item.enemy} · ${tr(item.outcome)}`);
  }
}

export function loadData() { return loadRoster(apiFetch); }

function setAttributes(values) {
  for (const [key, value] of Object.entries(initialAttributes)) fields[key].value = values?.[key] ?? value;
}

export function render() {
  if (!overlay) return;
  token = store.snapshot();
  if (!token) { close(); return; }
  const { state, run } = token;
  const fight = state.fight;
  if (mountedRun !== run) {
    mountedRun = run;
    fields.encounter.value = fight?.opponent.key ?? '';
    fields.bonus.checked = fight?.useBonus ?? false;
    const custom = fight && !fight.opponent.section ? fight.opponent : null;
    fields.opponent.value = custom?.name ?? '';
    fields.opponentDice.value = custom?.opponentDice ?? '1';
    fields.opponentModifier.value = custom?.opponentModifier ?? 0;
    setAttributes(state.player);
    fields.first.value = fields.second.value = '';
  }
  const active = fight?.status === 'fighting';
  const readOnly = isReadOnlySimulator();
  const dice = active ? diceFor(fight) : 2;
  syncSetup();
  for (const [key, field] of Object.entries(fields)) field.disabled = readOnly || (active && !['first', 'second'].includes(key));
  fields.second.disabled = readOnly || dice === 1;
  fields.second.closest('label').hidden = dice === 1;
  rollButton.disabled = readOnly;
  rollButton.textContent = tr(`phase.${active ? fight.phase : 'save'}`);
  cancel.disabled = readOnly || !active;
  display(fight, state.history);
}

function freshFight() {
  const encounter = selected() ?? {
    name: fields.opponent.value.trim() || tr('opponent'),
    saves: [{ stat: 'strength', onPass: -3, onFail: 2 }], targetStats: ['brawling'],
    opponentDice: Number(fields.opponentDice.value), opponentModifier: form.number(fields.opponentModifier),
  };
  const player = Object.fromEntries(Object.keys(initialAttributes).map(key => [key, form.number(fields[key])]));
  return startFight(player, encounter, fields.bonus.checked);
}

function roll() {
  if (!token || isReadOnlySimulator()) return;
  try {
    const previous = token.state.fight;
    const fight = previous?.status === 'fighting' ? previous : freshFight();
    const inputs = diceFor(fight) === 2 ? [fields.first, fields.second] : [fields.first];
    const dice = inputs.some(input => input.value.trim()) ? inputs.map(input => form.number(input)) : undefined;
    const result = rollFight(fight, dice);
    if (store.update(state => { state.fight = result; state.history = state.history.slice(-199); return state; }, token)) {
      fields.first.value = fields.second.value = '';
      setAttributes(result.player);
      render();
    }
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
  form = createD20Forms(document, id, tr);
  form.text(left, tr('rules'));
  const options = [['', tr('custom')], ...encounters.map(x => [x.key, `§${x.section} · ${x.label}`])];
  fields = { encounter: form.field(left, 'encounter', { entries: options }) };
  for (const [key, value] of Object.entries(initialAttributes)) fields[key] = form.field(left, key, { type: 'number', min: 2, max: 12, value });
  fields.opponent = form.field(left, 'opponent', { optional: true });
  fields.opponent.maxLength = 120;
  fields.opponentDice = form.field(left, 'opponentDice', { entries: [['1', tr('oneDie')], ['2', tr('twoDice')]] });
  fields.opponentModifier = form.field(left, 'opponentModifier', { type: 'number', min: -12, max: 12, value: 0 });
  fields.bonus = form.checkbox(left, 'bonusLabel');
  bonusLabel = fields.bonus.closest('label').querySelector('span');
  fields.encounter.addEventListener('change', () => { fields.bonus.checked = false; syncSetup(); });
  note = form.text(left, '');
  const dice = form.group(left, 'manual');
  fields.first = form.field(dice, 'first', { type: 'number', min: 1, max: 6, optional: true });
  fields.second = form.field(dice, 'second', { type: 'number', min: 1, max: 6, optional: true });
  rollButton = form.button(left, 'roll', roll);
  cancel = form.button(left, 'cancel', () => {
    const previous = token;
    if (isReadOnlySimulator() || previous?.state.fight?.status !== 'fighting') return;
    showConfirm(tr('cancelConfirm'), () => {
      if (!isReadOnlySimulator() && store.update(state => { state.fight = null; return state; }, previous)) render();
    });
  });
  document.body.append(overlay);
  launcher = document.createElement('button');
  launcher.id = `${id}-btn`;
  launcher.style.display = 'none';
  launcher.innerHTML = shortcutLabel(t('battlesim.title'));
  getPlayBtnRow().append(launcher);
  launcher.addEventListener('click', () => { render(); if (token) overlay.classList.add('active'); });
  registerPanelShortcut('KeyS', { getButton: () => launcher, getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(key => key !== overlay.id), open: () => launcher.click(), close });
  let backdrop = false;
  overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
  overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
  overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
}

export function setVisible(visible) {
  if (launcher) launcher.style.display = visible ? '' : 'none';
  if (!visible) close();
}
