import { FABLED_ABILITIES, newFabledCharacter, validateFabledCharacter,
  fabledInteger, fabledDie, fabledDice } from './character.js';

export const SERPENT_PROFESSIONS = Object.freeze({
  priest: [7,5,6,9,7,2], mage: [5,5,9,1,8,6], rogue: [8,7,7,2,5,9],
  troubadour: [9,6,6,5,5,7], warrior: [6,9,3,7,6,3], wayfarer: [5,8,4,5,9,7],
});
export const SERPENT_DEFAULTS = Object.freeze({
  rank: 7, stamina: 30, shards: 0, armour: 0, professions: SERPENT_PROFESSIONS,
});
const enemy = (name, combat, defence, stamina) => ({name,combat,defence,stamina});
const encounter = (section, win, name, combat, defence, stamina, extra = {}) => ({
  section, win, loss:99, enemies:[enemy(name,combat,defence,stamina)], ...extra,
});
const spirit = (section, win, name, nahual, defence, stamina, extra = {}) =>
  encounter(section,win,name,nahual,defence,stamina,{spiritual:true,loss:1146,...extra});

export const SERPENT_FIGHTS = Object.freeze([
  {section:3,win:845,loss:99,special:'soldiers',enemies:[enemy('Soldiers',7,12,22),enemy('Administrator',2,5,7)]},
  encounter(15,380,'Tribal scout',9,13,17),
  encounter(16,1166,'Watchman Idol',11,17,30,{heat:true}),
  encounter(29,165,'Marsh ghouls',8,13,58,{special:'ghouls',preCheck:true}),
  encounter(30,680,'The Grim',16,24,40),
  encounter(166,1133,'Cannibal',7,9,12,{heat:true}),
  encounter(195,1043,'Men of Smogmaw',13,16,32),
  encounter(396,298,'The Grim',16,24,40),
  encounter(455,160,'Tribal warriors',12,15,27,{mildHeat:true}),
  {section:457,win:362,loss:1146,spiritual:true,special:'mirror',enemies:[{name:'Living rage',dynamic:'mirror'}]},
  encounter(459,797,'Astral Demon',14,20,35,{heat:true}),
  encounter(501,210,'Constable',10,16,19,{entryDamage:3,threshold:5}),
  encounter(513,502,'Wisp-spider',14,21,24,{heat:true,flee:{destination:787}}),
  encounter(539,658,'One-armed man',5,8,14),
  encounter(541,820,'Baron Moonshine',14,22,42,{special:'baronReturned'}),
  encounter(580,115,'Kaimren',11,15,17,{unarmed:true}),
  encounter(612,911,'Spectral warrior',14,19,23,{special:'goldenWeapon',flee:{destination:785}}),
  encounter(642,520,'Nyar warrior',11,16,20,{heat:true,special:'nyarWarrior'}),
  encounter(668,941,'Cannibal Hunters',11,14,26,{heat:true,special:'blowgun'}),
  encounter(688,987,'The Patasola',12,23,25,{special:'brokenFingers',preCheck:true}),
  spirit(705,1200,'Namagal',18,11,50,{loss:99}),
  spirit(779,814,'The Grim',14,6,40,{special:'grimEscape',preCheck:true}),
  encounter(802,978,'Lightning Birds',13,16,20,{special:'lightning'}),
  spirit(831,502,'Wisp-spider',11,6,24,{loss:99,flee:{destination:787,special:'spider'}}),
  encounter(864,941,'Cannibal Hunters',11,14,26,{heat:true}),
  encounter(870,272,'Young Cannibal',8,10,14,{heat:true}),
  spirit(876,309,'Kerep Tlotor',7,7,20,{loss:99}),
  spirit(906,494,'The Grim',14,6,40),
  encounter(909,743,'Nobou the Musician',14,14,16),
  encounter(919,274,'Pair of crocodiles',10,15,31,{attackModifier:-2}),
  spirit(959,819,'The Grim',14,6,40),
  encounter(966,301,'Namagal',18,26,50,{heat:true,playerFirst:false}),
  encounter(988,520,'Nyar warrior',11,16,20,{heat:true,special:'nyarContinuation'}),
  encounter(991,42,'Scarred murderer',9,15,15,{special:'constables'}),
  spirit(1014,545,'King Skabb',6,7,15,{ratPoison:true}),
  encounter(1105,562,'Men of Smogmaw',13,16,32),
  encounter(1128,820,'Baron Moonshine',14,22,42,{special:'baron'}),
  encounter(1194,41,'Kerep Tlotor',12,17,26,{loss:577,lossStamina:1}),
  spirit(1195,773,'Kaschuf',16,9,20,{loss:99}),
  encounter(1196,411,'Nyar trackers',13,18,28,{special:'nyarTrackers'}),
]);

