// Resolve independent ship encounters with simultaneous fire and separate onboard firefights.
import {combatInteger as integer, rollSix, rollFists} from './dice.js';
import {coPilotAlive} from './injuries.js';
import {groundPlayer, startGroundFight, validateGroundFight} from './ground.js';
import {combatLoadout} from './loadout.js';
import {spaceNote, shipBonuses, prepareSpaceShield, rollSpaceShieldCheck,
  applySpaceShieldHit, finishSpaceDamage, validateHeavyHits} from './space-damage.js';

const copy = value => structuredClone(value);
const roles = ['weapons', 'manoeuvre', 'shields'];

function ship(values, player = false) {
  const result = {shieldGenerators: 1, shieldsDown: false, shieldsDestroyed: false,
    backupUsed: false, upgrades: [], ...copy(values)};
  integer(result.hull); integer(result.shieldGenerators, 0, 2);
  result.maxHull ??= result.hull; integer(result.maxHull);
  if (player) {
    integer(result.power); result.maxPower ??= result.power; integer(result.maxPower);
  } else for (const role of roles) {
    integer(result[role]); integer(result[role === 'shields' ? 'shieldFists' : role + 'Fists'], 0, 20);
  }
  if (!Array.isArray(result.upgrades) || result.upgrades.length > 30) throw new RangeError('Invalid ship upgrades');
  for (const upgrade of result.upgrades) {
    if (!upgrade || typeof upgrade.id !== 'string') throw new RangeError('Invalid ship upgrade');
    for (const key of ['hullBonus', 'powerBonus', 'powerDiscount']) integer(upgrade[key] ?? 0);
    for (const key of ['weaponsRoll', 'manoeuvreRoll', 'shieldsRoll', 'allRoll', 'heavyModifier']) integer(upgrade[key] ?? 0, -1000, 1000);
  }
  for (const key of ['shieldsDown', 'shieldsDestroyed', 'backupUsed']) if (typeof result[key] !== 'boolean') throw new RangeError('Invalid shield state');
  if (result.shieldGenerators === 0) result.shieldsDestroyed = true;
  if (result.heavyHitMinimum != null) integer(result.heavyHitMinimum, 1, 6);
  if (result.heavyHitTableDie != null && ![3, 6].includes(result.heavyHitTableDie)) throw new RangeError('Invalid Heavy Hit die');
  integer(result.extraHullDamageIfAnyDuringRound ?? 0, 0, 1000);
  return result;
}

export function spacePlayer(values = {}) {
  const player = groundPlayer(values);
  player.ship = ship(values.ship ?? {hull: 6, power: 100}, true);
  return player;
}

export function startSpaceFight(player, encounter) {
  player = spacePlayer(player);
  if (!player.expertise || !player.energy || player.dead || !player.ship.hull || !player.ship.power) throw new RangeError('The protagonist or ship is defeated');
  if (!Array.isArray(encounter?.opponents) || !encounter.opponents.length || encounter.opponents.length > 30) throw new RangeError('Invalid space encounter');
  validateHeavyHits(encounter.heavyHits);
  const opponents = encounter.opponents.map(enemy => ship(enemy));
  if (opponents.some(enemy => !enemy.hull)) throw new RangeError('Choose ships with positive HULL');
  return {rulesVersion: 1, mode: 'space', status: 'fighting', round: 0, stage: 'ready',
    player, encounter: copy(encounter), opponents, fires: [], fireFight: null,
    roundAction: null, stations: null, volleys: [], pending: null, log: []};
}

