// English copy for the optional Darke Crusade encounter tool.
import grandmaster from './battlesim333.js';
export default {
  ...Object.fromEntries(Object.entries(grandmaster).map(([key,value])=>[key.replace('battlesim333.','battlesim335.'),value])),
  'battlesim335.title':'The Darke Crusade',
  'battlesim335.note':'Enter current stats and a separate weapon adjustment, including mastery. Keep entry wounds, arrows and story effects in the reader. Strength requires Sun Knight rank and Kai-alchemy: enter unboosted stats when using it. Deliverance must be ready and can be used only once per 20 days.',
  'battlesim335.animal':'Animal Mastery',
  'battlesim335.pathsmanship':'Grand Pathsmanship',
  'battlesim335.strength':'Cast Strength (Sun Knight with Kai-alchemy)',
  'battlesim335.log.temporary_boost_started':'Strength adds {skill} CS and {endurance} EP for this fight.',
  'battlesim335.log.temporary_boost_ended':'Strength ended. The temporary EP bonus is removed; a surviving player retains at least 1 EP.',
};
