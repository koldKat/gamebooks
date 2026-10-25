import { RIVAL_RULES } from './definition.js';
// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _rival(id) {
  const { RIVALS } = getContext();
 return RIVALS.find(r => r.id === id) || RIVALS[0]; }

function _rivalNameById(id) {
  const { _rival, t } = getContext();
 return t(_rival(id).nameKey); }

function _d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _dN(n) {
  const { _d6 } = getContext();
 let total = 0; for (let i = 0; i < n; i++) total += _d6(); return total; }

function _shieldAbsorb(shield) {
 return shield === 'holy' ? 2 : shield === 'magic' ? 1 : 0; }

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
  const { _recompute } = getContext();

  amt = Math.max(0, Math.round(amt));
  ent.lostE += amt;
  ent.e = Math.max(0, ent.startE - ent.lostE);
  _recompute(ent);
  return amt;
}

function _loseB(ent, amt) {
  const { _recompute } = getContext();

  amt = Math.max(0, Math.round(amt));
  ent.skillLossExtra += amt;
  _recompute(ent);
  return amt;
}

function _magicExchange(attacker, defender, multiplier = 3) {
  const { _shieldAbsorb } = getContext();

  // Return net magic damage after shield reduction and reflected magic.
  const absorb = _shieldAbsorb(defender.shield) + defender.m;
  const leak = Math.max(0, attacker.m - absorb);
  return leak * multiplier;
}

function _kill(ent) {
 ent.e = 0; }

function _dalgrenR1(player, opp) {
  const { _dN, _loseE, gt, t } = getContext();
  const rules = RIVAL_RULES.dalgren.legacy;

  return [
    { label: t('battlesim869.d1.opt1'), run: () => {
      const dmg = _dN(rules.openingDice);
      _loseE(player, dmg);
      return t('battlesim869.d1.msg1', { dmg });
    }},
    { label: t('battlesim869.d1.opt2'), run: () => {
      const dmg = _dN(rules.openingDice);
      _loseE(player, dmg);
      return t('battlesim869.d1.msg2', { dmg });
    }},
    { label: t('battlesim869.d1.opt3'), run: () => {
      if (player.b > opp.b) { const d = rules.deceptiveDamage; _loseE(opp, d); return t('battlesim869.d1.msg3_win', { d }); }
      const d = rules.deceptiveDamage; _loseE(player, d); return gt('lose_e', { d });
    }},
    { label: t('battlesim869.d1.opt4'), run: () => {
      let msg = t('battlesim869.d1.msg4_open');
      _loseE(opp, rules.openingDamage);
      const diff = (player.e + player.b) - (opp.e + opp.b);
      if (diff > 0) { _loseE(opp, diff); msg += t('battlesim869.d1.msg4_counter_win', { diff }); }
      else { const d = Math.floor(Math.abs(diff) / rules.blockedDivisor); _loseE(player, d); msg += gt('blocked_hurt', { d }); }
      return msg;
    }},
  ];
}

