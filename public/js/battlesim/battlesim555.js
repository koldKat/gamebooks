import { currentPlaythrough, saveState, currentBookId } from '../core/state.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { showAlert, showConfirm } from '../ui-helpers/confirm.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';
import { ARKHAM_ENCOUNTERS, createArkhamCharacter, createArkhamFight, rollArkhamRound } from './engines/arkham-darkness.js';

const ID = 'sim555';
const tk = (key, params) => t(`battlesim555.${key}`, params);
const encounterLabel = section => tk('encounter_label', { enemy: tk(`enemy.${section}`), section });
const el = key => document.getElementById(`${ID}-${key}`);
const fields = ['willpower', 'intellect', 'combat', 'health', 'sanity', 'clues', 'resources', 'doom'];
const flags = ['agile', 'rites', 'fear'];
const initialStats = { willpower: 5, intellect: 2, combat: 2, health: 6, sanity: 8 };
function data() {
  if (Number(currentBookId) !== 555) return null;
  const pt = currentPlaythrough();
  return pt ? pt[ID] ||= { player: createArkhamCharacter('agnes', initialStats), fight: null, history: [], log: [] } : null;
}
const character = d => d.fight?.player ?? d.player;
function close() { el('overlay')?.classList.remove('active'); }
function open() {
  if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  renderSim555(); el('overlay').classList.add('active');
}
function update(d) {
  const f = d.fight;
  if (f && f.status !== 'fighting' && !f.recorded) {
    f.recorded = true;
    d.history.push({ enemy: encounterLabel(f.spec.section), outcome: f.status, ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
  }
  d.log = d.log.slice(-150); saveState(); renderSim555();
}
function start() {
  const d = data(), run = currentPlaythrough(); if (!d) return;
  const prior = d.fight, section = el('encounter').value, sorcerer = el('sorcerer').checked;
  const apply = () => {
    if (data() !== d || currentPlaythrough() !== run || d.fight !== prior) return;
    try { d.fight = createArkhamFight(section, character(d), sorcerer); update(d); }
    catch { showAlert(tk('invalid')); }
  };
  if (prior?.status === 'fighting') showConfirm(tk('replace_fight'), apply); else apply();
}
export function renderSim555() {
  if (!el('overlay')) return;
  const d = data(); if (!d) { close(); return; }
  const p = character(d), f = d.fight, active = f?.status === 'fighting';
  for (const key of fields) {
    if (document.activeElement !== el(key)) el(key).value = p[key];
    el(key).disabled = active;
  }
  for (const key of flags) { el(key).checked = !!p[key]; el(key).disabled = active; }
  el('profile').disabled = active;
  el('roll').disabled = !active;
  el('resource').disabled = !active || p.resources < 1;
  if (el('resource').disabled) el('resource').checked = false;
  el('weapon').disabled = !active || p.profile !== 'nathaniel' || p.weaponUsed;
  if (el('weapon').disabled) el('weapon').checked = false;
  el('sorcerer').disabled = active || p.profile !== 'agnes' || p.sorcererUsed;
  if (el('sorcerer').disabled) el('sorcerer').checked = false;
  el('used').textContent = [p.sorcererUsed ? tk('sorcerer_used') : '', p.weaponUsed ? tk('weapon_used') : ''].filter(Boolean).join(' ');
  el('status').textContent = active ? tk('round', { round: f.rounds.length + 1, target: f.spec.thresholds[f.rounds.length] }) : f ? tk('finished', { outcome: tk(f.status), section: f.destination }) : tk('pick');
  const selected = ARKHAM_ENCOUNTERS.find(e => e.section === Number(el('encounter').value));
  el('rules').textContent = tk('targets', { targets: selected.thresholds.join(' / ') });
  el('log').innerHTML = d.log.slice(-100).reverse().map(s => `<div>${escapeHtml(s)}</div>`).join('');
  el('history').innerHTML = d.history.slice(-50).reverse().map(h => `<div class="bsim-history-row">${escapeHtml(h.enemy)}: ${tk(h.outcome)}</div>`).join('');
}
export function setSim555Visible(value) {
  if (el('btn')) el('btn').style.display = value ? '' : 'none';
  if (!value) close();
}
export function initSim555() {
  if (el('overlay')) return;
  const overlay = document.createElement('div'); overlay.id = `${ID}-overlay`; overlay.className = 'inv-overlay';
  overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${tk('title')}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div>
    <div class="bsim-body"><div class="bsim-col bsim-col-left"><div class="bsim-side"><div class="bsim-side-title">${tk('character')}</div>
    <label class="inv-edit-row">${tk('profile')}<select id="${ID}-profile" class="inv-edit-input">${['agnes','nathaniel','rex'].map(k => `<option value="${k}">${tk(k)}</option>`).join('')}</select></label>
    ${fields.map(k => `<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk(k)}</span><input id="${ID}-${k}" class="inv-edit-input inv-qty-input" type="number" step="1" ${['clues','resources','doom'].includes(k) ? 'min="0"' : ''}></label>`).join('')}
    ${flags.map(k => `<label class="inv-edit-row"><input id="${ID}-${k}" type="checkbox">${tk(k)}</label>`).join('')}
    <button id="${ID}-new" class="inv-add-btn">${tk('new_character')}</button><p id="${ID}-used"></p></div>
    <div class="bsim-side"><label class="inv-edit-row">${tk('encounter')}<select id="${ID}-encounter" class="inv-edit-input">${ARKHAM_ENCOUNTERS.map(e => `<option value="${e.section}">${escapeHtml(encounterLabel(e.section))}</option>`).join('')}</select></label>
    <p id="${ID}-rules"></p><label class="inv-edit-row"><input id="${ID}-sorcerer" type="checkbox">${tk('sorcerer')}</label><button id="${ID}-start" class="inv-add-btn">${tk('start')}</button>
    <div id="${ID}-status" class="bsim-status"></div>
    <label class="inv-edit-row"><input id="${ID}-resource" type="checkbox">${tk('resource')}</label>
    <label class="inv-edit-row"><input id="${ID}-weapon" type="checkbox">${tk('weapon')}</label>
    <button id="${ID}-roll" class="inv-add-btn">${tk('roll')}</button></div><p>${tk('note')}</p><p>${tk('sheet_note')}</p></div>
    <div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${tk('history')}</summary><div id="${ID}-history" class="bsim-history-list"></div></details><div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
  document.body.appendChild(overlay);
  const btn = document.createElement('button'); btn.id = `${ID}-btn`; btn.innerHTML = shortcutLabel(t('battlesim.title')); btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn); btn.addEventListener('click', open); el('close').addEventListener('click', close);
  let backdrop = false;
  overlay.addEventListener('mousedown', e => { backdrop = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && backdrop) close(); });
  registerPanelShortcut('KeyS', { getButton: () => btn, getOverlay: () => overlay, otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== `${ID}-overlay`), open, close });
  el('start').addEventListener('click', start); el('encounter').addEventListener('change', renderSim555);
  el('roll').addEventListener('click', () => {
    const d = data(); if (!d?.fight) return;
    const r = rollArkhamRound(d.fight, {resource:el('resource').checked,weapon:el('weapon').checked}); if (!r) return;
    d.log.push(tk('result', { round:r.round, dice:r.rawDice.join(' + '), modifier:r.modifier, total:r.total, target:r.threshold, outcome:tk(r.success ? 'win' : 'loss') }) + (r.cursed ? ' ' + tk('curse') : ''));
    el('resource').checked = false; el('weapon').checked = false; update(d);
  });
  el('new').addEventListener('click', () => {
    const d = data(), run = currentPlaythrough(); if (!d) return;
    const profile = el('profile').value;
    showConfirm(tk('new_confirm'), () => {
      if (data() !== d || currentPlaythrough() !== run) return;
      const stats = { agnes: initialStats, nathaniel: {willpower:3,intellect:2,combat:5,health:9,sanity:6}, rex: {willpower:3,intellect:4,combat:2,health:6,sanity:9} };
      d.player = createArkhamCharacter(profile, stats[profile]); d.fight = null; update(d);
    });
  });
  for (const key of fields) el(key).addEventListener('change', () => {
    const d = data(); if (!d || d.fight?.status === 'fighting') return;
    const value = Number(el(key).value);
    if (!el(key).value.trim() || !Number.isSafeInteger(value) || ['clues','resources','doom'].includes(key) && value < 0) { showAlert(tk('invalid')); renderSim555(); return; }
    character(d)[key] = value; update(d);
  });
  for (const key of flags) el(key).addEventListener('change', () => {
    const d = data(); if (!d || d.fight?.status === 'fighting') return;
    character(d)[key] = el(key).checked; update(d);
  });
}
