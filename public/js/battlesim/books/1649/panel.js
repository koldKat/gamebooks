// Present encounter setup and combat actions while preserving the reader's story decisions.
import { currentBookId, currentPlaythrough, saveState, apiFetch } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { t } from '../../../i18n.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { createOpponentEditor } from '../../opponents.js';
import { createFight, attackTurn, nextRound, ghostDuel } from '../../engines/cthulhu-solo/combat.js';
import { changePhase, hypnosis, recoverWeapon, retreat, useBrawl } from '../../engines/cthulhu-solo/effects.js';
import { definition, ENCOUNTERS, loadRoster } from './definition.js';
import { createState } from './state.js';

export { definition };
export const loadData = () => loadRoster(apiFetch);
const ID = 'sim1649', tk = (key, params) => t(`battlesim1649.${key}`, params);
const el = key => document.getElementById(`${ID}-${key}`);
const data = createState(() => ({ currentBookId, currentPlaythrough }));
let partyEditor, enemyEditor, renderedRun, carriedFight;
const defaults = { displayName: '', hp: 10, maxHp: 10, dex: 50, dodge: 25, brawl: 25, pow: 50,
  str: 50, con: 50, skill: 25, armor: 0, damageDice: 1, damageSides: 6, damageBonus: 0,
  dbDice: 0, dbSides: 4, dbBonus: 0, luck: 0, moveSpeed: 0, app: 0, siz: 0,
  driver: 'no', braced: 'no', temporaryInsanity: 'no', weaponKind: 'melee', material: 'ordinary' };
const option = (value, label) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
const select = (key, choices) => `<label class="inv-edit-row">${tk(key)}<select id="${ID}-${key}" class="inv-edit-input">${choices.map(v => option(v, tk(v))).join('')}</select></label>`;
const button = key => `<button id="${ID}-${key}" class="inv-add-btn" type="button">${tk(key)}</button>`;
const formula = (n, sides, bonus) => `${n ? `${n}D${sides}` : '0'}${bonus ? `${bonus > 0 ? '+' : ''}${bonus}` : ''}`;
function compactEditor(editor) {
  for (const row of editor.element.querySelectorAll('.bsim-opponent-row')) {
    if (row.querySelector('[data-advanced-combat]')) continue;
    const details = document.createElement('details'); details.dataset.advancedCombat = '';
    const summary = document.createElement('summary'); summary.textContent = tk('advanced'); details.append(summary);
    for (const key of ['dex', 'dodge', 'brawl', 'pow', 'str', 'con', 'dbDice', 'dbSides', 'dbBonus', 'weaponKind', 'material', 'luck', 'moveSpeed', 'app', 'siz', 'driver', 'braced', 'temporaryInsanity']) {
      const label = row.querySelector(`[data-stat="${key}"]`)?.closest('label');
      if (label) details.append(label);
    }
    row.insertBefore(details, row.querySelector('button'));
  }
}
function combatant(row, enemy = false) {
  const actor = { ...row, name: row.displayName.trim(), damage: row.presetDamage ?? formula(row.damageDice, row.damageSides, row.damageBonus),
    db: row.presetDb ?? formula(row.dbDice, row.dbSides, row.dbBonus) };
  if (enemy && row.healthMode) { actor.hp = row.presetHealth; actor.maxHp = row.presetHealth; }
  if (!enemy && ['melee', 'axe'].includes(row.weaponKind)) actor.damage += '+DB';
  if (!enemy && row.weaponKind === 'castillo') {
    actor.damage = '1D8+1+DB'; actor.material = 'magic'; actor.ignoresArmor = true; actor.attackBonus = 1;
  }
  for (const key of ['driver', 'braced', 'temporaryInsanity']) actor[key] = row[key] === 'yes' || row[key] === true;
  if (enemy && !row.moves) actor.moves = [{ name: actor.name, skill: row.skill, damage: actor.damage }];
  return actor;
}
const presetForm = actor => ({ ...defaults, ...actor, displayName: actor.name, preset: true,
  presetDamage: actor.damage ?? '0', presetDb: actor.db ?? '0', presetHealth: actor.maxHp });
const partyForms = (d, f) => f.party.map((actor, index) => ({ ...defaults, ...d.setup?.party?.[index], ...actor, displayName: actor.name,
  driver: actor.driver ? 'yes' : 'no', braced: actor.braced ? 'yes' : 'no', temporaryInsanity: actor.temporaryInsanity ? 'yes' : 'no' }));
