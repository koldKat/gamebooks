// Car Wars rules. Encounter identities, printed opponents and vehicle profiles
// are supplied by the database roster, never selected by book ID here.
const copy = value => structuredClone(value);
const integer = (value, min = 0, max = 100000) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Enter a valid whole number');
  return value;
};
const die = roll => integer((roll ?? (() => 1 + Math.floor(Math.random() * 6)))(6), 1, 6);
const dice = (count, roll) => Array.from({length: count}, () => die(roll));
const sum = values => values.reduce((a, b) => a + b, 0);
const random = (values, roll) => {
  if (!values.length) return null;
  // Rejection sampling supports any number of components without favouring one.
  let sides = 6, count = 1;
  while (sides < values.length) { sides *= 6; count++; }
  for (let attempt = 0; attempt < 100; attempt++) {
    let pick = 0;
    for (let i = 0; i < count; i++) pick = pick * 6 + die(roll) - 1;
    if (pick < sides - sides % values.length) return values[pick % values.length];
  }
  throw new RangeError('Random component roll did not resolve');
};
const liveWeapon = weapon => weapon.boxes > 0 && (!weapon.oneShot || weapon.ammo > 0);
const label = unit => unit.displayName || unit.name || (unit.kind === 'vehicle' ? 'Vehicle' : 'Person');

