import { ALL_PANEL_OVERLAY_IDS, escapeHtml, registerPanelShortcut, shortcutLabel } from '../../../core/util.js';
import { t } from '../../../i18n.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { apiFetch, currentBookId, currentPlaythrough, isReadOnlySimulator, saveState } from '../../run-context.js';
import { createOpponentEditor } from '../../opponents.js';
import { decorateOutcome, renderHistory } from '../../outcome.js';
import {
  canFlee, canSpare, flee, HIDDEN_WEAPONS, needsOpeningTechnique, resolveRound, spare, startFight, TECHNIQUES, woundPenalty,
} from './combat.js';
import { definition, loadRoster, roster } from './definition.js';
import { createState } from './state.js';

const { id, stateKey: key } = definition;
const tr = (name, data) => t(`battlesim${id}.${name}`, data);
const el = name => document.getElementById(`${key}-${name}`);
const store = createState(() => ({ bookId: currentBookId, run: currentPlaythrough, save: saveState }));
const isActive = fight => Boolean(fight && !fight.outcome);
const pickEncounter = value => roster.encounters.find(entry => entry.key === value);
let openedRun;
let editor;

const label = (name, content) => `<label class="inv-edit-row"><span>${escapeHtml(tr(name))}</span>${content}</label>`;
const number = (name, min, max) => label(name,
  `<input type="number" min="${min}" max="${max}" step="1" class="inv-edit-input" id="${key}-${name}" autocomplete="off" required>`);
const button = name => `<button type="button" class="bsim-action-btn" id="${key}-${name}">${escapeHtml(tr(name))}</button>`;
const option = (value, name) => `<option value="${escapeHtml(value)}">${escapeHtml(name)}</option>`;
const select = (name, choices) => label(name,
  `<select class="inv-edit-input" id="${key}-${name}">${choices.join('')}</select>`);

function destination(value) {
  if (value === 'map') return tr('map');
  return value ? tr('destination', { section: value }) : '';
}

function close() { el('overlay')?.classList.remove('active'); }

function change(update) {
  if (isReadOnlySimulator()) return;
  if (Number(currentBookId) !== id || currentPlaythrough() !== openedRun || !el('overlay')?.classList.contains('active')) {
    close();
    return;
  }
  try {
    if (store.change(update)) render();
  } catch {
    showAlert(tr('invalid'));
  }
}

function inputValue(name) {
  const input = el(name);
  if (!input.validity.valid || input.value === '') throw new RangeError('Invalid input');
  return input.valueAsNumber;
}

function saveSetup(data) {
  if (isActive(data.fight)) return;
  const encounter = el('encounter').value;
  const technique = el('technique').value;
  const hiddenWeapon = el('hiddenWeapon').value;
  data.hero.skill = inputValue('skill');
  data.hero.wounds = [1, 2, 3].map(level => inputValue(`wound${level}`));
  data.setup = { ...data.setup, encounter, technique, hiddenWeapon };
  if (!encounter) {
    const [opponent] = editor.read();
    data.setup = { ...data.setup, name: opponent.displayName, skill: opponent.skill, limit: opponent.limit,
      playerBonus: inputValue('playerBonus'), enemyBonus: inputValue('enemyBonus') };
  }
}

function start() {
  change(data => {
    if (isActive(data.fight)) return;
    saveSetup(data);
    const setup = data.setup;
    const encounter = pickEncounter(setup.encounter) ?? {
      name: setup.name || tr('opponent'),
      skill: setup.skill,
      limit: setup.limit,
      techniques: { [setup.technique]: [setup.playerBonus, setup.enemyBonus] },
    };
    data.fight = startFight(data.hero, encounter, setup.technique, roster.woundTable, setup.hiddenWeapon);
    data.log = [];
  });
}

function renderRound(event) {
  const colored = (value, color) => `<span class="bsim-log-${color}">${escapeHtml(value)}</span>`;
  return tr('roundReport', {
    round: event.round,
    heroDie: colored(event.heroDiePenalty ? `${event.heroDie} (−${event.heroDiePenalty})` : event.heroDie, 'accent'),
    enemyDie: colored(event.enemyDie, 'accent'),
    heroTotal: colored(event.heroTotal, event.wounded === 'enemy' ? 'success' : 'muted'),
    enemyTotal: colored(event.enemyTotal, event.wounded === 'hero' ? 'danger' : 'muted'),
    wound: event.wounded ? colored(tr(`hit.${event.wounded}`, { level: event.level }),
      event.wounded === 'hero' ? 'danger' : 'success') : tr('tie'),
  });
}

