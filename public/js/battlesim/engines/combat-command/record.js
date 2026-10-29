import { combatCommandForce, startCombatCommandFight, combatCommandRound, combatCommandTest } from './core.js';

const copy = value => structuredClone(value);
const integer = (value, min = 0, max = 1000000) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid record value');
  return value;
};
const randomDie = () => Math.floor(Math.random() * 6) + 1;
const active = record => record.fight?.status === 'fighting';

export function createCommandRecord(defaults) {
  if (!defaults || !Number.isFinite(defaults.maximumHours) || defaults.maximumHours <= 0) throw new RangeError('Missing fleet rules');
  return { rulesVersion: 1, fleet: combatCommandForce([...defaults.fleet,...(defaults.optionalShips??[])]), morale: integer(defaults.morale),
    stealth: integer(defaults.stealth), hours: defaults.hours ?? 0, defaults: copy(defaults),
    enemyForces: {}, completedEffects: {}, completedEncounters: {}, history: [], log: [], fight: null, recovery: null };
}

function guard(record) {
  if (!record || record.rulesVersion !== 1) throw new RangeError('No fleet record');
}

function log(record, event) {
  record.log.push(event);
  record.log = record.log.slice(-100);
}

export function commandRecordOutcome(record) {
  const fleet = record.fleet.filter(unit => !unit.detached);
  if (record.hours > record.defaults.maximumHours || fleet.some(unit => unit.essential && !unit.count)) return 'loss';
  return null;
}

function addHours(record, hours) {
  if (!Number.isFinite(hours) || hours < 0 || hours > 1000000) throw new RangeError('Invalid time');
  record.hours += hours;
}

function availableFleet(record) {
  return record.fleet.filter(unit => unit.count && !unit.detached);
}

function capacity(record) {
  const limit = record.fleet.filter(unit => !unit.detached).reduce((sum, unit) => sum + (unit.droneCapacity ?? 0) * unit.count, 0);
  let left = limit;
  for (const unit of record.fleet.filter(unit => unit.drone)) {
    unit.count = Math.min(unit.count, left); unit.spent = Math.min(unit.spent, unit.count); left -= unit.count;
  }
}

export function updateCommandRecord(previous, values) {
  guard(previous);
  if (active(previous)) throw new RangeError('Finish the current encounter first');
  const record=copy(previous);
  record.morale=integer(values.morale);record.stealth=integer(values.stealth);
  if (!Number.isFinite(values.hours) || values.hours<0 || values.hours>1000000 || values.hours*2%1) throw new RangeError('Invalid elapsed time');
  record.hours=values.hours;
  const incoming=combatCommandForce(values.fleet);
  if (incoming.length!==record.fleet.length || incoming.some(unit=>!record.fleet.some(ship=>ship.key===unit.key))) throw new RangeError('Unknown fleet ship');
  for (const unit of incoming) {
    const ship=record.fleet.find(current=>current.key===unit.key);
    const original=record.defaults.fleet.find(current=>current.key===unit.key)
      ?? record.defaults.optionalShips?.find(current=>current.key===unit.key);
    ship.count=integer(unit.count,0,original.maxCount??original.count);
    ship.spent=Math.min(ship.spent,ship.count);ship.detached=Boolean(unit.detached);
  }
  capacity(record);
  return record;
}

export function commandEncounterForce(record, entry, setup = {}) {
  guard(record);
  const fleet = availableFleet(record);
  if (entry.forceMode === 'troops' || entry.forceMode === 'fixed-player') return combatCommandForce(setup.player ?? entry.playerUnits);
  if (entry.forceMode === 'custom') return combatCommandForce(setup.player);
  if (entry.forceMode === 'fleet') return copy(fleet.filter(unit => !unit.drone || entry.dronesMayAttack));
  if (entry.forceMode === 'drones') return copy(fleet.filter(unit => unit.drone));
  const keys = entry.forceMode === 'selected-ships' ? entry.playerKeys : setup.playerKeys;
  if (!Array.isArray(keys) || new Set(keys).size !== keys.length) throw new RangeError('Choose the engaged ships');
  const result = fleet.filter(unit => keys.includes(unit.key));
  if (entry.forceMode === 'selected-ships') return copy(result);
  if (result.length !== keys.length) throw new RangeError('A selected ship is unavailable');
  if (entry.forceMode === 'recon-birds' && (result.length !== entry.selectCount
      || result.some(unit => unit.shipClass !== entry.selectionClass))) throw new RangeError('Choose the reconnaissance birds');
  if (entry.forceMode === 'holding-squadron') {
    const classes = entry.selectionClasses;
    if (result.some(unit => !Object.hasOwn(classes,unit.shipClass))
        || Object.entries(classes).some(([kind,count]) => result.filter(unit => unit.shipClass === kind).length !== count)) throw new RangeError('Choose the printed holding squadron');
  }
  return copy(result);
}

