// Compose editable opponents using only the custom combat templates in the database.
import {normalizeProcedure} from './core.js';

export function compileCustomProcedure(opponents, rules) {
  if (!Array.isArray(opponents) || !opponents.length || opponents.length > 100) {
    throw new RangeError('Invalid opponent count');
  }
  const prepared = opponents.map(row => {
    const name = String(row.displayName ?? '').trim();
    const profile = rules.customProfiles?.[row.damageDice];
    if (!name || name.length > 200 || !profile || !Array.isArray(profile.steps)) {
      throw new RangeError('Enter the opponent name and damage rule');
    }
    const parameters = {};
    for (const field of rules.customOpponentFields.filter(field => !field.options)) {
      const value = Number(row[field.key]);
      if (row[field.key] === '' || row[field.key] == null || !Number.isSafeInteger(value)
          || value < field.min || value > field.max) throw new RangeError('Invalid opponent stat');
      parameters[field.key] = value;
    }
    function substitute(value) {
      if (Array.isArray(value)) {
        if (value[0] === 'param' && value.length === 2) {
          if (!Object.hasOwn(parameters, value[1])) throw new RangeError('Missing opponent parameter');
          return parameters[value[1]];
        }
        return value.map(substitute);
      }
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
        .map(([key, part]) => [key, substitute(part)]));
      return value;
    }
    return {name, profile:substitute(profile)};
  });
  const variables = prepared[0].profile.variables;
  if (prepared.some(row => JSON.stringify(row.profile.variables) !== JSON.stringify(variables))) {
    throw new RangeError('Incompatible custom combat templates');
  }
  const steps = prepared.flatMap(({name, profile}, index) => profile.steps.map(source => {
    const prefix = id => `custom-${index}-${id}`;
    const step = structuredClone(source); step.id = prefix(step.id); step.label = name + ': ' + step.label;
    for (const row of step.routes ?? step.choices ?? []) row.to = prefix(row.to);
    if (step.kind === 'outcome' && step.outcome === 'win' && index < prepared.length - 1) {
      step.kind = 'effect'; delete step.outcome;
      step.routes = [{to:`custom-${index + 1}-${prepared[index + 1].profile.entry}`}];
    }
    return step;
  }));
  return normalizeProcedure({name:prepared.length === 1 ? prepared[0].name
    : rules.customGroupName + ' (' + prepared.length + ')', custom:true,
    section:prepared[0].profile.section, entry:'custom-0-' + prepared[0].profile.entry,
    defeatSection:null, variables, terminalRules:prepared[0].profile.terminalRules ?? [], steps});
}
