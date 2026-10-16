import { createCustomOpponentSetup } from '../custom-setup.js';
import { thresholdFields } from './threshold-opponents.js';

export function createThresholdSetup({document, id, t, tk, encounters, getRun, getData}) {
  const defaults = {roundsCount: 2, threshold1: 15, threshold2: 15, threshold3: 15, threshold4: 15,
    winsRequired: 0, modifier: 0};
  return createCustomOpponentSetup({document, id, t, getRun, getData, fixedCount: true, defaults,
    fields: thresholdFields.map(field => ({...field, label: t('battlesim.threshold.' + field.key)})),
    presets: encounters.map(entry => {
      const targets = entry.thresholds ?? entry.rounds.map(round => round.target);
      return {...defaults, displayName: tk('enemy.' + entry.section), presetSection: entry.section,
        roundsCount: targets.length, winsRequired: entry.wins ?? (entry.countWins ? Math.ceil(targets.length / 2) : 0),
        ...Object.fromEntries([1, 2, 3, 4].map(index => ['threshold' + index, targets[index - 1] ?? targets.at(-1)])),
      };
    }),
  });
}
