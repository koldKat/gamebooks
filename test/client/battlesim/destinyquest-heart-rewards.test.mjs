import test from 'node:test';
import assert from 'node:assert/strict';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {createDestinyFight,startDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities,useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyDamageScore} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {createDestinyCharacter,recordDestinyOutcome,attachDestinyCharacter} from '../../../public/js/battlesim/engines/destinyquest/character.js';
import {attachDestinyAlly} from '../../../public/js/battlesim/engines/destinyquest/allies.js';
import {enableDestinyTeam} from '../../../public/js/battlesim/engines/destinyquest/team-state.js';
import {setDestinyPassiveActivation as activate} from '../../../public/js/battlesim/engines/destinyquest/ability-quota.js';
import {createDestinySession,applyDestinySessionAction} from '../../../public/js/battlesim/engines/destinyquest/session.js';
import {applyDestinyTravelAction as travel} from '../../../public/js/battlesim/engines/destinyquest/travel-rules.js';
const clone=f=>JSON.parse(JSON.stringify(f));
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
function setup(abilities={}){
  return configureDestinyAbilities(createDestinyFight({speed:10,brawn:4,magic:0,armour:0,health:20,maxHealth:30},[{name:'Monster',speed:8,brawn:4,armour:2,health:100}]),abilities,{mainHand:{type:'dagger'}},{catalog,bookRules:{deathMoves:false,deathPenalties:false}});
}
const won=f=>({...f,status:'win',phase:'finished'});

test('Pillage awards two dice of story gold once per finished combat, independently of account currencies',()=>{
  const f=won(setup({pillage:1})),character=createDestinyCharacter({gold:7,coinsBalance:123,backpack:[],equipment:{mainHand:{type:'dagger'}}});
  const before=clone(character),result=recordDestinyOutcome(character,f,'victory',rolls(2,5));
  assert.equal(result.character.gold,14);assert.equal(result.character.coinsBalance,123);assert.deepEqual(character,before);
  assert.deepEqual(result.rewards,[{ability:'pillage',dice:[2,5],gold:7}]);
  const again=recordDestinyOutcome(result.character,f,'victory',rolls());assert.equal(again.recorded,false);assert.equal(again.character.gold,14);
  const lost={...f,status:'loss'};const loss=recordDestinyOutcome(character,lost,'loss',rolls());assert.equal(loss.character.gold,7);
});

test('Cutpurse resolves every printed face and records item rewards without creating inventory or equipment',()=>{
  for(let face=1;face<=6;face++){
    const character=createDestinyCharacter({gold:7,backpack:[],equipment:{mainHand:{type:'dagger'}}});
    const result=recordDestinyOutcome(character,won(setup({cutpurse:1})),'cutpurse',rolls(face));
    assert.equal(result.character.gold,face<=2?27:7);assert.deepEqual(result.character.backpack,[]);assert.deepEqual(result.character.equipment,character.equipment);
    if(face>=3){
      assert.equal(result.rewards[0].item.name,face<=4?'Elixir of invisibility':'Flask of healing');
      assert.equal(result.rewards[0].item.uses,1);
    }
  }
});

test('victory rewards respect selected Hexed passives and cancelled or sacrificed abilities',()=>{
  let f=setup({hexed:1,pillage:1,cutpurse:1});
  assert.equal(recordDestinyOutcome({},won(f),'unselected',rolls()).rewards,undefined);
  f=activate(f,'pillage');const result=recordDestinyOutcome({},won(f),'selected',rolls(1,2));assert.equal(result.character.gold,3);
  f.encounter={cancelledAbilities:['pillage']};assert.equal(recordDestinyOutcome({},won(f),'cancelled',rolls()).rewards,undefined);
});

test('team victory eligibility is once per source encounter per character, while Pillage remains per combat',()=>{
  let f=enableDestinyTeam(attachDestinyAlly(setup({pillage:1}),setup()));
  f.encounter={sourceBookId:1287,sourceSection:'163'};f=won(f);
  const first=recordDestinyOutcome({},f,'fight-1',rolls(1,2));assert.equal(first.teamLootEligible,true);assert.equal(first.character.gold,3);
  const repeat=recordDestinyOutcome(first.character,f,'fight-2',rolls(3,4));assert.equal(repeat.teamLootEligible,false);assert.equal(repeat.character.gold,10);
  assert.deepEqual(repeat.character.teamVictories,['1287:163']);
  f.encounter.sourceSection='662';assert.equal(recordDestinyOutcome(repeat.character,f,'other',rolls(1,1)).teamLootEligible,true);
});

