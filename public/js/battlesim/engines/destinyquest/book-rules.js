// Book options are copied into a fight once, so saving and resuming cannot
// substitute another edition's abilities or defeat rules.
const categories = new Set(['sp', 'co', 'mo', 'pa', 'dm', '-']);
const phases = new Set(['start', 'speed', 'speed-rolled', 'damage', 'damage-rolled', 'ability-rolled', 'end', 'death-move']);

export function destinyBookOptionSnapshot({ catalog, bookRules } = {}) {
  const result = {};
  if (bookRules !== undefined) {
    if (!bookRules || typeof bookRules !== 'object' || Array.isArray(bookRules) ||
        Object.entries(bookRules).some(([key, value]) => !['deathPenalties', 'deathMoves'].includes(key) || typeof value !== 'boolean')) {
      throw new RangeError('Invalid book combat rules');
    }
    result.bookRules = structuredClone(bookRules);
  }
  if (catalog !== undefined) {
    if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog) ||
        Object.entries(catalog).some(([name, spec]) => !/^[a-z][a-z0-9-]*$/.test(name) || !spec ||
          !categories.has(spec.category) || !Array.isArray(spec.phases) || spec.phases.some(phase => !phases.has(phase)))) {
      throw new RangeError('Invalid book ability catalog');
    }
    result.abilityCatalog = structuredClone(catalog);
  }
  return result;
}

export const destinyPenaltyApplies = (fight, name) => fight.bookRules?.deathPenalties !== false &&
  !!fight.character?.penalties?.includes(name);
export const destinyDeathMovesEnabled = fight => fight.bookRules?.deathMoves !== false;
