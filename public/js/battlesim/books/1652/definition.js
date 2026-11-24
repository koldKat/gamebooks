import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 1652,
  title: 'Alone Against the Frost',
  family: 'cthulhu-solo',
  stateKey: 'sim1652',
  i18nPrefix: 'battlesim1652',
});

export let encounters = [];
export let investigators = [];

export const loadRoster = createRosterLoader(definition.id, 'ALONE_AGAINST_THE_FROST', rows => {
  const combat = rows.filter(row => row.kind === 'encounter');
  const player = rows.filter(row => row.kind === 'investigator').map(row => row.profile);
  if (!combat.length || combat.some(row => !row.id || !row.name || !row.enemies?.length)
      || player.length !== 5 || player.some(row => !row?.role || !row.weaponChoices?.unarmed)) {
    throw new Error('Incomplete combat catalog');
  }
  encounters = combat;
  investigators = player;
});
