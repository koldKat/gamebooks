import common from './battlesim674.js';

const labels = Object.fromEntries(Object.entries(common)
  .filter(([key]) => !key.startsWith('battlesim674.enemy.'))
  .map(([key, value]) => [key.replace('battlesim674.', ''), value]));
Object.assign(labels, {
  title: 'Боен симулатор - Отвъд кървавото море',
  created: 'Героят е създаден: ранг 3, ИЗДРЪЖЛИВОСТ 16, плетена ризница и 40 шарда.',
  note: 'Раните се запазват между битките. Въведете способностите с бонусите от екипировката. Прилагайте сюжетните награди и загуби на кораби сами. Отбележете проклятието на Трите съдби, докато то ограничава проверките до един зар.',
  abilityCurse: 'Проклятие на Трите съдби: един зар за проверки', hasCargo: 'Корабът превозва товар',
  canFlee: 'Бягството следва щетите и епизода, посочени за тази битка.',
  'effect.calcium': 'Премахнете началните щети, ако имате кодовата дума Calcium; иначе загубете 3 ИЗДРЪЖЛИВОСТ преди битката.',
  'effect.unarmed': 'Морякът атакува първи. Бронята не ви защитава; премахнете бонуса от оръжието чрез допълнителния модификатор на атаката.',
  'seaKind.tavern': 'Нападение в кръчмата', 'seaKind.kraken': 'Кракен', 'seaKind.hydras': 'Нападение на хидри',
  'seaKind.ram': 'Таран срещу робовладелците', 'seaKind.overloaded': 'Претоварена евакуация',
  'seaKind.magicStorm': 'Свръхестествена буря',
  copperOre: 'Носите къс медна руда',
  'seaKind.survival': 'Оцеляване в морето', 'seaKind.lightning': 'Гръмотевична буря', 'seaKind.raiders': 'Нападатели с катамарани',
});
const enemies = {
  Assassin: 'Убиец', 'First Mutineer': 'Първи метежник', 'Second Mutineer': 'Втори метежник',
  'Third Mutineer': 'Трети метежник', Vampire: 'Вампир', Serpent: 'Змия', 'Violet Man': 'Виолетов човек',
  Gorgon: 'Горгона', 'Resentful Sailor': 'Озлобен моряк', Head: 'Глава', 'Flying shark': 'Летяща акула',
  Man: 'Мъж', 'First Fury': 'Първа фурия', 'Second Fury': 'Втора фурия', 'Third Fury': 'Трета фурия',
  Ghost: 'Призрак', 'First Scholar': 'Първи учен', 'Second Scholar': 'Втори учен',
  'Third Scholar': 'Трети учен', 'First Gorgon': 'Първа горгона', 'Second Gorgon': 'Втора горгона',
  'Trau Miner': 'Миньор трау',
};
for (const [name, value] of Object.entries(enemies)) labels['enemy.' + name] = value;
export default Object.fromEntries(Object.entries(labels).map(([key, value]) => ['battlesim676.' + key, value]));
