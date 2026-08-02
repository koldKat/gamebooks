// ── Симулатор на битки - Пламъкът на Андалусия: Зарево над Кордоба (кн. 8) ──
// State stored in pt.sim8. Rules: roll N dice (N=Умение); 4-5→1 щ., 6→2 щ.
// Адрин напада пръв; при foeFirst - врагът напада преди него.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=11';
import { showAlert } from '../play.js?v=59';
import { getPlayBtnRow } from '../charsheet.js?v=51';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=34';
import { t } from '../i18n.js?v=28';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;
const SVG_TARGET = `<svg class="sim-icon sim-icon-target" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="6"  fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2"  fill="currentColor"/></svg>`;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim8) {
    pt.sim8 = {
      player:   { skill: 2, life: 18, lifeMax: 18 },
      enemy:    { name: '', skill: 3, life: 6, lifeMax: 6, foeFirst: false },
      round:    1,
      log:      [],
      history:  [],
      items:    { bow: false, arrows: 0, axe: false, potion: false, chainmail: false },
      bowFired: false,
      sixWins:  false,
    };
  }
  if (pt.sim8.round    == null) pt.sim8.round    = 1;
  if (!pt.sim8.items)           pt.sim8.items    = { bow: false, arrows: 0, axe: false, potion: false };
  if (pt.sim8.bowFired == null) pt.sim8.bowFired = false;
  return pt.sim8;
}

function _rollDice(n) {
  const a = [];
  for (let i = 0; i < n; i++) a.push(1 + Math.floor(Math.random() * 6));
  return a;
}

function _calcDmg(dice) {
  return dice.reduce((s, d) => s + (d === 6 ? 2 : d >= 4 ? 1 : 0), 0);
}

function _dieHtml(d) {
  if (d === 6) return `<span class="s8-die s8-die-6">${d}</span>`;
  if (d >= 4)  return `<span class="s8-die s8-die-hit">${d}</span>`;
  return `<span class="s8-die s8-die-miss">${d}</span>`;
}

function _diceHtml(dice) {
  return '[' + dice.map(_dieHtml).join(' ') + ']';
}

function _dmgHtml(dmg, cls) {
  return dmg > 0 ? `<span class="${cls}">-${dmg}</span>` : `<span class="s8-miss">0</span>`;
}

function _appendLog(d, html) {
  d.log.push(html);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || 'врагът'; }

function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: _enemyName(d), outcome,
    playerLife: d.player.life, playerLifeMax: d.player.lifeMax,
    ts: Date.now(),
  });
  if (d.history.length > 100) d.history.shift();
}

