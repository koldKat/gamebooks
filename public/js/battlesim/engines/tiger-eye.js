let LABELS = {}, RIVAL_RULES = {}, COMMON_RULES = {};
export function installTigerRules(rivals, labels, common) {
  RIVAL_RULES = rivals; LABELS = labels; COMMON_RULES = common;
}
const ATTACKS = ['std', 'feint', 'combo', 'stdmagic', 'feintmagic', 'dirty', 'suicide'];

export function tigerOptions(d) {
  if (d.turn === 'manual') return [];
  if (d.pendingDefense) return ['def.opt1', 'def.opt2', 'source.def_low', 'source.def_high', 'source.def_disarm'];
  if (d.turn === 'player') {
    const allowed = d.phase === 2 && d.player.e <= 5 ? ['std', 'feint', 'stdmagic'] : ATTACKS.filter(id => id !== 'dirty' || d.phase === 1);
    return allowed.map(id => 'p.' + id);
  }
  const lists = LABELS[d.rivalId];
  return lists[d.phase === 1 ? 0 : d.rivalId === 'dalgren' && d.opp.e < RIVAL_RULES.dalgren.source.lowEndurance ? 2 : 1];
}

function loseE(ent, amount) {
  const loss = Math.max(0, amount);
  ent.lostE += loss;
  ent.e = Math.max(0, ent.startE - ent.lostE);
}
function loseB(ent, amount) {
  const loss = Math.max(0, Math.ceil(amount));
  ent.skillLossExtra += loss;
  ent.b = Math.max(0, ent.b - loss);
}
function checkpoint(d) {
  // The book recalculates endurance-related skill loss at sections 64/89/2.
  for (const ent of [d.player, d.opp]) ent.b = Math.max(0, ent.startB - Math.floor(ent.lostE / 3) - ent.skillLossExtra);
}
function spendMagic(d, minimum = 0) {
  const spend = Math.min(d.player.m, Math.max(0, Math.floor(Number(d.options?.magicSpend) || 0)));
  return spend >= minimum ? spend : 0;
}
function magicDamage(d, multiplier, absorbed = 0) {
  const spend = spendMagic(d);
  if (!spend) return;
  d.player.m -= spend;
  loseE(d.opp, Math.max(0, spend - absorbed) * multiplier);
}
function guard(p, o, multiplier = 1) {
  loseE(p, Math.max(0, o.e + o.b - p.e - p.b) * multiplier);
}
function heavyGuard(p, o, skill, margin) {
  const diff = p.s + p.e - o.s - o.e;
  loseE(p, diff >= 0 ? Math.max(0, margin - diff) : Math.abs(skill - o.b));
}
function convertMagic(d) {
  const e = Math.min(Math.max(0, d.player.e - 1), Math.max(0, Math.floor(Number(d.options?.enduranceSpend) || 0)));
  const b = Math.min(d.player.b, Math.max(0, Math.floor(Number(d.options?.skillSpend) || 0)));
  loseE(d.player, e); loseB(d.player, b);
  return d.player.m + Math.floor((e + b) / 3);
}
function manual(d, section) { d.manualSection = section; d.turn = 'manual'; d.pendingDefense = false; }
function finish(d) {
  if (d.player.e <= 0 || d.opp.e <= 0) {
    d.over = true;
    d.winner = d.player.e <= 0 ? 'opp' : 'player';
    d.pendingDefense = false;
    return true;
  }
  return false;
}

function rollMany(roll, count) {
  let total = 0;
  for (let i = 0; i < count; i++) total += roll();
  return total;
}