export function validateSpaceFight(fight) {
  if (fight?.rulesVersion !== 1 || fight.mode !== 'space'
      || !['fighting', 'firefighting', 'win', 'loss', 'ended', 'cancelled'].includes(fight.status)
      || !['ready', 'fire', 'allocated', 'rolled', 'volley'].includes(fight.stage)
      || !Array.isArray(fight.opponents) || !fight.opponents.length || fight.opponents.length > 30
      || !Array.isArray(fight.fires) || !Array.isArray(fight.volleys)
      || !Array.isArray(fight.log) || fight.log.length > 100) throw new RangeError('Invalid saved space encounter');
  spacePlayer(fight.player); fight.opponents.forEach(enemy => ship(enemy)); integer(fight.round);
  validateHeavyHits(fight.encounter?.heavyHits);
  if (fight.fireFight) validateGroundFight(fight.fireFight);
  return fight;
}

function finish(fight) {
  if (!fight.player.ship.hull || !fight.player.ship.power || !fight.player.energy || !fight.player.expertise || fight.player.dead) fight.status = 'loss';
  else if (fight.opponents.every(enemy => enemy.hull === 0)) fight.status = 'win';
  if (['win', 'loss'].includes(fight.status)) {
    fight.pending = null; fight.volleys = []; fight.fireFight = null; fight.roundAction = null;
    fight.stage = 'ready';
  }
  return fight;
}

function allocation(fight, action) {
  const points = {}, fists = {}, crew = fight.player.copilot;
  for (const role of roles) {points[role] = integer(action.points?.[role] ?? 0); fists[role] = integer(action.fists?.[role] ?? 0, 0, 20);}
  if (Object.values(points).reduce((a, b) => a + b, 0) > fight.player.expertise
      || Object.values(fists).reduce((a, b) => a + b, 0) > fight.player.fists + combatLoadout(fight.player, 'space', fight.round + 1).fists) throw new RangeError('Allocation exceeds current EXPERTISE or FISTS');
  const station = action.copilotStation || null;
  if (station && (!roles.includes(station) || !coPilotAlive(crew) || !(crew[station] > 0) || action.copilotLow
      || points[station] || fists[station])) throw new RangeError('The co-pilot supplies that station alone');
  if (shipBonuses(fight.player.ship).shieldSplitter && points.shields > 4) throw new RangeError('Shield Splitter permits at most four SHIELDS points');
  return {points, fists, copilotStation: station, copilotLow: Boolean(action.copilotLow)};
}

export function prepareSpaceRound(original, action) {
  validateSpaceFight(original);
  if (original.status !== 'fighting' || original.stage !== 'ready') throw new RangeError('Finish the current space phase first');
  const fight = copy(original), setup = allocation(fight, action);
  if (!Number.isSafeInteger(action.target) || !fight.opponents[action.target]?.hull) throw new RangeError('Choose a living target ship');
  const fighter = fight.fires.length ? action.fireFighter : null;
  if (fight.fires.length && !['hero', 'copilot', 'both', 'ignore'].includes(fighter)) throw new RangeError('Choose how to handle the cockpit fire');
  const heroFire = fighter === 'hero' || fighter === 'both', crewFire = fighter === 'copilot' || fighter === 'both';
  if (heroFire && (Object.values(setup.points).some(Boolean) || Object.values(setup.fists).some(Boolean))) throw new RangeError('Fighting fire uses the protagonist’s whole phase');
  if (crewFire && (!coPilotAlive(fight.player.copilot) || setup.copilotStation || setup.copilotLow)) throw new RangeError('The fire-fighting co-pilot cannot operate a station');
  const cost = Math.max(0, Object.values(setup.points).reduce((a, b) => a + b, 0) - shipBonuses(fight.player.ship).powerDiscount);
  if (cost > fight.player.ship.power) throw new RangeError('Not enough current POWER');
  fight.round++; fight.player.ship.power -= cost;
  fight.roundAction = {...setup, target: action.target, fireFighter: fighter, heroFire, crewFire,
    dazzle: fight.nextDazzle ?? null};
  fight.nextDazzle = null;
  fight.ignoredFires = fighter === 'ignore' ? fight.fires.length : 0;
  fight.strayFireDone = false;
  fight.stations = null; fight.pending = null; fight.volleys = [];
  spaceNote(fight, {type: 'round-start', powerSpent: cost, ...copy(fight.roundAction)});
  finish(fight);
  if (fight.status !== 'fighting') return fight;
  if (heroFire || crewFire) {
    const player = copy(fight.player);
    player.trobble = null;
    if (!crewFire) player.copilot = null;
    fight.fireFight = startGroundFight(player, {mode: 'melee', opponents: fight.fires,
      onboardFire: true, roundLimit: fight.round, label: 'Cockpit fire'});
    fight.fireFight.round = fight.round - 1;
    fight.status = 'firefighting'; fight.stage = 'fire';
  } else fight.stage = 'allocated';
  return fight;
}

