// Reuse Lost Jedi combat terminology with The Bounty Hunter's own title.
import labels from './battlesim1577.js';
export default {
  ...Object.fromEntries(Object.entries(labels).map(([key,value])=>[key.replace('battlesim1577.','battlesim1578.'),value])),
  'battlesim1578.title':'The Bounty Hunter: Combat',
};
