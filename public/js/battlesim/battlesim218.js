// ── Battle Simulator (Robot Commando, book 218) ──────────────────────────────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 218 only) by the caller in boot.js via
// setSim218Visible().
// To remove: delete this file, remove its import line and initSim218()/
// setSim218Visible() calls from boot.js, remove 'sim218' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK core (same numbers/Test Your
// Luck table as every other FF sim in this app: SKILL 1d6+6, STAMINA
// 2d6+12, LUCK 1d6+6), PLUS this book's own second combat mode: "Robot
// Combat", used whenever you're piloting a robot against a foe with SKILL/
// ARMOUR/SPEED instead of SKILL/STAMINA. A mode toggle (Personal/Robot)
// switches which life pool is active (STAMINA vs a separate ARMOUR pool)
// and turns on two robot-only terms: SPEED comparison (+1 Attack Strength
// to whichever side's robot is faster - Slow/Medium/Fast/VeryFast, no bonus
// on a tie) and a free-form Combat Bonus field (the piloted robot's own
// listed bonus, entered by hand since which robot you're using changes
// throughout the book and there's no dedicated "robot garage" UI here).
// ARMOUR isn't a single persistent pool the way STAMINA is - each robot you
// pilot has its own ARMOUR score - so armourInitial is a plain editable
// field the player resets by hand whenever the story puts them in a
// different robot, same free-form-entry precedent as attackModifier.
//
// attackModifier/enemyWoundDamage/winAfterHits are the same generic knobs
// every FF sim in this app uses for one-off cases (e.g. this book's own
// "faster foe gets +1" is handled by the SPEED fields, but other one-off
// SKILL penalties/bonuses stated by hand in individual sections still go
// through attackModifier).
//
// pairedFight/sideEnemy (reused unchanged from books 200-216's mechanic)
// covers this book's two "choose your target, the other one just attacks
// you passively and can't be wounded back" fights: two Triceratops (§117)
// and two Tripods (§169) - both explicitly described that way in the text,
// unlike this book's other multi-enemy fights (Myrmidon pairs, 3 Giant
// Lizards, 3 street robots, 3 doctors), which are all fought one at a time
// in sequence with no paired mechanic, matching every other sim's default.
//
// Several enemies have a special ability described in the book's own text
// that isn't modeled as a dedicated toggle (Crusher's double damage,
// Battleman's +1 on a big win margin, Supertank's guaranteed 1 ARMOUR chip
// even on a losing round, Wasp Fighter's auto-win on a 4+ margin,
// Construction Robot's instant-defeat on a low enemy roll, Ankylosaurus's
// no-damage-next-turn knockdown) - apply these by hand via the log/notes,
// same "note it, handle manually" precedent as every other sim's
// book-specific exceptions.
//
// book_enemies.attack holds SKILL, .hp holds ARMOUR (robot-mode rows) or
// STAMINA (personal-mode rows), .defense holds SPEED (0=Slow, 1=Medium,
// 2=Fast, 3=VeryFast) for robot-mode rows, unused (0) for personal-mode
// rows. 41 rows read from all 400 sections; one same-name/same-stat/
// same-destination trio (Giant Lizard §232=§328) is merged into three rows
// (one per lizard, since it's a 3-enemy sequential fight, not a single
// enemy); the two paired encounters (Triceratops §117, Tripod §169) are
// kept as two separate rows each, labeled "(paired)" - pick one as the main
// enemy and manually copy the other's stats into the Side Enemy fields.
//
// All state lives in pt.sim218, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const SIDE_WOUND_DMG = 2;
const SPEED_LABELS = ['slow', 'medium', 'fast', 'veryfast'];

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim218) {
    pt.sim218 = {
      mode: 'personal',
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        armour: 0, armourInitial: 0,
        robotCombatBonus: 0, robotSpeed: 1,
        attackModifier: 0,
        enemyWoundDamage: 2,
        winAfterHits: 0,
        hitsLandedThisFight: 0,
      },
      enemy: { name: '', skill: 0, life: 0, lifeMax: 0, speed: 1 },
      pairedFight: false,
      sideEnemy: { name: '', skill: 0, lifeMax: 0 },
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim218;
  if (!d.mode) d.mode = 'personal';
  if (d.player.armour === undefined) d.player.armour = 0;
  if (d.player.armourInitial === undefined) d.player.armourInitial = 0;
  if (d.player.robotCombatBonus === undefined) d.player.robotCombatBonus = 0;
  if (d.player.robotSpeed === undefined) d.player.robotSpeed = 1;
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.enemyWoundDamage === undefined) d.player.enemyWoundDamage = 2;
  if (d.player.winAfterHits === undefined) d.player.winAfterHits = 0;
  if (d.player.hitsLandedThisFight === undefined) d.player.hitsLandedThisFight = 0;
  if (!d.enemy) d.enemy = { name: '', skill: 0, life: 0, lifeMax: 0, speed: 1 };
  if (d.enemy.speed === undefined) d.enemy.speed = 1;
  if (d.pairedFight === undefined) d.pairedFight = false;
  if (!d.sideEnemy) d.sideEnemy = { name: '', skill: 0, lifeMax: 0 };
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _notReady(d) { return !d.rolled; }
function _isRobot(d) { return d.mode === 'robot'; }