function opponent(d, index, roll) {
  const p = d.player, o = d.opp, phase = d.phase;
  const rules = RIVAL_RULES[d.rivalId].source;
  if (phase === 2 && d.rivalId === 'tejbrun') {
    if (index === 0) { loseE(p, rules.truceEndurance); loseB(p, rules.truceSkill); manual(d, rules.truceSection); }
    else manual(d, rules.attackSection);
    return;
  }
  if (phase === 2 && d.rivalId === 'matual') {
    if (index === 0) p.e = 0;
    else if (index === 1) manual(d, rules.attackSection);
    else { d.over = true; d.winner = 'player'; d.spared = true; }
    return;
  }
  switch (d.rivalId) {
    case 'dalgren':
      if (phase === 1) {
        if (index < 2) loseE(p, rollMany(roll, rules.openingDice));
        else if (index === 2) {
          if (p.b > o.b) loseE(o, rules.deceptiveDamage);
          else if (p.b < o.b) loseE(p, rules.deceptiveDamage);
        } else {
          loseE(o, rules.openingDamage);
          const diff = p.e + p.b - o.e - o.b;
          if (diff > 0) loseE(o, diff); else loseE(p, Math.abs(diff) / rules.blockedDivisor);
        }
      } else if (o.e >= rules.lowEndurance) {
        const tempB = p.b + Math.max(0, p.sword - rules.swordBase) * rules.swordMultiplier;
        if (index === 1) {
          const spend = spendMagic(d, rules.magicMinimum);
          if (!spend) return false;
          p.m -= spend; loseE(o, spend * rules.magicEndurance); loseB(o, spend * rules.magicSkill);
        }
        if (index === 2 && p.sword < rules.swordMinimum) return false;
        heavyGuard(p, o, index === 2 ? tempB : p.b, rules.heavyGuardMargin);
        if (index === 2 && tempB >= o.b - rules.swordMargin) loseE(o, Math.abs(p.s + p.e - o.s - o.e));
      } else {
        if (index === 2) { magicDamage(d, rules.magicEndurance); break; }
        loseE(p, p.b - o.b >= rules.blockMargin ? 0 : Math.abs(p.b - o.b));
        if (index === 1) o.e = 0;
        else manual(d, rules.manualSection);
      }
      break;
    case 'tindalin':
      if (phase === 1) {
        if (index === 2) {
          const spend = spendMagic(d, rules.magicMinimum);
          if (!spend) return false;
          p.m -= spend;
          if (p.b > o.b) loseE(o, p.b - o.b); else loseE(p, rules.failedCounterDamage);
        } else {
          if (p.shield === 'none') loseE(p, rules.unshieldedDamage);
          if (index < 2) loseE(p, p.b - o.b >= rules.blockMargin ? 0 : Math.abs(p.b - o.b));
          if (index === 0) {
            if (p.s > o.s) loseE(o, p.s - o.s); else loseE(p, o.s - p.s);
          } else if (index === 1) loseE(p, rules.failedCounterDamage);
          else if (p.b > o.b) loseE(o, rules.successfulCounterDamage);
          else if (p.b < o.b) loseE(p, o.b - p.b);
          else manual(d, rules.equalSkillSection);
        }
      } else if (index === 2) {
        if (o.e < rules.lowEndurance) o.e = 0;
        else {
          const diff = p.b + roll() - o.b;
          if (diff < rules.counterMargin) loseE(p, Math.abs(diff));
        }
      } else {
        loseE(p, rollMany(roll, rules.openingDice));
        if (index === 1 && p.e > o.e) loseE(o, roll());
      }
      break;
    case 'uantor':
      if (phase === 1) {
        if (index === 0) {
          const diff = o.e + o.b - p.e - p.b;
          if (diff > 0) loseE(p, diff <= rules.blockDiceThreshold ? roll() : rollMany(roll, rules.heavyDice));
        } else if (index === 1) {
          const fail = p.e + p.b < o.e + o.b;
          if (fail) loseE(p, rollMany(roll, rules.heavyDice));
          if (p.sword >= rules.swordMinimum && p.e >= rules.minimumEndurance) loseE(o, rollMany(roll, rules.heavyDice));
        } else if (index === 2) {
          loseE(p, rollMany(roll, rules.heavyDice)); loseB(p, rules.firstSkillLoss);
          if (p.e + p.b < o.e + o.b) {
            const damage = roll(), toSkill = Math.min(damage, Math.max(0, d.options?.skillSpend || 0));
            loseE(p, damage - toSkill); loseB(p, toSkill);
          }
        } else {
          if (p.e + p.b < o.e + o.b) loseE(p, roll());
          if (p.m < o.m) loseE(p, roll());
          else magicDamage(d, rules.magicEndurance, rules.magicAbsorbed);
        }
      } else if (index === 0) {
        if (p.e + p.b < o.e + o.b) loseE(p, roll());
        loseE(o, Math.max(0, p.s + p.e - o.s - o.e) * rules.counterMultiplier);
        loseE(p, roll());
      } else if (index === 1) {
        const diff = p.s + p.e + p.b - o.s - o.e - o.b;
        if (diff < 0) { loseE(p, rollMany(roll, rules.heavyDice)); loseB(p, rules.laterSkillLoss); }
        else if (diff < rules.laterGuardMargin) { loseE(p, rules.laterGuardMargin - diff); loseB(p, Math.floor((rules.laterGuardMargin - diff) / rules.laterSkillDivisor)); }
      } else if (index === 2) { loseE(p, rollMany(roll, rules.heavyDice)); loseB(p, rules.laterSkillLoss); }
      else {
        if (p.m <= o.m) return false;
        const spend = spendMagic(d), available = Math.max(0, spend - o.m);
        if (!available) return false;
        p.m -= spend; loseE(o, available * rules.magicEndurance); loseB(o, available * rules.magicSkill);
        if (p.e + p.b <= o.e + o.b) loseE(p, Math.abs(p.e + p.b - o.e - o.b) + Math.abs(p.s - o.s));
      }
      break;
    case 'smajtal':
      if (phase === 1) {
        if (index === 0 && p.m < rules.magicMinimum) return false;
        if (index === 1) {
          const diff = Math.max(0, p.e + p.b - o.e - o.b);
          loseE(o, diff * rules.counterMultiplier);
          const absorbed = p.m + Math.floor(diff / rules.absorbDivisor) + (p.shield === 'holy' ? rules.holyCounterAbsorb : 0);
          loseE(p, Math.max(0, o.m - absorbed) * rules.magicCounterMultiplier);
        } else {
          const absorbed = p.m + (rules.shieldAbsorb[p.shield] ?? 0);
          loseE(p, Math.max(0, o.m - absorbed) * rules.magicMultiplier);
          if (index === 2) {
            if (p.b >= o.b && p.sword >= rules.swordMinimum && p.e >= rules.minimumEndurance) {
              const n = roll();
              if (n <= rules.woundRollMaximum) { loseE(o, rules.woundDamage); loseB(o, rules.woundSkill); }
              else if (n >= rules.disarmMinimum) manual(d, rules.manualSection);
            } else loseE(p, roll());
          }
        }
      } else {
        if (p.e + p.b < o.e + o.b) { loseE(p, roll()); if (index === 0) loseB(p, rules.firstLaterSkillLoss); }
        const magic = index < 3 ? convertMagic(d) : p.m;
        const diff = magic - o.m;
        if (diff < 0) { loseE(p, -diff * rules.magicEndurance); loseB(p, -diff * rules.magicSkill); }
        else { loseE(o, diff * rules.magicEndurance); if (index !== 0) loseB(o, diff * rules.magicSkill); }
        if (index === 1) { loseE(p, roll()); loseB(p, rules.firstLaterSkillLoss); }
        if (index === 2) { loseE(o, rollMany(roll, rules.heavyDice)); loseB(o, roll()); }
      }
      break;
    case 'lestor':
      if (phase === 1) {
        const bonus = Math.max(0, p.sword - rules.swordBase) * rules.swordMultiplier;
        if (index === 1) {
          const spend = spendMagic(d, rules.magicMinimum);
          if (!spend) return false;
          p.m -= spend; loseE(o, spend * rules.magicEndurance); loseB(o, spend * rules.magicSkill);
        }
        if (index === 2 && p.sword < rules.swordMinimum) return false;
        const tempB = p.b + bonus;
        heavyGuard(p, o, index === 2 ? tempB : p.b, rules.heavyGuardMargin);
        if (index === 2 && tempB >= o.b - rules.swordMargin) loseE(o, Math.abs(p.s + p.e - o.s - o.e));
      } else if (index <= 2) {
        guard(p, o);
        if (index === 1) {
          const spend = Math.min(p.e - 1, Math.max(0, d.options?.enduranceSpend || 0));
          if (p.sword >= rules.laterSwordMinimum && o.e <= rules.lowEndurance && p.b + spend >= o.b) { loseE(p, spend); o.e = 0; }
          else if (p.sword < rules.laterSwordMinimum || p.b < o.b) loseE(p, roll());
        } else if (index === 2) {
          const spend = spendMagic(d);
          p.m -= spend; loseE(o, spend * rules.laterMagicEndurance); loseB(o, spend * rules.magicSkill);
        }
      } else {
        loseE(p, Math.max(0, o.s + o.e - p.s - p.e));
        const bonus = Math.max(0, p.sword - rules.swordBase) * rules.swordMultiplier;
        if (p.b + bonus >= o.b + rules.swordMargin) loseE(o, roll());
        else {
          loseE(p, rules.failedTrickDamage);
          const spend = Math.min(p.e - 1, Math.max(0, d.options?.enduranceSpend || 0));
          if (o.e <= rules.lowEndurance && p.b + bonus + spend >= o.b) { loseE(p, spend); o.e = 0; }
        }
      }
      break;
    case 'tejbrun':
      if (index < 3) guard(p, o);
      else loseE(p, Math.max(0, o.s + o.e - p.s - p.e));
      if (index === 1) {
        if (p.sword >= rules.swordMinimum && p.b >= o.b) loseE(o, roll()); else loseE(p, roll());
      } else if (index === 2) {
        if (p.m > o.m) magicDamage(d, rules.magicEndurance);
        else if (p.m < o.m) { loseE(p, rules.magicFailureDamage); o.m = Math.max(0, o.m - rules.magicLoss); }
        else manual(d, rules.magicTieSection);
      } else if (index === 3) {
        if (p.b + Math.max(0, p.sword - rules.swordBase) * rules.swordMultiplier >= o.b + rules.swordMargin) loseE(o, roll()); else loseE(p, rules.failedTrickDamage);
      }
      break;
    case 'matual':
      guard(p, o, rules.guardMultiplier);
      if (index === 0) {
        if (p.s > o.s) loseE(o, p.s - o.s); else loseE(p, o.s - p.s);
      } else if (index === 1) {
        if (p.b > o.b) loseE(o, (p.b - o.b) * rules.counterMultiplier); else loseE(p, o.b - p.b);
      } else {
        if (p.s <= o.s) loseE(p, roll());
        magicDamage(d, rules.magicEndurance, rules.magicAbsorbed);
      }
      break;
  }
}

