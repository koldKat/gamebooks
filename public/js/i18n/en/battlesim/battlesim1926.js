const strings = {
  title: 'The Rebel’s Gamble',
  rules: 'Choose a printed encounter or set up your own. Use your current attributes. The simulator shows the result and leaves the next move to you.',
  encounter: 'Encounter', custom: 'Custom encounter',
  strength: 'Strength', dexterity: 'Dexterity', opponent: 'Opponent',
  modifier: 'Opponent modifier', threshold: 'Win at or below',
  manualDice: 'Enter dice manually', first: 'First die', second: 'Second die', roll: 'Roll dice',
  ready: 'Ready to roll', fighting: 'The struggle continues', win: 'Won', loss: 'Lost',
  destination: 'Continue in the book at section {section}.',
  rollLine: 'Round {round}: {dice} + {modifier} − {reduction} = {total}',
  history: 'Encounter history', cancel: 'Cancel fight', cancelConfirm: 'Cancel the current fight?',
  invalid: 'Check the attributes and enter either both dice or neither.',
};

export default Object.fromEntries(Object.entries(strings).map(([key, value]) => [`battlesim1926.${key}`, value]));
