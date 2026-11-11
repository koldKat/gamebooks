// English controls for the optional Vampirium encounter tool.
import newOrder from './battlesim341.js';
export default {
  ...Object.fromEntries(Object.entries(newOrder).map(([key,value])=>[key.replace('battlesim341.','battlesim347.'),value])),
  'battlesim347.title':'Vampirium',
  'battlesim347.flame':'Sun Lord: ignite a nonmagical metal weapon',
  'battlesim347.kaiBlast':'Sun Lord: Kai-blast (two damage draws / costs 4 EP)',
  'battlesim347.log.psychic_damage':'Psychic attack inflicts {n} additional ENDURANCE loss.',
  'battlesim347.note':'Enter current stats and a separate weapon adjustment, including mastery and the applicable Kai Weapon bonus. Psychic attacks never combine. Apply entry wounds, spells, inventory and story effects in the reader. Deliverance must be ready and can be used only once per 20 days.',
};
