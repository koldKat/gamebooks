// Multi-vehicle Car Wars encounters. All identities, rosters and exceptional
// outcomes are declarative database data. Existing single-sided saves use core.js.
import {controlCheck, repairVehicle} from './core.js';
import {assignWeapons, crewAlive, firingCrew, installRobotGunner,
  personalWeaponDamage, replaceCrewDriver, targetingBonus} from './crew.js';
export {repairVehicle};

const copy = value => structuredClone(value);
const whole = (value, min = 0) => {
  if (!Number.isSafeInteger(value) || value < min) throw new RangeError('Enter a valid whole number');
  return value;
};
const die = roll => {
  const value = whole((roll ?? (() => 1 + Math.floor(Math.random() * 6)))(6), 1);
  if (value > 6) throw new RangeError('Invalid die');
  return value;
};
const dice = (count, roll) => Array.from({length:count}, () => die(roll));
const sum = values => values.reduce((a,b) => a+b, 0);
const name = unit => unit.displayName || unit.name || 'Combatant';
function pick(values, roll) {
  if (!values.length) return null;
  let size = 6, count = 1;
  while (size < values.length) {size *= 6; count++;}
  for (let tries = 0; tries < 100; tries++) {
    let n = 0;
    for (let i = 0; i < count; i++) n = n * 6 + die(roll) - 1;
    if (n < size - size % values.length) return values[n % values.length];
  }
  throw new RangeError('Target roll did not resolve');
}
const event = (fight, text) => fight.events.push(text);
const finish = (fight, status, section) => {fight.status = status; fight.section = section ?? null;};
const side = (fight, unit) => unit === fight.hero || fight.allies.includes(unit) ? 'friendly' : 'enemy';
const friendly = fight => [fight.hero, ...fight.allies];
export const combatTargets = fight => [...fight.enemies, ...(fight.supporters ?? [])];
const everyone = fight => [...friendly(fight), ...combatTargets(fight)];

export function validateCombatant(source) {
  const unit = copy(source);
  if (!['person','vehicle'].includes(unit.kind)) throw new RangeError('Choose a combatant type');
  whole(unit.hp); whole(unit.defenseClass);
  unit.maxHp ??= unit.hp; whole(unit.maxHp, unit.hp);
  if (unit.gunnery != null) whole(unit.gunnery, -100);
  else if (unit.kind === 'person' && unit.canAttack !== false) throw new RangeError('Enter the missing Gunnery');
  unit.skipTurn ??= 0; unit.skipFire ??= 0; unit.gunnerSkipFire ??= 0;
  if (unit.kind === 'person') {
    unit.armour ??= 0; unit.unconsciousAt ??= 1; whole(unit.armour); whole(unit.unconsciousAt);
    if (!unit.weapon) throw new RangeError('Choose a personal weapon');
  } else {
    if (!unit.unattended) whole(unit.driving);
    else unit.canAttack = false;
    whole(unit.handling, -100);
    unit.baseHandling ??= unit.handling;
    unit.driverHp ??= 3; unit.driverArmour ??= 0; unit.gunnerHp ??= 0; unit.gunnerArmour ??= 0;
    for (const key of ['driverHp','driverArmour','gunnerHp','gunnerArmour']) whole(unit[key]);
    if (unit.gunnerGunnery != null) whole(unit.gunnerGunnery, -100);
    if (!unit.unattended && unit.gunnery == null && !(unit.gunnerSeat && unit.gunnerGunnery != null))
      throw new RangeError('Enter the missing driver Gunnery');
    unit.gadgets ??= []; unit.computerBonus ??= 0; unit.cargo ??= 0;
    whole(unit.powerPlant?.boxes); unit.powerPlant.maxBoxes ??= unit.powerPlant.boxes;
    if (!unit.weapons?.length) throw new RangeError('Add a vehicle weapon');
    for (const weapon of unit.weapons) {
      whole(weapon.boxes); whole(weapon.bonus ??= 0, -100); whole(weapon.damageDice, weapon.effect && weapon.flatDamage === 0 ? 0 : 1);
      weapon.maxBoxes ??= weapon.boxes;
      weapon.ammo ??= weapon.oneShot ? 1 : /laser/i.test(weapon.name) ? null
        : weapon.ammoCapacity ?? (/machine|vulcan|paint|oil/i.test(weapon.name) ? 20 : 10);
      if (weapon.ammo != null) whole(weapon.ammo);
    }
  }
  return unit;
}

export function combatantOut(unit) {
  if (unit.out || unit.escaped) return true;
  return unit.kind === 'person' ? unit.hp <= unit.unconsciousAt
    : unit.hp === 0 || unit.powerPlant.boxes === 0 && !unit.allowImmobilizedFire || !crewAlive(unit, 'driver')
      || unit.stabilizingRotor?.hp === 0 || unit.mainRotor?.hp === 0;
}

function control(fight, unit, roll) {
  const painted = unit.blindUntilRound != null && fight.round <= unit.blindUntilRound;
  const oiled = everyone(fight).some(other => other.oilActive && other !== unit
    && (unit.relativePosition === 'behind' || unit === fight.hero && other.relativePosition === 'ahead'));
  return controlCheck({...unit, ...(painted ? {driving:0} : {}), ...(oiled ? {handling:0} : {})},roll);
}

