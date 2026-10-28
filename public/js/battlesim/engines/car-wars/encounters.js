import {combatantOut} from './multi-combat.js';

// A later scene may identify the survivors but must not recreate their vehicles.
// Printed crew and newly revealed weapons come from the destination DB roster.
export function carrySurvivors(entry, previous) {
  const result=structuredClone(entry), rule=result.rules?.survivorsFrom;
  if (!rule || !previous) return result;
  if (String(previous.baseSection ?? previous.sourceSection)!==String(rule.section)
      || ['fighting','awaitingDriver'].includes(previous.status))
    throw new RangeError('Finish the earlier vehicle encounter first');
  const survivors=previous.enemies.filter(unit=>!combatantOut(unit)).slice()
    .sort((a,b)=>b.hp-a.hp).slice(0,rule.count);
  if (survivors.length!==rule.count || result.enemies.length!==rule.count)
    throw new RangeError('The earlier encounter does not have enough surviving vehicles');
  result.enemies=result.enemies.map((profile,index)=>{
    const saved=structuredClone(survivors[index]);
    // Existing front weapons retain their damage/ammunition. Later printed
    // reductions can remove boxes, but cannot restore a damaged component.
    const weapons=profile.weapons.map((weapon,i)=>{
      const old=saved.weapons[i];
      if (!old || old.direction!==weapon.direction || old.name!==weapon.name) return structuredClone(weapon);
      return {...old,boxes:Math.min(old.boxes,weapon.boxes),linkedGroup:weapon.linkedGroup};
    });
    return {...saved,name:profile.name,key:profile.key,carriedFromKey:saved.key,
      driving:profile.driving,gunnery:profile.gunnery,weapons,
      unattended:false,canAttack:true};
  });
  return result;
}
