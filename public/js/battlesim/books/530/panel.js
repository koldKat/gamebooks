import { ID, fields, supplies, flags, options } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, ID, KINGDOM_ENCOUNTERS, KINGDOM_MAGIC_STOCK, KINGDOM_STORY_MAGIC, action, active, castItems, character, close, confirm, currentBookId, currentPlaythrough, data, el, escapeHtml, fields, flags, getPlayBtnRow, initSim530, label, magic, magicItems, open, options, record, registerPanelShortcut, renderSim530, replace, rules, saveState, setSim530Visible, shortcutLabel, showAlert, showConfirm, supplies, t, tk, travel, update });
const { data } = createState(simulatorContext);
const { label, record, update, action, confirm, replace } = createCombat(simulatorContext);
// END SIMULATOR WIRING
import { currentPlaythrough, currentBookId, saveState } from "../../../core/state.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { showAlert, showConfirm } from "../../../ui-helpers/confirm.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import { KINGDOM_ENCOUNTERS, KINGDOM_MAGIC_STOCK, KINGDOM_STORY_MAGIC } from "../.././engines/grailquest/kingdom-of-horror-roster.js";
import * as rules from "../.././engines/grailquest/kingdom-of-horror.js";
import * as travel from "../.././engines/grailquest/kingdom-of-horror-travel.js";
import * as magic from "../.././engines/grailquest/kingdom-of-horror-magic.js";


const tk = (key, params) => t(`battlesim530.${key}`, params);
const el = key => document.getElementById(`${ID}-${key}`);




const castItems = ['pointingBone', 'deathbell', 'deathMask', 'eyeOfHorus', 'laughingGlobe',
  'lightningWand', 'fireball', 'destructionOrb', 'psionicHelm', 'sanctuaryScroll', 'seekerNeedle', 'sleepGlobe', 'xerox', ...KINGDOM_STORY_MAGIC];
const magicItems = [...KINGDOM_MAGIC_STOCK.map(item => item.id), ...KINGDOM_STORY_MAGIC];
const character = d => d.fight?.player ?? d.player;
const active = d => d.fight?.status === 'fighting';




function close() { el('overlay')?.classList.remove('active'); }
function open() {
  if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  renderSim530(); el('overlay').classList.add('active');
}