function _dalgrenR2(player, opp) {
  const { _dalgrenBlockOnly, _kill, _loseB, _loseE, gt, t } = getContext();
  const rules = RIVAL_RULES.dalgren.legacy;

  if (opp.e >= rules.lowEndurance) {
    return [
      { label: t('battlesim869.d2.opt1'), run: () => _dalgrenBlockOnly(player, opp) },
      { label: t('battlesim869.d2.opt2'), run: () => {
        if (player.m < rules.magicMinimum) return gt('no_magic_n', { n: rules.magicMinimum }) + ' ' + _dalgrenBlockOnly(player, opp);
        const spend = player.m;
        _loseE(opp, spend * rules.magicEndurance); _loseB(opp, spend * rules.magicSkill);
        const base = _dalgrenBlockOnly(player, opp);
        return t('battlesim869.d2.msg2', { spend, d: spend * rules.magicEndurance, d2: spend * rules.magicSkill }) + ' ' + base;
      }},
      { label: t('battlesim869.d2.opt3'), run: () => {
        if (player.sword < rules.swordMinimum) return gt('no_sword_n', { n: rules.swordMinimum }) + ' ' + _dalgrenBlockOnly(player, opp);
        const tempB = player.b + Math.max(0, (player.sword - rules.swordBase) * rules.swordMultiplier);
        const base = _dalgrenBlockOnly(player, opp);
        if (tempB >= opp.b - rules.swordMargin) {
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
      if (diff >= rules.blockMargin) return gt('block_perfect');
      const d = Math.abs(diff); _loseE(player, d);
      return gt('block_fail', { d });
    }},
    { label: t('battlesim869.d2b.opt2'), run: () => {
      const diff = player.b - opp.b;
      if (diff >= rules.blockMargin) {
        if ((player.s + player.e) > (opp.s + opp.e)) { _kill(opp); return t('battlesim869.d2b.msg2_kill'); }
        return gt('counter_fail_blocked');
      }
      const d = Math.abs(diff); _loseE(player, d);
      return gt('block_fail', { d });
    }},
    { label: t('battlesim869.d2b.opt3'), run: () => {
      if (player.m < rules.lowMagicMinimum) return gt('no_magic');
      const spend = player.m;
      _loseE(opp, spend * rules.magicEndurance);
      return t('battlesim869.d2b.msg3', { d: spend * rules.magicEndurance });
    }},
  ];
}

function _dalgrenBlockOnly(player, opp) {
  const { _loseE, gt, t } = getContext();
  const rules = RIVAL_RULES.dalgren.legacy;

  const diff = (player.s + player.e) - (opp.s + opp.e);
  if (diff >= rules.heavyGuardMargin) return gt('block_perfect');
  if (diff >= 0) { const d = rules.heavyGuardMargin - diff; _loseE(player, d); return gt('block_effort', { d }); }
  const d = Math.max(0, opp.b - player.b); _loseE(player, d);
  return t('battlesim869.d1.opp_stronger', { d });
}

function _tindalinR1(player, opp) {
  const { _loseE, gt, t } = getContext();
  const rules = RIVAL_RULES.tindalin.legacy;

  const magicNote = () => {
    if (player.shield === 'none') { _loseE(player, rules.unshieldedDamage); return gt('no_magic_shield') + ' '; }
    return '';
  };
  const blockCheck = () => {
    const diff = player.b - opp.b;
    if (diff >= rules.blockMargin) return gt('block_good') + ' ';
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
      const d = rules.failedCounterDamage; _loseE(player, d);
      msg += t('battlesim869.t1.msg2', { d });
      return msg;
    }},
    { label: t('battlesim869.t1.opt3'), run: () => {
      let msg = magicNote() + blockCheck();
      if (player.m >= rules.magicMinimum) { const diff = player.b - opp.b; if (diff > 0) { _loseE(opp, diff); msg += t('battlesim869.t1.msg3_win', { diff }); return msg; } }
      const d = rules.failedCounterDamage; _loseE(player, d); msg += t('battlesim869.t1.msg3_lose', { d });
      return msg;
    }},
    { label: t('battlesim869.t1.opt4'), run: () => {
      let msg = magicNote();
      const diff = player.b - opp.b;
      if (diff > 0) { const d = rules.successfulCounterDamage; _loseE(opp, d); msg += t('battlesim869.t1.msg4_win', { d }); }
      else { const d = Math.abs(diff); _loseE(player, d); msg += t('battlesim869.t1.msg4_lose', { d }); }
      return msg;
    }},
  ];
}

