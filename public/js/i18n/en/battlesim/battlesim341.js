// English copy for the optional Voyage of the Moonstone encounter tool.
import grandmaster from './battlesim333.js';
export default {
  ...Object.fromEntries(Object.entries(grandmaster).map(([key,value])=>[key.replace('battlesim333.','battlesim341.'),value])),
  'battlesim341.title':'Voyage of the Moonstone',
  'battlesim341.note':'Enter current stats. Put weapon bonuses, including Grand Weaponmastery and your Kai Weapon, in the weapon adjustment. Kai Weapon bonuses replace each other; mastery stacks. Dar-Isun suppresses that adjustment for the first round. Psychic attacks never combine. Entry wounds, Curing, arrows and story effects stay in the reader. Deliverance must be ready and can be used only once per 20 days.',
  'battlesim341.modifier':'Weapon adjustment (weapon bonus and mastery)',
  'battlesim341.surge':'Kai-surge (+8 / costs 1 Ep; requires more than 6 Ep)',
};
