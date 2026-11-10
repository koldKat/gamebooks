// English copy for the optional Legacy of Vashna encounter tool.
import grandmaster from './battlesim333.js';
export default {
  ...Object.fromEntries(Object.entries(grandmaster).map(([key,value])=>[key.replace('battlesim333.','battlesim336.'),value])),
  'battlesim336.title':'The Legacy of Vashna',
  'battlesim336.note':'Enter current stats and a separate weapon adjustment, including mastery. Apply entry wounds, Sommerswerd recovery and story effects in the reader. Sun Lord powers require their disciplines. Kai-blast replaces other psychic attacks for each round; zero counts as one for both damage draws. Deliverance must be ready and can be used only once per 20 days.',
  'battlesim336.trainedMountedCombat':'Grand Weaponmastery at Sun Knight rank or higher',
  'battlesim336.huntmastery':'Grand Huntmastery',
  'battlesim336.flame':'Sun Lord: ignite a nonmagical metal weapon',
  'battlesim336.deathstaff':'Using the Deathstaff',
  'battlesim336.ranksAboveGrandGuardian':'Ranks above Kai Grand Guardian',
  'battlesim336.kaiBlast':'Kai-blast (two damage draws / costs 4 EP)',
  'battlesim336.log.psychic_damage':'Kai-blast inflicts {n} additional ENDURANCE loss.',
};
