// ── Battle Simulator (Тигрово око, book 869) ────────────────────────────────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 869 only) by the caller in boot.js via
// setSim869Visible().
// To remove: delete this file, remove its import line and initSim869()/
// setSim869Visible() calls from boot.js, remove 'sim869' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim869-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim869-btn selectors in
// battlesim.css.
//
// This book has genuine dice+stat combat (СИЛА/ИЗДРЪЖЛИВОСТ/БОЙНИ УМЕНИЯ/
// МАГИЯ, weapon class, magic/holy shields), but built as 7 separate named
// rivals (Далгрен, Тиндълин, Лестор, Тейбрун, Уантор, Смайтъл, Матуал),
// each with their OWN multi-branch attack-pattern formulas for a "fresh"
// round 1 and a "weakened" round 2+ - verified via a full 251-section read
// this session. No canonical player build exists (stats/gear evolve
// through the journey via markets, clan aid, magic shrines, camping rolls
// etc.), so - same precedent as books 760/772/781 - the reader types in
// their own current numbers rather than a hardcoded protagonist. The 7
// rivals' book-listed stats/gear prefill as a convenience and are fully
// editable too.
//
// FAITHFULNESS NOTES (documented simplifications, so this isn't mistaken
// for a bug later):
//  - The book routes different fight ENTRIES (challenging someone
//    directly vs. an ambush vs. re-engaging after a truce, etc.) through
//    slightly different section numbers that are mathematically the same
//    "attacker rolls, defender picks a response" exchange. This sim uses
//    one unified turn loop (opponent attacks, then you attack) rather than
//    reproducing each entry path's own section IDs - the arithmetic is
//    identical either way.
//  - A handful of "block succeeds -> now pick a THIRD follow-up move"
//    chains (e.g. §98->114/123/131, §22->53/86/90/97) are collapsed into
//    a single combined formula for that follow-up strike, since those
//    branches are near-duplicate formulas across the book (same
//    stat-comparison-plus-die shape, only the exact thresholds differ by
//    a point or two). The "избий меча" (disarm, 1-in-6 on some of these)
//    is modeled as bonus damage rather than launching the book's separate
//    unarmed-combat subgame at §100/119/126/178.
//  - Далгрен's round-2 "block+retreat/block+counter" chain (§127->155/160)
//    is collapsed to two direct top-level choices at the top-level menu.
//  - Тейбрун and Матуал are unique: instead of a formula-based round 2,
//    the book gives each a one-off NARRATIVE event once weakened
//    (Тейбрун offers a truce; Матуал fakes a collapse and stabs you if
//    you fetch him water - §174 is an instant KRAY NA IGRATA in the book).
//    Both are modeled as their real three-way choice instead of a fight
//    formula.
//  - "Zarche"/"две зарчета" (die/dice) always means summed 1-6 rolls here.
//  - The "суицидна атака" (§99) failing routes the book's own text
//    straight to §110 (a bonus hit FOR the player, oddly generous) rather
//    than a real counter-check - reproduced exactly as written since that
//    really is what the book says.
//
// All narration (button labels + resolution log lines) is routed through
// i18n (`t()`), same convention as every other battlesim module. Shared
// message SHAPES (e.g. "you lose N stamina") use one generic
// battlesim869.g.* key with params rather than duplicating near-identical
// strings per rival; rival-specific flavor text gets its own key.
//
// Full rival roster (book_id=869, verified via complete 251-section
// prose read + КОНЕ И ИМУЩЕСТВО equipment appendix):
//   Далгрен  (Ашеба no, Якранд yes) СИЛА 11 ИЗД 16 МАГИЯ 0  БУ 13  меч4 без щит
//   Тиндълин (Якранд)               СИЛА 12 ИЗД 18 МАГИЯ 3  БУ 7   меч5 магически щит
//   Матуал   (Ашеба)                СИЛА 10 ИЗД 10 МАГИЯ 5  БУ 15  меч4 свещен щит
//   Смайтъл  (Ашеба)                СИЛА 8  ИЗД 6  МАГИЯ 12 БУ 14  меч5 свещен щит
//   Уантор   (Ашеба)                СИЛА 12 ИЗД 12 МАГИЯ 3  БУ 13  меч5 свещен щит
//   Лестор   (Якранд)               СИЛА 8  ИЗД 12 МАГИЯ 0  БУ 20  меч6 без щит
//   Тейбрун  (Якранд)                СИЛА 14 ИЗД 12 МАГИЯ 2  БУ 12  меч4 без щит
//
// All state lives in pt.sim869, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const RIVALS = [
  { id: 'dalgren', nameKey: 'battlesim869.name.dalgren', s: 11, e: 16, m: 0,  b: 13, sword: 4, shield: 'none' },
  { id: 'tindalin', nameKey: 'battlesim869.name.tindalin', s: 12, e: 18, m: 3,  b: 7,  sword: 5, shield: 'magic' },
  { id: 'matual',  nameKey: 'battlesim869.name.matual', s: 10, e: 10, m: 5,  b: 15, sword: 4, shield: 'holy' },
  { id: 'smajtal', nameKey: 'battlesim869.name.smajtal', s: 8,  e: 6,  m: 12, b: 14, sword: 5, shield: 'holy' },
  { id: 'uantor',  nameKey: 'battlesim869.name.uantor', s: 12, e: 12, m: 3,  b: 13, sword: 5, shield: 'holy' },
  { id: 'lestor',  nameKey: 'battlesim869.name.lestor', s: 8,  e: 12, m: 0,  b: 20, sword: 6, shield: 'none' },
  { id: 'tejbrun', nameKey: 'battlesim869.name.tejbrun', s: 14, e: 12, m: 2,  b: 12, sword: 4, shield: 'none' },
];

function _rival(id) { return RIVALS.find(r => r.id === id) || RIVALS[0]; }
function _rivalNameById(id) { return t(_rival(id).nameKey); }

function _d6() { return 1 + Math.floor(Math.random() * 6); }
function _dN(n) { let total = 0; for (let i = 0; i < n; i++) total += _d6(); return total; }

function _shieldAbsorb(shield) { return shield === 'holy' ? 2 : shield === 'magic' ? 1 : 0; }

// ── Generic shared message helpers ──────────────────────────────────────

const gt = (key, params) => t(`battlesim869.g.${key}`, params);

// ── Entity helpers ──────────────────────────────────────────────────────
// entity = { s, e, m, b, sword, shield, startE, startB, lostE, skillLossExtra }