function _tindalinR2Real(player, opp) {
  const { _d6, _dN, _kill, _loseE, gt, t } = getContext();
  const rules = RIVAL_RULES.tindalin.legacy;

  return [
    { label: t('battlesim869.t2.opt1'), run: () => {
      const d = _dN(rules.openingDice); _loseE(player, d);
      return t('battlesim869.t2.msg1', { d });
    }},
    { label: t('battlesim869.t2.opt2'), run: () => {
      const d = _dN(rules.openingDice); _loseE(player, d);
      let msg = gt('lose_e', { d }) + ' ';
      if (player.e > opp.e) { const d2 = rules.laterCounterDamage; _loseE(opp, d2); msg += t('battlesim869.t2.msg2_win', { d: d2 }); }
      else msg += gt('counter_fail');
      return msg;
    }},
    { label: t('battlesim869.t2.opt3'), run: () => {
      if (opp.e < rules.lowEndurance) { _kill(opp); return t('battlesim869.t2.msg3_kill'); }
      const roll = player.b + _d6();
      if (roll >= opp.b + rules.counterMargin) return gt('block_good_full');
      const d = Math.abs(roll - (opp.b + rules.counterMargin)); _loseE(player, d);
      return gt('block_fail', { d });
    }},
  ];
}

function _uantorR1(player, opp) {
  const { _d6, _dN, _loseB, _loseE, gt, t } = getContext();
  const rules = RIVAL_RULES.uantor.legacy;

  return [
    { label: t('battlesim869.u1.opt1'), run: () => {
      const diff = (player.b + player.e) - opp.b;
      if (diff >= 0) return gt('block_good_full');
      const d = Math.abs(diff) <= rules.blockDiceThreshold ? _d6() : _dN(rules.heavyDice);
      _loseE(player, d);
      return gt('block_fail', { d });
    }},
    { label: t('battlesim869.u1.opt2'), run: () => {
      const diff = (player.b + player.e) - opp.b;
      if (diff < 0) { const d = _dN(rules.heavyDice); _loseE(player, d); return gt('block_fail', { d }); }
      if (player.sword >= rules.swordMinimum && player.e >= rules.minimumEndurance) { const d = _dN(rules.heavyDice); _loseE(opp, d); return t('battlesim869.u1.msg2_win', { d }); }
      return gt('block_ok_no_gear');
    }},
    { label: t('battlesim869.u1.opt3'), run: () => {
      const d = _dN(rules.heavyDice);
      _loseE(player, d); _loseB(player, rules.firstSkillLoss);
      let msg = t('battlesim869.u1.msg3', { d }) + ' ';
      if ((player.e + player.b) < opp.b) { const d2 = _d6(); _loseE(player, d2); msg += t('battlesim869.u1.msg3_extra', { d: d2 }); }
      return msg;
    }},
    { label: t('battlesim869.u1.opt4'), run: () => {
      const diff = (player.b) - opp.b;
      let msg = '';
      if (diff < 0) { const d = _d6(); _loseE(player, d); msg += gt('lose_e', { d }) + ' '; }
      if (player.m < opp.m) { const d = _d6(); _loseE(player, d); msg += gt('lose_e_more', { d }); return msg; }
      const extra = player.m - opp.m - rules.magicAbsorbed;
      if (extra > 0) { _loseE(opp, extra * rules.magicEndurance); msg += t('battlesim869.u1.msg4_win', { d: extra * rules.magicEndurance }); }
      else msg += t('battlesim869.u1.msg4_absorbed');
      return msg;
    }},
  ];
}

function _uantorR2(player, opp) {
  const { _dN, _loseB, _loseE, gt, t } = getContext();
  const rules = RIVAL_RULES.uantor.legacy;

  return [
    { label: t('battlesim869.u2.opt1'), run: () => {
      const diff = (player.s + player.e + player.b) - (opp.s + opp.e + opp.b) - rules.laterGuardMargin;
      if (diff >= 0) return gt('block_perfect_full');
      if (diff >= -rules.laterGuardMargin) { const d = Math.abs(diff); _loseE(player, d); _loseB(player, Math.floor(d / rules.laterSkillDivisor)); return gt('lose_e', { d }); }
      const d = _dN(rules.heavyDice); _loseE(player, d); _loseB(player, rules.laterSkillLoss); return t('battlesim869.u2.msg1_hard', { d });
    }},
    { label: t('battlesim869.u2.opt2'), run: () => {
      const diff = (player.b + player.e) - opp.b;
      if (diff < 0) { const d = _dN(rules.heavyDice); _loseE(player, d); return gt('block_fail', { d }); }
      return gt('block_good_combo');
    }},
    { label: t('battlesim869.u2.opt3'), run: () => {
      const d = _dN(rules.heavyDice); _loseE(player, d); _loseB(player, rules.laterSkillLoss);
      return t('battlesim869.u2.msg3', { d });
    }},
    { label: t('battlesim869.u2.opt4'), run: () => {
      if (player.m <= opp.m) return gt('no_magic_vs');
      return gt('magic_attempt');
    }},
  ];
}