export function beginCommandEncounter(previous, entry, charts, setup = {}) {
  guard(previous);
  if (active(previous)) throw new RangeError('Finish the current encounter first');
  const record = copy(previous), config = copy(entry);
  if (record.recovery && !record.recovery.done) throw new RangeError('Resolve drone recovery before another encounter');
  for (const key of config.scriptedLossKeys ?? []) {
    const ship = record.fleet.find(unit => unit.key === key);
    if (ship) ship.count = 0;
  }
  let enemies = setup.enemies ?? record.enemyForces[config.enemyForceKey] ?? config.enemies;
  if (config.continuationFrom) {
    const prior = record.completedEncounters[config.continuationFrom];
    if (!setup.enemies && !prior) throw new RangeError('Enter the surviving opponents from the preceding boarding action');
    if (!setup.enemies) enemies = prior.enemies;
  }
  config.enemies = copy(enemies);
  const player = commandEncounterForce(record,config,setup);
  record.fight = startCombatCommandFight(player,config,charts);
  record.engagedFleetKeys = ['troops','fixed-player','custom'].includes(config.forceMode) ? [] : player.map(unit => unit.key);
  record.repair = null;
  record.unrepairable = [];
  log(record,{type:'start',section:config.section,label:config.label});
  return record;
}

export function advanceCommandEncounter(previous, options = {}, roll = randomDie) {
  guard(previous);
  const record = copy(previous);
  record.fight = combatCommandRound(record.fight,options,roll);
  const fight = record.fight;
  for (const unit of fight.player) {
    if (!record.engagedFleetKeys.includes(unit.key)) continue;
    const ship = record.fleet.find(entry => entry.key === unit.key);
    if (ship) { ship.count = unit.count; ship.spent = unit.spent; }
  }
  if (fight.config.enemyForceKey) record.enemyForces[fight.config.enemyForceKey] = copy(fight.enemies);
  if (fight.status !== 'fighting') {
    record.completedEncounters[fight.config.section] = copy(fight);
    if (fight.config.detachSurvivors) for (const unit of record.fleet) {
      if (record.engagedFleetKeys.includes(unit.key)) unit.detached = true;
    }
    if (fight.config.droneRecoverySection === fight.section && fight.launchedDrones > 0) {
      record.recovery = { section:fight.config.droneRecoverySection, launched:fight.launchedDrones,
        survivingSpent:Math.max(0,fight.launchedDrones-fight.destroyedSpentDrones), done:false };
    } else {
      for (const unit of record.fleet.filter(unit => unit.drone)) { unit.count -= unit.spent; unit.spent = 0; }
      capacity(record);
    }
    if (fight.config.afterCombatHours && fight.status !== 'loss') addHours(record,fight.config.afterCombatHours);
    log(record,{type:'result',section:fight.section,status:fight.status,label:fight.config.label});
  }
  return record;
}

export function cancelCommandEncounter(previous) {
  guard(previous);
  if (!active(previous)) throw new RangeError('No active encounter');
  const record=copy(previous);
  record.fight.status='cancelled'; record.fight.section=null;
  for (const unit of record.fleet.filter(unit=>unit.drone)) { unit.count-=unit.spent; unit.spent=0; }
  capacity(record);
  log(record,{type:'cancel',section:record.fight.config.section});
  return record;
}