function attack(d, id, roll) {
  const p = d.player, o = d.opp;
  if (id === 'std' || id === 'stdmagic') {
    const diff = Math.max(p.b + p.e - o.b - o.e, p.s + p.e - o.s - o.e);
    if (diff > 0) { loseE(o, diff); loseB(o, roll()); }
  }
  if (id === 'feint' || id === 'feintmagic') {
    const fooled = (o.s + o.b) / 2 <= 10;
    const magicWon = id === 'feintmagic' && p.m > o.m;
    if (fooled) { loseE(o, roll() + roll()); loseB(o, roll()); }
    else if (!magicWon && o.b >= p.b + 2) loseE(p, o.b - p.b);
  }
  if (id === 'stdmagic' || id === 'feintmagic') {
    if (p.m > o.m) loseE(o, (p.m - o.m) * 3);
    else if (p.m < o.m) loseE(p, (o.m - p.m) * 3);
  }
  if (id === 'combo') {
    if (p.s + p.e + p.b < 30) {
      const damage = roll() + roll(), skill = Math.min(damage, Math.max(0, d.options?.skillSpend || 0));
      loseE(p, damage - skill); loseB(p, skill);
    } else {
      const diff = p.e + p.b - o.e - o.b;
      if (diff >= 0) { loseE(o, roll() + diff * 2); loseB(o, diff); }
    }
  }
  if (id === 'dirty') {
    if (p.b >= o.b) loseE(o, roll());
    if (p.s + p.e < 15) loseE(p, 5);
    else {
      const strength = o.b + roll();
      if (strength < 20) { loseE(o, roll() + roll()); loseB(o, roll()); }
      else if (strength > 20) loseE(o, roll());
      else manual(d, COMMON_RULES.manual.dirtyTie);
    }
  }
  if (id === 'suicide') {
    if (p.b >= o.b && p.e >= o.e + 3) {
      const spend = Math.min(p.e, Math.max(0, d.options?.enduranceSpend || 0));
      loseE(p, spend); loseE(o, spend * 2);
    } else loseE(p, roll());
    if (!finish(d)) { loseE(o, roll() + roll()); loseB(o, roll()); }
    return;
  }
  if (d.turn === 'manual' || finish(d)) return;
  if (o.b + roll() >= p.b + 4) d.pendingDefense = true;
  else { loseE(o, roll() + roll()); loseB(o, roll()); }
}

