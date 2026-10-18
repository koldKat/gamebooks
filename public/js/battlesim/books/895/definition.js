export const definition = Object.freeze({id: 895, title: 'Планината на смъртта', family: 'mountain-of-death', stateKey: 'sim895', i18nPrefix: 'battlesim895'});
export const RULES_REVISION = 1;
export const ABILITIES = ['survival', 'cunning', 'climbing', 'healing', 'magic', 'swimming', 'invisibility', 'hearing', 'vision'];
export const DEFAULT_CHARACTER = Object.freeze({skill: 6, stamina: 30, maxStamina: 30, courage: 3, luck: 4, coins: 20,
  abilities: [], healingUses: 5, magicUses: 6, invisibilityUses: 5, leafUses: 0, ointmentUses: 0, balmUses: 0, arrows: 0, scimitar: false});

const group = (name, skill, stamina, count = 1) => Array.from({length: count}, (_, index) =>
  ({displayName: count > 1 ? `${name} ${index + 1}` : name, skill, stamina}));
const encounter = (section, title, enemies, rules = {}) => ({id: String(section), title, enemies,
  rules: {magicAllowed: false, magicDamage: 10, playerDamageAdjustment: 0, firstWound: false,
    goldenScimitarBonusApplies: true, initialSkillLoss: 0, initialStaminaLoss: 0, initialCourageLoss: 0, ...rules}});

export const ENCOUNTERS = [
  encounter(5, 'Тримата надзиратели', group('Надзирател', 8, 11, 3)),
  encounter(7, 'Убиецът след раняването', group('Наемен убиец', 7, 10), {initialSkillLoss: 1}),
  encounter(8, 'Нощното нападение', group('Наемен убиец', 8, 12), {firstWound: true, initialStaminaLoss: 6}),
  encounter(21, 'Оркът в хана', group('Орк', 7, 8)),
  encounter(22, 'Наемният убиец', group('Наемен убиец', 7, 10)),
  encounter(23, 'Върколакът след удара', group('Върколак', 8, 12), {initialStaminaLoss: 1}),
  encounter(35, 'Драконът с позволена магия', group('Дракон', 10, 20), {magicAllowed: true}),
  encounter(38, 'Драконът без време за магия', group('Дракон', 10, 20)),
  encounter(39, 'Засадата на върколака', group('Върколак', 8, 12), {initialSkillLoss: 1, initialStaminaLoss: 2}),
  encounter(42, 'Върколакът без хитрост', group('Върколак', 8, 12), {initialStaminaLoss: 2}),
  encounter(50, 'Човекоядецът', group('Човекоядец', 7, 16), {magicAllowed: true}),
  encounter(59, 'Двамата надзиратели', group('Надзирател', 8, 11, 2)),
  encounter(61, 'Вампирите', group('Вампир', 8, 18, 2), {magicAllowed: true, playerDamageAdjustment: -1}),
  encounter(63, 'Предупреден за убиеца', group('Наемен убиец', 8, 12), {firstWound: true}),
  encounter(65, 'Постът и тримата надзиратели', [...group('Пост', 8, 12), ...group('Надзирател', 7, 11, 3)]),
  encounter(66, 'Петимата омагьосани елфи', group('Омагьосан елф', 7, 8, 5)),
  encounter(74, 'Убиецът и надзирателите', [...group('Наемен убиец', 7, 10), ...group('Надзирател', 7, 11, 3)], {initialStaminaLoss: 2}),
  encounter(83, 'Деветимата орки', group('Орк', 7, 13, 9), {magicAllowed: true}),
  encounter(88, 'Орелът и въздушният страж', [...group('Орел', 7, 12), ...group('Въздушен страж', 8, 13)]),
  encounter(90, 'Оркът', group('Орк', 7, 10)),
  encounter(93, 'Десетимата орки с 10 издръжливост', group('Орк', 7, 10, 10), {magicAllowed: true}),
  encounter(95, 'Орките след стрелбата', group('Орк', 7, 13, 10), {magicAllowed: true, archery: true}),
  encounter(98, 'Тролът с 14 издръжливост', group('Трол', 8, 14)),
  encounter(106, 'Десетимата орки', group('Орк', 7, 13, 10), {magicAllowed: true}),
  encounter(110, 'Четиримата орки и джуджето', [...group('Орк', 7, 9, 4), ...group('Джудже', 8, 10)]),
  encounter(111, 'Тримата стражи', group('Страж', 8, 13, 3)),
  encounter(119, 'Оркът с 16 издръжливост', group('Орк', 8, 16), {magicAllowed: true}),
  encounter(122, 'Пияният трол', group('Пиян трол', 9, 14), {magicAllowed: true}),
  encounter(127, 'Тролът с 16 издръжливост', group('Трол', 8, 16)),
  encounter(137, 'Десетимата орки след пленяването', group('Орк', 7, 13, 10), {magicAllowed: true}),
  encounter(143, 'Тролът след раняването', group('Трол', 8, 16), {initialStaminaLoss: 2, initialSkillLoss: 1}),
  encounter(145, 'Двамата дворцови стражи', group('Страж', 8, 13, 2)),
  encounter(161, 'Трагор', group('Трагор', 9, 22), {magicAllowed: true, magicDamage: 7}),
  encounter(172, 'Шестимата елфи', group('Елф', 8, 13, 6), {magicAllowed: true}),
  encounter(180, 'Бикоглавият пазач', group('Бикоглав мъж', 9, 16), {magicAllowed: true}),
  encounter(181, 'Микъл срещу меча', group('Микъл', 9, 17), {magicAllowed: true, goldenScimitarBonusApplies: false}),
  encounter(182, 'Раненият Трагор', group('Трагор', 9, 19), {magicAllowed: true, magicDamage: 7}),
  encounter(193, 'Тримата останали елфи', group('Елф', 7, 12, 3)),
  encounter(200, 'Човекоприлепът', group('Човекоприлеп', 9, 17), {magicAllowed: true, skillLossAfterRound: 6}),
  encounter(206, 'Елфите след хвърления нож', group('Елф', 8, 13, 6), {magicAllowed: true, initialSkillLoss: 1}),
  encounter(210, 'Микъл зад силовото поле', group('Микъл', 9, 17), {magicAllowed: true, physicalPlayerDamage: 2, initialCourageLoss: 1, initialSkillLoss: 1, initialStaminaLoss: 6}),
  encounter(212, 'Елфите без изненада', group('Елф', 8, 13, 6), {magicAllowed: true}),
  encounter(214, 'Двата малки дракона', group('Дракон', 9, 18, 2), {magicAllowed: true}),
  encounter(239, 'Двамата върколаци', group('Върколак', 8, 14, 2)),
  encounter(241, 'Укротителите на змии', group('Укротител на змии', 7, 11, 4)),
  encounter(262, 'Трагор след заклинанието през стъклото', group('Трагор', 8, 17), {magicAllowed: true}),
  encounter(264, 'Трагор след заклинанието', group('Трагор', 8, 17), {magicAllowed: true}),
];

export const OPPONENT_PRESETS = ENCOUNTERS.flatMap(entry => entry.enemies.map(enemy => ({...enemy, displayName: `${enemy.displayName} (${entry.id})`})));
