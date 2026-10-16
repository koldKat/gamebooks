import { createCustomOpponentSetup } from '../../custom-setup.js';
import { demonOpponentFields } from './opponents.js';
import { FIRE_WOLF_WEAPONS, FIRE_WOLF_ARMOUR } from './fire-wolf.js';

export function createDemonOpponentSetup({document, id, t, tk, roster, getRun, getData}) {
  return createCustomOpponentSetup({document, id, t, getRun, getData,
    fields: demonOpponentFields.map(field => ({...field, label: tk(field.key)})),
    defaults: {power: 0, weapon: 0, armour: 0, shield: 0},
    presets: roster.map(enemy => ({...enemy, displayName: enemy.name,
      weapon: typeof enemy.weapon === 'number' ? enemy.weapon : FIRE_WOLF_WEAPONS[enemy.weapon],
      armour: typeof enemy.armour === 'number' ? enemy.armour : FIRE_WOLF_ARMOUR[enemy.armour],
      shield: Number(Boolean(enemy.shield)),
    })),
  });
}
