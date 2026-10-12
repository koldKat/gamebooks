import { currentPlaythrough, currentBookId, saveState } from '../core/state.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { showAlert, showConfirm } from '../ui-helpers/confirm.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';
import { TOMB_ENCOUNTERS, TOMB_EQUIPMENT } from './engines/grailquest/tomb-of-nightmares-roster.js';
import * as rules from './engines/grailquest/tomb-of-nightmares.js';

const ID = 'sim532';
const tk = (key, params) => t(`battlesim532.${key}`, params);
const el = key => document.getElementById(`${ID}-${key}`);
const fields = ['life', 'maxLife', 'hit', 'bonus', 'armour', 'permanent', 'experience', 'gold'];
const supplies = ['potions', 'salves', 'bolts', 'fireballs', 'fruit', 'nauseaFights', 'pearlUses'];
const flags = ['poisonImmune', 'fireballImmune', 'gills', 'goldenGarlic', 'deathOde', 'mould',
  'crystalDagger', 'vampireRing', 'blackRod', 'beeTraining', 'hologram', 'silverSword', 'dreamDisease'];
const settings = ['killEnemies', 'useCompanion', 'fireAdds'];
const spells = ['panic', 'pow', 'pill', 'pad', 'pip', 'pin', 'repeater', 'invisibility',
  'firefinger', 'fireball', 'plop', 'pid', 'pals', 'pil', 'pops'];
const character = d => d.fight?.player ?? d.player;
const active = d => d?.fight?.status === 'fighting';

