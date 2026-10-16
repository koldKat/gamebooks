import { validateOpponents } from '../../opponents.js';

export const fields = [{key: 'expertise', min: -100}, {key: 'vitality', min: 1}, {key: 'damage'}];

export function editableSkyfallEncounter(source, opponents) {
  if (!source && !opponents) throw new RangeError('Unknown encounter');
  if (!opponents) return structuredClone(source);
  if (source && source.foes.length !== opponents.length) throw new RangeError('Invalid opponent count');
  const values = validateOpponents(opponents.map((enemy, index) => ({...enemy,
    ...Object.fromEntries(fields.filter(field => source?.foes[index][field.key] === null)
      .map(field => [field.key, 0])),
  })), fields.map(field => field.key === 'vitality' ? {...field, min: 0} : field));
  const encounter = structuredClone(source ?? {section: 'custom', custom: true});
  encounter.customNames = values.some((enemy, index) => enemy.displayName && enemy.displayName !== source?.foes[index].name);
  encounter.foes = values.map((enemy, index) => {
    const base = source?.foes[index] ?? {};
    const result = {...base, name: enemy.displayName || base.name || 'Opponent'};
    for (const {key} of fields) result[key] = base[key] === null ? null : enemy[key];
    if (result.vitality !== null && result.vitality < 1) throw new RangeError('Opponent must be alive');
    result.initialVitality = result.vitality;
    return result;
  });
  return encounter;
}