export function render() {
  if (!el('overlay')?.classList.contains('active')) return;
  if (Number(currentBookId) !== id || currentPlaythrough() !== openedRun) { close(); return; }
  const { hero, setup, fight, log, history } = store.read();
  const locked = isActive(fight);
  const readonly = isReadOnlySimulator();
  const preset = pickEncounter(el('encounter').value);
  const currentWounds = locked ? fight.heroWounds : hero.wounds;
  el('skill').value = hero.skill;
  for (const [index, count] of currentWounds.entries()) el(`wound${index + 1}`).value = count;
  for (const name of ['skill', 'wound1', 'wound2', 'wound3', 'technique', 'encounter', 'hiddenWeapon', 'playerBonus', 'enemyBonus']) {
    el(name).disabled = locked || readonly;
  }
  el('weapon-config').hidden = !preset?.streetFight;
  el('technique-config').hidden = !needsOpeningTechnique(preset, el('hiddenWeapon').value);
  el('custom-config').hidden = Boolean(preset);
  editor.lock(locked || readonly);
  el('note').textContent = preset ? [tr('presetReport', { skill: preset.skill, limit: preset.limit }), preset.note]
    .filter(Boolean).join(' ') : '';
  el('begin').disabled = locked || readonly || woundPenalty(currentWounds, roster.woundTable) >= 5;
  el('roll').disabled = !locked || readonly;
  el('flee').disabled = !locked || readonly || !canFlee(fight);
  el('flee').textContent = tr(fight?.encounter.withdrawal ? 'leave' : 'flee');
  const spareAvailable = Boolean(fight && canSpare(fight, roster.woundTable));
  el('spare').hidden = !fight?.encounter.spareLast && !spareAvailable;
  el('spare').disabled = readonly || !spareAvailable;
  el('cancel').disabled = !locked || readonly;
  const status = fight?.spared ? 'spared' : fight?.forcedRetreat ? 'drivenOff'
    : fight?.death ? 'death' : fight?.outcome ?? (locked ? 'active' : 'ready');
  el('status').textContent = tr(`status.${status}`);
  decorateOutcome(el('status'), fight?.outcome);
  el('destination').textContent = destination(fight?.destination);
  el('hero-report').textContent = tr('heroReport', { damage: woundPenalty(currentWounds, roster.woundTable),
    battles: hero.battles, escapes: hero.escapes });
  el('enemy-report').textContent = fight ? tr('enemyReport', { name: fight.encounter.name,
    damage: woundPenalty(fight.enemyWounds, roster.woundTable), limit: fight.encounter.limit }) : '';
  const bonuses = fight?.usesTechnique && fight.encounter.techniques[fight.technique];
  el('bonus-report').textContent = bonuses ? tr('techniqueReport', { name: tr(`technique.${fight.technique}`),
    hero: bonuses[0], enemy: bonuses[1] }) : fight ? tr('unarmedReport') : '';
  el('log').innerHTML = log.map(event => `<div>${renderRound(event)}</div>`).join('');
  renderHistory(el('history'), history.slice(-40).reverse(), entry => `${entry.name}: ${tr(`status.${entry.outcome}`)}`);
}

function open() {
  if (Number(currentBookId) !== id) return;
  openedRun = currentPlaythrough();
  const { setup } = store.read();
  el('encounter').value = setup.encounter;
  el('technique').value = setup.technique;
  el('hiddenWeapon').value = setup.hiddenWeapon ?? 'none';
  editor.set([{ displayName: setup.name, skill: setup.skill, limit: setup.limit }]);
  el('playerBonus').value = setup.playerBonus;
  el('enemyBonus').value = setup.enemyBonus;
  el('overlay').classList.add('active');
  render();
  el('close').focus();
}

