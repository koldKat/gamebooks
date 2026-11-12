// English labels for the shared BODY/SPIRIT combat controls.
const labels = {
  title: 'The Altimer: Combat', player: 'You', opponent: 'Opponent', body: 'Body', spirit: 'Spirit',
  currentBody: 'Current Body', currentSpirit: 'Current Spirit',
  rules: 'Take turns rolling two dice plus the attacker’s Body, less the defender’s Body. Damage reduces Spirit. You strike first.',
  customRules: 'Choose a printed encounter or enter your own opponents and current scores.',
  modifiers: 'Combat modifiers', attackModifier: 'Your attack modifier', enemyModifier: 'Enemy attack modifier',
  damageBonus: 'Extra Spirit damage each round', damageReduction: 'Incoming damage reduction',
  ultraviolet: 'Ultraviolet attachment removes the invisibility penalty',
  specialRules: 'Special combat rules', sucker: 'Sucker drains Body instead of Spirit',
  allowWeakSpot: 'Allow the weak-spot technique (§95)', weakSpot: 'Aim for Body (−2 attack and defense this round)',
  custom: 'Custom encounter', start: 'Start combat', attack: 'Roll attack', suckerTurn: 'Apply sucker',
  cancel: 'Cancel combat', cancelConfirm: 'Cancel this combat?', invalid: 'Check the current scores, modifiers and dice.',
  manualDice: 'Enter your own dice (optional)', die1: 'First die', die2: 'Second die',
  ready: 'Ready for combat', round: 'Round', damage: 'Spirit damage', bodyDamage: 'Body damage',
  log: 'Combat log', history: 'Recent combats',
  manualStory: 'Apply the book’s story consequences yourself. Equipment, codewords and travel stay manual.',
  'turn.player': 'Your turn', 'turn.enemy': 'Opponent’s turn',
  'status.fighting': 'Combat in progress', 'status.win': 'Victory', 'status.loss': 'Defeat', 'status.cancelled': 'Canceled',
};
export default Object.fromEntries(Object.entries(labels).map(([key, value]) => ['battlesim409.' + key, value]));
