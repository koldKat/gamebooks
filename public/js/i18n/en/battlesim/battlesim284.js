// English text for War of the Wizards' optional combat tool.
import greyStar from './battlesim281.js';

export default {
  ...Object.fromEntries(Object.entries(greyStar).map(([key, value]) => [key.replace('battlesim281.', 'battlesim284.'), value])),
  'battlesim284.ui.title': 'Battle simulator: War of the Wizards',
  'battlesim284.status.not_ready': 'Generate fresh scores or enter your current Combat Skill, Willpower, and Endurance.',
  'battlesim284.btn.roll': 'Generate fresh scores',
  'battlesim284.ui.invulnerable': 'Invulnerability already active',
  'battlesim284.ui.has_potion': 'Have a Laumspur dose',
  'battlesim284.ui.potion': 'Laumspur (+6 Endurance before or after combat)',
  'battlesim284.ui.effects_note': 'Printed bonuses, passing attacks, evasion conditions, and round limits are automatic. Invulnerability applies only in sections 161, 184, and 233, if already active. Change Staff spending each round. Handle earlier spell costs and injuries in the reader.',
  'battlesim284.ui.mental_note': 'Fresh scores start at 50 Willpower and 30 Endurance; Combat Skill is 10 plus a random 0–9. Returning wizards add retained Willpower and Endurance manually. Apply item and potion bonuses through the combat modifier. Tarama Seeds do not replace combat Willpower.',
};
