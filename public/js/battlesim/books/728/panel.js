import { definition, SHIPS, ARCS, DIAGRAMS, TACTICS, SHOT_LIMITS } from './definition.js';
import * as combat from './combat.js';
import { createState } from './state.js';
import { currentBookId, currentPlaythrough, saveState, apiFetch } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';

const ID = definition.stateKey;
const NUMBERS = ['speed', 'manoeuvre', 'durability', 'ammo', 'soldiers'];
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createGalleonPanel({ document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, authorizeImages = () => Promise.resolve(), registerShortcut = () => {} }) {
  const tk = (key, params) => t(definition.i18nPrefix + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({ currentBookId: getBookId(), currentPlaythrough: getRun, saveState }));
  const button = (key, attributes = '') => `<button type="button" class="inv-add-btn bsim-action-btn" ${attributes}>${escape(tk(key))}</button>`;
  const input = (key, min = 0, step = 'any') => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${min}" max="1000000" step="${step}" required></label>`;
  const select = (key, values) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><select class="inv-edit-input" id="${ID}-${key}">${values.map(value => `<option value="${escape(value)}">${escape(tk(key + '.' + value))}</option>`).join('')}</select></label>`;
  let shownRun, rendered, shownSection, imageAccess, imageGeneration = 0;
  const busy = fight => Boolean(fight && !fight.outcome);

  function number(key) {
    const field = el(key), value = Number(field.value);
    if (!field.value.trim() || !Number.isFinite(value) || value < Number(field.min) || value > Number(field.max)
        || field.step === '1' && !Number.isInteger(value)) throw new RangeError('Invalid field');
    return value;
  }
  function ship() {
    return combat.validateShip({ ...combat.newShip(el('size').value),
      ...Object.fromEntries(NUMBERS.map(key => [key, number(key)])),
      soldierType: el('soldierType').value, weapons: el('weapons').value, seaWolves: el('seaWolves').checked });
  }
  function close() { el('overlay')?.classList.remove('active'); rendered = null; imageGeneration++; }
  function action(update) {
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) { close(); return; }
    try { if (store.change(update)) render(true); }
    catch { showAlert(tk('invalid')); }
  }
  function confirmed(key, update) {
    const run = getRun(), original = store.read();
    showConfirm(tk(key), () => { if (getRun() === run && store.read() === original) action(update); });
  }
  function eventText(value) {
    if (value.kind === 'position') return tk('positionLine', { phase: tk('phase.' + value.section), section: value.section });
    if (value.kind === 'damage') return tk('damageLine', value);
    if (value.kind === 'casualties') return tk('casualtiesLine', value);
    if (value.kind === 'volley') return tk('volleyLine', { ...value, arc: tk('arc.' + value.arc), result: tk(value.inRange ? 'hit' : 'outOfRange') });
    if (value.kind === 'manualDistances') return tk('manualDistancesLine', value);
    return tk('status.' + value.outcome);
  }
  function arcSelection() {
    const fight = store.read()?.fight;
    if (fight?.section === 95) el('arc').value = el('target').value === 'A' ? 'broadside' : 'stern';
    el('arc').disabled = fight?.section === 95;
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (Number(getBookId()) !== definition.id || !getRun() || getRun() !== shownRun) { close(); return; }
    const data = store.read();
    if (!data || !force && data === rendered) return;
    rendered = data;
    const fight = data.fight, locked = busy(fight), player = fight?.player ?? data.character ?? combat.newShip();
    for (const key of NUMBERS) { el(key).value = player[key]; el(key).disabled = locked; }
    for (const key of ['size', 'soldierType', 'weapons']) { el(key).value = player[key]; el(key).disabled = locked; }
    el('seaWolves').checked = player.seaWolves; el('seaWolves').disabled = locked;
    el('preset').disabled = el('start').disabled = locked;
    el('cancel').disabled = !locked;
    el('status').textContent = fight ? (fight.outcome ? tk('status.' + fight.outcome) : tk('positionLine', { phase: tk('phase.' + fight.section), section: fight.section })) : tk('ready');
    el('actions').innerHTML = '';
    el('firing').hidden = !locked || !TACTICS.includes(fight.section);
    el('manual').hidden = !locked || !TACTICS.includes(fight.section);
    el('diagram').hidden = !fight || !DIAGRAMS[fight.section];
    if (!el('diagram').hidden) {
      const url = '/api/books/728/reading-images/' + DIAGRAMS[fight.section] + '.png';
      const generation = imageGeneration, section = fight.section, run = shownRun;
      imageAccess.then(() => {
        if (imageGeneration !== generation || getRun() !== run || Number(getBookId()) !== definition.id
            || store.read()?.fight?.section !== section || !el('overlay').classList.contains('active')) return;
        if (el('diagram').getAttribute('src') !== url) el('diagram').src = url;
      }).catch(() => {
        if (imageGeneration === generation && el('overlay').classList.contains('active')) {
          el('diagram').hidden = true; el('notice').textContent = tk('imagesUnavailable');
        }
      });
      el('diagram').alt = tk('diagramAlt', { section: fight.section });
    }
    el('pirates').textContent = fight ? ['A', 'B'].map(target => tk('pirateLine', {
      target, durability: fight.pirates[target].durability, distance: fight.distances[target],
    })).join('\n') : '';
    el('notice').textContent = '';
    if (locked) {
      const choice = combat.options(fight);
      el('notice').textContent = choice.manual ? tk('reason.' + choice.manual)
        : fight.section === 56 ? tk('manualVolley') : TACTICS.includes(fight.section) && fight.section !== 95 ? tk('arcNote') : '';
      el('actions').innerHTML = choice.destinations.map(target => button(typeof target === 'number' ? 'phase.' + target : 'finish.' + target,
        `data-destination="${target}"`)).join('');
      if (shownSection !== fight.section) el('arc').value = '';
      shownSection = fight.section;
      arcSelection();
      el('distanceA').value = fight.distances.A; el('distanceB').value = fight.distances.B;
      const limit = SHOT_LIMITS[fight.section];
      el('fire').disabled = fight.player.ammo < 1 || limit != null && fight.shots.length >= limit;
    }
    el('log').innerHTML = (fight?.events ?? []).slice(-80).map(value => '<div>' + escape(eventText(value)) + '</div>').join('');
    el('history').innerHTML = data.history.slice(-40).reverse().map(value => '<div>' + escape(value.enemy + ': ' + tk('status.' + value.outcome)) + '</div>').join('');
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    shownRun = getRun(); shownSection = null;
    imageGeneration++;
    imageAccess = Promise.resolve().then(authorizeImages);
    imageAccess.catch(() => {});
    try {
      if (!store.read()) store.change(() => {});
      el('overlay').classList.add('active'); render(true); el('close').focus();
    } catch { close(); showAlert(tk('invalid')); }
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-side"><div class="bsim-side-title">${escape(tk('ship'))}</div>${select('size', Object.keys(SHIPS))}${button('preset', `id="${ID}-preset"`)}${NUMBERS.map(key => input(key, 0, key === 'ammo' ? '1' : 'any')).join('')}${select('soldierType', ['professional', 'mercenary'])}${select('weapons', ['full', 'partial', 'none'])}<label class="bsim-checkbox"><input type="checkbox" id="${ID}-seaWolves">${escape(tk('seaWolves'))}</label></div><div class="bsim-btn-row">${button('start', `id="${ID}-start"`)}${button('cancel', `id="${ID}-cancel"`)}</div><div class="bsim-status" id="${ID}-status" role="status" aria-live="polite"></div><div class="bsim-status" id="${ID}-pirates"></div><p id="${ID}-notice"></p><div id="${ID}-firing">${select('target', ['A', 'B'])}${select('arc', ['', ...Object.keys(ARCS)])}${button('fire', `id="${ID}-fire"`)}</div><div class="bsim-btn-row" id="${ID}-actions"></div><details id="${ID}-manual"><summary>${escape(tk('manualDistances'))}</summary><p>${escape(tk('manualNote'))}</p>${input('distanceA', 1)}${input('distanceB', 1)}${button('applyDistances', `id="${ID}-applyDistances"`)}</details></div><div class="bsim-col bsim-col-right"><img class="bsim-galleon-diagram" id="${ID}-diagram" alt="" hidden><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details><div class="bsim-log" id="${ID}-log"></div></div></div></div>`;
    document.body.appendChild(overlay);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    el('preset').addEventListener('click', () => {
      if (busy(store.read()?.fight)) return;
      const player = combat.newShip(el('size').value);
      for (const key of NUMBERS) el(key).value = player[key];
    });
    el('start').addEventListener('click', () => action(data => {
      if (busy(data.fight)) return;
      data.encounterName = tk('encounter'); data.fight = combat.startFight(ship());
    }));
    el('cancel').addEventListener('click', () => confirmed('cancelConfirm', data => {
      if (busy(data.fight)) data.fight.outcome = 'cancelled';
    }));
    el('target').addEventListener('change', arcSelection);
    el('fire').addEventListener('click', () => action(data => { data.fight = combat.fire(data.fight, el('target').value, el('arc').value); }));
    el('applyDistances').addEventListener('click', () => action(data => {
      data.fight = combat.overrideDistances(data.fight, { A: number('distanceA'), B: number('distanceB') });
    }));
    el('actions').addEventListener('click', event => {
      const target = event.target.closest('[data-destination]');
      if (target) action(data => {
        const value = target.dataset.destination;
        data.fight = combat.advance(data.fight, /^\d+$/.test(value) ? Number(value) : value);
      });
    });
    registerShortcut({ button: trigger, overlay, open, close });
  }
  return { init, render, open, close, setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) close();
  } };
}

const panel = createGalleonPanel({ document, t, getRun: currentPlaythrough, getBookId: () => currentBookId,
  saveState, showAlert, showConfirm, getButtonRow: getPlayBtnRow,
  async authorizeImages() {
    const response = await apiFetch('/api/books/728/reading-matter');
    if (!response.ok) throw new Error('Reading image access unavailable');
    await response.arrayBuffer();
  },
  registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', { getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  },
});
export function initSim728() { panel.init(); }
export function renderSim728() { panel.render(); }
export function setSim728Visible(visible) { panel.setVisible(visible); }
export { initSim728 as init, renderSim728 as render, setSim728Visible as setVisible };
