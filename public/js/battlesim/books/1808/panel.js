import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showConfirm } from '../../../ui-helpers/confirm.js';
import { decorateHistory, decorateOutcome } from '../../outcome.js';
import { currentPlaythrough, isReadOnlySimulator } from '../../run-context.js';
import { createFight, currentCheck, startCheck, changeDie, canChangeDie, finishCheck, availableRecovery, resolveRecovery } from './combat.js';
import { defaultPlayer, definition, encounters } from './definition.js';
import { changeState, readState } from './state.js';

const id = definition.stateKey;
const el = key => document.getElementById(`${id}-${key}`);
const copy = (key, params) => t(`battlesim1808.${key}`, params);
const label = key => escapeHtml(copy(key));
const coreFields = ['hit', 'dex', 'vigor', 'ward'];
const itemCounts = ['fierySpirit', 'silverTongue', 'gnomeFood', 'cleanser'];
const itemFlags = Object.keys(defaultPlayer).filter(key => typeof defaultPlayer[key] === 'boolean');
const modifierKinds = ['weapon', 'brassknuckles', 'crystal'];
const staticChecks = ['dexPassed', 'witGatePassed'];
const fightOptions = ['useFiery', 'useSilver', 'witPassed'];
const customFields = ['name', 'threshold', 'checks', 'damage', 'living'];
let openedRun;

const button = key => `<button type="button" class="inv-add-btn" id="${id}-${key}">${label(key)}</button>`;
const input = (key, min = 0, max = 50) => `<label class="inv-edit-row"><span class="inv-edit-label">${label(key)}</span><input id="${id}-${key}" class="inv-edit-input inv-qty-input" type="number" min="${min}" max="${max}" step="1" required autocomplete="off"></label>`;
const checkbox = key => `<label class="bsim-checkbox" id="${id}-row-${key}"><input id="${id}-${key}" type="checkbox"><span>${label(key)}</span></label>`;

function close() {
  el('overlay')?.classList.remove('active');
}

function selected(data) {
  return encounters.find(entry => String(entry.section) === data.selected);
}

function persist(update) {
  if (openedRun !== currentPlaythrough() || !el('overlay').classList.contains('active')) return;
  if (changeState(update)) render();
}

function readNumber(key, fallback) {
  const control = el(key);
  const n = control.valueAsNumber;
  return Number.isSafeInteger(n) && control.validity.valid ? n : fallback;
}

function customEncounter() {
  const threshold = readNumber('threshold', 4);
  const failVigor = -readNumber('damage', 1);
  return {
    name: el('name').value.trim() || copy('custom'),
    living: el('living').checked,
    checks: Array.from({ length: readNumber('checks', 1) }, () => ({ threshold, failVigor })),
  };
}

function formatLog(row) {
  if (row.kind === 'setup') return escapeHtml(copy('setupRoll', { dice: row.dice.join(' + '), checks: row.checks }));
  if (row.kind === 'heal') return escapeHtml(copy('healed', { item: copy(row.item), vigor: row.vigor }));
  const { success, dice, threshold, damage, effects, rangedRoll } = row;
  const result = `<span class="bsim-log-${success ? 'success' : 'danger'}">${label(success ? 'passed' : 'failed')}</span>`;
  const values = dice.length ? escapeHtml(dice.join(', ')) : label('noDice');
  let text = copy('rollResult', { result, dice: `<span class="bsim-log-accent">${values}</span>`, threshold });
  if (rangedRoll) text += ' ' + escapeHtml(copy('rangedRoll', { roll: rangedRoll }));
  if (damage) text += ` <span class="bsim-log-danger">${escapeHtml(copy('damageTaken', { damage }))}</span>`;
  if (effects.length) text += ' ' + effects.map(effect => label(effect)).join(', ');
  return text;
}

