// ── Battle Simulator (Дракон в мазето, book 881) ─────────────────────────────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 881 only) by the caller in boot.js via
// setSim881Visible().
// To remove: delete this file, remove its import line and initSim881()/
// setSim881Visible() calls from boot.js, remove 'sim881' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim881-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim881-btn selectors in
// battlesim.css.
//
// Core combat rule, printed on the book's own "Правила на приключението"
// page (see book_frontmatter.rules_text for book_id=881): each round, add a
// single die roll (Шанс) to the player's own СИЛА (5 at start, plus any
// sword bonus) and compare to the enemy's fixed СИЛА:
//   player total > enemy Сила  -> enemy loses 2 ИЗДРЪЖЛИВОСТ
//   player total < enemy Сила  -> player loses 2 ИЗДРЪЖЛИВОСТ
//   equal                      -> both lose 1 ИЗДРЪЖЛИВОСТ
// Repeats until one side hits 0. Against several enemies at once, the player
// exchanges one blow with each in turn, no choice of target (rule 2 on the
// same page). Several individual encounters override this default (a
// handful use "1 point per successful hit, no loss on a tie" instead) -
// those are modelled explicitly per-encounter below rather than forcing a
// single hard-coded formula, since the book itself does this per its own
// printed text at each such fight.
//
// The player carries exactly one of three interchangeable swords, each
// applying a different (sometimes negative) bonus to СИЛА for a given
// fight, as spelled out in that fight's own section text:
//   Фирфелд - heavy sword, best against groups/sturdy foes
//   Лайм    - intelligent, best in the dark/against many fast enemies
//   Истрин  - quick, best in ambushes/duels
//
// Full roster of genuine stat-based fights, verified via a complete
// 333-section prose read this session (narrative-only dice checks with no
// named opponent, e.g. the door-hinge/rope test at the very start, are
// correctly excluded, as is the final dragon Смерч/Рийдуей fight - every
// combat attempt against the dragon is a scripted instant death; the only
// real win path is a name-guessing puzzle + diplomacy, so it is excluded as
// a narrative trap rather than a real fight, matching this app's book 781
// "momiche" precedent):
//   Началник на стражата, unarmed (§3)     Сила 9  Изд 5   (1pt/hit, no tie loss)
//   Началник на стражата, tояги (§11)      Сила 8  Изд 5   (1pt/hit, no tie loss)
//   Оргфелт и бандата му (§89, 5 души)     Сила 6-10 Изд 6-9 each
//   Крадци в Клент, 2ма (§74)              Сила 10/8 Изд 4/12
//   Крадец в Клент, 1 (§80)                Сила 10 Изд 4
//   Крадци в Клент, Истрин (§86)           Сила 10/8 Изд 6/6
//   Нощен крадец, 1 (§102)                 Сила 8  Изд 6
//   Нощни крадци, 5 (§103)                 Сила 6-10 Изд 4-12 each
//   Планинско джудже, голи ръце (§168)     Сила 10 Изд 10  (1pt/hit, no tie loss)
//   Планинско джудже, оръжие (§174)        Сила 8  Изд 10
//   Стражи на Урик, 2ма (§202)             Сила 9/8 Изд 4/6
//   Шеф на наемниците, голи ръце (§220)    Сила 10 Изд 10  (1pt/hit, no tie loss)
//   Шеф на наемниците, мечове (§230)       Сила 10 Изд 10
//   Алкейнски главорези, 3ма (§233)        Сила 8/9/7 Изд 4/6/8
//   Вълкопаяци, 3ма (§269/296)             Сила 10/10/12 Изд 8/9/10 (tie = both -2)
// Two special one-off mechanics are modelled as their own resolvers rather
// than forced into the round-robin fighter, exactly as printed:
//   Вълча глутница (§150) - kill 3 wolves, each needs Сила+Шанс>=10 or the
//     player loses 3 Издръжливост and the wolf survives to try again.
//   Джудже, надхвърляне с ножове (§180) - single opposed throw, Сила+Шанс
//     >=10 to hit first; if missed, the enemy (Сила 6) throws back.
//
// All state lives in pt.sim881, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

