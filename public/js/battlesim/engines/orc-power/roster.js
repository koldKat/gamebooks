import { createOrcFigure } from './core.js';

const die = (base, sides) => ({ base, sides });
export const ORC_MONSTER_FIGURINES = Object.freeze({ samuraiDemon:'alTanhar',
  phantomTroll:'monster', hydra:'monster', basilisk:'monster', vampireBat:'monk',
  darkElf:'monk', ghost:'monk', werewolf:'bandit' });
const row = (id, sourcePage, attack, defence, shooting, damage, life, magicPower = 0, magicDamage = 0) =>
  ({ id, sourcePage, attack, defence, shooting, damage, life, magicPower, magicDamage });

// Unresolved source cells stay null and require an explicit value, never a guessed zero.
export const ORC_FIGURES = [
  row('strabron', 33, die(10,8), die(8,8), 2, 4, die(16,6), die(12,8), die(6,8)),
  row('malabron', 33, die(10,6), die(8,6), 4, 4, die(12,6)),
  row('trabron', 33, null, null, 0, 6, die(12,8)),
  row('giantOrc', 33, die(12,6), die(8,6), 0, 6, 16),
  row('forestOrc', 33, die(6,6), die(4,6), die(8,6), 2, 8),
  row('stoneOrc', 33, die(8,6), die(12,8), 6, 4, 24),
  row('lunarOrc', 33, die(4,6), die(2,6), die(4,6), 2, 6, null, die(4,6)),
  row('harold', 33, die(12,8), die(6,8), 0, 6, die(16,8)),
  row('incitat', 33, die(6,6), die(4,6), die(4,6), 6, die(16,8)),
  row('eyrin', 33, die(6,6), die(4,6), die(12,8), 2, die(6,8), die(12,6), die(6,8)),
  row('togdumin', 33, die(2,6), die(2,6), die(0,6), 2, die(6,6), die(16,8), die(8,8)),
  row('soldier', 33, die(8,6), die(6,6), die(6,6), 4, null),
  row('dryad', 33, die(2,6), null, null, 2, null),
  row('samuraiDemon', 35, die(16,8), die(8,8), 0, 8, null),
  row('phantomTroll', 35, die(24,8), die(4,6), 0, 12, null),
  row('vampireBat', 35, die(6,8), die(6,6), 0, 4, null),
  row('werewolf', 35, die(12,8), die(2,8), 0, 6, 36),
  row('hydra', 35, die(16,6), die(12,8), 0, 8, 16),
  row('darkElf', 35, die(2,6), die(2,6), 0, 2, 4, die(12,8), die(6,8)),
  row('basilisk', 35, 2, die(2,8), 0, null, null, die(8,6), 0),
  row('ghost', 35, 0, die(8,8), 0, null, null, 0, 0),
  { ...row('fireElemental', 34, null, null, 0, null, null), elemental: true, weakness: 'water' },
  { ...row('airElemental', 34, null, null, 0, null, null), elemental: true, weakness: 'fire' },
  { ...row('earthElemental', 34, null, null, 0, null, null), elemental: true, weakness: 'air' },
  { ...row('waterElemental', 34, null, null, 0, null, null), elemental: true, weakness: 'earth' },
];

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