export function init() {
  if (el('overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = `${key}-overlay`;
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${key}-title">
    <div class="inv-modal-hdr"><span class="inv-modal-title" id="${key}-title">${escapeHtml(tr('title'))}</span>
      <button type="button" class="inv-close-btn" id="${key}-close" aria-label="${escapeHtml(t('btn.close'))}">&times;</button></div>
    <div class="bsim-body">
      <div class="bsim-col bsim-col-left">
        <p>${escapeHtml(tr('rules'))}</p>
        ${number('skill', 0, 30)}${[1, 2, 3].map(level => number(`wound${level}`, 0, 9)).join('')}
        ${select('encounter', [option('', tr('custom')), ...roster.encounters.map(e => option(e.key, `${e.section} · ${e.name}`))])}
        <p id="${key}-note"></p>
        <div id="${key}-weapon-config">${select('hiddenWeapon', HIDDEN_WEAPONS.map(value => option(value, tr(`weapon.${value}`))))}</div>
        <div id="${key}-technique-config">${select('technique', TECHNIQUES.map(value => option(value, tr(`technique.${value}`))))}</div>
        <div id="${key}-custom-config"><div id="${key}-editor"></div>${number('playerBonus', 0, 20)}${number('enemyBonus', 0, 20)}</div>
        <div class="bsim-btn-row">${['begin', 'roll', 'flee', 'spare', 'cancel'].map(button).join('')}</div>
      </div>
      <div class="bsim-col bsim-col-right">
        <div class="bsim-status" role="status" aria-live="polite" id="${key}-status"></div>
        <p id="${key}-destination"></p><p id="${key}-hero-report"></p><p id="${key}-enemy-report"></p><p id="${key}-bonus-report"></p>
        <div class="bsim-log" id="${key}-log"></div>
        <details class="bsim-history"><summary>${escapeHtml(tr('history'))}</summary><div class="bsim-history-list" id="${key}-history"></div></details>
      </div>
    </div></div>`;
  document.body.appendChild(overlay);
  editor = createOpponentEditor({ document, id: key, t, language: 'bg', fields: [
    { key: 'skill', label: tr('enemySkill'), min: 0, max: 30 },
    { key: 'limit', label: tr('enemyLimit'), min: 1, max: 20 },
  ], presets: roster.encounters, onSelect: () => change(saveSetup) });
  editor.fixCount(true);
  el('editor').append(editor.element);
  for (const name of ['skill', 'wound1', 'wound2', 'wound3', 'encounter', 'technique', 'hiddenWeapon', 'playerBonus', 'enemyBonus']) {
    el(name).addEventListener('change', () => change(saveSetup));
  }
  editor.element.addEventListener('change', () => change(saveSetup));
  el('begin').addEventListener('click', start);
  const roll = () => Math.floor(Math.random() * 6) + 1;
  el('roll').addEventListener('click', () => change(d => {
    if (!isActive(d.fight)) return;
    d.fight = resolveRound(d.fight, roster.woundTable, roll(), roll());
    d.log.push(d.fight.lastRound);
  }));
  el('flee').addEventListener('click', () => change(d => { d.fight = flee(d.fight); }));
  el('spare').addEventListener('click', () => change(d => { d.fight = spare(d.fight, roster.woundTable); }));
  el('cancel').addEventListener('click', () => {
    const battle = store.read()?.fight;
    showConfirm(tr('confirmCancel'), () => {
      if (store.read()?.fight === battle) change(d => { d.fight = null; d.log = []; });
    });
  });
  el('close').addEventListener('click', close);
  let backdrop = false;
  overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
  overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); close(); }
  });
  const trigger = document.createElement('button');
  trigger.id = `${key}-btn`;
  trigger.style.display = 'none';
  trigger.innerHTML = shortcutLabel(t('battlesim.title'));
  trigger.setAttribute('aria-keyshortcuts', 'S');
  getPlayBtnRow().append(trigger);
  trigger.addEventListener('click', open);
  registerPanelShortcut('KeyS', { getButton: () => trigger, getOverlay: () => overlay, open, close,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(overlayId => overlayId !== overlay.id) });
}

export function setVisible(visible) {
  if (el('btn')) el('btn').style.display = visible ? '' : 'none';
  if (!visible) close();
}

export const loadData = () => loadRoster(apiFetch);
