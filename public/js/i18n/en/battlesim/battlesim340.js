// English copy for the optional Curse of Naar encounter tool.
import grandmaster from './battlesim337.js';
export default {
  ...Object.fromEntries(Object.entries(grandmaster).map(([key,value])=>[key.replace('battlesim337.','battlesim340.'),value])),
  'battlesim340.title':'The Curse of Naar',
  'battlesim340.note':'Enter current stats and weapon adjustment, including mastery and the chosen sword bonus. Skarn-Ska adds 5 CS; the Sommerswerd adds 8 CS. Kai-ray requires Sun Prince rank, costs 4 EP and can be used once per fight while above 10 EP. Change psychic attacks between rounds; they never combine. Entry wounds, secret names, item puzzles and story effects stay in the reader. Deliverance must be ready and can be used only once per 20 days.',
  'battlesim340.blueDiamond':'Blue Diamond (+3 CS against Huan\'zhor)',
  'battlesim340.skarnSka':'Using Skarn-Ska (extra +2 CS against Huan\'zhor)',
  'battlesim340.planeSword':'Use the source footnote: Sommerswerd on Plane of Darkness (+4 CS)',
  'battlesim340.kaiRay':'Sun Prince: Kai-ray (once per fight / 15 damage / costs 4 EP)',
  'battlesim340.log.psychic_damage':'Psychic attack inflicts {n} additional ENDURANCE loss.',
};