function _smajtalR1(player, opp) {
  const { _d6, _loseB, _loseE, _magicExchange, gt, t } = getContext();
  const rules = RIVAL_RULES.smajtal.legacy;

  return [
    { label: t('battlesim869.s1.opt1'), run: () => {
      if (player.m < rules.magicMinimum) return gt('no_magic_n', { n: rules.magicMinimum });
      const leak = _magicExchange(opp, player, rules.magicMultiplier);
      if (leak > 0) { _loseE(player, leak); return t('battlesim869.s1.msg1_leak', { d: leak }); }
      return gt('magic_reflected_full');
    }},
    { label: t('battlesim869.s1.opt2'), run: () => {
      const diff = (player.e + player.b) - opp.b;
      if (diff > 0) { const d = diff * rules.counterMultiplier; _loseE(opp, d); return t('battlesim869.s1.msg2_win', { d }); }
      return gt('counter_fail');
    }},
    { label: t('battlesim869.s1.opt3'), run: () => {
      const leak = _magicExchange(opp, player, rules.magicMultiplier);
      let msg = leak > 0 ? gt('magic_leak', { d: leak }) + ' ' : gt('magic_no_effect') + ' ';
      if (player.b >= opp.b && player.sword >= rules.swordMinimum && player.e >= rules.minimumEndurance) {
        const roll = _d6();
        if (roll <= rules.woundRollMaximum) { const d1 = rules.woundDamage, d2 = rules.woundSkill; _loseE(opp, d1); _loseB(opp, d2); msg += t('battlesim869.s1.msg3_wound', { d1, d2 }); }
        else if (roll < rules.disarmMinimum) msg += gt('strike_fails');
        else msg += gt('disarm');
      } else { const d = _d6(); _loseE(player, d); msg += gt('blocked_shoulder', { d }); }
      return msg;
    }},
  ];
}

function _smajtalR2(player, opp) {
  const { _d6, _dN, _loseB, _loseE, _magicExchange, gt, t } = getContext();
  const rules = RIVAL_RULES.smajtal.legacy;

  return [
    { label: t('battlesim869.s2.opt1'), run: () => {
      let msg = '';
      if (player.e + player.b < opp.e + opp.b) { const d = _d6(); _loseE(player, d); _loseB(player, rules.firstLaterSkillLoss); msg += gt('lose_e_b', { d, d2: rules.firstLaterSkillLoss }) + ' '; }
      const leak = _magicExchange(opp, player, rules.magicMultiplier);
      if (leak > 0) { _loseE(player, leak); msg += t('battlesim869.s2.msg1_leak', { d: leak }); } else msg += gt('magic_reflected');
      return msg;
    }},
    { label: t('battlesim869.s2.opt2'), run: () => {
      let msg = '';
      if (player.e + player.b < opp.e + opp.b) { const d = _d6(); _loseE(player, d); msg += gt('lose_e', { d }) + ' '; }
      const leak = _magicExchange(opp, player, rules.magicMultiplier);
      if (leak > 0) { _loseE(player, leak); _loseB(player, Math.floor(leak / rules.laterSkillDivisor)); msg += t('battlesim869.s2.msg2_leak', { d: leak }) + ' '; }
      const d = _dN(rules.heavyDice); _loseE(opp, d); _loseB(opp, rules.laterFixedSkillLoss); msg += t('battlesim869.s2.msg2_win', { d });
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
      if (player.m > opp.m) { const d = (player.m - opp.m) * rules.magicEndurance; const d2 = (player.m - opp.m) * rules.magicSkill; _loseE(opp, d); _loseB(opp, d2); msg += t('battlesim869.s2.msg4_win', { d, d2 }); }
      else { const d = (opp.m - player.m) * rules.magicEndurance; const d2 = (opp.m - player.m) * rules.magicSkill; _loseE(player, d); _loseB(player, d2); msg += t('battlesim869.s2.msg4_lose', { d, d2 }); }
      return msg;
    }},
  ];
}