function _freshEntity(base) {
  return {
    s: base.s, e: base.e, m: base.m, b: base.b, sword: base.sword, shield: base.shield,
    startE: base.e, startB: base.b, lostE: 0, skillLossExtra: 0,
  };
}

function _recompute(ent) {
  ent.b = Math.max(0, ent.startB - Math.floor(ent.lostE / 3) - ent.skillLossExtra);
}

function _loseE(ent, amt) {
  amt = Math.max(0, Math.round(amt));
  ent.lostE += amt;
  ent.e = Math.max(0, ent.startE - ent.lostE);
  _recompute(ent);
  return amt;
}

function _loseB(ent, amt) {
  amt = Math.max(0, Math.round(amt));
  ent.skillLossExtra += amt;
  _recompute(ent);
  return amt;
}

function _magicExchange(attacker, defender) {
  // Returns net stamina loss to defender from attacker's magic points,
  // after the defender's shield + own magic reflect it. Used by the
  // "std+magic" family of player attacks and several rivals' magic
  // counters, per the book's repeated wording.
  const absorb = _shieldAbsorb(defender.shield) + defender.m;
  const leak = Math.max(0, attacker.m - absorb);
  return leak * 3;
}

function _kill(ent) { ent.e = 0; }

// ── Rival round-1 (fresh) attack option builders ────────────────────────
// Each returns an array of { label, run(player, opp) => logline }.
// "player" always means "you" (the reader), "opp" the rival.

function _dalgrenR1(player, opp) {
  return [
    { label: t('battlesim869.d1.opt1'), run: () => {
      const dmg = _dN(2);
      _loseE(player, dmg);
      return t('battlesim869.d1.msg1', { dmg });
    }},
    { label: t('battlesim869.d1.opt2'), run: () => {
      const dmg = _dN(2);
      _loseE(player, dmg);
      return t('battlesim869.d1.msg2', { dmg });
    }},
    { label: t('battlesim869.d1.opt3'), run: () => {
      if (player.b > opp.b) { const d = 1; _loseE(opp, d); return t('battlesim869.d1.msg3_win', { d }); }
      const d = 1; _loseE(player, d); return gt('lose_e', { d });
    }},
    { label: t('battlesim869.d1.opt4'), run: () => {
      let msg = t('battlesim869.d1.msg4_open');
      _loseE(opp, 1);
      const diff = (player.e + player.b) - (opp.e + opp.b);
      if (diff > 0) { _loseE(opp, diff); msg += t('battlesim869.d1.msg4_counter_win', { diff }); }
      else { const d = Math.floor(Math.abs(diff) / 2); _loseE(player, d); msg += gt('blocked_hurt', { d }); }
      return msg;
    }},
  ];
}

function _dalgrenR2(player, opp) {
  if (opp.e >= 5) {
    return [
      { label: t('battlesim869.d2.opt1'), run: () => _dalgrenBlockOnly(player, opp) },
      { label: t('battlesim869.d2.opt2'), run: () => {
        if (player.m < 2) return gt('no_magic_n', { n: 2 }) + ' ' + _dalgrenBlockOnly(player, opp);
        const spend = player.m;
        _loseE(opp, spend * 3); _loseB(opp, spend * 2);
        const base = _dalgrenBlockOnly(player, opp);
        return t('battlesim869.d2.msg2', { spend, d: spend * 3, d2: spend * 2 }) + ' ' + base;
      }},
      { label: t('battlesim869.d2.opt3'), run: () => {
        if (player.sword < 4) return gt('no_sword_n', { n: 4 }) + ' ' + _dalgrenBlockOnly(player, opp);
        const tempB = player.b + Math.max(0, (player.sword - 2) * 2);
        const base = _dalgrenBlockOnly(player, opp);
        if (tempB >= opp.b - 2) {
          const diff = Math.abs((player.s + player.e) - (opp.s + opp.e));
          _loseE(opp, diff);
          return base + ' ' + t('battlesim869.d2.msg3_win', { diff });
        }
        return base + ' ' + gt('counter_fail');
      }},
    ];
  }
  return [
    { label: t('battlesim869.d2b.opt1'), run: () => {
      const diff = player.b - opp.b;
      if (diff >= 3) return gt('block_perfect');
      const d = Math.abs(diff); _loseE(player, d);
      return gt('block_fail', { d });
    }},
    { label: t('battlesim869.d2b.opt2'), run: () => {
      const diff = player.b - opp.b;
      if (diff >= 3) {
        if ((player.s + player.e) > (opp.s + opp.e)) { _kill(opp); return t('battlesim869.d2b.msg2_kill'); }
        return gt('counter_fail_blocked');
      }
      const d = Math.abs(diff); _loseE(player, d);
      return gt('block_fail', { d });
    }},
    { label: t('battlesim869.d2b.opt3'), run: () => {
      if (player.m < 1) return gt('no_magic');
      const spend = player.m;
      _loseE(opp, spend * 3);
      return t('battlesim869.d2b.msg3', { d: spend * 3 });
    }},
  ];
}
function _dalgrenBlockOnly(player, opp) {
  const diff = (player.s + player.e) - (opp.s + opp.e);
  if (diff >= 6) return gt('block_perfect');
  if (diff >= 0) { const d = 6 - diff; _loseE(player, d); return gt('block_effort', { d }); }
  const d = Math.max(0, opp.b - player.b); _loseE(player, d);
  return t('battlesim869.d1.opp_stronger', { d });
}

function _tindalinR1(player, opp) {
  const magicNote = () => {
    if (player.shield === 'none') { _loseE(player, 1); return gt('no_magic_shield') + ' '; }
    return '';
  };
  const blockCheck = () => {
    const diff = player.b - opp.b;
    if (diff >= 3) return gt('block_good') + ' ';
    const d = Math.abs(diff); _loseE(player, d);
    return gt('block_fail', { d }) + ' ';
  };
  return [
    { label: t('battlesim869.t1.opt1'), run: () => {
      let msg = magicNote() + blockCheck();
      const diff = player.s - opp.s;
      if (diff > 0) { _loseE(opp, diff); msg += t('battlesim869.t1.msg1_win', { diff }); }
      else { const d = Math.abs(diff); _loseE(player, d); msg += t('battlesim869.t1.msg1_lose', { d }); }
      return msg;
    }},
    { label: t('battlesim869.t1.opt2'), run: () => {
      let msg = magicNote() + blockCheck();
      const d = 2; _loseE(player, d);
      msg += t('battlesim869.t1.msg2', { d });
      return msg;
    }},
    { label: t('battlesim869.t1.opt3'), run: () => {
      let msg = magicNote() + blockCheck();
      if (player.m >= 2) { const diff = player.b - opp.b; if (diff > 0) { _loseE(opp, diff); msg += t('battlesim869.t1.msg3_win', { diff }); return msg; } }
      const d = 2; _loseE(player, d); msg += t('battlesim869.t1.msg3_lose', { d });
      return msg;
    }},
    { label: t('battlesim869.t1.opt4'), run: () => {
      let msg = magicNote();
      const diff = player.b - opp.b;
      if (diff > 0) { const d = 3; _loseE(opp, d); msg += t('battlesim869.t1.msg4_win', { d }); }
      else { const d = Math.abs(diff); _loseE(player, d); msg += t('battlesim869.t1.msg4_lose', { d }); }
      return msg;
    }},
  ];
}