function heroDead(fight) {
  const hero = fight.hero;
  return hero.kind === 'person' ? hero.hp === 0 : (fight.rules.heroIsGunner ? hero.gunnerHp : hero.driverHp) === 0;
}
function settle(fight) {
  const {hero,rules} = fight;
  if (rules.scenarioCombat) {
    const helicopter = fight.enemies.find(unit => unit.helicopter);
    if (helicopter?.driverHp === 0 && rules.pilotKilledDestination) {
      finish(fight,'win',rules.pilotKilledDestination); return;
    }
    if (helicopter?.gunnerHp === 0 && rules.gunnerKilledDestination) {
      finish(fight,'branch',rules.gunnerKilledDestination); return;
    }
    if (rules.heroPlantLossEnds && hero.kind === 'vehicle' && hero.powerPlant.boxes === 0) {
      finish(fight,'loss',rules.defeat); return;
    }
    if (rules.opponentBodyHpAtSurrender != null && fight.enemies[0].hp <= rules.opponentBodyHpAtSurrender) {
      finish(fight,'win',rules.victory); return;
    }
  }
  if (heroDead(fight)) {finish(fight,'loss',rules.heroKilled ?? rules.defeat); return;}
  if (rules.protectedDriverDeathEnds && fight.allies.some(u => u.protectedPassenger && u.driverHp === 0)) {
    finish(fight,'loss'); return;
  }
  if (rules.anyAlliedCarOrDriverOut && friendly(fight).some(combatantOut)) {
    finish(fight,'branch',rules.anyAlliedCarOrDriverOut); return;
  }
  const pending = everyone(fight).find(u => u.needsReplacementDriver && u.hp > 0 && u.powerPlant?.boxes > 0);
  if (pending) {fight.pendingDriverKey = pending.key; finish(fight,'awaitingDriver'); return;}
  if (rules.fixedDriverOut && hero.driverHp <= 1) {finish(fight,'branch',rules.fixedDriverOut); return;}
  const arena = rules.arena, fixed = arena && fight.enemies[arena.fixedHeroTargetIndex];
  const heroKO = hero.kind === 'person' ? hero.hp <= hero.unconsciousAt
    : (rules.heroIsGunner ? hero.gunnerHp <= 1 : hero.driverHp <= 1);
  const alliesContinue = rules.allowFriendlyContinuation && fight.allies.some(u => !combatantOut(u));
  if ((heroKO || combatantOut(hero)) && !alliesContinue) {
    if (arena) {
      const causedByFixed = fight.lastHeroDamageBy === fixed.key;
      finish(fight,'loss',causedByFixed ? arena.fixedEnemyCausesKOOrCarOut : heroKO
        ? combatantOut(fixed) ? arena.heroKOFixedOut : arena.otherCausesKOFixedActive
        : combatantOut(fixed) ? arena.heroCarOutFixedOut : arena.otherCausesCarOutFixedActive);
    } else finish(fight,'loss',heroKO ? rules.heroUnconscious ?? rules.defeat : rules.heroVehicleOut ?? rules.defeat);
    return;
  }
  if (rules.heroIsGunner && hero.gunnerHp <= 1) {finish(fight,'loss',rules.heroUnconscious); return;}
  if (rules.scenarioCombat) {
    const out = fight.enemies.filter(combatantOut).length;
    if (rules.victoryWhenAnyEnemyOut && out || rules.defeatAtEnemyCount && out >= rules.defeatAtEnemyCount
        || rules.victoryWhenAnyEnemyOutOrEmpty && fight.enemies.some(unit => combatantOut(unit)
          || unit.weapons.every(weapon => weapon.ammo != null && weapon.ammo === 0))) {
      finish(fight,'win',rules.victory); return;
    }
  }
  if (fight.enemies.every(combatantOut)) {
    const timed = rules.victoryByRound;
    finish(fight,'win',timed ? fight.round <= timed.atMost ? timed.within : timed.after : rules.victory);
  }
}