export function render() {
  const overlay = el('overlay');
  if (!overlay?.classList.contains('active')) return;
  if (openedRun !== currentPlaythrough()) { close(); return; }
  const data = readState();
  if (!data) { close(); return; }
  const readonly = isReadOnlySimulator();
  const f = data.fight;
  const active = f?.status === 'fighting';
  const player = active ? f.player : data.player;
  const preset = selected(data);
  const stage = f?.stage;
  const editable = !readonly && !active;
  const setEnabled = (key, enabled) => { el(key).disabled = !enabled; };
  el('encounter').value = data.selected;
  setEnabled('encounter', editable);
  el('custom-fields').hidden = !!preset;
  for (const key of customFields) setEnabled(key, editable);
  for (const key of [...coreFields, ...itemCounts]) {
    if (document.activeElement !== el(key)) el(key).value = player[key];
    setEnabled(key, editable);
  }
  for (const key of itemFlags) {
    el(key).checked = player[key];
    setEnabled(key, editable);
  }
  for (const key of staticChecks) setEnabled(key, editable);
  el('row-dexPassed').hidden = !['trap', 'alligator'].includes(preset?.sequence);
  el('row-witGatePassed').hidden = preset?.sequence !== 'trap';
  el('notes').textContent = preset?.prerequisite ?? '';
  setEnabled('start', editable && player.vigor > 0);
  setEnabled('cancel', !readonly && active);
  const ready = !readonly && active && stage === 'ready';
  const rolled = !readonly && active && stage === 'rolled';
  setEnabled('roll', ready);
  setEnabled('accept', rolled);
  setEnabled('useFiery', ready && player.ward > 0 && player.fierySpirit > 0);
  setEnabled('useSilver', ready && f.spec.living && player.silverTongue > 0);
  setEnabled('witPassed', !el('useSilver').disabled && el('useSilver').checked);
  el('row-witPassed').hidden = !el('useSilver').checked || el('useSilver').disabled;

  el('dice').innerHTML = active && stage === 'rolled' ? f.check.dice.map((n, i) => {
    const modifiers = modifierKinds.filter(kind => !readonly && canChangeDie(f, kind, i))
      .map(kind => `<button type="button" class="inv-add-btn" data-die="${i}" data-modifier="${kind}">${label(kind)}</button>`).join('');
    return `<div class="inv-edit-row"><strong>${escapeHtml(copy('die', { n: i + 1, value: n }))}</strong>${modifiers}</div>`;
  }).join('') : '';
  el('recovery').hidden = stage !== 'recovery';
  for (const key of ['gnomeFood', 'soup', 'cleanser']) {
    setEnabled(`heal-${key}`, !readonly && availableRecovery(f).includes(key));
  }
  setEnabled('heal-none', !readonly && stage === 'recovery');
  const status = active ? copy(stage, { n: f.attempts + 1, target: f.check?.threshold ?? currentCheck(f).threshold }) : copy(f?.status ?? 'pick');
  el('status').textContent = status;
  decorateOutcome(el('status'), f?.status);
  el('lostItems').textContent = f?.lostItems ? copy('lostItems', { n: f.lostItems }) : '';
  el('log').innerHTML = data.log.slice().reverse().map(row => `<div>${formatLog(row)}</div>`).join('');
  const history = data.history.slice().reverse();
  el('history').innerHTML = history.map(row => `<div class="bsim-history-row">${escapeHtml(row.enemy)} · ${label(row.outcome)}</div>`).join('');
  decorateHistory(el('history'), history);
}

function open() {
  if (!readState()) return;
  openedRun = currentPlaythrough();
  el('overlay').classList.add('active');
  render();
  el('close').focus();
}

