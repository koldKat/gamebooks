import { createDarkEyePanel } from '../../engines/dark-eye/panel.js';
import { defaultHero, definition, encounters, loadRoster, weapons } from './definition.js';

export const { init, loadData, render, setVisible } = createDarkEyePanel({
  defaultHero, defaultWeapon: 'staff', definition, encounters, loadRoster, weapons,
  normalProfiles: ['staff', 'brawling'], variableDice: true,
});