function normalDamage(fight, unit, amount, attacker) {
  unit.hp = Math.max(0, unit.hp - amount);
  if (fight.rules.scenarioCombat) unit.generalDamageTaken = (unit.generalDamageTaken ?? 0) + amount;
  if (unit === fight.hero && attacker) fight.lastHeroDamageBy = attacker.key;
  event(fight, `${name(unit)} takes ${amount} damage (${unit.hp} HP left).`);
}
function personalDamage(fight, unit, result, attacker) {
  const absorbed = Math.min(unit.armour, result.damage);
  unit.armour -= absorbed;
  normalDamage(fight,unit,result.damage-absorbed,attacker);
  if (result.knockout && !unit.notHuman) {
    unit.hp = Math.min(unit.hp, unit.unconsciousAt);
    event(fight, `${name(unit)} is knocked out.`);
  }
}
function specialDamage(fight, unit, roll, attacker) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const table = sum(dice(2,roll)), weapons = unit.weapons.filter(w => w.boxes > 0);
    let applied = false;
    const rotorRule = unit.helicopter && fight.rules.helicopterSpecialDamage?.[String(table)];
    if (rotorRule) {
      const rotor = unit[rotorRule.part];
      if (rotor?.hp > 0) {rotor.hp = Math.max(0,rotor.hp-sum(dice(rotorRule.damageDice,roll))); applied=true;}
    } else if (table === 2 || table === 3) {
      const seat = table === 2 ? 'driver' : 'gunner', hp = seat+'Hp', armour = seat+'Armour';
      if (unit[hp] > 0) {
        if (unit[armour] > 0) unit[armour]--; else unit[hp]--;
        unit[seat === 'driver' ? 'skipFire' : 'gunnerSkipFire'] = 1; applied = true;
      }
    } else if (table === 4) {
      if (fight.rules.specialFour === 'passenger') {
        const passengers = (unit.passengers ?? []).filter(person => person.hp > 0);
        if (passengers.length) {
          const passenger = pick(passengers,roll);
          if (passenger.armour > 0) passenger.armour--; else passenger.hp--;
          applied=true;
        }
      } else if (unit.cargoOccupant?.hp > 0) {unit.cargoOccupant.hp--; applied = true;}
      else if (unit.cargo > 0) {unit.cargo--; applied = true;}
    } else if ([5,12].includes(table) && unit.powerPlant.boxes > 0) {
      unit.powerPlant.boxes = Math.max(0,unit.powerPlant.boxes-die(roll)); applied = true;
    } else if ([6,8,10].includes(table) && weapons.length) {
      const weapon = pick(weapons,roll), amount = table === 6 ? 1 : table === 8 ? 2 : die(roll);
      weapon.boxes = Math.max(0,weapon.boxes-amount); applied = true;
    } else if (table === 7) {unit.defenseClass = Math.max(0,unit.defenseClass-1); applied = true;
    } else if (table === 9) {unit.handling--; applied = true;
    } else if (table === 11 && unit.gadgets.some(g => g.boxes > 0)) {
      pick(unit.gadgets.filter(g => g.boxes > 0),roll).boxes = 0; applied = true;
    }
    if (!applied) continue;
    if (unit === fight.hero && attacker) fight.lastHeroDamageBy = attacker.key;
    event(fight, `Special damage ${table}: ${name(unit)}.`);
    const result = unit.unattended ? {passed:true,dice:[]} : control(fight,unit,roll);
    event(fight, `${name(unit)} control ${result.dice.join('+')}: ${result.passed ? 'held' : 'lost'}.`);
    if (!result.passed) {
      unit.skipTurn = 1;
      if (fight.rules.anyAlliedControlFailure && side(fight,unit) === 'friendly')
        finish(fight,'branch',fight.rules.anyAlliedControlFailure);
    }
    if (!crewAlive(unit,'driver') && crewAlive(unit,'gunner') && !unit.robotGunner && !unit.fixedDriver && !unit.helicopter
        && !(fight.rules.anyAlliedCarOrDriverOut && side(fight,unit) === 'friendly')) {
      if (unit.gunnerDriving == null) unit.needsReplacementDriver = true;
      else Object.assign(unit,replaceCrewDriver(unit));
    }
    return;
  }
  throw new RangeError('No applicable special damage after 100 rolls');
}
function ready(fight, unit, weapon) {
  return weapon.boxes > 0 && (!weapon.oneShot || weapon.ammo > 0)
    && (!weapon.requiresReload || weapon.ammo > 0)
    && (weapon.delivery !== 'mine' || weapon.ammo > 0)
    && (!(fight.options.advancedAmmo || unit.basicAmmoLimited || weapon.explicitAmmoLimit) || weapon.ammo == null || weapon.ammo > 0 || fight.virtualAmmo && !weapon.oneShot)
    && (!/laser/i.test(weapon.name) || unit.powerPlant.boxes > 0);
}
export const weaponAvailable=(fight,unit,weapon)=>!!ready(fight,unit,weapon);
function attack(fight, attacker, target, weapon, roll, crew = {}) {
  target.lastTargetedRound = fight.round;
  const vehicle = attacker.kind === 'vehicle';
  if (vehicle) {
    if (!ready(fight,attacker,weapon)) throw new RangeError('Weapon unavailable');
    if ((weapon.oneShot || weapon.delivery === 'mine' || fight.options.advancedAmmo || attacker.basicAmmoLimited || weapon.explicitAmmoLimit) && weapon.ammo != null && weapon.ammo > 0) weapon.ammo--;
    if(fight.rules.scenarioCombat&&weapon.ammoFault&&die(roll)===weapon.ammoFault.die) {
      weapon.boxes=Math.max(0,weapon.boxes-weapon.ammoFault.damage);
      event(fight,`${name(attacker)}: faulty ammunition damages ${weapon.name}; no shot is fired.`);
      return;
    }
  }
  if (fight.rules.scenarioCombat && weapon.delivery === 'mine') {
    if (target.relativePosition === 'ahead' || !fight.enemies.includes(target) && attacker.relativePosition !== 'ahead') {
      throw new RangeError('Mines require a following target');
    }
    const result = control(fight,target,roll);
    event(fight,`${name(target)}: mine ${result.passed ? 'avoided' : 'hit'}.`);
    if (!result.passed) {
      const damage=dice(weapon.damageDice,roll);
      normalDamage(fight,target,sum(damage),attacker);
      for (const value of damage) if (value === 1) specialDamage(fight,target,roll,attacker);
    }
    return;
  }
  if (fight.rules.scenarioCombat && weapon.automaticHit && weapon.effect === 'oil') {
    attacker.oilActive=true;
    event(fight,`${name(attacker)} deploys oil.`); return;
  }
  const seat = crew.seat ?? 'driver', history = attacker.firingHistory ??= {};
  let sustained = 0;
  if (vehicle && fight.options.sustainedFire) {
    const historyKey = fight.rules.scenarioCombat ? String(attacker.weapons.indexOf(weapon)) : seat;
    const prior = history[historyKey];
    sustained = prior?.target === target.key && prior.round === fight.round ? prior.bonus
      : prior?.target === target.key && prior.round === fight.round-1 ? Math.min(2,prior.bonus+1) : 0;
    history[historyKey] = {target:target.key,round:fight.round,bonus:sustained};
  }
  const mods = attacker === fight.hero ? fight.rules.heroAttackModifiers : fight.rules.enemyAttackModifiers;
  const attempt = attacker.attackCount ?? 0; attacker.attackCount = attempt+1;
  const painted = attacker.blindUntilRound != null && fight.round <= attacker.blindUntilRound;
  const aim = crew.fixedCombatBonus ?? (painted ? 0 : crew.gunnery ?? attacker.gunnery) + (weapon.bonus ?? 0)
    + (vehicle ? crew.computerBonus ?? targetingBonus(attacker,seat) : 0);
  whole(aim,-100);
  const known = fight.rules.knownTargetBonus;
  const bonus = (mods?.[attempt] ?? 0) + (attacker === fight.hero ? fight.rules.heroAttackBonus ?? 0 : fight.rules.enemyAttackBonus ?? 0)
    + (known && friendly(fight).includes(attacker) && target === fight.enemies[known.targetIndex] ? known.bonus : 0)
    + (fight.evasive && attacker === fight.hero ? fight.rules.evasive.attackModifier : 0);
  const defense = target.defenseClass + (fight.evasive && target === fight.hero ? fight.rules.evasive.defenseBonus : 0);
  const values = dice(2,roll), total = sum(values)+aim+bonus+sustained, hit = weapon.automaticHit || total > defense;
  event(fight, `${name(attacker)}: ${weapon.name} against ${name(target)}: ${values.join('+')} → ${total} vs DC ${defense}: ${hit ? 'hit' : 'miss'}.`);
  if (!hit) return;
  if (fight.rules.scenarioCombat && weapon.effect) {
    if (weapon.effect === 'paint') target.blindUntilRound = fight.round + (fight.rules.paintCrossing?.blindTurns ?? 3);
    else if (weapon.effect === 'oil') attacker.oilActive=true;
    event(fight,`${name(target)}: ${weapon.name}.`); return;
  }
  if (attacker === fight.hero && fight.rules.successfulHeroHitsToWin) {
    fight.heroHits = (fight.heroHits ?? 0)+1;
    if (fight.heroHits >= fight.rules.successfulHeroHitsToWin) finish(fight,'win',fight.rules.victory);
    return;
  }
  if (target.kind === 'person') personalDamage(fight,target,personalWeaponDamage(weapon, n => die(roll)),attacker);
  else {
    const damage = weapon.flatDamage != null ? [weapon.vehicleFlatDamage ?? weapon.flatDamage] : dice(weapon.damageDice,roll);
    normalDamage(fight,target,sum(damage),attacker);
    if (fight.rules.scenarioCombat && attacker !== fight.hero && target === fight.hero && /flamethrower/i.test(weapon.name)
        && fight.rules.flameEscape && target.generalDamageTaken > fight.rules.flameEscape.afterGeneralDamageGreaterThan
        && damage.includes(fight.rules.flameEscape.onDamageDie)) {
      finish(fight,'loss',fight.rules.flameEscape.destination); return;
    }
    if (weapon.flatDamage == null) for (const value of damage) if (value === 1) specialDamage(fight,target,roll,attacker);
  }
}

