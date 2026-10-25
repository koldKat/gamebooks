import { customGrailEncounter } from './opponents.js';
import { VOYAGE_ENCOUNTERS, VOYAGE_DREAMS, VOYAGE_NAVIGATION,
  VOYAGE_ARGONAUTS, VOYAGE_SUPPORT, VOYAGE_RULES } from './voyage-of-terror-roster.js';
export { VOYAGE_RULES } from './voyage-of-terror-roster.js';

export function voyageCompanionName(role) {
  return VOYAGE_ARGONAUTS[VOYAGE_RULES.companionRoles[role]].name;
}

export function voyageCanLeave(spec) {
  return VOYAGE_RULES.leaveSections.includes(spec?.section);
}

export function voyageRetainsKeysOnLoss(fight) {
  return fight?.status === 'loss' && VOYAGE_RULES.retainKeysOnLossSections.includes(fight.spec?.section);
}

export function voyageEncounter(section) {
  return VOYAGE_ENCOUNTERS.find(spec => String(spec.section) === String(section));
}

const die = random => 1 + Math.floor(random() * 6);
const dice = random => die(random) + die(random);
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;

export const VOYAGE_WEAPONS = Object.freeze({
  unarmed: Object.freeze({ hit: 6, bonus: 0 }),
  sword: Object.freeze({ hit: 6, bonus: 3 }),
  dagger: Object.freeze({ hit: 6, bonus: 1 }),
  rustyDagger: Object.freeze({ hit: 6, bonus: 2 }),
  spearJab: Object.freeze({ hit: 6, bonus: 5 }),
  spearThrow: Object.freeze({ hit: 8, bonus: 10 }),
  driftwood: Object.freeze({ hit: 6, bonus: 2 }),
  crossbow: Object.freeze({ hit: 3, fixedDamage: 15 }),
});

export function createVoyageCharacter() {
  return { life: 0, maxLife: 0, hit: 6, bonus: 0, armour: 0,
    weapon: 'unarmed', permanent: 0, experience: 0, gold: 0,
    bolts: 0, poisonHits: 0, potions: 0, salves: 0, quinine: 0,
    antidotes: 0, dragonTeeth: 0, cricriEggs: 0, spinach: 0,
    goldenKeys: 0, armourPieces: 0, vulcanArmour: false,
    crystalBlade: false, wallbanger: false, wallbangerUsed: false,
    illusion: false, pigSpell: false, talisman: false, light: false,
    malaria: false, shape: 'human', sprainSections: [], limpSections: [],
    sectionPoison: 0, playerHalfNext: false, enemyHalfNext: false,
    weakeningPotion: false, mongoose: false, gnurlbash: false, companions: [] };
}

export function initialVoyageLife(permanent = 0, random = Math.random) {
  if (!integer(permanent)) throw new RangeError('Invalid permanent LIFE');
  const carried = Math.min(permanent, 40);
  const rolls = Array.from({ length: 3 }, () => dice(random));
  const life = Math.max(...rolls) * 4 + carried;
  return { life, maxLife: life, permanent: carried, rolls };
}

export function voyageStrike(roll, hit = 6, bonus = 0, armour = 0,
  { penalty = 0, fullDice = false, fixedDamage = null, multiplier = 1 } = {}) {
  if (!integer(roll, 2) || roll > 12 || !integer(hit, 2) || hit > 12
    || !integer(bonus) || !integer(armour) || !integer(penalty)
    || !integer(multiplier, 1) || fixedDamage !== null && !integer(fixedDamage)) {
    throw new RangeError('Invalid strike');
  }
  const score = roll - penalty;
  const landed = score >= hit;
  const raw = fixedDamage ?? (fullDice ? score : score - hit) + bonus;
  return { hit: landed, damage: landed ? Math.max(0, raw * multiplier - armour) : 0, score };
}

export function voyageFriendlyReaction(random = Math.random) {
  const enemy = die(random);
  const player = die(random) + die(random) + die(random);
  return { enemy, player, success: player < enemy };
}

export function voyageArmourShatter(pieces, roll) {
  if (!integer(pieces) || pieces > 3 || !integer(roll, 2) || roll > 12) {
    throw new RangeError('Invalid armour check');
  }
  const threshold = [13, 12, 11, 9][pieces];
  const shattered = roll >= threshold;
  return { shattered, damage: shattered ? 20 : 0, armour: shattered ? 0 : pieces * 2 };
}

export function voyageNavigation(random = Math.random) {
  const roll = dice(random);
  return { roll, arrived: roll >= 5 };
}

const clone = value => JSON.parse(JSON.stringify(value));
const alive = actor => actor.life > 5;
const combatAlive = (f, actor) => actor.life > (actor.temporary || f.spec.splitFerrets || f.spec.argonautBattle ? 0 : 5);
const defeated = (f, foe) => foe.bypassed || foe.life <=
  (f.spec.deathRequired || f.options.killEnemies || foe.maxLife <= 5 ? 0 : 5);

