export const definition = Object.freeze({
  id: 808,
  title: 'Заветът на Зендари',
  family: 'mech-combat',
  stateKey: 'sim808',
  i18nPrefix: 'battlesim808',
});

export const RULES_REVISION = 1;
export const MECHS = Object.freeze({
  argos: { weapons: 3, armour: 4 },
  olympia: { weapons: 4, armour: 3 },
  sparta: { weapons: 5, armour: 5 },
  mycenae: { weapons: 4, armour: 4 },
});
export const ENCOUNTERS = [
  { section: 2, kind: 'mech', count: 2, range: 1, escape: true, destination: '47' },
  { section: 27, kind: 'mech', count: 1, range: 1, escape: true, destination: '47' },
  { section: 36, kind: 'mech', count: 2, range: 0, escape: true, entryDamage: 1, destination: '50' },
  { section: 69, kind: 'mech', count: 1, range: 3, escape: true, destination: '50' },
  { section: 92, kind: 'mech', count: 3, range: 2, escape: false, destination: '70' },
  { section: 71, kind: 'ravagers', count: 1, range: 0, escape: false },
  { section: 96, kind: 'personal', count: 1, range: 0, escape: false, destination: '50' },
];
