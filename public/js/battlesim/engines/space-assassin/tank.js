import { dice, die, integer, validateCharacter } from './core.js';

const copy = value => structuredClone(value);
const nextStatus = (status, rules) => status % rules.statusCycle + 1;

function positionAt(definition, section) {
  const position = definition.positions[section];
  if (!position || !Array.isArray(position.routes)) throw new RangeError('Unknown tank position');
  return position;
}

function arrive(state, definition) {
  state.status = nextStatus(state.status, definition);
  const position = positionAt(definition, state.section);
  const encounter = (position.encounters ?? []).filter(entry => entry.statuses.includes(state.status));
  if (encounter.length > 1) throw new RangeError('Ambiguous tank encounter');
  state.pendingSection = encounter[0]?.section ?? null;
  state.phase = state.pendingSection === null ? 'move' : 'encounter';
  return state;
}

export function startTank(character, definition) {
  validateCharacter(character, true);
  integer(definition.statusCycle, 1, 100);
  integer(definition.playerShields, 1);
  integer(definition.enemyShields, 1);
  integer(definition.startSection, 1);
  positionAt(definition, definition.startSection);
  return arrive({ rulesRevision: 1, player: copy(character), section: definition.startSection,
    status: 0, shields: definition.playerShields, enemyShields: definition.enemyShields,
    phase: 'move', pendingSection: null, outcome: null, events: [] }, definition);
}

function requireActive(state, phase) {
  if (!state || state.rulesRevision !== 1 || state.outcome || state.phase !== phase) {
    throw new RangeError('No matching active tank action');
  }
  validateCharacter(state.player, true);
  integer(state.shields, 1);
  integer(state.enemyShields, 1);
}

export function moveTank(original, section, definition) {
  requireActive(original, 'move');
  integer(section, 1);
  if (!positionAt(definition, original.section).routes.includes(section)) throw new RangeError('Illegal tank move');
  positionAt(definition, section);
  const state = copy(original);
  state.events.push({ kind: 'move', from: state.section, to: section });
  state.section = section;
  state.events = state.events.slice(-100);
  return arrive(state, definition);
}

export function resolveTankEncounter(original, definition, roll = die) {
  requireActive(original, 'encounter');
  const effect = definition.effects[original.pendingSection];
  if (!effect || !['playerShot', 'enemyFirst', 'unseenHit'].includes(effect.kind)) {
    throw new RangeError('Unknown tank effect');
  }
  const state = copy(original);
  const finish = () => {
    if (!state.shields) {
      state.player.stamina = 0;
      state.outcome = 'loss';
    } else if (!state.enemyShields) {
      state.outcome = 'win';
      state.destination = definition.winSection;
    }
    // A return chooses the next move: it is not another arrival or STATUS check.
    state.pendingSection = null;
    state.phase = state.outcome ? 'finished' : 'move';
    state.events = state.events.slice(-100);
    return state;
  };
  if (effect.kind === 'unseenHit') {
    state.shields--;
    state.status = nextStatus(state.status, definition);
    state.events.push({ kind: 'unseenHit', shields: state.shields });
    return finish();
  }
  if (effect.kind === 'enemyFirst') {
    const value = dice(1, roll), hit = value !== 1;
    if (hit) state.shields--;
    state.status = nextStatus(state.status, definition);
    state.events.push({ kind: 'enemyShot', roll: value, hit, shields: state.shields });
    if (!state.shields) return finish();
  }
  const value = dice(2, roll), hit = value < state.player.skill;
  if (hit) state.enemyShields--;
  state.events.push({ kind: 'playerShot', roll: value, hit, shields: state.enemyShields });
  if (effect.kind === 'playerShot' && state.enemyShields) state.status = nextStatus(state.status, definition);
  return finish();
}
