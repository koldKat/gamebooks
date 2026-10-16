import { createCustomOpponentSetup } from '../../custom-setup.js';
import { opponentFields } from './opponents.js';

export function createGrailOpponentSetup({document, id, t, tk, encounters, getRun, getData, labels = {}}) {
  return createCustomOpponentSetup({document, id, t, getRun, getData,
    fields: opponentFields.map(field => ({...field, label: tk(labels[field.key] ?? field.key)})),
    presets: encounters.flatMap(entry => entry.foes ?? entry.enemies ?? [entry]),
  });
}
