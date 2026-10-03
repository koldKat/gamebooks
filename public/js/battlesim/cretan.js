// Shared MIGHT/PROTECTION battle engine for the Cretan Chronicles system
// (books 400 "Bloodfeud of Altheus" and 401 "At the Court of King Minos").
// NOT Fighting Fantasy and NOT Freeway Warrior: a strike rolls 2 dice + attacker
// Might and lands if the total reaches the defender's total Protection (natural +
// armour). Natural 11/12 auto-hit, 2/3 auto-miss. A Seriously Wounded combatant
// rolls a single die (1 = auto-miss, 6 is not an auto-hit) unless both sides are
// Seriously Wounded, in which case both roll two dice again. Each hit advances a
// Healthy -> Wounded -> Seriously Wounded -> Dead wound track. Divine-only foes
// (the Minotaur) can be struck only when the hero wields a divine weapon. Honour
// may be spent, one strike at a time, to boost Might (own strike) or Protection
// (incoming strike). Shame, retreat/surrender navigation, the Pankration boxing
// sub-system and "Taking a Hint" are narrative/out-of-scope and not simulated.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../core/state.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Wound track stages.
const HEALTHY = 0, WOUNDED = 1, SERIOUS = 2, DEAD = 3;

const _die = () => 1 + Math.floor(Math.random() * 6);

// Resolve a single strike. Pure given its RNG; the dice are returned for logging.
//  attackerMight   - total Might added to the dice (natural + weapon + boosts)
//  defenderProt    - total Protection to beat (natural + armour + boosts)
//  single          - true when the attacker rolls one die (Seriously Wounded)
//  canHit          - false when a non-divine weapon strikes a divine-only foe
export function resolveStrike(attackerMight, defenderProt, { single = false, canHit = true } = {}) {
  if (!canHit) return { dice: [], diceSum: 0, total: 0, hit: false, auto: 'nodivine', single };
  if (single) {
    const r = _die();
    const total = r + attackerMight;
    if (r === 1) return { dice: [r], diceSum: r, total, hit: false, auto: 'miss', single };
    return { dice: [r], diceSum: r, total, hit: total >= defenderProt, auto: null, single };
  }
  const a = _die(), b = _die();
  const sum = a + b;
  const total = sum + attackerMight;
  if (sum >= 11) return { dice: [a, b], diceSum: sum, total, hit: true,  auto: 'hit',  single };
  if (sum <= 3)  return { dice: [a, b], diceSum: sum, total, hit: false, auto: 'miss', single };
  return { dice: [a, b], diceSum: sum, total, hit: sum >= 2 && total >= defenderProt, auto: null, single };
}

// How many dice a striker rolls, per the Seriously-Wounded rules.
export function strikeIsSingle(strikerStage, otherStage) {
  if (strikerStage !== SERIOUS) return false;        // Healthy / Wounded -> two dice
  if (otherStage === SERIOUS)   return false;        // both Serious -> two dice again
  return true;                                       // only this striker Serious -> one die
}

export function stageName(stage) {
  if (stage >= DEAD)      return t('battlesim.cretan.stage_dead');
  if (stage === SERIOUS)  return t('battlesim.cretan.stage_serious');
  if (stage === WOUNDED)  return t('battlesim.cretan.stage_wounded');
  return t('battlesim.cretan.stage_healthy');
}