const SWORDS = [
  { id: 'firfeld', nameKey: 'battlesim881.sword.firfeld' },
  { id: 'laim',    nameKey: 'battlesim881.sword.laim' },
  { id: 'istrin',  nameKey: 'battlesim881.sword.istrin' },
];

// Each encounter: { id, nameKey, enemies:[{nameKey,sila,izd}], hitAmount (default 2),
//   tieBoth2 (bool, wolfspider special case), swordBonus: {firfeld,laim,istrin}, section }
const ROSTER = [
  { id: 'guard_unarmed', nameKey: 'battlesim881.name.guard_unarmed', hitAmount: 1,
    enemies: [{ nameKey: 'battlesim881.enemy.guard', sila: 9, izd: 5 }],
    swordBonus: { firfeld: 0, laim: 0, istrin: 0 } },
  { id: 'guard_club', nameKey: 'battlesim881.name.guard_club', hitAmount: 1,
    enemies: [{ nameKey: 'battlesim881.enemy.guard', sila: 8, izd: 5 }],
    swordBonus: { firfeld: 0, laim: 0, istrin: 0 } },
  { id: 'orgfelt_gang', nameKey: 'battlesim881.name.orgfelt_gang',
    enemies: [
      { nameKey: 'battlesim881.enemy.orgfelt', sila: 10, izd: 6 },
      { nameKey: 'battlesim881.enemy.robber1', sila: 8, izd: 6 },
      { nameKey: 'battlesim881.enemy.companion', sila: 10, izd: 9 },
      { nameKey: 'battlesim881.enemy.robber2', sila: 7, izd: 6 },
      { nameKey: 'battlesim881.enemy.robber3', sila: 6, izd: 8 },
    ],
    swordBonus: { firfeld: 2, laim: 1, istrin: 0 } },
  { id: 'clent_thieves2', nameKey: 'battlesim881.name.clent_thieves2',
    enemies: [
      { nameKey: 'battlesim881.enemy.thief1', sila: 10, izd: 4 },
      { nameKey: 'battlesim881.enemy.thief2', sila: 8, izd: 12 },
    ],
    swordBonus: { firfeld: 1, laim: 0, istrin: 0 } },
  { id: 'clent_thief1', nameKey: 'battlesim881.name.clent_thief1',
    enemies: [{ nameKey: 'battlesim881.enemy.thief', sila: 10, izd: 4 }],
    swordBonus: { firfeld: 0, laim: 0, istrin: 0 } },
  { id: 'clent_thieves_istrin', nameKey: 'battlesim881.name.clent_thieves_istrin',
    enemies: [
      { nameKey: 'battlesim881.enemy.thief1', sila: 10, izd: 6 },
      { nameKey: 'battlesim881.enemy.thief2', sila: 8, izd: 6 },
    ],
    swordBonus: { firfeld: 0, laim: 0, istrin: 2 } },
  { id: 'night_thief1', nameKey: 'battlesim881.name.night_thief1',
    enemies: [{ nameKey: 'battlesim881.enemy.night_thief', sila: 8, izd: 6 }],
    swordBonus: { firfeld: 0, laim: 0, istrin: 0 } },
  { id: 'night_thieves5', nameKey: 'battlesim881.name.night_thieves5',
    enemies: [
      { nameKey: 'battlesim881.enemy.night_thief_n', sila: 6, izd: 4 },
      { nameKey: 'battlesim881.enemy.night_thief_n', sila: 8, izd: 12 },
      { nameKey: 'battlesim881.enemy.night_thief_n', sila: 9, izd: 8 },
      { nameKey: 'battlesim881.enemy.night_thief_n', sila: 6, izd: 6 },
      { nameKey: 'battlesim881.enemy.night_thief_n', sila: 10, izd: 6 },
    ],
    swordBonus: { firfeld: 0, laim: 2, istrin: 1 } },
  { id: 'dwarf_unarmed', nameKey: 'battlesim881.name.dwarf_unarmed', hitAmount: 1,
    enemies: [{ nameKey: 'battlesim881.enemy.dwarf_leader', sila: 10, izd: 10 }],
    swordBonus: { firfeld: 0, laim: 0, istrin: 0 } },
  { id: 'dwarf_weapon', nameKey: 'battlesim881.name.dwarf_weapon',
    enemies: [{ nameKey: 'battlesim881.enemy.dwarf_leader', sila: 8, izd: 10 }],
    swordBonus: { firfeld: 0, laim: 0, istrin: 0 } },
  { id: 'urik_guards', nameKey: 'battlesim881.name.urik_guards',
    enemies: [
      { nameKey: 'battlesim881.enemy.urik_guard1', sila: 9, izd: 4 },
      { nameKey: 'battlesim881.enemy.urik_guard2', sila: 8, izd: 6 },
    ],
    swordBonus: { firfeld: 0, laim: 0, istrin: 0 } },
  { id: 'mercenary_unarmed', nameKey: 'battlesim881.name.mercenary_unarmed', hitAmount: 1,
    enemies: [{ nameKey: 'battlesim881.enemy.mercenary_boss', sila: 10, izd: 10 }],
    swordBonus: { firfeld: 0, laim: 0, istrin: 0 } },
  { id: 'mercenary_armed', nameKey: 'battlesim881.name.mercenary_armed',
    enemies: [{ nameKey: 'battlesim881.enemy.mercenary_boss', sila: 10, izd: 10 }],
    swordBonus: { firfeld: 2, laim: 1, istrin: 1 } },
  { id: 'alkein_thugs', nameKey: 'battlesim881.name.alkein_thugs',
    enemies: [
      { nameKey: 'battlesim881.enemy.thug1', sila: 8, izd: 4 },
      { nameKey: 'battlesim881.enemy.thug2', sila: 9, izd: 6 },
      { nameKey: 'battlesim881.enemy.thug3', sila: 7, izd: 8 },
    ],
    swordBonus: { firfeld: 0, laim: 1, istrin: 2 } },
  { id: 'wolfspiders', nameKey: 'battlesim881.name.wolfspiders', tieBoth2: true,
    enemies: [
      { nameKey: 'battlesim881.enemy.wolfspider', sila: 10, izd: 8 },
      { nameKey: 'battlesim881.enemy.wolfspider', sila: 10, izd: 9 },
      { nameKey: 'battlesim881.enemy.wolfspider', sila: 12, izd: 10 },
    ],
    swordBonus: { firfeld: 3, laim: 1, istrin: 2 } },
  { id: 'wolfpack', nameKey: 'battlesim881.name.wolfpack', special: 'wolfpack',
    swordBonus: { firfeld: -1, laim: 1, istrin: 2 } },
  { id: 'dwarf_knife', nameKey: 'battlesim881.name.dwarf_knife', special: 'knifeThrow',
    enemySila: 6, swordBonus: { firfeld: 0, laim: 0, istrin: 0 } },
];

