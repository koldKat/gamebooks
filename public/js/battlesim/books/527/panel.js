import { ID, fields, flags, items, spells } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, DEN_ENCOUNTERS, ID, active, castDenSpell, character, close, createDenCharacter, createDenFight, currentBookId, currentPlaythrough, data, denDream, denFriendlyReaction, el, escapeHtml, fields, flags, getPlayBtnRow, guardedConfirm, healDenPlayer, initSim527, initialDenLife, items, label, launchDenMagic, open, registerPanelShortcut, renderSim527, rerollDenInitiative, resolveDenPoison, rollDenRound, saveState, setSim527Visible, shortcutLabel, showAlert, showConfirm, sleep, spells, start, t, target, tk, update, useDenItem, useDenLollipop });
const { data } = createState(simulatorContext);
const { label, update, guardedConfirm, start, target, sleep } = createCombat(simulatorContext);
// END SIMULATOR WIRING
import { currentPlaythrough, saveState, currentBookId } from "../../../core/state.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { showAlert, showConfirm } from "../../../ui-helpers/confirm.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import { DEN_ENCOUNTERS } from "../.././engines/grailquest/den-of-dragons-roster.js";
import { createDenCharacter, initialDenLife, createDenFight, rollDenRound, rerollDenInitiative,
  resolveDenPoison, castDenSpell, launchDenMagic, useDenLollipop, denFriendlyReaction,
  denDream, healDenPlayer, useDenItem } from "../.././engines/grailquest/den-of-dragons.js";


const tk = (key, params) => t(`battlesim527.${key}`, params);
const el = key => document.getElementById(`${ID}-${key}`);




const character = d => d.fight?.player ?? d.player;
const active = d => d.fight?.status === 'fighting';


function close() { el('overlay')?.classList.remove('active'); }
function open() {
  if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  renderSim527(); el('overlay').classList.add('active');
}





