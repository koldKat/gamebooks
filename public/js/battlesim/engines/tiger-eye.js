const LABELS = {
  dalgren: [['d1.opt1', 'd1.opt2', 'd1.opt3', 'd1.opt4'], ['d2.opt1', 'd2.opt2', 'd2.opt3'], ['d2b.opt1', 'd2b.opt2', 'd2b.opt3']],
  tindalin: [['t1.opt1', 't1.opt2', 't1.opt3', 't1.opt4'], ['t2.opt1', 't2.opt2', 't2.opt3']],
  uantor: [['u1.opt1', 'u1.opt2', 'u1.opt3', 'u1.opt4'], ['source.uantor_counter', 'source.uantor_guard', 'u2.opt3', 'u2.opt4']],
  smajtal: [['s1.opt1', 's1.opt2', 's1.opt3'], ['s2.opt1', 's2.opt2', 's2.opt3', 's2.opt4']],
  lestor: [['l1.opt1', 'l1.opt2', 'l1.opt3'], ['l2.opt1', 'l2.opt2', 'source.lestor_magic', 'source.lestor_trick']],
  tejbrun: [['tb1.opt1', 'tb1.opt2', 'tb1.opt3', 'tb1.opt4'], ['tejbrun.truce', 'tejbrun.attack']],
  matual: [['mt1.opt1', 'mt1.opt2', 'mt1.opt3'], ['matual.water', 'matual.attack', 'matual.sword']],
};
const ATTACKS = ['std', 'feint', 'combo', 'stdmagic', 'feintmagic', 'dirty', 'suicide'];

