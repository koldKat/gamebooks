import {PROGRAMS, PROGRAM_TYPES, SUCCESS_SECTIONS, encounterOptions} from './definition.js';

export function createLedger(clan) {
  if (!Object.hasOwn(PROGRAMS, clan)) throw new RangeError('Invalid clan');
  return {clan, programs: Object.fromEntries(PROGRAM_TYPES.flatMap(type => [0, 1, 2].map(index => [type + index, {owned: false, remaining: 0}]))), safety: false};
}

export function validateLedger(ledger) {
  if (!ledger || !Object.hasOwn(PROGRAMS, ledger.clan) || typeof ledger.safety !== 'boolean') throw new RangeError('Invalid ledger');
  for (const type of PROGRAM_TYPES) for (const index of [0, 1, 2]) {
    const program = ledger.programs?.[type + index];
    if (!program || typeof program.owned !== 'boolean' || !Number.isInteger(program.remaining) || program.remaining < 0 || program.remaining > 3 || !program.owned && program.remaining !== 0) throw new RangeError('Invalid program');
  }
  return ledger;
}

export function resolveProgram(ledger, encounter, type, index) {
  validateLedger(ledger);
  const option = encounterOptions(encounter).find(option => option.type === type && option.index === index);
  const program = ledger.programs[type + index];
  if (!option || !program?.owned || program.remaining < 1) throw new RangeError('Unavailable program');
  const next = structuredClone(ledger);
  next.programs[type + index].remaining--;
  const success = SUCCESS_SECTIONS[ledger.clan].includes(option.section);
  const outcome = success ? 'win' : type === 'key' ? 'blocked' : 'loss';
  return {ledger: next, fight: {encounter, type, index, section: ledger.clan + option.section, outcome, ruleVersion: 1}};
}

export function rechargePrograms(ledger) {
  validateLedger(ledger);
  const next = structuredClone(ledger);
  for (const program of Object.values(next.programs)) program.remaining = program.owned ? 3 : 0;
  return next;
}

export function useSafety(ledger, encounter) {
  validateLedger(ledger); encounterOptions(encounter);
  if (!ledger.safety) throw new RangeError('No safety device');
  return {ledger: {...structuredClone(ledger), safety: false}, fight: {encounter, outcome: 'escape', ruleVersion: 1}};
}
