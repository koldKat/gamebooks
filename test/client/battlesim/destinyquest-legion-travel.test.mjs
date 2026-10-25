import test from 'node:test';
import assert from 'node:assert/strict';
import {LEGION_ABILITIES as catalog,LEGION_PENDING_ABILITIES} from '../../../public/js/battlesim/engines/destinyquest/legion-abilities.js';
import {applyDestinyTravelAction,destinyCanEquipItem} from '../../../public/js/battlesim/engines/destinyquest/travel-rules.js';
import {configureDestinyAbilities,useDestinyBackpackItem,useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {createDestinyFight,startDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {attachDestinyCharacter} from '../../../public/js/battlesim/engines/destinyquest/character.js';
import {destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {applyDestinySessionAction} from '../../../public/js/battlesim/engines/destinyquest/session.js';

const hero={speed:10,brawn:4,magic:1,armour:3,health:20,maxHealth:30};
const foe={name:'Opponent',speed:1,brawn:1,armour:1,health:100};
const dice=(...values)=>()=>{assert.ok(values.length,'Unexpected roll');return values.shift();};
const session=abilities=>({character:{gold:10,notes:'keep',otherAccountCurrencies:{gold:500,rubies:7}},setup:{abilities},history:[{id:'preserve'}],notebook:'preserve'});
const travel=(s,name,options)=>applyDestinySessionAction(s,'story-action',{name,options},{catalog});

test('all 141 source entries have implemented combat or travel rules, including the PvP-only ability',()=>{
  assert.equal(Object.keys(catalog).length,141);assert.deepEqual(LEGION_PENDING_ABILITIES,[]);
});

test('Beep Beep doubles discovered story gold, never rewards or account currencies, and duplicate items do not stack',()=>{
  const original=session({'beep-beep':2});
  let s=travel(original,'discover-gold',{amount:7});assert.equal(s.character.gold,24);
  s=travel(s,'reward-gold',{amount:7});assert.equal(s.character.gold,31);
  assert.equal(original.character.gold,10);assert.deepEqual(s.character.otherAccountCurrencies,original.character.otherAccountCurrencies);assert.equal(s.notebook,'preserve');assert.deepEqual(s.history,original.history);
});

test('Loot Master replaces one won fight reward with twenty gold and cannot claim the same loot twice',()=>{
  let s=session({'loot-master':1});s.fightId='victory-1';s.fight={status:'win',character:structuredClone(s.character)};
  s=travel(s,'loot-instead');assert.equal(s.character.gold,30);assert.equal(s.fight.character.gold,30);
  assert.throws(()=>travel(JSON.parse(JSON.stringify(s)),'loot-instead'),/unclaimed loot/);
  s.fight.status='loss';s.fightId='loss-1';assert.throws(()=>travel(s,'loot-instead'),/unclaimed loot/);
});

test('Midas Touch grants thirty story gold for replacing equipment but not for filling an empty slot or backpack',()=>{
  let s=session({'midas-touch':2});const item={id:'new',type:'boots',abilities:[],speed:2};
  s=travel(s,'replace-equipment',{slot:'feet',item});assert.equal(s.character.gold,10);
  s=travel(s,'replace-equipment',{slot:'feet',item:{...item,id:'newer'}});assert.equal(s.character.gold,40);
  assert.throws(()=>travel(s,'replace-equipment',{slot:'backpack',item}),/Cannot equip/);
});

test('Patchwork Pauper retains one old ability only in its four eligible slots and updates owned counts',()=>{
  let s=session({'patchwork-pauper':1,venom:1});s.setup.equipment={chest:{id:'old',abilities:['venom']},mainHand:{id:'old-sword',type:'sword',abilities:['venom']}};
  s=travel(s,'replace-equipment',{slot:'chest',item:{id:'new',armour:5,abilities:['heal']},keepAbility:'venom'});
  assert.deepEqual(s.setup.equipment.chest.abilities,['heal','venom']);assert.equal(s.setup.equipment.chest.id,'new');assert.equal(s.setup.abilities.venom,1);assert.equal(s.setup.abilities.heal,1);
  assert.throws(()=>travel(s,'replace-equipment',{slot:'mainHand',item:{id:'newer',abilities:[]},keepAbility:'venom'}),/cannot be retained/);
});

test('Ambidextrous swaps sword hands without authorizing arbitrary equipment or other weapon types',()=>{
  const sword={type:'sword',hand:'mainHand',abilities:[]};
  assert.equal(destinyCanEquipItem({},catalog,sword,'leftHand'),false);
  assert.equal(destinyCanEquipItem({ambidextrous:1},catalog,sword,'leftHand'),true);
  assert.equal(destinyCanEquipItem({ambidextrous:1},catalog,{...sword,type:'axe'},'leftHand'),false);
  assert.throws(()=>configureDestinyAbilities(createDestinyFight(hero,[foe]),{},{leftHand:sword},{catalog}),/that hand/);
  const f=configureDestinyAbilities(createDestinyFight(hero,[foe]),{ambidextrous:1},{leftHand:sword},{catalog});assert.equal(f.equipment.leftHand.hand,'mainHand');
});

test('Good Taste adds one actual die only to a Magic potion and a consumed item cannot be reused this round',()=>{
  let f=configureDestinyAbilities(createDestinyFight(hero,[foe]),{'good-taste':2},{},{catalog});
  f=attachDestinyCharacter(f,{backpack:[{name:'Magic potion',stats:{magic:2},quantity:2}]});f=startDestinyRound(f,0);
  const original=structuredClone(f);f=useDestinyBackpackItem(f,0,dice(4));assert.equal(destinyStat(f,'hero','magic'),7);assert.equal(f.character.backpack[0].quantity,1);
  assert.deepEqual(original.character.backpack[0].quantity,2);assert.throws(()=>useDestinyBackpackItem(f,0,dice()),/unavailable/);
  f=configureDestinyAbilities(createDestinyFight(hero,[foe]),{'good-taste':1},{},{catalog});f=attachDestinyCharacter(f,{backpack:[{name:'Healing potion',heal:4}]});f=startDestinyRound(f,0);
  f=useDestinyBackpackItem(f,0,dice());assert.equal(f.hero.health,24);assert.deepEqual(f.character.backpack,[]);
});

test('Usurper borrows only a speed or modifier already played by an opposing hero, never an ordinary monster ability',()=>{
  let f=startDestinyRound(configureDestinyAbilities(createDestinyFight(hero,[foe]),{usurper:1},{},{catalog}),0);
  assert.throws(()=>useDestinyAbility(f,'usurper',{ability:'focus'}),/opposing hero/);
  f.encounter={heroVersusHero:true,playedAbilitiesByTarget:{0:['focus','cleave']}};
  assert.throws(()=>useDestinyAbility(f,'usurper',{ability:'cleave'}),/opposing hero/);
  f=useDestinyAbility(f,'usurper',{ability:'focus'});f=useDestinyAbility(f,'focus');assert.equal(destinyStat(f,'hero','magic'),4);
});
