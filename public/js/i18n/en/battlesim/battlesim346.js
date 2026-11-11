// English controls for the optional The Fall of Blood Mountain encounter tool.
import newOrder from './battlesim341.js';
export default {
  ...Object.fromEntries(Object.entries(newOrder).map(([key,value])=>[key.replace('battlesim341.','battlesim346.'),value])),
  'battlesim346.title':'The Fall of Blood Mountain',
  'battlesim346.note':'Enter current stats and a separate weapon adjustment, including mastery and the applicable Kai Weapon bonus. Psychic attacks never combine. Apply entry wounds, spells, inventory and story effects in the reader. Deliverance must be ready and can be used only once per 20 days.',
};