export function applyCommandEffect(previous, effect) {
  guard(previous);
  if (active(previous)) throw new RangeError('Finish the current encounter first');
  if (!effect || typeof effect.key !== 'string' || !effect.key) throw new RangeError('Choose an effect');
  const record = copy(previous);
  if (record.completedEffects[effect.key]) throw new RangeError('This effect has already been applied');
  addHours(record,effect.hours ?? 0);
  if (effect.morale !== undefined) record.morale = integer(record.morale + effect.morale);
  if (effect.restoreKeys) for (const key of effect.restoreKeys) {
    const unit = record.fleet.find(ship => ship.key === key);
    if (!unit) throw new RangeError('Unknown returning ship');
    unit.detached = false;
  }
  if (effect.lossCount) {
    let remaining = integer(effect.lossCount,1);
    const candidates = (effect.lossClasses ?? []).flatMap(kind => availableFleet(record).filter(ship => ship.shipClass === kind));
    for (const unit of candidates) { const lost = Math.min(remaining,unit.count); unit.count -= lost; remaining -= lost; if (!remaining) break; }
    if (remaining) throw new RangeError('Not enough eligible ships');
  }
  if (effect.enemyLoss) {
    const change = effect.enemyLoss;
    const enemies = record.enemyForces[change.force] ?? copy(effect.enemyDefaults);
    const unit = enemies?.find(enemy => enemy.key === change.key);
    if (!unit) throw new RangeError('Missing enemy fleet');
    unit.count = Math.max(0,unit.count-integer(change.count,1));
    record.enemyForces[change.force] = enemies;
  }
  capacity(record);
  record.completedEffects[effect.key] = true;
  log(record,{type:'effect',key:effect.key,section:effect.section,hours:effect.hours ?? 0});
  return record;
}

export function testCommandRecord(previous, instruction, roll = randomDie) {
  guard(previous);
  if (active(previous)) throw new RangeError('Finish the current encounter first');
  const record=copy(previous);
  if (!instruction || !['morale','stealth'].includes(instruction.stat) && instruction.value === undefined) throw new RangeError('Choose a test');
  if (instruction.hours && !record.completedEffects[instruction.effectKey]) {
    if (!instruction.effectKey) throw new RangeError('Missing time effect');
    addHours(record,instruction.hours);
    record.completedEffects[instruction.effectKey]=true;
  }
  const result=combatCommandTest(instruction.value ?? record[instruction.stat],roll);
  log(record,{type:'test',...result,section:instruction.section,next:result.passed?instruction.success:instruction.failure});
  return record;
}

export function recoverCommandDrones(previous, roll = randomDie) {
  guard(previous);
  const record=copy(previous), recovery=record.recovery;
  if (active(record) || !recovery || recovery.done) throw new RangeError('No unresolved drone recovery');
  const dice=[integer(roll(6),1,6),integer(roll(6),1,6)];
  let lost=Math.min(dice[0]+dice[1],recovery.survivingSpent);
  for (const unit of record.fleet.filter(unit => unit.drone)) {
    const remove=Math.min(lost,unit.spent,unit.count);
    unit.count-=remove; unit.spent=0; lost-=remove;
  }
  recovery.done=true;
  capacity(record);
  log(record,{type:'drone-recovery',dice,section:recovery.section});
  return record;
}

export function repairCommandFlagship(previous, instruction, roll = randomDie) {
  guard(previous);
  const record=copy(previous);
  if (active(record) || !record.fight || String(record.fight.section)!==String(instruction?.section)
      || record.repair?.done) throw new RangeError('No pending flagship repair');
  if (!record.repair) {
    record.repair={section:instruction.section,done:false};
    addHours(record,instruction.battleHours);
  }
  const die=integer(roll(6),1,6);
  addHours(record,instruction.hoursPerRoll);
  record.repair.done=die<=integer(instruction.threshold,1,6);
  log(record,{type:'flagship-repair',section:instruction.section,die,done:record.repair.done});
  return record;
}

export function repairCommandShips(previous, instruction, keys, roll = randomDie) {
  guard(previous);
  const record=copy(previous), fight=record.fight;
  if (active(record) || !fight || !instruction?.afterSections?.includes(fight.config.section)
      || !Array.isArray(keys) || !keys.length || keys.length>instruction.restoreCount || new Set(keys).size!==keys.length) throw new RangeError('Choose eligible ships for repair');
  const ships=keys.map(key => {
    const ship=record.fleet.find(unit => unit.key===key), start=fight.startPlayer.find(unit => unit.key===key);
    if (!ship || !start || ship.drone || ship.count>=start.count || record.unrepairable?.includes(key)) throw new RangeError('This ship cannot be repaired');
    return {ship,start};
  });
  const die=integer(roll(6),1,6), success=die<=integer(instruction.threshold,1,6);
  addHours(record,instruction.hoursPerRoll);
  if (success) for (const {ship,start} of ships) ship.count=Math.min(start.count,ship.count+1);
  else record.unrepairable=[...new Set([...(record.unrepairable??[]),...keys])];
  log(record,{type:'ship-repair',section:instruction.section,keys,die,success});
  return record;
}
