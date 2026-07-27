'use strict';

// ── Симулатор на бой - Пламъкът на Андалусия: Зарево над Кордоба (книга 8) ──
//
// Система: Умение + Живот.
// Всеки рунд - хвърляш N зара (N = Умение).
//   Зар 1-3 → пропуск
//   Зар 4-5 → 1 щета
//   Зар 6   → 2 щети
// Адрин напада пръв. Изключение: срещу повече от един противник - враговете напдаат пръв.
// Стартова таблица: У2→Ж18, У3→Ж15, У4→Ж12, У5→Ж9

// ── ANSI ────────────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
  gray:   '\x1b[90m',
};
const b  = s => `${C.bold}${s}${C.reset}`;
const g  = s => `${C.green}${s}${C.reset}`;
const r  = s => `${C.red}${s}${C.reset}`;
const y  = s => `${C.yellow}${s}${C.reset}`;
const cy = s => `${C.cyan}${s}${C.reset}`;
const gr = s => `${C.gray}${s}${C.reset}`;
const dim = s => `${C.dim}${s}${C.reset}`;

// ── Стартови статистики ───────────────────────────────────────────────────────
const STAT_TABLE = { 2: 18, 3: 15, 4: 12, 5: 9 };

// ── Противници (добавяй тук) ──────────────────────────────────────────────────
// { name, skill, life, foeFirst (по избор) }
// foeFirst: true когато Адрин се бие срещу повече от един противник едновременно
const ENCOUNTERS = [
  { name: 'Войник (У3/Ж3)',                   skill: 3, life: 3 },
  { name: 'Войник (У3/Ж4)',                   skill: 3, life: 4 },
  { name: 'Войник (У3/Ж5)',                   skill: 3, life: 5 },
  { name: 'Войник (У4/Ж4)',                   skill: 4, life: 4 },
  { name: 'Войник (У4/Ж5)',                   skill: 4, life: 5 },
  { name: 'Кастилец (У2/Ж5)',                 skill: 2, life: 5 },
  { name: 'Кастилец (У3/Ж4)',                 skill: 3, life: 4 },
  { name: 'Кастилец (У3/Ж5)',                 skill: 3, life: 5 },
  { name: 'Кастилец (У3/Ж6)',                 skill: 3, life: 6 },
  { name: 'Кастилец (У4/Ж4)',                 skill: 4, life: 4 },
  { name: 'Кастилец (У4/Ж5)',                 skill: 4, life: 5 },
  { name: 'Кастилец (У5/Ж3)',                 skill: 5, life: 3 },
  { name: 'Натоварен кастилец (У3/Ж3)',       skill: 3, life: 3 },
  { name: 'Алмогавар (У3/Ж3)',                skill: 3, life: 3 },
  { name: 'Алмогавар (У3/Ж4)',                skill: 3, life: 4 },
  { name: 'Алмогавар (У3/Ж5)',                skill: 3, life: 5 },
  { name: 'Алмогавар (У4/Ж3)',                skill: 4, life: 3 },
  { name: 'Капитан (У5/Ж6)',                  skill: 5, life: 6 },
  { name: 'Капитан на алмогаварите (У5/Ж5)', skill: 5, life: 5 },
  { name: 'Арабин (У3/Ж4)',                   skill: 3, life: 4 },
];

const SIMS = 100_000;

// ── Ядро ─────────────────────────────────────────────────────────────────────
function rollDice(n) {
  const dice = [];
  for (let i = 0; i < n; i++) dice.push(Math.ceil(Math.random() * 6));
  return dice;
}

function calcDamage(dice) {
  return dice.reduce((s, d) => s + (d === 6 ? 2 : d >= 4 ? 1 : 0), 0);
}

function dieFmt(d) {
  if (d === 6)      return y(String(d));
  if (d >= 4)       return g(String(d));
  return gr(String(d));
}

function diceStr(dice) {
  return '[' + dice.map(dieFmt).join(' ') + ']';
}

