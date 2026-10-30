// Seasonal theme registry; calendar and preview selection share the same factories.
import { createPumpkin } from './pumpkin.js';
import { createDiya } from './diya.js';
import { createSeasonalBackground } from './background.js';
import { diwaliArtwork } from './diwali-artwork.js';
import { christmasArtwork,newYearArtwork } from './winter-artwork.js';
import { createSanta,createNewYearClock } from './winter-cursors.js';
export const seasonalThemes = {
  halloween: { cursor:createPumpkin, background:() => createSeasonalBackground() },
  diwali: { cursor:createDiya, background:() => createSeasonalBackground({
    id:'diwali', artwork:diwaliArtwork, featured:[0,1,2,3,4,5,6,7], cornerWebs:false,
  }) },
  christmas: { cursor:createSanta,background:()=>createSeasonalBackground({id:'christmas',artwork:christmasArtwork,featured:[0,1,3,4,5,6,8,11],cornerWebs:false}) },
  'new-year': { cursor:createNewYearClock,background:()=>createSeasonalBackground({id:'new-year',artwork:newYearArtwork,featured:[0,1,2,3,4,8,9,15],cornerWebs:false}) },
};
