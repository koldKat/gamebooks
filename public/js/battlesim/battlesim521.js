import { currentPlaythrough, saveState, currentBookId } from '../core/state.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';
import { initialFortune, recoverVitality } from './engines/skyfall-rules.js';
import { MARSH_ENCOUNTERS } from './engines/skyfall/monsters-of-the-marsh.js';
import { createMarshFight, rollMarshRound, settleMarshRound, escapeMarshTree, escapeMarshCanoe } from './engines/skyfall/marsh-combat.js';

const ID = 'sim521';
const tk = (key, params) => t(`battlesim521.${key}`, params);
const element = key => document.getElementById(`${ID}-${key}`);

function data() {
  if (Number(currentBookId) !== 521) return null;
  const pt = currentPlaythrough();
  if (!pt) return null;
  return pt[ID] ||= {
    player: { expertise: 12, vitality: 20, fortune: initialFortune().fortune, weaponDamage: 2 },
    fight: null, history: [], log: [],
  };
}

function character(d) { return d.fight?.player ?? d.player; }
function close() { element('overlay')?.classList.remove('active'); }
function open() {
  if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  renderSim521();
  element('overlay').classList.add('active');
}

function saveAndRender() { saveState(); renderSim521(); }
function number(key) { return Number(element(key).value); }
function field(key, minimum = 0) {
  return `<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk(key)}</span>
    <input id="${ID}-${key}" class="inv-edit-input inv-qty-input" type="number" min="${minimum}" step="1"></label>`;
}
function toggle(key) {
  return `<label class="inv-edit-row"><input id="${ID}-${key}" type="checkbox">${tk(key)}</label>`;
}

function selectedEncounter() {
  return MARSH_ENCOUNTERS.find(e => String(e.section) === element('encounter').value);
}

function configure() {
  const e = selectedEncounter();
  element('count-wrap').hidden = !e.configurableCount;
  element('count').innerHTML = (e.configurableCount ?? []).map(count => `<option>${count}</option>`).join('');
  element('manual-wrap').hidden = !e.manualDamageRequired;
  element('companions-wrap').hidden = e.mode !== 'ambush';
  element('cutting-wrap').hidden = !e.cuttingOnly;
  element('poison-wrap').hidden = !e.poisonFortune;
  element('source-note').textContent = e.manualDamageRequired ? tk('missing_damage') : e.carryEnemyVitality ? tk('carry_vitality') : '';
}

function start() {
  const d = data();
  if (!d || d.fight?.pending) return;
  const e = selectedEncounter();
  const manualDamage = element('manual').value === '' ? undefined : number('manual');
  const raw = element('companions').value.trim();
  const damages = raw ? raw.split(',').map(value => value.trim()) : [];
  if (e.mode === 'ambush' && damages.some(value => !/^\d+$/.test(value))) {
    showAlert(tk('invalid_companions')); return;
  }
  try {
    const previous = d.fight;
    const fight = createMarshFight(e.section, character(d), {
      count: e.configurableCount ? number('count') : undefined,
      manualDamage,
      companions: e.mode === 'ambush' ? damages.map(value => ({ damage: Number(value) })) : [],
      cuttingWeapon: element('cutting').checked,
      poisonProtected: element('poison').checked,
    });
    if (e.carryEnemyVitality && [342, 363].includes(previous?.encounter.section)) {
      fight.encounter.foes[0].vitality = previous.encounter.foes[0].vitality;
      fight.encounter.expertiseModifier = previous.encounter.expertiseModifier ?? 0;
    }
    if (e.section === 376 && fight.encounter.foes.length === 6 && previous?.encounter.section === 274) {
      fight.encounter.foes[0].vitality = previous.encounter.foes[0].vitality;
    }
    d.fight = fight;
    d.player = { ...fight.player };
    d.log.push(tk('started', { section: e.sourceSection ?? e.section }));
    d.log = d.log.slice(-150);
    saveAndRender();
  } catch { showAlert(tk(e.manualDamageRequired && manualDamage === undefined ? 'missing_damage' : 'invalid_values')); }
}

function finish() {
  const d = data();
  const fight = d?.fight;
  if (!fight || fight.status === 'fighting' || fight.recorded) return;
  fight.recorded = true;
  if (!['win', 'loss'].includes(fight.status)) return;
  const last = d.history.at(-1)?.ts ?? 0;
  d.history.push({ enemy: tk('encounter_label', { section: fight.encounter.sourceSection ?? fight.encounter.section,
    enemy: fight.encounter.foes[0].name }), outcome: fight.status, ts: Math.max(Date.now(), last + 1) });
}