function autoWeapons(fight, unit, facing) {
  const seats = firingCrew(unit,Math.max(1,fight.round)).filter(s => (s === 'driver' ? unit.gunnery : unit.gunnerGunnery) != null);
  if (fight.rules.preferEnemyGunner && side(fight,unit) === 'enemy') seats.sort(s => s === 'gunner' ? -1 : 1);
  const groups = new Map();
  for (let i = 0; i < unit.weapons.length; i++) {
    const weapon = unit.weapons[i];
    if (!ready(fight,unit,weapon) || !facing.includes(weapon.direction)) continue;
    if (weapon.effect === 'paint' && fight.rules.paintCrossing && !fight.paintCrossing?.unlocked) continue;
    const key = weapon.linkedGroup ? 'linked:'+weapon.linkedGroup : 'weapon:'+i;
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(i);
  }
  const priority = group => group.reduce((n,i) => n+unit.weapons[i].damageDice,0)
    + (fight.rules.scenarioCombat && group.some(i => unit.weapons[i].effect)
      && fight.round % 2 === 1 ? 100 : 0);
  const ordered = [...groups.values()].sort((a,b) => priority(b)-priority(a));
  const voice = unit.voiceSwitch?.status==='working' && seats.includes('driver')
    ? ordered.find(group=>group.includes(unit.voiceSwitch.weaponIndex)) : null;
  const selected = voice && ordered.length>seats.length
    ? [...ordered.filter(group=>group!==voice).slice(0,seats.length),voice]
    : ordered.slice(0,seats.length);
  return {indices:selected.flat(),seats:seats.slice(0,selected.length)};
}
function fireUnit(fight, unit, targets, action, roll) {
  if (combatantOut(unit) || unit.canAttack === false) return;
  if (unit.skipTurn > 0) {unit.skipTurn--; event(fight,`${name(unit)} misses a turn recovering control.`); return;}
  if (action?.hold) return;
  if (fight.rules.scenarioCombat) unit.oilActive=false;
  if (unit.kind === 'person') {
    if (unit.skipFire > 0) unit.skipFire--;
    else if (targets[0] && !combatantOut(targets[0])) attack(fight,unit,targets[0],unit.weapon,roll);
    return;
  }
  const phase = fight.rules.facingPhases?.find(item => (item.throughTurn == null || fight.round <= item.throughTurn)
    && (item.fromTurn == null || fight.round >= item.fromTurn));
  let facing = phase?.[unit === fight.hero ? 'player' : 'enemy']
    ?? (unit === fight.hero ? fight.rules.playerFacing : fight.rules.enemyFacing);
  if (unit === fight.hero && fight.rules.upwardPlayerWeaponsOnly) facing = ['up','turret'];
  const auto = action?.weapons ? null : autoWeapons(fight,unit,facing);
  const indices = action?.weapons ?? auto.indices;
  if (unit.helicopter && fight.rules.enemyWeaponSwitchNoFireTurns && indices.length) {
    const system = indices.map(index => unit.weapons[index].linkedGroup ?? 'weapon:'+index).join('|');
    if (unit.selectedWeaponSystem != null && unit.selectedWeaponSystem !== system) {
      unit.selectedWeaponSystem=system;
      event(fight,`${name(unit)} changes weapons without firing.`); return;
    }
    unit.selectedWeaponSystem=system;
  }
  const playerSeats = unit === fight.hero && fight.rules.heroIsGunner
    ? ['gunner','driver'].filter(s => firingCrew(unit,Math.max(1,fight.round)).includes(s)) : undefined;
  const assignments = assignWeapons(unit,indices,Math.max(1,fight.round),{facing,
    seats:action?.seats ?? auto?.seats ?? playerSeats, targets:action?.targets, target:action?.target ?? 0});
  for (const assignment of assignments) {
    const target = targets[assignment.target];
    if (!target || combatantOut(target)) throw new RangeError('Choose a surviving target');
    for (const index of assignment.weapons) {
      if (combatantOut(target) || combatantOut(unit) || fight.status !== 'fighting') break;
      const weapon = unit.weapons[index];
      if (weapon.effect === 'paint' && fight.rules.paintCrossing && !fight.paintCrossing?.unlocked)
        throw new RangeError('The paint sprayer is not yet across the target path');
      if (unit === fight.hero && fight.rules.upwardPlayerWeaponsOnly && weapon.direction !== 'up' && !weapon.universal)
        throw new RangeError('Only upward-firing weapons can hit this target');
      if (fight.rules.positionalFacings && unit === fight.hero && weapon.direction !== 'turret'
          && weapon.direction !== (target.relativePosition === 'ahead' ? 'front' : 'rear'))
        throw new RangeError('That weapon cannot face the selected vehicle');
      attack(fight,unit,target,weapon,roll,assignment);
    }
  }
  unit.skipFire = Math.max(0,unit.skipFire-1); unit.gunnerSkipFire = Math.max(0,unit.gunnerSkipFire-1);
}