function _tindalinR2Real(player, opp) {
  return [
    { label: t('battlesim869.t2.opt1'), run: () => {
      const d = _dN(2); _loseE(player, d);
      return t('battlesim869.t2.msg1', { d });
    }},
    { label: t('battlesim869.t2.opt2'), run: () => {
      const d = _dN(2); _loseE(player, d);
      let msg = gt('lose_e', { d }) + ' ';
      if (player.e > opp.e) { const d2 = 1; _loseE(opp, d2); msg += t('battlesim869.t2.msg2_win', { d: d2 }); }
      else msg += gt('counter_fail');
      return msg;
    }},
    { label: t('battlesim869.t2.opt3'), run: () => {
      if (opp.e < 5) { _kill(opp); return t('battlesim869.t2.msg3_kill'); }
      const roll = player.b + _d6();
      if (roll >= opp.b + 4) return gt('block_good_full');
      const d = Math.abs(roll - (opp.b + 4)); _loseE(player, d);
      return gt('block_fail', { d });
    }},
  ];
}

function _uantorR1(player, opp) {
  return [
    { label: t('battlesim869.u1.opt1'), run: () => {
      const diff = (player.b + player.e) - opp.b;
      if (diff >= 0) return gt('block_good_full');
      const d = Math.abs(diff) <= 6 ? _d6() : _dN(2);
      _loseE(player, d);
      return gt('block_fail', { d });
    }},
    { label: t('battlesim869.u1.opt2'), run: () => {
      const diff = (player.b + player.e) - opp.b;
      if (diff < 0) { const d = _dN(2); _loseE(player, d); return gt('block_fail', { d }); }
      if (player.sword >= 3 && player.e >= 5) { const d = _dN(2); _loseE(opp, d); return t('battlesim869.u1.msg2_win', { d }); }
      return gt('block_ok_no_gear');
    }},
    { label: t('battlesim869.u1.opt3'), run: () => {
      const d = _dN(2);
      _loseE(player, d); _loseB(player, 4);
      let msg = t('battlesim869.u1.msg3', { d }) + ' ';
      if ((player.e + player.b) < opp.b) { const d2 = _d6(); _loseE(player, d2); msg += t('battlesim869.u1.msg3_extra', { d: d2 }); }
      return msg;
    }},
    { label: t('battlesim869.u1.opt4'), run: () => {
      const diff = (player.b) - opp.b;
      let msg = '';
      if (diff < 0) { const d = _d6(); _loseE(player, d); msg += gt('lose_e', { d }) + ' '; }
      if (player.m < opp.m) { const d = _d6(); _loseE(player, d); msg += gt('lose_e_more', { d }); return msg; }
      const extra = player.m - opp.m - 1;
      if (extra > 0) { _loseE(opp, extra * 4); msg += t('battlesim869.u1.msg4_win', { d: extra * 4 }); }
      else msg += t('battlesim869.u1.msg4_absorbed');
      return msg;
    }},
  ];
}

function _uantorR2(player, opp) {
  return [
    { label: t('battlesim869.u2.opt1'), run: () => {
      const diff = (player.s + player.e + player.b) - (opp.s + opp.e + opp.b) - 8;
      if (diff >= 0) return gt('block_perfect_full');
      if (diff >= -8) { const d = Math.abs(diff); _loseE(player, d); _loseB(player, Math.floor(d / 2)); return gt('lose_e', { d }); }
      const d = _dN(2); _loseE(player, d); _loseB(player, 1); return t('battlesim869.u2.msg1_hard', { d });
    }},
    { label: t('battlesim869.u2.opt2'), run: () => {
      const diff = (player.b + player.e) - opp.b;
      if (diff < 0) { const d = _dN(2); _loseE(player, d); return gt('block_fail', { d }); }
      return gt('block_good_combo');
    }},
    { label: t('battlesim869.u2.opt3'), run: () => {
      const d = _dN(2); _loseE(player, d); _loseB(player, 1);
      return t('battlesim869.u2.msg3', { d });
    }},
    { label: t('battlesim869.u2.opt4'), run: () => {
      if (player.m <= opp.m) return gt('no_magic_vs');
      return gt('magic_attempt');
    }},
  ];
}

function _smajtalR1(player, opp) {
  return [
    { label: t('battlesim869.s1.opt1'), run: () => {
      if (player.m < 3) return gt('no_magic_n', { n: 3 });
      const leak = _magicExchange(opp, player);
      if (leak > 0) { _loseE(player, leak); return t('battlesim869.s1.msg1_leak', { d: leak }); }
      return gt('magic_reflected_full');
    }},
    { label: t('battlesim869.s1.opt2'), run: () => {
      const diff = (player.e + player.b) - opp.b;
      if (diff > 0) { const d = diff * 2; _loseE(opp, d); return t('battlesim869.s1.msg2_win', { d }); }
      return gt('counter_fail');
    }},
    { label: t('battlesim869.s1.opt3'), run: () => {
      const leak = _magicExchange(opp, player);
      let msg = leak > 0 ? gt('magic_leak', { d: leak }) + ' ' : gt('magic_no_effect') + ' ';
      if (player.b >= opp.b && player.sword >= 3 && player.e >= 5) {
        const roll = _d6();
        if (roll <= 2) { const d1 = 3, d2 = 4; _loseE(opp, d1); _loseB(opp, d2); msg += t('battlesim869.s1.msg3_wound', { d1, d2 }); }
        else if (roll <= 4) msg += gt('strike_fails');
        else msg += gt('disarm');
      } else { const d = _d6(); _loseE(player, d); msg += gt('blocked_shoulder', { d }); }
      return msg;
    }},
  ];
}

