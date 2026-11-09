// English text for Beyond the Nightmare Gate's optional combat tool.
import greyStar from './battlesim281.js';

export default {
  ...Object.fromEntries(Object.entries(greyStar).map(([key, value]) => [key.replace('battlesim281.', 'battlesim283.'), value])),
  'battlesim283.ui.title': 'Battle simulator: Beyond the Nightmare Gate',
  'battlesim283.ui.dagger': 'Jewelled Dagger for the Elessi leader (−6 instead of −8)',
  'battlesim283.ui.companion': 'Tanith has a weapon (§188, +2 Combat Skill)',
  'battlesim283.ui.effects_note': 'Printed round limits, the door’s immunity, and the Elessi leader’s weapon penalties are automatic. Stop fighting appears only when the book permits it. Staff spending can change each round. Apply earlier spell costs and injuries in the reader.',
  'battlesim283.ui.mental_note': 'Fresh Willpower is a random 0–9 plus 20. Use a starting bonus of 25 after one earlier adventure, or 30 after both. §243 can continue after a combat loss; the reader resolves that story outcome.',
  'battlesim283.btn.cease': 'Stop fighting',
};
