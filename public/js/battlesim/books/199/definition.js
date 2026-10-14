// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 199,
  "title": "The Citadel of Chaos",
  "family": "fighting-fantasy",
  "stateKey": "sim199",
  "i18nPrefix": "battlesim199"
});

export const SPELLS = [
  ['skillSpell',    'battlesim199.spell.skillSpell',    'restore'],
  ['staminaSpell',  'battlesim199.spell.staminaSpell',  'restore'],
  ['luckSpell',     'battlesim199.spell.luckSpell',     'restore'],
  ['creatureCopy',  'battlesim199.spell.creatureCopy',  'manual'],
  ['esp',           'battlesim199.spell.esp',           'manual'],
  ['fire',          'battlesim199.spell.fire',          'manual'],
  ['foolsGold',     'battlesim199.spell.foolsGold',     'manual'],
  ['illusion',      'battlesim199.spell.illusion',      'manual'],
  ['levitation',    'battlesim199.spell.levitation',    'manual'],
  ['shielding',     'battlesim199.spell.shielding',     'manual'],
  ['strength',      'battlesim199.spell.strength',      'manual'],
  ['weakness',      'battlesim199.spell.weakness',      'manual'],
];

export const MAGIK_DOSES = 2;
