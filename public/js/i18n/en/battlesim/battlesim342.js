// English copy for the optional Buccaneers of Shadaki encounter tool.
import newOrder from './battlesim341.js';
export default {
  ...Object.fromEntries(Object.entries(newOrder).map(([key,value])=>[key.replace('battlesim341.','battlesim342.'),value])),
  'battlesim342.title':'The Buccaneers of Shadaki',
  'battlesim342.note':'Enter current stats and a separate weapon adjustment, including mastery. Use the higher Kai Weapon bonus when the preset allows it. Sections 105 and 176 permit only normal weapons; exclude Kai Weapon bonuses there. Psychic attacks never combine. Apply entry wounds, inventory, noncombat Curing and story effects in the reader. Deliverance must be ready and can be used only once per 20 days.',
  'battlesim342.nexus':'Grand Nexus (underwater oxygen penalty)',
  'battlesim342.kholoFootnote':'Use source footnote: double Mindblast against Kholo',
};
