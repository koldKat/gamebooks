// Seasonal theme registry; calendar and preview selection share the same factories.
import {cursorDesigns} from './cursor-designs.js';
import {createRotatingCursor} from './rotating-cursor.js';
export const seasonalThemes=Object.fromEntries(Object.entries(cursorDesigns).map(([id,designs])=>[id,{cursor:options=>createRotatingCursor(designs,options)}]));
