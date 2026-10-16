import { validateOpponents } from '../opponents.js';

export const thresholdFields = [{key: 'roundsCount', min: 2, max: 4},
  ...[1, 2, 3, 4].map(index => ({key: 'threshold' + index, min: 1, max: 100})),
  {key: 'winsRequired', max: 4}, {key: 'modifier', min: -100, max: 100}];

export function customThresholdEncounter(entries, section, opponents, kind) {
  if (String(section) !== '0' || !opponents) return undefined;
  if (opponents.length !== 1) throw new RangeError('Choose one multi-round encounter');
  const [settings] = validateOpponents(opponents, thresholdFields);
  if (settings.winsRequired > settings.roundsCount) throw new RangeError('Too many required wins');
  const source = entries.find(entry => entry.section === settings.presetSection);
  const spec = {...structuredClone(source ?? {}), section: 0, custom: true, name: settings.displayName || 'Opponent',
    manualModifier: settings.modifier, wins: settings.winsRequired};
  if (kind === 'arkham') {
    spec.thresholds = Array.from({length: settings.roundsCount}, (_, index) => settings['threshold' + (index + 1)]);
    spec.stats ??= ['combat'];
  } else {
    spec.rounds = Array.from({length: settings.roundsCount}, (_, index) => ({
      ...structuredClone(source?.rounds[index] ?? {stats: ['combat'], bonus: [], penalty: [], momentum: 0}),
      target: settings['threshold' + (index + 1)],
    }));
    spec.countWins = settings.winsRequired > 0;
    spec.outcomes = Array.from({length: settings.roundsCount + 1}, () => null);
  }
  return spec;
}
