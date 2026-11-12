// English copy for the optional Wolf's Bane encounter tool.
import grandmaster from './battlesim337.js';
export default {
  ...Object.fromEntries(Object.entries(grandmaster).map(([key,value])=>[key.replace('battlesim337.','battlesim339.'),value])),
  'battlesim339.title':"Wolf's Bane",
  'battlesim339.note':'Enter current stats and weapon adjustments, including mastery and the Sommerswerd\'s +8 Cs when used. The rapier duel fixes the Combat Ratio at -4 and mirrors your current Endurance. Entry wounds, puzzle answers and story effects stay in the reader. Deliverance must be ready and can be used only once per 20 days.',
  'battlesim339.grandCrownUnarmed':'Unarmed with Grand Weaponmastery at Grand Crown rank (+3 Cs)',
  'battlesim339.bronzeDisc':'Bronze Disc (duel opponent starts with 4 fewer Ep)',
  'battlesim339.planeSword':'Use the source footnote: Sommerswerd on Plane of Darkness (+4 Cs)',
};
