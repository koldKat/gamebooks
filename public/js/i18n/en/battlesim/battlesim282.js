// English text for The Forbidden City's optional combat tool.
import greyStar from './battlesim281.js';

export default {
  ...Object.fromEntries(Object.entries(greyStar).map(([key, value]) => [key.replace('battlesim281.', 'battlesim282.'), value])),
  'battlesim282.ui.title': 'Battle simulator: The Forbidden City',
  'battlesim282.ui.effects_note': 'Printed combat modifiers and round limits are automatic. Choose Willpower spending each round. For the Prophecy bonus from §119, enter +2 under Other combat modifier when fighting §39. Handle earlier spell costs in the reader.',
  'battlesim282.ui.mental_note': 'Karmo (§45): before combat, enter twice your current Endurance and Willpower. After combat, halve the remaining scores and subtract a random 0–9 Endurance. Apply that loss before or after halving, as you choose. The reader keeps your potion inventory.',
};