function data() {
  if (Number(currentBookId) !== 532) return null;
  const run = currentPlaythrough();
  if (!run) return null;
  const d = run[ID] ||= { player: rules.createTombCharacter(), fight: null, history: [], log: [] };
  const path = run.path ?? [];
  if (d.observedPathLength === undefined && path.length) rules.tombVisit(character(d), path.at(-1));
  else for (const section of path.slice(Math.min(d.observedPathLength ?? 0, path.length))) {
    rules.tombVisit(character(d), section);
    if (d.fight) rules.settleTombFight(d.fight);
  }
  d.observedPathLength = path.length;
  return d;
}
function label(id) {
  const enemy = tk(`enemy_names.${id}`);
  return String(id).startsWith('dream') ? tk('dream_label', { enemy, number: String(id).slice(5) })
    : tk('encounter_label', { enemy, section: id === '204-grott' ? 204 : id });
}
function close() { el('overlay')?.classList.remove('active'); }
function open() {
  if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  renderSim532(); el('overlay').classList.add('active');
}
function record(d) {
  const f = d.fight;
  if (!f || f.recorded || !['win', 'loss'].includes(f.status)) return;
  f.recorded = true;
  d.history.push({ enemy: label(f.spec.id), outcome: f.status,
    ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
}
function log(d, result, kind) {
  if (!result) return;
  for (const event of Array.isArray(result) ? result : [result]) {
    const outcome = event.fatal ? tk('fatal') : event.skipped ? tk('skipped')
      : typeof event.success === 'boolean' ? tk(event.success ? 'success' : 'failed') : '';
    const label = kind ?? (event.kind ? spells.includes(event.kind) ? event.kind : 'event_' + event.kind : event.spell ?? 'cast');
    d.log.push(tk('result', { action: tk(label),
      roll: event.roll ?? '-', damage: event.damage ?? event.loss ?? 0, outcome }));
  }
}
function action(apply) {
  const d = data(); if (!d) return;
  try {
    apply(d); record(d);
    d.log = d.log.slice(-150);
    if (d.fight) { d.fight.logs = d.fight.logs.slice(-150); d.fight.actions = d.fight.actions.slice(-150); }
    saveState(); renderSim532();
  } catch { showAlert(tk('invalid')); renderSim532(); }
}
function confirm(message, apply) {
  const d = data(), run = currentPlaythrough(), previous = d?.fight;
  if (!d) return;
  showConfirm(message, () => {
    if (data() === d && currentPlaythrough() === run && d.fight === previous) action(apply);
  });
}
function start(d, id, options = {}) {
  const next = rules.startTombFight(character(d), id, options);
  record(d); d.fight = next;
}
function dream(d, number) {
  const result = rules.tombDream(character(d), number); if (!result) return;
  d.dream = result; d.sleepDream = false;
  d.log.push(tk('dream_result', { number, outcome: tk(result.dead ? 'dream_dead'
    : result.retry || result.redream ? 'dream_retry' : result.encounter ? 'dream_fight' : 'dream_done') }));
  if (result.encounter) start(d, result.encounter);
}

export function renderSim532() {
  if (!el('overlay')) return;
  const d = data(); if (!d) { close(); return; }
  const p = character(d), f = d.fight, fighting = active(d);
  for (const key of [...fields, ...supplies]) {
    const effective = fighting ? {
      hit: f.bat ? 4 : f.spec.playerHit ?? p.hit,
      bonus: f.bat ? 4 : f.spec.playerBonus ?? p.bonus,
      armour: p.armour + f.panic + f.nausea,
    }[key] : undefined;
    if (document.activeElement !== el(key)) el(key).value = effective ?? p[key];
    el(key).disabled = fighting;
  }
  for (const key of flags) { el(key).checked = !!p[key]; el(key).disabled = fighting; }
  for (const key of settings) el('option-' + key).disabled = fighting;
  for (const key of TOMB_EQUIPMENT) { el('gear-' + key).checked = p.equipment.includes(key); el('gear-' + key).disabled = fighting; }
  el('poison').value = p.poison?.kind ?? ''; el('poison').disabled = fighting;
  el('weapon').value = p.weapon;
  el('companion_life').value = p.companion?.life ?? 0;
  el('companion_life').disabled = fighting || !p.companion;
  el('enemyCount').disabled = fighting;
  const selected = el('target').value, targets = f ? rules.tombTargets(f) : [];
  el('target').innerHTML = targets.map(({ index, foe }) => `<option value="${index}">${escapeHtml(tk('target_label', { enemy: foe.name, life: foe.life }))}</option>`).join('');
  if (targets.some(row => String(row.index) === selected)) el('target').value = selected;
  el('target').disabled = !fighting;
  const target = Number(el('target').value);
  el('defender').value = f?.enemyTargets[target] ?? 'player';
  el('defender').disabled = !fighting || !f.ally || f.foes[target]?.attached;
  el('defender').querySelector('option[value="ally"]').disabled = !(f?.ally?.life > 5);
  el('status').textContent = !f ? tk('pick') : tk(f.status) + (fighting ? ` · ${f.first ? tk('round', { round: f.round }) : tk('tie')}` : '');
  el('roll').disabled = !fighting || !f.first;
  el('initiative').hidden = !fighting || !!f.first;
  el('friendly').disabled = !fighting || !!f.round || !!f.spec.dream || !!f.foes[target]?.friendlyAttempted;
  el('ring').disabled = !fighting || !p.vampireRing || f.bat;
  el('rod').disabled = !fighting || !p.blackRod || f.round >= 3 || f.rodRound === f.round;
  el('use_bolt').disabled = !fighting || p.bolts < 1 || f.spec.grott && !p.deathOde;
  el('use_fireball').disabled = !fighting || p.fireballs < 1 || f.spec.grott && !p.deathOde;
  const spell = el('spell').value, used = p.spells[spell] ?? 0;
  el('cast').disabled = p.life <= 0 || fighting && f.spec.grott && !p.deathOde
    || used >= (spell === 'invisibility' ? 1 : 3)
    || ['firefinger', 'fireball'].includes(spell) && !!p.spells[spell + 'Generated']
    || spell === 'invisibility' && !el('markedSection').checked
    || spell === 'plop' && p.spells.plopSection === p.currentSection;
  el('grott_controls').hidden = !fighting || !f.spec.enemyMagic;
  el('grott_bolt').disabled = !fighting || !(f.foes[0]?.bolts > 0);
  el('grott_fireball').disabled = !fighting || !(f.foes[0]?.fireballs > 0);
  const grottSpell = el('grott_spell').value;
  el('grott_cast').disabled = !fighting || !f.spec.enemyMagic || (f.foes[0]?.spells?.[grottSpell] ?? 0) >= 3
    || ['firefinger', 'fireball'].includes(grottSpell) && !!f.foes[0]?.spells?.[grottSpell + 'Generated'];
  el('grott_target').querySelector('option[value="ally"]').disabled = !(f?.ally?.life > 5);
  for (const key of ['new_character', 'recruit', 'sleep', 'search', 'bees', 'acquire']) el(key).disabled = fighting || key !== 'new_character' && p.life <= 0;
  el('recruit').disabled ||= !p.goldenGarlic || !!p.companion;
  el('search').disabled ||= !p.currentSection || p.searchedSection === p.currentSection;
  for (const [key, stock] of [['potion', 'potions'], ['antidote', 'potions'], ['salve', 'salves'], ['pearl', 'pearlUses'], ['fruit', 'fruit']]) {
    el('heal_' + key).disabled = fighting || p.life <= 0 || p[stock] < (key === 'antidote' ? 3 : 1);
  }
  el('heal_antidote').disabled ||= !['crab', 'needle'].includes(p.poison?.kind);
  el('dream').hidden = !d.sleepDream && !d.dream?.redream; el('dream').disabled = fighting;
  el('retry_dream').hidden = !d.dream?.retry; el('retry_dream').disabled = fighting;
  el('next_stage').hidden = f?.status !== 'win' || !f.spec.nextStage;
  el('log').innerHTML = d.log.slice(-100).reverse().map(text => `<div>${escapeHtml(text)}</div>`).join('');
  el('history').innerHTML = d.history.slice(-50).reverse().map(row => `<div class="bsim-history-row">${escapeHtml(row.enemy)}: ${escapeHtml(tk(row.outcome))}</div>`).join('');
}
export function setSim532Visible(visible) {
  if (el('btn')) el('btn').style.display = visible ? '' : 'none';
  if (!visible) close();
}
export function initSim532() {
  if (el('overlay')) return;
  const input = key => `<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk(key)}</span><input id="${ID}-${key}" class="inv-edit-input inv-qty-input" type="number" min="0" step="any"></label>`;
  const button = key => `<button id="${ID}-${key}" class="inv-add-btn">${tk(key)}</button>`;
  const check = (key, prefix = '') => `<label class="inv-edit-row"><input id="${ID}-${prefix}${key}" type="checkbox">${tk(key)}</label>`;
  const select = (key, values) => `<label class="inv-edit-row">${tk(key)}<select id="${ID}-${key}" class="inv-edit-input">${values.map(value => `<option value="${value}">${tk(value || 'none')}</option>`).join('')}</select></label>`;
  const overlay = document.createElement('div'); overlay.id = `${ID}-overlay`; overlay.className = 'inv-overlay';
  overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${tk('title')}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div>
    <div class="bsim-body"><div class="bsim-col bsim-col-left"><div class="bsim-side"><div class="bsim-side-title">${tk('character')}</div>${fields.map(input).join('')}${select('weapon', ['ej', 'silver', 'crystal', 'unarmed'])}${button('new_character')}
    <details><summary>${tk('supplies')}</summary>${supplies.map(input).join('')}${flags.map(key => check(key)).join('')}${select('poison', ['', 'rot', 'crab', 'needle', 'combat'])}${select('item', ['gem', 'gills', 'mould', 'pearl', 'droppings'])}${button('acquire')}${input('companion_life')}${button('recruit')}</details>
    <details><summary>${tk('equipment')}</summary>${TOMB_EQUIPMENT.map(key => `<label class="inv-edit-row"><input id="${ID}-gear-${key}" type="checkbox">${tk('gear.' + key)}</label>`).join('')}</details></div>
    <div class="bsim-side"><label class="inv-edit-row">${tk('encounter')}<select id="${ID}-encounter" class="inv-edit-input">${TOMB_ENCOUNTERS.map(spec => `<option value="${spec.id}">${escapeHtml(label(spec.id))}</option>`).join('')}</select></label>
    <details><summary>${tk('settings')}</summary>${settings.map(key => check(key, 'option-')).join('')}${input('enemyCount')}</details>${button('start')}<div id="${ID}-status" class="bsim-status"></div>
    <label class="inv-edit-row">${tk('target')}<select id="${ID}-target" class="inv-edit-input"></select></label>${select('defender', ['player', 'ally'])}
    <div class="bsim-btn-row">${['initiative', 'roll', 'friendly', 'ring', 'rod', 'next_stage'].map(button).join('')}</div>
    <details><summary>${tk('spell')}</summary>${select('spell', spells)}${['indoors', 'shaftException', 'markedSection'].map(key => check(key)).join('')}<div class="bsim-btn-row">${['cast', 'use_bolt', 'use_fireball'].map(button).join('')}</div></details>
    <details id="${ID}-grott_controls"><summary>${tk('grott_controls')}</summary><p>${tk('grott_note')}</p>${select('grott_spell', ['panic', 'pow', 'pill', 'pad', 'pip', 'repeater', 'firefinger', 'fireball'])}${select('grott_target', ['player', 'ally'])}<div class="bsim-btn-row">${['grott_cast', 'grott_bolt', 'grott_fireball'].map(button).join('')}</div></details>
    <div class="bsim-btn-row">${['heal_potion', 'heal_antidote', 'heal_salve', 'heal_pearl', 'heal_fruit', 'sleep', 'dream', 'retry_dream', 'search', 'bees'].map(button).join('')}</div></div><p>${tk('note')}</p><p>${tk('manual')}</p></div>
    <div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${tk('history')}</summary><div id="${ID}-history" class="bsim-history-list"></div></details><div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
  document.body.appendChild(overlay);
  const btn = document.createElement('button'); btn.id = `${ID}-btn`; btn.innerHTML = shortcutLabel(t('battlesim.title')); btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn); btn.addEventListener('click', open); el('close').addEventListener('click', close);
  let backdrop = false;
  overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
  overlay.addEventListener('click', event => { if (event.target === overlay && backdrop) close(); });
  registerPanelShortcut('KeyS', { getButton: () => btn, getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== `${ID}-overlay`), open, close });
  for (const key of ['encounter', 'target', 'spell', 'grott_spell', 'markedSection']) el(key).addEventListener('change', renderSim532);
  for (const key of [...fields, ...supplies]) el(key).addEventListener('change', () => action(d => {
    if (active(d)) return;
    const value = Number(el(key).value), p = character(d);
    if (!Number.isFinite(value) || value < 0 || key === 'life' && value > p.maxLife || key === 'maxLife' && value < p.life
      || key === 'hit' && (!Number.isInteger(value) || value < 1 || value > 12)
      || [...supplies, 'permanent', 'experience'].includes(key) && !Number.isSafeInteger(value)) throw new RangeError('Invalid character');
    p[key] = value;
  }));
  for (const key of flags) el(key).addEventListener('change', () => action(d => { if (!active(d)) character(d)[key] = el(key).checked; }));
  for (const key of TOMB_EQUIPMENT) el('gear-' + key).addEventListener('change', () => action(d => {
    if (!active(d)) character(d).equipment = TOMB_EQUIPMENT.filter(id => el('gear-' + id).checked);
  }));
  el('weapon').addEventListener('change', () => action(d => { if (!rules.tombEquip(character(d), el('weapon').value)) throw new RangeError('Unavailable weapon'); }));
  el('poison').addEventListener('change', () => action(d => {
    if (!active(d)) character(d).poison = el('poison').value
      ? { kind: el('poison').value, amount: el('poison').value === 'needle' ? 10 : 3 } : null;
  }));
  el('companion_life').addEventListener('change', () => action(d => {
    const p = character(d), value = Number(el('companion_life').value);
    if (active(d) || !p.companion) return;
    if (!Number.isFinite(value) || value < 0 || value > 50) throw new RangeError('Invalid companion');
    p.companion.life = value;
  }));
  el('recruit').addEventListener('click', () => action(d => { if (!active(d) && !character(d).companion) rules.tombRecruitVampire(character(d)); }));
  el('acquire').addEventListener('click', () => action(d => {
    if (active(d)) return;
    const item = el('item').value, result = rules.tombTakeItem(character(d), item);
    if (result) d.log.push(tk('item_result', { item: tk(item), amount: result.healing ?? 0, outcome: result.dead ? tk('fatal') : '' }));
  }));
  el('new_character').addEventListener('click', () => confirm(tk('new_confirm'), d => {
    if (active(d)) return;
    record(d); const p = character(d); rules.tombReincarnate(p);
    d.player = p; d.fight = null; d.dream = null; d.sleepDream = false;
    const section = currentPlaythrough().path?.at(-1); if (section) rules.tombVisit(p, section);
  }));
  el('start').addEventListener('click', () => {
    const id = el('encounter').value, options = Object.fromEntries(settings.map(key => [key, el('option-' + key).checked]));
    if (el('enemyCount').value !== '') options.enemyCount = Number(el('enemyCount').value);
    const apply = d => { start(d, id === '204-grott' ? id : Number(id), options); d.dream = null; d.sleepDream = false; };
    if (active(data())) confirm(tk('replace_fight'), apply); else action(apply);
  });
  const combat = (key, apply) => el(key).addEventListener('click', () => action(d => { if (active(d)) log(d, apply(d.fight, Number(el('target').value))); }));
  combat('roll', rules.tombRound); combat('initiative', f => {
    const result = rules.tombInitiative(f); return result && { ...result, kind: 'initiative' };
  });
  combat('friendly', (f, target) => {
    const result = rules.tombTryFriendly(f, target); return result && { ...result, kind: 'friendly' };
  });
  combat('ring', f => { if (rules.tombUseRing(f)) return { kind: 'ring', success: true }; });
  combat('rod', rules.tombUseRod);
  combat('use_bolt', (f, target) => rules.tombUseStock(f, 'firefinger', target));
  combat('use_fireball', (f, target) => rules.tombUseStock(f, 'fireball', target));
  el('defender').addEventListener('change', () => action(d => { if (active(d)) rules.tombAssignEnemy(d.fight, Number(el('target').value), el('defender').value); }));
  el('cast').addEventListener('click', () => action(d => {
    const spell = el('spell').value, options = Object.fromEntries(['indoors', 'shaftException', 'markedSection'].map(key => [key, el(key).checked]));
    const result = active(d) ? rules.tombFightCast(d.fight, spell, Number(el('target').value), Math.random, options)
      : rules.tombCast(character(d), spell, Math.random, options);
    log(d, result, spell);
  }));
  combat('grott_cast', f => {
    const result = rules.tombGrottCast(f, el('grott_spell').value, Math.random, el('grott_target').value);
    return result && { ...result, kind: 'grottSpell' };
  });
  combat('grott_bolt', f => rules.tombGrottStock(f, 'firefinger', el('grott_target').value));
  combat('grott_fireball', f => rules.tombGrottStock(f, 'fireball', el('grott_target').value));
  el('next_stage').addEventListener('click', () => action(d => { if (d.fight?.status === 'win' && d.fight.spec.nextStage) start(d, d.fight.spec.nextStage, d.fight.options); }));
  for (const kind of ['potion', 'antidote', 'salve', 'pearl', 'fruit']) el('heal_' + kind).addEventListener('click', () => action(d => {
    if (active(d)) return;
    const result = rules.tombHeal(character(d), kind);
    if (result) d.log.push(tk('healing_result', { item: tk('heal_' + kind), amount: result.healing }));
  }));
  el('sleep').addEventListener('click', () => action(d => {
    if (active(d)) return;
    const result = rules.tombSleep(character(d)); if (!result) return;
    d.sleepDream = result.dream; d.dream = null;
    d.log.push(tk('sleep_result', { roll: result.roll, outcome: result.dream ? tk('sleep_dream') : tk('sleep_heal', { amount: result.healing }) }));
  }));
  el('dream').addEventListener('click', () => action(d => { if (!active(d) && (d.sleepDream || d.dream?.redream)) dream(d, 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6)); }));
  el('retry_dream').addEventListener('click', () => action(d => { if (!active(d) && d.dream?.retry) dream(d, 11); }));
  el('search').addEventListener('click', () => action(d => {
    if (active(d)) return;
    const result = rules.tombSearch(character(d));
    if (result) d.log.push(tk('search_result', { roll: result.roll, outcome: result.doors.length
      ? result.doors.map(door => tk('door', { wall: tk(door.wall), section: door.destination })).join('; ') : tk('no_doors') }));
  }));
  el('bees').addEventListener('click', () => action(d => {
    if (active(d)) return;
    const result = rules.tombBees(character(d));
    if (result) d.log.push(tk('bees_result', { count: result.bees, loss: result.loss }));
  }));
}
