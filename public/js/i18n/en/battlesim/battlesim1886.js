import havena from './battlesim1885.js';

const common = Object.fromEntries(Object.entries(havena).map(([key, value]) => [key.split('.')[1], value]));
const strings = {
  ...common,
  title: 'Conspiracy of Mages',
  weapon: 'Weapon or attack',
  staff: 'Mage’s staff',
  brawling: 'Brawling',
  catClaws: 'Cat claws',
  catBite: 'Cat bite',
  ratBite: 'Rat bite',
  wolfPaw: 'Transformed with Wolf Paw',
  damageDice: 'Damage dice',
  damageSides: 'Sides per damage die',
  threshold: 'Life point threshold reached',
  survived: 'Six rounds survived',
  catForm: 'Set your current life points for Salander or select Wolf Paw to start with 5. The cat can claw or bite.',
  ratForm: 'Set your current life points for Salander or select Wolf Paw to start with 5. The rat fights with its bite.',
  moonhair: 'Apply any Protection from Armatrutz already cast. The fight ends after you survive six rounds or Moonhair falls to 10 life points.',
};

export default Object.fromEntries(Object.entries(strings).map(([key, value]) => [`battlesim1886.${key}`, value]));
