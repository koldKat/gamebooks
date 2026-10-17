export const definition = Object.freeze({id: 832, title: 'Аленият крадец', family: 'scarlet-thief', stateKey: 'sim832', i18nPrefix: 'battlesim832'});
export const RULES_REVISION = 1;
export const ENCOUNTERS = [
  {section: 3, displayName: 'Комисар Дюпен', mode: 'persuasion', attack: 0, hp: 8, destination: '13'},
  {section: 37, displayName: 'Багха Хан', mode: 'tiger', attack: 7, hp: 10, destination: '49'},
  {section: 63, displayName: 'Графиня Изабел', mode: 'countess', attack: 0, hp: 6, destination: '61'},
  {section: 77, displayName: 'Графиня Изабел — етерни изумруди', mode: 'emeralds', attack: 0, hp: 4, destination: '61'},
  {section: 71, displayName: 'Часовниковата кукувица', mode: 'clock', attack: 0, hp: 3, destination: '59'},
];
export const MODES = ['tiger', 'persuasion', 'countess', 'emeralds', 'clock'];
export function encounterPreset(section) {
  const value = ENCOUNTERS.find(row => row.section === Number(section));
  if (!value) throw new RangeError('Invalid encounter');
  return {...value};
}
