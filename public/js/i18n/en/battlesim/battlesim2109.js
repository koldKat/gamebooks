import labels from './d20.js';

export default Object.fromEntries(Object.entries({
  ...labels,
  title: "The Death Knight's Squire",
  rules: 'Choose an encounter or enter your own opponents. Use the reader and printed maps for movement, and play the part of both sides in combat.',
  secondPlayer: 'Second player character',
  encounterAttackPenalty: 'Fear aura attack penalty',
  encounterAttackPenaltySave: 'Fear aura save',
  'event.encounterAttackPenaltySave': 'Fear aura save',
  deathSaveTarget: 'Downed character',
  deathSave: 'Death saving throw',
  stable: 'Stable',
  'event.deathSave': 'Death saving throw',
}).map(([key, value]) => ['battlesim2109.' + key, value]));
