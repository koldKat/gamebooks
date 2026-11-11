// Reuse the shared Golden Dragon controls for Curse of the Pharaoh.
import controls from './battlesim388.js';
export default Object.fromEntries(Object.entries(controls).map(([key,value]) => [key.replace('battlesim388.', 'battlesim390.'), key.endsWith('.title') ? 'Curse of the Pharaoh: Combat' : value]));