function logText(f, r) {
  const parts = [`${tk('round_number', { round: r.round })}: ${f[r.side][r.index]?.name ?? ''}`];
  if (r.attack) parts.push(`${r.attack.roll ?? tk('automatic')} (${tk('level_' + r.attack.level)})`);
  if (r.wound) parts.push(`${tk('damage')}: ${r.wound.amount}`);
  if (r.counter) parts.push(`${tk('counter')}: ${r.counter.amount}`);
  if (r.powerLost) parts.push(`${tk('power_lost')}: ${r.powerLost}`);
  if (r.rescueWound) parts.push(`${tk('rescue_damage')}: ${r.rescueWound.amount}`);
  for (const key of ['skipped', 'fled', 'recovered', 'unresolvedHit']) if (r[key]) parts.push(tk('log_' + key));
  for (const key of ['hypnosis', 'retreat']) if (r[key]) {
    parts.push(tk('log_' + key));
    r[key].forEach((check, index) => { if (check) parts.push(`${f.party[index].name}: ${tk('level_' + check.level)}`); });
  }
  if (r.wound?.effects.includes('luck-saved')) parts.push(tk('luck_saved'));
  return parts.join(' · ');
}
function close() { el('overlay')?.classList.remove('active'); }
function open() {
  if (!data()) return;
  renderSim1649(); el('overlay').classList.add('active');
}
function persist() {
  const d = data(); if (!d) return;
  const f = d.fight;
  if (f && f.status !== 'fighting' && carriedFight !== f) {
    carriedFight = f; d.setup ??= {}; d.setup.party = partyForms(d, f); partyEditor.set(d.setup.party);
  }
  if (f && ['win', 'loss'].includes(f.status) && !f.recorded) {
    f.recorded = true;
    d.history.push({ enemy: f.spec.name, outcome: f.status, ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
  }
  d.history = d.history.slice(-100); saveState(); renderSim1649();
}
function actions() {
  const f = data()?.fight; if (!f) return;
  const side = el('side').value, actors = f[side], other = f[side === 'party' ? 'enemies' : 'party'];
  const fill = (key, rows) => {
    const previous = el(key).value;
    el(key).innerHTML = rows.map((row, index) => option(index, `${row.name} (${row.hp} HP)`)).join('');
    if ([...el(key).options].some(o => o.value === previous)) el(key).value = previous;
  };
  fill('actor', actors); fill('target', other);
  const actor = actors[Number(el('actor').value)];
  el('attack').innerHTML = (side === 'party' ? [{ name: tk('weapon') }] : actor?.moves ?? []).map((move, i) => option(i, move.name ?? tk('attack'))).join('');
}
export function renderSim1649() {
  const d = data(); if (!d || !el('overlay')) { close(); return; }
  if (renderedRun !== currentPlaythrough()) {
    renderedRun = currentPlaythrough();
    partyEditor.set(d.fight && d.fight.status !== 'fighting' ? partyForms(d, d.fight) : d.setup?.party ?? [{ ...defaults, displayName: tk('investigator') }]);
    enemyEditor.set(d.setup?.enemies ?? [{ ...defaults, displayName: tk('opponent') }]);
    el('encounter').value = d.setup?.encounter ?? '0';
    el('mode').value = d.fight?.mode ?? d.setup?.mode ?? 'percentile';
    el('pulpy').checked = d.setup?.pulpy ?? false;
    el('ambush').checked = d.fight?.ambush ?? d.setup?.ambush ?? false;
  }
  const f = d.fight, active = f?.status === 'fighting';
  compactEditor(partyEditor); compactEditor(enemyEditor);
  partyEditor.lock(active); enemyEditor.lock(active); enemyEditor.fixCount(el('encounter').value !== '0');
  el('encounter').disabled = active; el('start').disabled = active;
  for (const key of ['resolve', 'round', 'stop', 'side', 'actor', 'target', 'attack', 'defense', 'recover', 'unarmed', 'hypnosis', 'retreat']) el(key).disabled = !active;
  for (const key of ['mode', 'pulpy', 'ambush']) el(key).disabled = active;
  el('hypnosis').hidden = !f?.spec.hypnosis || f.hypnosisResolved;
  el('retreat').hidden = !f?.spec.retreat;
  const phases = ENCOUNTERS.filter(e => f?.spec.group && e.group === f.spec.group && (e.enemies.length === f.enemies.length || e.enemyCount && e.enemyCount === f.spec.enemyCount));
  el('phase').innerHTML = phases.map(e => option(e.id, e.name)).join('');
  if (f) el('phase').value = f.spec.id;
  el('apply_phase').disabled = !f || !['fighting', 'round-complete'].includes(f.status) || phases.length < 2;
  el('phase').disabled = el('apply_phase').disabled;
  if (f?.spec.kind === 'ghost-power') { el('side').value = 'party'; el('side').disabled = true; }
  el('status').textContent = f ? `${tk(f.status)} · ${tk('round_number', { round: f.round })}` : tk('setup');
  el('summary').innerHTML = f ? [...f.party, ...f.enemies].map(a => `<div>${escapeHtml(a.name)}: ${a.healthMode === 'power' ? `${a.pow} POW` : a.healthMode ? tk(a.hp > 0 && !a.unconscious ? 'active' : 'defeated') : `${a.hp}/${a.maxHp} HP`}${a.immobilized ? ` · ${tk('immobilized')}` : ''}${a.hypnotized ? ` · ${tk('hypnotized')}` : ''}${a.stunned ? ` · ${tk('stunned')}` : ''}</div>`).join('') : '';
  el('log').innerHTML = (f?.log ?? []).slice().reverse().map(r => `<div>${escapeHtml(logText(f, r))}</div>`).join('');
  el('history').innerHTML = d.history.slice().reverse().map(h => `<div class="bsim-history-row">${escapeHtml(h.enemy)}: ${tk(h.outcome)}</div>`).join('');
  el('rules').textContent = f?.spec.notes ?? ENCOUNTERS.find(e => String(e.id) === el('encounter').value)?.notes ?? tk('custom_note');
  actions();
}
export function setSim1649Visible(visible) {
  if (el('btn')) el('btn').style.display = visible ? '' : 'none';
  if (!visible) close();
}
export function initSim1649() {
  if (el('overlay')) return;
  const overlay = document.createElement('div'); overlay.id = `${ID}-overlay`; overlay.className = 'inv-overlay';
  overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escapeHtml(definition.title)}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><label class="inv-edit-row">${tk('encounter')}<select id="${ID}-encounter" class="inv-edit-input">${option('0', tk('custom'))}${ENCOUNTERS.map(e => option(e.id, e.name)).join('')}</select></label><div id="${ID}-party"></div><div id="${ID}-enemies"></div>${button('start')}<p id="${ID}-rules"></p>${select('side', ['party', 'enemies'])}${select('actor', [])}${select('target', [])}${select('attack', [])}${select('defense', ['dodge', 'fight', 'none'])}${button('resolve')}${button('round')}${button('stop')}<p>${tk('note')}</p></div><div class="bsim-col bsim-col-right"><div id="${ID}-status" class="bsim-status"></div><div id="${ID}-summary" class="bsim-report"></div><details class="bsim-history"><summary>${tk('history')}</summary><div id="${ID}-history"></div></details><div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
  document.body.append(overlay);
  el('start').insertAdjacentHTML('beforebegin', `${select('mode', ['percentile', 'coin'])}<label class="inv-edit-row"><input id="${ID}-pulpy" type="checkbox">${tk('pulpy')}</label><label class="inv-edit-row"><input id="${ID}-ambush" type="checkbox">${tk('ambush')}</label>`);
  el('round').insertAdjacentHTML('afterend', `${button('recover')}${button('unarmed')}${button('hypnosis')}${button('retreat')}`);
  el('rules').insertAdjacentHTML('afterend', `${select('phase', [])}${button('apply_phase')}`);
  const fields = ['hp', 'maxHp', 'dex', 'dodge', 'brawl', 'pow', 'str', 'con', 'skill', 'armor', 'damageDice', 'damageSides', 'damageBonus', 'dbDice', 'dbSides', 'dbBonus'].map(key => ({ key, label: tk(key), min: key.endsWith('Bonus') ? -100 : key.endsWith('Sides') ? 2 : 0, max: key.endsWith('Sides') ? 100 : key.endsWith('Dice') ? 24 : 1000 }));
  fields.push({ key: 'weaponKind', label: tk('weapon'), options: ['melee', 'firearm', 'pistol', 'rifle', 'smg', 'shotgun', 'axe', 'castillo'].map(value => ({ value, label: tk(value) })) },
    { key: 'material', label: tk('material'), options: ['ordinary', 'silver', 'magic', 'fire', 'explosive'].map(value => ({ value, label: tk(value) })) });
  fields.push({ key: 'luck', label: tk('luck'), min: 0, max: 1000 });
  for (const key of ['moveSpeed', 'app', 'siz']) fields.push({ key, label: tk(key), min: 0, max: 1000 });
  for (const key of ['driver', 'braced', 'temporaryInsanity']) fields.push({ key, label: tk(key), options: ['no', 'yes'].map(value => ({ value, label: tk(value) })) });
  const partyT = key => key === 'battlesim.editor.name' ? tk('name') : key === 'battlesim.editor.add' ? tk('add_investigator') : t(key);
  partyEditor = createOpponentEditor({ document, id: ID + '-party', t: partyT, fields });
  partyEditor.element.querySelector('summary').textContent = tk('party'); el('party').append(partyEditor.element);
  enemyEditor = createOpponentEditor({ document, id: ID + '-enemies', t, fields,
    presets: ENCOUNTERS.flatMap(e => e.enemies).map(presetForm),
    isStatUnavailable: (key, row) => row.unavailableStats?.includes(key) || row.preset && (
      ['skill', 'damageDice', 'damageSides', 'damageBonus', 'dbDice', 'dbSides', 'dbBonus'].includes(key)
      || row.healthMode && ['hp', 'maxHp'].includes(key)) });
  el('enemies').append(enemyEditor.element);
  for (const editor of [partyEditor, enemyEditor]) editor.element.addEventListener('click', () => compactEditor(editor));
  const btn = document.createElement('button'); btn.id = `${ID}-btn`; btn.innerHTML = shortcutLabel(t('battlesim.title')); btn.style.display = 'none';
  getPlayBtnRow().append(btn); btn.addEventListener('click', open); el('close').addEventListener('click', close);
  let backdrop = false;
  overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
  overlay.addEventListener('click', event => { if (event.target === overlay && backdrop) close(); });
  registerPanelShortcut('KeyS', { getButton: () => btn, getOverlay: () => overlay, otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== `${ID}-overlay`), open, close });
  el('encounter').addEventListener('change', () => {
    const d = data(); if (!d || d.fight?.status === 'fighting') return;
    const preset = ENCOUNTERS.find(e => String(e.id) === el('encounter').value);
    enemyEditor.set(preset ? preset.enemies.map(presetForm) : [{ ...defaults, displayName: tk('opponent') }]);
    d.setup = { encounter: el('encounter').value, party: partyEditor.snapshot(), enemies: enemyEditor.snapshot() }; persist();
  });
  el('start').addEventListener('click', () => {
    const d = data(); if (!d || d.fight?.status === 'fighting') return;
    try {
      const preset = ENCOUNTERS.find(e => String(e.id) === el('encounter').value);
      const spec = preset ?? { name: tk('custom'), custom: true };
      const party = partyEditor.read().map(r => combatant(r));
      let enemies = enemyEditor.read().map(r => combatant(r, true));
      if (spec.enemyCount) enemies = Array.from({ length: party.length * (spec.enemyCount === 'double-party' ? 2 : 1) }, (_, index) => ({ ...structuredClone(enemies[0]), name: `${enemies[0].name} ${index + 1}` }));
      d.fight = createFight(spec, party, enemies, { mode: el('mode').value, pulpy: el('pulpy').checked, ambush: el('ambush').checked });
      partyEditor.element.open = false; enemyEditor.element.open = false;
      d.setup = { encounter: el('encounter').value, party: partyEditor.snapshot(), enemies: enemyEditor.snapshot(), mode: el('mode').value, pulpy: el('pulpy').checked, ambush: el('ambush').checked }; persist();
    } catch { showAlert(tk('invalid')); }
  });
  for (const key of ['side', 'actor']) el(key).addEventListener('change', actions);
  el('resolve').addEventListener('click', () => {
    const f = data()?.fight; if (!f) return;
    try {
      if (f.spec.kind === 'ghost-power') ghostDuel(f, Number(el('actor').value));
      else attackTurn(f, { side: el('side').value, index: Number(el('actor').value), target: Number(el('target').value), move: Number(el('attack').value), defense: el('defense').value });
      persist();
    } catch { showAlert(tk('invalid_action')); }
  });
  el('round').addEventListener('click', () => { if (nextRound(data()?.fight)) persist(); });
  for (const [key, apply] of [['recover', recoverWeapon], ['unarmed', useBrawl], ['hypnosis', hypnosis]]) el(key).addEventListener('click', () => {
    try { apply(data()?.fight, Number(el('actor').value)); persist(); } catch { showAlert(tk('invalid_action')); }
  });
  el('retreat').addEventListener('click', () => {
    try { retreat(data()?.fight); persist(); } catch { showAlert(tk('invalid_action')); }
  });
  el('apply_phase').addEventListener('click', () => {
    try { changePhase(data()?.fight, ENCOUNTERS.find(e => String(e.id) === el('phase').value)); persist(); }
    catch { showAlert(tk('invalid_action')); }
  });
  el('stop').addEventListener('click', () => {
    const d = data(), run = currentPlaythrough(), prior = d?.fight; if (!prior || prior.status !== 'fighting') return;
    showConfirm(tk('stop_confirm'), () => {
      if (data() !== d || currentPlaythrough() !== run || d.fight !== prior) return;
      prior.status = 'unresolved'; persist();
    });
  });
}

export { initSim1649 as init, renderSim1649 as render, setSim1649Visible as setVisible };
