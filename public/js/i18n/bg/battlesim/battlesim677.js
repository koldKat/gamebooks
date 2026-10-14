import common from './battlesim674.js';
const labels = Object.fromEntries(Object.entries(common).filter(([key]) => !key.startsWith('battlesim674.enemy.'))
  .map(([key, value]) => [key.replace('battlesim674.', ''), value]));
Object.assign(labels, {
  title: 'Боен симулатор - The Plains of Howling Darkness',
  created: 'Създаден герой: ранг 4, ИЗДРЪЖЛИВОСТ 20, ризница и 65 монети.',
  note: 'Раните се запазват между битките. Въведете действителните умения с бонусите от екипировката. Прилагайте сами наградите, отровите, болестите и загубите на кораба. Заклинанията на арената се избират в четеца.',
  'effect.immortal': 'Кашуф е още безсмъртен. След победата следвайте епизод 304; бягството там отнема един зар ИЗДРЪЖЛИВОСТ.',
  'effect.wolfpack': 'След победата вземете вълча кожа и изберете път в епизод 147.',
  'effect.daggers': 'Първата рана прекратява битката. Ако сте живи, продължете на епизод 184.',
  'effect.snake': 'Ако сте ранени, намалете ОБАЯНИЕ и БОЙ с 1 до излекуване на отровата.',
  'effect.blight': 'Ако сте ранени, болестта на Нагил намалява ОБАЯНИЕ и БОЙ с 1 до излекуване.',
  'seaKind.shipwreck': 'Оцеляване след корабокрушение',
});
const enemies = {
  'Faery Hound': 'Приказно куче', Vampire: 'Вампир', Manbeast: 'Човекозвяр', Kaschuf: 'Кашуф',
  Nomad: 'Номад', Wolfpack: 'Глутница вълци', 'Avar Hordeth': 'Авар Хордет', Redcaps: 'Червени шапки',
  'Grey Worm': 'Сив червей', 'Luroc Bans': 'Лурок Банс', 'Three Cutthroats': 'Трима убийци',
  'Sea Spider': 'Морски паяк', 'Three Thugs': 'Трима бандити', 'She-devil': 'Дяволица',
  'Hooded Men': 'Мъже с качулки', 'Young Rukh': 'Млад рух', 'Sir Leo': 'Сър Лео',
  'Snake Demon': 'Змийски демон', 'Storm Demon': 'Демон на бурята', Kelpie: 'Келпи',
  Wrecker: 'Брегови разбойник', 'Blue Cap': 'Синята шапка', Mugger: 'Грабител',
  'Rabid Wolf': 'Бесен вълк', 'Undead Warriors': 'Немъртви воини',
};
for (const [name, value] of Object.entries(enemies)) labels['enemy.' + name] = value;
export default Object.fromEntries(Object.entries(labels).map(([key, value]) => ['battlesim677.' + key, value]));