export function finishSpaceFirefight(original, ground) {
  validateSpaceFight(original); validateGroundFight(ground);
  if (original.status !== 'firefighting' || !['win', 'loss', 'ended'].includes(ground.status)
      || ground.round !== original.round || !ground.encounter.onboardFire) throw new RangeError('Finish one fire-fighting round first');
  const fight = copy(original), oldCrew = fight.player.copilot, oldShip = fight.player.ship, oldPet = fight.player.trobble;
  fight.player = copy(ground.player); fight.player.ship = oldShip;
  fight.player.trobble = oldPet;
  if (!fight.roundAction.crewFire) fight.player.copilot = oldCrew;
  fight.fires = ground.opponents.filter(enemy => enemy.health > 0).map(copy);
  fight.ignoredFires = fight.fires.length;
  for (const event of ground.log) spaceNote(fight, {...event, fireExchange: true});
  fight.fireFight = null; fight.status = 'fighting'; fight.stage = 'allocated';
  return finish(fight);
}

function playerStations(fight) {
  const a = fight.roundAction, p = fight.player, bonus = shipBonuses(p.ship), profile = {};
  for (const role of roles) {
    const crew = role === a.copilotStation ? p.copilot : null;
    const value = crew ? crew[role] : a.points[role], fists = crew ? crew.fists + combatLoadout(crew, 'space', fight.round).fists : a.fists[role];
    profile[role] = {value: role === 'shields' && bonus.shieldSplitter ? Math.min(4, value) : value,
      fists, luckySix: crew?.trait === 'chakold',
      bonus: bonus[role] + (crew?.trait === 'tarlee' ? Math.min(3, fight.round - 1) : 0)
        + ((crew || p).armour === 'nova' ? -2 : 0), crew: Boolean(crew)};
  }
  return profile;
}

function enemyStations(enemy, weaponsPenalty = 0) {
  const bonus = shipBonuses(enemy), result = {};
  for (const role of roles) result[role] = {value: Math.max(0, enemy[role] - (role === 'weapons' ? weaponsPenalty : 0)),
    fists: enemy[role === 'shields' ? 'shieldFists' : role + 'Fists'], bonus: bonus[role]};
  return result;
}

function stationRolls(ship, profiles, roll) {
  return {profiles, weapons: rollFists(profiles.weapons.fists, roll, profiles.weapons),
    manoeuvre: rollFists(profiles.manoeuvre.fists, roll, profiles.manoeuvre),
    shield: prepareSpaceShield(ship, profiles.shields.value, profiles.shields.fists, roll)};
}

export function rollSpaceStations(original, roll) {
  validateSpaceFight(original);
  if (original.status !== 'fighting' || original.stage !== 'allocated') throw new RangeError('Allocate stations and finish fire-fighting first');
  const fight = copy(original), player = stationRolls(fight.player.ship, playerStations(fight), roll);
  const enemies = fight.opponents.map((enemy, index) => {
    const dazzle = fight.roundAction.dazzle;
    if (enemy.hull) return stationRolls(enemy, enemyStations(enemy, dazzle?.target === index ? dazzle.penalty : 0), roll);
    const profiles = Object.fromEntries(roles.map(role => [role, {value: 0, fists: 0, bonus: 0}]));
    return {profiles, weapons: {score: 0, dice: []}, manoeuvre: {score: 0, dice: []},
      shield: {power: 0, score: 0, rerolls: 0, down: true, reactivation: null}};
  });
  fight.stations = {player, enemies}; fight.stage = 'rolled';
  spaceNote(fight, {type: 'station-rolls', player: copy(player), enemies: copy(enemies)});
  return fight;
}

