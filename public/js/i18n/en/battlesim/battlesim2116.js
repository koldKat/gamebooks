const labels = {
  title: 'Full Moon', note: 'No dice: your qualities and equipment decide each encounter.',
  setup: 'Enter the ratings from the book’s setup tests and chosen stat allocation. Keep equipment and score in step with the story; start unarmed. Score starts at 100, then 90 on a second attempt, 80 on a third, and so on.',
  character: 'Character & equipment', intuition: 'Intuition', reflex: 'Reflexes', speed: 'Speed', strength: 'Strength',
  punch: 'Punch', kick: 'Kick', knife: 'Knife', stick: 'Stick attack', evilKnowledge: 'Knowledge of evil',
  pipe: 'Metal pipe', spray: 'Gas spray', stake: 'Wooden stake', holyWater: 'Holy water', score: 'Score',
  apply: 'Save character', encounter: 'Encounter', method: 'Approach', resolve: 'Resolve', again: 'Next encounter',
  ready: 'Save your character, then choose an encounter and approach.', history: 'Combat history',
  invalid: 'Check your ratings and equipment. Only weapons you actually own can be used.',
  check: '{total} > {threshold}', destination: 'Read section {section}.', continue: 'Then continue to {section}.',
  retry: 'After the defeat, resume at {section}.', scoreChange: 'Score change: {amount}', consumed: 'Remove from equipment: {item}.',
  'enemy.skinhead': 'Skinhead', 'enemy.goblins': 'Goblins', 'enemy.collie': 'Evil collie',
  'outcome.win': 'Victory', 'outcome.loss': 'Defeat', 'outcome.escape': 'Escaped - the enemy survives',
  'method.26': 'Metal pipe', 'method.27': 'Knife', 'method.28': 'Kick', 'method.29': 'Punch', 'method.30': 'Gas spray',
  'method.114': 'Metal pipe', 'method.113': 'Knife', 'method.118': 'Kick', 'method.117': 'Gas spray', 'method.119': 'Holy water',
  'method.135': 'Metal pipe, then escape', 'method.140': 'Wooden stake', 'method.143': 'Knife', 'method.144': 'Gas spray',
  'method.145': 'Kick', 'method.146': 'Holy water',
};
export default Object.fromEntries(Object.entries(labels).map(([key, value]) => ['battlesim2116.' + key, value]));
