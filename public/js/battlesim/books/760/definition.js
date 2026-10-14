// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 760,
  "title": "Бойците на Европа",
  "family": "standalone",
  "stateKey": "sim760",
  "i18nPrefix": "battlesim760"
});

export const ROSTER = [
  { id: 'chameleon', name: 'Хамелеона',               attack: 3, defense: 3, interactive: 3, life: 20 },
  { id: 'stacy',      name: 'Стейси Бул/Червената чума', attack: 3, defense: 2, interactive: 4, life: 20 },
  { id: 'horatio',    name: 'Хорацио Б. Андреас',      attack: 3, defense: 4, interactive: 2, life: 20 },
  { id: 'godfather',  name: 'Кръстника',               attack: 5, defense: 2, interactive: 2, life: 20 },
  { id: 'cherry',     name: 'Чери Уилсън/БА 764',      attack: 3, defense: 1, interactive: 5, life: 20 },
  { id: '666',        name: '666',                     attack: 6, defense: 6, interactive: 6, life: 40 },
];
