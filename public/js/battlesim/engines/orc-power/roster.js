import { createOrcFigure } from './core.js';

import { createRosterLoader } from '../../roster-data.js';

export let ORC_FIGURES = [];
export let ORC_MONSTER_FIGURINES = Object.freeze({});
export const loadRoster = createRosterLoader(654, 'FIGURES', rows => {
  const support = rows.find(row => row.support)?.support;
  if (!support?.figures?.length || !support.monsterFigurines) throw new Error('Incomplete Orc figure catalog');
  const entries = [...rows, ...support.figures].sort((a,b) => a.index-b.index);
  if (new Set(entries.map(row => row.index)).size !== entries.length || new Set(entries.map(row => row.template.id)).size !== entries.length) throw new Error('Conflicting Orc figure catalog');
  ORC_FIGURES = entries.map(row => row.template);
  ORC_MONSTER_FIGURINES = Object.freeze(support.monsterFigurines);
});

const statKeys = new Set(['attack', 'defence', 'shooting', 'damage', 'life', 'magicPower', 'magicDamage']);
const equipmentKeys = new Set(['armour', 'weaponAttack', 'weaponShooting', 'weaponDamage']);

export function prepareOrcFigure(templateId, { id, side, currentLife, displayName, stats = {}, equipment = {} } = {}, roll) {
  const template = ORC_FIGURES.find(figure => figure.id === templateId) ?? (templateId === 'custom' ? {} : null);
  if (!template) throw new RangeError('Unknown source figure');
  if (!stats || !equipment || Array.isArray(stats) || Array.isArray(equipment)
      || Object.keys(stats).some(key => !statKeys.has(key))
      || Object.keys(equipment).some(key => !equipmentKeys.has(key))) throw new RangeError('Invalid figure overrides');
  const figure = createOrcFigure({ ...template, ...stats, ...equipment, id, side, currentLife }, roll);
  if (displayName !== undefined) figure.displayName = String(displayName).trim().slice(0, 200);
  return figure;
}
