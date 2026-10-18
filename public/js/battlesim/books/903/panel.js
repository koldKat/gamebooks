import {definition, ENCOUNTERS, SOURCE_IMAGES} from './definition.js';
import {startFight, applyCode} from './combat.js';
import {createState} from './state.js';
import {createOpponentEditor} from '../../opponents.js';
import {currentBookId, currentPlaythrough, saveState, apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';

const ID = definition.stateKey;
const escape = value => String(value).replace(/[&<>"']/g, char =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));

export function createShadowsPanel({document, t, getRun, getBookId, saveState, showAlert, getButtonRow,
  requestReadingAccess = () => apiFetch('/api/books/903/reading-access'), registerShortcut = () => {}}) {
  const tk = (key, params) => t(definition.i18nPrefix + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId: getBookId(), currentPlaythrough: getRun, saveState}));
  let shownRun, editorRun, rendered, editor, imageGeneration = 0;
  const button = key => `<button type="button" class="bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const visible = () => Boolean(el('overlay')?.classList.contains('active'));
  const active = data => Boolean(data?.fight && !data.fight.outcome);

  function close() {
    el('overlay')?.classList.remove('active');
    imageGeneration += 1;
  }
  function current() {
    return visible() && shownRun === getRun() && Number(getBookId()) === definition.id;
  }
  function selectedCard() {
    const selected = editor.snapshot()[0];
    return ENCOUNTERS.find(card => card.id === String(selected?.cardId ?? selected?.id));
  }
  function preview() {
    const card = store.read()?.fight?.enemy || selectedCard();
    el('card-note').textContent = card ? tk('cardNote', {room: card.room, strength: card.strength}) : tk('chooseCard');
    el('card-image').dataset.source = card?.grid || '';
    el('card-image').removeAttribute('src');
    if (current()) void loadImages();
  }
  async function loadImages() {
    const generation = ++imageGeneration, run = getRun();
    if (!current()) return;
    el('image-status').textContent = tk('loading');
    try {
      const response = await requestReadingAccess();
      if (!response.ok) throw new Error('Reading access unavailable');
      if (generation !== imageGeneration || run !== getRun() || !current()) return;
      const images = [el('card-image')];
      if (el('tables').open) images.push(...el('tables').querySelectorAll('img[data-source]'));
      for (const image of images) {
        const url = image.dataset.source;
        image.hidden = !url;
        if (url && image.getAttribute('src') !== url) image.src = url;
      }
      el('image-status').textContent = '';
    } catch {
      if (generation === imageGeneration && current()) el('image-status').textContent = tk('imagesUnavailable');
    }
  }
  function change(update) {
    if (!current()) {close(); return;}
    try {
      store.change(data => {
        update(data);
        if (data.fight) data.character = structuredClone(data.fight.player);
      });
      render(true);
    } catch {showAlert(tk('invalid'));}
  }
  function render(force = false) {
    if (!el('overlay')) return;
    if (Number(getBookId()) !== definition.id || !getRun()) {close(); rendered = null; return;}
    if (visible() && shownRun !== getRun()) {close(); return;}
    const data = store.read();
    if (!data || !force && rendered === data) return;
    rendered = data;
    if (editorRun !== getRun()) {
      editorRun = getRun();
      editor.set(data.enemySetup || [ENCOUNTERS[0]]);
    }
    const fighting = active(data), fight = data.fight;
    editor.lock(fighting);
    el('strength').value = data.character.strength;
    el('strength').disabled = fighting;
    el('apply').disabled = fighting;
    el('start').disabled = Boolean(fight) || data.character.strength === 0;
    el('again').disabled = !fight?.outcome;
    el('code').disabled = !fighting;
    el('resolve').disabled = !fighting;
    const lines = [tk('remaining', {strength: data.character.strength})];
    if (fight) {
      lines.push(fight.enemy.displayName, tk('round', {round: fight.round}));
      if (fight.outcome) lines.push(tk('outcome.' + fight.outcome));
      if (fight.destination) lines.push(tk('destination', {section: fight.destination}));
      if (fight.finalContinuation) lines.push(tk('lastRow'));
    } else lines.push(tk('ready'));
    el('result').textContent = lines.join('\n');
    el('log').textContent = (fight?.turns || []).slice().reverse().map(turn =>
      tk('turn', {...turn, result: tk('result.' + turn.result)})).join('\n');
    el('history').textContent = data.history.slice(-40).reverse().map(entry =>
      entry.enemy + ': ' + tk('history.' + entry.outcome)).join('\n');
    const source = (fight?.enemy || selectedCard())?.grid || '';
    if (el('card-image').dataset.source !== source) preview();
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) {showAlert(t('battlesim.no_active_playthrough')); return;}
    try {
      store.ensure(); shownRun = getRun(); el('overlay').classList.add('active');
      render(true); el('close').focus(); void loadImages();
    } catch {close(); showAlert(tk('invalid'));}
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title">
      <div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div>
      <div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p>
      <details open><summary>${escape(tk('character'))}</summary><label class="inv-edit-row"><span>${escape(tk('strength'))}</span><input class="inv-edit-input" id="${ID}-strength" type="number" min="0" max="5" step="1" value="5"></label>${button('apply')}</details>
      <div id="${ID}-opponent"></div><p id="${ID}-card-note"></p>
      <div class="bsim-btn-row">${button('start')}${button('again')}</div>
      <p>${escape(tk('codeNote'))}</p><p id="${ID}-image-status" role="status"></p>
      <img id="${ID}-card-image" alt="${escape(tk('card'))}" hidden style="max-width:100%;height:auto">
      <label class="inv-edit-row"><span>${escape(tk('code'))}</span><input class="inv-edit-input" id="${ID}-code" maxlength="2" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="A1–J5"></label>${button('resolve')}
      <details id="${ID}-tables"><summary>${escape(tk('tables'))}</summary>${Object.entries(SOURCE_IMAGES).map(([key, url]) => `<p>${escape(tk(key))}</p><img data-source="${url}" alt="${escape(tk(key))}" loading="lazy" style="max-width:100%;height:auto">`).join('')}</details></div>
      <div class="bsim-col bsim-col-right"><p class="bsim-status" id="${ID}-result" role="status" aria-live="polite"></p><div class="bsim-log" id="${ID}-log"></div>
      <details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list bsim-status" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({document, id: ID + '-opponent', t, fields: [], presets: ENCOUNTERS, language: 'bg', onSelect: preview});
    editor.fixCount(true); el('opponent').append(editor.element);
    for (const image of overlay.querySelectorAll('img')) image.addEventListener('error', () => {
      if (current()) el('image-status').textContent = tk('imagesUnavailable');
    });
    const trigger = document.createElement('button');
    trigger.id = ID + '-btn'; trigger.textContent = t('battlesim.title'); trigger.style.display = 'none';
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let downOnOverlay = false;
    overlay.addEventListener('mousedown', event => {downOnOverlay = event.target === overlay;});
    overlay.addEventListener('click', event => {if (event.target === overlay && downOnOverlay) close();});
    overlay.addEventListener('keydown', event => {if (event.key === 'Escape') {event.stopPropagation(); close();}});
    el('tables').addEventListener('toggle', () => {if (el('tables').open) void loadImages();});
    el('apply').addEventListener('click', () => change(data => {
      if (active(data)) return;
      const value = el('strength').value.trim(), strength = Number(value);
      if (!value || !Number.isSafeInteger(strength) || strength < 0 || strength > 5) throw new RangeError('Invalid strength');
      data.fight = null; data.character = {...data.character, strength};
    }));
    el('start').addEventListener('click', () => change(data => {
      if (data.fight) return;
      const [opponent] = editor.read();
      data.fight = startFight(data.character, opponent); data.enemySetup = editor.snapshot();
      el('code').value = '';
    }));
    el('again').addEventListener('click', () => change(data => {if (data.fight?.outcome) data.fight = null;}));
    const resolve = () => change(data => {
      data.fight = applyCode(data.fight, el('code').value); el('code').value = '';
    });
    el('resolve').addEventListener('click', resolve);
    el('code').addEventListener('keydown', event => {if (event.key === 'Enter') {event.preventDefault(); resolve();}});
    registerShortcut({button: trigger, overlay, open, close});
  }
  return {init, render, open, close, setVisible(value) {
    if (el('btn')) el('btn').style.display = value ? '' : 'none';
    if (!value) close();
  }};
}

const panel = createShadowsPanel({document, t, getRun: currentPlaythrough, getBookId: () => currentBookId,
  saveState, showAlert, getButtonRow: getPlayBtnRow, registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export function initSim903() {panel.init();}
export function renderSim903() {panel.render();}
export function setSim903Visible(value) {panel.setVisible(value);}
export { initSim903 as init, renderSim903 as render, setSim903Visible as setVisible };