export function renderSim530() {
  if (!el('overlay')) return;
  const d = data(); if (!d) { close(); return; }
  const p = character(d), f = d.fight, fighting = active(d);
  for (const key of [...fields, ...supplies]) {
    if (document.activeElement !== el(key)) el(key).value = p[key];
    el(key).disabled = fighting;
  }
  for (const key of flags) { el(key).checked = !!p[key]; el(key).disabled = fighting; }
  el('weapon').value = p.weapon; el('weapon').disabled = fighting;
  for (const key of options) el('option-' + key).disabled = fighting;
  for (const id of magicItems) {
    el(`charges-${id}`).value = p.magic[id] || 0;
    el(`charges-${id}`).disabled = fighting;
  }
  const targets = f?.spec.trial ? [{ index: 0, foe: f.foes[0] }] : f ? rules.kingdomTargets(f) : [];
  const selected = el('target').value;
  el('target').innerHTML = targets.map(({ index, foe }) => `<option value="${index}">${escapeHtml(
    foe.life === null ? tk('trial_target') : tk('target_label', { enemy: foe.name, life: foe.life }))}</option>`).join('');
  if (targets.some(row => String(row.index) === selected)) el('target').value = selected;
  el('target').disabled = !fighting;
  el('roll').disabled = !fighting || !f.first || f.bearGripped;
  el('bear_grip').hidden = !f?.bearGripped;
  el('initiative').hidden = !fighting || !!f.first;
  el('friendly').disabled = !fighting || f.rounds > 0 || !f.spec.friendly || f.friendlyAttempts.includes(Number(el('target').value));
  el('bribe').disabled = !fighting || f.rounds > 0 || !f.spec.bribe || p.gold < f.spec.bribe;
  for (const [key, allowed] of [['run', f?.spec.running], ['retreat', f?.spec.freeRetreat], ['surrender', f?.spec.surrender]]) {
    el(key).hidden = !allowed; el(key).disabled = !fighting || f.rounds > 0;
  }
  el('call_gnurlbash').disabled = !fighting || !p.gnurlbash || !!f.ally || f.spec.dream;
  el('witch_loot').hidden = f?.spec.id !== 78 || f.status !== 'win' || !!p.witchLootCollected;
  el('smarm').disabled = !fighting || f.rounds > 0 || !(p.magic.smarmOil > 0) || !el('opposite-sex').checked;
  el('lucky_strike').disabled = !fighting || f.spec.dream || p.luckyRolls <= 0 || !!f.luckyNext;
  el('cast').disabled = !fighting || f.spec.dream || f.spec.trial || !f.first
    || f.roundStarted && f.active !== 'player' || !f.roundStarted && f.first !== 'player'
    || !(p.magic[el('spell').value] > 0);
  for (const option of el('spell').options) option.disabled = !(p.magic[option.value] > 0);
  el('magic_targets').disabled = !['laughingGlobe', 'sleepGlobe'].includes(el('spell').value);
  el('break_sanctuary').hidden = !f?.sanctuaryThroughRound;
  el('resurrect').hidden = !!f?.recorded || !!f?.resurrectionDeclined || p.life !== 0 || !p.resurrectionCharged || !(p.magic.resurrectionWand > 0);
  el('decline_resurrection').hidden = el('resurrect').hidden;
  el('combat-stats').hidden = !fighting;
  if (fighting) for (const [key, value] of [['combatHit', f.playerHit], ['combatBonus', f.playerBonus], ['combatArmour', f.playerArmour]]) el(key).value = value;
  for (const key of ['sleep', 'merlin', 'heal', 'yarrow_button', 'invisibility', 'charge_resurrection', 'friendship', 'remove_neck']) el(key).disabled = fighting || p.life <= 0;
  el('heal').disabled ||= !(p[el('healing').value] > 0);
  el('yarrow_button').disabled ||= !(p.yarrow > 0);
  el('invisibility').disabled ||= !(p.invisibleDoses > 0);
  el('charge_resurrection').disabled ||= p.life <= 15 || p.resurrectionCharged || !(p.magic.resurrectionWand > 0);
  el('friendship').disabled ||= p.friendshipPending || !(p.magic.friendshipMask > 0);
  el('remove_neck').disabled ||= !p.neckBolt;
  el('dream_again').hidden = d.dream?.status !== 'redream';
  el('limerick').hidden = d.dream?.status !== 'limerick';
  el('merlin-choice').hidden = !d.merlin?.choicesRemaining;
  if (d.merlin?.choicesRemaining) {
    const choices = d.merlin.room === 'equipment' ? p.equipmentStock : KINGDOM_MAGIC_STOCK.filter(item => p.magicStock[item.id] > 0).map(item => item.id);
    el('gift').innerHTML = choices.map(id => `<option value="${id}">${escapeHtml(tk(id))}</option>`).join('');
  }
  el('status').textContent = f ? `${label(f.spec.id)}: ${fighting ? !f.first ? tk('tie')
    : tk('round', { round: f.rounds + 1 }) : tk(f.status)}` : tk('pick');
  el('trial-note').hidden = !f?.spec.trial;
  for (const key of ['city_patrol', 'city_fine', 'city_court', 'constable_court']) el(key).disabled = fighting || p.life <= 0;
  el('city_fine').disabled ||= d.patrol?.status !== 'patrol' || p.gold < 200;
  el('log').innerHTML = d.log.slice(-100).reverse().map(text => `<div>${escapeHtml(text)}</div>`).join('');
  el('history').innerHTML = d.history.slice(-50).reverse().map(row => `<div class="bsim-history-row">${escapeHtml(row.enemy)}: ${escapeHtml(tk(row.outcome))}</div>`).join('');
}

export function setSim530Visible(visible) {
  if (el('btn')) el('btn').style.display = visible ? '' : 'none';
  if (!visible) close();
}

