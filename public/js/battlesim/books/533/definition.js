export { loadRoster } from '../../engines/grailquest/legion-of-the-dead-roster.js';
// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 533,
  "title": "Legion of the Dead",
  "family": "grailquest",
  "stateKey": "sim533",
  "i18nPrefix": "battlesim533"
});

export const ID = 'sim533';

export const fields = ['life','maxLife','armour','permanent','experience','gold'];

export const stocks = ['bolts','fireballs','cubeUses','waterUses','brandyUses','amuletUses','wandUses','ringUses','teaUses'];

export const flags = ['jadeGarlic','monkey','germ','deathOde','sunstone','leek','collar','wandWord','poisonImmune'];

export const settings = ['killEnemies','useSkeleton','useMonkey','useGerm','invisibilityAllowed','indoors'];

export const spells = ['panic','pow','pill','pad','pip','pin','repeater','invisibility','firefinger','fireball','plop','pid','pals','pil'];

export const items = ['cube','water','brandy','amulet','wand','ring','flattened','cold','moonshine','finger','armour','teaFull','teaDice',
  'skeleton','orangutiger','dragon','monkey','germ','jadeGarlic','deathOde','sunstone','leek','collar','wandWord'];
