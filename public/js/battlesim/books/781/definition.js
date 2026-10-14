// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 781,
  "title": "Мутирала плът",
  "family": "mutated-flesh",
  "stateKey": "sim781",
  "i18nPrefix": "battlesim781"
});

export const WEAPONS = [
  { id: 'crowbar',  name: 'Кози крак',      bonus: 2,  stat: 'physique', ammoMax: null },
  { id: 'axe',      name: 'Брадва',         bonus: 4,  stat: 'physique', ammoMax: null },
  { id: 'chainsaw', name: 'Моторна резачка', bonus: 16, stat: 'physique', ammoMax: null },
  { id: 'pistol',   name: 'Пистолет',       bonus: 4,  stat: 'shooting', ammoMax: 2 },
  { id: 'shotgun',  name: 'Пушка помпа',    bonus: 14, stat: 'shooting', ammoMax: 5 },
];

export const ROSTER = [
  { id: 'doberman', name: 'Мутирал доберман',        dmg: 8,  life: 16 },
  { id: 'stoev',     name: 'Д-р Стоев',               dmg: 6,  life: 22 },
  { id: 'stoev-punched', name: 'Д-р Стоев (след юмручен удар)', dmg: 6, life: 19 },
  { id: 'lenova',    name: 'Д-р Ленова',              dmg: 19, life: 38 },
  { id: 'nurse',     name: 'Медицинска сестра-мутант', dmg: 8,  life: 16 },
  { id: 'vendor',    name: 'Продавач-мутант',          dmg: 10, life: 22 },
];