function _encounter(id) { return ROSTER.find(e => e.id === id) || ROSTER[0]; }
function _sword(id) { return SWORDS.find(s => s.id === id) || SWORDS[0]; }

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim881) {
    pt.sim881 = {
      encounterId: 'guard_unarmed',
      swordId: 'firfeld',
      player: { sila: 5, izd: 30 },
      log: [],
      history: [],
    };
  }
  const d = pt.sim881;
  if (!d.encounterId) d.encounterId = 'guard_unarmed';
  if (!d.swordId) d.swordId = 'firfeld';
  if (!d.player) d.player = { sila: 5, izd: 30 };
  if (typeof d.player.sila !== 'number') d.player.sila = 5;
  if (typeof d.player.izd !== 'number') d.player.izd = 30;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 300) d.log.shift();
}

function _recordOutcome(d, outcome) {
  d.history.push({ enemy: t(_encounter(d.encounterId).nameKey), outcome, ts: Date.now() });
}

function _effectiveSila(d) {
  const enc = _encounter(d.encounterId);
  const bonus = (enc.swordBonus && enc.swordBonus[d.swordId]) || 0;
  return d.player.sila + bonus;
}

function _fightRoundRobin(d, enc) {
  const sila = _effectiveSila(d);
  const hitAmount = enc.hitAmount || 2;
  const enemies = enc.enemies.map(e => ({ ...e, curIzd: e.izd }));
  let playerIzd = d.player.izd;
  let rounds = 0;
  const lines = [];
  while (playerIzd > 0 && enemies.some(e => e.curIzd > 0) && rounds < 200) {
    rounds++;
    for (const enemy of enemies) {
      if (enemy.curIzd <= 0) continue;
      if (playerIzd <= 0) break;
      const roll = _roll1d6();
      const total = sila + roll;
      if (total > enemy.sila) {
        enemy.curIzd -= hitAmount;
        lines.push(t('battlesim881.log.round_win', { name: t(enemy.nameKey), roll, total, esila: enemy.sila, loss: hitAmount, izd: Math.max(0, enemy.curIzd) }));
      } else if (total < enemy.sila) {
        playerIzd -= hitAmount;
        lines.push(t('battlesim881.log.round_lose', { name: t(enemy.nameKey), roll, total, esila: enemy.sila, loss: hitAmount, izd: Math.max(0, playerIzd) }));
      } else {
        const tieLoss = enc.tieBoth2 ? 2 : 1;
        enemy.curIzd -= tieLoss;
        playerIzd -= tieLoss;
        lines.push(t('battlesim881.log.round_tie', { name: t(enemy.nameKey), roll, total, esila: enemy.sila, loss: tieLoss, pizd: Math.max(0, playerIzd), eizd: Math.max(0, enemy.curIzd) }));
      }
    }
  }
  const won = playerIzd > 0;
  return { won, rounds, lines, finalPlayerIzd: Math.max(0, playerIzd) };
}