export function voyageTargets(f) {
  let targets = f.foes.map((foe, index) => ({ foe, index }))
    .filter(({ foe }) => !defeated(f, foe));
  if (f.spec.splitFerrets && targets.some(({ foe }) => foe.phase === 0)) {
    targets = targets.filter(({ foe }) => foe.phase === 0);
  }
  return targets;
}

function settle(f) {
  if (f.status !== 'fighting') return;
  const p = f.player;
  const targets = voyageTargets(f);
  if (!combatAlive(f, p) && (!f.spec.argonautBattle || !f.allies.some(a => combatAlive(f, a)))) f.status = 'loss';
  else if (!targets.length) {
    if (p.life === 0 && f.spec.resurrectWithJason && f.allies.some(a => a.name === voyageCompanionName('jason') && combatAlive(f, a))) {
      p.life = p.maxLife;
      f.events.push({ kind: 'resurrection' });
    }
    f.status = combatAlive(f, p) ? 'win' : 'loss';
  }
  if (f.spec.splitFerrets && f.allies.some(a => a.name === voyageCompanionName('jason') && a.life === 0)) f.status = 'loss';
  if (f.spec.knockoutCaptivity && p.life > 0 && p.life <= 5) f.status = 'captured';
  if (f.spec.knockoutReturn && p.life > 0 && p.life <= 5) {
    f.status = 'redirect'; f.redirect = f.spec.knockoutReturn;
  }
  if (f.status === 'fighting' && f.spec.surrenderDamage && f.enemyLoss >= f.spec.surrenderDamage && p.life > 5) f.status = 'win';
  if (f.spec.strikeLimit && f.playerStrikes >= f.spec.strikeLimit && targets.length) {
    p.life = 0; f.status = 'loss';
  }
  if (f.status === 'win' && !f.rewarded && !f.spec.dream) {
    f.rewarded = true;
    p.experience++;
    if (f.spec.chaseLimit) f.chaseWithinLimit = f.rounds <= f.spec.chaseLimit;
  }
  for (const ally of f.allies.filter(a => !a.temporary)) {
    const saved = p.companions.find(a => a.name === ally.name && a.companionId === ally.companionId);
    if (saved) saved.life = ally.life;
  }
}

function damagePlayer(f, amount) {
  const actual = Math.min(f.player.life, Math.max(0, amount));
  f.player.life -= actual;
  f.playerLoss += actual;
}

function roofCheck(f, random) {
  if (!f.spec.roofChecks) return true;
  const roll = dice(random);
  f.events.push({ kind: 'roof', roll });
  if (roll > VOYAGE_RULES.roofFatalMax) return true;
  damagePlayer(f, f.player.life);
  for (const foe of f.foes) foe.life = 0;
  f.status = 'loss';
  return false;
}

function hurtEnemy(f, foe, amount) {
  const before = foe.life;
  const actual = Math.min(foe.life, Math.max(0, amount));
  foe.life -= actual;
  f.enemyLoss += actual;
  if (before > 0 && foe.life === 0 && foe.gold && !foe.goldCollected) {
    foe.goldCollected = true; f.player.gold += foe.gold;
  }
  if (defeated(f, foe)) f.allies = f.allies.filter(ally => ally.expiresOnEnemy !== f.foes.indexOf(foe));
  settle(f);
}

export function rerollVoyageInitiative(f, random = Math.random) {
  if (f.status !== 'fighting' || f.first) return null;
  const enemy = dice(random), player = dice(random);
  f.initiative = { enemy, player };
  f.first = player > enemy ? 'player' : enemy > player ? 'enemy' : null;
  return f.initiative;
}

