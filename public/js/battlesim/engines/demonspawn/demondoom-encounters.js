import { demondoomEnemy } from './demondoom-roster.js';

const encounters = [
  {section:1,enemy:'Assassin',weapon:10,rule:'assassin',win:10},
  {section:14,enemy:'Rock Leopard',weapon:5,rule:'leopard',mode:'magic-or-unarmed',win:11},
  {section:16,enemy:'Village Spawn',weapon:10,rule:'village-spawn',sequential:true,rolledCount:true,win:28},
  {section:44,enemy:'Satzensqquash',weapon:20,rule:'sqquash',manualStrength:true,hitThreshold:5,win:49},
  {section:48,enemy:'Desert Lion',rule:'ordinary',sequential:true,count:2,win:102},
  {section:50,enemy:'Rock Leopard',weapon:5,rule:'leopard',win:46},
  {section:58,enemy:'Serpent Guardian',rule:'ordinary',win:51},
  {section:60,enemy:'Rock Leopard',weapon:5,rule:'leopard',first:'enemy',win:11},
  {section:67,enemy:'Village Spawn',weapon:10,rule:'village-spawn',sequential:true,rolledCount:true,powerPerKill:5,win:44},
  {section:89,enemy:'Cave Bear',rule:'bear',win:115},
  {section:97,enemies:['Stone Villager 1','Stone Villager 2','Stone Villager 3','Stone Villager 4'],weapon:5,rule:'ordinary',manualGroup:true,playerWeapon:3,win:120},
  {section:104,enemy:'Dragon',weapon:10,rule:'dragon',win:113},
  {section:106,enemy:'Spawn Regent',rule:'regent',win:135},
  {section:109,enemy:'Sea Serpent',rule:'ordinary',win:78},
  {section:112,enemy:'Green Guardian',weapon:10,armour:5,shield:true,rule:'ordinary',win:155},
  {section:119,enemy:'Amoebix',weapon:0,rule:'amoebix',mode:'doom',doomReversal:true,win:136},
  {section:124,enemy:'Amoebix',weapon:0,rule:'amoebix',mode:'magic',doubleMagic:true,win:136},
  {section:131,enemy:'Green Guardian',weapon:10,armour:5,shield:true,rule:'ordinary',mode:'doom',doomReversal:true,win:155},
  {section:138,enemy:'Green Guardian',weapon:10,armour:5,shield:true,rule:'ordinary',mode:'magic',doubleMagic:true,win:155},
  {section:139,enemy:'Dianthrope Regina',rule:'regina',win:206},
  {section:140,enemy:'Desert Snake',weapon:8,rule:'ordinary',halvePlayerStrength:true,win:147},
  {section:143,enemy:'Cupric',rule:'cupric',first:'enemy',speedPenalty:10,win:177},
  {section:149,enemy:'Green Guardian',weapon:10,armour:5,shield:true,rule:'spear-grab',win:155},
  {section:156,enemy:'Cupric',rule:'cupric',first:'enemy',mode:'magic',doubleMagic:true,win:177},
  {section:159,enemy:'Cupric',rule:'cupric',first:'enemy',mode:'doom',doomReversal:true,win:177},
  {section:161,enemy:'Amoebix',weapon:0,rule:'amoebix',mode:'other-weapon',win:136},
  {section:166,enemy:'Cupric',rule:'cupric',first:'enemy',mode:'doom',doomReversal:true,win:177},
  {section:170,enemy:'Cupric',rule:'cupric',first:'enemy',win:177},
  {section:175,enemy:'Golden Web',weapon:0,rule:'web',mode:'doom',doomReversal:true,win:217},
  {section:178,enemy:'Flying Lizard',weapon:5,armour:8,rule:'ordinary',mode:'doom',doomReversal:true,win:226},
  {section:179,enemy:'Golden Guard 1',weapon:15,rule:'ordinary',mode:'doom',first:'enemy',win:235},
  {section:184,enemy:'Cupric',rule:'cupric',first:'enemy',mode:'magic',doubleMagic:true,win:177},
  {section:186,enemy:'Dianthrope Regina',rule:'regina',mode:'doom',doomReversal:true,win:206},
  {section:187,enemy:'Cupric',rule:'cupric',first:'enemy',mode:'other-weapon',win:177},
  {section:189,enemy:'Golden Guard 2',weapon:20,rule:'immune-spell',mode:'magic',magicImmune:true,opening:1,returnTo:183},
  {section:190,enemy:'Cupric',rule:'cupric',first:'enemy',mode:'other-weapon',win:177},
  {section:191,enemy:'Golden Guard 1',weapon:15,rule:'ordinary',first:'enemy',win:235},
  {section:192,enemy:'Golden Guard 3',weapon:25,rule:'ordinary',mode:'doom',win:222},
  {section:193,enemy:'Dianthrope Regina',rule:'regina',mode:'magic',doubleMagic:true,win:206},
  {section:194,enemy:'Golden Guard 2',weapon:20,rule:'half-damage',mode:'other-weapon',halfDamage:true,returnAfter:3,returnTo:183},
  {section:195,enemy:'Golden Web',weapon:0,rule:'web',mode:'magic',doubleMagic:true,win:217},
  {section:197,enemy:'Flying Lizard',weapon:5,armour:8,rule:'ordinary',win:226,flee:205},
  {section:199,enemy:'Dianthrope Regina',rule:'regina',mode:'other-weapon',win:206},
  {section:201,enemy:'Flying Lizard',weapon:5,armour:8,rule:'ordinary',mode:'magic',doubleMagic:true,win:226},
  {section:209,enemy:'Golden Web',weapon:0,rule:'web',mode:'other-weapon',win:217},
  {section:215,enemy:'Golden Guard 2',weapon:20,rule:'ordinary',mode:'doom',win:224},
  {section:216,enemy:'Flying Lizard',weapon:5,armour:8,rule:'ordinary',mode:'other-weapon',win:226},
  {section:219,enemy:'Golden Guard 1',weapon:15,rule:'half-damage',mode:'other-weapon',halfDamage:true,first:'enemy',returnAfter:3,returnTo:191},
  {section:221,enemy:'Demonspawn',weapon:15,rule:'pathfinder',win:241},
  {section:227,enemy:'Golden Guard 1',weapon:15,rule:'immune-spell',mode:'magic',magicImmune:true,opening:2,returnTo:191},
  {section:231,enemy:'Demonspawn',weapon:15,rule:'ordinary',manualGroup:true,count:2,win:208},
  {section:242,enemy:'Golden Guard 3',weapon:25,rule:'immune-spell',mode:'magic',magicImmune:true,opening:1,returnTo:238},
  {section:243,enemy:'Demonspawn',weapon:15,rule:'ordinary',manualGroup:true,count:2,win:237},
  {section:246,enemy:'Demonspawn',weapon:15,rule:'ordinary',manualGroup:true,count:2,win:204},
  {section:248,enemy:'Golden Guard 3',weapon:25,rule:'half-damage',mode:'other-weapon',halfDamage:true,returnAfter:3,returnTo:238},
  {section:249,enemy:'Spawn Captain',weapon:20,rule:'captain',win:234},
];

