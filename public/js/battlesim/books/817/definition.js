export const definition = Object.freeze({id: 817, title: 'Зона 51', family: 'ammunition-resource', stateKey: 'sim817', i18nPrefix: 'battlesim817'});
export const RULES_REVISION = 1;
export const ENCOUNTERS = [
  {section: 3, displayName: 'Пришълци при военните машини', count: 3, destination: '1'},
  {section: 4, displayName: 'Страж на спалните помещения', count: 1, destination: '1'},
  {section: 7, displayName: 'Страж на медицинския център', count: 1, destination: '1'},
  {section: 8, displayName: 'Пришълци на полигона', count: 2, destination: '1'},
  {section: 14, displayName: 'Охрана на секретния вход', count: 3, counts: [3, 5, 7], destination: '25'},
  {section: 15, displayName: 'Патрул при грешен код', count: 3, destination: null},
  {section: 30, displayName: 'Похитители на руския президент', count: 2, hostage: true, destination: '22'},
  {section: 37, displayName: 'Разяреният пришълец', count: 1, meleeOnly: true, destination: '20'},
  {section: 44, displayName: 'Патрул в коридора', count: 5, destination: '25'},
  {section: 55, displayName: 'Екипажът в основния хангар', count: 5, counts: [5, 10, 15], destination: '57'},
  {section: 57, displayName: 'Похитителят пред космическия кораб', count: 1, hostage: true, destination: '51'},
  {section: 58, displayName: 'Пришълци в празния хангар', count: 3, destination: '55'},
];
export const DIFFICULTIES = ['easy', 'hard', 'apocalyptic'];
export function encounterPreset(section, difficulty = 'easy') {
  const row = ENCOUNTERS.find(value => value.section === Number(section));
  const index = DIFFICULTIES.indexOf(difficulty);
  if (!row || index < 0) throw new RangeError('Invalid encounter');
  return {...row, count: row.counts?.[index] ?? row.count};
}