// ── Единична схватка с лог ────────────────────────────────────────────────────
function fightLogged(adrianSkill, adrianLife, foe) {
  const foeFirst = !!foe.foeFirst;
  let aLife = adrianLife;
  let fLife = foe.life;
  const log = [];
  let round = 1;

  while (aLife > 0 && fLife > 0) {
    const aDice = rollDice(adrianSkill);
    const fDice = rollDice(foe.skill);
    const aDmg  = calcDamage(aDice);
    const fDmg  = calcDamage(fDice);

    if (foeFirst) {
      aLife -= fDmg;
      if (aLife <= 0) {
        log.push(`  ${b(`Рунд ${round}`)}: ${cy(foe.name)} ${diceStr(fDice)} → ${r(`-${fDmg}`)} | ${r('Адрин умира')}`);
        break;
      }
      fLife -= aDmg;
      log.push(
        `  ${b(`Рунд ${round}`)}: ` +
        `${cy(foe.name)} ${diceStr(fDice)} → ${fDmg > 0 ? r(`-${fDmg}`) : dim('0')}  ` +
        `${b('Адрин')} ${diceStr(aDice)} → ${aDmg > 0 ? g(`-${aDmg}`) : dim('0')}` +
        `  ${gr(`│`)} Адрин Ж${b(aLife)}  ${cy(foe.name)} Ж${b(Math.max(0, fLife))}`
      );
    } else {
      fLife -= aDmg;
      if (fLife <= 0) {
        log.push(`  ${b(`Рунд ${round}`)}: ${b('Адрин')} ${diceStr(aDice)} → ${g(`-${aDmg}`)} | ${g(`${foe.name} умира`)}`);
        break;
      }
      aLife -= fDmg;
      log.push(
        `  ${b(`Рунд ${round}`)}: ` +
        `${b('Адрин')} ${diceStr(aDice)} → ${aDmg > 0 ? g(`-${aDmg}`) : dim('0')}  ` +
        `${cy(foe.name)} ${diceStr(fDice)} → ${fDmg > 0 ? r(`-${fDmg}`) : dim('0')}` +
        `  ${gr(`│`)} Адрин Ж${b(aLife)}  ${cy(foe.name)} Ж${b(Math.max(0, fLife))}`
      );
    }
    round++;
  }

  return { win: aLife > 0, adrianLifeLeft: Math.max(0, aLife), log };
}

// ── Симулация (без лог) ────────────────────────────────────────────────────────
function fightSilent(adrianSkill, adrianLife, foe) {
  const foeFirst = !!foe.foeFirst;
  let aLife = adrianLife;
  let fLife = foe.life;

  while (aLife > 0 && fLife > 0) {
    const aDmg = calcDamage(rollDice(adrianSkill));
    const fDmg = calcDamage(rollDice(foe.skill));

    if (foeFirst) {
      aLife -= fDmg;
      if (aLife <= 0) break;
      fLife -= aDmg;
    } else {
      fLife -= aDmg;
      if (fLife <= 0) break;
      aLife -= fDmg;
    }
  }
  return { win: aLife > 0, adrianLifeLeft: Math.max(0, aLife) };
}

function simulate(adrianSkill, adrianLife, foes) {
  let wins = 0, totalLife = 0, minLife = Infinity, maxLife = 0;
  let totalRounds = 0;

  for (let i = 0; i < SIMS; i++) {
    let aLife = adrianLife;
    let won = true;
    let rounds = 0;

    for (const foe of foes) {
      if (aLife <= 0) { won = false; break; }
      const foeFirst = !!foe.foeFirst;
      let fLife = foe.life;

      while (aLife > 0 && fLife > 0) {
        const aDmg = calcDamage(rollDice(adrianSkill));
        const fDmg = calcDamage(rollDice(foe.skill));
        if (foeFirst) {
          aLife -= fDmg; if (aLife <= 0) break;
          fLife -= aDmg;
        } else {
          fLife -= aDmg; if (fLife <= 0) break;
          aLife -= fDmg;
        }
        rounds++;
      }
      if (aLife <= 0) { won = false; break; }
    }

    if (won) {
      wins++;
      totalLife += aLife;
      totalRounds += rounds;
      if (aLife < minLife) minLife = aLife;
      if (aLife > maxLife) maxLife = aLife;
    }
  }

  const winRate = wins / SIMS;
  return {
    winRate,
    avgLife:   wins > 0 ? totalLife   / wins : 0,
    avgRounds: wins > 0 ? totalRounds / wins : 0,
    minLife:   wins > 0 ? minLife     : 0,
    maxLife:   wins > 0 ? maxLife     : 0,
    wins,
  };
}

function pct(rate) {
  const p = (rate * 100).toFixed(1);
  if (rate >= 0.75) return g(`${p}%`);
  if (rate >= 0.5)  return y(`${p}%`);
  return r(`${p}%`);
}

function bar(rate, width = 20) {
  const filled = Math.round(rate * width);
  const empty  = width - filled;
  const color  = rate >= 0.75 ? C.green : rate >= 0.5 ? C.yellow : C.red;
  return `${color}${'█'.repeat(filled)}${C.gray}${'░'.repeat(empty)}${C.reset}`;
}

function sep(char = '─', len = 60) { return C.gray + char.repeat(len) + C.reset; }