export function startFight(hero, entry, options = {}, roll) {
  if (!entry?.enemies?.length || !entry.rules) throw new RangeError('Choose opponents');
  const rules = copy(entry.rules);
  const fight = {rulesVersion:2,baseSection:entry.baseSection ?? entry.section,sourceSection:entry.section,
    encounter:entry.label ?? 'Custom fight',rules,hero:validateCombatant(hero),
    enemies:entry.enemies.map(validateCombatant),allies:(options.allies ?? rules.allies ?? []).map(validateCombatant),
    status:'fighting',round:0,events:[],options:{advancedAmmo:!!options.advancedAmmo,sustainedFire:!!options.sustainedFire,
      simplifiedArena:!!options.simplifiedArena},appliedEntries:[entry.section],section:null};
  if (rules.scenarioCombat) {
    if (rules.fireSupport) fight.supporters=(rules.fireSupport.units ?? []).map(validateCombatant);
    fight.hero.allowImmobilizedFire = !!rules.ownPlantAllowsNonLaserFire && !rules.heroPlantLossEnds;
    if (rules.playerAlone) {fight.hero.gunnerSeat=false; fight.hero.gunnerHp=0;}
    if (rules.explicitBasicAmmo) for (const unit of fight.enemies) {
      unit.basicAmmoLimited=!options.advancedAmmo;
      for (const weapon of unit.weapons ?? []) if (!options.advancedAmmo) weapon.ammo=rules.explicitBasicAmmo;
    }
    if (rules.entryDamageDice) normalDamage(fight,fight.hero,sum(dice(rules.entryDamageDice,roll)));
    if (rules.openingGunneryChecks) {
      const checks=rules.openingGunneryChecks;
      for (let i=0;i<checks.count;i++) if (die(roll)<=checks.target)
        personalDamage(fight,fight.hero,{damage:checks.flatDamage,knockout:false},fight.enemies[0]);
    }
  }
  if (fight.hero.kind !== (rules.kind === 'personal' ? 'person' : 'vehicle')) throw new RangeError('Choose matching combat stats');
  if (rules.robotGunner) fight.hero = installRobotGunner(fight.hero,rules.robotGunner);
  if (rules.playerWeapon) fight.hero.weapon = copy(rules.playerWeapon);
  if (rules.opponentWeapon) fight.enemies[0].weapon = copy(rules.opponentWeapon);
  if (rules.forceUnarmouredBoth) for (const unit of [fight.hero,...fight.enemies]) {unit.armour=0; unit.defenseClass=9;}
  fight.openingShots = rules.openingPersonalShot?.count ?? rules.openingHeroShots ?? 0;
  if (rules.openingPersonalShot) fight.hero.weapon = copy(rules.openingPersonalShot.weapon);
  if (rules.searchForWeapon) fight.searching = true;
  if (rules.entryGeneralDamage) normalDamage(fight,fight.hero,rules.entryGeneralDamage);
  for (const index of rules.openingEnemyShots ?? []) {
    fireUnit(fight,fight.enemies[index],[fight.hero],null,roll); settle(fight);
    if (fight.status !== 'fighting') break;
  }
  settle(fight); return fight;
}