export function validateCombatant(source) {
  const unit = copy(source);
  if (!['person', 'vehicle'].includes(unit.kind)) throw new RangeError('Choose a combatant type');
  integer(unit.hp); integer(unit.defenseClass); integer(unit.gunnery);
  unit.initialDefenseClass ??= unit.defenseClass;
  unit.maxHp ??= unit.hp;
  if (unit.repairableMaximumHp != null) unit.maxHp = Math.max(unit.maxHp, integer(unit.repairableMaximumHp));
  integer(unit.maxHp, unit.hp);
  unit.skipFire = integer(unit.skipFire ?? 0);
  unit.skipTurn = integer(unit.skipTurn ?? 0);
  if (unit.kind === 'person') {
    unit.armour = integer(unit.armour ?? 0);
    unit.unconsciousAt = integer(unit.unconsciousAt ?? 1);
    unit.weapon ??= {name: 'Hand weapon', flatDamage: 1, bonus: 0};
    weaponStats(unit.weapon, false);
  } else {
    if (unit.handling != null) integer(unit.handling, -100);
    if (unit.driving != null) integer(unit.driving);
    if (unit.driving == null) integer(unit.controlRoll, -100);
    unit.baseHandling ??= unit.handling ?? 0;
    unit.computerBonus = integer(unit.computerBonus ?? 0);
    unit.driverHp = integer(unit.driverHp ?? 3);
    unit.driverArmour = integer(unit.driverArmour ?? 0);
    unit.gunnerHp = integer(unit.gunnerHp ?? 0);
    unit.gunnerArmour = integer(unit.gunnerArmour ?? 0);
    unit.gunnerGunnery = integer(unit.gunnerGunnery ?? 0);
    unit.cargo = integer(unit.cargo ?? 0);
    unit.gadgets ??= [];
    unit.ramplate ??= !!unit.ramPlate;
    if (unit.smokeScreenBoxes != null && !unit.gadgets.some(g=>g.smokeScreen)) unit.gadgets.push({name:'Smokescreen',boxes:integer(unit.smokeScreenBoxes),smokeScreen:true});
    if (unit.computerBonus && !unit.gadgets.some(g => g.computer)) unit.gadgets.push({name:'Targeting computer',boxes:1,computer:true});
    unit.powerPlant ??= {boxes: 1};
    integer(unit.powerPlant.boxes); unit.powerPlant.maxBoxes ??= unit.powerPlant.boxes;
    if (!Array.isArray(unit.weapons) || !unit.weapons.length) throw new RangeError('Add a vehicle weapon');
    unit.weapons.forEach(weapon => {
      weaponStats(weapon, true);
      weapon.maxBoxes ??= weapon.boxes;
      if (weapon.shots != null) { weapon.oneShot = true; weapon.ammo ??= weapon.shots; }
      // Basic ammunition is unlimited except explicitly single-use rockets.
      if (weapon.oneShot) weapon.ammo ??= 1;
      else weapon.ammo ??= /laser/i.test(weapon.name) ? null : /machine|vulcan|paint|oil/i.test(weapon.name) ? 20 : 10;
      if (weapon.ammo != null) integer(weapon.ammo);
    });
  }
  return unit;
}
function weaponStats(weapon, boxes) {
  integer(weapon.bonus ??= 0, -100);
  if (weapon.flatDamage != null) integer(weapon.flatDamage);
  else integer(weapon.damageDice, 1, 10);
  if (boxes) integer(weapon.boxes);
}
export function controlCheck(unit, roll, modifier = 0, strict = false) {
  const target = (unit.driving != null ? unit.driving + (unit.handling ?? 0)
    : unit.controlRoll + (unit.handling ?? 0) - (unit.baseHandling ?? 0)) + modifier;
  const first = die(roll);
  // A printed control target of 6 is not an automatic success.
  const second = !strict && target >= 6 && first === 6 ? die(roll) : null;
  const passed = (strict ? first < target : first <= target) && !(first === 6 && second === 6);
  return {target, dice: second == null ? [first] : [first, second], passed};
}
export function combatantOut(unit, rules = {}) {
  if (unit.kind === 'person') return unit.hp <= unit.unconsciousAt;
  return unit.hp === 0 || unit.driverHp <= 1 || unit.out === true
    || rules.plantEndsPursuit && unit.powerPlant.boxes === 0
    || rules.weaponEndsPursuit && !unit.weapons.some(w => w.name === rules.weaponEndsPursuit && w.boxes > 0);
}
function event(fight, text) { fight.events.push(text); }
function finish(fight, status, section) { fight.status = status; fight.section = section ?? null; }
function settle(fight) {
  const {hero, rules} = fight;
  if (hero.needsReplacementDriver && hero.hp > 0) { finish(fight, 'awaitingDriver'); return; }
  if (combatantOut(hero)) { finish(fight, 'loss', hero.kind === 'vehicle' && hero.driverHp > 1 && hero.hp > 0 ? rules.crash ?? rules.defeat : rules.defeat); return; }
  const defeated = fight.enemies.filter(e => combatantOut(e, rules)).length;
  if (defeated === fight.enemies.length) { finish(fight, 'win', rules.victory); return; }
  if (rules.enemyWeaponLoss && fight.enemies.some(e => e.weapons?.some(w => w.name === rules.enemyWeaponLoss.name && w.boxes === 0))) {
    finish(fight, 'branch', rules.enemyWeaponLoss.paragraph); return;
  }
  if (rules.playerWeaponLoss && !hero.weapons?.some(w => liveWeapon(w) && rules.playerFacing.includes(w.direction))) {
    finish(fight, 'branch', rules.playerWeaponLoss); return;
  }
  if (rules.pauseAfterDefeated && !rules.fightToDeath && defeated >= rules.pauseAfterDefeated) {
    // Remove only the temporary encounter penalty, retaining special damage.
    hero.defenseClass += fight.remainingDefensePenalty ?? 0;
    fight.remainingDefensePenalty = 0;
    finish(fight, 'paused', rules.pauseParagraph);
  }
}
export function startFight(hero, entry, options = {}, roll) {
  if (!entry?.enemies?.length || !entry.rules) throw new RangeError('Choose opponents');
  const fight = {rulesVersion: 1, encounter: entry.label || 'Custom fight', baseSection: entry.baseSection ?? entry.section,
    sourceSection: entry.section, rules: copy(entry.rules), hero: validateCombatant(hero),
    enemies: entry.enemies.map(validateCombatant), status: 'fighting', round: 0, events: [],
    options: {advancedAmmo: !!options.advancedAmmo, sustainedFire: !!options.sustainedFire}, section: null};
  if (fight.rules.kind === 'fist') {
    fight.playerPunches = 0; fight.enemyPunches = 0;
    return fight;
  }
  if (fight.hero.kind !== (fight.rules.kind === 'personal' ? 'person' : 'vehicle')) throw new RangeError('Use the matching character or vehicle');
  fight.remainingDefensePenalty = fight.rules.defensePenalty ?? 0;
  fight.hero.defenseClass = Math.max(0, fight.hero.defenseClass - fight.remainingDefensePenalty);
  if (fight.rules.ramRandomEnemy) {
    const target = random(fight.enemies, roll); target.out = true;
    event(fight, `The ram takes ${label(target)} out of this fight.`);
    if (fight.enemies.indexOf(target) === fight.rules.leaderIndex) fight.rules.fightToDeath = true;
  }
  if (fight.rules.entryGeneralDamageDice) generalDamage(fight, fight.hero, sum(dice(fight.rules.entryGeneralDamageDice, roll)));
  for (const index of fight.rules.entryEnemyAttacks ?? []) {
    enemyAttack(fight, index, roll); settle(fight);
    if (fight.status !== 'fighting') break;
  }
  settle(fight);
  return fight;
}
export function resumeFight(previous, entry) {
  if (!previous || !['fighting', 'paused', 'branch'].includes(previous.status)
      || String(previous.baseSection) !== String(entry.baseSection ?? entry.section)) throw new RangeError('No matching unfinished fight to resume');
  const fight = copy(previous), old = fight.rules;
  fight.rules = {...old, ...copy(entry.rules), defensePenalty:entry.rules.defensePenalty??0};
  if (fight.remainingDefensePenalty) fight.hero.defenseClass += fight.remainingDefensePenalty;
  fight.remainingDefensePenalty = fight.rules.defensePenalty ?? 0;
  fight.hero.defenseClass = Math.max(0, fight.hero.defenseClass - fight.remainingDefensePenalty);
  // A change of tactics does not reload the enemy's damage or ammunition.
  if (entry.weaponReplacement) {
    for (const enemy of fight.enemies) {
      const index = entry.weaponReplacement.index;
      const before = enemy.weapons[index], replacement = copy(entry.weaponReplacement.weapon);
      const lost = Math.max(0, (before.maxBoxes ?? before.boxes) - before.boxes);
      replacement.maxBoxes = replacement.boxes;
      replacement.boxes = Math.max(0, replacement.boxes - lost);
      enemy.weapons[index] = replacement;
    }
  }
  fight.sourceSection = entry.section; fight.status = 'fighting'; fight.section = null;
  fight.recorded = false; fight.events = ['The fight resumes with its existing damage.'];
  if (entry.rules.resumePrior && entry.enemyIndices?.length === 1 && fight.enemies.filter(e => !combatantOut(e, fight.rules)).length !== 1)
    throw new RangeError('Resolve the ram first; exactly one pursuer must remain');
  settle(fight);
  return fight;
}
function generalDamage(fight, unit, amount) {
  unit.hp = Math.max(0, unit.hp - amount);
  event(fight, `${label(unit)} takes ${amount} general damage (${unit.hp} HP left).`);
}
function personalDamage(fight, unit, amount) {
  const absorbed = Math.min(unit.armour ?? 0, amount);
  unit.armour = Math.max(0, (unit.armour ?? 0) - absorbed);
  unit.hp = Math.max(0, unit.hp - (amount - absorbed));
  event(fight, `${label(unit)} takes ${amount} damage (${absorbed} absorbed; ${unit.hp} HP left).`);
}
function specialDamage(fight, unit, roll) {
  // If a result has no remaining applicable component, roll the table again.
  for (let attempt = 0; attempt < 100; attempt++) {
    const table = sum(dice(2, roll));
    const weapons = unit.weapons.filter(w => w.boxes > 0);
    let applied = false, detail = '';
    if ([2, 3].includes(table)) {
      const driver = table === 2, hp = driver ? 'driverHp' : 'gunnerHp', armour = driver ? 'driverArmour' : 'gunnerArmour';
      if (unit[hp] > 0) {
        if (unit[armour] > 0) unit[armour]--; else unit[hp]--;
        unit[driver ? 'skipFire' : 'gunnerSkipFire'] = 1;
        detail = `${driver ? 'Driver' : 'Gunner'} hit`; applied = true;
      }
    } else if (table === 4 && unit.cargo > 0) { unit.cargo--; detail = 'Cargo damaged'; applied = true;
    } else if ([5, 12].includes(table) && unit.powerPlant.boxes > 0) {
      const amount = die(roll); unit.powerPlant.boxes = Math.max(0, unit.powerPlant.boxes - amount);
      detail = `Power plant loses ${amount} boxes`; applied = true;
    } else if ([6, 8, 10].includes(table) && weapons.length) {
      const weapon = random(weapons, roll), amount = table === 6 ? 1 : table === 8 ? 2 : die(roll);
      weapon.boxes = Math.max(0, weapon.boxes - amount); detail = `${weapon.name} loses ${amount} boxes`; applied = true;
    } else if (table === 7) { unit.defenseClass = Math.max(0, unit.defenseClass - 1); detail = 'Defense Class −1'; applied = true;
    } else if (table === 9) { unit.handling = (unit.handling ?? 0) - 1; detail = 'Handling −1'; applied = true;
    } else if (table === 11 && unit.gadgets.some(g => g.boxes > 0)) {
      const gadget = random(unit.gadgets.filter(g => g.boxes > 0), roll); gadget.boxes = 0;
      if (gadget.computer) unit.computerBonus = 0;
      detail = `${gadget.name} destroyed`; applied = true;
    }
    if (!applied) continue;
    event(fight, `Special damage ${table}: ${label(unit)}: ${detail}.`);
    const control = controlCheck(unit, roll);
    event(fight, `Control ${control.dice.join('+')} against ${control.target}: ${control.passed ? 'held' : 'lost; miss next turn'}.`);
    if (!control.passed) unit.skipTurn = 1;
    if (unit.driverHp <= 1 && unit.gunnerHp > 1) {
      // The replacement driver's Driving must be supplied explicitly by the player.
      if (unit.gunnerDriving == null) {
        unit.needsReplacementDriver = true;
      } else {
        unit.driverHp = unit.gunnerHp; unit.driverArmour = unit.gunnerArmour;
        unit.driving = integer(unit.gunnerDriving); unit.gunnery = unit.gunnerGunnery;
        unit.gunnerHp = 0; unit.gunnerArmour = 0;
        event(fight, 'The gunner takes over driving.');
      }
    }
    return;
  }
  throw new RangeError('No applicable special damage after 100 rolls');
}
function weaponReady(unit, weapon, fight) {
  return liveWeapon(weapon) && (!fight.options.advancedAmmo || weapon.ammo == null || weapon.ammo > 0)
    && (!/laser/i.test(weapon.name) || unit.powerPlant.boxes > 0);
}
function attack(fight, attacker, target, weapon, roll, options = {}) {
  const vehicle = attacker.kind === 'vehicle';
  if (vehicle) {
    if (!weaponReady(attacker, weapon, fight)) throw new RangeError('Weapon unavailable');
    if (weapon.oneShot || fight.options.advancedAmmo && weapon.ammo != null) weapon.ammo--;
  }
  const attackDice = dice(2, roll);
  let sustained = 0;
  const targetKey = target.key ?? target.name;
  if (fight.options.sustainedFire && vehicle) {
    sustained = attacker.lastTarget === targetKey && attacker.lastFiredRound === fight.round - 1 ? Math.min(2, (attacker.sustained ?? 0) + 1) : 0;
    // The second weapon in a turn uses the same consecutive-turn bonus.
    if (attacker.lastFiredRound === fight.round && attacker.lastTarget === targetKey) sustained = attacker.sustained ?? 0;
    attacker.sustained = sustained; attacker.lastTarget = targetKey; attacker.lastFiredRound = fight.round;
  }
  const total = sum(attackDice) + (options.gunnery ?? attacker.gunnery) + (weapon.bonus ?? 0)
    + (vehicle ? attacker.computerBonus : 0) + sustained;
  const defense = target.defenseClass + (options.defenseBonus ?? 0)
    + (target.frontDefenseClass && fight.rules.enemyFrontDefense && target !== fight.hero ? target.frontDefenseClass - (target.initialDefenseClass ?? target.defenseClass) : 0);
  const hit = total > defense;
  event(fight, `${label(attacker)}: ${weapon.name}: ${attackDice.join('+')} → ${total} vs DC ${defense}: ${hit ? 'hit' : 'miss'}.`);
  if (!hit) return;
  let values = weapon.flatDamage != null ? [weapon.flatDamage] : dice(options.damageDice ?? weapon.damageDice, roll);
  if (target.kind === 'person') {
    personalDamage(fight, target, sum(values));
  } else {
    generalDamage(fight, target, weapon.vehicleFlatDamage ?? sum(values));
    // Flat hand-weapon damage is not a rolled 1 on the damage die.
    if (weapon.flatDamage == null) for (const value of values) if (value === 1) specialDamage(fight, target, roll);
  }
}
function enemyAttack(fight, index, roll, defenseBonus = 0) {
  const enemy = fight.enemies[index];
  if (!enemy || combatantOut(enemy, fight.rules)) return;
  if (enemy.skipTurn > 0) { enemy.skipTurn--; event(fight, `${label(enemy)} misses a turn recovering control.`); return; }
  if (enemy.skipFire > 0) { enemy.skipFire--; event(fight, `${label(enemy)} misses a shot after a crew hit.`); return; }
  if (enemy.kind === 'person') { attack(fight, enemy, fight.hero, enemy.weapon, roll); return; }
  let weapons = enemy.weapons.filter(w => weaponReady(enemy, w, fight) && (fight.rules.enemyFacing ?? ['front']).includes(w.direction));
  if (!weapons.length) { event(fight, `${label(enemy)} has no usable weapon facing you.`); return; }
  if (fight.rules.enemyRocketSequence) weapons = weapons.filter(w => w.oneShot).length ? weapons.filter(w => w.oneShot) : weapons;
  const first = weapons[0];
  weapons = first.linkedGroup ? weapons.filter(w => w.linkedGroup === first.linkedGroup) : [first];
  for (const weapon of weapons) {
    if (combatantOut(fight.hero)) break;
    attack(fight, enemy, fight.hero, weapon, roll, {defenseBonus, damageDice: fight.foam && /laser/i.test(weapon.name) ? 1 : undefined});
  }
}
function active(fight) {
  if (fight?.rulesVersion !== 1 || fight.status !== 'fighting') throw new RangeError('No active fight');
  if (fight.hero.needsReplacementDriver) throw new RangeError('Enter the replacement driver’s Driving before continuing');
}
export function fightRound(previous, action = {}, roll) {
  active(previous);
  const fight = copy(previous); fight.events = [];
  if (fight.rules.kind !== 'fist') {settle(fight);if(fight.status!=='fighting')return fight;}
  fight.round++;
  if (fight.rules.kind === 'fist') {
    const heroRoll = die(roll); event(fight, `Your punch: ${heroRoll} vs Gunnery ${fight.hero.gunnery}.`);
    if (heroRoll <= fight.hero.gunnery) fight.playerPunches++;
    if (fight.playerPunches >= fight.rules.playerPunchesNeeded) finish(fight, 'win', fight.rules.victory);
    else {
      const enemyRoll = die(roll); event(fight, `Opponent’s punch: ${enemyRoll} vs Gunnery ${fight.enemies[0].gunnery}.`);
      if (enemyRoll <= fight.enemies[0].gunnery) fight.enemyPunches++;
      if (fight.enemyPunches >= fight.rules.enemyPunchesNeeded) finish(fight, 'loss', fight.rules.defeat);
    }
    return fight;
  }
  const target = fight.enemies[integer(action.target ?? 0, 0, fight.enemies.length - 1)];
  if (combatantOut(target, fight.rules)) throw new RangeError('Choose a surviving opponent');
  const hero = fight.hero;
  const smoke = action.smoke === true;
  const grenadeAvailable = !(hero.gunnerSkipFire > 0);
  if (action.grenade && (!fight.rules.gunnerGrenades || hero.grenades < 1 || hero.gunnerHp <= 1 || smoke)) throw new RangeError('Hand grenade unavailable');
  if (smoke && (!fight.rules.canUseSmoke || hero.smokeCharges < 1 || hero.gunnerHp <= 1)) throw new RangeError('Smoke requires a charge and an active gunner');
  if (smoke) { hero.smokeCharges--; event(fight, 'Smoke: Defense Class +3 this turn.'); }
  const defenseBonus = (smoke ? 3 : 0) + (fight.foam ? 1 : 0);
  const skip = hero.skipTurn > 0;
  if (skip) { hero.skipTurn--; event(fight, 'You miss this turn recovering control.'); }
  const player = () => {
    if (combatantOut(hero) || skip) return;
    if (hero.kind === 'person') {
      if (hero.skipFire > 0) { hero.skipFire--; return; }
      attack(fight, hero, target, hero.weapon, roll); return;
    }
    const picks = action.weapons ?? [];
    if (!picks.length) event(fight, 'You hold your fire.');
    if (new Set(picks).size !== picks.length) throw new RangeError('A weapon may fire only once per turn');
    const selected = picks.map(i => hero.weapons[integer(i, 0, hero.weapons.length - 1)]);
    if (selected.some(w => !(fight.rules.playerFacing ?? ['front','rear','left','right','turret']).includes(w.direction))) throw new RangeError('That weapon cannot face the enemy');
    const groups = new Map();
    for (const weapon of selected) {
      const key = weapon.linkedGroup || weapon;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(weapon);
    }
    const driverAvailable = hero.skipFire === 0;
    const gunnerAvailable = hero.gunnerSeat && hero.gunnerHp > 1 && !(hero.gunnerSkipFire > 0) && !fight.rules.angelaCannotFire && !smoke && !action.grenade;
    if (groups.size > Number(driverAvailable) + Number(gunnerAvailable)) throw new RangeError('One weapon per available crew member; linked weapons share one firing action');
    const gunnerFirst = !driverAvailable;
    let index = 0;
    for (const weapons of groups.values()) {
      if (hero.maxLinkedShots && weapons.length > hero.maxLinkedShots) throw new RangeError('Too many linked weapons selected');
      const gunnery = index++ === 0 && !gunnerFirst ? hero.gunnery : hero.gunnerGunnery;
      for (const weapon of weapons) {
        if (combatantOut(target, fight.rules)) break;
        attack(fight, hero, target, weapon, roll, {gunnery});
      }
    }
    if (hero.skipFire > 0) hero.skipFire--;
    if (hero.gunnerSkipFire > 0) hero.gunnerSkipFire--;
    if (action.grenade && grenadeAvailable) {
      hero.grenades--;
      const hit = die(roll) === 1; event(fight, `Gunner’s hand grenade: ${hit ? 'hit' : 'miss'}.`);
      const targets=fight.enemies.filter(e=>!combatantOut(e,fight.rules));
      if (hit&&targets.length) generalDamage(fight,random(targets,roll),die(roll));
    }
  };
  const enemies = () => {
    for (let i = 0; i < fight.enemies.length; i++) {
      enemyAttack(fight, i, roll, defenseBonus); settle(fight);
      if (fight.status !== 'fighting' || hero.needsReplacementDriver) break;
    }
  };
  if (fight.rules.enemyFirst) { enemies(); if (fight.status === 'fighting' && !hero.needsReplacementDriver) player(); }
  else { player(); settle(fight); if (fight.status === 'fighting') enemies(); }
  settle(fight);
  return fight;
}
// Story tactics are explicit actions; none silently navigates or edits a run.
export function tactic(previous, kind, options = {}, roll) {
  if (!(previous?.status === 'paused' && ['continue','leave'].includes(kind))) active(previous);
  const fight = copy(previous), hero = fight.hero; fight.events = [];
  const rule = fight.rules.tactics?.[kind];
  if (!rule) throw new RangeError('This tactic is not offered here');
  if (rule.leaderMustSurvive && combatantOut(fight.enemies[fight.rules.leaderIndex], fight.rules)) throw new RangeError('Their leader is down; they fight to the death');
  if (kind === 'foam') { fight.foam = true; event(fight, 'Fireproof foam: Defense Class +1; laser hits roll one damage die.'); }
  if (kind === 'smokeEscape') {
    if (hero.smokeCharges < 1) throw new RangeError('No smoke charges');
    hero.smokeCharges--; const result = die(roll); event(fight, `Smoke escape: ${result}.`);
    if (rule.success.includes(result)) finish(fight, 'escaped', rule.destination);
    else if (rule.damageResults?.includes(result)) generalDamage(fight, hero, sum(dice(rule.damageDice ?? 1, roll)));
    else if (rule.damageEqualsRoll) generalDamage(fight, hero, result);
    if (hero.hp === 0) finish(fight, 'loss', rule.defeat ?? fight.rules.defeat);
  }
  if (kind === 'grenadeEscape') {
    if (hero.grenades < 1) throw new RangeError('No grenades');
    hero.grenades--; const result = die(roll); event(fight, `Dropped grenade: ${result}.`);
    if (result === rule.success) finish(fight, 'escaped', rule.destination);
    // The pursuer cannot fire while the grenade is being dropped.
  }
  if (kind === 'escape') {
    const result = controlCheck(hero, roll, rule.modifier ?? 0, !!rule.strict);
    event(fight, `Escape control: ${result.dice.join('+')} vs ${result.target}.`);
    finish(fight, result.passed ? 'escaped' : 'loss', result.passed ? rule.destination : rule.defeat);
  }
  if (kind === 'ram') {
    const target = fight.enemies[integer(options.target ?? 0, 0, fight.enemies.length - 1)];
    if (combatantOut(target, fight.rules)) throw new RangeError('Choose a surviving opponent');
    generalDamage(fight, hero, sum(dice(hero.ramplate ? rule.heroRamplateDice : rule.heroDice, roll)));
    generalDamage(fight, target, sum(dice(hero.ramplate ? rule.enemyRamplateDice : rule.enemyDice, roll)));
  }
  if (kind === 'leave') finish(fight, 'escaped', rule.destination);
  if (kind === 'continue') { fight.rules.fightToDeath = true; fight.status = 'fighting'; fight.section = null; event(fight, 'The fight continues to its conclusion.'); }
  if (fight.status === 'fighting') settle(fight);
  return fight;
}
export function repairVehicle(source, component, mechanic, roll, amount = 1) {
  const unit = validateCombatant(source);
  if (unit.kind !== 'vehicle') throw new RangeError('Choose a vehicle');
  integer(mechanic); integer(amount, 1);
  if (unit.hp === 0 && unit.powerPlant.boxes === 0 && unit.weapons.every(w => w.boxes === 0)) throw new RangeError('This vehicle is beyond repair');
  const result = die(roll), success = result <= mechanic;
  if (success) {
    if (component === 'hp') unit.hp = Math.min(unit.maxHp, unit.hp + amount);
    else if (component === 'plant') unit.powerPlant.boxes = Math.min(unit.powerPlant.maxBoxes, unit.powerPlant.boxes + amount);
    else {
      const weapon = unit.weapons[integer(component, 0, unit.weapons.length - 1)];
      weapon.boxes = Math.min(weapon.maxBoxes, weapon.boxes + amount);
    }
  }
  return {unit, roll: result, success};
}
export function replaceDriver(previous, driving) {
  const fight = copy(previous), unit = fight.hero;
  if (!unit.needsReplacementDriver || unit.gunnerHp <= 1) throw new RangeError('No replacement driver available');
  unit.driverHp = unit.gunnerHp; unit.driverArmour = unit.gunnerArmour; unit.driving = integer(driving);
  unit.gunnery = unit.gunnerGunnery; unit.gunnerHp = 0; unit.gunnerArmour = 0;
  unit.needsReplacementDriver = false; fight.status = 'fighting'; fight.section = null;
  fight.events = ['The gunner takes over driving.']; settle(fight);
  return fight;
}