export function createVoyageFight(section, player, options = {}, random = Math.random) {
  const spec = [...VOYAGE_ENCOUNTERS, ...VOYAGE_DREAMS, ...VOYAGE_NAVIGATION]
    .find(entry => String(entry.section) === String(section)) ?? customGrailEncounter(section, options.opponents);
  if (!spec) throw new RangeError('Unknown Voyage encounter');
  if (!integer(player.life, 6) || !integer(player.maxLife, player.life)
    || !integer(player.hit, 2) || player.hit > 12 || !integer(player.bonus)
    || !integer(player.armour) || !VOYAGE_WEAPONS[player.weapon]) throw new RangeError('Invalid character');
  const p = clone(player);
  if (options.assignments && (!Array.isArray(options.assignments)
    || options.assignments.length !== spec.foes.length
    || options.assignments.some(value => !integer(value) || value > (p.companions?.length ?? 0)))) {
    throw new RangeError('Invalid enemy assignments');
  }
  const f = { rulesVersion: 1, spec: clone(spec), options: clone(options), player: p,
    foes: clone(spec.foes).map(foe => ({ ...foe,
      life: options.returnJourney ? Math.ceil(foe.life / 2) : foe.life,
      maxLife: options.returnJourney ? Math.ceil(foe.life / 2) : foe.life,
      attacksMade: 0, doses: 0, poisonedRound: 0 })),
    allies: [], rounds: 0, playerStrikes: 0, enemyBlows: 0, playerLoss: 0, enemyLoss: 0,
    events: [], status: 'fighting', first: null, armourChecked: false,
    playerHalf: !spec.dream && !!p.playerHalfNext, enemyHalf: !spec.dream && !!p.enemyHalfNext,
    mummyPoisonRound: null, spearReturnRound: 0, wallbangerRound: null };
  if (!spec.dream && !spec.shadows) { p.playerHalfNext = false; p.enemyHalfNext = false; }
  if (spec.pig && p.shape !== 'pig') { p.life = 15; p.maxLife = Math.max(p.maxLife, 15); p.shape = 'pig'; }
  if (spec.argonautBattle) f.allies = clone(p.companions ?? []);
  if (spec.jason) {
    const jason = (p.companions ?? []).find(a => a.name === voyageCompanionName('jason'));
    if (!jason || !alive(jason)) throw new RangeError('Jason is required');
    f.allies = [clone(jason)];
  }
  if (spec.shadows) f.shadows = Array.from({ length: Array.from({length: spec.shadowRules.countDice}, () => die(random)).reduce((sum, value) => sum + value, 0) }, () => ({ gripped: false, banished: false }));
  if (!spec.dream && p.mongoose && f.foes.length && f.foes.every(foe => foe.serpent)) {
    for (const foe of f.foes) foe.bypassed = true;
  }
  if (spec.entryDamage) damagePlayer(f, spec.entryDamage);
  if (spec.first) f.first = spec.first;
  else if (!spec.dream && !spec.unarmed && p.shape === 'human' && p.weapon === 'crossbow' && p.bolts > 0) f.first = 'player';
  else rerollVoyageInitiative(f, random);
  if (f.status === 'fighting' && !spec.shadows) settle(f);
  return f;
}

function playerWeapon(f) {
  const p = f.player;
  if (f.spec.dream || f.spec.unarmed || p.shape !== 'human') {
    return { hit: f.spec.playerHit ?? (!f.spec.dream && p.shape === 'beetle' ? 7 : 6), bonus: f.spec.playerBonus ?? 0 };
  }
  const key = p.weapon === 'spearThrow' && f.rounds < f.spearReturnRound
    || p.weapon === 'crossbow' && p.bolts === 0 ? 'unarmed' : p.weapon;
  return { ...VOYAGE_WEAPONS[key], hit: f.spec.playerHit ?? VOYAGE_WEAPONS[key].hit,
    bonus: VOYAGE_WEAPONS[key].bonus ?? 0, key };
}

function protection(f, target) {
  if (target !== f.player) return target.armour ?? 0;
  if (f.spec.dream || f.player.shape !== 'human') return 0;
  if (f.spec.vulcanArmour || f.player.vulcanArmour) return f.enemyBlows <= 2 ? Infinity : 4;
  return f.player.armour + f.player.armourPieces * 2;
}

export function voyageCombatStats(f) {
  const weapon = playerWeapon(f);
  const armour = protection(f, f.player);
  return { hit: weapon.hit + (f.spec.playerPenalty ?? 0), bonus: weapon.bonus ?? 0,
    armour: Number.isFinite(armour) ? armour : 4, protectedBlows: Number.isFinite(armour) ? 0 : Math.max(0, 2 - f.enemyBlows) };
}

function enemyBlow(f, foe, target, random) {
  if (!combatAlive(f, target) || defeated(f, foe) || !roofCheck(f, random)) return;
  if (f.wallbangerRound !== null) {
    const elapsed = f.rounds - f.wallbangerRound;
    if (elapsed <= 6 || elapsed % 2 === 1) return;
  }
  const roll = dice(random);
  f.enemyBlows++;
  foe.attacksMade++;
  const pistol = foe.pistol && foe.attacksMade === 1;
  const penalty = target === f.player && f.options.talismanAttack && !f.spec.dream
    && f.player.talisman && foe.attacksMade === 1 ? 1 : 0;
  const blocked = !f.spec.dream && target === f.player && f.player.shape === 'beetle' && f.rounds % 2 === 1;
  const armour = protection(f, target);
  const hitAt = pistol ? VOYAGE_RULES.pistol.hit : foe.hit;
  const strike = voyageStrike(roll, hitAt, foe.bonus, Number.isFinite(armour) ? armour : 0,
    { penalty, fullDice: !!foe.fullDice, multiplier: foe.multiplier ?? 1,
      fixedDamage: pistol ? VOYAGE_RULES.pistol.damage : null });
  strike.hit &&= !blocked;
  let damage = strike.hit && Number.isFinite(armour) ? strike.damage : 0;
  if (strike.hit && foe.halfCurrentLife) damage = Math.floor(target.life / 2);
  if (strike.hit && (foe.lethalHit || foe.evilEye && roll === VOYAGE_RULES.evilEyeRoll)) damage = target.life;
  if ((f.enemyHalf || foe.halfDamage) && !foe.lethalHit && !(foe.evilEye && roll === VOYAGE_RULES.evilEyeRoll)) damage = Math.floor(damage / 2);
  if (target === f.player) damagePlayer(f, damage);
  else target.life = Math.max(0, target.life - damage);
  if (target === f.player && strike.hit && foe.mummyPoison && f.mummyPoisonRound === null) f.mummyPoisonRound = f.rounds;
  f.events.push({ kind: 'enemy', name: foe.name, target: target.name ?? 'Pip', roll, hit: strike.hit, damage });
  settle(f);
  checkArmour(f, random);
}

