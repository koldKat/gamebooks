// English copy for the optional Plague Lords of Ruel encounter tool.
import magnakai from './battlesim332.js';
export default {
  ...Object.fromEntries(Object.entries(magnakai).map(([key,value])=>[key.replace('battlesim332.','battlesim333.'),value])),
  'battlesim333.title':'The Plague Lords of Ruel',
  'battlesim333.note':'Enter current stats and a separate weapon adjustment, including mastery. Keep entry wounds, arrows and story effects in the reader. Select only a psychic power you possess. Deliverance must be ready and can be used only once per 20 days.',
  'battlesim333.blast':'Mindblast (+4)',
  'battlesim333.surge':'Psi-surge (+6 / costs 1 Ep)',
  'battlesim333.kai':'Kai-surge (+8 / costs 1 Ep)',
  'battlesim333.screen':'Kai-screen',
  'battlesim333.nonEdged':'Using a Mace, Quarterstaff or Warhammer',
  'battlesim333.longWeapon':'Using a Broadsword, Spear or Quarterstaff',
  'battlesim333.sommerwerd':'Using the Sommerswerd',
  'battlesim333.deliverance':'Grand Master Discipline of Deliverance',
  'battlesim333.curingReady':'Deliverance ready (once per 20 days)',
  'battlesim333.heal':'Use Deliverance',
  'battlesim333.log.combat_healed':'Deliverance restored {restored} Ep. Mark its use in the reader; unavailable for 20 days.',
};