export const DEMONDOOM_ENCOUNTERS = Object.freeze(encounters.map(encounter => {
  if (encounter.enemies) Object.freeze(encounter.enemies);
  return Object.freeze(encounter);
}));

export function prepareDemondoomEncounter(section, player, options = {}) {
  const original = DEMONDOOM_ENCOUNTERS.find(encounter => encounter.section === Number(section));
  if (!original) throw new Error('Unknown Demondoom encounter');
  const encounter = structuredClone(original);
  let count = encounter.count ?? 1;
  if (encounter.rolledCount) {
    count = options.spawnCount;
    if (!Number.isInteger(count) || count < 2 || count > 12) throw new Error('Roll two dice for the number of Spawn');
  }
  const names = encounter.enemies ?? Array.from({length:count}, () => encounter.enemy);
  const enemies = names.map(name => demondoomEnemy(name, {
    weapon: encounter.weapon, armour: encounter.armour ?? 0, shield: !!encounter.shield,
    manualWeapon: encounter.weapon === undefined && !['regent','regina','cupric'].includes(encounter.rule),
  }));
  const character = structuredClone(player);
  if (encounter.playerWeapon !== undefined) character.weapon = encounter.playerWeapon;
  if (encounter.mode === 'doom') character.weapon = 'doombringer';
  if (encounter.mode === 'other-weapon' && character.weapon === 'doombringer') throw new Error('Select the ordinary weapon used for this route');
  if (encounter.mode === 'magic-or-unarmed') character.weapon = 'unarmed';
  if (encounter.halvePlayerStrength) character.strength /= 2;
  return {encounter,player:character,enemies,options:structuredClone(options)};
}