export function newSerpentCharacter(profession = 'warrior') {
  const character = newFabledCharacter(profession,SERPENT_DEFAULTS);
  for (const ability of FABLED_ABILITIES) character['base'+ability[0].toUpperCase()+ability.slice(1)] = character[ability];
  return {...character,nahual:0,spiritualWeapon:0,spiritualCombatBonus:0,spiritualArmour:0,heatArmour:0,metalArmour:0,
    obfuscation:false,clarity:false,diseaseBlessing:false,periapt:false,guise:false,
    frenziedMight:false,crazedVim:false,shimasCurse:false,pacharaCirclet:false};
}

function base(character, ability) {
  const key = 'base'+ability[0].toUpperCase()+ability.slice(1);
  return fabledInteger(character[key] ?? character[ability],1,12);
}

export function validateSerpentCharacter(character, alive = false) {
  validateFabledCharacter(character,alive);
  for (const ability of FABLED_ABILITIES) base(character,ability);
  for (const key of ['nahual','spiritualWeapon','spiritualCombatBonus','spiritualArmour','heatArmour','metalArmour'])
    fabledInteger(character[key] ?? 0,0,1000);
  for (const key of ['obfuscation','clarity','diseaseBlessing','periapt','guise',
    'frenziedMight','crazedVim','shimasCurse','pacharaCirclet'])
    if (character[key] !== undefined && typeof character[key] !== 'boolean') throw new RangeError('Invalid Serpent King setting');
  if ((character.heatArmour ?? 0)>character.armour || (character.metalArmour ?? 0)>character.armour)
    throw new RangeError('Armour component exceeds total Defence bonus');
  return character;
}

export function serpentDefence(character, spiritual = false, {mentalPenalty = false, mirror = false} = {}) {
  validateSerpentCharacter(character);
  if (typeof spiritual !== 'boolean' || typeof mentalPenalty !== 'boolean' || typeof mirror !== 'boolean')
    throw new RangeError('Invalid Defence setting');
  if (!spiritual) return base(character,'combat')+character.rank+character.armour;
  const penalty = mentalPenalty ? 1 : 0;
  return (character.nahual ?? 0)+Math.max(1,base(character,'magic')-penalty,base(character,'sanctity')-penalty)
    +(character.spiritualArmour ?? 0)+(character.pacharaCirclet&&!mirror ? 2 : 0);
}

export function serpentAbilityCheck(input, ability, difficulty, {spiritual = false, spiritWeapon = false} = {}, roll) {
  validateSerpentCharacter(input,true);
  if (!FABLED_ABILITIES.includes(ability) || typeof spiritual !== 'boolean' || typeof spiritWeapon !== 'boolean')
    throw new RangeError('Invalid ability check');
  fabledInteger(difficulty);
  const character = structuredClone(input);
  const score = spiritual ? base(character,ability)+(spiritWeapon&&ability==='combat' ? character.spiritualCombatBonus ?? 0 : 0) : character[ability];
  const modifier = character.shimasCurse ? -2 : 0;
  character.shimasCurse = false;
  const dice = fabledDice(roll),total = dice+score+modifier;
  return {character,dice,total,success:total>difficulty,usedCurse:modifier!==0};
}

export function burnedHordeCheck(input, {applyEntry = false} = {}, roll) {
  validateSerpentCharacter(input,true);
  if (typeof applyEntry !== 'boolean') throw new RangeError('Invalid entry setting');
  const character = structuredClone(input);
  let damage = applyEntry&&!character.guise ? 6 : 0;
  character.stamina = Math.max(0,character.stamina-damage);
  if (!character.stamina) return {character,damage,total:null,status:'loss',destination:1146};
  const check = serpentAbilityCheck(character,'combat',18,{spiritual:true,spiritWeapon:true},roll);
  Object.assign(character,check.character);
  if (!check.success && !character.guise) {
    const injury = fabledDice(roll)+fabledDie(roll);
    damage += injury;
    character.stamina = Math.max(0,character.stamina-injury);
  }
  return {character,damage,total:check.total,status:!character.stamina?'loss':check.success?'win':'continue',
    destination:!character.stamina?1146:check.success?267:null};
}
