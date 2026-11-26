import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 1885,
  title: 'Vampire of Havena',
  stateKey: 'sim1885',
  family: 'dark-eye-solo',
});

export const defaultHero = Object.freeze({
  life: 29, attack: 13, parry: 9, dodge: 9, protection: 1, damageDice: 1, damageBonus: 4,
});

export const weapons = Object.freeze({
  saber: { attack: 13, parry: 9, damageDice: 1, damageBonus: 4 },
  dagger: { attack: 6, parry: 8, damageDice: 1, damageBonus: 2 },
  unarmed: { attack: 6, parry: 3, damageDice: 1, damageBonus: 1 },
});

export const encounters = [];
export const loadRoster = createRosterLoader(definition.id, definition.family, entries => {
  const keys = new Set(entries.map(entry => entry.key));
  if (keys.size !== entries.length || entries.some(entry => {
    const opponent = entry.opponent;
    return entry.key !== String(entry.section) || !Number.isSafeInteger(entry.section)
      || !opponent?.displayName || opponent.life < 1
      || Object.keys(defaultHero).some(key => !Number.isSafeInteger(opponent[key]))
      || !Array.isArray(entry.notes) || entry.notes.some(note => typeof note !== 'string')
      || !entry.rules || typeof entry.rules !== 'object';
  })) throw new TypeError('Invalid Dark Eye combat roster');
  encounters.splice(0, encounters.length, ...entries);
});
