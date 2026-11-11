// English copy for the optional Mydnight's Hero encounter tool.
import newOrder from './battlesim341.js';
export default {
  ...Object.fromEntries(Object.entries(newOrder).map(([key,value])=>[key.replace('battlesim341.','battlesim343.'),value])),
  'battlesim343.title':"Mydnight's Hero",
  'battlesim343.note':'Enter current stats and a separate weapon adjustment, including mastery. Use the higher Kai Weapon bonus when applicable. Presets include Prince Karvas\' help where stated. Psychic attacks never combine. Apply entry wounds, inventory, noncombat Curing and story effects in the reader. Deliverance must be ready and can be used only once per 20 days.',
};
