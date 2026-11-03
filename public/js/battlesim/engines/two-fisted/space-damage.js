// Resolve shield checks and the printed Heavy Hits table without recursive critical damage.
import {combatInteger as integer, rollSix, rollIndex} from './dice.js';
import {injureCombatant} from './injuries.js';

export function validateHeavyHits(table) {
  const effects = new Set(['power-loss', 'cockpit-fire', 'console-injury', 'shield-destruction', 'lose-upgrade', 'lose-all-upgrades']);
  if (!Array.isArray(table) || table.length !== 6 || new Set(table.map(row => row.roll)).size !== 6) throw new RangeError('Missing database Heavy Hits table');
  for (const row of table) {
    integer(row.roll, 1, 6);
    if (!effects.has(row.effect)) throw new RangeError('Invalid Heavy Hits effect');
    if (row.effect === 'power-loss') integer(row.amount, 1);
    if (row.effect === 'console-injury') integer(row.heroThrough, 1, 5);
    if (row.effect === 'shield-destruction') integer(row.repeatHullLoss, 1);
    if (['lose-upgrade', 'lose-all-upgrades'].includes(row.effect) && ![3, 6].includes(row.hullDie)) throw new RangeError('Invalid critical HULL die');
    if (row.effect === 'cockpit-fire') {
      integer(row.opponent?.expertise, 1); integer(row.opponent?.health, 1); integer(row.opponent?.fists, 0, 20);
    }
  }
  return table;
}

export function spaceNote(fight, event) {
  fight.log.push({round: fight.round, ...event});
  if (fight.log.length > 100) fight.log.splice(0, fight.log.length - 100);
}

export function shipBonuses(ship) {
  const result = {weapons: ship.weaponsRollBonus ?? 0, manoeuvre: ship.manoeuvreRollBonus ?? 0,
    shields: ship.shieldRollBonus ?? 0, powerDiscount: 0, heavyModifier: 0, shieldSplitter: false};
  for (const upgrade of ship.upgrades) {
    for (const key of ['weapons', 'manoeuvre', 'shields']) result[key] += (upgrade[key + 'Roll'] ?? 0) + (upgrade.allRoll ?? 0);
    result.powerDiscount += upgrade.powerDiscount ?? 0;
    result.heavyModifier += upgrade.heavyModifier ?? 0;
    result.shieldSplitter ||= Boolean(upgrade.shieldSplitter);
  }
  return result;
}

function removeUpgrade(ship, index) {
  const [upgrade] = ship.upgrades.splice(index, 1);
  ship.hull = Math.max(0, ship.hull - (upgrade.hullBonus ?? 0));
  ship.maxHull = Math.max(0, ship.maxHull - (upgrade.hullBonus ?? 0));
  if (ship.power != null) {
    ship.power = Math.max(0, ship.power - (upgrade.powerBonus ?? 0));
    ship.maxPower = Math.max(0, ship.maxPower - (upgrade.powerBonus ?? 0));
  }
  return upgrade.id;
}

export function prepareSpaceShield(ship, power, fists, roll) {
  integer(power); integer(fists, 0, 20);
  if (ship.shieldsDown && ship.shieldGenerators > 1 && !ship.backupUsed && !ship.shieldsDestroyed) {
    ship.backupUsed = true; ship.shieldsDown = false;
  }
  const shield = {power, score: ship.shieldsDown || ship.shieldsDestroyed ? 0 : power,
    rerolls: fists, down: ship.shieldsDown || ship.shieldsDestroyed,
    destroyed: ship.shieldsDestroyed, reactivation: null};
  if (ship.shieldsDown && !ship.shieldsDestroyed) {
    const dice = [rollSix(roll)];
    while (dice.at(-1) >= power && shield.rerolls > 0) {shield.rerolls--; dice.push(rollSix(roll));}
    shield.reactivation = {dice, success: dice.at(-1) < power};
  }
  return shield;
}

export function rollSpaceShieldCheck(shield, roll) {
  if (shield.down || shield.destroyed) return {dice: [], failed: true, noWorkingShield: true};
  const dice = [rollSix(roll)];
  const fails = die => die === 6 || die > shield.score;
  while (fails(dice.at(-1)) && shield.rerolls > 0) {shield.rerolls--; dice.push(rollSix(roll));}
  return {dice, failed: fails(dice.at(-1)), shieldBefore: shield.score};
}