test('session records separate actor rewards and first-win eligibility without leaking the player’s Hexed quota to the ally',()=>{
  const owner=attachDestinyCharacter(setup({hexed:1,pillage:1}),{gold:7,ownerMarker:'player',teamVictories:['1287:163']});
  const ally=attachDestinyCharacter(setup({pillage:1}),{gold:99,ownerMarker:'ally'});
  let f=enableDestinyTeam(attachDestinyAlly(owner,ally));f.encounter={sourceBookId:1287,sourceSection:'163'};f=won(f);
  let session=createDestinySession({fight:f,fightId:'team-win',character:owner.character});
  session=applyDestinySessionAction(session,'record-outcome',{}, {roll:rolls(2,3)});
  assert.equal(session.character.gold,7);assert.equal(session.character.ownerMarker,'player');
  assert.equal(session.fight.allies[0].character.gold,104);assert.equal(session.fight.allies[0].character.ownerMarker,'ally');
  assert.deepEqual(session.fight.team.rewardEligibility,{0:false,1:true});
});

test('Tome Raider applies only changes in the declared spellbook count and supports already-entered totals',()=>{
  let s={character:{gold:7,backpack:[]},setup:{hero:{magic:4,health:20,maxHealth:30},abilities:{'tome-raider':1},equipment:{mainHand:{type:'book'}}}};
  const before=clone(s);
  s=travel(s,'permanent-bonus',{ability:'tome-raider',spellbooks:2,bonusAlreadyIncluded:false},catalog);
  assert.equal(s.setup.hero.magic,8);assert.equal(before.setup.hero.magic,4);
  s=travel(clone(s),'permanent-bonus',{ability:'tome-raider',spellbooks:2,bonusAlreadyIncluded:false},catalog);assert.equal(s.setup.hero.magic,8);
  s=travel(s,'permanent-bonus',{ability:'tome-raider',spellbooks:3,bonusAlreadyIncluded:false},catalog);assert.equal(s.setup.hero.magic,10);
  s=travel(s,'permanent-bonus',{ability:'tome-raider',spellbooks:1,bonusAlreadyIncluded:false},catalog);assert.equal(s.setup.hero.magic,6);
  s=travel(s,'permanent-bonus',{ability:'tome-raider',spellbooks:2,bonusAlreadyIncluded:true},catalog);assert.equal(s.setup.hero.magic,6);
  assert.deepEqual(s.setup.equipment,before.setup.equipment);assert.deepEqual(s.character.backpack,[]);assert.equal(s.character.gold,7);
});

test('Demon Blood acquisition adds Health once, preserves wounds and leaves already-included Health unchanged',()=>{
  let s={character:{},setup:{hero:{health:12,maxHealth:30},abilities:{'demon-blood':1}}};
  s=travel(s,'permanent-bonus',{ability:'demon-blood',bonusAlreadyIncluded:false},catalog);
  assert.deepEqual(s.setup.hero,{health:22,maxHealth:40});
  s=travel(clone(s),'permanent-bonus',{ability:'demon-blood',bonusAlreadyIncluded:false},catalog);assert.deepEqual(s.setup.hero,{health:22,maxHealth:40});
  const included=travel({character:{},setup:{hero:{health:22,maxHealth:40},abilities:{'demon-blood':1}}},'permanent-bonus',{ability:'demon-blood',bonusAlreadyIncluded:true},catalog);
  assert.deepEqual(included.setup.hero,{health:22,maxHealth:40});
});

test('invalid permanent acquisition input fails without modifying the character or its history',()=>{
  const s={character:{},setup:{hero:{magic:4,health:20,maxHealth:30},abilities:{'tome-raider':1}}},before=clone(s);
  for(const payload of [{ability:'tome-raider',spellbooks:2},{ability:'tome-raider',spellbooks:-1,bonusAlreadyIncluded:false},{ability:'demon-blood',bonusAlreadyIncluded:false}])assert.throws(()=>travel(s,'permanent-bonus',payload,catalog));
  assert.deepEqual(s,before);
  assert.throws(()=>travel({...s,fight:{status:'active'}},'permanent-bonus',{ability:'tome-raider',spellbooks:2,bonusAlreadyIncluded:false},catalog),/Finish combat/);
});

test('Strength in Numbers records zero-to-four rescued carts and boosts only hero scores in the hunter camp',()=>{
  let s={character:{},setup:{abilities:{'strength-in-numbers':1}}};
  s=travel(s,'source-counter',{ability:'strength-in-numbers',count:3},catalog);
  assert.equal(s.character.sourceCounters.freedTigrisCarts,3);
  assert.throws(()=>travel(s,'source-counter',{ability:'strength-in-numbers',count:5},catalog),/valid completed/);
  let f=startDestinyRound(attachDestinyCharacter(setup({'strength-in-numbers':1}),s.character),0);
  assert.throws(()=>useDestinyAbility(f,'strength-in-numbers'),/requires its encounter/);
  f.encounter={huntersCamp:true};f=useDestinyAbility(f,'strength-in-numbers');
  f.turn.winner='hero';f.turn.damageDice=[2];assert.equal(destinyDamageScore(f),9);
  f.round++;assert.equal(destinyDamageScore(f),9);
  f.turn.winner='opponent';assert.equal(destinyDamageScore(f),6);
  assert.throws(()=>useDestinyAbility(f,'strength-in-numbers'),/no uses left/);
});
