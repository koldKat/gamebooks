export const definition = Object.freeze({
  id: 810,
  title: 'Пътят на Пъдпъдъка - промо',
  family: 'opposed-attack',
  stateKey: 'sim810',
  i18nPrefix: 'battlesim810',
});
export const RULES_REVISION = 1;
export const ENCOUNTERS = [
  {section: 2, displayName: 'Пират', attack: 2, life: 6, destination: '13'},
  {section: 3, displayName: 'Морска капа', attack: 1, life: 3, destination: '2'},
  {section: 5, displayName: 'Варварин', attack: 2, life: 4, destination: '11'},
  {section: 8, displayName: 'Гниещ бръмбар', attack: 1, life: 4, destination: '11', escape: true},
];