function _lestorR1(player, opp) {
  const { _loseB, _loseE, gt, t } = getContext();
  const rules = RIVAL_RULES.lestor.legacy;

  const guard = () => {
    const diff = (player.s + player.e) - opp.s - opp.e;
    if (diff >= rules.heavyGuardMargin) return { ok: true, msg: '' };
    const d = Math.abs(rules.heavyGuardMargin - diff); _loseE(player, d);
    return { ok: false, msg: gt('lose_e', { d }) + ' ' };
  };
  return [
    { label: t('battlesim869.l1.opt1'), run: () => { const g = guard(); return g.msg || gt('no_loss_full'); } },
    { label: t('battlesim869.l1.opt2'), run: () => {
      if (player.m < rules.magicMinimum) return gt('no_magic');
      const spend = player.m; _loseE(opp, spend * rules.magicEndurance); _loseB(opp, spend * rules.magicSkill);
      const g = guard();
      return g.msg + t('battlesim869.l1.msg2', { d: spend * rules.magicEndurance, d2: spend * rules.magicSkill });
    }},
    { label: t('battlesim869.l1.opt3'), run: () => {
      if (player.sword < rules.swordMinimum) return gt('no_sword_n', { n: rules.swordMinimum });
      const tempB = player.b + (player.sword - rules.swordBase) * rules.swordMultiplier;
      if (tempB >= opp.b - rules.swordMargin) { const d = Math.abs((player.s + player.e) - (opp.s + opp.e)); _loseE(opp, d); return t('battlesim869.l1.msg3_win', { d }); }
      return gt('counter_fail');
    }},
  ];
}

function _lestorR2(player, opp) {
  const { _kill, _loseE, gt, t } = getContext();
  const rules = RIVAL_RULES.lestor.legacy;

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
      if (player.sword >= rules.laterSwordMinimum && player.b >= opp.b) {
        if (opp.e <= rules.lowEndurance) { _kill(opp); return msg + t('battlesim869.l2.msg2_kill'); }
        return msg + gt('counter_fail_partial');
      }
      return msg + gt('no_gear_for_counter');
    }},
  ];
}

function _tejbrunR1(player, opp) {
  const { _d6, _loseB, _loseE, gt, t } = getContext();
  const rules = RIVAL_RULES.tejbrun.legacy;

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
      if (player.sword >= rules.swordMinimum && player.b >= opp.b) { const d = _d6(); _loseE(opp, d); return g.msg + t('battlesim869.tb1.msg2_win', { d }); }
      const d = _d6(); _loseE(player, d); return g.msg + t('battlesim869.tb1.msg2_lose', { d });
    }},
    { label: t('battlesim869.tb1.opt3'), run: () => {
      const g = guard();
      if (player.m > opp.m) { const d = (player.m - opp.m) * rules.magicEndurance; const d2 = (player.m - opp.m) * rules.magicSkill; _loseE(opp, d); _loseB(opp, d2); return g.msg + t('battlesim869.tb1.msg3_win', { d, d2 }); }
      const d = (opp.m - player.m) * rules.magicEndurance; const d2 = (opp.m - player.m) * rules.magicSkill; _loseE(player, d); _loseB(player, d2); return g.msg + t('battlesim869.tb1.msg3_lose', { d, d2 });
    }},
    { label: t('battlesim869.tb1.opt4'), run: () => {
      const gDiff = (player.s + player.e) - opp.s - opp.e;
      let msg = '';
      if (gDiff < 0) { const d = Math.abs(gDiff); _loseE(player, d); msg += gt('lose_e', { d }) + ' '; }
      const tempB = player.b + Math.max(0, (player.sword - rules.swordBase) * rules.swordMultiplier);
      if (tempB - opp.b >= rules.swordMargin) { const d = _d6(); _loseE(opp, d); msg += t('battlesim869.tb1.msg4_win', { d }); }
      else { const d = rules.failedTrickDamage; _loseE(player, d); msg += t('battlesim869.tb1.msg4_lose', { d }); }
      return msg;
    }},
  ];
}

