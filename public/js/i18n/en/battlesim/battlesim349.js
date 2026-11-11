// English controls for the optional Storms of Chai combat tool.
import newOrder from './battlesim348.js';
export default {
  ...Object.fromEntries(Object.entries(newOrder).map(([key,value])=>[key.replace('battlesim348.','battlesim349.'),value])),
  'battlesim349.title':'The Storms of Chai',
  'battlesim349.enemyUndead':'Custom opponent is undead',
  'battlesim349.kirusami':"Use Anseng's Kirusami (+1 CS; first round costs 3 EP)",
  'battlesim349.enhancedKirusami':'Kirusami enhanced in section 119 (triple undead damage; first round costs 4 EP)',
  'battlesim349.wardstone':'Wear the Wardstone (undead enemies lose 3 CS)',
  'battlesim349.powerStrike':'Cast Power Strike (+1 CS and wound damage; costs 3 EP)',
  'battlesim349.malavan':'Malavan (+2 CS with Mindblast, Psi-surge or Kai-surge)',
  'battlesim349.animal':'Animal Mastery (Wild Guanza: +2 CS)',
  'battlesim349.psiSurge':'Psi-surge (+6 CS / costs 2 EP)',
  'battlesim349.continue':'Continue the same fight',
  'battlesim349.log.continue_fight':'Continue this fight in section {section}, retaining both remaining ENDURANCE scores.',
  'battlesim349.note':"Enter current base stats and a separate equipment adjustment. Kirusami adds its own +1 CS, so do not include it twice. Enhanced Kirusami requires Use Anseng's Kirusami. Psychic attacks never combine; use the power specified by the encounter. Apply entry wounds and recovery in the reader. For Karmo, make its side-effect draw and enter the temporary EP before starting; restore normal EP after the fight. Deliverance must be ready and is available only once per 20 days.",
};
