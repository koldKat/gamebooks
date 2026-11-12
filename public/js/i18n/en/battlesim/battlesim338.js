// English copy for the optional Dawn of the Dragons encounter tool.
import grandmaster from './battlesim337.js';
export default {
  ...Object.fromEntries(Object.entries(grandmaster).map(([key,value])=>[key.replace('battlesim337.','battlesim338.'),value])),
  'battlesim338.title':'Dawn of the Dragons',
  'battlesim338.note':'Enter current stats and a weapon adjustment, including mastery and the Sommerswerd\'s +8 Cs when used. Encounter penalties and the extra sword bonus on the Plane of Darkness apply automatically. Keep entry wounds, healing, spells and story effects in the reader. Deliverance must be ready and can be used only once per 20 days.',
};
