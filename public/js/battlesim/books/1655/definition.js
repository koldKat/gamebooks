import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 1655,
  title: 'Alone Against the Wendigo',
  family: 'cthulhu-solo',
  stateKey: 'sim1655',
  i18nPrefix: 'battlesim1655',
});

export let encounters = [];
export let investigators = [];

export const loadRoster = createRosterLoader(definition.id, 'ALONE_AGAINST_THE_WENDIGO', rows => {
  const roster = rows.filter(row => row.kind === 'encounter');
  const profiles = rows.filter(row => row.kind === 'investigator').map(row => row.profile);
  if (!roster.length || roster.some(row => !row.classicRules || !row.id || !row.enemies?.length)
      || profiles.length !== 6 || profiles.some(row => !row?.role || !row.weaponChoices?.unarmed)) {
    throw new Error('Incomplete second-edition combat catalog');
  }
  encounters = roster;
  investigators = profiles;
});
