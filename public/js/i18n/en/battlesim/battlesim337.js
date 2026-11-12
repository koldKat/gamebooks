// English copy for the optional Deathlord of Ixia encounter tool.
import grandmaster from './battlesim336.js';
export default {
  ...Object.fromEntries(Object.entries(grandmaster).map(([key,value])=>[key.replace('battlesim336.','battlesim337.'),value])),
  'battlesim337.title':'The Deathlord of Ixia',
  'battlesim337.note':'Enter current stats and a weapon adjustment, including mastery and the Sommerswerd\'s +8 Cs when used. Weapon damage doubles against undead with either the Sommerswerd or a Dessi Stone weapon; these effects do not stack. Keep entry wounds, earlier psychic damage, spells and story effects in the reader. Sun Lord powers require their disciplines. Deliverance must be ready and can be used only once per 20 days.',
  'battlesim337.sunLord':'Sun Lord rank or higher',
  'battlesim337.dessiStone':'Using a weapon with a Dessi Stone',
  'battlesim337.enemyUndead':'Custom opponent is undead',
};
