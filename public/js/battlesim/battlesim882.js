// ── Battle Simulator (Тайната на Зоро, book 882) ─────────────────────────────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 882 only) by the caller in boot.js via
// setSim882Visible().
// To remove: delete this file, remove its import line and initSim882()/
// setSim882Visible() calls from boot.js, remove 'sim882' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim882-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim882-btn selectors in
// battlesim.css.
//
// This book (a Zorro adventure) has THREE distinct combat systems, all
// spelled out on the book's own "Провеждане на схватка" rules page (see
// book_frontmatter.rules_text for book_id=882):
//
//   РЪКОПАШНА СХВАТКА (hand-to-hand): each exchange, roll 1d6 for both
//   sides and add to their own Ръкопашен бой; higher total lands the hit.
//   That SAME roll is then added to the winner's Сила and the loser's
//   Издръжливост is subtracted from it; the result comes off the loser's
//   Живот. Multiple enemies are fought round-robin, one exchange each.
//
//   СХВАТКА С ШПАГИ (group sword fight): identical structure to hand-to-
//   hand, but the hit-roll uses Фехтовка instead of Ръкопашен бой, and
//   damage uses Сръчност + Бързина + Сила of the winner minus the loser's
//   Издръжливост.
//
//   ДУЕЛ (formal 1v1 duel): the fighter with the higher Финт (ties broken
//   by Шанс) strikes first. Each attacker's "series" is normally 3 hits -
//   two using the higher of Пронизващ удар/Сечащ удар, one using the lower
//   - after which the defender gets their own series. Each hit's strength
//   is (relevant skill + a fresh 1d6); the difference between that and the
//   defender's Блок comes off their Живот. The gap between the two
//   fighters' Трикове scores gives the trailing fighter's series-
//   interruption count for the whole duel (their series is cut to a single
//   hit that many times, instead of the full three).
//
// Player starts with Живот 50, and assigns the five Лични качества (Сила/
// Бързина/Сръчност/Издръжливост/Страст) plus five Умения (Фехтовка/
// Боравене с камшик/Езда/Ръкопашен бой/Стрелба) at character creation, all
// editable here as a convenience rather than tied to one of the book's five
// pregenerated heroes (Хосе Валдес/Диего Понсела/Мигел Тимонеда/Антонио
// Мартинес/Емилио Варгас), since the reader may have picked any of them or
// grown their stats through the book's training questline by the time they
// reach a given fight.
//
// Full roster of genuine stat-based fights, verified via a complete
// 350-section prose read this session (representative/duplicate group
// fights consolidated - e.g. the identical 6-sailor brawl recurs at
// sections 12/21/38 and is listed once):
//   Розарио Инсибил (§24)                 hand-to-hand, 1 opponent
//   Шестима моряци (§12/21/38)            hand-to-hand, 6 opponents
//   Четирима моряци (§221)                hand-to-hand, 4 opponents
//   Войник на Рафаел Идалго (§133/159)    hand-to-hand, 1 opponent
//   Лола Лоса (§329)                      hand-to-hand, 1 opponent
//   Матео и бандата му (§43)              hand-to-hand, 10 opponents
//   Трима разбойници с ножове (§160)      hand-to-hand, 3 opponents (+3 weapon bonus baked into their stats)
//   Четирима войници до Фуентес (§178)    group sword fight
//   Дванадесет войника на Ромеро (§196)   group sword fight
//   Осем войника в Пуебло Ангулар (§104/342) group sword fight
//   Четирима войника до портата (§286)    group sword fight
//   Близнаците Морсиля (§186)             group sword fight, 2 opponents
//   Капитан Армандо Ромеро (§105/297)     formal duel
//   Дон Луис де Муерто (§187/212)         formal duel
//   Виторио Галдос, от седлото (§339)     formal duel
//   Виторио Галдос, на земята (§198)      formal duel
// The final confrontation with Don Luis (§200/338) offers a pure quick-draw
// pistol-duel alternative resolved by a single stat-vs-threshold roll, not
// a real multi-round fight, so it is not part of the sim roster - same
// treatment as the book's many other one-shot Шанс-vs-threshold checks
// throughout (climbing a rope, sneaking past a lock, etc.), none of which
// qualify as "combat" under this app's standing rule.
//
// All state lives in pt.sim882, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