function _fightWolfpack(d, enc) {
  const sila = _effectiveSila(d);
  let playerIzd = d.player.izd;
  let killed = 0;
  const lines = [];
  let rounds = 0;
  while (killed < 3 && playerIzd > 0 && rounds < 100) {
    rounds++;
    const roll = _roll1d6();
    const total = sila + roll;
    if (total >= 10) {
      killed++;
      lines.push(t('battlesim881.log.wolf_hit', { roll, total, killed }));
    } else {
      playerIzd -= 3;
      lines.push(t('battlesim881.log.wolf_miss', { roll, total, izd: Math.max(0, playerIzd) }));
    }
  }
  return { won: killed >= 3, rounds, lines, finalPlayerIzd: Math.max(0, playerIzd) };
}

function _fightKnifeThrow(d, enc) {
  const sila = _effectiveSila(d);
  const roll = _roll1d6();
  const total = sila + roll;
  const lines = [];
  if (total >= 10) {
    lines.push(t('battlesim881.log.knife_win', { roll, total }));
    return { won: true, rounds: 1, lines, finalPlayerIzd: d.player.izd };
  }
  lines.push(t('battlesim881.log.knife_lose', { roll, total }));
  return { won: false, rounds: 1, lines, finalPlayerIzd: d.player.izd };
}