export function renderSim527() {
  if (!el('overlay')) return;
  const d = data(); if (!d) { close(); return; }
  const p = character(d), f = d.fight, fighting = active(d);
  const display = fighting ? { ...p,
    hit: f.spec.playerHit ?? (f.spec.unarmed || f.spec.dream ? 6 : p.hit),
    bonus: f.spec.playerBonus ?? (f.spec.unarmed || f.spec.dream ? 0 : f.spec.dragon && p.dragonEJ ? 10 : p.bonus),
    armour: f.spec.playerArmour ?? (f.spec.dream ? 0 : p.armour),
    magicArmour: f.magicArmour, pendingWallop: f.nextBonus,
  } : p;
  for (const key of fields) {
    if (document.activeElement !== el(key)) el(key).value = display[key] ?? 0;
    el(key).disabled = fighting;
  }
  for (const key of flags) { el(key).checked = !!p[key]; el(key).disabled = fighting; }
  const previousTarget = el('target').value;
  el('target').innerHTML = (f?.foes ?? []).map((foe, index) => {
    const available = !foe.bypassed && (f.spec.tokenLimit ? fighting : foe.life > (f.spec.shapes ? 0 : 5));
    const text = f.spec.tokenLimit ? tk('token_target', { loss: f.enemyLoss })
      : tk('target_label', { enemy: tk(`enemy_names.${f.spec.section}`), number: index + 1, life: foe.life });
    return `<option value="${index}" ${available ? '' : 'disabled'}>${escapeHtml(text)}</option>`;
  }).join('');
  const options = [...el('target').options];
  el('target').value = options.find(o => !o.disabled && o.value === previousTarget)?.value ?? options.find(o => !o.disabled)?.value ?? '';
  el('target').disabled = !fighting || !!f?.spec.shapes;
  el('roll').disabled = !fighting || !f.first || f.poisonPending || f.spec.magicChallenge;
  el('initiative').hidden = !fighting || !!f.first;
  el('poison').hidden = !fighting || !f.poisonPending;
  const magicBlocked = !fighting || f.spec.dream || f.poisonPending;
  el('cast').disabled = magicBlocked;
  for (const option of el('spell').options) {
    const limit = option.value === 'invisibility' ? 1 : 3;
    const used = p.spellUses[option.value] ?? 0;
    option.textContent = `${tk(option.value)} (${used}/${limit})`;
    option.disabled = used >= limit || !!p.spellCharged[option.value]
      || f?.spec.magicChallenge && !['pad', 'pow'].includes(option.value)
      || option.value === 'invisibility' && ![98, 130, 136, 137, 172].includes(f?.spec.section);
  }
  el('cast').disabled ||= el('spell').selectedOptions[0]?.disabled ?? true;
  el('bolt').disabled = magicBlocked || !!f?.spec.magicChallenge || p.bolts < 1;
  el('ball').disabled = magicBlocked || !!f?.spec.magicChallenge || p.fireballs < 1;
  el('lick').disabled = magicBlocked || !!f?.spec.magicChallenge || p.lollipop < 1;
  for (const option of el('item').options) option.disabled = !p[option.value]
    || option.value === 'snuff' && (p.snuffSections ?? []).includes(f?.spec.section)
    || option.value === 'hypnosisScroll' && !!f?.spec.dragon
    || f?.poisonPending && option.value !== 'antidoteScroll';
  el('use-item').disabled = !fighting || !!f?.spec.dream || !!f?.spec.magicChallenge || (el('item').selectedOptions[0]?.disabled ?? true);
  el('sleep').disabled = fighting || p.life <= 0;
  el('friendly').disabled = fighting || p.life <= 0;
  el('status').textContent = fighting ? !f.first ? tk('tie') : `${label(f.spec.section)} · ${tk('round', { round: f.rounds + 1 })} · ${tk('first', { who: tk(f.first) })}`
    : f ? `${label(f.spec.section)}: ${tk(f.status)}` : tk('pick');
  el('disease-note').textContent = p.disease ? tk('disease_warning') : '';
  el('log').innerHTML = d.log.slice(-100).reverse().map(s => `<div>${escapeHtml(s)}</div>`).join('');
  el('history').innerHTML = d.history.slice(-50).reverse().map(h => `<div class="bsim-history-row">${escapeHtml(h.enemy)}: ${escapeHtml(tk(h.outcome))}</div>`).join('');
}
export function setSim527Visible(value) {
  if (el('btn')) el('btn').style.display = value ? '' : 'none';
  if (!value) close();
}
export function initSim527() {
  if (el('overlay')) return;
  const overlay = document.createElement('div'); overlay.id = `${ID}-overlay`; overlay.className = 'inv-overlay';
  overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${tk('title')}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div>
    <div class="bsim-body"><div class="bsim-col bsim-col-left"><div class="bsim-side"><div class="bsim-side-title">${tk('character')}</div>
    ${fields.map(k => `<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk(k)}</span><input id="${ID}-${k}" class="inv-edit-input inv-qty-input" type="number" step="1" min="0"></label>`).join('')}
    ${flags.map(k => `<label class="inv-edit-row"><input id="${ID}-${k}" type="checkbox">${tk(k)}</label>`).join('')}
    <button id="${ID}-new" class="inv-add-btn">${tk('new_character')}</button></div>
    <div class="bsim-side"><label class="inv-edit-row">${tk('encounter')}<select id="${ID}-encounter" class="inv-edit-input">${DEN_ENCOUNTERS.map(e => `<option value="${e.section}">${escapeHtml(label(e.section))}</option>`).join('')}</select></label>
    <button id="${ID}-start" class="inv-add-btn">${tk('start')}</button><div id="${ID}-status" class="bsim-status"></div>
    <label class="inv-edit-row">${tk('target')}<select id="${ID}-target" class="inv-edit-input"></select></label>
    <div class="bsim-btn-row"><button id="${ID}-initiative" class="inv-add-btn">${tk('initiative')}</button><button id="${ID}-roll" class="inv-add-btn">${tk('roll')}</button><button id="${ID}-poison" class="inv-add-btn">${tk('poison')}</button></div>
    <label class="inv-edit-row">${tk('spell')}<select id="${ID}-spell" class="inv-edit-input">${spells.map(k => `<option value="${k}">${tk(k)}</option>`).join('')}</select></label>
    <div class="bsim-btn-row"><button id="${ID}-cast" class="inv-add-btn">${tk('cast')}</button><button id="${ID}-bolt" class="inv-add-btn">${tk('bolt')}</button><button id="${ID}-ball" class="inv-add-btn">${tk('ball')}</button><button id="${ID}-lick" class="inv-add-btn">${tk('lick')}</button></div>
    <label class="inv-edit-row">${tk('item')}<select id="${ID}-item" class="inv-edit-input">${items.map(k => `<option value="${k}">${tk(k)}</option>`).join('')}</select></label><button id="${ID}-use-item" class="inv-add-btn">${tk('use_item')}</button>
    <div class="bsim-btn-row"><button id="${ID}-sleep" class="inv-add-btn">${tk('sleep')}</button><button id="${ID}-friendly" class="inv-add-btn">${tk('friendly')}</button></div>
    <p id="${ID}-disease-note"></p></div><p>${tk('note')}</p><p>${tk('manual')}</p></div>
    <div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${tk('history')}</summary><div id="${ID}-history" class="bsim-history-list"></div></details><div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
  document.body.appendChild(overlay);
  const btn = document.createElement('button'); btn.id = `${ID}-btn`; btn.innerHTML = shortcutLabel(t('battlesim.title')); btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn); btn.addEventListener('click', open); el('close').addEventListener('click', close);
  let backdrop = false;
  overlay.addEventListener('mousedown', e => { backdrop = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && backdrop) close(); });
  registerPanelShortcut('KeyS', { getButton: () => btn, getOverlay: () => overlay, otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== `${ID}-overlay`), open, close });
  el('start').addEventListener('click', start);
  el('spell').addEventListener('change', renderSim527);
  el('item').addEventListener('change', renderSim527);
  el('use-item').addEventListener('click', () => {
    const d = data(); if (!d?.fight) return;
    const result = useDenItem(d.fight, el('item').value, target()); if (!result) return;
    d.log.push(tk('item_result', { item: tk(result.item), result: tk(result.success ? 'success' : 'failed'), amount: result.amount ?? 0, roll: result.roll ?? '-'}));
    update(d);
  });
  el('sleep').addEventListener('click', sleep);
  el('new').addEventListener('click', () => guardedConfirm(tk('new_confirm'), d => {
    const permanent = Math.min(10, character(d).permanent);
    const result = initialDenLife(permanent);
    d.player = { ...createDenCharacter(), permanent, life: result.life, maxLife: result.life };
    d.fight = null;
  }));
  for (const key of fields) el(key).addEventListener('change', () => {
    const d = data(); if (!d || active(d)) return;
    const value = Number(el(key).value), p = character(d);
    if (!el(key).value.trim() || !Number.isSafeInteger(value) || value < 0 || key === 'hit' && (value < 2 || value > 12)
      || key === 'life' && value > p.maxLife || key === 'maxLife' && value < p.life || key === 'permanent' && value > 10) {
      showAlert(tk('invalid')); el(key).value = p[key]; return;
    }
    p[key] = value; update(d);
  });
  for (const key of flags) el(key).addEventListener('change', () => {
    const d = data(); if (!d || active(d)) return;
    character(d)[key] = el(key).checked; update(d);
  });
  el('initiative').addEventListener('click', () => {
    const d = data(); if (d?.fight && rerollDenInitiative(d.fight)) update(d);
  });
  el('roll').addEventListener('click', () => {
    const d = data(); if (!d?.fight) return;
    const result = rollDenRound(d.fight, target()); if (!result) return;
    for (const event of result) d.log.push(event.kind === 'blend' ? tk('blend_result') : event.kind === 'skip'
      ? tk('skip_result', { enemy: tk(`enemy_names.${d.fight.spec.section}`) })
      : tk('hit_result', { who: tk(event.kind), roll: event.roll ?? '—', damage: event.damage }));
    update(d);
  });
  el('cast').addEventListener('click', () => {
    const d = data(); if (!d?.fight) return;
    const result = castDenSpell(d.fight, el('spell').value, target()); if (!result) return;
    d.log.push(result.fatal ? tk('spell_stopped') : tk('spell_result', { spell: tk(result.spell), roll: result.roll, result: tk(result.success ? 'success' : 'failed'), cost: result.cost })); update(d);
  });
  for (const [button, kind] of [['bolt', 'bolts'], ['ball', 'fireballs']]) el(button).addEventListener('click', () => {
    const d = data(); if (!d?.fight) return;
    const result = launchDenMagic(d.fight, kind, target()); if (!result) return;
    d.log.push(tk('magic_result', result)); update(d);
  });
  el('lick').addEventListener('click', () => {
    const d = data(); if (!d?.fight) return;
    const amount = useDenLollipop(d.fight); if (amount === null) return;
    d.log.push(tk('lick_result', { amount })); update(d);
  });
  el('poison').addEventListener('click', () => {
    const d = data(); if (!d?.fight) return;
    const result = resolveDenPoison(d.fight); if (!result) return;
    d.log.push(tk('poison_result', { roll: result.roll, outcome: tk(result.status) })); update(d);
  });
  el('friendly').addEventListener('click', () => {
    const d = data(); if (!d || active(d) || character(d).life <= 0) return;
    const result = denFriendlyReaction(); d.log.push(tk(result.friendly ? 'friendly_yes' : 'friendly_no', result)); update(d);
  });
}

export { initSim527 as init, renderSim527 as render, setSim527Visible as setVisible };