const ROSTER = [
  { id: 'rosario', nameKey: 'battlesim882.name.rosario', type: 'rukopashna',
    enemies: [{ nameKey: 'battlesim882.enemy.rosario', zhivot: 24, rb: 3, sila: 5, izdr: 5 }] },
  { id: 'sailors6', nameKey: 'battlesim882.name.sailors6', type: 'rukopashna',
    enemies: [
      { nameKey: 'battlesim882.enemy.sailor1', zhivot: 10, rb: 3, sila: 2, izdr: 3 },
      { nameKey: 'battlesim882.enemy.sailor2', zhivot: 8,  rb: 2, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.sailor3', zhivot: 8,  rb: 3, sila: 2, izdr: 3 },
      { nameKey: 'battlesim882.enemy.sailor4', zhivot: 7,  rb: 1, sila: 4, izdr: 4 },
      { nameKey: 'battlesim882.enemy.sailor5', zhivot: 7,  rb: 2, sila: 3, izdr: 4 },
      { nameKey: 'battlesim882.enemy.sailor6', zhivot: 6,  rb: 3, sila: 2, izdr: 5 },
    ] },
  { id: 'sailors4', nameKey: 'battlesim882.name.sailors4', type: 'rukopashna',
    enemies: [
      { nameKey: 'battlesim882.enemy.sailor1', zhivot: 10, rb: 2, sila: 4, izdr: 3 },
      { nameKey: 'battlesim882.enemy.sailor2', zhivot: 8,  rb: 3, sila: 2, izdr: 3 },
      { nameKey: 'battlesim882.enemy.sailor3', zhivot: 8,  rb: 2, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.sailor4', zhivot: 7,  rb: 1, sila: 3, izdr: 4 },
    ] },
  { id: 'idalgo_soldier', nameKey: 'battlesim882.name.idalgo_soldier', type: 'rukopashna',
    enemies: [{ nameKey: 'battlesim882.enemy.idalgo_soldier', zhivot: 25, rb: 2, sila: 2, izdr: 3 }] },
  { id: 'lola', nameKey: 'battlesim882.name.lola', type: 'rukopashna',
    enemies: [{ nameKey: 'battlesim882.enemy.lola', zhivot: 12, rb: 4, sila: 2, izdr: 1 }] },
  { id: 'bandits3_knife', nameKey: 'battlesim882.name.bandits3_knife', type: 'rukopashna', extraHitBonus: 3,
    enemies: [
      { nameKey: 'battlesim882.enemy.bandit1', zhivot: 9,  rb: 3, sila: 3, izdr: 2 },
      { nameKey: 'battlesim882.enemy.bandit2', zhivot: 11, rb: 2, sila: 2, izdr: 3 },
      { nameKey: 'battlesim882.enemy.bandit3', zhivot: 10, rb: 3, sila: 2, izdr: 2 },
    ] },
  { id: 'mateo_gang', nameKey: 'battlesim882.name.mateo_gang', type: 'rukopashna',
    enemies: [
      { nameKey: 'battlesim882.enemy.mateo', zhivot: 18, rb: 3, sila: 4, izdr: 3 },
      { nameKey: 'battlesim882.enemy.robber1', zhivot: 15, rb: 3, sila: 3, izdr: 4 },
      { nameKey: 'battlesim882.enemy.robber2', zhivot: 10, rb: 2, sila: 4, izdr: 3 },
      { nameKey: 'battlesim882.enemy.robber3', zhivot: 9,  rb: 2, sila: 2, izdr: 2 },
      { nameKey: 'battlesim882.enemy.robber4', zhivot: 8,  rb: 2, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.robber5', zhivot: 11, rb: 3, sila: 2, izdr: 2 },
      { nameKey: 'battlesim882.enemy.robber6', zhivot: 12, rb: 2, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.robber7', zhivot: 9,  rb: 2, sila: 3, izdr: 2 },
      { nameKey: 'battlesim882.enemy.robber8', zhivot: 10, rb: 2, sila: 3, izdr: 4 },
      { nameKey: 'battlesim882.enemy.robber9', zhivot: 4,  rb: 1, sila: 1, izdr: 1 },
      { nameKey: 'battlesim882.enemy.robber10', zhivot: 8,  rb: 2, sila: 4, izdr: 3 },
    ] },
  { id: 'fuentes_4', nameKey: 'battlesim882.name.fuentes_4', type: 'shpagi',
    enemies: [
      { nameKey: 'battlesim882.enemy.soldier1', zhivot: 15, fehtovka: 3, barzina: 2, srachnost: 3, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier2', zhivot: 14, fehtovka: 2, barzina: 2, srachnost: 2, sila: 2, izdr: 1 },
      { nameKey: 'battlesim882.enemy.soldier3', zhivot: 18, fehtovka: 3, barzina: 4, srachnost: 1, sila: 2, izdr: 2 },
      { nameKey: 'battlesim882.enemy.soldier4', zhivot: 16, fehtovka: 1, barzina: 2, srachnost: 2, sila: 2, izdr: 2 },
    ] },
  { id: 'romero_12', nameKey: 'battlesim882.name.romero_12', type: 'shpagi',
    enemies: [
      { nameKey: 'battlesim882.enemy.soldier1', zhivot: 15, fehtovka: 3, barzina: 2, srachnost: 2, sila: 3, izdr: 4 },
      { nameKey: 'battlesim882.enemy.soldier2', zhivot: 12, fehtovka: 2, barzina: 3, srachnost: 2, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier3', zhivot: 11, fehtovka: 3, barzina: 2, srachnost: 3, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier4', zhivot: 10, fehtovka: 2, barzina: 4, srachnost: 2, sila: 4, izdr: 2 },
      { nameKey: 'battlesim882.enemy.soldier5', zhivot: 5,  fehtovka: 2, barzina: 2, srachnost: 2, sila: 2, izdr: 2 },
      { nameKey: 'battlesim882.enemy.soldier6', zhivot: 4,  fehtovka: 2, barzina: 3, srachnost: 3, sila: 2, izdr: 2 },
      { nameKey: 'battlesim882.enemy.soldier7', zhivot: 8,  fehtovka: 3, barzina: 1, srachnost: 2, sila: 2, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier8', zhivot: 10, fehtovka: 2, barzina: 2, srachnost: 3, sila: 3, izdr: 1 },
      { nameKey: 'battlesim882.enemy.soldier9', zhivot: 12, fehtovka: 2, barzina: 2, srachnost: 3, sila: 2, izdr: 1 },
      { nameKey: 'battlesim882.enemy.soldier10', zhivot: 15, fehtovka: 3, barzina: 3, srachnost: 4, sila: 2, izdr: 2 },
      { nameKey: 'battlesim882.enemy.soldier11', zhivot: 14, fehtovka: 3, barzina: 2, srachnost: 2, sila: 1, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier12', zhivot: 13, fehtovka: 4, barzina: 4, srachnost: 4, sila: 3, izdr: 5 },
    ] },
  { id: 'angular_8', nameKey: 'battlesim882.name.angular_8', type: 'shpagi',
    enemies: [
      { nameKey: 'battlesim882.enemy.soldier1', zhivot: 15, fehtovka: 3, barzina: 2, srachnost: 2, sila: 3, izdr: 4 },
      { nameKey: 'battlesim882.enemy.soldier2', zhivot: 12, fehtovka: 2, barzina: 3, srachnost: 2, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier3', zhivot: 11, fehtovka: 3, barzina: 2, srachnost: 3, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier4', zhivot: 10, fehtovka: 2, barzina: 4, srachnost: 2, sila: 4, izdr: 2 },
      { nameKey: 'battlesim882.enemy.soldier5', zhivot: 5,  fehtovka: 2, barzina: 2, srachnost: 2, sila: 2, izdr: 2 },
      { nameKey: 'battlesim882.enemy.soldier6', zhivot: 4,  fehtovka: 2, barzina: 3, srachnost: 3, sila: 2, izdr: 2 },
      { nameKey: 'battlesim882.enemy.soldier7', zhivot: 8,  fehtovka: 3, barzina: 1, srachnost: 2, sila: 2, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier8', zhivot: 10, fehtovka: 2, barzina: 2, srachnost: 3, sila: 3, izdr: 1 },
    ] },
  { id: 'gate_4', nameKey: 'battlesim882.name.gate_4', type: 'shpagi',
    enemies: [
      { nameKey: 'battlesim882.enemy.soldier1', zhivot: 15, fehtovka: 3, barzina: 2, srachnost: 2, sila: 3, izdr: 4 },
      { nameKey: 'battlesim882.enemy.soldier2', zhivot: 12, fehtovka: 2, barzina: 3, srachnost: 2, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier3', zhivot: 11, fehtovka: 3, barzina: 2, srachnost: 3, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier4', zhivot: 10, fehtovka: 2, barzina: 4, srachnost: 2, sila: 4, izdr: 2 },
    ] },
  { id: 'morsilya_twins', nameKey: 'battlesim882.name.morsilya_twins', type: 'shpagi',
    enemies: [
      { nameKey: 'battlesim882.enemy.edwardo', zhivot: 25, fehtovka: 5, barzina: 5, srachnost: 5, sila: 4, izdr: 5 },
      { nameKey: 'battlesim882.enemy.enrike',  zhivot: 25, fehtovka: 5, barzina: 5, srachnost: 5, sila: 4, izdr: 5 },
    ] },
  { id: 'romero_duel', nameKey: 'battlesim882.name.romero_duel', type: 'duel',
    enemy: { nameKey: 'battlesim882.enemy.romero', zhivot: 28, pronizvasht: 5, sechasht: 4, blok: 3, fint: 4, trikove: 4 } },
  { id: 'muerto_duel', nameKey: 'battlesim882.name.muerto_duel', type: 'duel',
    enemy: { nameKey: 'battlesim882.enemy.muerto', zhivot: 30, pronizvasht: 4, sechasht: 4, blok: 5, fint: 5, trikove: 2 } },
  { id: 'galdos_mounted', nameKey: 'battlesim882.name.galdos_mounted', type: 'duel',
    enemy: { nameKey: 'battlesim882.enemy.galdos', zhivot: 36, pronizvasht: 2, sechasht: 4, blok: 4, fint: 3, trikove: 2 } },
  { id: 'galdos_dismounted', nameKey: 'battlesim882.name.galdos_dismounted', type: 'duel',
    enemy: { nameKey: 'battlesim882.enemy.galdos', zhivot: 36, pronizvasht: 2, sechasht: 5, blok: 5, fint: 3, trikove: 2 } },
];

function _encounter(id) { return ROSTER.find(e => e.id === id) || ROSTER[0]; }

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim882) {
    pt.sim882 = {
      encounterId: 'rosario',
      player: {
        sila: 3, barzina: 3, srachnost: 3, izdr: 3, strast: 3,
        zhivot: 50, rb: 3, fehtovka: 3,
        pronizvasht: 2, sechasht: 2, blok: 1, fint: 2, trikove: 2,
      },
      log: [],
      history: [],
    };
  }
  const d = pt.sim882;
  if (!d.encounterId) d.encounterId = 'rosario';
  const defaults = { sila: 3, barzina: 3, srachnost: 3, izdr: 3, strast: 3, zhivot: 50, rb: 3, fehtovka: 3, pronizvasht: 2, sechasht: 2, blok: 1, fint: 2, trikove: 2 };
  if (!d.player) d.player = { ...defaults };
  Object.keys(defaults).forEach(k => { if (typeof d.player[k] !== 'number') d.player[k] = defaults[k]; });
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 400) d.log.shift();
}

function _recordOutcome(d, outcome) {
  d.history.push({ enemy: t(_encounter(d.encounterId).nameKey), outcome, ts: Date.now() });
}

// ── Ръкопашна схватка / Схватка с шпаги: shared round-robin resolver ───────
function _fightRoundRobin(d, enc) {
  const p = d.player;
  const extraHit = enc.extraHitBonus || 0;
  const enemies = enc.enemies.map(e => ({ ...e, curZhivot: e.zhivot }));
  let playerZhivot = p.zhivot;
  let rounds = 0;
  const lines = [];
  const isShpagi = enc.type === 'shpagi';
  const playerHitSkill = isShpagi ? p.fehtovka : p.rb;
  const playerDmgBonus = isShpagi ? (p.srachnost + p.barzina + p.sila) : p.sila;

  while (playerZhivot > 0 && enemies.some(e => e.curZhivot > 0) && rounds < 300) {
    rounds++;
    for (const enemy of enemies) {
      if (enemy.curZhivot <= 0) continue;
      if (playerZhivot <= 0) break;
      const rollP = _roll1d6(), rollE = _roll1d6();
      const enemyHitSkill = isShpagi ? enemy.fehtovka : enemy.rb;
      const hitP = rollP + playerHitSkill + extraHit;
      const hitE = rollE + enemyHitSkill;
      if (hitP > hitE) {
        const dmg = Math.max(0, (rollP + playerDmgBonus) - enemy.izdr);
        enemy.curZhivot -= dmg;
        lines.push(t('battlesim882.log.hit_win', { name: t(enemy.nameKey), dmg, izd: Math.max(0, enemy.curZhivot) }));
      } else if (hitE > hitP) {
        const enemyDmgBonus = isShpagi ? (enemy.srachnost + enemy.barzina + enemy.sila) : enemy.sila;
        const dmg = Math.max(0, (rollE + enemyDmgBonus) - p.izdr);
        playerZhivot -= dmg;
        lines.push(t('battlesim882.log.hit_lose', { name: t(enemy.nameKey), dmg, izd: Math.max(0, playerZhivot) }));
      } else {
        lines.push(t('battlesim882.log.hit_tie', { name: t(enemy.nameKey) }));
      }
    }
  }
  const won = playerZhivot > 0;
  return { won, rounds, lines, finalPlayerZhivot: Math.max(0, playerZhivot) };
}

// ── Дуел: formal 5-stat duel ────────────────────────────────────────────────
function _fightDuel(d, enc) {
  const p = d.player;
  const e = { ...enc.enemy, curZhivot: enc.enemy.zhivot };
  let playerZhivot = p.zhivot;
  const lines = [];

  let playerTurn;
  if (p.fint !== e.fint) {
    playerTurn = p.fint > e.fint;
  } else {
    playerTurn = _roll1d6() >= _roll1d6();
  }
  lines.push(t('battlesim882.log.duel_first', { who: playerTurn ? t('battlesim882.ui.you') : t(e.nameKey) }));

  let interruptsPlayer = Math.max(0, e.trikove - p.trikove);
  let interruptsEnemy  = Math.max(0, p.trikove - e.trikove);

  function series(attackerIsPlayer) {
    const atkPronizvasht = attackerIsPlayer ? p.pronizvasht : e.pronizvasht;
    const atkSechasht     = attackerIsPlayer ? p.sechasht : e.sechasht;
    const mainSkill  = Math.max(atkPronizvasht, atkSechasht);
    const weakSkill  = Math.min(atkPronizvasht, atkSechasht);
    let length = 3;
    if (attackerIsPlayer && interruptsPlayer > 0) { length = 1; interruptsPlayer--; }
    else if (!attackerIsPlayer && interruptsEnemy > 0) { length = 1; interruptsEnemy--; }
    const hits = length === 1 ? [mainSkill] : [mainSkill, mainSkill, weakSkill];
    for (const skill of hits) {
      const roll = _roll1d6();
      const strength = skill + roll;
      const defenderBlok = attackerIsPlayer ? e.blok : p.blok;
      const dmg = Math.max(0, strength - defenderBlok);
      if (attackerIsPlayer) {
        e.curZhivot -= dmg;
        lines.push(t('battlesim882.log.duel_hit', { attacker: t('battlesim882.ui.you'), defender: t(e.nameKey), dmg, izd: Math.max(0, e.curZhivot) }));
        if (e.curZhivot <= 0) return;
      } else {
        playerZhivot -= dmg;
        lines.push(t('battlesim882.log.duel_hit', { attacker: t(e.nameKey), defender: t('battlesim882.ui.you'), dmg, izd: Math.max(0, playerZhivot) }));
        if (playerZhivot <= 0) return;
      }
    }
  }

  let rounds = 0;
  while (playerZhivot > 0 && e.curZhivot > 0 && rounds < 200) {
    rounds++;
    series(playerTurn);
    if (playerZhivot <= 0 || e.curZhivot <= 0) break;
    playerTurn = !playerTurn;
  }

  const won = playerZhivot > 0 && e.curZhivot <= 0;
  return { won, rounds, lines, finalPlayerZhivot: Math.max(0, playerZhivot) };
}

function _fight() {
  const d = _data();
  if (!d) return;
  const enc = _encounter(d.encounterId);

  let result;
  if (enc.type === 'duel') result = _fightDuel(d, enc);
  else result = _fightRoundRobin(d, enc);

  _appendLog(d, t('battlesim882.log.header', { name: t(enc.nameKey) }));
  result.lines.forEach(l => _appendLog(d, l));

  d.player.zhivot = result.finalPlayerZhivot;
  if (result.won) {
    _appendLog(d, t('battlesim882.log.win_footer', { trophy: SVG_TROPHY }));
    _recordOutcome(d, 'win');
  } else {
    _appendLog(d, t('battlesim882.log.loss_footer', { skull: SVG_SKULL }));
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

// ── Render ───────────────────────────────────────────────────────────────

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim882-history-summary');
  const listEl = document.getElementById('sim882-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim882.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim882.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim882.history.won') : t('battlesim882.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim882-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _encounterOptions(selectedId) {
  return ROSTER.map(e => `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(t(e.nameKey))}</option>`).join('');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;
  document.getElementById('sim882-encounter-pick').innerHTML = _encounterOptions(d.encounterId);
  ['sila', 'barzina', 'srachnost', 'izdr', 'strast', 'zhivot', 'rb', 'fehtovka', 'pronizvasht', 'sechasht', 'blok', 'fint', 'trikove'].forEach(k => {
    const el = document.getElementById(`sim882-player-${k}`);
    if (el) el.value = d.player[k];
  });
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim882() {
  const overlay = document.getElementById('sim882-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim882(); return; }
  _renderAll();
}

function openSim882() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim882-overlay').classList.add('active');
}

function closeSim882() {
  document.getElementById('sim882-overlay')?.classList.remove('active');
}

export function setSim882Visible(visible) {
  const btn = document.getElementById('sim882-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim882();
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

export function initSim882() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim882-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim882.ui.title')}</span>
        <button id="sim882-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim882.ui.you')}</div>
            ${_numField(t('battlesim882.ui.zhivot'), 'sim882-player-zhivot')}
            ${_numField(t('battlesim882.ui.sila'), 'sim882-player-sila')}
            ${_numField(t('battlesim882.ui.barzina'), 'sim882-player-barzina')}
            ${_numField(t('battlesim882.ui.srachnost'), 'sim882-player-srachnost')}
            ${_numField(t('battlesim882.ui.izdr'), 'sim882-player-izdr')}
            ${_numField(t('battlesim882.ui.strast'), 'sim882-player-strast')}
            ${_numField(t('battlesim882.ui.rb'), 'sim882-player-rb')}
            ${_numField(t('battlesim882.ui.fehtovka'), 'sim882-player-fehtovka')}
            ${_numField(t('battlesim882.ui.pronizvasht'), 'sim882-player-pronizvasht')}
            ${_numField(t('battlesim882.ui.sechasht'), 'sim882-player-sechasht')}
            ${_numField(t('battlesim882.ui.blok'), 'sim882-player-blok')}
            ${_numField(t('battlesim882.ui.fint'), 'sim882-player-fint')}
            ${_numField(t('battlesim882.ui.trikove'), 'sim882-player-trikove')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim882.ui.encounter')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim882.ui.pick')}</span>
              <select id="sim882-encounter-pick" class="inv-edit-input"></select>
            </div>
          </div>
          <div class="inv-modal-ftr bsim-action-grid">
            <button id="sim882-fight" class="inv-add-btn bsim-action-primary">${t('battlesim882.btn.fight')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim882-history-summary">${t('battlesim882.history.summary', { n: 0 })}</summary>
            <div id="sim882-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim882-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim882-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim882);
  document.getElementById('sim882-close').addEventListener('click', closeSim882);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim882(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim882-overlay'),
    open:  openSim882,
    close: closeSim882,
  });

  document.getElementById('sim882-encounter-pick').addEventListener('change', e => _pickEncounter(e.target.value));
  document.getElementById('sim882-fight').addEventListener('click', _fight);

  const statKeys = ['sila', 'barzina', 'srachnost', 'izdr', 'strast', 'zhivot', 'rb', 'fehtovka', 'pronizvasht', 'sechasht', 'blok', 'fint', 'trikove'];
  overlay.querySelectorAll('.inv-qty-btn').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const d = _data();
      if (!d) return;
      const id    = btnEl.dataset.id;
      const delta = Number(btnEl.dataset.delta);
      const input = document.getElementById(id);
      const val   = Math.max(0, (parseInt(input.value, 10) || 0) + delta);
      input.value = val;
      const key = statKeys.find(k => id === `sim882-player-${k}`);
      if (key) d.player[key] = val;
      saveState();
    });
  });

  overlay.querySelectorAll('.inv-qty-input').forEach(input => {
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const val = Math.max(0, parseInt(input.value, 10) || 0);
      input.value = val;
      const key = statKeys.find(k => input.id === `sim882-player-${k}`);
      if (key) d.player[key] = val;
      saveState();
    });
  });
}