function arenaTarget(fight, index, roll) {
  const arena = fight.rules.arena, unit = fight.enemies[index];
  if (index === arena.fixedHeroTargetIndex) return fight.hero;
  const table = arena.targetTables[fight.rules.arenaTargetTable] ?? arena.targetTable;
  for (let tries = 0; tries < 100; tries++) {
    const value = sum(dice(2,roll)), type = table.find(([min,max]) => value >= min && value <= max)[2];
    const target = type === 'hero' ? fight.hero : type === 'fixed' ? fight.enemies[arena.fixedHeroTargetIndex]
      : pick(fight.enemies.filter((u,i) => i !== index && i !== arena.fixedHeroTargetIndex && !combatantOut(u)),roll);
    if (target && target !== unit && !combatantOut(target)) return target;
  }
  throw new RangeError('Arena target roll did not resolve');
}

export function fightRound(previous, action = {}, roll) {
  if (previous?.rulesVersion !== 2 || previous.status !== 'fighting') throw new RangeError('No active fight');
  const fight = copy(previous); fight.events=[]; settle(fight);
  if (fight.status !== 'fighting') return fight;
  if (action.evasive != null) {
    if (!fight.rules.evasive?.toggleable || typeof action.evasive !== 'boolean')
      throw new RangeError('Evasive action is not offered here');
    fight.evasive=action.evasive;
  }
  if (fight.rules.parkedPass) {
    const rule=fight.rules.parkedPass;
    fight.parkedAttempts ??= [];
    const available=index=>Number.isSafeInteger(index) && fight.enemies[index] && !fight.parkedAttempts.includes(index);
    if (action.ramTargets) {
      if (action.ramTargets.length !== rule.ramTargets || new Set(action.ramTargets).size !== rule.ramTargets
          || !action.ramTargets.every(available)) throw new RangeError('Choose a fresh pair of parked vehicles');
      for (const index of action.ramTargets) {fight.enemies[index].out=true; fight.parkedAttempts.push(index);}
      normalDamage(fight,fight.hero,sum(dice(rule.ramDamageDice,roll)));
    } else {
      const index=action.target ?? 0;
      if (!available(index) || !Array.isArray(action.weapons) || action.weapons.length !== 1)
        throw new RangeError('Choose one weapon and one untried parked vehicle');
      fight.rules.heroAttackBonus=rule.heroAttackBonus;
      fireUnit(fight,fight.hero,fight.enemies,action,roll);
      fight.parkedAttempts.push(index);
    }
    fight.round++; settle(fight);
    if (fight.status === 'fighting' && fight.parkedAttempts.length === fight.enemies.length) {
      const disabled=fight.enemies.filter(combatantOut).length;
      finish(fight,disabled >= rule.atLeastDisabled ? 'win' : 'branch',disabled >= rule.atLeastDisabled ? rule.victory : rule.otherwise);
    }
    return fight;
  }
  const targets = combatTargets(fight);
  const target = targets[whole(action.target ?? 0)];
  if (!target || combatantOut(target)) throw new RangeError('Choose a surviving target');
  if (fight.openingShots > 0) {
    attack(fight,fight.hero,target,fight.hero.weapon,roll); fight.openingShots--;
    if (!fight.openingShots && fight.rules.openingPersonalShot) fight.hero.weapon=copy(fight.rules.playerWeapon);
    settle(fight); return fight;
  }
  fight.round++;
  if (fight.rules.paintCrossing && !fight.paintCrossing?.unlocked) {
    const source=fight.rules.paintCrossing;
    const unit=fight.enemies.find(enemy=>enemy.key===source.enemyKey);
    if (unit && !combatantOut(unit)) {
      fight.paintCrossing ??= {heroSuccesses:0,enemySuccesses:0,unlocked:false};
      if (control(fight,fight.hero,roll).passed) fight.paintCrossing.heroSuccesses++;
      if (control(fight,unit,roll).passed) fight.paintCrossing.enemySuccesses++;
      fight.paintCrossing.unlocked=fight.paintCrossing.enemySuccesses-fight.paintCrossing.heroSuccesses>=source.controlSuccessLead;
    }
  }
  if (fight.options.advancedAmmo) {
    const armed = everyone(fight).filter(u => !combatantOut(u) && u.canAttack !== false);
    const allEmpty = armed.length > 1 && armed.every(u => u.kind === 'vehicle'
      && u.weapons.some(w => w.boxes > 0 && !w.oneShot)
      && !u.weapons.some(w => ready({...fight,virtualAmmo:false},u,w)));
    if (allEmpty) {fight.virtualAmmo=true; event(fight,'Both sides are out of ammunition; continue the fight under the advanced rule. Guns remain empty afterwards.');}
  }
  if (fight.searching) {
    fireUnit(fight,fight.enemies[0],[fight.hero],null,roll); settle(fight);
    if (fight.status !== 'fighting') return fight;
    const found = fight.rules.searchForWeapon.findOn.includes(die(roll));
    fight.searching=!found; event(fight,found ? 'You find a weapon.' : 'No suitable weapon this turn.');
    return fight;
  }
  const hero = () => {
    if (fight.hero.kind === 'person') fireUnit(fight,fight.hero,[target],action,roll);
    else fireUnit(fight,fight.hero,targets,action,roll);
    settle(fight);
    if (fight.status !== 'fighting') return;
    for (const ally of fight.allies) {
      const foe = fight.enemies.find(e => !combatantOut(e));
      if (foe) fireUnit(fight,ally,[foe],null,roll);
      settle(fight); if (fight.status !== 'fighting') break;
    }
  };
  const enemies = () => {
    for (let i = 0; i < fight.enemies.length; i++) {
      const unit = fight.enemies[i]; if (combatantOut(unit)) continue;
      if (fight.rules.chase?.pursuersCanFire === false) continue;
      if (fight.rules.enemiesOnlyReturnFire && unit.lastTargetedRound !== fight.round) continue;
      const selected = fight.rules.arena ? arenaTarget(fight,i,roll)
        : fight.rules.randomEnemyTargetEachTurn ? pick(friendly(fight).filter(u => !combatantOut(u)),roll)
        : friendly(fight).find(u => !combatantOut(u));
      if (fight.options.simplifiedArena && fight.rules.arena && selected !== fight.hero
          && selected !== fight.enemies[fight.rules.arena.fixedHeroTargetIndex]) {
        unit.skipTurn=Math.max(0,unit.skipTurn-1); unit.skipFire=Math.max(0,unit.skipFire-1);
        unit.gunnerSkipFire=Math.max(0,unit.gunnerSkipFire-1); continue;
      }
      fireUnit(fight,unit,[selected],null,roll); settle(fight);
      if (fight.status !== 'fighting') break;
    }
    const support=fight.rules.fireSupport;
    if (fight.status !== 'fighting' || !support) return;
    for (let i=0;i<(fight.supporters ?? []).length;i++) {
      const unit=fight.supporters[i];
      if (combatantOut(unit)) continue;
      const law=i===(support.lawIndex ?? fight.supporters.length-1);
      if (law ? !support.lawTurns.includes(fight.round) || (unit.shotsFired ?? 0)>=support.lawMaximumShots
          : !support.untilBattleEnd && fight.round>support.ordinaryTurns) continue;
      const before=unit.attackCount ?? 0;
      fireUnit(fight,unit,[fight.hero],null,roll);
      if ((unit.attackCount ?? 0)>before) unit.shotsFired=(unit.shotsFired ?? 0)+1;
      settle(fight);
      if (fight.status !== 'fighting') break;
    }
  };
  if (fight.rules.enemyFirst) {enemies(); if(fight.status==='fighting') hero();}
  else {hero(); if(fight.status==='fighting') enemies();}
  if (fight.status !== 'fighting') return fight;
  if (fight.rules.chase && !fight.rules.chase.noCombat) {
    const rule=fight.rules.chase;
    fight.pursuitFailures ??= {hero:0,enemies: fight.enemies.map(()=>0)};
    const counts=fight.pursuitFailures;
    if (!control(fight,fight.hero,roll).passed) counts.hero++;
    for (let i=0;i<fight.enemies.length;i++) {
      const unit=fight.enemies[i];
      if (combatantOut(unit)) continue;
      if (!control(fight,unit,roll).passed) counts.enemies[i]++;
      if (counts.enemies[i]>=rule.failuresToDropOut) {
        unit.escaped=true; event(fight,`${name(unit)} drops behind.`);
      }
    }
    settle(fight);
    if (fight.status === 'fighting' && counts.hero>=rule.failuresToDropOut)
      finish(fight,'branch',rule.heroFailuresDestination);
    if (fight.status !== 'fighting') return fight;
  }
  if (fight.rules.fleeingEnemies && fight.round >= fight.rules.fleeingEnemies.afterResponseTurns)
    for (const i of fight.rules.fleeingEnemies.indices) fight.enemies[i].escaped=true;
  if (fight.options.simplifiedArena && fight.rules.arena)
    for (const i of fight.rules.arena.simplifiedUnnamedIndices)
      if (!combatantOut(fight.enemies[i]) && sum(dice(2,roll)) <= 2+Math.floor((fight.round-1)/3)) fight.enemies[i].out=true;
  settle(fight);
  const limit = fight.rules.roundLimit;
  if (fight.status === 'fighting' && limit && fight.round >= limit.turns
      && (limit.onlyIfEnemyActive == null || !combatantOut(fight.enemies[limit.onlyIfEnemyActive]))) {
    if(limit.exhaustPersonalWeapons)for(const unit of [fight.hero,...fight.enemies])if(unit.weapon)unit.weapon.ammo=0;
    finish(fight,'branch',limit.destination);
  }
  return fight;
}

