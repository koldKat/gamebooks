import { currentPlaythrough, saveState, currentBookId } from '../core/state.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { showAlert, showConfirm } from '../ui-helpers/confirm.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';
import { INNSMOUTH_ENCOUNTERS, rollInnsmouthCharacter, createInnsmouthFight, innsmouthTurn,
  attackInnsmouth, openingInnsmouthShot, throwInnsmouthKnife, divertInnsmouthEnemy,
  eatInnsmouthRation, innsmouthTest } from './engines/innsmouth.js';

const ID = 'sim548';
const tk = (key, params) => t(`battlesim548.${key}`, params);
const el = key => document.getElementById(`${ID}-${key}`);
const fields = ['health', 'speed', 'accuracy', 'stealth', 'detection', 'power', 'conspicuousness', 'bullets', 'rations', 'weight', 'weaponDamage'];
function data() {
  if (Number(currentBookId) !== 548) return null;
  const pt = currentPlaythrough();
  return pt ? pt[ID] ||= { player: rollInnsmouthCharacter(), fight: null, history: [], log: [] } : null;
}
const character = d => d.fight?.player ?? d.player;
const enemyName = e => tk('enemy.' + e.name);
const label = e => tk('encounter_label', { section: e.section, enemy: e.enemies.map(enemyName).join(', ') });
function close() { el('overlay')?.classList.remove('active'); }
function open() {
  if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  renderSim548(); el('overlay').classList.add('active');
}
function field(key) {
  return `<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk(key)}</span><input id="${ID}-${key}" class="inv-edit-input inv-qty-input" type="number" min="${key === 'conspicuousness' ? 4 : 0}" step="1" ${key === 'health' ? 'max="15"' : key === 'weight' ? 'max="40"' : ''}></label>`;
}
function log(d, text) { d.log.push(text); d.log = d.log.slice(-150); }
function record(d) {
  const f = d.fight;
  if (!f || f.recorded || !['win', 'loss'].includes(f.status)) return;
  f.recorded = true;
  d.history.push({ enemy: label(f.encounter), outcome: f.status, ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
}
function update(d) { record(d); saveState(); renderSim548(); }
function start() {
  const d = data(); if (!d) return;
  const run = currentPlaythrough(), section = el('encounter').value, prior = d.fight;
  const apply = () => {
    if (data() !== d || currentPlaythrough() !== run || d.fight !== prior) return;
    try { d.fight = createInnsmouthFight(section, character(d)); log(d, tk('started', { section })); update(d); }
    catch { showAlert(tk('invalid')); }
  };
  if (d.fight?.status === 'fighting') showConfirm(tk('replace_fight'), apply);
  else apply();
}
function action(kind) {
  const d = data(), f = d?.fight; if (!f) return;
  const target = Number(el('target').value);
  let result;
  if (kind === 'attack' || kind === 'enemy_attack') result = attackInnsmouth(f, target);
  else if (kind === 'gun') result = attackInnsmouth(f, target, true);
  else if (kind === 'opening') result = openingInnsmouthShot(f, true);
  else if (kind === 'skip') result = openingInnsmouthShot(f, false);
  else if (kind === 'knife') result = throwInnsmouthKnife(f, target);
  if (!result) return;
  if (!result.skipped) log(d, tk('damage_result', { actor: result.actor >= 0 ? enemyName(f.enemies[result.actor]) : tk('you'), dice: result.rolls?.join(' + ') ?? result.roll, damage: result.damage }));
  update(d);
}
export function renderSim548() {
  if (!el('overlay')) return;
  const d = data(); if (!d) { close(); return; }
  const p = character(d), f = d.fight, active = f?.status === 'fighting', playerTurn = active && innsmouthTurn(f) === -1;
  for (const key of fields) {
    if (document.activeElement !== el(key)) el(key).value = p[key];
    el(key).disabled = active || p.health <= 0;
  }
  el('throwingKnife').checked = p.throwingKnife; el('throwingKnife').disabled = active || p.health <= 0;
  el('meal').disabled = active || el('approaching').checked || p.health <= 0 || p.health >= p.maxHealth || p.rations < 1;
  el('start').disabled = p.health <= 0;
  el('status').textContent = f ? tk('status.' + f.status) : tk('pick');
  el('turn').textContent = active ? tk('turn', { round: f.round, actor: playerTurn ? tk('you') : enemyName(f.enemies[innsmouthTurn(f)]) }) : '';
  const selected = el('target').value;
  el('target').innerHTML = (f?.enemies ?? []).flatMap((e, i) => e.health > 0 && !e.diverted && (f.encounter.simultaneous || i === f.sequence)
    ? [`<option value="${i}">${escapeHtml(enemyName(e))} (${e.health})</option>`] : []).join('');
  if ([...el('target').options].some(o => o.value === selected)) el('target').value = selected;
  el('target').disabled = !playerTurn || f.openingAvailable;
  el('attack').disabled = !playerTurn || f.openingAvailable;
  el('gun').disabled = !playerTurn || f.openingAvailable || p.bullets < 1;
  el('enemy_attack').disabled = !active || playerTurn || f.openingAvailable;
  el('knife').disabled = !playerTurn || f.openingAvailable || !p.throwingKnife || f.throwingKnifeUsed;
  el('opening-wrap').hidden = !active || !f.openingAvailable;
  el('opening').disabled = p.bullets < 1;
  el('divert').hidden = !active || !f.encounter.divert;
  el('foes').innerHTML = (f?.enemies ?? []).map(e => `<div class="inv-edit-row"><span>${escapeHtml(enemyName(e))}</span><span>${e.speed} / ${e.accuracy} / ${e.damage} / ${e.health}${e.diverted ? ' (' + tk('status.avoided') + ')' : ''}</span></div>`).join('');
  const encounter = INNSMOUTH_ENCOUNTERS.find(e => e.section === Number(el('encounter').value));
  el('mode').textContent = tk(encounter.firstKillEnds ? 'first_kill' : encounter.simultaneous ? 'simultaneous' : 'sequential');
  el('log').innerHTML = d.log.slice(-100).reverse().map(text => `<div>${escapeHtml(text)}</div>`).join('');
  el('history').innerHTML = d.history.slice(-50).reverse().map(e => `<div class="bsim-history-row">${escapeHtml(e.enemy)}: ${tk('status.' + e.outcome)}</div>`).join('');
}
export function setSim548Visible(value) {
  if (el('btn')) el('btn').style.display = value ? '' : 'none';
  if (!value) close();
}
export function initSim548() {
  if (el('overlay')) return;
  const overlay = document.createElement('div'); overlay.id = `${ID}-overlay`; overlay.className = 'inv-overlay';
  overlay.innerHTML = `<div class="inv-modal bsim-modal"><div class="inv-modal-hdr"><span class="inv-modal-title">${tk('title')}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div>
    <div class="bsim-body"><div class="bsim-col bsim-col-left"><div class="bsim-side"><div class="bsim-side-title">${tk('character')}</div>
    ${fields.map(field).join('')}<label class="inv-edit-row"><input id="${ID}-throwingKnife" type="checkbox">${tk('throwingKnife')}</label>
    <label class="inv-edit-row"><input id="${ID}-approaching" type="checkbox">${tk('approaching')}</label>
    <button id="${ID}-new" class="inv-add-btn">${tk('new_character')}</button><button id="${ID}-meal" class="inv-add-btn">${tk('meal')}</button></div>
    <div class="bsim-side"><label class="inv-edit-row">${tk('encounter')}<select id="${ID}-encounter" class="inv-edit-input">${INNSMOUTH_ENCOUNTERS.map(e => `<option value="${e.section}">${escapeHtml(label(e))}</option>`).join('')}</select></label>
    <p id="${ID}-mode"></p><button id="${ID}-start" class="inv-add-btn">${tk('start')}</button><div id="${ID}-foes"></div>
    <label class="inv-edit-row">${tk('target')}<select id="${ID}-target" class="inv-edit-input"></select></label>
    <div id="${ID}-status" class="bsim-status"></div><p id="${ID}-turn"></p>
    <div id="${ID}-opening-wrap"><p>${tk('opening')}</p><button id="${ID}-opening" class="inv-add-btn">${tk('gun')}</button><button id="${ID}-skip" class="inv-add-btn">${tk('skip')}</button></div>
    ${['attack', 'gun', 'knife', 'enemy_attack', 'divert'].map(k => `<button id="${ID}-${k}" class="inv-add-btn">${tk(k)}</button>`).join('')}</div>
    <div class="bsim-side"><label class="inv-edit-row">${tk('test')}<select id="${ID}-test" class="inv-edit-input">${['speed', 'accuracy', 'stealth', 'detection', 'power', 'conspicuousness'].map(k => `<option value="${k}">${tk(k)}</option>`).join('')}</select></label><button id="${ID}-test-roll" class="inv-add-btn">${tk('test_roll')}</button></div>
    <p>${tk('note')}</p></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${tk('history')}</summary><div id="${ID}-history" class="bsim-history-list"></div></details><div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
  document.body.appendChild(overlay);
  const btn = document.createElement('button'); btn.id = `${ID}-btn`; btn.innerHTML = shortcutLabel(t('battlesim.title')); btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn); btn.addEventListener('click', open); el('close').addEventListener('click', close);
  let backdrop = false;
  overlay.addEventListener('mousedown', e => { backdrop = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && backdrop) close(); });
  registerPanelShortcut('KeyS', { getButton: () => btn, getOverlay: () => overlay, otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== `${ID}-overlay`), open, close });
  el('start').addEventListener('click', start);
  el('encounter').addEventListener('change', renderSim548);
  el('approaching').addEventListener('change', renderSim548);
  for (const kind of ['attack', 'gun', 'enemy_attack', 'knife', 'opening', 'skip']) el(kind).addEventListener('click', () => action(kind));
  el('divert').addEventListener('click', () => {
    const d = data(), f = d?.fight, run = currentPlaythrough();
    if (!f || f.status !== 'fighting' || !f.encounter.divert) return;
    showConfirm(tk('divert_confirm'), () => {
      if (data() !== d || currentPlaythrough() !== run || d.fight !== f) return;
      if (divertInnsmouthEnemy(f)) update(d);
    }, { danger: false });
  });
  el('new').addEventListener('click', () => {
    const d = data(), run = currentPlaythrough(); if (!d) return;
    showConfirm(tk('new_character_confirm'), () => {
      if (data() !== d || currentPlaythrough() !== run) return;
      d.player = rollInnsmouthCharacter(); d.fight = null; update(d);
    });
  });
  el('meal').addEventListener('click', () => {
    const d = data(); if (d && eatInnsmouthRation(character(d), d.fight, el('approaching').checked)) update(d);
  });
  el('test-roll').addEventListener('click', () => {
    const d = data(); if (!d) return;
    try {
      const r = innsmouthTest(character(d), el('test').value);
      log(d, tk('test_result', { attribute: tk(r.key), dice: r.rolls.join(' + '), total: r.total, result: tk(r.success ? 'success' : 'failure') })); update(d);
    } catch { showAlert(tk('invalid')); }
  });
  for (const key of fields) el(key).addEventListener('change', () => {
    const d = data(); if (!d || d.fight?.status === 'fighting' || character(d).health <= 0) return;
    const value = Number(el(key).value), p = character(d);
    if (!el(key).value.trim() || !Number.isSafeInteger(value) || value < (key === 'conspicuousness' ? 4 : 0) || key === 'health' && value > 15 || key === 'weight' && (value > 40 || value < p.rations) || key === 'rations' && value > p.weight) { showAlert(tk('invalid')); renderSim548(); return; }
    if (key === 'weight' && el('approaching').checked && value < p.weight) { renderSim548(); return; }
    p[key] = value; update(d);
  });
  el('throwingKnife').addEventListener('change', () => {
    const d = data(); if (!d || d.fight?.status === 'fighting' || character(d).health <= 0) return;
    character(d).throwingKnife = el('throwingKnife').checked; update(d);
  });
}
