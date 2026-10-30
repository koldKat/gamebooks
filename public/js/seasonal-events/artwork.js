// One Halloween artwork pool in a consistent retro pixel style.
import { halloweenClassics } from './classic-artwork.js';
import { halloweenCreatures } from './creature-artwork.js';
import { hauntedArtwork } from './haunted-artwork.js';
import { animateHalloweenSprite } from './halloween-animation.js';

export const halloweenArtwork = [...halloweenClassics, ...halloweenCreatures, ...hauntedArtwork].map(animateHalloweenSprite);