function checkArmour(f, random) {
  if (f.status !== 'fighting' || f.armourChecked || f.spec.dream || f.player.shape !== 'human') return;
  f.armourChecked = true;
  if (!f.player.armourPieces) return;
  const roll = dice(random), result = voyageArmourShatter(f.player.armourPieces, roll);
  f.events.push({ kind: 'armour', roll, ...result });
  if (result.shattered) { f.player.armourPieces = 0; damagePlayer(f, result.damage); settle(f); }
}

function playerBlow(f, foe, random) {
  if (!combatAlive(f, f.player) || defeated(f, foe) || !roofCheck(f, random)) return;
  const p = f.player, weapon = playerWeapon(f);
  const roll = dice(random);
  f.playerStrikes++;
  if (weapon.key === 'crossbow') p.bolts--;
  if (weapon.key === 'spearThrow') f.spearReturnRound = f.rounds + 4;
  const missed = f.spec.playerMissEvery && f.playerStrikes % f.spec.playerMissEvery === 0
    || !f.spec.dream && p.limpSections.length && f.playerStrikes % 3 === 0
    || !f.spec.dream && p.malaria && f.rounds % 2 === 1;
  const strike = voyageStrike(roll, weapon.hit, weapon.bonus, foe.armour,
    { penalty: f.spec.playerPenalty ?? 0, fixedDamage: weapon.fixedDamage ?? null });
  strike.hit &&= !missed;
  let damage = strike.hit ? strike.damage : 0;
  if (f.playerHalf) damage = Math.floor(damage / 2);
  if (strike.hit && !f.spec.dream && weapon.key === 'dagger' && p.poisonHits > 0) {
    p.poisonHits--; foe.doses++; foe.poisonedRound = f.rounds;
  }
  f.events.push({ kind: 'player', name: foe.name, roll, hit: strike.hit, damage });
  hurtEnemy(f, foe, damage);
  checkArmour(f, random);
}

function enemyTurn(f, target, random, eligible = null) {
  let targets = voyageTargets(f);
  if (eligible) targets = targets.filter(({ index }) => eligible.has(index));
  if (f.spec.alternating) targets = targets.length ? [targets[(f.rounds - 1) % targets.length]] : [];
  else if (f.spec.splitFerrets && targets.some(({ foe }) => foe.phase === 0)) {
    targets = [targets.find(({ index }) => index < VOYAGE_RULES.ferretSplit), targets.find(({ index }) => index >= VOYAGE_RULES.ferretSplit)].filter(Boolean);
  } else if (!f.spec.simultaneous && !f.spec.argonautBattle) targets = targets.slice(0, 1);
  for (const { foe, index } of targets) {
    let recipient = f.spec.splitFerrets && index >= VOYAGE_RULES.ferretSplit && foe.phase === 0 ? f.allies[0]
      : f.spec.argonautBattle ? [f.player, ...f.allies][f.options.assignments?.[index] ?? 0]
        : f.allies.find(ally => ally.temporary && combatAlive(f, ally)) ?? f.player;
    if (!recipient && !f.spec.argonautBattle) throw new RangeError('Invalid enemy assignment');
    if (f.spec.argonautBattle && (!recipient || !combatAlive(f, recipient))) {
      const participants = [f.player, ...f.allies];
      const next = participants.findIndex(actor => combatAlive(f, actor));
      if (next < 0) { settle(f); break; }
      f.options.assignments ||= Array(f.foes.length).fill(0);
      f.options.assignments[index] = next;
      recipient = participants[next];
    }
    for (let i = 0; i < (foe.attacks ?? 1) * (!f.spec.dream && recipient === f.player
      && f.player.sprainSections.length ? 2 : 1) && f.status === 'fighting'; i++) enemyBlow(f, foe, recipient, random);
  }
}