const total = (station, role) => station.profiles[role].value + station[role].score;

export function spaceStationRerollAvailable(fight, role) {
  if (fight.status !== 'fighting' || fight.stage !== 'rolled' || !roles.includes(role) || !fight.player.rightStuffAvailable) return false;
  const station = fight.stations.player, profile = station.profiles[role];
  if (profile.crew) return false;
  if (role === 'shields') return Boolean(station.shield.reactivation && !station.shield.reactivation.success);
  if (!profile.fists) return false;
  return role === 'weapons' ? total(station, role) <= total(fight.stations.enemies[fight.roundAction.target], 'manoeuvre')
    : fight.stations.enemies.some((enemy, i) => fight.opponents[i].hull > 0 && total(enemy, 'weapons') > total(station, role));
}

export function rerollSpaceStation(original, role, roll) {
  validateSpaceFight(original);
  if (!spaceStationRerollAvailable(original, role)) throw new RangeError('No failed protagonist station roll is available for Right Stuff');
  const fight = copy(original), station = fight.stations.player, profile = station.profiles[role];
  if (role === 'shields') {
    const die = rollSix(roll); station.shield.reactivation.dice.push(die);
    station.shield.reactivation.success = die < station.shield.power;
  } else {
    station[role] = rollFists(profile.fists, roll, profile);
  }
  fight.player.rightStuffAvailable = false;
  spaceNote(fight, {type: 'right-stuff', role}); return fight;
}

function damageRecord() {return {hull: 0, ordinaryHull: 0, trigger: 6, tableDie: 6};}

function startVolleys(fight) {
  const add = (attacker, target, attack, defense, metadata) => {
    const hits = Math.max(0, total(attack, 'weapons') - total(defense, 'manoeuvre')) + Math.floor(attack.profiles.weapons.value / 3);
    fight.volleys.push({attacker, target, hits, metadata, hullDone: 0});
  };
  const target = fight.roundAction.target;
  add('player', target, fight.stations.player, fight.stations.enemies[target], fight.player.ship);
  fight.opponents.forEach((enemy, i) => {
    if (enemy.hull) add(i, 'player', fight.stations.enemies[i], fight.stations.player, enemy);
  });
  fight.damage = {player: damageRecord(), enemies: fight.opponents.map(damageRecord), perHit: []};
  fight.stage = 'volley';
}

function finishVolley(fight, volley) {
  if (volley.hullDone && volley.metadata.extraHullDamageIfAnyDuringRound) {
    const ship = volley.target === 'player' ? fight.player.ship : fight.opponents[volley.target];
    const damage = volley.metadata.extraHullDamageIfAnyDuringRound;
    ship.hull = Math.max(0, ship.hull - damage);
    const record = volley.target === 'player' ? fight.damage.player : fight.damage.enemies[volley.target];
    record.hull += damage; record.ordinaryHull += damage;
    spaceNote(fight, {type: 'extra-hull-damage', target: volley.target, damage});
  }
}

