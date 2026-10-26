import {integer,dice} from './values.js';

export function resourceFields(rules) {
  return ['healing','misdirection','gauntlet','evenDamage','repulsion','armour'].flatMap(key=>rules?.[key]?[rules[key].field]:[]);
}

export function validateResources(rules) {
  if (!rules || typeof rules!=='object' || Array.isArray(rules)) throw new RangeError('Invalid resources');
  for (const field of resourceFields(rules)) if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(field)||['hp','maxHp','constitution','defenceBonus','attackBonus'].includes(field)) throw new RangeError('Invalid resource field');
  if (new Set(resourceFields(rules)).size!==resourceFields(rules).length) throw new RangeError('Duplicate resource');
  for (const key of ['misdirection','repulsion']) if(rules[key]) integer(rules[key].bonus,1,100);
  for (const key of ['gauntlet','evenDamage']) if(rules[key]) integer(rules[key].damage,1,1000);
  if(rules.armour?.override!==undefined)integer(rules.armour.override,0,100);
}

export function healingSpell(hero,rules,roll=()=>Math.floor(Math.random()*6)+1) {
  if (!rules?.healing || rules.spellsDisabled || !hero[rules.healing.field] || hero.hp>=hero.maxHp) throw new RangeError('No healing spell available');
  const value=dice(1,roll)[0],amount=Math.min(Math.ceil(value/2),hero.maxHp-hero.hp);
  hero[rules.healing.field]--;
  return {kind:'healing',amount,dice:[value]};
}

export function resourceDefence(fight,index,attack) {
  const rules=fight.rules.mechanics?.resources,state=fight.encounter;
  return fight.hero.defenceBonus+(attack.ignoreArmour?0:rules?.armour?fight.hero[rules.armour.field]:0)
    +(index!==null&&state?.misdirectionTarget===index?rules.misdirection.bonus:0)
    +(attack.metal&&state?.repulsionActive?rules.repulsion.bonus:0);
}

export function resourceDamage(fight) {
  const rules=fight.rules.mechanics?.resources;
  return (rules?.evenDamage&&fight.hero[rules.evenDamage.field]&&fight.round%2===0?rules.evenDamage.damage:0)
    +(fight.encounter?.gauntletActive?rules.gauntlet.damage:0);
}
