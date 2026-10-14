// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 82,
  "title": "Варварският бог",
  "family": "standalone",
  "stateKey": "sim82",
  "i18nPrefix": "battlesim82"
});

export const LEVEL_BONUS = { 1: 5, 2: 3, 3: 1, 4: 0 };

export const SKILL_TIER = {
  unarmed: { 1: 1, 2: 0, 3: 0, 4: 0 },
  melee:   { 1: 2, 2: 1, 3: 0, 4: 0 },
};

export const LEVEL_LABEL_KEY = { 1: 'battlesim82.ui.level1', 2: 'battlesim82.ui.level2', 3: 'battlesim82.ui.level3', 4: 'battlesim82.ui.level4' };