function _activeLife(d) { return _isRobot(d) ? d.player.armour : d.player.stamina; }
function _activeLifeInitial(d) { return _isRobot(d) ? d.player.armourInitial : d.player.staminaInitial; }
function _setActiveLife(d, v) { if (_isRobot(d)) d.player.armour = v; else d.player.stamina = v; }

function _roll2d6() { return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }
function _sideEnemyNameSafe(d) { return escapeHtml(d.sideEnemy.name.trim() || t('battlesim218.ui.second_attacker')); }

function _speedBonus(mySpeed, theirSpeed) { return mySpeed > theirSpeed ? 1 : 0; }

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.winAfterHits = 0;
  d.player.hitsLandedThisFight = 0;
  d.pairedFight = false;
  d.sideEnemy = { name: '', skill: 0, lifeMax: 0 };
}

// Uncapped lifetime log - the admin dashboard aggregates battle counts
// app-wide from this array, so per-user history needs to be a true lifetime
// total, not a rolling window.
function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: _enemyName(d), outcome, mode: d.mode,
    playerLife: _activeLife(d), playerLifeMax: _activeLifeInitial(d),
    ts: Date.now(),
  });
}

// ── Combat ───────────────────────────────────────────────────────────────────

function _runRound() {
  const d = _data();
  if (!d || _notReady(d) || _activeLife(d) <= 0 || d.enemy.life <= 0 || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;

  const robotMode = _isRobot(d);
  const woundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const myBonus = robotMode ? (d.player.robotCombatBonus || 0) + _speedBonus(d.player.robotSpeed, d.enemy.speed) : 0;
  const theirBonus = robotMode ? _speedBonus(d.enemy.speed, d.player.robotSpeed) : 0;

  const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0) + myBonus;
  const enemyAS  = _roll2d6() + d.enemy.skill + theirBonus;
  _appendLog(d, t('battlesim218.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));

  if (playerAS === enemyAS) {
    _appendLog(d, t('battlesim218.log.both_avoided'));
  } else if (playerAS > enemyAS) {
    d.enemy.life = Math.max(0, d.enemy.life - 2);
    d.player.hitsLandedThisFight++;
    _appendLog(d, t('battlesim218.log.you_wound', { enemy: _enemyNameSafe(d), n: 2, life: d.enemy.life, lifeMax: d.enemy.lifeMax }));
    if (d.player.winAfterHits > 0 && d.player.hitsLandedThisFight >= d.player.winAfterHits && d.enemy.life > 0) {
      d.enemy.life = 0;
      _appendLog(d, t('battlesim218.log.press_advantage'));
    }
    if (d.enemy.life > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    _setActiveLife(d, Math.max(0, _activeLife(d) - woundDmg));
    _appendLog(d, t('battlesim218.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: woundDmg, life: _activeLife(d), lifeMax: _activeLifeInitial(d) }));
    if (_activeLife(d) > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Paired side-enemy: attacks every round regardless of the main exchange's
  // outcome, can never be wounded back (per the book's own "count this as
  // though you have defended yourself" rule) - same mechanic/precedent as
  // battlesim216.js.
  if (d.pairedFight && d.sideEnemy.lifeMax > 0 && _activeLife(d) > 0) {
    const sidePlayerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0) + myBonus;
    const sideAS = _roll2d6() + d.sideEnemy.skill;
    _appendLog(d, t('battlesim218.log.side_round', { enemy: _sideEnemyNameSafe(d), playerAS: sidePlayerAS, enemyAS: sideAS }));
    if (sideAS > sidePlayerAS) {
      _setActiveLife(d, Math.max(0, _activeLife(d) - SIDE_WOUND_DMG));
      _appendLog(d, t('battlesim218.log.side_wounds', { enemy: _sideEnemyNameSafe(d), n: SIDE_WOUND_DMG, life: _activeLife(d), lifeMax: _activeLifeInitial(d) }));
      if (_activeLife(d) > 0) d.pendingLuckQueue.push({ kind: 'side-hit' });
    } else {
      _appendLog(d, t('battlesim218.log.side_fend', { enemy: _sideEnemyNameSafe(d) }));
    }
  }

  if (d.enemy.life <= 0) {
    _appendLog(d, t('battlesim218.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (_activeLife(d) <= 0) {
    _appendLog(d, t('battlesim218.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome. Same
// Lucky/Unlucky table as every other FF sim in this app.
function _testLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'player-hit') {
    if (lucky) {
      d.enemy.life = Math.max(0, d.enemy.life - 2);
      _appendLog(d, t('battlesim218.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), life: d.enemy.life, lifeMax: d.enemy.lifeMax }));
    } else {
      d.enemy.life = Math.min(d.enemy.lifeMax, d.enemy.life + 1);
      _appendLog(d, t('battlesim218.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), life: d.enemy.life, lifeMax: d.enemy.lifeMax }));
    }
    if (d.enemy.life <= 0) { _appendLog(d, t('battlesim218.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : _enemyNameSafe(d);
    if (lucky) {
      _setActiveLife(d, Math.min(_activeLifeInitial(d), _activeLife(d) + 1));
      _appendLog(d, t('battlesim218.log.luck_hit_lucky', { roll, source, life: _activeLife(d), lifeMax: _activeLifeInitial(d) }));
    } else {
      _setActiveLife(d, Math.max(0, _activeLife(d) - 1));
      _appendLog(d, t('battlesim218.log.luck_hit_unlucky', { roll, source, life: _activeLife(d), lifeMax: _activeLifeInitial(d) }));
    }
    if (_activeLife(d) <= 0) {
      _appendLog(d, t('battlesim218.log.fallen', { skull: SVG_SKULL }));
      _recordOutcome(d, 'loss');
      d.pendingLuckQueue = [];
    }
  }
  saveState();
  _renderAll();
}

function _skipLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length) return;
  d.pendingLuckQueue.shift();
  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.life = d.enemy.lifeMax;
  _setActiveLife(d, _activeLifeInitial(d));
  d.roundsThisBattle = 0;
  d.player.hitsLandedThisFight = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim218.log.reset_sep'));
  _appendLog(d, t('battlesim218.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim218-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.lifeMax > 0;
  if (notReady)                                  el.innerHTML = t('battlesim218.status.not_ready');
  else if (_activeLife(d) <= 0)                   el.innerHTML = t('battlesim218.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.life <= 0)          el.innerHTML = t('battlesim218.status.victory', { trophy: SVG_TROPHY });
  else                                             el.innerHTML = '';
  const over = notReady || _activeLife(d) <= 0 || (hasEnemy && d.enemy.life <= 0);
  document.getElementById('sim218-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim218-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim218-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim218-history-summary');
  const listEl = document.getElementById('sim218-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim218.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim218.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim218.history.won') : t('battlesim218.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const modeLabel = h.mode === 'robot' ? t('battlesim218.ui.mode_robot') : t('battlesim218.ui.mode_personal');
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${modeLabel} ${h.playerLife}/${h.playerLifeMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim218-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;
  const robotMode = _isRobot(d);

  document.getElementById('sim218-mode').value = d.mode;
  document.getElementById('sim218-robot-fields').style.display = robotMode ? '' : 'none';
  document.getElementById('sim218-stamina-row').style.display = robotMode ? 'none' : '';
  document.getElementById('sim218-armour-row').style.display = robotMode ? '' : 'none';

  document.getElementById('sim218-player-skill').value      = d.player.skill;
  document.getElementById('sim218-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim218-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim218-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim218-player-armour').value     = Math.min(d.player.armour, d.player.armourInitial);
  document.getElementById('sim218-player-armourmax').value  = d.player.armourInitial;
  document.getElementById('sim218-player-luck').value       = d.player.luck;
  document.getElementById('sim218-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim218-player-atkmod').value     = d.player.attackModifier;
  document.getElementById('sim218-player-combatbonus').value = d.player.robotCombatBonus;
  document.getElementById('sim218-player-speed').value      = String(d.player.robotSpeed);

  const rollBtn = document.getElementById('sim218-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim218.btn.rolled') : t('battlesim218.btn.roll');

  document.getElementById('sim218-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim218-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim218-enemy-life').value    = Math.min(d.enemy.life, d.enemy.lifeMax);
  document.getElementById('sim218-enemy-lifemax').value = d.enemy.lifeMax;
  document.getElementById('sim218-enemy-speed').value   = String(d.enemy.speed);
  document.getElementById('sim218-enemy-wounddmg').value = d.player.enemyWoundDamage;
  document.getElementById('sim218-enemy-winhits').value  = d.player.winAfterHits;

  document.getElementById('sim218-paired').checked = d.pairedFight;
  document.getElementById('sim218-side-pick').value = d.sideEnemy.name;
  document.getElementById('sim218-side-skill').value = d.sideEnemy.skill;
  document.getElementById('sim218-side-lifemax').value = d.sideEnemy.lifeMax;
  document.getElementById('sim218-side-fields').style.display = d.pairedFight ? '' : 'none';

  const pendingEl = document.getElementById('sim218-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim218() {
  const overlay = document.getElementById('sim218-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim218(); return; }
  _renderAll();
}

function openSim218() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim218-overlay').classList.add('active');
}

function closeSim218() {
  document.getElementById('sim218-overlay')?.classList.remove('active');
}

export function setSim218Visible(visible) {
  const btn = document.getElementById('sim218-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim218();
}

// ── Enemy autocomplete (fed by book_enemies, seeded per book_id) ───────────

let _enemyList = null;
async function _loadEnemyList() {
  if (_enemyList) return _enemyList;
  try {
    const res = await apiFetch(`/api/books/${currentBookId}/enemies`);
    _enemyList = res.ok ? await res.json() : [];
  } catch (_) {
    _enemyList = [];
  }
  return _enemyList;
}

function _setupEnemyAutocomplete(inputId, dropdownId, onSelect) {
  const input    = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  let matches   = [];
  let activeIdx = -1;

  function closeDropdown() {
    dropdown.classList.remove('open');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function render(q) {
    const list = _enemyList || [];
    const ql = q.trim().toLowerCase();
    matches = ql ? list.filter(e => e.name.toLowerCase().includes(ql)) : list;
    if (!matches.length) { closeDropdown(); return; }
    dropdown.innerHTML = matches.map((e, i) =>
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">SKILL:${e.attack ?? '?'} HP:${e.hp ?? '?'}</span></li>`
    ).join('');
    activeIdx = -1;
    dropdown.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    input.removeAttribute('aria-activedescendant');
  }

  function select(enemy) {
    if (!enemy) return;
    input.value = enemy.name;
    onSelect(enemy);
    closeDropdown();
  }

  dropdown.addEventListener('mousedown', e => {
    const li = e.target.closest('li');
    if (!li) return;
    select(matches[+li.dataset.idx]);
    e.preventDefault();
  });

  input.addEventListener('focus', async () => { input.removeAttribute('readonly'); await _loadEnemyList(); render(input.value); });
  input.addEventListener('input', async () => { await _loadEnemyList(); render(input.value); });
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

// ── Init ──────────────────────────────────────────────────────────────────────

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

function _speedOptions() {
  return SPEED_LABELS.map((key, i) => `<option value="${i}">${t('battlesim218.ui.speed_' + key)}</option>`).join('');
}

export function initSim218() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim218-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim218.ui.title')}</span>
        <button id="sim218-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim218.ui.you')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim218.ui.mode')}</span>
              <select id="sim218-mode" class="bsim-select">
                <option value="personal">${t('battlesim218.ui.mode_personal')}</option>
                <option value="robot">${t('battlesim218.ui.mode_robot')}</option>
              </select>
            </div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim218-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim218.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim218.ui.skill'), 'sim218-player-skill')}
            ${_numField(t('battlesim218.ui.skill_initial'), 'sim218-player-skillmax')}
            <div id="sim218-stamina-row">
              ${_numField(t('battlesim218.ui.stamina'), 'sim218-player-stamina')}
              ${_numField(t('battlesim218.ui.stamina_initial'), 'sim218-player-staminamax')}
            </div>
            <div id="sim218-armour-row">
              ${_numField(t('battlesim218.ui.armour'), 'sim218-player-armour')}
              ${_numField(t('battlesim218.ui.armour_initial'), 'sim218-player-armourmax')}
            </div>
            ${_numField(t('battlesim218.ui.luck'), 'sim218-player-luck')}
            ${_numField(t('battlesim218.ui.luck_initial'), 'sim218-player-luckmax')}
            ${_numField(t('battlesim218.ui.atkmod'), 'sim218-player-atkmod')}
            <div id="sim218-robot-fields">
              ${_numField(t('battlesim218.ui.combat_bonus'), 'sim218-player-combatbonus')}
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim218.ui.your_speed')}</span>
                <select id="sim218-player-speed" class="bsim-select">${_speedOptions()}</select>
              </div>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim218.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim218.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim218-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim218-enemy-pick-dropdown">
                <ul id="sim218-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim218.ui.skill'), 'sim218-enemy-skill')}
            ${_numField(t('battlesim218.ui.life'), 'sim218-enemy-life')}
            ${_numField(t('battlesim218.ui.life_max'), 'sim218-enemy-lifemax')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim218.ui.enemy_speed')}</span>
              <select id="sim218-enemy-speed" class="bsim-select">${_speedOptions()}</select>
            </div>
            ${_numField(t('battlesim218.ui.wound_dmg'), 'sim218-enemy-wounddmg')}
            ${_numField(t('battlesim218.ui.win_after_hits'), 'sim218-enemy-winhits')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim218.ui.paired')}</span>
              <input id="sim218-paired" type="checkbox">
            </div>
            <div id="sim218-side-fields">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim218.ui.side_pick')}</span>
                <input id="sim218-side-pick" class="inv-edit-input" type="text" autocomplete="off">
              </div>
              ${_numField(t('battlesim218.ui.skill'), 'sim218-side-skill')}
              ${_numField(t('battlesim218.ui.life_max'), 'sim218-side-lifemax')}
            </div>
          </div>
          <div id="sim218-status" class="bsim-status"></div>
          <div id="sim218-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim218.btn.luck_prompt')}</span>
            <button id="sim218-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim218.btn.luck_yes')}</button>
            <button id="sim218-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim218.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim218-round" class="inv-add-btn bsim-action-primary">${t('battlesim218.btn.round')}</button>
            <button id="sim218-reset" class="inv-add-btn">${t('battlesim218.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim218-history-summary">${t('battlesim218.history.summary', { n: 0 })}</summary>
            <div id="sim218-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim218-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim218-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim218);
  document.getElementById('sim218-close').addEventListener('click', closeSim218);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim218(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim218-overlay'),
    open:  openSim218,
    close: closeSim218,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim218();
  });

  document.getElementById('sim218-round').addEventListener('click', _runRound);
  document.getElementById('sim218-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim218-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim218-luck-no').addEventListener('click', _skipLuck);

  document.getElementById('sim218-mode').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.mode = e.target.value === 'robot' ? 'robot' : 'personal';
    saveState();
    _renderInputs();
  });

  document.getElementById('sim218-player-speed').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.robotSpeed = parseInt(e.target.value, 10) || 0;
    saveState();
  });
  document.getElementById('sim218-enemy-speed').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.enemy.speed = parseInt(e.target.value, 10) || 0;
    saveState();
  });

  document.getElementById('sim218-paired').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.pairedFight = e.target.checked;
    if (!d.pairedFight) d.sideEnemy = { name: '', skill: 0, lifeMax: 0 };
    saveState();
    _renderInputs();
  });
  document.getElementById('sim218-side-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim218-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = 1 + Math.floor(Math.random() * 6) + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = 1 + Math.floor(Math.random() * 6) + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim218.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim218-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim218-player-skill':       ['player', 'skill'],
    'sim218-player-skillmax':    ['player', 'skillInitial'],
    'sim218-player-stamina':     ['player', 'stamina'],
    'sim218-player-staminamax':  ['player', 'staminaInitial'],
    'sim218-player-armour':      ['player', 'armour'],
    'sim218-player-armourmax':   ['player', 'armourInitial'],
    'sim218-player-luck':        ['player', 'luck'],
    'sim218-player-luckmax':     ['player', 'luckInitial'],
    'sim218-player-atkmod':      ['player', 'attackModifier'],
    'sim218-player-combatbonus': ['player', 'robotCombatBonus'],
    'sim218-enemy-skill':        ['enemy', 'skill'],
    'sim218-enemy-life':         ['enemy', 'life'],
    'sim218-enemy-lifemax':      ['enemy', 'lifeMax'],
    'sim218-enemy-wounddmg':     ['player', 'enemyWoundDamage'],
    'sim218-enemy-winhits':      ['player', 'winAfterHits'],
    'sim218-side-skill':         ['sideEnemy', 'skill'],
    'sim218-side-lifemax':       ['sideEnemy', 'lifeMax'],
  };
  const NEGATIVE_ALLOWED = new Set(['sim218-player-atkmod', 'sim218-player-combatbonus']);
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = NEGATIVE_ALLOWED.has(id) ? Number(val) : Math.max(0, val);
    if (id === 'sim218-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim218-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim218-player-armour') val = Math.min(val, d.player.armourInitial);
    if (id === 'sim218-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim218-enemy-life') val = Math.min(val, d.enemy.lifeMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim218-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim218-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim218-player-armourmax') d.player.armour = Math.min(d.player.armour, val);
    if (id === 'sim218-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim218-enemy-lifemax') d.enemy.life = Math.min(d.enemy.life, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim218-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = NEGATIVE_ALLOWED.has(input.id);
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim218-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = NEGATIVE_ALLOWED.has(btnEl.dataset.id);
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim218-enemy-pick', 'sim218-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name = enemy.name;
    if (enemy.attack != null) d.enemy.skill = enemy.attack;
    if (enemy.hp != null)     { d.enemy.life = enemy.hp; d.enemy.lifeMax = enemy.hp; }
    if (enemy.defense != null) d.enemy.speed = enemy.defense;
    d.roundsThisBattle = 0;
    d.pendingLuckQueue = [];
    _resetEncounterKnobs(d);
    saveState();
    _renderAll();
  });
}