function _smajtalR2(player, opp) {
  return [
    { label: t('battlesim869.s2.opt1'), run: () => {
      let msg = '';
      if (player.e + player.b < opp.e + opp.b) { const d = _d6(); _loseE(player, d); _loseB(player, 2); msg += gt('lose_e_b', { d, d2: 2 }) + ' '; }
      const leak = _magicExchange(opp, player);
      if (leak > 0) { _loseE(player, leak); msg += t('battlesim869.s2.msg1_leak', { d: leak }); } else msg += gt('magic_reflected');
      return msg;
    }},
    { label: t('battlesim869.s2.opt2'), run: () => {
      let msg = '';
      if (player.e + player.b < opp.e + opp.b) { const d = _d6(); _loseE(player, d); msg += gt('lose_e', { d }) + ' '; }
      const leak = _magicExchange(opp, player);
      if (leak > 0) { _loseE(player, leak); _loseB(player, Math.floor(leak / 2)); msg += t('battlesim869.s2.msg2_leak', { d: leak }) + ' '; }
      const d = _dN(2); _loseE(opp, d); _loseB(opp, 1); msg += t('battlesim869.s2.msg2_win', { d });
      return msg;
    }},
    { label: t('battlesim869.s2.opt3'), run: () => {
      let msg = '';
      if (player.e + player.b < opp.e + opp.b) { const d = _d6(); _loseE(player, d); msg += gt('lose_e', { d }) + ' '; }
      msg += gt('counter_blocked_neutral');
      return msg;
    }},
    { label: t('battlesim869.s2.opt4'), run: () => {
      let msg = '';
      if (player.e + player.b < opp.e + opp.b) { const d = _d6(); _loseE(player, d); msg += gt('lose_e', { d }) + ' '; }
      if (player.m > opp.m) { const d = (player.m - opp.m) * 4; const d2 = (player.m - opp.m) * 2; _loseE(opp, d); _loseB(opp, d2); msg += t('battlesim869.s2.msg4_win', { d, d2 }); }
      else { const d = (opp.m - player.m) * 4; const d2 = (opp.m - player.m) * 2; _loseE(player, d); _loseB(player, d2); msg += t('battlesim869.s2.msg4_lose', { d, d2 }); }
      return msg;
    }},
  ];
}

function _lestorR1(player, opp) {
  const guard = () => {
    const diff = (player.s + player.e) - opp.s - opp.e;
    if (diff >= 6) return { ok: true, msg: '' };
    const d = Math.abs(6 - diff); _loseE(player, d);
    return { ok: false, msg: gt('lose_e', { d }) + ' ' };
  };
  return [
    { label: t('battlesim869.l1.opt1'), run: () => { const g = guard(); return g.msg || gt('no_loss_full'); } },
    { label: t('battlesim869.l1.opt2'), run: () => {
      if (player.m < 2) return gt('no_magic');
      const spend = player.m; _loseE(opp, spend * 3); _loseB(opp, spend * 2);
      const g = guard();
      return g.msg + t('battlesim869.l1.msg2', { d: spend * 3, d2: spend * 2 });
    }},
    { label: t('battlesim869.l1.opt3'), run: () => {
      if (player.sword < 4) return gt('no_sword_n', { n: 4 });
      const tempB = player.b + (player.sword - 2) * 2;
      if (tempB >= opp.b - 2) { const d = Math.abs((player.s + player.e) - (opp.s + opp.e)); _loseE(opp, d); return t('battlesim869.l1.msg3_win', { d }); }
      return gt('counter_fail');
    }},
  ];
}

function _lestorR2(player, opp) {
  return [
    { label: t('battlesim869.l2.opt1'), run: () => {
      const diff = player.b - opp.b;
      if (diff >= 0) return gt('block_good_full');
      const d = Math.abs(diff); _loseE(player, d); return gt('lose_e', { d });
    }},
    { label: t('battlesim869.l2.opt2'), run: () => {
      let msg = '';
      const diff = player.b - opp.b;
      if (diff < 0) { const d = Math.abs(diff); _loseE(player, d); msg += gt('lose_e', { d }) + ' '; }
      if (player.sword >= 3 && player.b >= opp.b) {
        if (opp.e <= 6) { _kill(opp); return msg + t('battlesim869.l2.msg2_kill'); }
        return msg + gt('counter_fail_partial');
      }
      return msg + gt('no_gear_for_counter');
    }},
  ];
}

function _tejbrunR1(player, opp) {
  const guard = () => {
    const diff = (player.b + player.e) - opp.b;
    if (diff >= 0) return { ok: true, msg: '' };
    const d = Math.abs(diff); _loseE(player, d);
    return { ok: false, msg: gt('lose_e', { d }) + ' ' };
  };
  return [
    { label: t('battlesim869.tb1.opt1'), run: () => { const g = guard(); return g.msg || gt('block_good_full'); } },
    { label: t('battlesim869.tb1.opt2'), run: () => {
      const g = guard();
      if (player.sword >= 3 && player.b >= opp.b) { const d = _d6(); _loseE(opp, d); return g.msg + t('battlesim869.tb1.msg2_win', { d }); }
      const d = _d6(); _loseE(player, d); return g.msg + t('battlesim869.tb1.msg2_lose', { d });
    }},
    { label: t('battlesim869.tb1.opt3'), run: () => {
      const g = guard();
      if (player.m > opp.m) { const d = (player.m - opp.m) * 4; const d2 = (player.m - opp.m) * 2; _loseE(opp, d); _loseB(opp, d2); return g.msg + t('battlesim869.tb1.msg3_win', { d, d2 }); }
      const d = (opp.m - player.m) * 4; const d2 = (opp.m - player.m) * 2; _loseE(player, d); _loseB(player, d2); return g.msg + t('battlesim869.tb1.msg3_lose', { d, d2 });
    }},
    { label: t('battlesim869.tb1.opt4'), run: () => {
      const gDiff = (player.s + player.e) - opp.s - opp.e;
      let msg = '';
      if (gDiff < 0) { const d = Math.abs(gDiff); _loseE(player, d); msg += gt('lose_e', { d }) + ' '; }
      const tempB = player.b + Math.max(0, (player.sword - 2) * 2);
      if (tempB - opp.b >= 2) { const d = _d6(); _loseE(opp, d); msg += t('battlesim869.tb1.msg4_win', { d }); }
      else { const d = 1; _loseE(player, d); msg += t('battlesim869.tb1.msg4_lose', { d }); }
      return msg;
    }},
  ];
}

