// Book identity and declarative defaults; no DOM or saved-state access.
import { loadRosterDataset } from '../../roster-data.js';
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

export const ROSTER = [];
export const FLESH_RULES = {};
// Preserve saved encounter IDs during the legacy API transition. All numeric
// enemy stats and encounter settings come from the database.
const legacyIds = new Map([
  ['Мутирал доберман', 'doberman'], ['Д-р Стоев', 'stoev'], ['Д-р Стоев (след юмручен удар)', 'stoev-punched'],
  ['Д-р Ленова', 'lenova'], ['Медицинска сестра-мутант', 'nurse'], ['Продавач-мутант', 'vendor'],
]);
let loading;
export function loadRoster(fetcher) {
  if (ROSTER.length) return Promise.resolve();
  if (!loading) loading = loadRosterDataset(781, 'ROSTER', fetcher, row => {
    const id = legacyIds.get(row.name);
    if (!id) return null;
    if (!Number.isFinite(row.attack) || row.attack < 0 || !Number.isFinite(row.hp) || row.hp < 1) throw new TypeError('Invalid enemy stats');
    return { id, name: row.name, dmg: row.attack, life: row.hp };
  }).then(rows => {
    const order = [...legacyIds.values()];
    if (order.some(id => !rows.some(row => row.id === id))) throw new Error('Incomplete book roster');
    const rules = rows.find(row => row.support)?.support.rules;
    if (!rules) throw new Error('Incomplete Mutated Flesh settings');
    const profiles = rows.map(({support,...profile}) => profile);
    profiles.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
    Object.assign(FLESH_RULES, rules);
    ROSTER.splice(0, ROSTER.length, ...profiles);
  }).finally(() => { loading = null; });
  return loading;
}
