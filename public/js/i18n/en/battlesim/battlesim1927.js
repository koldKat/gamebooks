const strings = {
  title: 'The Vortex Crystal',
  rules: 'Use your current attributes and choose an encounter. Resolve its Saving Rolls, your opponent’s dice, and your own attack. Follow the printed result yourself.',
  encounter: 'Encounter', custom: 'Custom encounter',
  strength: 'Strength', endurance: 'Endurance', dexterity: 'Dexterity', charisma: 'Charisma', mentality: 'Mentality', brawling: 'Brawling',
  opponent: 'Opponent', opponentDice: 'Opponent dice', opponentModifier: 'Opponent modifier', oneDie: 'One die', twoDice: 'Two dice',
  bonusLabel: 'Encounter bonus', 'bonus.bluff': 'Successful bluff', 'bonus.surprise': 'Surprise from section 270', 'bonus.clueZ': 'Remembered the earlier Kronovore encounter',
  manual: 'Enter dice manually', first: 'First die', second: 'Second die', roll: 'Roll dice',
  ready: 'Ready to roll', fighting: 'Encounter in progress', win: 'Won', loss: 'Lost', tie: 'Unresolved tie',
  tieNote: 'This encounter gives separate results for higher and lower totals. It leaves equal totals to your judgment.',
  destination: 'Continue in the book at {destination}.', history: 'Encounter history',
  'phase.save': 'Make Saving Roll', 'phase.opponent': 'Roll opponent dice', 'phase.attack': 'Roll attack',
  'phase.pickup': 'Roll to pick up the spanner', 'phase.failure': 'Roll Dexterity after the loss',
  'log.save': '{stat} Saving Roll: {dice} = {total} against {limit}. Attack modifier{modifier}.',
  'log.opponent': 'Opponent roll: {dice}{modifier}. Your target is {limit}.',
  'log.attack': 'Attack: {dice}{modifier} = {result} against {limit}.',
  'log.pickup': '{stat} to pick up the spanner: {dice} = {total} against {limit}.',
  'log.failure': '{stat} after the loss: {dice} = {total} against {limit}.',
  cancel: 'Cancel fight', cancelConfirm: 'Cancel the current fight?',
  invalid: 'Enter current attributes and either all dice for this step or none.',
};

export default Object.fromEntries(Object.entries(strings).map(([key, value]) => [`battlesim1927.${key}`, value]));
