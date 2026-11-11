// English controls for the optional Trail of the Wolf encounter tool.
import newOrder from './battlesim341.js';
export default {
  ...Object.fromEntries(Object.entries(newOrder).map(([key,value])=>[key.replace('battlesim341.','battlesim345.'),value])),
  'battlesim345.title':'Trail of the Wolf',
  'battlesim345.kaiScreen':'Kai-screen',
  'battlesim345.note':'Enter current stats and a separate weapon adjustment, including mastery and the applicable Kai Weapon bonus. Psychic attacks never combine. Apply entry wounds, vials, spells, inventory and story effects in the reader. Deliverance must be ready and can be used only once per 20 days.',
};
