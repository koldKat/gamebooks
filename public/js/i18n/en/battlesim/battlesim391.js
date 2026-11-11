// Reuse the shared Golden Dragon controls for Castle of Lost Souls.
import controls from './battlesim388.js';
export default Object.fromEntries(Object.entries(controls).map(([key,value]) => [key.replace('battlesim388.', 'battlesim391.'), key.endsWith('.title') ? 'Castle of Lost Souls: Combat' : value]));
