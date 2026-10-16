export const definition = Object.freeze({
  id: 758, title: 'Алфа срещу Омега', family: 'cyber-programs', stateKey: 'sim758', i18nPrefix: 'battlesim758',
});

export const PROGRAM_TYPES = ['antivirus', 'key', 'virus'];
export const PROGRAMS = Object.freeze({
  A: {antivirus: ['Косачка', 'Кора от банан', 'Айнщайн'], key: ['Осем', 'Ключ тройка', 'Тиган'], virus: ['Бръшлян', 'МГЕ', 'Нютон']},
  O: {antivirus: ['Абсорбираща сфера', 'Светия Граал', 'Елементал'], key: ['Свитък', 'Ключова карта', 'Щит'], virus: ['Светкавична мрежа', 'Смърт', 'Облак']},
});

const commonWins = [19, 22, 38, 41, 57, 60, 25, 44, 63, 28, 47, 66, 85, 80, 75, 88, 77, 84];
export const SUCCESS_SECTIONS = Object.freeze({
  A: Object.freeze([...commonWins, 49, 68, 33, 70, 35, 54]),
  O: Object.freeze([...commonWins, 31, 68, 51, 52, 71, 36]),
});

export function encounterOptions(encounter) {
  if (!Number.isInteger(encounter) || encounter < 1 || encounter > 18) throw new RangeError('Invalid encounter');
  const type = encounter <= 6 ? 'antivirus' : encounter <= 12 ? 'key' : 'virus';
  const options = [0, 1, 2].map(index => ({type, index, section: encounter + 18 * (index + 1)}));
  if (type === 'key') options.push(...[0, 1, 2].map(index => ({type: 'virus', index, section: encounter + 66 + index * 6})));
  return options;
}