function _matualR1(player, opp) {
  const guard = () => {
    const diff = (player.b + player.e) - opp.b;
    if (diff >= 0) return { ok: true, msg: '' };
    const d = Math.abs(diff) * 2; _loseE(player, d);
    return { ok: false, msg: t('battlesim869.mt1.guard_fail', { d }) + ' ' };
  };
  return [
    { label: t('battlesim869.mt1.opt1'), run: () => {
      const g = guard();
      const diff = player.s - opp.s;
      if (diff > 0) { _loseE(opp, diff); return g.msg + t('battlesim869.mt1.msg1_win', { diff }); }
      const d = Math.abs(diff); _loseE(player, d); return g.msg + t('battlesim869.mt1.msg1_lose', { d });
    }},
    { label: t('battlesim869.mt1.opt2'), run: () => {
      const g = guard();
      if (player.b > opp.b) { const d = (player.b - opp.b) * 3; _loseE(opp, d); return g.msg + t('battlesim869.mt1.msg2_win', { d }); }
      const d = opp.b - player.b; _loseE(player, d); return g.msg + t('battlesim869.mt1.msg2_lose', { d });
    }},
    { label: t('battlesim869.mt1.opt3'), run: () => {
      const g = guard();
      if (player.s <= opp.s) { const d = _d6(); _loseE(player, d); return g.msg + t('battlesim869.mt1.msg3_pierced', { d }); }
      if (player.m < 2) return g.msg + gt('no_magic_n', { n: 2 });
      const extra = player.m - 2;
      if (extra > 0) { const d = extra * 4; _loseE(opp, d); return g.msg + t('battlesim869.mt1.msg3_win', { d }); }
      return g.msg + t('battlesim869.mt1.msg3_absorbed');
    }},
  ];
}

const ROUND1 = { dalgren: _dalgrenR1, tindalin: _tindalinR1, uantor: _uantorR1, smajtal: _smajtalR1, lestor: _lestorR1, tejbrun: _tejbrunR1, matual: _matualR1 };
const ROUND2 = { dalgren: _dalgrenR2, tindalin: _tindalinR2Real, uantor: _uantorR2, smajtal: _smajtalR2, lestor: _lestorR2 };
const SPECIAL2 = ['tejbrun', 'matual'];

// ── Player attack menu (shared across all rivals) ───────────────────────

function _contraCheck(player, opp) {
  const roll = opp.b + _d6();
  if (roll >= player.b + 4) {
    // Opponent counter-attacks - you must defend.
    const defenses = [
      { label: t('battlesim869.def.opt1'), run: () => {
        if (player.b > opp.b) { const d = (player.b - opp.b) + _d6(); _loseE(opp, d); return t('battlesim869.def.msg1_win', { d }); }
        const d = (opp.b - player.b) + _d6(); _loseE(player, d); return gt('lose_e_from_counter', { d });
      }},
      { label: t('battlesim869.def.opt2'), run: () => {
        if ((player.e + player.b + _d6()) >= 22) return gt('block_good_counter');
        const d = Math.abs(opp.b - player.b); _loseE(player, d); return gt('lose_e', { d });
      }},
      { label: t('battlesim869.def.opt3'), run: () => {
        if ((player.e + player.b + _d6()) < 22) { const d = Math.abs(opp.b - player.b); _loseE(player, d); return gt('lose_e', { d }); }
        if (player.b > opp.b && (player.e >= opp.e + 5 || player.m >= 1)) { const d = (player.b - opp.b) + _d6(); _loseE(opp, d); return t('battlesim869.def.msg3_win', { d }); }
        return gt('block_good_followup_blocked');
      }},
    ];
    return { needsDefense: true, defenses };
  }
  const d = _dN(2); const d2 = _d6();
  _loseE(opp, d); _loseB(opp, d2);
  return { needsDefense: false, msg: t('battlesim869.contra.bonus_hit', { d, d2 }) };
}

function _playerAttackOptions(player, opp, allowDirty) {
  const opts = [
    { id: 'std', label: t('battlesim869.p.std'), run: () => {
      const diffBE = (player.b + player.e) - (opp.b + opp.e);
      const diffSE = (player.s + player.e) - (opp.s + opp.e);
      if (diffBE > 0 || diffSE > 0) {
        const diff = Math.max(diffBE, diffSE); const d = diff + _d6();
        _loseE(opp, d); _loseB(opp, _d6());
        return t('battlesim869.p.std_win', { d });
      }
      return gt('opp_blocks');
    }},
    { id: 'feint', label: t('battlesim869.p.feint'), run: () => {
      if ((opp.s + opp.b) / 2 <= 10) {
        const d = _dN(2); _loseE(opp, d); _loseB(opp, _d6());
        return t('battlesim869.p.feint_win', { d });
      }
      if (opp.b >= player.b + 2) { const d = opp.b - player.b; _loseE(player, d); return t('battlesim869.p.feint_hurt', { d }); }
      return gt('opp_blocks_no_hurt');
    }},
    { id: 'combo', label: t('battlesim869.p.combo'), run: () => {
      if ((player.s + player.e + player.b) < 30) { const d = _dN(2); _loseE(player, d); return t('battlesim869.p.combo_fail', { d }); }
      const diffEB = (player.e + player.b) - (opp.e + opp.b);
      if (diffEB >= 0) { const d = _d6() + diffEB * 2; _loseE(opp, d); _loseB(opp, diffEB); return t('battlesim869.p.combo_win', { d }); }
      return gt('combo_nothing');
    }},
    { id: 'stdmagic', label: t('battlesim869.p.stdmagic'), run: () => {
      let msg = '';
      const diffBE = (player.b + player.e) - (opp.b + opp.e);
      const diffSE = (player.s + player.e) - (opp.s + opp.e);
      if (diffBE > 0 || diffSE > 0) { const d = Math.max(diffBE, diffSE) + _d6(); _loseE(opp, d); msg += t('battlesim869.p.stdmagic_sword_win', { d }) + ' '; }
      else msg += gt('sword_blocked') + ' ';
      if (player.m > opp.m) { const d = (player.m - opp.m) * 3; _loseE(opp, d); msg += t('battlesim869.p.stdmagic_magic_win', { d }); }
      else if (opp.m > player.m) { const d = (opp.m - player.m) * 3; _loseE(player, d); msg += t('battlesim869.p.stdmagic_magic_lose', { d }); }
      return msg;
    }},
    { id: 'feintmagic', label: t('battlesim869.p.feintmagic'), run: () => {
      let msg = ''; let magicWon = false;
      if (player.m > opp.m) { const d = (player.m - opp.m) * 3; _loseE(opp, d); magicWon = true; msg += t('battlesim869.p.feintmagic_magic_win', { d }) + ' '; }
      if ((opp.s + opp.b) / 2 <= 10) { const d = _dN(2); _loseE(opp, d); msg += t('battlesim869.p.feintmagic_feint_win', { d }) + ' '; }
      else if (!magicWon) {
        if (opp.m >= player.m) { const d = (opp.m - player.m) * 3; if (d > 0) { _loseE(player, d); msg += t('battlesim869.p.feintmagic_magic_lose', { d }) + ' '; } }
        if (opp.b >= player.b + 2) { const d = opp.b - player.b; _loseE(player, d); msg += t('battlesim869.p.feintmagic_blocked_hurt', { d }); }
        else msg += gt('opp_blocks_no_hurt');
      } else msg += gt('magic_shielded_from_fail');
      return msg;
    }},
    { id: 'dirty', label: t('battlesim869.p.dirty'), hidden: !allowDirty, run: () => {
      let msg = '';
      if (player.b >= opp.b) { const d = _d6(); _loseE(opp, d); msg += t('battlesim869.p.dirty_distract', { d }) + ' '; }
      if ((player.s + player.e) < 15) { const d = 5; _loseE(player, d); msg += t('battlesim869.p.dirty_fail', { d }); return msg; }
      const oppRoll = opp.b + _d6();
      if (oppRoll >= 20) { const d = _d6(); _loseE(opp, d); msg += t('battlesim869.p.dirty_blocked', { d }); return msg; }
      const d = _dN(2); _loseE(opp, d); _loseB(opp, 1);
      msg += t('battlesim869.p.dirty_win', { d });
      return msg;
    }},
    { id: 'suicide', label: t('battlesim869.p.suicide'), run: () => {
      if (!(player.b >= opp.b && player.e >= opp.e + 3)) {
        const d = _dN(2); _loseE(opp, d); _loseB(opp, _d6());
        return t('battlesim869.p.suicide_unqualified', { d });
      }
      const spend = Math.max(1, player.e - 1);
      _loseE(player, spend);
      const d = spend * 2;
      if (d >= opp.e) { _kill(opp); return t('battlesim869.p.suicide_kill'); }
      _loseE(opp, d);
      return t('battlesim869.p.suicide_partial', { d });
    }},
  ];
  return opts.filter(o => !o.hidden);
}

