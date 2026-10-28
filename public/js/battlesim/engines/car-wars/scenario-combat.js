import * as combat from './multi-combat.js';
import {startChase,chaseTurn} from './chase.js';
export {carrySurvivors} from './encounters.js';
export {repairVehicle,replaceDriver,tactic,combatTargets,weaponAvailable} from './multi-combat.js';

export function validateCombatant(source) {
  if (source?.kind!=='chase') return combat.validateCombatant(source);
  if (!Number.isSafeInteger(source.controlRoll) || source.controlRoll<0)
    throw new RangeError('Enter the chase Control roll');
  return structuredClone(source);
}
export const combatantOut=unit=>unit.kind==='chase'?!!(unit.escaped||unit.out):combat.combatantOut(unit);

// Keep the common panel's active/paused lifecycle without changing either
// engine's saved rule version or deriving fictitious combat stats for chases.
export function startFight(hero,entry,options={},roll) {
  if (!entry.rules.chase?.noCombat) return combat.startFight(hero,entry,options,roll);
  return {...startChase(validateCombatant(hero),entry),status:'fighting',
    baseSection:entry.baseSection??entry.section,encounter:entry.label,
    allies:[],options:structuredClone(options),appliedEntries:[entry.section]};
}
export function fightRound(previous,action={},roll) {
  if (previous?.type!=='chase') return combat.fightRound(previous,action,roll);
  if (previous.status!=='fighting') throw new RangeError('No active chase');
  const result=chaseTurn({...previous,status:'chasing'},roll);
  if (result.status==='chasing') result.status='fighting';
  return result;
}
export function resumeFight(previous,entry,roll) {
  if (previous?.type!=='chase') return combat.resumeFight(previous,entry,roll);
  if (!['fighting','paused'].includes(previous.status) || !entry.rules.chase?.noCombat
      || String(previous.baseSection)!==String(entry.baseSection??entry.section))
    throw new RangeError('No matching unfinished chase');
  return {...structuredClone(previous),status:'fighting',section:null,events:['Chase resumed; previous Control rolls retained.']};
}