function allyTurn(f, random) {
  for (const ally of f.allies) {
    if (!combatAlive(f, ally) || ally.attackEvery && f.rounds % ally.attackEvery !== 0) continue;
    const candidates = voyageTargets(f).filter(({ index, foe }) => !f.spec.splitFerrets
      || foe.phase === 0 && index >= VOYAGE_RULES.ferretSplit);
    const target = candidates.find(({ index }) => f.options.assignments?.[index] === f.allies.indexOf(ally) + 1)
      ?? candidates[0];
    if (!target || f.status !== 'fighting' || !roofCheck(f, random)) continue;
    const roll = dice(random), strike = voyageStrike(roll, ally.hit, ally.bonus, target.foe.armour);
    f.events.push({ kind: 'ally', name: ally.name, target: target.foe.name, roll, ...strike });
    hurtEnemy(f, target.foe, strike.damage);
  }
}

export function rollVoyageRound(f, target = voyageTargets(f)[0]?.index, random = Math.random) {
  if (f.status !== 'fighting') return false;
  if (f.spec.shadows) throw new RangeError('Use the shadow action');
  if (!f.first) { rerollVoyageInitiative(f, random); return false; }
  if (!voyageTargets(f).some(entry => entry.index === target)) throw new RangeError('Invalid target');
  f.events = []; f.rounds++;
  for (const { foe } of voyageTargets(f)) {
    if (foe.doses && foe.poisonedRound < f.rounds) hurtEnemy(f, foe, foe.doses * 2);
  }
  if (f.status !== 'fighting') return true;
  const openingTargets = voyageTargets(f);
  const splitOpening = f.spec.splitFerrets && openingTargets.some(({ foe }) => foe.phase === 0)
    ? [openingTargets.find(({ index }) => index < VOYAGE_RULES.ferretSplit), openingTargets.find(({ index }) => index >= VOYAGE_RULES.ferretSplit)].filter(Boolean)
    : openingTargets.slice(0, 1);
  const eligible = new Set((f.spec.splitFerrets ? splitOpening : f.spec.simultaneous || f.spec.argonautBattle
    || f.spec.alternating ? openingTargets : openingTargets.slice(0, 1))
    .map(({ index }) => index));
  if (f.mummyPoisonRound !== null && f.mummyPoisonRound < f.rounds) {
    damagePlayer(f, VOYAGE_RULES.mummyPoisonDamage); f.events.push({ kind: 'poison', damage: VOYAGE_RULES.mummyPoisonDamage }); settle(f);
    if (f.status !== 'fighting') return true;
  }
  const playerTurn = () => {
    const weapon = playerWeapon(f);
    const rate = f.spec.playerAttacks ?? (weapon.key === 'dagger' || weapon.key === 'rustyDagger'
      ? f.options.enemyWeapon === 'spear' ? 3 : f.options.enemyWeapon === 'sword' ? 2 : 1 : 1);
    if (!(f.spec.splitFerrets && f.foes[target].phase === 0 && target >= VOYAGE_RULES.ferretSplit)
      && (weapon.key !== 'spearJab' || f.options.enemyWeapon !== 'sword' || f.rounds % 2 === 1)) {
      for (let i = 0; i < rate && f.status === 'fighting'; i++) playerBlow(f, f.foes[target], random);
    }
    if (f.status === 'fighting') allyTurn(f, random);
  };
  if (f.first === 'player') { playerTurn(); if (f.status === 'fighting') enemyTurn(f, target, random, eligible); }
  else { enemyTurn(f, target, random); if (f.status === 'fighting') playerTurn(); }
  settle(f);
  return true;
}

function actionTarget(f, target) {
  if (f.status !== 'fighting') throw new RangeError('No active fight');
  const foe = f.foes[target];
  if (!foe || !voyageTargets(f).some(entry => entry.index === target)) throw new RangeError('Invalid target');
  return foe;
}

export function voyageFriendly(f, target, random = Math.random) {
  const foe = actionTarget(f, target);
  if (f.spec.friendly === false || f.rounds || f.friendlyForbidden || foe.friendlyTried) return null;
  foe.friendlyTried = true;
  const result = voyageFriendlyReaction(random);
  if (result.success) foe.bypassed = true;
  f.events = [{ kind: 'friendly', name: foe.name, ...result }];
  settle(f);
  return result;
}

