import common from './battlesim674.js';
const labels = Object.fromEntries(Object.entries(common).filter(([key])=>!key.startsWith('battlesim674.enemy.'))
  .map(([key,value])=>[key.replace('battlesim674.',''),value]));
Object.assign(labels,{
  title:'Боен симулатор - The Court of Hidden Faces',
  created:'Създаден герой: ранг 5, ИЗДРЪЖЛИВОСТ 23, ризница и 65 монети.',
  note:'Раните се запазват между битките. Въведете действителните умения с екипировката. Прилагайте сами наградите, проклятията и загубите на кораба. Специалните бойни проверки и временните загуби се изчисляват тук.',
  specialCheck:'{ability}: {total} срещу трудност {difficulty}.',
  abilityDrain:'Загуба на {amount} {ability}.',
  defenceThroughFaith:'Защита чрез вяра в следващата битка (+3 защита)',
  defenceBlessingUsed:'Защита чрез вяра е използвана: +3 защита за тази битка.',
  winChoices:'След победа изберете епизод {sections} в четеца.',
  'effect.choking':'Преди всеки рунд: СВЯТОСТ 17. Неуспехът отнема недостигащия резултат от ИЗДРЪЖЛИВОСТ.',
  'effect.champion':'МАГИЯ 13 преди боя; неуспехът намалява БОЙ наполовина, закръглено нагоре, само за тази битка.',
  'effect.vampires':'Всяка рана отнема и 1 БОЙ. БОЙ се възстановява след битката. Смъртта от вампири изключва възкресение.',
  'effect.strangling':'Преди боя повтаряйте проверки БОЙ 12. Всеки неуспех отнема 3 ИЗДРЪЖЛИВОСТ до освобождаване или смърт.',
  'effect.tripling':'Три вражески атаки на ваша атака. Противникът бяга при 3 ИЗДРЪЖЛИВОСТ.',
  'effect.abilityDrain':'Ударите не отнемат ИЗДРЪЖЛИВОСТ, а 1 случайно умение завинаги. Нулева стойност е фатална.',
  'effect.lightning':'След всеки рунд: МАГИЯ 12. Неуспехът отнема един зар ИЗДРЪЖЛИВОСТ.',
  'effect.spectre':'Всяка рана изисква СВЯТОСТ 11. Неуспехът отнема 1 БОЙ само за тази битка.',
  'effect.underwater':'Бронята не добавя защита. РАЗУЗНАВАНЕ 10 преди боя и 9 след рунда, минус бронята; неуспехът е удавяне.',
  'seaKind.coastal':'Крайбрежна среща','seaKind.passage':'Пътническо плаване','seaKind.rescue':'Спасителен кораб',
  'seaKind.harbour':'Влизане в пристанището на Аку','seaKind.shipwreck':'Оцеляване след корабокрушение',
  'seaKind.drift':'Определяне на местоположението','seaKind.boarding':'Отблъскване на пирати',
});
const enemies={Hangman:'Палач',Priest:'Жрец',Warrior:'Воин','Bylewyn Buskle':'Байлуин Бъскъл',Bandit:'Бандит',
  Troll:'Трол','The Champion':'Шампионът','Three Vampires':'Трима вампири','Winged Predator':'Крилат хищник',
  Wight:'Мъртвец','Toad-demon':'Демон жаба',Tripling:'Тройният','The Hangman':'Палачът',
  'Giant Chameleon':'Гигантски хамелеон','Storm Demon':'Демон на бурята','Grindel the Ripper':'Гриндел Изкормвача',
  'Black Wolves':'Черни вълци','Water Drake':'Воден дракон',"Irmak's Spectre":'Призракът на Ирмак',
  'Snow Wolves':'Снежни вълци','Unseen enemy':'Невидим враг'};
for(const [name,value] of Object.entries(enemies))labels['enemy.'+name]=value;
export default Object.fromEntries(Object.entries(labels).map(([key,value])=>['battlesim678.'+key,value]));