export function tigerOptions(d) {
  if (d.turn === 'manual') return [];
  if (d.pendingDefense) return ['def.opt1', 'def.opt2', 'source.def_low', 'source.def_high', 'source.def_disarm'];
  if (d.turn === 'player') {
    const allowed = d.phase === 2 && d.player.e <= 5 ? ['std', 'feint', 'stdmagic'] : ATTACKS.filter(id => id !== 'dirty' || d.phase === 1);
    return allowed.map(id => 'p.' + id);
  }
  const lists = LABELS[d.rivalId];
  return lists[d.phase === 1 ? 0 : d.rivalId === 'dalgren' && d.opp.e < 5 ? 2 : 1];
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
function heavyGuard(p, o, skill = p.b) {
  const diff = p.s + p.e - o.s - o.e;
  loseE(p, diff >= 0 ? Math.max(0, 6 - diff) : Math.abs(skill - o.b));
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

function opponent(d, index, roll) {
  const p = d.player, o = d.opp, phase = d.phase;
  if (phase === 2 && d.rivalId === 'tejbrun') {
    if (index === 0) { loseE(p, 5); loseB(p, 3); manual(d, 178); }
    else manual(d, 100);
    return;
  }
  if (phase === 2 && d.rivalId === 'matual') {
    if (index === 0) p.e = 0;
    else if (index === 1) manual(d, 100);
    else { d.over = true; d.winner = 'player'; d.spared = true; }
    return;
  }
  switch (d.rivalId) {
    case 'dalgren':
      if (phase === 1) {
        if (index < 2) loseE(p, roll() + roll());
        else if (index === 2) {
          if (p.b > o.b) loseE(o, 1);
          else if (p.b < o.b) loseE(p, 1);
        } else {
          loseE(o, 1);
          const diff = p.e + p.b - o.e - o.b;
          if (diff > 0) loseE(o, diff); else loseE(p, Math.abs(diff) / 2);
        }
      } else if (o.e >= 5) {
        const tempB = p.b + Math.max(0, p.sword - 2) * 2;
        if (index === 1) {
          const spend = spendMagic(d, 2);
          if (!spend) return false;
          p.m -= spend; loseE(o, spend * 3); loseB(o, spend * 2);
        }
        if (index === 2 && p.sword < 4) return false;
        heavyGuard(p, o, index === 2 ? tempB : p.b);
        if (index === 2 && tempB >= o.b - 2) loseE(o, Math.abs(p.s + p.e - o.s - o.e));
      } else {
        if (index === 2) { magicDamage(d, 3); break; }
        loseE(p, p.b - o.b >= 3 ? 0 : Math.abs(p.b - o.b));
        if (index === 1) o.e = 0;
        else manual(d, 155);
      }
      break;
    case 'tindalin':
      if (phase === 1) {
        if (index === 2) {
          const spend = spendMagic(d, 2);
          if (!spend) return false;
          p.m -= spend;
          if (p.b > o.b) loseE(o, p.b - o.b); else loseE(p, 2);
        } else {
          if (p.shield === 'none') loseE(p, 1);
          if (index < 2) loseE(p, p.b - o.b >= 3 ? 0 : Math.abs(p.b - o.b));
          if (index === 0) {
            if (p.s > o.s) loseE(o, p.s - o.s); else loseE(p, o.s - p.s);
          } else if (index === 1) loseE(p, 2);
          else if (p.b > o.b) loseE(o, 3);
          else if (p.b < o.b) loseE(p, o.b - p.b);
          else manual(d, 62);
        }
      } else if (index === 2) {
        if (o.e < 5) o.e = 0;
        else {
          const diff = p.b + roll() - o.b;
          if (diff < 4) loseE(p, Math.abs(diff));
        }
      } else {
        loseE(p, roll() + roll());
        if (index === 1 && p.e > o.e) loseE(o, roll());
      }
      break;
    case 'uantor':
      if (phase === 1) {
        if (index === 0) {
          const diff = o.e + o.b - p.e - p.b;
          if (diff > 0) loseE(p, diff <= 6 ? roll() : roll() + roll());
        } else if (index === 1) {
          const fail = p.e + p.b < o.e + o.b;
          if (fail) loseE(p, roll() + roll());
          if (p.sword >= 3 && p.e >= 5) loseE(o, roll() + roll());
        } else if (index === 2) {
          loseE(p, roll() + roll()); loseB(p, 4);
          if (p.e + p.b < o.e + o.b) {
            const damage = roll(), toSkill = Math.min(damage, Math.max(0, d.options?.skillSpend || 0));
            loseE(p, damage - toSkill); loseB(p, toSkill);
          }
        } else {
          if (p.e + p.b < o.e + o.b) loseE(p, roll());
          if (p.m < o.m) loseE(p, roll());
          else magicDamage(d, 4, 1);
        }
      } else if (index === 0) {
        if (p.e + p.b < o.e + o.b) loseE(p, roll());
        loseE(o, Math.max(0, p.s + p.e - o.s - o.e) * 2);
        loseE(p, roll());
      } else if (index === 1) {
        const diff = p.s + p.e + p.b - o.s - o.e - o.b;
        if (diff < 0) { loseE(p, roll() + roll()); loseB(p, 1); }
        else if (diff < 8) { loseE(p, 8 - diff); loseB(p, Math.floor((8 - diff) / 2)); }
      } else if (index === 2) { loseE(p, roll() + roll()); loseB(p, 1); }
      else {
        if (p.m <= o.m) return false;
        const spend = spendMagic(d), available = Math.max(0, spend - o.m);
        if (!available) return false;
        p.m -= spend; loseE(o, available * 4); loseB(o, available * 2);
        if (p.e + p.b <= o.e + o.b) loseE(p, Math.abs(p.e + p.b - o.e - o.b) + Math.abs(p.s - o.s));
      }
      break;
    case 'smajtal':
      if (phase === 1) {
        if (index === 0 && p.m < 3) return false;
        if (index === 1) {
          const diff = Math.max(0, p.e + p.b - o.e - o.b);
          loseE(o, diff * 2);
          const absorbed = p.m + Math.floor(diff / 2) + (p.shield === 'holy' ? 1 : 0);
          loseE(p, Math.max(0, o.m - absorbed) * 4);
        } else {
          const absorbed = p.m + (p.shield === 'holy' ? 2 : p.shield === 'magic' ? 1 : 0);
          loseE(p, Math.max(0, o.m - absorbed) * 3);
          if (index === 2) {
            if (p.b >= o.b && p.sword >= 3 && p.e >= 5) {
              const n = roll();
              if (n <= 2) { loseE(o, 3); loseB(o, 4); }
              else if (n >= 5) manual(d, 100);
            } else loseE(p, roll());
          }
        }
      } else {
        if (p.e + p.b < o.e + o.b) { loseE(p, roll()); if (index === 0) loseB(p, 2); }
        const magic = index < 3 ? convertMagic(d) : p.m;
        const diff = magic - o.m;
        if (diff < 0) { loseE(p, -diff * 4); loseB(p, -diff * 2); }
        else { loseE(o, diff * 4); if (index !== 0) loseB(o, diff * 2); }
        if (index === 1) { loseE(p, roll()); loseB(p, 2); }
        if (index === 2) { loseE(o, roll() + roll()); loseB(o, roll()); }
      }
      break;
    case 'lestor':
      if (phase === 1) {
        const bonus = Math.max(0, p.sword - 2) * 2;
        if (index === 1) {
          const spend = spendMagic(d, 2);
          if (!spend) return false;
          p.m -= spend; loseE(o, spend * 3); loseB(o, spend * 2);
        }
        if (index === 2 && p.sword < 4) return false;
        const tempB = p.b + bonus;
        heavyGuard(p, o, index === 2 ? tempB : p.b);
        if (index === 2 && tempB >= o.b - 2) loseE(o, Math.abs(p.s + p.e - o.s - o.e));
      } else if (index <= 2) {
        guard(p, o);
        if (index === 1) {
          const spend = Math.min(p.e - 1, Math.max(0, d.options?.enduranceSpend || 0));
          if (p.sword >= 3 && o.e <= 6 && p.b + spend >= o.b) { loseE(p, spend); o.e = 0; }
          else if (p.sword < 3 || p.b < o.b) loseE(p, roll());
        } else if (index === 2) {
          const spend = spendMagic(d);
          p.m -= spend; loseE(o, spend * 4); loseB(o, spend * 2);
        }
      } else {
        loseE(p, Math.max(0, o.s + o.e - p.s - p.e));
        const bonus = Math.max(0, p.sword - 2) * 2;
        if (p.b + bonus >= o.b + 2) loseE(o, roll());
        else {
          loseE(p, 1);
          const spend = Math.min(p.e - 1, Math.max(0, d.options?.enduranceSpend || 0));
          if (o.e <= 6 && p.b + bonus + spend >= o.b) { loseE(p, spend); o.e = 0; }
        }
      }
      break;
    case 'tejbrun':
      if (index < 3) guard(p, o);
      else loseE(p, Math.max(0, o.s + o.e - p.s - p.e));
      if (index === 1) {
        if (p.sword >= 3 && p.b >= o.b) loseE(o, roll()); else loseE(p, roll());
      } else if (index === 2) {
        if (p.m > o.m) magicDamage(d, 4);
        else if (p.m < o.m) { loseE(p, 4); o.m = Math.max(0, o.m - 1); }
        else manual(d, 66);
      } else if (index === 3) {
        if (p.b + Math.max(0, p.sword - 2) * 2 >= o.b + 2) loseE(o, roll()); else loseE(p, 1);
      }
      break;
    case 'matual':
      guard(p, o, 2);
      if (index === 0) {
        if (p.s > o.s) loseE(o, p.s - o.s); else loseE(p, o.s - p.s);
      } else if (index === 1) {
        if (p.b > o.b) loseE(o, (p.b - o.b) * 3); else loseE(p, o.b - p.b);
      } else {
        if (p.s <= o.s) loseE(p, roll());
        magicDamage(d, 4, 2);
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
      else manual(d, 94);
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
    else manual(d, 10);
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
        else if (n >= 5) manual(d, 100);
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