export function applySpaceShieldHit(fight, target, check, attacker, roll) {
  const ship = target === 'player' ? fight.player.ship : fight.opponents[target];
  const shield = target === 'player' ? fight.stations.player.shield : fight.stations.enemies[target].shield;
  let damage = 0, repaired = false;
  if (check.failed) {
    ship.hull = Math.max(0, ship.hull - 1); damage = 1; shield.score = 0;
    // Bones keeps the generator working; the printed exception does not say
    // that the hull damage itself is cancelled.
    if (!shield.down && ship.repairShieldOnBreach && rollSix(roll) <= 3) repaired = true;
    if (!repaired && !shipBonuses(ship).shieldSplitter) {ship.shieldsDown = true; shield.down = true;}
  } else shield.score = Math.max(0, shield.score - 1);
  const record = target === 'player' ? fight.damage.player : fight.damage.enemies[target];
  record.hull += damage;
  if (!attacker.heavyEachHit) {
    record.ordinaryHull += damage;
    if (damage) {
      record.trigger = Math.min(record.trigger, attacker.heavyHitMinimum ?? 6);
      record.tableDie = Math.min(record.tableDie, attacker.heavyHitTableDie ?? 6);
    }
  } else fight.damage.perHit.push({target, minimum: attacker.heavyHitMinimum ?? 6, tableDie: attacker.heavyHitTableDie ?? 6});
  spaceNote(fight, {type: 'shield-hit', target, check, damage, repaired, shields: shield.score, hull: ship.hull});
  return damage;
}

export function applySpaceHeavyHit(fight, target, raw, roll) {
  integer(raw, 1, 6);
  const player = target === 'player', ship = player ? fight.player.ship : fight.opponents[target];
  const generator = ship.upgrades.findIndex(upgrade => upgrade.lifeSupport);
  if (generator >= 0 && raw <= 2) {
    const removed = removeUpgrade(ship, generator);
    spaceNote(fight, {type: 'heavy-blocked', target, raw, removed}); return;
  }
  const result = Math.min(6, Math.max(1, raw + shipBonuses(ship).heavyModifier));
  const rule = validateHeavyHits(fight.encounter.heavyHits).find(row => row.roll === result);
  const event = {type: 'heavy-hit', target, raw, result, removed: []};
  if (!player && result <= 3) ship.hull = Math.max(0, ship.hull - 1);
  else if (rule.effect === 'power-loss') ship.power = Math.max(0, ship.power - rule.amount);
  else if (rule.effect === 'cockpit-fire') {
    fight.fires.push(structuredClone(rule.opponent));
  } else if (rule.effect === 'console-injury') {
    const who = rollSix(roll) <= rule.heroThrough ? 'hero' : 'copilot';
    event.injury = who === 'copilot' && fight.roundAction?.copilotLow ? null : injureCombatant(fight.player, who);
  } else if (rule.effect === 'shield-destruction') {
    if (ship.shieldsDestroyed) ship.hull = Math.max(0, ship.hull - rule.repeatHullLoss);
    ship.shieldsDestroyed = true; ship.shieldsDown = true;
  } else if (rule.effect === 'lose-upgrade') {
    if (ship.upgrades.length) event.removed.push(removeUpgrade(ship, rollIndex(ship.upgrades.length, roll)));
    const die = rollSix(roll); ship.hull = Math.max(0, ship.hull - (rule.hullDie === 3 ? Math.ceil(die / 2) : die));
  } else if (rule.effect === 'lose-all-upgrades') {
    while (ship.upgrades.length) event.removed.push(removeUpgrade(ship, 0));
    const die = rollSix(roll); ship.hull = Math.max(0, ship.hull - (rule.hullDie === 3 ? Math.ceil(die / 2) : die));
  }
  spaceNote(fight, event);
}

export function finishSpaceDamage(fight, roll) {
  const jobs = [];
  for (const [target, record] of [['player', fight.damage.player], ...fight.damage.enemies.map((entry, index) => [index, entry])]) {
    if (!record.ordinaryHull) continue;
    for (let i = 0; i < (record.ordinaryHull >= 3 ? 2 : 1); i++) jobs.push({target, minimum: record.trigger, tableDie: record.tableDie});
  }
  jobs.push(...fight.damage.perHit);
  for (let i = 0; i < fight.ignoredFires; i++) jobs.push({target: 'player', automatic: true, tableDie: 6});
  for (const job of jobs) {
    const ship = job.target === 'player' ? fight.player.ship : fight.opponents[job.target];
    if (ship.hull === 0) continue;
    const test = job.automatic ? null : rollSix(roll);
    spaceNote(fight, {type: 'heavy-check', target: job.target, die: test, automatic: Boolean(job.automatic)});
    if (job.automatic || test >= job.minimum) {
      const table = rollSix(roll);
      applySpaceHeavyHit(fight, job.target, job.tableDie === 3 ? Math.ceil(table / 2) : table, roll);
    }
  }
  // A recharged generator becomes usable in the following combat round.
  for (const [ship, state] of [[fight.player.ship, fight.stations.player], ...fight.opponents.map((ship, i) => [ship, fight.stations.enemies[i]])]) {
    if (state.shield.reactivation?.success && !ship.shieldsDestroyed) ship.shieldsDown = false;
  }
}