export function init() {
  if (el('overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = `${id}-overlay`;
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
    <header class="inv-modal-hdr"><span class="inv-modal-title" id="${id}-title">${label('title')}</span><button type="button" id="${id}-close" class="inv-close-btn" aria-label="${escapeHtml(t('btn.close'))}">&times;</button></header>
    <div class="bsim-body"><div class="bsim-col bsim-col-left">
      <label class="inv-edit-row"><span>${label('encounter')}</span><select class="inv-edit-input" id="${id}-encounter">
        <option value="custom">${label('custom')}</option>${encounters.map(p => `<option value="${p.section}">E${p.section} · ${escapeHtml(p.name)}</option>`).join('')}</select></label>
      <div id="${id}-custom-fields"><label class="inv-edit-row"><span>${label('name')}</span><input class="inv-edit-input" id="${id}-name" maxlength="100" autocomplete="off"></label>
        ${input('threshold', 1, 6)}${input('checks', 1, 24)}${input('damage', 0, 50)}${checkbox('living')}</div>
      <p id="${id}-notes"></p>
      ${staticChecks.map(checkbox).join('')}
      ${coreFields.map(key => input(key, 0, key === 'vigor' ? 999 : 50)).join('')}
      <details class="bsim-side"><summary>${label('items')}</summary>
        ${itemCounts.map(key => input(key)).join('')}${itemFlags.map(checkbox).join('')}</details>
      <div class="bsim-btn-row">${button('start')}${button('cancel')}</div>
      ${fightOptions.map(checkbox).join('')}
      <div class="bsim-btn-row">${button('roll')}${button('accept')}</div>
      <div id="${id}-dice"></div>
      <div id="${id}-recovery" hidden><p>${label('recovery')}</p>
        ${['gnomeFood', 'soup', 'cleanser', 'none'].map(key => button(`heal-${key}`)).join('')}</div>
    </div><div class="bsim-col bsim-col-right">
      <div id="${id}-status" class="bsim-status" role="status" aria-live="polite"></div>
      <p id="${id}-lostItems"></p><div id="${id}-log" class="bsim-log"></div>
      <details class="bsim-history"><summary>${label('history')}</summary><div id="${id}-history" class="bsim-history-list"></div></details>
    </div></div></div>`;
  document.body.appendChild(overlay);
  for (const [key, n] of Object.entries({ threshold: 4, checks: 1, damage: 1 })) el(key).value = n;
  el('living').checked = true;
  const trigger = document.createElement('button');
  trigger.id = `${id}-btn`;
  trigger.style.display = 'none';
  trigger.innerHTML = shortcutLabel(t('battlesim.title'));
  trigger.setAttribute('aria-keyshortcuts', 'S');
  getPlayBtnRow().appendChild(trigger);
  trigger.addEventListener('click', open);
  el('close').addEventListener('click', close);
  let backdropStart = false;
  overlay.addEventListener('mousedown', event => { backdropStart = event.target === overlay; });
  overlay.addEventListener('click', event => { if (backdropStart && event.target === overlay) close(); });
  registerPanelShortcut('KeyS', { getButton: () => trigger, getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(key => key !== overlay.id), open, close });
  el('encounter').addEventListener('change', () => persist(data => { data.selected = el('encounter').value; }));
  for (const key of [...coreFields, ...itemCounts, ...itemFlags]) {
    el(key).addEventListener('change', () => persist(data => {
      if (data.fight?.status === 'fighting') return;
      data.player[key] = itemFlags.includes(key) ? el(key).checked : readNumber(key, data.player[key]);
      el(key).value = itemFlags.includes(key) ? el(key).value : data.player[key];
    }));
  }
  el('start').addEventListener('click', () => persist(data => {
    if (data.fight?.status === 'fighting' || data.player.vigor <= 0) return;
    data.fight = createFight(selected(data) ?? customEncounter(), data.player, {
      dexPassed: el('dexPassed').checked, witPassed: el('witGatePassed').checked,
    });
    data.log = data.fight.setupRoll ? [{ kind: 'setup', dice: data.fight.setupRoll, checks: data.fight.totalChecks }] : [];
  }));
  el('cancel').addEventListener('click', () => {
    const run = currentPlaythrough();
    const fight = readState()?.fight;
    showConfirm(copy('cancelConfirm'), () => {
      if (run !== currentPlaythrough() || readState()?.fight !== fight) return;
      persist(data => { data.fight = null; });
    });
  });
  el('useSilver').addEventListener('change', render);
  el('roll').addEventListener('click', () => persist(data => {
    startCheck(data.fight, Object.fromEntries(fightOptions.map(key => [key, el(key).checked && !el(key).disabled])));
    for (const key of fightOptions) el(key).checked = false;
  }));
  el('dice').addEventListener('click', event => {
    const action = event.target.closest('[data-modifier]');
    if (action) persist(data => changeDie(data.fight, action.dataset.modifier, Number(action.dataset.die)));
  });
  el('accept').addEventListener('click', () => persist(data => {
    const result = finishCheck(data.fight);
    if (result) data.log.push(result);
    if (data.fight) data.player = { ...data.fight.player };
  }));
  for (const key of ['gnomeFood', 'soup', 'cleanser', 'none']) {
    el(`heal-${key}`).addEventListener('click', () => persist(data => {
      if (!resolveRecovery(data.fight, key)) return;
      data.player = { ...data.fight.player };
      if (key !== 'none') data.log.push({ kind: 'heal', item: key, vigor: data.player.vigor });
    }));
  }
}

export function setVisible(visible) {
  if (el('btn')) el('btn').style.display = visible ? '' : 'none';
  if (!visible) close();
}