function defend(d, index, roll) {
  const p = d.player, o = d.opp;
  if (index === 0) {
    if (p.b > o.b) { loseE(o, p.b - o.b + roll()); loseE(p, roll()); }
    else if (p.b < o.b) loseE(p, o.b - p.b + roll());
    else manual(d, COMMON_RULES.manual.counterTie);
  } else {
    if (p.e + p.b + roll() < 22) loseE(p, Math.abs(p.b - o.b));
    if (index === 2) {
      const spend = spendMagic(d, 2);
      if (p.e + p.b >= o.e + o.b + 5 || spend) {
        if (spend) p.m -= spend;
        loseE(o, Math.abs(p.b - o.b) + roll());
      }
    } else if (index === 3) {
      const spend = spendMagic(d, 2);
      if (p.b > o.b && (p.e >= o.e + 5 || o.e < 4 || spend)) {
        if (spend) p.m -= spend;
        loseE(o, p.b - o.b + roll());
      } else if (p.b < o.b) loseE(p, o.b - p.b);
    } else if (index === 4) {
      if (p.b >= o.b && p.e >= 5) {
        const n = roll();
        if (n <= 2) { loseE(o, 3); loseB(o, 4); }
        else if (n >= 5) manual(d, COMMON_RULES.manual.disarm);
      } else loseE(p, roll());
    }
  }
}

export function tigerResolve(d, index, roll) {
  if (d.over || !d.started || d.turn === 'manual') return { valid: false };
  const options = tigerOptions(d), key = options[index];
  if (!key) return { valid: false };
  const wasDefense = d.pendingDefense, turn = d.turn;
  const before = structuredClone({ player: d.player, opp: d.opp });
  let valid;
  if (wasDefense) { d.pendingDefense = false; defend(d, index, roll); }
  else if (turn === 'player') attack(d, key.slice(2), roll);
  else valid = opponent(d, index, roll);
  if (valid === false) return { valid: false };
  if (!finish(d) && !d.over && d.turn !== 'manual' && !d.pendingDefense) {
    checkpoint(d);
    d.turn = !wasDefense && turn === 'opp' ? 'player' : 'opp';
    if (d.turn === 'opp') d.phase = 2;
  }
  return { valid: true, key, manualSection: d.manualSection, spared: d.spared,
    playerE: before.player.e - d.player.e, playerB: before.player.b - d.player.b, playerM: before.player.m - d.player.m,
    oppE: before.opp.e - d.opp.e, oppB: before.opp.b - d.opp.b };
}
