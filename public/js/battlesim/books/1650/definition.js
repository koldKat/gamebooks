import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 1650,
  title: 'Alone Against the Dark',
  family: 'cthulhu-solo',
  stateKey: 'sim1650',
  i18nPrefix: 'battlesim1650',
});

export let encounters = [];
export let investigators = [];

export const loadRoster = createRosterLoader(definition.id, 'ALONE_AGAINST_THE_DARK', rows => {
  const combat = rows.filter(row => row.kind === 'encounter');
  const player = rows.filter(row => row.kind === 'investigator');
  if (!combat.length || combat.some(row => !row.id || !row.enemies?.length)
      || player.length !== 4 || player.some(row => !row.profile?.name)) throw new Error('Incomplete combat catalog');
  encounters = combat;
  investigators = player.map(row => row.profile);
});