export function advanceSpaceFight(original, roll) {
  validateSpaceFight(original);
  if (original.status !== 'fighting' || original.pending || !['rolled', 'volley'].includes(original.stage)) throw new RangeError('No space volley is ready');
  const fight = copy(original);
  if (fight.stage === 'rolled') startVolleys(fight);
  while (fight.volleys.length || !fight.strayFireDone) {
    if (!fight.volleys.length) {
      fight.strayFireDone = true;
      if (!fight.encounter.strayFire) break;
      const die = rollSix(roll), target = die <= 3 ? 'player' : 0;
      spaceNote(fight, {type: 'stray-fire', die, target});
      fight.volleys.push({attacker: 'onlookers', target, hits: 1, metadata: {}, hullDone: 0});
    }
    const volley = fight.volleys[0];
    if (!volley.hits) {finishVolley(fight, volley); fight.volleys.shift(); continue;}
    const state = volley.target === 'player' ? fight.stations.player.shield : fight.stations.enemies[volley.target].shield;
    const check = rollSpaceShieldCheck(state, roll);
    if (volley.target === 'player' && fight.player.ship.hull > 0 && check.failed && !check.noWorkingShield
        && state.score > 0 && fight.player.rightStuffAvailable) {
      fight.pending = {type: 'shield', check}; return fight;
    }
    volley.hullDone += applySpaceShieldHit(fight, volley.target, check, volley.metadata, roll); volley.hits--;
  }
  finishSpaceDamage(fight, roll);
  fight.stage = 'ready'; fight.roundAction = null;
  finish(fight);
  if (fight.status === 'fighting' && fight.encounter.roundLimit && fight.round >= fight.encounter.roundLimit) {
    fight.status = 'ended'; spaceNote(fight, {type: 'printed-interruption', section: fight.encounter.roundLimitTarget ?? null});
  }
  return fight;
}

export function decideSpaceShieldReroll(original, reroll, roll) {
  validateSpaceFight(original);
  if (original.status !== 'fighting' || original.stage !== 'volley' || original.pending?.type !== 'shield') throw new RangeError('No failed shield check awaits a decision');
  const fight = copy(original), check = fight.pending.check, shield = fight.stations.player.shield;
  if (reroll) {
    if (!fight.player.rightStuffAvailable) throw new RangeError('Right Stuff has already been used');
    const die = rollSix(roll); check.dice.push(die); check.failed = die === 6 || die > shield.score;
    fight.player.rightStuffAvailable = false; check.rightStuffUsed = true;
  }
  const volley = fight.volleys[0];
  volley.hullDone += applySpaceShieldHit(fight, volley.target, check, volley.metadata, roll); volley.hits--;
  fight.pending = null; return advanceSpaceFight(fight, roll);
}

export function leaveSpaceFight(original, reason) {
  validateSpaceFight(original);
  if (!['fighting', 'firefighting'].includes(original.status)) throw new RangeError('This encounter has already ended');
  const fight = copy(original);
  if (fight.fireFight) {
    const {ship, copilot, trobble} = fight.player;
    fight.player = copy(fight.fireFight.player); fight.player.ship = ship; fight.player.trobble = trobble;
    if (!fight.roundAction.crewFire) fight.player.copilot = copilot;
  }
  if (reason === 'surrender') {
    if (!fight.encounter.surrenderTarget || fight.encounter.noSurrenderAfterKill && fight.opponents.some(enemy => enemy.hull === 0)) throw new RangeError('Surrender is not available');
    fight.status = 'loss'; fight.endingReason = 'surrender';
    spaceNote(fight, {type: 'surrender', section: fight.encounter.surrenderTarget});
  } else if (reason === 'escape') {
    if (!fight.encounter.retreatTarget) throw new RangeError('No printed escape option');
    const cost = integer(fight.encounter.retreatPowerCost ?? 0);
    if (fight.player.ship.power <= cost) throw new RangeError('Not enough POWER to escape alive');
    fight.player.ship.power -= cost; fight.status = 'ended'; fight.endingReason = 'escape';
    spaceNote(fight, {type: 'escape', powerSpent: cost, section: fight.encounter.retreatTarget});
  } else throw new RangeError('Invalid encounter exit');
  fight.pending = null; fight.volleys = []; fight.fireFight = null; fight.roundAction = null; fight.stage = 'ready';
  return fight;
}
