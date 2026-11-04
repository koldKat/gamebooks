// Reuse shared Horror Classic labels with this book’s character and source-rule wording.
import shared from './battlesim1575.js';
const labels=Object.fromEntries(Object.entries(shared).map(([key,value])=>[key.replace('battlesim1575.','battlesim1576.'),value]));
export default {...labels,
  'battlesim1576.title': 'The Curse of Frankenstein Battle Simulator',
  'battlesim1576.note': 'Enter current Life Points and combat stats before temporary encounter modifiers. Resolve combat explicitly; story choices, equipment and follower durations remain in the reader.',
  'battlesim1576.itemNote': 'Use only healing doses you possess. Record three consumed doses and any healing in the reader.',
  'battlesim1576.rulingPlayerPsi': 'Your resulting PSI',
  'battlesim1576.status.manual': 'Resolve the pending source result',
  'battlesim1576.manualDiceNote': 'Leave blank to roll automatically. PSI checks, initiative and resurrection counts use one die; strikes and flight use two. The lucky-coin choice affects your own rolls.',
};