export function resumeFight(previous, entry, roll) {
  if (previous?.rulesVersion !== 2 || !['fighting','branch','paused'].includes(previous.status)
      || String(previous.baseSection) !== String(entry.baseSection ?? entry.section)) throw new RangeError('No matching unfinished fight');
  const fight = copy(previous); fight.events=[]; fight.rules={...fight.rules,...copy(entry.rules)};
  if (entry.rules.carryChaseStateFrom) delete fight.rules.chase;
  if(fight.rules.scenarioCombat)fight.hero.allowImmobilizedFire=!!fight.rules.ownPlantAllowsNonLaserFire&&!fight.rules.heroPlantLossEnds;
  const fresh = !fight.appliedEntries.includes(entry.section);
  fight.status='fighting'; fight.section=null; fight.sourceSection=entry.section;
  for (const i of entry.rules.escapedEnemyIndices ?? []) fight.enemies[i].escaped=true;
  if (fresh) {
    fight.appliedEntries.push(entry.section);
    if(entry.rules.scenarioCombat&&entry.rules.entryDamageDice)normalDamage(fight,fight.hero,sum(dice(entry.rules.entryDamageDice,roll)));
    if (entry.rules.robotGunner && JSON.stringify(fight.hero.robotGunner)!==JSON.stringify(entry.rules.robotGunner))
      fight.hero=installRobotGunner(fight.hero,entry.rules.robotGunner);
    if (entry.rules.playerWeapon) fight.hero.weapon=copy(entry.rules.playerWeapon);
    if (entry.rules.opponentWeapon) fight.enemies[0].weapon=copy(entry.rules.opponentWeapon);
    if (entry.rules.searchForWeapon) fight.searching=true;
    if (entry.rules.openingPersonalShot) {
      fight.openingShots=entry.rules.openingPersonalShot.count;
      fight.hero.weapon=copy(entry.rules.openingPersonalShot.weapon);
    }
    if (entry.rules.resumeGeneralDamage) normalDamage(fight,fight.hero,entry.rules.resumeGeneralDamage);
    for (const i of entry.rules.resumeEnemyShots ?? []) {
      fireUnit(fight,fight.enemies[i],[fight.hero],null,roll); settle(fight);
      if (fight.status !== 'fighting') break;
    }
  }
  settle(fight); return fight;
}