export function voyageCast(f, spell, target, random = Math.random) {
  const p = f.player;
  if (f.status !== 'fighting' || f.spec.dream || p.shape !== 'human') return null;
  if (spell === 'wallbanger') {
    if (!p.wallbanger || p.wallbangerUsed) return null;
    p.wallbangerUsed = true; damagePlayer(f, Math.ceil(p.life / 2));
    f.wallbangerRound = f.rounds;
    f.events = [{ kind: 'wallbanger' }]; settle(f); return { success: true };
  }
  const foe = actionTarget(f, target);
  if (spell === 'crystalBlade') {
    if (!p.crystalBlade || f.spec.weaponImmune) return null;
    p.crystalBlade = false;
    const roll = f.spec.automaticMagicHit ? dice(random) : null;
    const success = roll === null || roll >= f.spec.automaticMagicHit;
    f.events = [{ kind: 'crystalBlade', roll, success }];
    if (success) hurtEnemy(f, foe, foe.life);
    return { success, roll };
  }
  if (spell === 'pigSpell') {
    if (!p.pigSpell) return null;
    p.pigSpell = false;
    const roll = dice(random), success = roll >= 4;
    if (success) Object.assign(foe, { life: 15, maxLife: 15, hit: 6, bonus: 0, armour: 0,
      fullDice: false, lethalHit: false, evilEye: false, halfCurrentLife: false,
      mummyPoison: false, multiplier: 1, pistol: false, attacks: 1 });
    f.events = [{ kind: 'pigSpell', roll, success }]; return { success, roll };
  }
  if (spell === 'illusion') {
    if (!p.illusion || foe.illusionImmune) return null;
    const roll = dice(random), belief = roll >= 11 ? die(random) : null;
    const success = belief !== null && belief > 3;
    if (belief !== null && !success) foe.illusionImmune = true;
    f.events = [{ kind: 'illusion', roll, belief, success }];
    if (success) hurtEnemy(f, foe, foe.life);
    return { success, roll, belief };
  }
  return null;
}

export function recruitVoyageArgonauts(player) {
  if (player.companions.length) return false;
  player.companions = clone(VOYAGE_ARGONAUTS).map((ally, index) => ({ ...ally, companionId: index }));
  return true;
}

export function voyageShadowRound(f, target, random = Math.random) {
  if (f.status !== 'fighting' || !f.spec.shadows) return null;
  const rules = f.spec.shadowRules ?? VOYAGE_ENCOUNTERS.find(entry => entry.shadows).shadowRules;
  const shadow = f.shadows[target];
  if (!shadow || shadow.banished) throw new RangeError('Invalid shadow');
  f.events = []; f.rounds++;
  if (f.player.light) {
    const roll = dice(random);
    if (roll >= rules.banish) shadow.banished = true;
    f.events.push({ kind: 'light', roll, success: shadow.banished });
  }
  for (const enemy of f.shadows.filter(s => !s.banished)) {
    const roll = enemy.gripped ? null : dice(random);
    if (roll !== null && roll >= rules.grip) enemy.gripped = true;
    if (enemy.gripped) damagePlayer(f, rules.damage);
    f.events.push({ kind: 'shadow', roll, damage: enemy.gripped ? rules.damage : 0 });
  }
  if (f.player.life <= 5) f.status = 'loss';
  else if (f.shadows.every(s => s.banished)) {
    f.status = 'win'; f.rewarded = true; f.player.experience++;
  }
  return f.events;
}

export function voyageThrowWeakening(f, target, random = Math.random) {
  actionTarget(f, target);
  if (f.rounds || f.spec.dream || !f.player.weakeningPotion) return null;
  f.player.weakeningPotion = false;
  const roll = dice(random), success = roll >= 6;
  if (success) f.foes[target].halfDamage = true;
  else f.friendlyForbidden = true;
  f.events = [{ kind: 'weakening', roll, success }];
  return { roll, success };
}

export function voyageSowTeeth(f, count, random = Math.random) {
  if (f.status !== 'fighting' || f.spec.dream || f.spec.shadows || f.rounds
    || !integer(count, 1) || count > f.player.dragonTeeth || f.player.shape !== 'human') return null;
  f.events = []; f.rounds++;
  f.player.dragonTeeth -= count;
  enemyTurn(f, voyageTargets(f)[0].index, random);
  if (f.status !== 'fighting') return { success: false, roll: null };
  const roll = dice(random), success = roll >= 6;
  if (success) f.allies.push(...Array.from({ length: count }, () => clone(VOYAGE_SUPPORT.dragonTooth)));
  f.events.push({ kind: 'teeth', count, roll, success });
  return { roll, success };
}

export function voyageGuardChallenge(random = Math.random) {
  const rules = VOYAGE_RULES.guardChallenge;
  const rolls = Array.from({ length: rules.dice }, () => die(random));
  if (rolls.every(roll => roll === rules.winEach)) return { rolls, status: 'win' };
  const fate = dice(random);
  return { rolls, fate, status: fate <= rules.fatalMax ? 'death' : 'captured', section: fate <= rules.fatalMax ? rules.deathDestination : rules.capturedDestination };
}

