import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 1886,
  title: 'Conspiracy of Mages',
  stateKey: 'sim1886',
  family: 'dark-eye-solo',
});

export const defaultHero = Object.freeze({
  life: 29, attack: 8, parry: 6, dodge: 5, protection: 0, damageDice: 1, damageSides: 6, damageBonus: 2,
});

const animal = { parry: 0, dodge: 7, protection: 0, damageDice: 1, damageBonus: 0 };
export const weapons = Object.freeze({
  staff: { attack: 8, parry: 6, damageDice: 1, damageSides: 6, damageBonus: 2 },
  brawling: { attack: 7, parry: 3, damageDice: 1, damageSides: 6, damageBonus: 0 },
  catClaws: { ...animal, attack: 14, damageSides: 2 },
  catBite: { ...animal, attack: 12, damageSides: 3 },
  ratBite: { ...animal, attack: 10, damageSides: 3 },
});

export const encounters = [];
export const loadRoster = createRosterLoader(definition.id, definition.family, entries => {
  if (new Set(entries.map(entry => entry.key)).size !== entries.length || entries.some(entry =>
    entry.key !== String(entry.section) || !Number.isSafeInteger(entry.section)
    || !entry.opponent?.displayName || entry.opponent.life < 1
    || Object.keys(defaultHero).some(key => !Number.isSafeInteger(entry.opponent[key]))
    || !Array.isArray(entry.notes) || !entry.rules
    || !Array.isArray(entry.allowedHeroProfiles) || !entry.allowedHeroProfiles.length
    || entry.allowedHeroProfiles.some(profile => !Object.hasOwn(weapons, profile))
  )) throw new TypeError('Invalid Conspiracy of Mages combat roster');
  encounters.splice(0, encounters.length, ...entries);
});
