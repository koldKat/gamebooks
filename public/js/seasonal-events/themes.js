// Seasonal theme registry; calendar and preview selection share the same factories.
import { createPumpkin } from './pumpkin.js';
import { createDiya } from './diya.js';
import { createSeasonalBackground } from './background.js';
import { diwaliArtwork } from './diwali-artwork.js';
export const seasonalThemes = {
  halloween: { cursor:createPumpkin, background:() => createSeasonalBackground() },
  diwali: { cursor:createDiya, background:() => createSeasonalBackground({
    id:'diwali', artwork:diwaliArtwork, featured:[0,1,2,3,4,5,6,7], cornerWebs:false,
  }) },
};
