// Validate database-owned Real Life combat presets and project their editable combatants.
import {realLifeInteger} from './core.js';

export function validateRealLifeCatalog(entries) {
  if (!Array.isArray(entries) || !entries.length) throw new RangeError('Missing encounter catalog');
  const sections = new Set();
  for (const entry of entries) {
    const section = String(entry.section);
    if (!/^\d+$/.test(section) || sections.has(section) || !entry.name || !Array.isArray(entry.opponents) || !entry.opponents.length) throw new RangeError('Invalid encounter');
    sections.add(section);
    for (const actor of [...entry.opponents, ...(entry.allies ?? [])]) {
      if (!actor.name) throw new RangeError('Missing combatant name');
      if (!(actor.noWoundsPrinted && entry.knifePossession)) realLifeInteger(actor.wounds, 1);
      if (actor.skill != null) realLifeInteger(actor.skill, 0, 99);
      else if (actor.skills) for (const skill of Object.values(actor.skills)) realLifeInteger(skill, 0, 99);
      else if (!(actor.noSkillPrinted && entry.enemyAttackMode === 'agility-avoidance') && !actor.unprintedSkill) throw new RangeError('Missing printed combat skill');
      if (actor.damage != null) realLifeInteger(actor.damage, 1, 100);
      if (actor.horsemanship != null) realLifeInteger(actor.horsemanship, 0, 99);
    }
  }
  return entries;
}

export function realLifeEditorRows(actors, weapon = 'sword') {
  return actors.map(actor => ({...structuredClone(actor), displayName: actor.name,
    skill: actor.skills?.[weapon] ?? actor.skill ?? '', damage: actor.damage ?? (['firearm', 'javelin'].includes(weapon) ? 2 : 1),
    horsemanship: actor.horsemanship ?? 0, mounted: Boolean(actor.mounted)}));
}