function _renderLog() {
  const el = document.getElementById('s8-log');
  const d  = _data();
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('s8-history-summary');
  const listEl = document.getElementById('s8-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = `История на битките (${d.history.length})`;
  if (!d.history.length) {
    listEl.innerHTML = '<div class="bsim-history-empty">Все още няма приключени битки.</div>';
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? 'победа' : 'загуба';
    const date   = new Date(h.ts).toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">Ж ${h.playerLife}/${h.playerLifeMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _updateItemBtns() {
  const d = _data();
  const bowBtn = document.getElementById('s8-bow-fire');
  const potBtn = document.getElementById('s8-potion-use');
  if (!d) { if (bowBtn) bowBtn.style.display = 'none'; if (potBtn) potBtn.style.display = 'none'; return; }

  const alive   = d.player.life > 0 && d.enemy.life > 0;
  const preRound = d.round === 1;

  if (bowBtn) {
    const canFire = alive && preRound && !d.bowFired && d.items?.bow && (d.items?.arrows > 0);
    bowBtn.style.display = canFire ? '' : 'none';
    if (canFire) bowBtn.textContent = `Стреляй стрела (${d.items.arrows} в колчана)`;
  }
  if (potBtn) {
    const inBattle = d.round > 1 && d.player.life > 0 && d.enemy.life > 0;
    const canUse = !inBattle && d.player.life > 0 && d.items?.potion && d.player.life < d.player.lifeMax;
    potBtn.style.display = canUse ? '' : 'none';
  }
}

function _updateStatus() {
  const d  = _data();
  const el = document.getElementById('s8-status');
  if (!d || !el) return;
  if (d.player.life <= 0)     el.innerHTML = `${SVG_SKULL} Ти падна в битката.`;
  else if (d.enemy.life <= 0) el.innerHTML = `${SVG_TROPHY} Победа!`;
  else                        el.innerHTML = '';
  document.getElementById('s8-round').disabled = d.player.life <= 0 || d.enemy.life <= 0;
}

function _renderInputs() {
  const d = _data();
  if (!d) return;
  document.getElementById('s8-player-skill').value      = d.player.skill;
  document.getElementById('s8-player-life').value       = Math.min(d.player.life, d.player.lifeMax);
  document.getElementById('s8-player-lifemax').value    = d.player.lifeMax;
  document.getElementById('s8-enemy-pick').value        = d.enemy.name;
  document.getElementById('s8-enemy-skill').value       = d.enemy.skill;
  document.getElementById('s8-enemy-life').value        = Math.min(d.enemy.life, d.enemy.lifeMax);
  document.getElementById('s8-enemy-lifemax').value     = d.enemy.lifeMax;
  document.getElementById('s8-enemy-foe-first').checked = d.enemy.foeFirst;

  const items = d.items || {};
  const bowCb  = document.getElementById('s8-item-bow');
  const cmCb   = document.getElementById('s8-item-chainmail');
  const axeCb  = document.getElementById('s8-item-axe');
  const potCb  = document.getElementById('s8-item-potion');
  const arrInp = document.getElementById('s8-arrows');
  if (bowCb)  bowCb.checked  = !!items.bow;
  if (cmCb)   cmCb.checked   = !!items.chainmail;
  if (axeCb)  axeCb.checked  = !!items.axe;
  if (potCb)  potCb.checked  = !!items.potion;
  if (arrInp) arrInp.value   = items.arrows ?? 0;

  const sixCb = document.getElementById('s8-six-wins');
  if (sixCb) sixCb.checked = !!d.sixWins;

  _updateStatus();
  _updateItemBtns();
}

function _runRound() {
  const d = _data();
  if (!d || d.player.life <= 0 || d.enemy.life <= 0) return;

  const useAxe  = !!d.items?.axe;
  const aDice   = _rollDice(d.player.skill + (useAxe ? 1 : 0));
  const eDice   = _rollDice(d.enemy.skill  + (useAxe ? 1 : 0));

  let cmNote = '';
  if (d.items?.chainmail) {
    let worst = -1, wi = -1;
    for (let i = 0; i < eDice.length; i++) if (eDice[i] >= 4 && eDice[i] > worst) { worst = eDice[i]; wi = i; }
    if (wi >= 0) {
      const old = eDice[wi];
      eDice[wi] = 1 + Math.floor(Math.random() * 6);
      cmNote = ` <span class="s8-rules-note">(ризница: ${old}→${eDice[wi]})</span>`;
    }
  }

  const aDmg    = _calcDmg(aDice);
  const eDmg    = _calcDmg(eDice);
  const rn      = d.round++;
  const en      = escapeHtml(_enemyName(d));
  const axeNote = useAxe ? ' <span class="s8-rules-note">(брадва)</span>' : '';

  if (d.enemy.foeFirst) {
    // Enemy strikes first; sixWins only applies if the player survives
    d.player.life = Math.max(0, d.player.life - eDmg);
    if (d.player.life <= 0) {
      _appendLog(d, `<b>Рунд ${rn}:</b> ${en} ${_diceHtml(eDice)}${axeNote}${cmNote} → ${_dmgHtml(eDmg, 's8-dmg-enemy')} | <span class="s8-dead">Адрин умира</span>`);
      _recordOutcome(d, 'loss');
    } else if (d.sixWins && aDice.includes(6)) {
      d.enemy.life = 0;
      _appendLog(d, `<b>Рунд ${rn}:</b> ${en} ${_diceHtml(eDice)}${axeNote}${cmNote} → ${_dmgHtml(eDmg, 's8-dmg-enemy')} &nbsp; Адрин ${_diceHtml(aDice)}${axeNote} → <span class="s8-win">${SVG_TARGET} шестица - автоматична победа!</span>`);
      _recordOutcome(d, 'win');
    } else {
      d.enemy.life = Math.max(0, d.enemy.life - aDmg);
      const bar = `<span class="s8-hpbar">Адрин Ж${d.player.life} · ${en} Ж${Math.max(0, d.enemy.life)}</span>`;
      _appendLog(d, `<b>Рунд ${rn}:</b> ${en} ${_diceHtml(eDice)}${axeNote}${cmNote} → ${_dmgHtml(eDmg, 's8-dmg-enemy')} &nbsp; Адрин ${_diceHtml(aDice)}${axeNote} → ${_dmgHtml(aDmg, 's8-dmg-player')} &nbsp; ${bar}`);
      if (d.enemy.life <= 0) { _appendLog(d, `<span class="s8-win">${SVG_TROPHY} ${en} е победен!</span>`); _recordOutcome(d, 'win'); }
    }
  } else if (d.sixWins && aDice.includes(6)) {
    d.enemy.life = 0;
    _appendLog(d, `<b>Рунд ${rn}:</b> Адрин ${_diceHtml(aDice)}${axeNote} → <span class="s8-win">${SVG_TARGET} шестица - автоматична победа!</span>`);
    _recordOutcome(d, 'win');
  } else {
    d.enemy.life = Math.max(0, d.enemy.life - aDmg);
    if (d.enemy.life <= 0) {
      _appendLog(d, `<b>Рунд ${rn}:</b> Адрин ${_diceHtml(aDice)}${axeNote} → ${_dmgHtml(aDmg, 's8-dmg-player')} | <span class="s8-win">${en} умира</span>`);
      _recordOutcome(d, 'win');
    } else {
      d.player.life = Math.max(0, d.player.life - eDmg);
      const bar = `<span class="s8-hpbar">Адрин Ж${d.player.life} · ${en} Ж${Math.max(0, d.enemy.life)}</span>`;
      _appendLog(d, `<b>Рунд ${rn}:</b> Адрин ${_diceHtml(aDice)}${axeNote} → ${_dmgHtml(aDmg, 's8-dmg-player')} &nbsp; ${en} ${_diceHtml(eDice)}${axeNote}${cmNote} → ${_dmgHtml(eDmg, 's8-dmg-enemy')} &nbsp; ${bar}`);
      if (d.player.life <= 0) { _appendLog(d, `<span class="s8-dead">${SVG_SKULL} Адрин умира.</span>`); _recordOutcome(d, 'loss'); }
    }
  }

  saveState();
  _renderInputs();
  _renderLog();
  _renderHistory();
}

function _fireBow() {
  const d = _data();
  if (!d || d.round !== 1 || d.bowFired || !d.items?.bow || !(d.items?.arrows > 0)) return;
  if (d.player.life <= 0 || d.enemy.life <= 0) return;

  const dice = _rollDice(1);
  const dmg  = _calcDmg(dice);
  const en   = escapeHtml(_enemyName(d));

  d.items.arrows--;
  d.bowFired   = true;
  d.enemy.life = Math.max(0, d.enemy.life - dmg);

  _appendLog(d, `<b>Стрела:</b> ${_diceHtml(dice)} → ${_dmgHtml(dmg, 's8-dmg-player')} на ${en} &nbsp; <span class="s8-hpbar">${en} Ж${d.enemy.life} · стрели останали: ${d.items.arrows}</span>`);
  if (d.enemy.life <= 0) {
    _appendLog(d, `<span class="s8-win">${SVG_TROPHY} ${en} пада от стрелата!</span>`);
    _recordOutcome(d, 'win');
  }

  saveState();
  _renderInputs();
  _renderLog();
  _renderHistory();
}

function _usePotion() {
  const d = _data();
  const inBattle = d.round > 1 && d.player.life > 0 && d.enemy.life > 0;
  if (!d || inBattle || !d.items?.potion || d.player.life <= 0 || d.player.life >= d.player.lifeMax) return;

  const roll  = 1 + Math.floor(Math.random() * 6);
  const heal  = roll + 6;
  const before = d.player.life;
  d.player.life  = Math.min(d.player.lifeMax, d.player.life + heal);
  d.items.potion = false;

  _appendLog(d, `<b>Лечебна отвара:</b> зар ${roll} + 6 = +${heal} Живот &nbsp; <span class="s8-hpbar">Адрин Ж${before} → Ж${d.player.life}</span>`);

  saveState();
  _renderInputs();
  _renderLog();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.life  = d.enemy.lifeMax;
  d.player.life = d.player.lifeMax;
  d.round       = 1;
  d.bowFired    = false;
  if (d.log.length) _appendLog(d, '──────────');
  _appendLog(d, 'Битката е нулирана.');
  saveState();
  _renderInputs();
  _renderLog();
  _renderHistory();
}

// ── Enemy autocomplete ───────────────────────────────────────────────────────
let _enemyList = null;
async function _loadEnemyList() {
  if (_enemyList) return _enemyList;
  try {
    const res = await apiFetch(`/api/books/${currentBookId}/enemies`);
    _enemyList = res.ok ? await res.json() : [];
  } catch (_) { _enemyList = []; }
  return _enemyList;
}

function _setupEnemyAutocomplete() {
  const input    = document.getElementById('s8-enemy-pick');
  const dropdown = document.getElementById('s8-enemy-pick-dropdown');
  let matches   = [];
  let activeIdx = -1;

  function closeDropdown() {
    dropdown.classList.remove('open');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function render(q) {
    const list = _enemyList || [];
    const ql   = q.trim().toLowerCase();
    matches    = ql ? list.filter(e => e.name.toLowerCase().includes(ql)) : list;
    if (!matches.length) { closeDropdown(); return; }
    dropdown.innerHTML = matches.map((e, i) => {
      const u = x => x == null ? '?' : x;
      return `<li role="option" id="s8-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">У:${u(e.attack)} Ж:${u(e.hp)}</span></li>`;
    }).join('');
    activeIdx = -1;
    dropdown.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    input.removeAttribute('aria-activedescendant');
  }

  function select(enemy) {
    const d = _data();
    if (!d || !enemy) return;
    input.value  = enemy.name;
    d.enemy.name = enemy.name;
    if (enemy.attack != null) d.enemy.skill   = enemy.attack;
    if (enemy.hp     != null) { d.enemy.life = enemy.hp; d.enemy.lifeMax = enemy.hp; }
    closeDropdown();
    saveState();
    _renderInputs();
  }

  dropdown.addEventListener('mousedown', e => {
    const li = e.target.closest('li');
    if (!li) return;
    select(matches[+li.dataset.idx]);
    e.preventDefault();
  });

  input.addEventListener('focus', async () => { input.removeAttribute('readonly'); await _loadEnemyList(); render(input.value); });
  input.addEventListener('input', async () => { await _loadEnemyList(); render(input.value); });
  input.addEventListener('blur',  () => setTimeout(closeDropdown, 150));
  input.addEventListener('keydown', e => {
    const items = dropdown.querySelectorAll('li');
    if (!items.length) return;
    if      (e.key === 'ArrowDown')               { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp')                 { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); select(matches[activeIdx]); return; }
    else if (e.key === 'Escape')                  { closeDropdown(); return; }
    else return;
    items.forEach((li, i) => { li.classList.toggle('ac-active', i === activeIdx); li.setAttribute('aria-selected', String(i === activeIdx)); });
    if (activeIdx >= 0) input.setAttribute('aria-activedescendant', items[activeIdx].id);
    else input.removeAttribute('aria-activedescendant');
    items[activeIdx]?.scrollIntoView({ block: 'nearest' });
  });
}

// ── Open / close ─────────────────────────────────────────────────────────────
function _openSim8() {
  if (!_data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  _renderInputs();
  _renderLog();
  _renderHistory();
  document.getElementById('s8-overlay').classList.add('active');
}

function _closeSim8() {
  document.getElementById('s8-overlay')?.classList.remove('active');
}

export function setSim8Visible(visible) {
  const btn = document.getElementById('sim8-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) _closeSim8();
}

export function renderSim8() {
  const overlay = document.getElementById('s8-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { _closeSim8(); return; }
  _renderInputs();
  _renderLog();
  _renderHistory();
}

// ── Stat stepper row ─────────────────────────────────────────────────────────
function _statField(label, id, group, key) {
  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <div class="inv-qty-wrap">
        <button class="inv-qty-btn" data-id="${id}" data-group="${group}" data-key="${key}" data-delta="-1">−</button>
        <input id="${id}" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric" data-group="${group}" data-key="${key}">
        <button class="inv-qty-btn" data-id="${id}" data-group="${group}" data-key="${key}" data-delta="1">+</button>
      </div>
    </div>`;
}

// ── Init ─────────────────────────────────────────────────────────────────────
export function initBattleSim8() {
  const overlay = document.createElement('div');
  overlay.id        = 's8-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">Симулатор - Зарево над Кордоба</span>
        <button id="s8-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">Ти (Адрин)</div>
            ${_statField('Умение', 's8-player-skill', 'player', 'skill')}
            ${_statField('Живот', 's8-player-life', 'player', 'life')}
            ${_statField('Максимум Живот', 's8-player-lifemax', 'player', 'lifeMax')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">Враг</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Избор</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="s8-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly placeholder="Въведи или избери…" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="s8-enemy-pick-dropdown">
                <ul id="s8-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_statField('Умение', 's8-enemy-skill', 'enemy', 'skill')}
            ${_statField('Живот', 's8-enemy-life', 'enemy', 'life')}
            ${_statField('Максимум Живот', 's8-enemy-lifemax', 'enemy', 'lifeMax')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Ред на атака</span>
              <input id="s8-enemy-foe-first" type="checkbox" class="inv-edit-check">
              <label for="s8-enemy-foe-first" class="inv-edit-check-label">Врагът напада пръв</label>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">Предмети</div>
            <div class="inv-edit-row">
              <input id="s8-item-bow" type="checkbox" class="inv-edit-check">
              <label for="s8-item-bow" class="inv-edit-check-label">Лък</label>
              <div class="inv-qty-wrap s8-arrows-wrap">
                <button class="inv-qty-btn" id="s8-arrows-dec">−</button>
                <input id="s8-arrows" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric" style="width:44px">
                <button class="inv-qty-btn" id="s8-arrows-inc">+</button>
              </div>
              <span class="s8-rules-note" style="margin-left:4px">стрели</span>
            </div>
            <div class="inv-edit-row">
              <input id="s8-item-chainmail" type="checkbox" class="inv-edit-check">
              <label for="s8-item-chainmail" class="inv-edit-check-label">Ризница (прехвърля 1 вражески зар)</label>
            </div>
            <div class="inv-edit-row">
              <input id="s8-item-axe" type="checkbox" class="inv-edit-check">
              <label for="s8-item-axe" class="inv-edit-check-label">Брадва (+1 зар на атака, +1 зар на враг)</label>
            </div>
            <div class="inv-edit-row">
              <input id="s8-item-potion" type="checkbox" class="inv-edit-check">
              <label for="s8-item-potion" class="inv-edit-check-label">Лечебна отвара (1 зар+6)</label>
            </div>
          </div>
          <div class="s8-rules-note">
            Всеки рунд - хвърляш N зара (N = Умение).
            Зар 1–3 → пропуск · 4–5 → 1 щ. · 6 → 2 щ.
          </div>
          <div class="inv-edit-row">
            <input id="s8-six-wins" type="checkbox" class="inv-edit-check">
            <label for="s8-six-wins" class="inv-edit-check-label">Шестица = автоматична победа</label>
          </div>
          <div id="s8-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="s8-round" class="inv-add-btn bsim-action-primary">Рунд</button>
            <button id="s8-bow-fire" class="inv-add-btn" style="display:none">Стреляй с лък</button>
            <button id="s8-potion-use" class="inv-add-btn" style="display:none">Пий отвара</button>
            <button id="s8-reset" class="inv-add-btn">Нулирай</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="s8-history-summary">История на битките (0)</summary>
            <div id="s8-history-list" class="bsim-history-list"></div>
          </details>
          <div id="s8-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim8-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', _openSim8);
  document.getElementById('s8-close').addEventListener('click', _closeSim8);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) _closeSim8(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 's8-overlay'),
    open:  _openSim8,
    close: _closeSim8,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) _closeSim8();
  });

  document.getElementById('s8-round').addEventListener('click', _runRound);
  document.getElementById('s8-reset').addEventListener('click', _resetBattle);
  document.getElementById('s8-bow-fire').addEventListener('click', _fireBow);
  document.getElementById('s8-potion-use').addEventListener('click', _usePotion);

  // Group steppers (player/enemy stats)
  overlay.querySelectorAll('.inv-qty-input[data-group]').forEach(input => {
    input.addEventListener('input', () => {
      // type="text" (needed to avoid native number-input spinner/scroll-wheel quirks,
      // see charsheet.js) accepts any keystroke - filter live so garbage can't be typed.
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      const d   = _data();
      if (!d) return;
      const grp = input.dataset.group;
      const key = input.dataset.key;
      let val   = Math.max(0, Number(raw) || 0);

      if (key === 'skill')  val = Math.max(2, Math.min(5, val));
      if (grp === 'player' && key === 'life' && val > d.player.lifeMax) d.player.lifeMax = val;
      if (grp === 'enemy'  && key === 'life' && val > d.enemy.lifeMax) d.enemy.lifeMax = val;

      d[grp][key] = val;

      if (key === 'skill' && grp === 'player') d.player.life = Math.min(d.player.life, d.player.lifeMax);
      if (key === 'lifeMax') d[grp].life = Math.min(d[grp].life, val);

      saveState();
      _renderInputs();
    });
  });

  overlay.querySelectorAll('.inv-qty-btn[data-group]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      const d     = _data();
      if (!d || !input) return;
      const grp = btnEl.dataset.group;
      const key = btnEl.dataset.key;
      let next  = (Number(input.value) || 0) + Number(btnEl.dataset.delta);

      if (key === 'skill') next = Math.max(2, Math.min(5, next));
      else                 next = Math.max(0, next);

      if (grp === 'player' && key === 'life' && next > d.player.lifeMax) d.player.lifeMax = next;
      if (grp === 'enemy'  && key === 'life' && next > d.enemy.lifeMax) d.enemy.lifeMax = next;

      d[grp][key] = next;

      if (key === 'skill' && grp === 'player') d.player.life = Math.min(d.player.life, d.player.lifeMax);
      if (key === 'lifeMax') d[grp].life = Math.min(d[grp].life, next);

      saveState();
      _renderInputs();
    });
  });

  // Arrows stepper
  document.getElementById('s8-arrows').addEventListener('input', e => {
    const raw = String(e.target.value).replace(/[^0-9]/g, '');
    if (raw !== e.target.value) e.target.value = raw;
    const d = _data();
    if (!d) return;
    d.items.arrows = Math.max(0, Number(raw) || 0);
    saveState();
    _updateItemBtns();
  });
  document.getElementById('s8-arrows-dec').addEventListener('click', () => {
    const d = _data();
    if (!d) return;
    d.items.arrows = Math.max(0, (d.items.arrows || 0) - 1);
    document.getElementById('s8-arrows').value = d.items.arrows;
    saveState();
    _updateItemBtns();
  });
  document.getElementById('s8-arrows-inc').addEventListener('click', () => {
    const d = _data();
    if (!d) return;
    d.items.arrows = (d.items.arrows || 0) + 1;
    document.getElementById('s8-arrows').value = d.items.arrows;
    saveState();
    _updateItemBtns();
  });

  // Item checkboxes
  document.getElementById('s8-item-bow').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.items.bow = e.target.checked;
    saveState();
    _updateItemBtns();
  });
  document.getElementById('s8-item-chainmail').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.items.chainmail = e.target.checked;
    saveState();
  });
  document.getElementById('s8-item-axe').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.items.axe = e.target.checked;
    saveState();
  });
  document.getElementById('s8-item-potion').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.items.potion = e.target.checked;
    saveState();
    _updateItemBtns();
  });

  document.getElementById('s8-six-wins').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.sixWins = e.target.checked;
    saveState();
  });

  document.getElementById('s8-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('s8-enemy-foe-first').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.enemy.foeFirst = e.target.checked;
    saveState();
  });

  _setupEnemyAutocomplete();
}