export function replaceDriver(previous, driving) {
  if (previous?.status !== 'awaitingDriver') throw new RangeError('No replacement driver required');
  const fight = copy(previous), unit = everyone(fight).find(u => u.key === fight.pendingDriverKey);
  Object.assign(unit,replaceCrewDriver(unit,driving));
  fight.status='fighting'; fight.events=['The gunner takes over driving.']; delete fight.pendingDriverKey;
  settle(fight); return fight;
}

export function tactic(previous, kind) {
  if (previous?.status !== 'fighting') throw new RangeError('No active fight');
  const fight=copy(previous), rule=fight.rules.tactics?.[kind];
  if (!rule) throw new RangeError('This tactic is not offered here');
  fight.usedTactics ??= [];
  if (rule.once && fight.usedTactics.includes(kind)) throw new RangeError('This tactic has already been used');
  fight.usedTactics.push(kind); fight.events=['You change tactics; existing damage and ammunition are retained.'];
  if (fight.rules.scenarioCombat && rule.allPursuersCatchUp) {
    fight.rules.playerFacing=copy(rule.playerFacing);
    for (const unit of fight.enemies) {
      // Falling behind in the chase is not the same as being destroyed.
      delete unit.escaped;
      unit.relativePosition='behind';
    }
    if (rule.supportUntilBattleEnd && fight.rules.fireSupport && fight.round < fight.rules.fireSupport.ordinaryTurns)
      fight.rules.fireSupport.untilBattleEnd=true;
    return fight;
  }
  finish(fight,kind==='leave' ? 'escaped' : 'branch',rule.destination); return fight;
}