function _matualR1(player, opp) {
  const { _d6, _loseE, gt, t } = getContext();
  const rules = RIVAL_RULES.matual.legacy;

  const guard = () => {
    const diff = (player.b + player.e) - opp.b;
    if (diff >= 0) return { ok: true, msg: '' };
    const d = Math.abs(diff) * rules.guardMultiplier; _loseE(player, d);
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
      if (player.b > opp.b) { const d = (player.b - opp.b) * rules.counterMultiplier; _loseE(opp, d); return g.msg + t('battlesim869.mt1.msg2_win', { d }); }
      const d = opp.b - player.b; _loseE(player, d); return g.msg + t('battlesim869.mt1.msg2_lose', { d });
    }},
    { label: t('battlesim869.mt1.opt3'), run: () => {
      const g = guard();
      if (player.s <= opp.s) { const d = _d6(); _loseE(player, d); return g.msg + t('battlesim869.mt1.msg3_pierced', { d }); }
      if (player.m < rules.magicMinimum) return g.msg + gt('no_magic_n', { n: rules.magicMinimum });
      const extra = player.m - rules.magicAbsorbed;
      if (extra > 0) { const d = extra * rules.magicEndurance; _loseE(opp, d); return g.msg + t('battlesim869.mt1.msg3_win', { d }); }
      return g.msg + t('battlesim869.mt1.msg3_absorbed');
    }},
  ];
}

function _counterDefenses(player, opp) {
  const { _d6, _loseE, gt, t } = getContext();

  return [
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
}

function _contraCheck(player, opp) {
  const { _counterDefenses, _d6, _dN, _loseB, _loseE, t } = getContext();

  const roll = opp.b + _d6();
  if (roll >= player.b + 4) {
    const defenses = _counterDefenses(player, opp);
    return { needsDefense: true, defenses };
  }
  const d = _dN(2); const d2 = _d6();
  _loseE(opp, d); _loseB(opp, d2);
  return { needsDefense: false, msg: t('battlesim869.contra.bonus_hit', { d, d2 }) };
}

function _playerAttackOptions(player, opp, allowDirty) {
  const { _d6, _dN, _kill, _loseB, _loseE, gt, t } = getContext();

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

function _rivalName(d) {
  const { _rivalNameById } = getContext();
 return _rivalNameById(d.rivalId); }

function _playerDead(d) {
 return d.player.e <= 0; }

function _oppDead(d) {
 return d.opp.e <= 0; }

function _checkEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _oppDead, _playerDead, _recordOutcome, _rivalName, t } = getContext();

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
  const { _appendLog, _data, _freshEntity, _renderAll, _rivalName, saveState, showAlert, t } = getContext();

  const d = _data();
  if (!d) return;
  if (d.player.e <= 0) { showAlert(t('battlesim869.source.unavailable')); return; }
  d.rivalSetup ||= { ...d.opp, e: d.opp.startE, b: d.opp.startB };
  d.player = _freshEntity(d.player);
  d.opp = _freshEntity(d.rivalSetup);
  d.rulesVersion = 1;
  d.options ||= { magicSpend: 2, enduranceSpend: 1, skillSpend: 0 };
  delete d.manualSection;
  delete d.spared;
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
  const { ROUND1, ROUND2, SPECIAL2 } = getContext();

  const player = d.player, opp = d.opp;
  if (d.phase === 1) return ROUND1[d.rivalId](player, opp);
  if (SPECIAL2.includes(d.rivalId)) return null; // handled by special narrative UI
  return ROUND2[d.rivalId](player, opp);
}

