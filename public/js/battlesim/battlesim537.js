import { currentPlaythrough, currentBookId, saveState } from '../core/state.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { showAlert, showConfirm } from '../ui-helpers/confirm.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';
import { FIRE_WOLF_ATTRIBUTES, FIRE_WOLF_WEAPONS } from './engines/demonspawn/fire-wolf.js';
import { ANCIENT_EVIL_ENCOUNTERS, ANCIENT_EVIL_ROSTER, prepareAncientEvilEncounter } from './engines/demonspawn/ancient-evil-roster.js';
import { createAncientEvilFight, rollAncientEvilCharacter, ancientEvilEnemyActive, checkAncientEvilFight,
  determineAncientEvilInitiative, rollAncientEvilAttack, resolveAncientEvilDeathLuck,
  endAncientEvilGroupRound, applyAncientEvilDamage, castAncientEvilSpell,
  ancientEvilCastAvailability, checkAncientEvilSerpent, finishAncientEvilFight,
  useAncientEvilRuby, tradeAncientEvilLifeForPower, ANCIENT_EVIL_SPELL_COSTS } from './engines/demonspawn/ancient-evil.js';

const ID = 'sim537', tk = (key, params) => t(`battlesim537.${key}`, params);
const el = key => document.getElementById(`${ID}-${key}`);
const fields = [...FIRE_WOLF_ATTRIBUTES, 'skill', 'lifePoints', 'maxLife', 'power', 'maxPower'];
const toggles = ['shield', 'magicShield', 'fireproof', 'rubyPendant', 'meditationKnown'];
const actions = ['initiative', 'player_attack', 'enemy_attack', 'end_round', 'death_luck', 'serpent', 'reconsider', 'apply_damage'];
const number = key => el(key).value.trim() === '' ? undefined : Number(el(key).value);
function data() {
  if (Number(currentBookId) !== 537) return null;
  const pt = currentPlaythrough();
  if (!pt) return null;
  return pt[ID] ||= { player: { ...rollAncientEvilCharacter(), weapon: 'doombringer', armour: 'none' }, fight: null, history: [], log: [] };
}
const character = d => d.fight?.player ?? d.player;
const active = d => Boolean(d.fight && !d.fight.outcome);
function close() { el('overlay')?.classList.remove('active'); }
function open() {
  if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  renderSim537(); el('overlay').classList.add('active');
}
function append(d, value) {
  let message;
  if (typeof value !== 'object') message = tk(value ? 'success' : 'failure');
  else if (value.kind === 'attack') {
    message = tk('attack_log', { ...value, side: tk(value.side === 'player' ? 'player' : 'enemy') });
    if (value.footing !== undefined) message += ' ' + tk('footing_log', { roll: value.footing });
  } else if (value.kind === 'spell') message = tk('spell_log', { ...value, spell: tk('spell.' + value.spell), result: tk(value.success ? 'success' : 'failure') });
  else if (value.kind === 'initiative') message = tk('status.' + (value.first ?? 'initiative'));
  else if (['death-luck', 'serpent'].includes(value.kind)) message = tk('check_log', { ...value, result: tk(value.success ? 'success' : 'failure') });
  else if (['manual-damage', 'poison'].includes(value.kind)) message = tk('manual_log', value);
  else message = tk(value.kind ?? 'success');
  d.log.push(message); d.log = d.log.slice(-150);
}
function store(d) {
  const fight = d.fight;
  if (fight && !fight.recorded && ['win', 'loss'].includes(fight.outcome)) {
    fight.recorded = true;
    d.history.push({ enemy: `${fight.encounter.enemies.map(key => ANCIENT_EVIL_ROSTER[key].name).join(', ')} (${tk('section', { section: fight.encounter.section })})`, outcome: fight.outcome,
      ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
  }
  saveState(); renderSim537();
}
function result(d, value) {
  if (value == null) return;
  if (value.error) showAlert(tk('error', { reason: value.error.replaceAll('-', ' ') }));
  else append(d, value);
  store(d);
}
function start() {
  const d = data(); if (!d || active(d) || character(d).lifePoints <= 0) return;
  try {
    d.fight = createAncientEvilFight(prepareAncientEvilEncounter(el('encounter').value, character(d), {
      playerWeapon: number('weapon_bonus'), staffWeapon: number('staff_bonus'),
    }));
    store(d);
  } catch { showAlert(tk('invalid')); }
}
function act(action) {
  const d = data(), fight = d?.fight; if (!fight || fight.outcome) return;
  let value;
  if (action === 'death_luck') value = resolveAncientEvilDeathLuck(fight);
  else if (fight.pending) return;
  else if (action === 'initiative') value = determineAncientEvilInitiative(fight);
  else if (action === 'player_attack' || action === 'enemy_attack') value = rollAncientEvilAttack(fight, action === 'player_attack' ? 'player' : 'enemy', Number(el('target').value));
  else if (action === 'end_round') value = endAncientEvilGroupRound(fight);
  else if (action === 'serpent') value = checkAncientEvilSerpent(fight);
  else if (action === 'apply_damage') value = applyAncientEvilDamage(fight, number('manual_damage'));
  else if (action === 'reconsider') value = finishAncientEvilFight(fight, 'reconsider');
  result(d, value);
}
const field = key => `<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk(key)}</span><input id="${ID}-${key}" class="inv-edit-input inv-qty-input" type="number" min="0" step="0.5"></label>`;
const button = key => `<button id="${ID}-${key}" class="inv-add-btn">${tk(key)}</button>`;
const toggle = key => `<label class="inv-edit-row"><input id="${ID}-${key}" type="checkbox">${tk(key)}</label>`;

export function renderSim537() {
  if (!el('overlay')) return;
  const d = data(); if (!d) { close(); return; }
  const fight = d.fight, p = character(d), fighting = active(d), pending = Boolean(fight?.pending);
  for (const key of fields) { if (document.activeElement !== el(key)) el(key).value = p[key] ?? 0; el(key).disabled = pending; }
  for (const key of toggles) { el(key).checked = Boolean(p[key]); el(key).disabled = pending; }
  el('weapon').value = typeof p.weapon === 'number' ? 'custom' : p.weapon;
  if (typeof p.weapon === 'number' && document.activeElement !== el('weapon_bonus')) el('weapon_bonus').value = p.weapon;
  el('armour').value = p.armour ?? 'none';
  el('weapon').disabled = el('armour').disabled = el('weapon_bonus').disabled = el('staff_bonus').disabled = pending;
  el('encounter').disabled = fighting; el('start').disabled = fighting || p.lifePoints <= 0;
  el('roll_character').disabled = fighting;
  const previous = Number(el('target').value), enemies = fight?.enemies ?? [];
  el('target').innerHTML = enemies.map((e, i) => `<option value="${i}" ${ancientEvilEnemyActive(fight, i) ? '' : 'disabled'}>${escapeHtml(e.name)} (${Math.max(0, e.lifePoints)} LP)</option>`).join('');
  const target = enemies.findIndex((e, i) => ancientEvilEnemyActive(fight, i));
  el('target').value = String(fight && ancientEvilEnemyActive(fight, previous) ? previous : Math.max(0, target));
  el('foes').innerHTML = enemies.map((e, i) => `<label class="inv-edit-row">${escapeHtml(e.name)}<input class="inv-edit-input inv-qty-input" type="number" min="0" step="0.5" data-enemy="${i}" value="${Math.max(0, e.lifePoints)}" ${pending || !fighting ? 'disabled' : ''}></label>`).join('');
  el('status').textContent = fight ? tk('status.' + (fight.outcome ?? fight.pending ?? (fight.manualGroup ? 'group' : fight.turn ?? 'initiative'))) : '';
  for (const key of actions) el(key).disabled = !fighting || pending;
  el('death_luck').hidden = fight?.pending !== 'death-luck'; el('death_luck').disabled = fight?.pending !== 'death-luck';
  el('initiative').hidden = Boolean(fight?.manualGroup); el('initiative').disabled ||= Boolean(fight?.turn);
  el('end_round').hidden = !fight?.manualGroup;
  el('serpent').hidden = !fight?.encounter.openingCheck || fight.serpentChecked;
  el('player_attack').disabled ||= !fight?.manualGroup && fight?.turn !== 'player' || Boolean(fight?.encounter.passiveAttempts);
  el('enemy_attack').disabled ||= !fight?.manualGroup && fight?.turn !== 'enemy';
  const spell = el('spell').value, available = ancientEvilCastAvailability(p, fight?.encounter.section, spell);
  el('cast').disabled = !fight || Boolean(fight.encounter.noMagic) || Boolean(available.error && available.error !== 'inclination-required') ||
    Boolean(fight.outcome) && !(spell === 'resurrection' && p.lifePoints <= 0) || pending && spell !== 'resurrection' ||
    spell === 'resurrection' && p.lifePoints > 0 || spell !== 'resurrection' && !fight?.manualGroup && fight?.turn !== 'player';
  el('destination_row').hidden = spell !== 'retrace';
  el('trade').disabled = pending || p.lifePoints <= 0;
  el('meditate').disabled = pending || fighting || !p.meditationKnown || p.lifePoints <= 0;
  el('heal').disabled = fight?.outcome !== 'win' || fight?.rubyUsed || !p.rubyPendant || p.lifePoints <= 0;
  el('log').innerHTML = d.log.slice(-100).map(line => `<div class="bsim-log-line">${escapeHtml(line)}</div>`).join('');
  el('history').innerHTML = d.history.slice(-50).reverse().map(h => `<div>${escapeHtml(h.enemy)}: ${tk('status.' + h.outcome)}</div>`).join('');
}

export function setSim537Visible(value) { if (el('btn')) el('btn').style.display = value ? '' : 'none'; if (!value) close(); }
export function initSim537() {
  if (el('overlay')) return;
  const overlay = document.createElement('div'); overlay.id = `${ID}-overlay`; overlay.className = 'inv-overlay';
  overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${tk('title')}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div>
    <div class="bsim-body"><div class="bsim-col bsim-col-left"><div class="bsim-side"><div class="bsim-side-title">${tk('player')}</div>${fields.map(field).join('')}
    <label class="inv-edit-row">${tk('weapon')}<select id="${ID}-weapon" class="inv-edit-input">${Object.keys(FIRE_WOLF_WEAPONS).map(key => `<option value="${key}">${tk('weapon.' + key)}</option>`).join('')}<option value="custom">${tk('custom')}</option></select></label>${field('weapon_bonus')}${field('staff_bonus')}
    <label class="inv-edit-row">${tk('armour')}<select id="${ID}-armour" class="inv-edit-input">${['none', 'leather', 'chain', 'plate'].map(key => `<option value="${key}">${tk(key)}</option>`).join('')}<option value="20">${tk('dragonskin')}</option></select></label>
    ${toggles.map(toggle).join('')}${button('roll_character')}${button('heal')}</div>
    <div class="bsim-side"><label class="inv-edit-row">${tk('encounter')}<select id="${ID}-encounter" class="inv-edit-input">${ANCIENT_EVIL_ENCOUNTERS.map(e => `<option value="${e.section}">${escapeHtml(e.enemies.map(key => ANCIENT_EVIL_ROSTER[key].name).join(', '))} (${tk('section', { section: e.section })})</option>`).join('')}</select></label>
    <p>${tk('manual_note')}</p><p>${tk('special_note')}</p>${button('start')}<select id="${ID}-target" class="inv-edit-input" aria-label="${tk('enemy')}"></select><div id="${ID}-foes"></div><div id="${ID}-status" class="bsim-status"></div>${actions.filter(key => key !== 'apply_damage').map(button).join('')}${field('manual_damage')}${button('apply_damage')}</div>
    <div class="bsim-side"><p>${tk('magic_note')}</p><label class="inv-edit-row">${tk('spell')}<select id="${ID}-spell" class="inv-edit-input">${Object.entries(ANCIENT_EVIL_SPELL_COSTS).map(([key, cost]) => `<option value="${key}">${tk('spell.' + key)} (${cost})</option>`).join('')}</select></label>
    <label id="${ID}-destination_row" class="inv-edit-row">${tk('destination')}<input id="${ID}-destination" class="inv-edit-input"></label>${button('cast')}${field('trade_amount')}${button('trade')}${button('meditate')}</div></div>
    <div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${tk('history')}</summary><div id="${ID}-history" class="bsim-history-list"></div></details><div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
  document.body.appendChild(overlay);
  const btn = document.createElement('button'); btn.id = `${ID}-btn`; btn.innerHTML = shortcutLabel(t('battlesim.title')); btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn); btn.addEventListener('click', open); el('close').addEventListener('click', close);
  let backdropDown = false;
  overlay.addEventListener('mousedown', event => { backdropDown = event.target === overlay; });
  overlay.addEventListener('click', event => { if (backdropDown && event.target === overlay) close(); });
  registerPanelShortcut('KeyS', { getButton: () => btn, getOverlay: () => overlay, otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  el('start').addEventListener('click', start);
  for (const key of ['encounter', 'spell', 'target', 'destination']) el(key).addEventListener('change', renderSim537);
  for (const key of actions) el(key).addEventListener('click', () => act(key));
  el('cast').addEventListener('click', () => {
    const d = data(); if (!d?.fight) return;
    result(d, castAncientEvilSpell(d.fight, el('spell').value, { target: Number(el('target').value), destination: el('destination').value.trim(), visited: currentPlaythrough()?.path ?? [] }));
  });
  el('roll_character').addEventListener('click', () => {
    const d = data(), pt = currentPlaythrough(); if (!d || active(d)) return;
    showConfirm(tk('new_character_confirm'), () => {
      if (Number(currentBookId) !== 537 || currentPlaythrough() !== pt || active(d)) return;
      d.player = { ...rollAncientEvilCharacter(), weapon: 'doombringer', armour: 'none' }; d.fight = null; store(d);
    });
  });
  el('heal').addEventListener('click', () => { const d = data(); if (d?.fight) result(d, useAncientEvilRuby(d.fight)); });
  el('trade').addEventListener('click', () => { const d = data(); if (d && !d.fight?.pending) result(d, tradeAncientEvilLifeForPower(character(d), number('trade_amount'))); });
  el('meditate').addEventListener('click', () => {
    const d = data(); if (!d || active(d) || !character(d).meditationKnown || character(d).lifePoints <= 0) return;
    character(d).power = Math.max(100, character(d).power); character(d).maxPower = Math.max(character(d).maxPower, character(d).power); store(d);
  });
  for (const key of fields) el(key).addEventListener('change', () => {
    const d = data(), value = number(key); if (!d || d.fight?.pending || !Number.isFinite(value) || value < 0 || key === 'skill' && value > 96) return;
    character(d)[key] = value; if (d.fight && !d.fight.outcome) checkAncientEvilFight(d.fight); store(d);
  });
  for (const key of [...toggles, 'weapon', 'armour', 'weapon_bonus']) el(key).addEventListener('change', () => {
    const d = data(); if (!d || d.fight?.pending) return;
    if (key === 'weapon_bonus' || key === 'weapon' && el('weapon').value === 'custom') {
      const value = number('weapon_bonus'); if (!Number.isFinite(value) || value < 0) return; character(d).weapon = value;
    } else character(d)[key] = toggles.includes(key) ? el(key).checked : el(key).value;
    store(d);
  });
  el('foes').addEventListener('change', event => {
    const d = data(), fight = d?.fight, input = event.target;
    if (!fight || fight.pending || fight.outcome || input.dataset.enemy === undefined) return;
    const value = input.value.trim() === '' ? NaN : Number(input.value);
    if (!Number.isFinite(value) || value < 0) return;
    const enemy = fight.enemies[Number(input.dataset.enemy)]; if (!enemy) return;
    enemy.lifePoints = value; checkAncientEvilFight(fight); store(d);
  });
}
