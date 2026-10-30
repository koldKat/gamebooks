// Seasonal theme registry; calendar and preview selection share the same factories.
import { createPumpkin } from './pumpkin.js';
import { createDiya } from './diya.js';
import { createSanta,createNewYearChampagne } from './winter-cursors.js';
export const seasonalThemes = {
  halloween: {cursor:createPumpkin},
  diwali: {cursor:createDiya},
  christmas: {cursor:createSanta},
  'new-year': {cursor:createNewYearChampagne},
};
