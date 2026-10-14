import common from './battlesim674.js';

const labels = Object.fromEntries(Object.entries(common)
  .filter(([key]) => !key.startsWith('battlesim674.enemy.'))
  .map(([key, value]) => [key.replace('battlesim674.', ''), value]));
Object.assign(labels, {
  title: 'Боен симулатор - Градове на злато и слава',
  created: 'Героят е създаден: ранг 2, ИЗДРЪЖЛИВОСТ 13, кожена броня и 16 шарда.',
  note: 'Раните се запазват между битките. Въведете способностите с бонусите от екипировката. Прилагайте сюжетните награди и промени сами. За изпитанията на Нагил (270/362) използвайте един зар за ранг с модификатор +1.',
  canFlee: 'Бягството следва щетите и епизода, посочени за тази битка.',
  'effect.hydra': 'След победа епизод 361 изпраща ранения герой на 377, а невредимия на 17. Срещу отровата е нужна благословия за имунитет.',
  'effect.spider': 'Ако сте ранен, загубете още 1d6 ИЗДРЪЖЛИВОСТ в епизод 277, освен ако ви защитава благословията на Мака.',
  'effect.paladin': 'При бягство премахнете титлата Паладин на Равейн. При победа я запазете.',
  'effect.unarmed': 'Бронята не ви защитава. Премахнете бонуса от оръжието чрез допълнителния модификатор на атаката.',
});
const enemies = {
  Wereboar: 'Глиганочовек', '1st Assassin': 'Първи убиец', '2nd Assassin': 'Втори убиец',
  Hydra: 'Хидра', 'Faery Wolf': 'Вълшебен вълк', 'Giant Spider': 'Гигантски паяк',
  'Silent Knight': 'Мълчалив рицар', 'Sir Fontesque': 'Сър Фонтеск', 'Evil Knight': 'Зъл рицар',
  Assassin: 'Убиец', Vampire: 'Вампир', Warthog: 'Глиган', Dragon: 'Дракон',
  'Angry Knight': 'Разгневен рицар', Samurai: 'Самурай', 'Elf Lady': 'Елфическа дама',
  'First Brigand': 'Първи разбойник', 'Second Brigand': 'Втори разбойник', 'Third Brigand': 'Трети разбойник',
  'Fourth Brigand': 'Четвърти разбойник', 'Fifth Brigand': 'Пети разбойник', Ogre: 'Човекоядец',
  Brigand: 'Разбойник', 'Jeweled Serpent': 'Змия със скъпоценен камък', 'Barrow Wight': 'Могилен дух',
  Troll: 'Трол', 'Enraged Bull': 'Разярен бик', Ekushka: 'Екушка',
  '1st Highwayman': 'Първи пътен разбойник', '2nd Highwayman': 'Втори пътен разбойник',
  '3rd Highwayman': 'Трети пътен разбойник',
};
for (const [name, value] of Object.entries(enemies)) labels['enemy.' + name] = value;
export default Object.fromEntries(Object.entries(labels).map(([key, value]) => ['battlesim675.' + key, value]));
