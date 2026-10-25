// Placed, single-use orb defences on a database-defined path. Saved progress
// remains part of the fight, including positions and unresolved orb choices.
import {createDestinyTurn, settleDestinyFight} from './core.js';
import {recordDestinyDefeat} from './effects.js';

function edit(fight, phase) {
  if (fight?.status !== 'active' || fight.phase !== phase || !fight.encounter?.pathChallenge) {
    throw new RangeError('Path challenge unavailable at this stage');
  }
  return structuredClone(fight);
}

export function beginDestinyPath(fight, placements, additionalOrbs = {}) {
  const next = edit(fight, 'encounter-setup'), rule = next.encounter.pathChallenge;
  if (!placements || typeof placements !== 'object' || Array.isArray(placements) ||
      !additionalOrbs || typeof additionalOrbs !== 'object' || Array.isArray(additionalOrbs)) throw new RangeError('Choose orb placements');
  const stock = Object.fromEntries(Object.entries(rule.orbs).map(([name, orb]) => [name, orb.count]));
  for (const [name, amount] of Object.entries(additionalOrbs)) {
    if (!Object.hasOwn(stock, name) || !Number.isSafeInteger(amount) || amount < 0) throw new RangeError('Invalid additional orb count');
    stock[name] += amount;
  }
  const sockets = rule.cells.flatMap(cell => cell.sockets);
  for (const [socket, name] of Object.entries(placements)) {
    if (!sockets.includes(socket) || !Object.hasOwn(stock, name) || --stock[name] < 0) throw new RangeError('Invalid orb placement or insufficient stock');
  }
  next.encounter.pathProgress = {
    placements: {...placements}, additionalOrbs: {...additionalOrbs}, usedSockets: [],
    positions: Object.fromEntries(rule.targets.map(target => [target, rule.startPosition])),
    held: {}, cursed: [], pendingSockets: [], reachedExit: false, roundPrepared: false, roundHadCombat: false,
  };
  next.encounter.inactiveTargets = [...rule.targets];
  next.phase = 'encounter-start';
  return next;
}

function finishMovement(fight) {
  const rule = fight.encounter.pathChallenge, progress = fight.encounter.pathProgress;
  // Orbs without any remaining eligible target still expend their one use.
  progress.pendingSockets = progress.pendingSockets.filter(socket => {
    const orb = rule.orbs[progress.placements[socket]], cell = rule.cells.findIndex(cell => cell.sockets.includes(socket));
    const eligible = rule.targets.some(target => fight.opponents[target].health > 0 && progress.positions[target] === cell &&
      (orb.kind !== 'curse' || !progress.cursed.includes(target)));
    if (!eligible) progress.usedSockets.push(socket);
    return eligible;
  });
  if (progress.pendingSockets.length) fight.phase = 'encounter-orbs';
  else {
    fight.encounter.inactiveTargets = rule.targets.filter(target => progress.positions[target] < rule.cells.length);
    progress.roundHadCombat = rule.targets.some(target => fight.opponents[target].health > 0 && progress.positions[target] === rule.cells.length);
    progress.roundPrepared = progress.roundHadCombat;
    fight.phase = progress.roundHadCombat ? 'start' : 'end';
    settleDestinyFight(fight);
  }
}

export function advanceDestinyPath(fight) {
  const next = edit(fight, 'encounter-start'), rule = next.encounter.pathChallenge, progress = next.encounter.pathProgress;
  if (!progress || progress.pendingSockets.length) throw new RangeError('Finish the current orb choices first');
  next.round++;
  next.turn = createDestinyTurn();
  progress.roundHadCombat = false;
  progress.roundPrepared = false;
  const entered = new Set();
  for (const target of rule.targets) {
    if (next.opponents[target].health <= 0 || progress.positions[target] >= rule.cells.length) continue;
    if (progress.held[target] > 0) { progress.held[target]--; continue; }
    progress.positions[target]++;
    if (progress.positions[target] === rule.cells.length) progress.reachedExit = true;
    else entered.add(progress.positions[target]);
  }
  progress.pendingSockets = [...entered].flatMap(index => rule.cells[index].sockets)
    .filter(socket => progress.placements[socket] && !progress.usedSockets.includes(socket));
  next.history.push({type: 'path-move', round: next.round, positions: {...progress.positions}});
  finishMovement(next);
  return next;
}

export function useDestinyPathOrb(fight, socket, target) {
  const next = edit(fight, 'encounter-orbs'), rule = next.encounter.pathChallenge, progress = next.encounter.pathProgress;
  if (!progress.pendingSockets.includes(socket)) throw new RangeError('Choose a pending orb');
  const name = progress.placements[socket], orb = rule.orbs[name];
  const cell = rule.cells.findIndex(cell => cell.sockets.includes(socket));
  const occupants = rule.targets.filter(index => next.opponents[index].health > 0 && progress.positions[index] === cell);
  if (orb.kind !== 'shared-damage' && (!Number.isInteger(target) || !occupants.includes(target))) throw new RangeError('Choose a guardian in this square');
  switch (orb.kind) {
    case 'hold': progress.held[target] = (progress.held[target] || 0) + orb.duration; break;
    case 'curse':
      if (progress.cursed.includes(target)) throw new RangeError('This guardian is already cursed');
      progress.cursed.push(target);
      break;
    case 'set-stat': next.opponents[target][orb.attribute] = orb.value; break;
    case 'shared-damage': {
      const damage = orb.damageByCount[occupants.length];
      if (!Number.isSafeInteger(damage) || damage < 0) throw new RangeError('Invalid orb damage setting');
      for (const index of occupants) {
        next.opponents[index].health = Math.max(0, next.opponents[index].health - damage);
        if (!next.opponents[index].health) { recordDestinyDefeat(next, index); next.turn.deaths.push(index); }
      }
      break;
    }
    default: throw new RangeError('Unknown orb effect');
  }
  progress.pendingSockets = progress.pendingSockets.filter(value => value !== socket);
  progress.usedSockets.push(socket);
  next.history.push({type: 'path-orb', round: next.round, socket, orb: name, target: orb.kind === 'shared-damage' ? occupants : target});
  finishMovement(next);
  return next;
}

export function destinyPathEndEffects(fight) {
  const rule = fight.encounter?.pathChallenge, progress = fight.encounter?.pathProgress;
  if (!rule || !progress) return [];
  const curse = Object.values(rule.orbs).find(orb => orb.kind === 'curse');
  return progress.cursed.filter(target => fight.opponents[target].health > 0).map(target => ({
    target, amount: curse.amount, ignoreArmour: true, source: curse.name, allowInactive: true,
  }));
}