export function initSim530() {
  if (el('overlay')) return;
  const input = key => `<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk(key)}</span><input id="${ID}-${key}" class="inv-edit-input inv-qty-input" type="number" min="0" step="1"></label>`;
  const button = key => `<button id="${ID}-${key}" class="inv-add-btn">${tk(key)}</button>`;
  const select = (key, choices) => `<label class="inv-edit-row">${tk(key)}<select id="${ID}-${key}" class="inv-edit-input">${choices.map(value => `<option value="${value}">${escapeHtml(tk(value))}</option>`).join('')}</select></label>`;
  const overlay = document.createElement('div'); overlay.id = `${ID}-overlay`; overlay.className = 'inv-overlay';
  overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${tk('title')}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div>
    <div class="bsim-body"><div class="bsim-col bsim-col-left"><div class="bsim-side"><div class="bsim-side-title">${tk('character')}</div>${fields.map(input).join('')}${select('weapon', ['ej', 'unarmed', 'vorpalSword'])}${button('new_character')}
    <details><summary>${tk('supplies')}</summary>${supplies.map(input).join('')}${flags.map(key => `<label class="inv-edit-row"><input id="${ID}-${key}" type="checkbox">${tk(key)}</label>`).join('')}</details>
    <details><summary>${tk('magic_inventory')}</summary>${magicItems.map(id => `<label class="inv-edit-row">${tk(id)}<input id="${ID}-charges-${id}" class="inv-edit-input inv-qty-input" type="number" min="0" step="1"></label>`).join('')}</details></div>
    <div class="bsim-side"><label class="inv-edit-row">${tk('encounter')}<select id="${ID}-encounter" class="inv-edit-input">${KINGDOM_ENCOUNTERS.map(spec => `<option value="${spec.id}">${escapeHtml(label(spec.id))}</option>`).join('')}</select></label>
    <details><summary>${tk('pre_fight')}</summary>${options.map(key => `<label class="inv-edit-row"><input id="${ID}-option-${key}" type="checkbox">${tk('option_' + key)}</label>`).join('')}</details>
    ${button('start')}<div id="${ID}-status" class="bsim-status"></div><p id="${ID}-trial-note">${tk('trial_note')}</p>${select('target', [])}<div class="bsim-btn-row">${button('initiative')}${button('roll')}${button('bear_grip')}${button('friendly')}${button('bribe')}${button('run')}${button('retreat')}${button('surrender')}${button('call_gnurlbash')}${button('lucky_strike')}</div>
    <div id="${ID}-combat-stats"><div class="bsim-side-title">${tk('combat_stats')}</div>${['combatHit', 'combatBonus', 'combatArmour'].map(input).join('')}</div>
    ${select('spell', castItems)}${input('magic_targets')}<label class="inv-edit-row"><input id="${ID}-known" type="checkbox">${tk('known')}</label><label class="inv-edit-row"><input id="${ID}-opposite-sex" type="checkbox">${tk('opposite_sex')}</label><div class="bsim-btn-row">${button('cast')}${button('smarm')}${button('break_sanctuary')}${button('resurrect')}${button('decline_resurrection')}${button('witch_loot')}</div>
    ${select('healing', ['potions', 'salves'])}<div class="bsim-btn-row">${button('heal')}${button('yarrow_button')}${button('sleep')}${button('dream_again')}${button('merlin')}</div>
    <div id="${ID}-merlin-choice">${select('gift', [])}${button('take_gift')}</div><div id="${ID}-limerick"><p>${tk('limerick_note')}</p><div class="bsim-btn-row">${button('limerick_yes')}${button('limerick_no')}</div></div>
    <details><summary>${tk('preparation')}</summary><div class="bsim-btn-row">${button('invisibility')}${button('charge_resurrection')}${button('friendship')}${button('remove_neck')}</div></details>
    <details><summary>${tk('city_checks')}</summary><div class="bsim-btn-row">${button('city_patrol')}${button('city_fine')}${button('city_court')}${button('constable_court')}</div><p>${tk('patrol_note')}</p></details></div><p>${tk('note')}</p><p>${tk('manual')}</p></div>
    <div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${tk('history')}</summary><div id="${ID}-history" class="bsim-history-list"></div></details><div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
  document.body.appendChild(overlay);
  for (const key of ['combatHit', 'combatBonus', 'combatArmour']) el(key).readOnly = true;
  el('magic_targets').value = 1;
  const btn = document.createElement('button'); btn.id = `${ID}-btn`; btn.innerHTML = shortcutLabel(t('battlesim.title')); btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn); btn.addEventListener('click', open); el('close').addEventListener('click', close);
  let backdrop = false;
  overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
  overlay.addEventListener('click', event => { if (event.target === overlay && backdrop) close(); });
  registerPanelShortcut('KeyS', { getButton: () => btn, getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== `${ID}-overlay`), open, close });
  for (const key of ['spell', 'healing', 'target']) el(key).addEventListener('change', renderSim530);
  el('opposite-sex').addEventListener('change', renderSim530);
  for (const key of [...fields, ...supplies]) el(key).addEventListener('change', () => action(d => {
    if (active(d)) return;
    const value = Number(el(key).value), p = character(d);
    if (!Number.isSafeInteger(value) || value < 0 || key === 'life' && value > p.maxLife || key === 'maxLife' && value < p.life) throw new RangeError('Invalid character');
    p[key] = value;
  }));
  for (const key of flags) el(key).addEventListener('change', () => action(d => { if (!active(d)) character(d)[key] = el(key).checked; }));
  for (const id of magicItems) el(`charges-${id}`).addEventListener('change', () => action(d => {
    if (active(d)) return;
    const value = Number(el(`charges-${id}`).value);
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Invalid charges');
    character(d).magic[id] = value;
  }));
  el('weapon').addEventListener('change', () => action(d => { if (!active(d)) magic.kingdomSwitchWeapon(character(d), el('weapon').value); }));
  el('new_character').addEventListener('click', () => confirm(tk('new_confirm'), d => {
    record(d);
    const prior = character(d);
    d.player = { ...rules.createKingdomCharacter(), ...rules.initialKingdomLife(prior.permanent),
      ghosts: structuredClone(prior.ghosts ?? {}), enemyCounts: structuredClone(prior.enemyCounts ?? {}), experience: prior.experience };
    d.player.equipmentStock = [...prior.equipmentStock];
    d.player.magicStock = { ...prior.magicStock };
    d.fight = null; d.dream = d.merlin = null; d.loggedEvents = 0;
  }));
  el('start').addEventListener('click', () => {
    const settings = Object.fromEntries(options.map(key => [key, el('option-' + key).checked]));
    settings.invisibility = data()?.invisibility;
    const apply = d => { record(d); d.fight = rules.startKingdomFight(character(d), Number(el('encounter').value), settings); d.loggedEvents = 0; d.invisibility = null; d.dream = d.merlin = null; };
    if (active(data() ?? {})) confirm(tk('replace_fight'), apply); else action(apply);
  });
  const combat = (key, apply) => el(key).addEventListener('click', () => action(d => { if (active(d)) apply(d.fight, Number(el('target').value)); }));
  combat('roll', rules.rollKingdomRound);
  combat('bear_grip', f => rules.kingdomBreakBearGrip(f));
  combat('initiative', f => rules.rerollKingdomInitiative(f));
  combat('friendly', rules.kingdomTryFriendly);
  combat('bribe', rules.kingdomTryBribe);
  for (const mode of ['run', 'retreat', 'surrender']) combat(mode, f => rules.kingdomLeaveFight(f, mode));
  combat('call_gnurlbash', rules.kingdomCallGnurlbash);
  combat('lucky_strike', f => { if (!f.spec.dream && f.player.luckyRolls > 0) f.luckyNext = true; });
  combat('smarm', (f, index) => magic.kingdomSmarm(f, index, el('opposite-sex').checked));
  el('witch_loot').addEventListener('click', () => action(d => { if (d.fight) rules.kingdomCollectWitchLoot(d.fight); }));
  combat('break_sanctuary', magic.kingdomBreakSanctuary);
  combat('cast', (f, index) => {
    const count = ['laughingGlobe', 'sleepGlobe'].includes(el('spell').value) ? Number(el('magic_targets').value) : 1;
    const targets = [index, ...rules.kingdomTargets(f).map(row => row.index).filter(value => value !== index)].slice(0, count);
    if (!Number.isInteger(count) || count < 1 || count > 12 || targets.length !== count) throw new RangeError('Invalid targets');
    magic.kingdomCast(f, el('spell').value, index, { targets, nameAndLocationKnown: el('known').checked });
  });
  el('resurrect').addEventListener('click', () => action(d => { if (d.fight) magic.kingdomResurrect(d.fight); }));
  el('decline_resurrection').addEventListener('click', () => action(d => { if (d.fight?.player.life === 0) d.fight.resurrectionDeclined = true; }));
  el('heal').addEventListener('click', () => action(d => { if (!active(d)) {
    const result = rules.kingdomHeal(character(d), el('healing').value === 'potions' ? 'potion' : 'salve');
    if (d.fight) d.fight.player = result.player; else d.player = result.player;
  } }));
  el('yarrow_button').addEventListener('click', () => action(d => { const p = character(d); if (!active(d) && p.yarrow > 0) { p.yarrow--; p.sectionPoison = 0; } }));
  el('sleep').addEventListener('click', () => action(d => { if (!active(d)) replace(d, travel.kingdomSleep(character(d))); }));
  el('dream_again').addEventListener('click', () => action(d => { if (d.dream?.status === 'redream') replace(d, travel.kingdomDream(character(d), d.dream.nextDream)); }));
  for (const [key, success] of [['limerick_yes', true], ['limerick_no', false]]) el(key).addEventListener('click', () => action(d => {
    if (travel.kingdomFinishLimerick(d.dream, success)) d.player = d.dream.player;
  }));
  el('merlin').addEventListener('click', () => action(d => { if (!active(d)) {
    record(d); d.merlin = travel.kingdomMerlin(character(d));
    if (d.merlin) { d.player = d.merlin.player; d.fight = null; d.loggedEvents = 0; d.log.push(tk('room_' + d.merlin.room)); }
  } }));
  el('take_gift').addEventListener('click', () => action(d => {
    if (d.merlin?.room === 'equipment') travel.kingdomTakeEquipment(d.merlin, el('gift').value);
    else travel.kingdomTakeMagic(d.merlin, el('gift').value);
  }));
  el('invisibility').addEventListener('click', () => action(d => { if (!active(d)) {
    const result = travel.kingdomInvisibility(character(d));
    if (result) { if (d.fight) d.fight.player = result.player; else d.player = result.player; d.invisibility = result.effect; }
  } }));
  el('charge_resurrection').addEventListener('click', () => action(d => { if (!active(d)) magic.kingdomChargeResurrection(character(d)); }));
  el('friendship').addEventListener('click', () => action(d => { if (!active(d)) magic.kingdomPrepareFriendship(character(d)); }));
  el('remove_neck').addEventListener('click', () => confirm(tk('remove_neck_confirm'), d => { if (!active(d)) magic.kingdomRemoveNeckBolt(character(d)); }));
  el('city_patrol').addEventListener('click', () => action(d => { if (!active(d)) {
    d.patrol = travel.kingdomCityPatrol(character(d));
    if (d.patrol) d.log.push(tk('patrol_result', { roll: d.patrol.roll ?? '-', count: d.patrol.count ?? 0, outcome: tk(d.patrol.status) }));
  } }));
  el('city_fine').addEventListener('click', () => action(d => {
    if (!active(d) && d.patrol?.status === 'patrol' && travel.kingdomPayFine(character(d), 200)) d.patrol.status = 'clear';
  }));
  for (const key of ['city_court', 'constable_court']) el(key).addEventListener('click', () => action(d => {
    if (active(d) || character(d).life <= 0) return;
    const result = rules.kingdomCourt(), p = character(d);
    if (result.result === 'hanged') p.life = 0;
    else if (key === 'constable_court' && result.result === 'penalty') {
      p.magic = {}; p.luckyGame = false; p.luckyRolls = p.speedCombats = 0;
      p.weapon = 'ej'; p.hit = 4; p.bonus = 5;
    }
    d.log.push(tk('court_result', { roll: result.roll, outcome: tk(key + '_' + result.result) }));
    d.patrol = null;
  }));
}

export { initSim530 as init, renderSim530 as render, setSim530Visible as setVisible };
