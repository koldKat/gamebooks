// English copy for the optional Prisoners of Time encounter tool.
import magnakai from './battlesim330.js';

export default {
  ...Object.fromEntries(Object.entries(magnakai).map(([key,value])=>[key.replace('battlesim330.','battlesim331.'),value])),
  'battlesim331.title':'The Prisoners of Time',
  'battlesim331.note':'Enter current stats, including persistent nonweapon bonuses, and a separate weapon modifier. For mind combat, exclude armor ENDURANCE and all ineligible skill bonuses; include the Silver Helm in your base skill. Rings and extra disciplines are added separately. Apply entry injuries in the reader.',
  'battlesim331.scion':'Weaponmastery at Scion-kai rank',
  'battlesim331.curingMentora':'Curing at Mentora rank or higher',
  'battlesim331.awkwardWeapon':'Broadsword, Quarterstaff or Spear (Agtah-hound)',
  'battlesim331.psychicRing':'Psychic Ring (mind combat)',
  'battlesim331.greyRing':'Grey Crystal Ring (mind combat)',
  'battlesim331.extraDisciplines':'Magnakai disciplines beyond the first three (mind combat)',
  'battlesim331.visitedTomb':"Already visited Baylon's Tomb",
};