export function visitVoyageSection(player, section) {
  for (const key of ['sprainSections', 'limpSections']) {
    if (player[key].length) player[key].shift();
  }
  if (player.sectionPoison) player.life = Math.max(0, player.life - player.sectionPoison);
  if (player.mongoose) {
    if (player.gold >= VOYAGE_RULES.mongooseUpkeep) player.gold -= VOYAGE_RULES.mongooseUpkeep;
    else player.mongoose = false;
  }
  return { section, life: player.life };
}

function loseEquipment(p) {
  const fresh = createVoyageCharacter();
  for (const key of ['weapon', 'armour', 'armourPieces', 'gold', 'bolts', 'poisonHits', 'potions',
    'salves', 'quinine', 'antidotes', 'dragonTeeth', 'cricriEggs', 'spinach', 'vulcanArmour',
    'crystalBlade', 'wallbanger', 'illusion', 'pigSpell', 'talisman', 'light', 'weakeningPotion']) p[key] = fresh[key];
}

export function voyageBribe(f, target, random = Math.random) {
  const foe = actionTarget(f, target), p = f.player;
  if (f.rounds || foe.bribeTried || f.bribeTried || f.spec.dream || f.spec.bribe === false
    || !f.spec.bribe && !f.spec.equipmentBribe && !f.spec.eggBribe) return null;
  if (f.spec.equipmentBribe) {
    foe.bribeTried = true; loseEquipment(p);
  } else if (f.spec.eggBribe) {
    const cost = dice(random);
    foe.bribeTried = true;
    const success = p.cricriEggs >= cost;
    if (success) { p.cricriEggs -= cost; foe.bypassed = true; }
    f.events = [{ kind: 'bribe', cost, success, eggs: true }]; settle(f);
    return { cost, success };
  } else {
    if (p.gold < f.spec.bribe) return null;
    foe.bribeTried = true; p.gold -= f.spec.bribe;
    if (!f.spec.bribeEach) f.bribeTried = true;
  }
  const roll = dice(random), success = roll >= 8;
  if (success) {
    if (f.spec.bribe && !f.spec.bribeEach) for (const entry of f.foes) entry.bypassed = true;
    else foe.bypassed = true;
  }
  f.events = [{ kind: 'bribe', roll, cost: f.spec.bribe ?? 0, success }]; settle(f);
  return { roll, success, cost: f.spec.bribe ?? 0 };
}

export function voyageSleepingRex(f, random = Math.random) {
  if (f.status !== 'fighting' || !f.spec.sleepingRoll || f.rounds || f.sleepChecked) return null;
  f.sleepChecked = true;
  const roll = dice(random), success = roll >= f.spec.sleepingRoll;
  if (success) { f.status = 'avoided'; f.foes[0].bypassed = true; }
  f.events = [{ kind: 'sleepingRex', roll, success }];
  return { roll, success };
}

export function voyageLeaveFight(f) {
  if (f.status !== 'fighting' || f.rounds) return false;
  if (!voyageCanLeave(f.spec)) return false;
  damagePlayer(f, f.spec.refusalDamage ?? 0);
  f.status = f.player.life === 0 ? 'loss' : 'avoided';
  f.events = [{ kind: 'leave', damage: f.spec.refusalDamage ?? 0 }];
  return true;
}

export function voyageAfterSerpent(f) {
  if (f.status !== 'win' || !f.spec.victoryEquipmentLost || f.equipmentLost) return false;
  f.equipmentLost = true; loseEquipment(f.player); f.player.weapon = 'driftwood';
  return true;
}

const heal = (p, amount) => {
  const restored = Math.max(0, Math.min(amount, p.maxLife - p.life));
  p.life += restored;
  return restored;
};

export function useVoyageHealing(p, kind, random = Math.random) {
  if (p.life <= 0 || !['potions', 'salves'].includes(kind) || p[kind] <= 0) return null;
  p[kind]--;
  const amount = kind === 'potions' ? dice(random) : 3;
  return { amount: heal(p, amount), rolled: amount };
}

export function cureVoyageAilment(p, kind) {
  if (p.life <= 0) return false;
  if (kind === 'antidotes' && p.antidotes > 0 && p.sectionPoison) {
    p.antidotes--; p.sectionPoison = 0; return true;
  }
  if (kind === 'eggSpinach' && p.cricriEggs > 0 && p.spinach > 0 && p.sectionPoison) {
    p.cricriEggs--; p.spinach--; p.sectionPoison = 0; return true;
  }
  if (kind === 'quinine' && p.quinine > 0 && p.malaria) {
    p.quinine--; p.malaria = false; return true;
  }
  if (kind === 'malariaSupplies' && p.potions >= 6 && p.salves >= 1 && p.malaria) {
    p.potions -= 6; p.salves--; p.malaria = false; return true;
  }
  return false;
}

export function exchangeVoyageExperience(p) {
  if (p.experience < 20 || p.life <= 0) return false;
  p.experience -= 20; p.permanent++; p.maxLife++; p.life++;
  return true;
}