function _pickOppOption(idx) {
  const { SPECIAL2, _appendLog, _checkEnd, _data, _oppOptions, _pickSourceOption, _pickSpecial, _renderAll, _rivalName, saveState, t } = getContext();

  const d = _data();
  if (!d || d.over) return;
  if (d.rulesVersion === 1) { _pickSourceOption(idx); return; }
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
  const { _appendLog, _checkEnd, _data, _kill, _recordOutcome, _renderAll, saveState, t } = getContext();

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
  const { _appendLog, _checkEnd, _contraCheck, _data, _pickSourceOption, _playerAttackOptions, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || d.over || d.turn !== 'player') return;
  if (d.rulesVersion === 1) { _pickSourceOption(idx); return; }
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
  const { _appendLog, _checkEnd, _counterDefenses, _data, _pickSourceOption, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || d.over || !d.pendingDefense) return;
  if (d.rulesVersion === 1) { _pickSourceOption(idx); return; }
  const player = d.player, opp = d.opp;
  const def = _counterDefenses(player, opp)[idx];
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
  const { _data, _freshEntity, _rival, _startBattle } = getContext();

  const d = _data();
  if (!d) return;
  d.rivalId = id;
  delete d.rivalSetup;
  d.opp = _freshEntity(_rival(id));
  _startBattle();
}

function _pickSourceOption(idx) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _d6, _data, _recordOutcome, _renderAll, _rivalName, saveState, t, tigerResolve } = getContext();

  const d = _data();
  if (!d || d.rulesVersion !== 1) return;
  const result = tigerResolve(d, idx, _d6);
  if (!result.valid) {
    _appendLog(d, t('battlesim869.source.unavailable'));
  } else {
    _appendLog(d, t('battlesim869.source.result', { label: t('battlesim869.' + result.key), ...result }));
    if (result.manualSection) _appendLog(d, t('battlesim869.source.manual', { section: result.manualSection }));
    if (result.spared) _appendLog(d, t('battlesim869.source.spared'));
    if (d.over) {
      const outcome = d.winner === 'player' ? 'win' : 'loss';
      _appendLog(d, t('battlesim869.log.' + (outcome === 'win' ? 'defeated' : 'fallen'), { trophy: SVG_TROPHY, skull: SVG_SKULL, name: _rivalName(d) }));
      _recordOutcome(d, outcome);
    }
  }
  saveState();
  _renderAll();
}

function _shieldLabel(shield) {
  const { t } = getContext();

  return shield === 'holy' ? t('battlesim869.shield.holy') : shield === 'magic' ? t('battlesim869.shield.magic') : t('battlesim869.shield.none');
}

function _statLine(ent) {
  const { _shieldLabel, t } = getContext();

  return t('battlesim869.stat_line', {
    s: ent.s, e: Math.max(0, ent.e), m: ent.m, b: Math.max(0, ent.b),
    sword: ent.sword, shield: _shieldLabel(ent.shield),
  });
}

// END EXTRACTED RULES
  return { _rival, _rivalNameById, _d6, _dN, _shieldAbsorb, _freshEntity, _recompute, _loseE, _loseB, _magicExchange, _kill, _dalgrenR1, _dalgrenR2, _dalgrenBlockOnly, _tindalinR1, _tindalinR2Real, _uantorR1, _uantorR2, _smajtalR1, _smajtalR2, _lestorR1, _lestorR2, _tejbrunR1, _matualR1, _counterDefenses, _contraCheck, _playerAttackOptions, _rivalName, _playerDead, _oppDead, _checkEnd, _startBattle, _oppOptions, _pickOppOption, _pickSpecial, _pickPlayerOption, _pickCounterDefense, _pickRival, _pickSourceOption, _shieldLabel, _statLine };
}