// ── Simulation state ─────────────────────────────────────────────────────

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim869) {
    pt.sim869 = { rivalId: 'dalgren', player: null, opp: null, phase: 1, turn: 'opp', pendingDefense: null, special: null, over: false, winner: null, started: false, log: [], history: [] };
  }
  const d = pt.sim869;
  if (!d.rivalId) d.rivalId = 'dalgren';
  if (!d.player) d.player = _freshEntity({ s: 12, e: 15, m: 2, b: 12, sword: 3, shield: 'none' });
  if (!d.opp) d.opp = _freshEntity(_rival(d.rivalId));
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  if (!d.phase) d.phase = 1;
  if (!d.turn) d.turn = 'opp';
  if (d.over === undefined) d.over = false;
  if (d.started === undefined) d.started = false;
  return d;
}

function _appendLog(d, line) { d.log.push(line); if (d.log.length > 300) d.log.shift(); }
function _rivalName(d) { return _rivalNameById(d.rivalId); }
function _playerDead(d) { return d.player.e <= 0; }
function _oppDead(d) { return d.opp.e <= 0; }

function _recordOutcome(d, outcome) { d.history.push({ enemyId: d.rivalId, outcome, ts: Date.now() }); }

function _checkEnd(d) {
  if (_oppDead(d)) {
    d.over = true; d.winner = 'player';
    _appendLog(d, t('battlesim869.log.defeated', { trophy: SVG_TROPHY, name: _rivalName(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  if (_playerDead(d)) {
    d.over = true; d.winner = 'opp';
    _appendLog(d, t('battlesim869.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _startBattle() {
  const d = _data();
  if (!d) return;
  d.opp = _freshEntity(_rival(d.rivalId));
  d.phase = 1;
  d.turn = 'opp';
  d.pendingDefense = null;
  d.special = null;
  d.over = false;
  d.winner = null;
  d.started = true;
  if (d.log.length) _appendLog(d, t('battlesim869.log.reset_sep'));
  _appendLog(d, t('battlesim869.log.start', { name: _rivalName(d) }));
  saveState();
  _renderAll();
}

function _oppOptions(d) {
  const player = d.player, opp = d.opp;
  if (d.phase === 1) return ROUND1[d.rivalId](player, opp);
  if (SPECIAL2.includes(d.rivalId)) return null; // handled by special narrative UI
  return ROUND2[d.rivalId](player, opp);
}

function _pickOppOption(idx) {
  const d = _data();
  if (!d || d.over) return;
  if (d.phase === 2 && SPECIAL2.includes(d.rivalId)) { _pickSpecial(idx); return; }
  const opts = _oppOptions(d);
  const opt = opts[idx];
  if (!opt) return;
  const line = opt.run();
  _appendLog(d, t('battlesim869.log.line_opp', { name: _rivalName(d), label: opt.label, line }));
  if (_checkEnd(d)) { saveState(); _renderAll(); return; }
  d.turn = 'player';
  saveState();
  _renderAll();
}

function _pickSpecial(idx) {
  const d = _data();
  const opp = d.opp, player = d.player;
  if (d.rivalId === 'tejbrun') {
    if (idx === 0) {
      d.over = true; d.winner = 'truce';
      _appendLog(d, t('battlesim869.log.truce'));
      _recordOutcome(d, 'truce');
    } else {
      _kill(opp);
      _appendLog(d, t('battlesim869.log.tejbrun_kill'));
      _checkEnd(d);
    }
  } else if (d.rivalId === 'matual') {
    if (idx === 0) {
      _kill(player);
      _appendLog(d, t('battlesim869.log.matual_water'));
      _checkEnd(d);
    } else if (idx === 1) {
      _kill(opp);
      _appendLog(d, t('battlesim869.log.matual_attack'));
      _checkEnd(d);
    } else {
      d.over = true; d.winner = 'player';
      _appendLog(d, t('battlesim869.log.matual_sword'));
      _recordOutcome(d, 'win');
    }
  }
  saveState();
  _renderAll();
}

function _pickPlayerOption(idx) {
  const d = _data();
  if (!d || d.over || d.turn !== 'player') return;
  const player = d.player, opp = d.opp;
  const allowDirty = d.phase === 1;
  const opts = _playerAttackOptions(player, opp, allowDirty);
  const opt = opts[idx];
  if (!opt) return;
  const line = opt.run();
  _appendLog(d, t('battlesim869.log.line_player', { label: opt.label, line }));
  if (_checkEnd(d)) { saveState(); _renderAll(); return; }
  if (opt.id === 'suicide') {
    // §99 routes failure straight to the bonus-hit branch, no contra-check.
    d.phase = 2; d.turn = 'opp';
    saveState(); _renderAll();
    return;
  }
  const contra = _contraCheck(player, opp);
  if (contra.needsDefense) {
    d.pendingDefense = true;
    saveState(); _renderAll();
    return;
  }
  _appendLog(d, contra.msg);
  if (_checkEnd(d)) { saveState(); _renderAll(); return; }
  d.phase = 2;
  d.turn = 'opp';
  saveState();
  _renderAll();
}

function _pickCounterDefense(idx) {
  const d = _data();
  if (!d || d.over || !d.pendingDefense) return;
  const player = d.player, opp = d.opp;
  const contra = _contraCheck(player, opp); // rebuild same list (stateless)
  const def = contra.defenses[idx];
  if (!def) return;
  const line = def.run();
  _appendLog(d, t('battlesim869.log.line_defense', { label: def.label, line }));
  d.pendingDefense = false;
  if (_checkEnd(d)) { saveState(); _renderAll(); return; }
  d.phase = 2;
  d.turn = 'opp';
  saveState();
  _renderAll();
}

function _pickRival(id) {
  const d = _data();
  if (!d) return;
  d.rivalId = id;
  _startBattle();
}

// ── Render ───────────────────────────────────────────────────────────────

function _shieldLabel(shield) {
  return shield === 'holy' ? t('battlesim869.shield.holy') : shield === 'magic' ? t('battlesim869.shield.magic') : t('battlesim869.shield.none');
}

function _statLine(ent) {
  return t('battlesim869.stat_line', {
    s: ent.s, e: Math.max(0, ent.e), m: ent.m, b: Math.max(0, ent.b),
    sword: ent.sword, shield: _shieldLabel(ent.shield),
  });
}

function _renderStatus() {
  const d = _data();
  const el = document.getElementById('sim869-status');
  if (!d || !el) return;
  if (d.over) {
    if (d.winner === 'player') el.innerHTML = t('battlesim869.status.victory', { trophy: SVG_TROPHY });
    else if (d.winner === 'truce') el.innerHTML = t('battlesim869.status.truce');
    else el.innerHTML = t('battlesim869.status.fallen', { skull: SVG_SKULL });
  } else {
    el.innerHTML = '';
  }
  document.getElementById('sim869-player-stats').textContent = _statLine(d.player);
  document.getElementById('sim869-opp-stats').textContent = _statLine(d.opp);
  document.getElementById('sim869-opp-name').textContent = _rivalName(d);
}

function _renderActions() {
  const d = _data();
  const el = document.getElementById('sim869-actions');
  if (!d || !el) return;
  if (d.over || !d.started) { el.innerHTML = ''; return; }

  if (d.pendingDefense) {
    const contra = _contraCheck(d.player, d.opp);
    el.innerHTML = `<div class="bsim-turn-label">${t('battlesim869.turn.defend')}</div>` +
      contra.defenses.map((o, i) => `<button class="inv-add-btn bsim-action-primary sim869-opt" data-kind="counter" data-idx="${i}">${escapeHtml(o.label)}</button>`).join('');
    return;
  }

  if (d.turn === 'opp') {
    if (d.phase === 2 && SPECIAL2.includes(d.rivalId)) {
      const labels = d.rivalId === 'tejbrun'
        ? [t('battlesim869.tejbrun.truce'), t('battlesim869.tejbrun.attack')]
        : [t('battlesim869.matual.water'), t('battlesim869.matual.attack'), t('battlesim869.matual.sword')];
      el.innerHTML = `<div class="bsim-turn-label">${t('battlesim869.turn.special', { name: _rivalName(d) })}</div>` +
        labels.map((l, i) => `<button class="inv-add-btn bsim-action-primary sim869-opt" data-kind="opp" data-idx="${i}">${escapeHtml(l)}</button>`).join('');
      return;
    }
    const opts = _oppOptions(d);
    el.innerHTML = `<div class="bsim-turn-label">${t('battlesim869.turn.opp', { name: _rivalName(d) })}</div>` +
      opts.map((o, i) => `<button class="inv-add-btn bsim-action-primary sim869-opt" data-kind="opp" data-idx="${i}">${escapeHtml(o.label)}</button>`).join('');
    return;
  }

  const opts = _playerAttackOptions(d.player, d.opp, d.phase === 1);
  el.innerHTML = `<div class="bsim-turn-label">${t('battlesim869.turn.player')}</div>` +
    opts.map((o, i) => `<button class="inv-add-btn bsim-action-primary sim869-opt" data-kind="player" data-idx="${i}">${escapeHtml(o.label)}</button>`).join('');
}

function _renderHistory() {
  const d = _data();
  const sumEl = document.getElementById('sim869-history-summary');
  const listEl = document.getElementById('sim869-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim869.history.summary', { n: d.history.length });
  if (!d.history.length) { listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim869.history.empty')}</div>`; return; }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon = h.outcome === 'win' ? SVG_TROPHY : h.outcome === 'truce' ? '🤝' : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim869.history.won') : h.outcome === 'truce' ? t('battlesim869.history.truced') : t('battlesim869.history.lost');
    const date = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const enemyName = _rivalNameById(h.enemyId);
    return `<div class="bsim-history-row"><span>${icon} ${t('battlesim869.history.you')} ${t('battlesim869.history.vs')} ${escapeHtml(enemyName)} - ${result}</span><span class="bsim-history-meta">${date}</span></div>`;
  }).join('');
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim869-log');
  if (!el || !d) return;
  el.innerHTML = d.log.filter(Boolean).slice().reverse().join('<br>');
}

function _rivalOptionsHtml(selectedId) {
  return RIVALS.map(r => `<option value="${r.id}" ${r.id === selectedId ? 'selected' : ''}>${escapeHtml(t(r.nameKey))}</option>`).join('');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;
  document.getElementById('sim869-rival-pick').innerHTML = _rivalOptionsHtml(d.rivalId);

  document.getElementById('sim869-player-s').value = d.player.s;
  document.getElementById('sim869-player-e').value = d.player.startE;
  document.getElementById('sim869-player-m').value = d.player.m;
  document.getElementById('sim869-player-b').value = d.player.startB;
  document.getElementById('sim869-player-sword').value = d.player.sword;
  document.getElementById('sim869-player-shield').value = d.player.shield;

  document.getElementById('sim869-opp-e').value = d.opp.startE;
  document.getElementById('sim869-opp-b').value = d.opp.startB;
  document.getElementById('sim869-opp-m').value = d.opp.m;
  document.getElementById('sim869-opp-s').value = d.opp.s;
  document.getElementById('sim869-opp-sword').value = d.opp.sword;
  document.getElementById('sim869-opp-shield').value = d.opp.shield;

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderActions();
  _renderLog();
  _renderHistory();
}

export function renderSim869() {
  const overlay = document.getElementById('sim869-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim869(); return; }
  _renderAll();
}

function openSim869() {
  if (!_data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  _renderAll();
  document.getElementById('sim869-overlay').classList.add('active');
}

function closeSim869() { document.getElementById('sim869-overlay')?.classList.remove('active'); }

export function setSim869Visible(visible) {
  const btn = document.getElementById('sim869-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim869();
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

function _shieldField(label, id) {
  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <select id="${id}" class="inv-edit-input">
        <option value="none">${t('battlesim869.shield.none')}</option>
        <option value="magic">${t('battlesim869.shield.magic')}</option>
        <option value="holy">${t('battlesim869.shield.holy')}</option>
      </select>
    </div>`;
}

export function initSim869() {
  const overlay = document.createElement('div');
  overlay.id = 'sim869-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim869.ui.title')}</span>
        <button id="sim869-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim869.ui.you')}</div>
            ${_numField(t('battlesim869.ui.strength'), 'sim869-player-s')}
            ${_numField(t('battlesim869.ui.stamina'), 'sim869-player-e')}
            ${_numField(t('battlesim869.ui.magic'), 'sim869-player-m')}
            ${_numField(t('battlesim869.ui.skill'), 'sim869-player-b')}
            ${_numField(t('battlesim869.ui.sword'), 'sim869-player-sword')}
            ${_shieldField(t('battlesim869.ui.shield'), 'sim869-player-shield')}
            <div id="sim869-player-stats" class="bsim-stat-summary"></div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title" id="sim869-opp-name">${t('battlesim869.ui.rival')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim869.ui.pick')}</span>
              <select id="sim869-rival-pick" class="inv-edit-input"></select>
            </div>
            ${_numField(t('battlesim869.ui.strength'), 'sim869-opp-s')}
            ${_numField(t('battlesim869.ui.stamina'), 'sim869-opp-e')}
            ${_numField(t('battlesim869.ui.magic'), 'sim869-opp-m')}
            ${_numField(t('battlesim869.ui.skill'), 'sim869-opp-b')}
            ${_numField(t('battlesim869.ui.sword'), 'sim869-opp-sword')}
            ${_shieldField(t('battlesim869.ui.shield'), 'sim869-opp-shield')}
            <div id="sim869-opp-stats" class="bsim-stat-summary"></div>
          </div>
          <div id="sim869-status" class="bsim-status"></div>
          <div id="sim869-actions" class="bsim-action-grid"></div>
          <div class="inv-modal-ftr">
            <button id="sim869-start" class="inv-add-btn">${t('battlesim869.btn.start')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim869-history-summary">${t('battlesim869.history.summary', { n: 0 })}</summary>
            <div id="sim869-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim869-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id = 'sim869-btn';
  btn.innerHTML = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim869);
  document.getElementById('sim869-close').addEventListener('click', closeSim869);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim869(); });
  registerPanelShortcut('KeyS', {
    getButton: () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim869-overlay'),
    open: openSim869,
    close: closeSim869,
  });

  document.getElementById('sim869-rival-pick').addEventListener('change', e => _pickRival(e.target.value));
  document.getElementById('sim869-start').addEventListener('click', _startBattle);

  overlay.addEventListener('click', e => {
    const optBtn = e.target.closest('.sim869-opt');
    if (!optBtn) return;
    const kind = optBtn.dataset.kind;
    const idx = Number(optBtn.dataset.idx);
    if (kind === 'opp') _pickOppOption(idx);
    else if (kind === 'player') _pickPlayerOption(idx);
    else if (kind === 'counter') _pickCounterDefense(idx);
  });

  const fieldMap = {
    'sim869-player-s': (d, v) => { d.player.s = v; },
    'sim869-player-e': (d, v) => { d.player.e = v; d.player.startE = v; d.player.lostE = 0; },
    'sim869-player-m': (d, v) => { d.player.m = v; },
    'sim869-player-b': (d, v) => { d.player.b = v; d.player.startB = v; d.player.skillLossExtra = 0; d.player.lostE = 0; },
    'sim869-player-sword': (d, v) => { d.player.sword = v; },
    'sim869-opp-s': (d, v) => { d.opp.s = v; },
    'sim869-opp-e': (d, v) => { d.opp.e = v; d.opp.startE = v; d.opp.lostE = 0; },
    'sim869-opp-m': (d, v) => { d.opp.m = v; },
    'sim869-opp-b': (d, v) => { d.opp.b = v; d.opp.startB = v; d.opp.skillLossExtra = 0; d.opp.lostE = 0; },
    'sim869-opp-sword': (d, v) => { d.opp.sword = v; },
  };

  overlay.querySelectorAll('.inv-qty-btn').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const d = _data();
      if (!d) return;
      const id = btnEl.dataset.id;
      const delta = Number(btnEl.dataset.delta);
      const input = document.getElementById(id);
      const val = Math.max(0, (parseInt(input.value, 10) || 0) + delta);
      input.value = val;
      if (fieldMap[id]) fieldMap[id](d, val);
      saveState();
      _renderStatus();
    });
  });

  overlay.querySelectorAll('.inv-qty-input').forEach(input => {
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const val = Math.max(0, parseInt(input.value, 10) || 0);
      input.value = val;
      if (fieldMap[input.id]) fieldMap[input.id](d, val);
      saveState();
      _renderStatus();
    });
  });

  document.getElementById('sim869-player-shield').addEventListener('change', e => { const d = _data(); if (d) { d.player.shield = e.target.value; saveState(); } });
  document.getElementById('sim869-opp-shield').addEventListener('change', e => { const d = _data(); if (d) { d.opp.shield = e.target.value; saveState(); } });
}
