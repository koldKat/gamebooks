import valley from './battlesim689.js';

const labels = {
  title:'Боен симулатор - Crown & Tower',
  fleetManual:'Битката на флоти в епизод 555 се играе ръчно. Използвайте дневника на флота и правилата в Pirates of the Splintered Isles, епизод 400. Морските срещи тук са битки с един кораб.',
  note:'Въведете текущите стойности от дневника. Изберете срещата, участниците и условията от историята преди началото. Временните бойни ограничения не премахват запазената екипировка.',
  ogreVisits:'Предишни посещения при огрите',vesselType:'Пиратски кораб',cog:'Ког',carrack:'Карака',
  trappedHero:'Заловен герой (при равенство за най-ниско Оцеляване)',entryDamageHero:'Герой, ранен при влизането',
  rooftopAssassin:'Убиецът на покрива (няма при обикновен подход)',controlledMember:'Герой под контрола на Наракат',
  pitVictim:'Герой, паднал в ямата',freeHero:'Свободен герой (при равенство за най-висок зар)',frozenHero:'Замразен герой (не участва)',
  abbessSlain:'Игуменката вече е убита',goddessCaress:'Докоснати от богинята',titanEyesHit:'Титанът е ранен в очите',
  wizardWounded:'Керакнорн вече е ранен',skipFirstEnemyTurn:'Успешна начална изненада',
  spareBryce:'Зашемети сър Брайс, вместо да го убиваш',entryDamageAlreadyApplied:'Началните рани вече са записани',
  boyFreed:'Таша освободи момчето',chooseOutcome:'Изберете резултата от проверката',guardApproach:'Подход към имението',
  assassinationSuccesses:'Успехи при убийството от засада',defeatedEnemies:'Вече победени противници при този подход',
  'approach.ordinary':'Обикновена битка','approach.walls':'Катерене по стените','approach.basement':'Отворена врата на мазето',
  'approach.assassination':'Опит за убийство от засада',walkway:'Дървена пътека',pool:'Воден басейн',rollGrapple:'Хвърли началните зарове за захвата',
  unitType:'Вид войска',unitGarrison:'Гарнизон',unitChargeBonus:'Бонус за устрем в първия рунд',
  editUnitType:'Вид войска',editUnitGarrison:'Гарнизон',editUnitChargeBonus:'Бонус за устрем в първия рунд',
  'troop.infantry':'Пехота','troop.cavalry':'Конница','troop.missile':'Стрелци','troop.longbow':'Стрелци с дълги лъкове',
  'garrison.beverstone':'Бевърстоун','garrison.fosterly':'Замъкът Фостърли','garrison.brightsands':'Брайтсандс',
  'garrison.highpoint':'Замъкът Хайпойнт',shipCargo:'Единици товар',apprenticeBook:'Учи от книгата на чирака: започва изчерпано',
  releaseMember:'Герой за освобождаване',releaseMemberAction:'Освободи героя',stunnedMembers:'Герои с най-високи Бойни умения',
  chooseStunned:'Потвърди зашеметените герои',vulnerableMember:'Герой с най-висока Броня',chooseVulnerable:'Потвърди уязвимия герой',
  companionAttack:'Съюзникът атакува избрания противник',takeFallenWeapon:'Вземи Меча на вековете',movingMember:'Герой',
  moveDestination:'Премести в',moveHero:'Премести героя',leaveHorror:'Остави чудовището живо',alliedArmySpell:'Уолтър омагьосва избраната част',
  surrenderCargo:'Предай товара',armourAllocationNote:'Разпределете защитните зарове преди хвърляне. Само успешната защита с носена броня или щит поврежда тази екипировка.',
  armourDie:'Защитен зар {number}','armourPart.body':'Носена броня','armourPart.shield':'Щит','armourPart.magic':'Пръстени / амулети',
  'armourPart.spell':'Магическа защитна броня',releasePrompt:'Изберете захванат герой за освобождаване.',
  stunPrompt:'Изберете {count} герои с най-високи Бойни умения; вие решавате при равенство.',
  vulnerabilityPrompt:'Изберете герой с най-висока Броня; вие решавате при равенство.',
  alliedSpellPrompt:'Изберете вражеска зона и предна/поддържаща част за {spell}.',
  sameRecipient:'Недостатъчно герои: разреши повторен получател, когато историята изисква различни герои',
  'army.145':'Хълмът Тиърдроп','army.196':'Уличната битка в Лонгпорт','army.349':'Щурм на барикадата',
  'army.532':'Армията на Бейли','army.545':'Защита на Брайтсандс','army.705':'Нападение отвъд езерото',
  'army.1114':'Армията на Дейн','status.surrendered':'Товарът е предаден',
  'spell.nightcrawler':'Нощен пълзач','spell.teleportCircle':'Кръг за телепортация','spell.tilt':'Накланяне',
  'spell.wither':'Повяхване','spell.enfeeblement':'Отслабване','spell.teleport':'Телепортация',
  'spell.orbOfAnnihilation':'Кълбо на унищожението','spell.stingtailRune':'Руна на жилото',
  'spell.vulnerability':'Уязвимост','spell.whipsnake':'Камшична змия',
  'event.enemySpell':'{enemy} прави заклинание (резултат {value}).','event.thresholdReaction':'{enemy} реагира на раните си.',
  'event.companionAttack':'Съюзникът нанася {damage} щети.','event.companionInjured':'Съюзникът поема {hits} попадения и вече не може да атакува.',
  'event.heroReleased':'{name} е освободен.','event.heroesStunned':'Избраните герои са зашеметени през следващия ход.',
  'event.vulnerabilityChosen':'{name} трябва да поеме атаката на Валахием.',
  'event.heroMoved':'{name} сменя местоположението си.','event.horrorLeftAlive':'Групата избягва, оставяйки чудовището живо.',
  'event.fallenWeaponTaken':'{name} взема Меча на вековете.','event.silverRobbed':'Групата е ограбена: остават {remaining} сребърни монети.',
  'event.entryDamage':'{name} губи {hits} Живот при влизането.','event.noEligibleRecipient':'Никой герой не може да поеме друга атака през този рунд.',
  'event.playerTurnDeadline':'Времето изтича.','event.undamagedOpponentFailure':'Противник вдига тревога.',
  'event.decayAura':'Аурата на разложение поразява героите, които не са ранени от демона.',
  'event.spellRecharge':'{name} хвърля {die} за презареждане на заклинание.','event.enemyArmySpell':'Врагът прави бойно заклинание.',
  'event.tilt':'Накланяне намалява следващата атака на вражеския кораб с два зара.','event.cargoSurrendered':'Товарът е предаден на пиратите.',
  'event.armourErosion':'{name} губи {eroded} точки физическа Броня.',
};
for (let index=0;index<4;index++) {
  labels['heroArrival-'+index] = 'Пристигане на герой №'+(index+1);
  labels['grappleRoll-'+index] = 'Начален зар за захвата';
  labels['heroZone-'+index] = 'Местоположение';
  for (const part of ['body','shield','magic']) labels['armour-'+index+'-'+part] = labels['armourPart.'+part];
  labels['heroExtra-'+index+'-magicalWeapon'] = 'Магическо оръжие';
  labels['heroExtra-'+index+'-attackDieBonus'] = 'Оръжие: бонус към всеки атакуващ зар';
  labels['heroExtra-'+index+'-spellDamageBonus'] = 'Допълнителни щети от нараняващо заклинание';
}
for (let index=0;index<6;index++) labels['guardArrival-'+index] = 'Пристигане на страж №'+(index+1);
export default {
  ...Object.fromEntries(Object.entries(valley).map(([key,value]) => [key.replace('battlesim689.','battlesim690.'),value])),
  ...Object.fromEntries(Object.entries(labels).map(([key,value]) => ['battlesim690.'+key,value])),
};
