// English controls for the optional Storms of Chai combat tool.
import newOrder from './battlesim348.js';
export default {
  ...Object.fromEntries(Object.entries(newOrder).map(([key,value])=>[key.replace('battlesim348.','battlesim349.'),value])),
  'battlesim349.title':'The Storms of Chai',
  'battlesim349.enemyUndead':'Custom opponent is undead',
  'battlesim349.kirusami':"Use Anseng's Kirusami (+1 Cs; first round costs 3 Ep)",
  'battlesim349.enhancedKirusami':'Kirusami enhanced in section 119 (triple undead damage; first round costs 4 Ep)',
  'battlesim349.wardstone':'Wear the Wardstone (undead enemies lose 3 Cs)',
  'battlesim349.powerStrike':'Cast Power Strike (+1 Cs and wound damage; costs 3 Ep)',
  'battlesim349.malavan':'Malavan (+2 Cs with Mindblast, Psi-surge or Kai-surge)',
  'battlesim349.animal':'Animal Mastery (Wild Guanza: +2 Cs)',
  'battlesim349.psiSurge':'Psi-surge (+6 Cs / costs 2 Ep)',
  'battlesim349.continue':'Continue the same fight',
  'battlesim349.log.continue_fight':'Continue this fight in section {section}, retaining both remaining Endurance scores.',
  'battlesim349.note':"Enter current base stats and a separate equipment adjustment. Kirusami adds its own +1 Cs, so do not include it twice. Enhanced Kirusami requires Use Anseng's Kirusami. Psychic attacks never combine; use the power specified by the encounter. Apply entry wounds and recovery in the reader. For Karmo, make its side-effect draw and enter the temporary Ep before starting; restore normal Ep after the fight. Deliverance must be ready and is available only once per 20 days.",
};
