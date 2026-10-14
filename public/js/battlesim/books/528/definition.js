// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 528,
  "title": "The Gateway of Doom",
  "family": "grailquest",
  "stateKey": "sim528",
  "i18nPrefix": "battlesim528"
});

export const ID = 'sim528';

export const core = ['life', 'maxLife', 'hit', 'bonus', 'armour', 'permanent', 'experience', 'speed', 'weight', 'gold'];

export const resources = ['bolts', 'fireballs', 'potions', 'smallPotions', 'salves', 'seeds', 'polish', 'lamp',
  'weedkiller', 'antidotes', 'djinnCalls', 'magicArmour', 'pendingWallop'];

export const flags = ['coin', 'emerald', 'shield', 'tinglering', 'carrot', 'gnurlbash', 'aardvark',
  'resurrection', 'poisonProtected', 'poisoned', 'dark'];

export const options = ['polish', 'lamp', 'weedkiller', 'switchMachineFirst', 'dwarvesGone', 'djinnGone'];

export const spells = ['panic', 'pow', 'pill', 'pad', 'pip', 'repeat', 'pops', 'pals', 'light'];

export const wizardSpells = ['strike', 'panic', 'pow', 'pill', 'pad', 'pip', 'repeat', 'firefinger', 'bolt'];

export const healing = ['potions', 'smallPotions', 'salves', 'seeds'];