// Factory: build a complete per-book simulator object. idPrefix/stateKey/prefix
// and the Honour default are the only things that differ between books.
export function createCretanSim({ bookId, idPrefix, stateKey, i18nPrefix, defaultHonour }) {
  const ID = idPrefix;                 // e.g. 'sim400'
  const K  = i18nPrefix;               // e.g. 'battlesim400'
  const tk = (suffix, params) => t(`${K}.${suffix}`, params);

  function _data() {
    const pt = currentPlaythrough();
    if (!pt) return null;
    if (!pt[stateKey]) {
      pt[stateKey] = {
        player: {
          naturalMight: 4, weaponMight: 1,
          naturalProtection: 10, armourProtection: 0,
          divineWeapon: false,
          honour: defaultHonour, honourInitial: defaultHonour,
          honourToMight: 0, honourToProtection: 0, honourReward: 0,
          stage: HEALTHY,
        },
        enemy: { name: '', might: 0, protection: 0, companions: 0, needsDivine: false, pankration: false, stage: HEALTHY, hasStats: false },
        roundsThisBattle: 0,
        log: [],
        history: [],
      };
    }
    const d = pt[stateKey];
    const p = d.player, e = d.enemy;
    if (p.naturalMight === undefined) p.naturalMight = 4;
    if (p.weaponMight === undefined) p.weaponMight = 1;
    if (p.naturalProtection === undefined) p.naturalProtection = 10;
    if (p.armourProtection === undefined) p.armourProtection = 0;
    if (p.divineWeapon === undefined) p.divineWeapon = false;
    if (p.honour === undefined) p.honour = defaultHonour;
    if (p.honourInitial === undefined) p.honourInitial = defaultHonour;
    if (p.honourToMight === undefined) p.honourToMight = 0;
    if (p.honourToProtection === undefined) p.honourToProtection = 0;
    if (p.honourReward === undefined) p.honourReward = 0;
    if (p.stage === undefined) p.stage = HEALTHY;
    if (e.companions === undefined) e.companions = 0;
    if (e.needsDivine === undefined) e.needsDivine = false;
    if (e.pankration === undefined) e.pankration = false;
    if (e.stage === undefined) e.stage = HEALTHY;
    if (e.hasStats === undefined) e.hasStats = false;
    if (!d.history) d.history = [];
    if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
    return d;
  }

  function _enemyName(d) { return d.enemy.name.trim() || tk('ui.enemy'); }
  function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

  function _appendLog(d, line) {
    d.log.push(line);
    if (d.log.length > 200) d.log.shift();
  }

  function _playerMight(d) { return d.player.naturalMight + d.player.weaponMight; }
  function _playerProt(d)  { return d.player.naturalProtection + d.player.armourProtection; }
  function _enemyMight(d)   { return d.enemy.might + Math.max(0, d.enemy.companions); }

  function _over(d) {
    return d.player.stage >= DEAD || d.enemy.stage >= DEAD;
  }
  function _ready(d) {
    return d.enemy.hasStats && !d.enemy.pankration;
  }

  function _recordOutcome(d, outcome) {
    d.history.push({
      enemy: _enemyName(d), outcome,
      playerStage: d.player.stage, ts: Date.now(),
    });
  }

  function _diceStr(r) { return r.dice.join('+'); }

  // One full exchange: hero strikes first (thrust); if the foe survives it
  // counter-thrusts.
  function _runRound() {
    const d = _data();
    if (!d || !_ready(d) || _over(d)) return;
    d.roundsThisBattle++;

    // Spend Honour on temporary boosts for this exchange.
    let mightBoost = Math.max(0, Math.min(d.player.honourToMight, d.player.honour));
    d.player.honour -= mightBoost;
    let protBoost = Math.max(0, Math.min(d.player.honourToProtection, d.player.honour));
    d.player.honour -= protBoost;
    d.player.honourToMight = 0;
    d.player.honourToProtection = 0;

    _appendLog(d, tk('log.round', { round: d.roundsThisBattle }));
    if (mightBoost) _appendLog(d, tk('log.spent_might', { n: mightBoost, honour: d.player.honour }));
    if (protBoost)  _appendLog(d, tk('log.spent_prot',  { n: protBoost,  honour: d.player.honour }));

    // Hero's thrust.
    const heroSingle = strikeIsSingle(d.player.stage, d.enemy.stage);
    const canHit = !d.enemy.needsDivine || d.player.divineWeapon;
    const hero = resolveStrike(_playerMight(d) + mightBoost, d.enemy.protection, { single: heroSingle, canHit });
    _logStrike(d, hero, /*heroAttacks=*/true);
    if (hero.hit) {
      d.enemy.stage++;
      _appendLog(d, tk('log.foe_wounded', { enemy: _enemyNameSafe(d), state: stageName(d.enemy.stage) }));
    }

    if (d.enemy.stage >= DEAD) {
      _finishWin(d);
    } else {
      // Foe's counter-thrust.
      const foeSingle = strikeIsSingle(d.enemy.stage, d.player.stage);
      const foe = resolveStrike(_enemyMight(d), _playerProt(d) + protBoost, { single: foeSingle, canHit: true });
      _logStrike(d, foe, /*heroAttacks=*/false);
      if (foe.hit) {
        d.player.stage++;
        _appendLog(d, tk('log.you_wounded', { state: stageName(d.player.stage) }));
      }
      if (d.player.stage >= DEAD) _finishLoss(d);
    }

    saveState();
    _renderAll();
  }

  function _logStrike(d, r, heroAttacks) {
    const who = heroAttacks ? tk('ui.you') : _enemyNameSafe(d);
    const target = heroAttacks ? _enemyNameSafe(d) : tk('ui.you');
    if (r.auto === 'nodivine') {
      _appendLog(d, tk('log.nodivine', { enemy: _enemyNameSafe(d) }));
      return;
    }
    const dieKind = r.single ? tk('log.one_die') : tk('log.two_dice');
    if (r.auto === 'hit')  { _appendLog(d, tk('log.auto_hit',  { who, target, dice: _diceStr(r) })); return; }
    if (r.auto === 'miss') { _appendLog(d, tk('log.auto_miss', { who, target, dice: _diceStr(r) })); return; }
    const key = r.hit ? 'log.strike_hit' : 'log.strike_miss';
    _appendLog(d, tk(key, { who, target, dice: _diceStr(r), total: r.total, kind: dieKind }));
  }

  function _finishWin(d) {
    _appendLog(d, `${SVG_TROPHY} ${tk('log.victory', { enemy: _enemyNameSafe(d) })}`);
    const reward = Math.max(0, d.player.honourReward | 0);
    if (reward) {
      d.player.honour += reward;
      _appendLog(d, tk('log.honour_reward', { n: reward, honour: d.player.honour }));
    }
    // Survivors reset their Wound Record to Healthy at the end of a combat.
    _appendLog(d, tk('log.wound_reset'));
    _recordOutcome(d, 'win');
  }

  function _finishLoss(d) {
    _appendLog(d, `${SVG_SKULL} ${tk('log.defeat')}`);
    _recordOutcome(d, 'loss');
  }

  function _resetBattle() {
    const d = _data();
    if (!d) return;
    d.player.stage = HEALTHY;
    d.player.honour = d.player.honourInitial;
    d.player.honourToMight = 0;
    d.player.honourToProtection = 0;
    d.enemy.stage = HEALTHY;
    d.roundsThisBattle = 0;
    if (d.log.length) _appendLog(d, tk('log.reset_sep'));
    _appendLog(d, tk('log.reset'));
    saveState();
    _renderAll();
  }

  // ── Render ───────────────────────────────────────────────────────────────

  function _setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

  function _renderStatus() {
    const d = _data();
    const el = document.getElementById(`${ID}-status`);
    if (!d || !el) return;
    if (d.enemy.pankration)        el.innerHTML = tk('status.pankration');
    else if (!d.enemy.hasStats)    el.innerHTML = tk('status.pick');
    else if (d.player.stage >= DEAD) el.innerHTML = `${SVG_SKULL} ${tk('status.defeat')}`;
    else if (d.enemy.stage >= DEAD)  el.innerHTML = `${SVG_TROPHY} ${tk('status.victory')}`;
    else el.innerHTML = tk('status.fighting', {
      you: stageName(d.player.stage), enemy: _enemyNameSafe(d), estate: stageName(d.enemy.stage),
    });
    const strikeBtn = document.getElementById(`${ID}-strike`);
    if (strikeBtn) strikeBtn.disabled = !_ready(d) || _over(d);
  }

  function _renderInputs() {
    const d = _data();
    if (!d) return;
    const p = d.player, e = d.enemy;
    _setVal(`${ID}-p-might`, p.naturalMight);
    _setVal(`${ID}-p-weapon`, p.weaponMight);
    _setVal(`${ID}-p-prot`, p.naturalProtection);
    _setVal(`${ID}-p-armour`, p.armourProtection);
    _setVal(`${ID}-p-honour`, p.honour);
    _setVal(`${ID}-p-h2m`, p.honourToMight);
    _setVal(`${ID}-p-h2p`, p.honourToProtection);
    _setVal(`${ID}-p-reward`, p.honourReward);
    const dw = document.getElementById(`${ID}-p-divine`);
    if (dw) dw.checked = !!p.divineWeapon;

    _setVal(`${ID}-e-might`, e.might);
    _setVal(`${ID}-e-prot`, e.protection);
    _setVal(`${ID}-e-companions`, e.companions);
    const nd = document.getElementById(`${ID}-e-divine`);
    if (nd) nd.checked = !!e.needsDivine;
    const pick = document.getElementById(`${ID}-enemy-pick`);
    if (pick && document.activeElement !== pick) pick.value = e.name;

    const pTot = document.getElementById(`${ID}-p-might-total`);
    if (pTot) pTot.textContent = tk('ui.effective', { might: _playerMight(d), prot: _playerProt(d) });
    const pState = document.getElementById(`${ID}-p-state`);
    if (pState) pState.textContent = stageName(p.stage);
    const eState = document.getElementById(`${ID}-e-state`);
    if (eState) eState.textContent = stageName(e.stage);
    const eTot = document.getElementById(`${ID}-e-might-total`);
    if (eTot) eTot.textContent = tk('ui.effective_foe', { might: _enemyMight(d), prot: e.protection });

    _renderStatus();
  }

  function _renderLog() {
    const d = _data();
    const el = document.getElementById(`${ID}-log`);
    if (!el || !d) return;
    el.innerHTML = d.log.slice().reverse().join('<br>');
  }

  function _renderHistory() {
    const d = _data();
    const sumEl = document.getElementById(`${ID}-history-summary`);
    const listEl = document.getElementById(`${ID}-history-list`);
    if (!d || !sumEl || !listEl) return;
    sumEl.textContent = tk('history.summary', { n: d.history.length });
    if (!d.history.length) {
      listEl.innerHTML = `<div class="bsim-history-empty">${tk('history.empty')}</div>`;
      return;
    }
    listEl.innerHTML = d.history.slice().reverse().map(h => {
      const icon = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
      const result = h.outcome === 'win' ? tk('history.won') : tk('history.lost');
      const date = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `<div class="bsim-history-row">
        <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
        <span class="bsim-history-meta">${date}</span>
      </div>`;
    }).join('');
  }

  function _renderAll() { _renderInputs(); _renderLog(); _renderHistory(); }

  function render() {
    const overlay = document.getElementById(`${ID}-overlay`);
    if (!overlay || !overlay.classList.contains('active')) return;
    if (!_data()) { _close(); return; }
    _renderAll();
  }

  function _open() {
    if (!_data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    _renderAll();
    document.getElementById(`${ID}-overlay`).classList.add('active');
  }
  function _close() { document.getElementById(`${ID}-overlay`)?.classList.remove('active'); }

  function setVisible(visible) {
    const btn = document.getElementById(`${ID}-btn`);
    if (btn) btn.style.display = visible ? '' : 'none';
    if (!visible) _close();
  }

  // ── Enemy autocomplete (book_enemies) ──────────────────────────────────────

  let _enemyList = null;
  async function _loadEnemyList() {
    if (_enemyList) return _enemyList;
    try {
      const res = await apiFetch(`/api/books/${currentBookId}/enemies`);
      _enemyList = res.ok ? await res.json() : [];
    } catch (_) { _enemyList = []; }
    return _enemyList;
  }

  function _applyEnemy(d, enemy) {
    const attack = enemy.attack, defense = enemy.defense;
    d.enemy.name = enemy.name;
    d.enemy.pankration = /pankration/i.test(enemy.name) || attack == null || defense == null;
    if (d.enemy.pankration) {
      d.enemy.hasStats = false;
      d.enemy.might = 0;
      d.enemy.protection = 0;
    } else {
      d.enemy.might = (attack || 0) + (enemy.pb || 0);  // pb = foe's weapon Might bonus
      d.enemy.protection = defense || 0;
      d.enemy.hasStats = true;
    }
    d.enemy.needsDivine = /minotaur/i.test(enemy.name);
    d.enemy.companions = 0;
    d.enemy.stage = HEALTHY;
    d.player.stage = HEALTHY;
    d.roundsThisBattle = 0;
  }

  function _setupEnemyAutocomplete() {
    const input = document.getElementById(`${ID}-enemy-pick`);
    const dropdown = document.getElementById(`${ID}-enemy-pick-dropdown`);
    let matches = [];
    let activeIdx = -1;

    function closeDropdown() {
      dropdown.classList.remove('open');
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
    function renderList(q) {
      const list = _enemyList || [];
      const ql = q.trim().toLowerCase();
      matches = ql ? list.filter(e => e.name.toLowerCase().includes(ql)) : list;
      if (!matches.length) { closeDropdown(); return; }
      dropdown.innerHTML = matches.map((e, i) => {
        const might = e.attack == null ? '?' : (e.attack + (e.pb || 0));
        const prot = e.defense == null ? '?' : e.defense;
        return `<li role="option" id="${ID}-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">M:${might} P:${prot}</span></li>`;
      }).join('');
      activeIdx = -1;
      dropdown.classList.add('open');
      input.setAttribute('aria-expanded', 'true');
      input.removeAttribute('aria-activedescendant');
    }
    function select(enemy) {
      const d = _data();
      if (!d || !enemy) return;
      input.value = enemy.name;
      _applyEnemy(d, enemy);
      closeDropdown();
      saveState();
      _renderAll();
    }
    dropdown.addEventListener('mousedown', e => {
      const li = e.target.closest('li');
      if (!li) return;
      select(matches[+li.dataset.idx]);
      e.preventDefault();
    });
    input.addEventListener('focus', async () => { input.removeAttribute('readonly'); await _loadEnemyList(); renderList(input.value); });
    input.addEventListener('input', async () => { await _loadEnemyList(); renderList(input.value); });
    input.addEventListener('blur', () => setTimeout(closeDropdown, 150));
    input.addEventListener('keydown', e => {
      const items = dropdown.querySelectorAll('li');
      if (!items.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); }
      else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); select(matches[activeIdx]); return; }
      else if (e.key === 'Escape') { closeDropdown(); return; }
      else return;
      items.forEach((li, i) => { li.classList.toggle('ac-active', i === activeIdx); li.setAttribute('aria-selected', String(i === activeIdx)); });
      if (activeIdx >= 0) input.setAttribute('aria-activedescendant', items[activeIdx].id);
      else input.removeAttribute('aria-activedescendant');
      items[activeIdx]?.scrollIntoView({ block: 'nearest' });
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  function _numField(label, id) {
    return `
      <div class="inv-edit-row">
        <span class="inv-edit-label bsim-stat-label">${label}</span>
        <div class="inv-qty-wrap">
          <button class="inv-qty-btn" data-id="${id}" data-delta="-1">−</button>
          <input id="${id}" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
          <button class="inv-qty-btn" data-id="${id}" data-delta="1">+</button>
        </div>
      </div>`;
  }
  function _checkField(label, id) {
    return `
      <div class="inv-edit-row">
        <span class="inv-edit-label bsim-stat-label">${label}</span>
        <input id="${id}" class="bsim-check" type="checkbox">
      </div>`;
  }

  function init() {
    const overlay = document.createElement('div');
    overlay.id = `${ID}-overlay`;
    overlay.className = 'inv-overlay';
    overlay.innerHTML = `
      <div class="inv-modal bsim-modal">
        <div class="inv-modal-hdr">
          <span class="inv-modal-title">${t('battlesim.title')}</span>
          <button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
        </div>
        <div class="bsim-body">
          <div class="bsim-col bsim-col-left">
            <div class="bsim-side">
              <div class="bsim-side-title">${tk('ui.you')}</div>
              ${_numField(tk('ui.natural_might'), `${ID}-p-might`)}
              ${_numField(tk('ui.weapon_might'), `${ID}-p-weapon`)}
              ${_numField(tk('ui.natural_prot'), `${ID}-p-prot`)}
              ${_numField(tk('ui.armour'), `${ID}-p-armour`)}
              ${_checkField(tk('ui.divine_weapon'), `${ID}-p-divine`)}
              <div class="bsim-ae-display" id="${ID}-p-might-total"></div>
              <div class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk('ui.wound')}</span><span id="${ID}-p-state" class="bsim-ae-display"></span></div>
              ${_numField(tk('ui.honour'), `${ID}-p-honour`)}
              ${_numField(tk('ui.honour_to_might'), `${ID}-p-h2m`)}
              ${_numField(tk('ui.honour_to_prot'), `${ID}-p-h2p`)}
              ${_numField(tk('ui.honour_reward'), `${ID}-p-reward`)}
            </div>
            <div class="bsim-side">
              <div class="bsim-side-title">${tk('ui.enemy')}</div>
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${tk('ui.pick')}</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="${ID}-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="${ID}-enemy-pick-dropdown">
                  <ul id="${ID}-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField(tk('ui.might'), `${ID}-e-might`)}
              ${_numField(tk('ui.protection'), `${ID}-e-prot`)}
              ${_numField(tk('ui.companions'), `${ID}-e-companions`)}
              ${_checkField(tk('ui.needs_divine'), `${ID}-e-divine`)}
              <div class="bsim-ae-display" id="${ID}-e-might-total"></div>
              <div class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk('ui.wound')}</span><span id="${ID}-e-state" class="bsim-ae-display"></span></div>
            </div>
            <div id="${ID}-status" class="bsim-status"></div>
            <div class="inv-modal-ftr">
              <button id="${ID}-strike" class="inv-add-btn bsim-action-primary">${tk('btn.strike')}</button>
              <button id="${ID}-reset" class="inv-add-btn">${tk('btn.reset')}</button>
            </div>
          </div>
          <div class="bsim-col bsim-col-right">
            <details class="bsim-history" open>
              <summary id="${ID}-history-summary">${tk('history.summary', { n: 0 })}</summary>
              <div id="${ID}-history-list" class="bsim-history-list"></div>
            </details>
            <div id="${ID}-log" class="bsim-log"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const btn = document.createElement('button');
    btn.id = `${ID}-btn`;
    btn.innerHTML = shortcutLabel(t('battlesim.title'));
    btn.style.display = 'none';
    getPlayBtnRow().appendChild(btn);

    btn.addEventListener('click', _open);
    document.getElementById(`${ID}-close`).addEventListener('click', _close);
    let _mdOnOverlay = false;
    overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
    overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) _close(); });
    registerPanelShortcut('KeyS', {
      getButton:  () => btn,
      getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== `${ID}-overlay`),
      open:  _open,
      close: _close,
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('active')) _close();
    });

    document.getElementById(`${ID}-strike`).addEventListener('click', _runRound);
    document.getElementById(`${ID}-reset`).addEventListener('click', _resetBattle);

    document.getElementById(`${ID}-p-divine`).addEventListener('change', e => {
      const d = _data(); if (!d) return;
      d.player.divineWeapon = e.target.checked; saveState(); _renderInputs();
    });
    document.getElementById(`${ID}-e-divine`).addEventListener('change', e => {
      const d = _data(); if (!d) return;
      d.enemy.needsDivine = e.target.checked; saveState(); _renderInputs();
    });

    const FIELD_MAP = {
      [`${ID}-p-might`]:      ['player', 'naturalMight'],
      [`${ID}-p-weapon`]:     ['player', 'weaponMight'],
      [`${ID}-p-prot`]:       ['player', 'naturalProtection'],
      [`${ID}-p-armour`]:     ['player', 'armourProtection'],
      [`${ID}-p-honour`]:     ['player', 'honour'],
      [`${ID}-p-h2m`]:        ['player', 'honourToMight'],
      [`${ID}-p-h2p`]:        ['player', 'honourToProtection'],
      [`${ID}-p-reward`]:     ['player', 'honourReward'],
      [`${ID}-e-might`]:      ['enemy', 'might'],
      [`${ID}-e-prot`]:       ['enemy', 'protection'],
      [`${ID}-e-companions`]: ['enemy', 'companions'],
    };
    function _applyField(id, val) {
      const d = _data();
      if (!d) return;
      const map = FIELD_MAP[id];
      if (!map) return;
      val = Math.max(0, val);
      if (map[0] === 'enemy' && (id === `${ID}-e-might` || id === `${ID}-e-prot`)) d.enemy.hasStats = true;
      d[map[0]][map[1]] = val;
      saveState();
      _renderInputs();
    }
    overlay.querySelectorAll('.inv-qty-input[id^="' + ID + '-"]').forEach(input => {
      if (!FIELD_MAP[input.id]) return;
      input.addEventListener('input', () => {
        const raw = String(input.value).replace(/[^0-9]/g, '');
        if (raw !== input.value) input.value = raw;
        _applyField(input.id, Number(raw) || 0);
      });
    });
    overlay.querySelectorAll('.inv-qty-btn[data-id^="' + ID + '-"]').forEach(btnEl => {
      btnEl.addEventListener('click', () => {
        const input = document.getElementById(btnEl.dataset.id);
        if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
        const next = Math.max(0, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
        _applyField(btnEl.dataset.id, next);
      });
    });

    _setupEnemyAutocomplete();
  }

  return { init, render, setVisible };
}