// ── Главна програма ──────────────────────────────────────────────────────────
console.log();
console.log(b(cy('══════════════════════════════════════════════════════════')));
console.log(b(cy('  Пламъкът на Андалусия: Зарево над Кордоба - Симулатор')));
console.log(b(cy('══════════════════════════════════════════════════════════')));
console.log();
console.log(`  ${dim('Система:')} хвърляш N зара (N = Умение) - 4-5 → 1 щ., 6 → 2 щ.`);
console.log(`  ${dim('Симулации:')} ${SIMS.toLocaleString()} на конфигурация`);
console.log();
console.log(`  ${b('Стартова таблица:')}`);
for (const [s, l] of Object.entries(STAT_TABLE))
  console.log(`    Умение ${b(s)}  →  Живот ${b(l)}`);
console.log();

// Per-encounter results for all 4 skill options
for (const foe of ENCOUNTERS) {
  console.log(sep('═'));
  console.log(`  ${b(cy(`Противник: ${foe.name}`))}  ${dim(`У${foe.skill} / Ж${foe.life}${foe.foeFirst ? ' (врагът напада пръв)' : ''}`)}`);
  console.log(sep());
  console.log(`  ${'Умение'.padEnd(8)} ${'Живот'.padEnd(7)} ${'Победа'.padEnd(8)} ${'Лента'.padEnd(22)} ${'Ср.Живот'.padEnd(10)} ${'Мин'.padEnd(5)} ${'Макс'.padEnd(5)} ${'Ср.Рунда'}`);
  console.log(sep());

  for (const [skillStr, startLife] of Object.entries(STAT_TABLE)) {
    const skill = parseInt(skillStr);
    const r2 = simulate(skill, startLife, [foe]);
    console.log(
      `  ${b(String(skill).padEnd(8))}` +
      `${String(startLife).padEnd(7)}` +
      `${pct(r2.winRate).padEnd(17)}` +
      `${bar(r2.winRate).padEnd(30)}` +
      `${r2.avgLife.toFixed(1).padEnd(10)}` +
      `${String(r2.minLife).padEnd(5)}` +
      `${String(r2.maxLife).padEnd(5)}` +
      `${r2.avgRounds.toFixed(1)}`
    );
  }

  // Example fight with log (U4/J12)
  console.log();
  console.log(`  ${dim('Примерна схватка')} ${b('Адрин У4/Ж12')} ${dim('vs')} ${cy(foe.name)}:`);
  const ex = fightLogged(4, 12, foe);
  ex.log.forEach(l => console.log(l));
  console.log(`  ${dim('→')} ${ex.win ? g(`Адрин побеждава с Живот ${ex.adrianLifeLeft}`) : r('Адрин умира')}`);
  console.log();
}

// Gauntlet (all encounters in sequence, U4/J12)
if (ENCOUNTERS.length > 1) {
  console.log(sep('═'));
  console.log(`  ${b(cy('Поредица - всички противници (У4/Ж12)'))}`);
  console.log(sep());
  console.log(`  ${'Умение'.padEnd(8)} ${'Живот'.padEnd(7)} ${'Победа'.padEnd(8)} ${'Лента'.padEnd(22)} ${'Ср.Живот'.padEnd(10)} ${'Мин'.padEnd(5)} ${'Макс'}`);
  console.log(sep());

  for (const [skillStr, startLife] of Object.entries(STAT_TABLE)) {
    const skill = parseInt(skillStr);
    const r2 = simulate(skill, startLife, ENCOUNTERS);
    console.log(
      `  ${b(String(skill).padEnd(8))}` +
      `${String(startLife).padEnd(7)}` +
      `${pct(r2.winRate).padEnd(17)}` +
      `${bar(r2.winRate).padEnd(30)}` +
      `${r2.avgLife.toFixed(1).padEnd(10)}` +
      `${String(r2.minLife).padEnd(5)}` +
      `${String(r2.maxLife)}`
    );
  }

  console.log();
  console.log(`  ${dim('Примерна поредица (У4/Ж12):')}`);
  let aLife = 12;
  for (const foe of ENCOUNTERS) {
    if (aLife <= 0) break;
    console.log(`  ${dim('▶')} ${cy(foe.name)}`);
    const ex = fightLogged(4, aLife, foe);
    ex.log.forEach(l => console.log(l));
    console.log(`  ${dim('→')} ${ex.win ? g(`Адрин побеждава с Живот ${ex.adrianLifeLeft}`) : r('Адрин умира')}`);
    aLife = ex.adrianLifeLeft;
  }
  console.log();
}

console.log(sep('═'));
console.log();