export function voyageDream(player, number, section, random = Math.random) {
  if (!integer(number, 2) || number > 12 || player.life <= 5) return null;
  const p = clone(player), result = { player: p, number, section, status: 'return', rolls: [] };
  const one = () => { const roll = die(random); result.rolls.push(roll); return roll; };
  const two = () => { const roll = dice(random); result.rolls.push(roll); return roll; };
  if (number === 2 && one() <= 3) p.life = 0;
  if ([3, 4].includes(number)) result.fight = createVoyageFight(`dream${number}`, p, {}, random);
  if (number === 5) {
    if (one() >= 5) result.amount = heal(p, two());
    else { p.life = Math.max(0, p.life - 10); result.damage = 10; }
  }
  if (number === 6) result.status = 'limerick';
  if (number === 7) {
    const roll = two();
    if (roll <= 6) result.fight = createVoyageFight('dream7', p, {}, random);
    else if (roll >= 11) p.gnurlbash = true;
  }
  if (number === 8 && one() >= 5) result.fight = createVoyageFight('dream8', p, {}, random);
  if (number === 9 && two() < 9) p.limpSections = Array(3).fill(section);
  if (number === 10) { const bonds = two(); if (two() <= bonds) p.life = 0; }
  if (number === 11) {
    let escaped = false;
    for (let i = 0; i < 5 && !escaped; i++) escaped = one() === 6;
    if (!escaped) p.life = 0;
  }
  if (number === 12) {
    const roll = one();
    if (roll <= 2) p.life = 0;
    else if (roll >= 5) result.status = 'dream-again';
  }
  if (p.life === 0) result.status = 'loss';
  else if (result.fight) { result.fight.returnSection = section; result.status = 'fight'; }
  return result;
}

export function voyageSleep(player, section, random = Math.random) {
  if (player.life <= 5) return null;
  const roll = die(random);
  if (roll <= 4) return { sleepRoll: roll, ...voyageDream(player, dice(random), section, random) };
  const p = clone(player);
  return { sleepRoll: roll, section, player: p, status: 'return', amount: heal(p, dice(random)) };
}

export function resolveVoyageLimerick(p, success) {
  if (typeof success !== 'boolean' || p.life <= 0) return false;
  if (!success) p.life = Math.max(0, p.life - 5);
  return true;
}

export function voyageNavigationMishap(player, destination, number, random = Math.random) {
  if (!integer(number, 1) || number > 6 || player.life <= 5) return null;
  const p = clone(player), result = { player: p, number, destination, status: 'return', rolls: [] };
  if (number === 1) result.fight = createVoyageFight('navigation1', p, {}, random);
  if (number === 2) {
    const roll = dice(random); result.rolls.push(roll);
    if (roll <= 6) result.fight = createVoyageFight('navigation2', p, {}, random);
  }
  if (number === 3) {
    const roll = dice(random); result.rolls.push(roll);
    result.damage = roll > 6 ? 10 : 1;
    p.life = Math.max(0, p.life - result.damage);
    if (roll <= 6) p.malaria = true;
  }
  if (number === 4) {
    const roll = dice(random); result.rolls.push(roll);
    if (roll <= 7) p.life = 0;
    else if (roll <= 10) p.life = Math.max(0, p.life - 15);
  }
  if (number === 5) {
    const roll = die(random); result.rolls.push(roll); p.cricriEggs += roll;
  }
  if (number === 6) result.fight = createVoyageFight('navigation6', p, {}, random);
  if (p.life === 0) result.status = 'loss';
  else if (result.fight) { result.fight.destination = destination; result.status = 'fight'; }
  return result;
}

export function navigateVoyage(player, destination, random = Math.random) {
  if (player.life <= 5) return null;
  const arrival = voyageNavigation(random);
  if (arrival.arrived) return { player: clone(player), destination, status: 'return', roll: arrival.roll };
  return { roll: arrival.roll, ...voyageNavigationMishap(player, destination, die(random), random) };
}

export function escapeVoyageCannibals(f, random = Math.random) {
  if (f.status !== 'win' || !f.spec.escapeRoll || f.escapeChecked) return null;
  f.escapeChecked = true;
  const roll = dice(random), success = roll >= f.spec.escapeRoll;
  if (!success) { damagePlayer(f, f.player.life); f.status = 'loss'; }
  f.events = [{ kind: 'escape', roll, success }];
  return { roll, success };
}

export function callVoyageGnurlbash(f) {
  if (f.status !== 'fighting' || f.spec.dream || !f.player.gnurlbash || f.spec.shadows
    || f.allies.some(ally => ally.gnurlbash)) return false;
  f.player.gnurlbash = false;
  f.allies.push({ ...clone(VOYAGE_SUPPORT.gnurlbash), expiresOnEnemy: voyageTargets(f)[0].index });
  return true;
}