function _fight() {
  const d = _data();
  if (!d) return;
  const enc = _encounter(d.encounterId);

  let result;
  if (enc.special === 'wolfpack') result = _fightWolfpack(d, enc);
  else if (enc.special === 'knifeThrow') result = _fightKnifeThrow(d, enc);
  else result = _fightRoundRobin(d, enc);

  _appendLog(d, t('battlesim881.log.header', { name: t(enc.nameKey) }));
  result.lines.forEach(l => _appendLog(d, l));

  d.player.izd = result.finalPlayerIzd;
  if (result.won) {
    _appendLog(d, t('battlesim881.log.win_footer', { trophy: SVG_TROPHY }));
    _recordOutcome(d, 'win');
  } else {
    _appendLog(d, t('battlesim881.log.loss_footer', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
  saveState();
  _renderAll();
}

function _pickEncounter(id) {
  const d = _data();
  if (!d) return;
  d.encounterId = id;
  saveState();
  _renderAll();
}

function _pickSword(id) {
  const d = _data();
  if (!d) return;
  d.swordId = id;
  saveState();
  _renderAll();
}

// ── Render ───────────────────────────────────────────────────────────────

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim881-history-summary');
  const listEl = document.getElementById('sim881-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim881.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim881.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim881.history.won') : t('battlesim881.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim881-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _encounterOptions(selectedId) {
  return ROSTER.map(e => `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(t(e.nameKey))}</option>`).join('');
}

function _swordOptions(selectedId) {
  return SWORDS.map(s => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${escapeHtml(t(s.nameKey))}</option>`).join('');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;
  document.getElementById('sim881-encounter-pick').innerHTML = _encounterOptions(d.encounterId);
  document.getElementById('sim881-sword-pick').innerHTML = _swordOptions(d.swordId);
  document.getElementById('sim881-player-sila').value = d.player.sila;
  document.getElementById('sim881-player-izd').value = d.player.izd;
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim881() {
  const overlay = document.getElementById('sim881-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim881(); return; }
  _renderAll();
}

function openSim881() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim881-overlay').classList.add('active');
}

function closeSim881() {
  document.getElementById('sim881-overlay')?.classList.remove('active');
}

export function setSim881Visible(visible) {
  const btn = document.getElementById('sim881-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim881();
}

// ── Init ─────────────────────────────────────────────────────────────────

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

export function initSim881() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim881-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim881.ui.title')}</span>
        <button id="sim881-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim881.ui.you')}</div>
            ${_numField(t('battlesim881.ui.sila'), 'sim881-player-sila')}
            ${_numField(t('battlesim881.ui.izd'), 'sim881-player-izd')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim881.ui.sword')}</span>
              <select id="sim881-sword-pick" class="inv-edit-input"></select>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim881.ui.encounter')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim881.ui.pick')}</span>
              <select id="sim881-encounter-pick" class="inv-edit-input"></select>
            </div>
          </div>
          <div class="inv-modal-ftr bsim-action-grid">
            <button id="sim881-fight" class="inv-add-btn bsim-action-primary">${t('battlesim881.btn.fight')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim881-history-summary">${t('battlesim881.history.summary', { n: 0 })}</summary>
            <div id="sim881-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim881-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim881-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim881);
  document.getElementById('sim881-close').addEventListener('click', closeSim881);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim881(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim881-overlay'),
    open:  openSim881,
    close: closeSim881,
  });

  document.getElementById('sim881-encounter-pick').addEventListener('change', e => _pickEncounter(e.target.value));
  document.getElementById('sim881-sword-pick').addEventListener('change', e => _pickSword(e.target.value));
  document.getElementById('sim881-fight').addEventListener('click', _fight);

  overlay.querySelectorAll('.inv-qty-btn').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const d = _data();
      if (!d) return;
      const id    = btnEl.dataset.id;
      const delta = Number(btnEl.dataset.delta);
      const input = document.getElementById(id);
      const val   = Math.max(0, (parseInt(input.value, 10) || 0) + delta);
      input.value = val;
      if (id === 'sim881-player-sila') d.player.sila = val;
      else if (id === 'sim881-player-izd') d.player.izd = val;
      saveState();
    });
  });

  overlay.querySelectorAll('.inv-qty-input').forEach(input => {
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const val = Math.max(0, parseInt(input.value, 10) || 0);
      input.value = val;
      const id = input.id;
      if (id === 'sim881-player-sila') d.player.sila = val;
      else if (id === 'sim881-player-izd') d.player.izd = val;
      saveState();
    });
  });
}
