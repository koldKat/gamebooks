import { currentPlaythrough, saveState, currentBookId } from '../core/state.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';
import { initialFortune, recoverVitality } from './engines/skyfall-rules.js';
import { MINE_ENCOUNTERS, createMineFight, rollMineRound, settleMineRound,
  escapeMineFight, finishMineFight } from './engines/skyfall/mine-of-torments.js';

const ID = 'sim523';
const tk = (key, params) => t(`battlesim523.${key}`, params);
const element = key => document.getElementById(`${ID}-${key}`);
const number = key => Number(element(key).value);
const options = ['underclothes', 'failedLanding', 'ambush', 'fedusar'];

function data() {
  if (Number(currentBookId) !== 523) return null;
  const pt = currentPlaythrough();
  if (!pt) return null;
  return pt[ID] ||= { player: { expertise: 12, vitality: 20, fortune: initialFortune().fortune, weaponDamage: 2 },
    potions: 3, provisions: 3, fight: null, history: [], log: [] };
}
function character(d) { return d.fight?.player ?? d.player; }
function close() { element('overlay')?.classList.remove('active'); }
function open() {
  if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  renderSim523(); element('overlay').classList.add('active');
}
function saveAndRender() { saveState(); renderSim523(); }
function field(key, minimum = 0) {
  return `<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk(key)}</span>
    <input id="${ID}-${key}" class="inv-edit-input inv-qty-input" type="number" min="${minimum}" step="1"></label>`;
}
function toggle(key) { return `<label class="inv-edit-row"><input id="${ID}-${key}" type="checkbox">${tk(key)}</label>`; }
function selectedEncounter() { return MINE_ENCOUNTERS.find(e => String(e.section) === element('encounter').value); }
function label(e) { return tk('encounter_label', { section: e.section, enemy: tk(`enemy.${e.foes[0].name.split(' ')[0]}`) }); }
function configure() {
  const e = selectedEncounter();
  for (const [key, visible] of [['underclothes', e.clothing], ['failedLanding', e.landing], ['ambush', e.ambush], ['fedusar', e.mode === 'vretch']]) {
    element(`${key}-wrap`).hidden = !visible;
  }
  element('source-note').textContent = tk(e.mode === 'immune' ? 'immune_note' : 'rewards_note');
}
function record() {
  const d = data(); const f = d?.fight;
  if (!f || f.status === 'fighting' || f.recorded) return;
  f.recorded = true;
  if (['win', 'loss'].includes(f.status)) d.history.push({ enemy: label(f.encounter), outcome: f.status,
    ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
}
function start() {
  const d = data(); if (!d || d.fight?.pending) return;
  try {
    d.fight = createMineFight(selectedEncounter().section, character(d), Object.fromEntries(options.map(key => [key, element(key).checked])));
    d.player = { ...d.fight.player };
    d.log.push(tk('started', { section: d.fight.encounter.section })); d.log = d.log.slice(-150);
    record(); saveAndRender();
  } catch { showAlert(tk('invalid_values')); }
}
function act(action) {
  const d = data(); const f = d?.fight; if (!f || f.status !== 'fighting') return;
  try {
    if (action === 'roll') rollMineRound(f, number('target'));
    else if (action === 'settle') {
      const r = settleMineRound(f, { attackBonus: element('bonus').checked,
        bonusHit: number('bonus-hit'), defensePoints: number('defense') });
      if (!r) return;
      d.log.push(tk('round_result', { round: r.round, damage: r.playerLoss, vitality: f.player.vitality,
        fortune: f.player.fortune, result: tk(`status.${r.result}`) })); d.log = d.log.slice(-150);
    } else escapeMineFight(f, action === 'reverse');
    record(); saveAndRender();
  } catch { showAlert(tk('invalid_values')); }
}

export function renderSim523() {
  if (!element('overlay')) return;
  const d = data(); if (!d) { close(); return; }
  const f = d.fight; const p = character(d); const pending = f?.pending;
  for (const key of ['expertise', 'vitality', 'fortune', 'weaponDamage', 'potions', 'provisions']) {
    if (document.activeElement !== element(key)) element(key).value = key in p ? p[key] : d[key];
    element(key).disabled = Boolean(pending);
  }
  for (const key of ['start', 'fortune-roll', 'encounter', ...options]) element(key).disabled = Boolean(pending);
  const canHeal = f?.status !== 'fighting' && p.vitality > 0 && p.vitality < 20;
  element('potion').disabled = !canHeal || d.potions < 1;
  element('meal').disabled = !canHeal || d.provisions < 1;
  element('status').textContent = f ? tk(`status.${f.status}`) : tk('pick');
  const selected = element('target').value;
  const living = (f?.encounter.foes ?? []).flatMap((foe, i) => foe.vitality > 0 ? [{ foe, i }] : []);
  element('target').innerHTML = living.map(({ foe, i }) => `<option value="${i}">${escapeHtml(foe.name)} (${foe.vitality} V)</option>`).join('');
  if ([...element('target').options].some(o => o.value === selected)) element('target').value = selected;
  element('target').disabled = Boolean(pending);
  element('foes').innerHTML = (f?.encounter.foes ?? []).map((foe, i) => `<label class="inv-edit-row">
    <span class="inv-edit-label">${escapeHtml(foe.name)} (${foe.expertise} E, ${foe.damage} D)</span>
    <input class="inv-edit-input inv-qty-input" type="number" min="0" max="${foe.initialVitality}" step="1"
      data-foe="${i}" value="${foe.vitality}" ${pending || f.status !== 'fighting' ? 'disabled' : ''}></label>`).join('');
  element('roll').disabled = !f || f.status !== 'fighting' || Boolean(pending);
  element('pending').hidden = !pending;
  element('rolled').textContent = pending ? tk('rolled', { player: pending.player.total,
    enemies: pending.rolls.map(r => r.total).join(', '), damage: pending.enemyDamage, mandatory: pending.mandatoryFortune }) : '';
  element('bonus-hit').innerHTML = (pending?.hits ?? []).map((hit, i) => `<option value="${i}">${escapeHtml(f.encounter.foes[hit.index].name)}</option>`).join('') || '<option value="0">-</option>';
  const choice = pending?.selection ?? {};
  const available = Math.max(0, p.fortune - (pending?.mandatoryFortune ?? 0));
  element('bonus-hit').value = String(choice.bonusHit ?? 0);
  element('bonus').checked = choice.attackBonus ?? false;
  element('bonus').disabled = !pending?.hits.length || available < 1;
  element('defense').max = Math.min(available - (choice.attackBonus && available > 0 && pending?.hits.length ? 1 : 0), pending?.enemyDamage ?? 0);
  element('defense').value = choice.defensePoints ?? 0;
  element('defense').disabled = Boolean(pending?.retry || pending?.fatal || available < 1);
  for (const [key, cost] of [['escape', f?.encounter.escapeFortune ?? 0], ['reverse', f?.encounter.reverseFortune]]) {
    const applicable = key === 'reverse' ? cost !== undefined : f?.encounter.escapeDamage !== undefined || f?.encounter.escapeFortune !== undefined;
    element(key).hidden = !applicable;
    element(key).disabled = !f || f.status !== 'fighting' || Boolean(pending) || f.round < (f.encounter.escapeAfter ?? 0) || p.fortune < cost;
    element(key).textContent = tk(key, { damage: f?.encounter.escapeDamage ?? 0, fortune: cost ?? 0 });
  }
  element('log').innerHTML = d.log.slice().reverse().map(line => `<div>${escapeHtml(line)}</div>`).join('');
  element('history').innerHTML = d.history.slice(-50).reverse().map(entry =>
    `<div class="bsim-history-row">${escapeHtml(entry.enemy)}: ${tk(`status.${entry.outcome}`)}</div>`).join('');
}

export function setSim523Visible(value) {
  if (element('btn')) element('btn').style.display = value ? '' : 'none';
  if (!value) close();
}

export function initSim523() {
  if (element('overlay')) return;
  const overlay = document.createElement('div'); overlay.id = `${ID}-overlay`; overlay.className = 'inv-overlay';
  overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr">
    <span class="inv-modal-title">${tk('title')}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div>
    <div class="bsim-body"><div class="bsim-col bsim-col-left"><div class="bsim-side"><div class="bsim-side-title">${tk('character')}</div>
    ${field('expertise', -100)}${field('vitality')}${field('fortune')}${field('weaponDamage')}${field('potions')}${field('provisions')}
    <button id="${ID}-fortune-roll" class="inv-add-btn">${tk('fortune_roll')}</button><button id="${ID}-potion" class="inv-add-btn">${tk('potion')}</button>
    <button id="${ID}-meal" class="inv-add-btn">${tk('meal')}</button></div>
    <div class="bsim-side"><label class="inv-edit-row">${tk('encounter')}<select id="${ID}-encounter" class="inv-edit-input">
    ${MINE_ENCOUNTERS.map(e => `<option value="${e.section}">${escapeHtml(label(e))}</option>`).join('')}</select></label>
    ${options.map(key => `<div id="${ID}-${key}-wrap">${toggle(key)}</div>`).join('')}<p id="${ID}-source-note"></p>
    <button id="${ID}-start" class="inv-add-btn">${tk('start')}</button><div id="${ID}-foes"></div>
    <label class="inv-edit-row">${tk('target')}<select id="${ID}-target" class="inv-edit-input"></select></label></div>
    <div id="${ID}-status" class="bsim-status"></div><button id="${ID}-roll" class="inv-add-btn bsim-action-primary">${tk('roll')}</button>
    <div id="${ID}-pending" class="bsim-side" hidden><p id="${ID}-rolled"></p>${toggle('bonus')}
    <label class="inv-edit-row">${tk('bonus_target')}<select id="${ID}-bonus-hit" class="inv-edit-input"></select></label>${field('defense')}
    <button id="${ID}-settle" class="inv-add-btn">${tk('settle')}</button></div>
    <button id="${ID}-escape" class="inv-add-btn"></button><button id="${ID}-reverse" class="inv-add-btn"></button>
    </div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${tk('history')}</summary><div id="${ID}-history" class="bsim-history-list"></div></details>
    <div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
  document.body.appendChild(overlay);
  const btn = document.createElement('button'); btn.id = `${ID}-btn`; btn.innerHTML = shortcutLabel(t('battlesim.title')); btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn); btn.addEventListener('click', open); element('close').addEventListener('click', close);
  let backdropDown = false;
  overlay.addEventListener('mousedown', event => { backdropDown = event.target === overlay; });
  overlay.addEventListener('click', event => { if (event.target === overlay && backdropDown) close(); });
  registerPanelShortcut('KeyS', { getButton: () => btn, getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== `${ID}-overlay`), open, close });
  element('encounter').addEventListener('change', configure); element('start').addEventListener('click', start);
  for (const action of ['roll', 'settle', 'escape', 'reverse']) element(action).addEventListener('click', () => act(action));
  for (const key of ['bonus', 'bonus-hit', 'defense']) element(key).addEventListener('change', () => {
    const pending = data()?.fight?.pending; if (!pending) return;
    pending.selection = { attackBonus: element('bonus').checked, bonusHit: number('bonus-hit'), defensePoints: Math.max(0, Math.floor(number('defense') || 0)) };
    saveAndRender();
  });
  for (const key of ['expertise', 'vitality', 'fortune', 'weaponDamage', 'potions', 'provisions']) element(key).addEventListener('change', () => {
    const d = data(); const value = number(key);
    if (!d || d.fight?.pending || !Number.isInteger(value) || value < (key === 'expertise' ? -100 : 0) || key === 'vitality' && value > 20) { renderSim523(); return; }
    if (key in character(d)) character(d)[key] = value; else d[key] = value;
    if (d.fight) finishMineFight(d.fight);
    record(); saveAndRender();
  });
  element('foes').addEventListener('change', event => {
    const d = data(); const input = event.target.closest('[data-foe]');
    if (!input || !d?.fight || d.fight.pending || d.fight.status !== 'fighting') return;
    const foe = d.fight.encounter.foes[Number(input.dataset.foe)]; const value = Number(input.value);
    if (foe && Number.isInteger(value) && value >= 0 && value <= foe.initialVitality) {
      foe.vitality = value; finishMineFight(d.fight); record();
    }
    saveAndRender();
  });
  element('fortune-roll').addEventListener('click', () => { const d = data(); if (!d || d.fight?.pending) return; character(d).fortune = initialFortune().fortune; saveAndRender(); });
  for (const [action, key, amount] of [['potion', 'potions', 8], ['meal', 'provisions', 4]]) element(action).addEventListener('click', () => {
    const d = data(); if (!d || d.fight?.status === 'fighting' || d[key] < 1 || character(d).vitality <= 0 || character(d).vitality >= 20) return;
    character(d).vitality = recoverVitality(character(d).vitality, amount); d[key] -= 1; saveAndRender();
  });
  configure();
}