function act(action) {
  const d = data();
  const fight = d?.fight;
  if (!fight || fight.status !== 'fighting') return;
  if (action === 'roll') {
    rollMarshRound(fight, number('target'));
  } else if (action === 'settle') {
    const result = settleMarshRound(fight, {
      attackBonus: element('bonus').checked, bonusHit: number('bonus-hit'),
      defensePoints: number('defense'), blockFlanks: element('flanks').checked,
    });
    if (!result) return;
    d.log.push(tk('round_result', { round: result.round, damage: result.playerLoss,
      vitality: fight.player.vitality, fortune: fight.player.fortune, result: tk(`status.${result.result}`) }));
    d.log = d.log.slice(-150);
  } else if (action === 'tree') escapeMarshTree(fight);
  else if (action === 'canoe') escapeMarshCanoe(fight);
  finish();
  saveAndRender();
}

export function renderSim521() {
  if (!element('overlay')) return;
  const d = data();
  if (!d) { close(); return; }
  const fight = d.fight;
  const p = character(d);
  const pending = fight?.pending;
  for (const key of ['expertise', 'vitality', 'fortune', 'weaponDamage']) {
    if (document.activeElement !== element(key)) element(key).value = p[key];
    element(key).disabled = Boolean(pending);
  }
  element('start').disabled = Boolean(pending);
  element('fortune-roll').disabled = Boolean(pending);
  element('potion').disabled = Boolean(fight?.status === 'fighting' || p.vitality <= 0 || p.vitality >= 20);
  element('status').textContent = fight ? tk(`status.${fight.status}`) : tk('pick');
  const selected = element('target').value;
  element('target').innerHTML = (fight?.encounter.foes ?? []).flatMap((foe, i) => foe.vitality > 0
    ? [`<option value="${i}">${escapeHtml(foe.name)} (${foe.vitality} V)</option>`] : []).join('');
  if ([...element('target').options].some(option => option.value === selected)) element('target').value = selected;
  if (fight?.encounter.mode === 'sequential') element('target').selectedIndex = 0;
  element('target').disabled = Boolean(pending || fight?.encounter.mode === 'sequential');
  element('foes').innerHTML = (fight?.encounter.foes ?? []).map((foe, i) => `<label class="inv-edit-row">
    <span class="inv-edit-label">${escapeHtml(foe.name)} (${foe.expertise} E, ${foe.damage} D)</span>
    <input class="inv-edit-input inv-qty-input" type="number" min="0" max="${foe.initialVitality}" step="1"
      data-foe="${i}" value="${foe.vitality}" ${pending || fight.status !== 'fighting' ? 'disabled' : ''}></label>`).join('');
  element('roll').disabled = !fight || fight.status !== 'fighting' || Boolean(pending);
  element('pending').hidden = !pending;
  element('rolled').textContent = pending ? pending.events.includes('surface') ? tk('surface')
    : tk('rolled', { player: pending.player.total, enemies: pending.rolls.map(roll => roll.total).join(', '),
      damage: pending.enemyDamage + (pending.flankDamage ?? 0) }) : '';
  element('bonus-hit').innerHTML = (pending?.hits ?? []).map((hit, i) => `<option value="${i}">${escapeHtml(fight.encounter.foes[hit.index].name)}</option>`).join('') || '<option value="0">-</option>';
  const selection = pending?.selection ?? {};
  element('bonus-hit').value = String(selection.bonusHit ?? 0);
  element('bonus').disabled = !pending?.hits.length || p.fortune < 1 || Boolean(pending?.retry);
  element('defense').max = p.fortune;
  element('defense').value = selection.defensePoints ?? 0;
  element('bonus').checked = selection.attackBonus ?? false;
  element('flanks').checked = selection.blockFlanks ?? false;
  element('flanks-wrap').hidden = !pending?.flankDamage;
  element('tree').hidden = !fight?.encounter.treeEscapeFortune;
  element('tree').disabled = !fight || Boolean(pending) || fight.status !== 'fighting' || p.fortune < 3;
  element('canoe').hidden = !fight?.encounter.escapeAfterKills;
  element('canoe').disabled = !fight || Boolean(pending) || fight.status !== 'fighting'
    || fight.encounter.foes.filter(foe => foe.vitality <= 0).length < fight.encounter.escapeAfterKills;
  element('log').innerHTML = d.log.slice().reverse().map(line => `<div>${escapeHtml(line)}</div>`).join('');
  element('history').innerHTML = d.history.slice(-50).reverse().map(entry =>
    `<div class="bsim-history-row">${escapeHtml(entry.enemy)}: ${tk(`status.${entry.outcome}`)}</div>`).join('');
}

export function setSim521Visible(value) {
  if (element('btn')) element('btn').style.display = value ? '' : 'none';
  if (!value) close();
}

