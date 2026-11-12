// English controls for the optional The Hunger of Sejanoz encounter tool.
import newOrder from './battlesim341.js';
export default {
  ...Object.fromEntries(Object.entries(newOrder).map(([key,value])=>[key.replace('battlesim341.','battlesim348.'),value])),
  'battlesim348.stolenIlluminatus':'Stolen Kai Weapon is Illuminatus (+2 enemy Cs underground)',
  'battlesim348.nexus':'Elementalism or Grand Nexus (Brumalghasts: +3 Cs)',
  'battlesim348.modifier':'Equipment adjustment (weapons, mastery and armor)',
  'battlesim348.title':'The Hunger of Sejanoz',
  'battlesim348.flame':'Sun Lord: ignite a nonmagical metal weapon',
  'battlesim348.kaiBlast':'Sun Lord: Kai-blast (two damage draws / costs 4 Ep)',
  'battlesim348.log.psychic_damage':'Psychic attack inflicts {n} additional Endurance loss.',
  'battlesim348.note':'Enter current base stats and a separate equipment adjustment, including mastery, the applicable Kai Weapon bonus and +2 if wearing Ang\'sei. Do not include a stolen Kai Weapon. Psychic attacks never combine. Apply entry wounds, spells, inventory and story effects in the reader. Deliverance must be ready and can be used only once per 20 days.',
};