export function initSim521() {
  if (element('overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = `${ID}-overlay`;
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `<div class="inv-modal bsim-modal"><div class="inv-modal-hdr">
    <span class="inv-modal-title">${tk('title')}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div>
    <div class="bsim-body"><div class="bsim-col bsim-col-left"><div class="bsim-side">
    <div class="bsim-side-title">${tk('character')}</div>
    ${field('expertise', -100)}${field('vitality')}${field('fortune')}${field('weaponDamage')}
    <button id="${ID}-fortune-roll" class="inv-add-btn">${tk('fortune_roll')}</button>
    <button id="${ID}-potion" class="inv-add-btn">${tk('potion')}</button></div>
    <div class="bsim-side"><label class="inv-edit-row">${tk('encounter')}<select id="${ID}-encounter" class="inv-edit-input">
    ${MARSH_ENCOUNTERS.map(e => `<option value="${e.section}">${escapeHtml(tk('encounter_label', { section: e.sourceSection ?? e.section, enemy: e.foes[0].name }))}${e.section === '274c' ? ' (5)' : ''}</option>`).join('')}</select></label>
    <label id="${ID}-count-wrap" class="inv-edit-row">${tk('count')}<select id="${ID}-count" class="inv-edit-input"></select></label>
    <div id="${ID}-manual-wrap">${field('manual')}</div>
    <label id="${ID}-companions-wrap" class="inv-edit-row">${tk('companions')}<input id="${ID}-companions" class="inv-edit-input" placeholder="${tk('companions_hint')}"></label>
    <div id="${ID}-cutting-wrap">${toggle('cutting')}</div><div id="${ID}-poison-wrap">${toggle('poison')}</div>
    <p id="${ID}-source-note"></p><button id="${ID}-start" class="inv-add-btn">${tk('start')}</button>
    <div id="${ID}-foes"></div><label class="inv-edit-row">${tk('target')}<select id="${ID}-target" class="inv-edit-input"></select></label></div>
    <div id="${ID}-status" class="bsim-status"></div>
    <button id="${ID}-roll" class="inv-add-btn bsim-action-primary">${tk('roll')}</button>
    <div id="${ID}-pending" class="bsim-side" hidden><p id="${ID}-rolled"></p>${toggle('bonus')}
    <label class="inv-edit-row">${tk('bonus_target')}<select id="${ID}-bonus-hit" class="inv-edit-input"></select></label>${field('defense')}
    <div id="${ID}-flanks-wrap">${toggle('flanks')}</div>
    <button id="${ID}-settle" class="inv-add-btn">${tk('settle')}</button></div>
    <button id="${ID}-tree" class="inv-add-btn">${tk('tree')}</button><button id="${ID}-canoe" class="inv-add-btn">${tk('canoe')}</button>
    </div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${tk('history')}</summary>
    <div id="${ID}-history" class="bsim-history-list"></div></details><div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
  document.body.appendChild(overlay);
  element('cutting').checked = true;
  const btn = document.createElement('button');
  btn.id = `${ID}-btn`;
  btn.innerHTML = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);
  btn.addEventListener('click', open);
  element('close').addEventListener('click', close);
  let backdropDown = false;
  overlay.addEventListener('mousedown', event => { backdropDown = event.target === overlay; });
  overlay.addEventListener('click', event => { if (event.target === overlay && backdropDown) close(); });
  registerPanelShortcut('KeyS', { getButton: () => btn, getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== `${ID}-overlay`), open, close });
  element('encounter').addEventListener('change', configure);
  element('start').addEventListener('click', start);
  for (const action of ['roll', 'settle', 'tree', 'canoe']) element(action).addEventListener('click', () => act(action));
  for (const key of ['bonus', 'bonus-hit', 'defense', 'flanks']) {
    element(key).addEventListener('change', () => {
      const pending = data()?.fight?.pending;
      if (!pending) return;
      pending.selection = { attackBonus: element('bonus').checked, bonusHit: number('bonus-hit'),
        defensePoints: Math.max(0, Math.floor(number('defense') || 0)), blockFlanks: element('flanks').checked };
      saveAndRender();
    });
  }
  for (const key of ['expertise', 'vitality', 'fortune', 'weaponDamage']) {
    element(key).addEventListener('change', () => {
      const d = data();
      const value = number(key);
      if (!d || d.fight?.pending || !Number.isInteger(value) || value < (key === 'expertise' ? -100 : 0)) { renderSim521(); return; }
      character(d)[key] = value;
      if (key === 'vitality' && d.fight?.status === 'fighting' && value === 0) {
        d.fight.status = 'loss'; finish();
      }
      saveAndRender();
    });
  }
  element('foes').addEventListener('change', event => {
    const d = data();
    const input = event.target.closest('[data-foe]');
    if (!input || !d?.fight || d.fight.pending || d.fight.status !== 'fighting') return;
    const foe = d.fight.encounter.foes[Number(input.dataset.foe)];
    const value = Number(input.value);
    if (foe && Number.isInteger(value) && value >= 0 && value <= foe.initialVitality) {
      foe.vitality = value;
      if (d.fight.encounter.foes.every(foe => foe.vitality <= 0)) {
        d.fight.status = 'win'; finish();
      }
    }
    saveAndRender();
  });
  element('fortune-roll').addEventListener('click', () => {
    const d = data();
    if (!d || d.fight?.pending) return;
    character(d).fortune = initialFortune().fortune;
    saveAndRender();
  });
  element('potion').addEventListener('click', () => {
    const d = data();
    if (!d || d.fight?.status === 'fighting') return;
    character(d).vitality = recoverVitality(character(d).vitality, 8);
    saveAndRender();
  });
  configure();
}
