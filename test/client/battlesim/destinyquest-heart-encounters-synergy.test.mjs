import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,retargetDestinyRound,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {queueDestinyEncounterEvent} from '../../../public/js/battlesim/engines/destinyquest/encounter-events.js';
import {useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:30,brawn:0,magic:0,armour:20,health:40,maxHealth:40};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
const fight=(section,options={})=>createHeartFight({...hero,...options.hero},section,{...options,roster});
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,2,3)),rolls());
const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(2,3,6,5)),rolls());
const score=f=>resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));

test('Anansi leap subtracts current Speed from fifteen, ignores Armour and cannot cause negative damage',()=>{
  for(const [speed,damage] of [[8,7],[15,0],[20,0]]){
    let f=score(win(startDestinyRound(fight(643,{hero:{speed,armour:100}}),0)));
    f=endDestinyRound(f);assert.equal(f.hero.health,40-damage);
  }
});

test('necrotic venom lowers attributes every affected end and Cauterise stops new losses without restoring old ones',()=>{
  let f=score(lose(startDestinyRound(fight(643,{hero:{speed:0,brawn:10,magic:8,armour:0,health:100,maxHealth:100},abilities:{cauterise:1}}),0)));
  assert.equal(f.encounter.heroStatuses.venom,2);f=endDestinyRound(f);
  assert.equal(destinyStat(f,'hero','brawn'),9);assert.equal(destinyStat(f,'hero','magic'),7);
  f.hero.speed=30;f=endDestinyRound(score(win(startDestinyRound(f,0))));
  assert.equal(destinyStat(f,'hero','brawn'),8);assert.equal(destinyStat(f,'hero','magic'),6);
  f=startDestinyRound(clone(f),0);f=useDestinyAbility(f,'cauterise');assert.equal(f.encounter.heroStatuses.venom,undefined);
  f=endDestinyRound(score(win(f)));assert.equal(destinyStat(f,'hero','brawn'),8);assert.equal(destinyStat(f,'hero','magic'),6);
});

test('Toxicology prevents Anansi venom and its attribute losses, while a blocked attack never applies venom',()=>{
  for(const [armour,abilities] of [[100,{}],[0,{toxicology:1}]]){
    let f=score(lose(startDestinyRound(fight(643,{hero:{speed:0,armour,brawn:10,magic:8,health:100,maxHealth:100},abilities}),0)));
    f=endDestinyRound(f);assert.equal(f.encounter.heroStatuses?.venom,undefined);assert.equal(destinyStat(f,'hero','brawn'),10);
  }
});

test('Joss Blood Hail deals ten through Armour and Blood Thief heals four only on actual Health loss',()=>{
  for(const shield of [0,10]){
    let f=startDestinyRound(fight(837,{hero:{armour:100}}),0);f.opponents[0].health=70;f.portableShieldHealth=shield;
    f=rollDestinySpeed(f,rolls(6,5,2,2));assert.equal(f.hero.health,shield?40:30);
    assert.equal(f.opponents[0].health,shield?70:74);
  }
});

test('Joss Blood Thief applies to score and separate damage dice, caps at eighty and ignores blocked scores',()=>{
  for(const armour of [0,20]){
    let f=lose(startDestinyRound(fight(837,{hero:{speed:0,armour}}),0));f.opponents[0].health=79;f=score(f);
    assert.equal(f.opponents[0].health,armour?79:80);
  }
  let f=startDestinyRound(fight(837),0);f.opponents[0].health=70;
  queueDestinyEncounterEvent(f,{kind:'enemy-dice-damage',name:'Enemy dice','dice':1,owner:'opponent',damageDice:true,attacker:0},'end',rolls(3));
  f=resolveDestinyAbilityRoll(f,rolls(),{roster});assert.equal(f.hero.health,37);assert.equal(f.opponents[0].health,74);
});

test('Molech drains Brawn and Magic on actual Health loss and heals while spectres live',()=>{
  let f=lose(startDestinyRound(fight(842,{hero:{speed:0,brawn:10,magic:9,armour:0}}),0));f.opponents[0].health=90;f=score(f);
  assert.equal(destinyStat(f,'hero','brawn'),9);assert.equal(destinyStat(f,'hero','magic'),8);
  f=endDestinyRound(f);assert.equal(f.opponents[0].health,96);
  f.hero.speed=30;f.hero.brawn=100;f=score(retargetDestinyRound(win(startDestinyRound(f,0)),1));assert.equal(f.opponents[1].health,0);
  f=endDestinyRound(f);assert.equal(f.opponents[0].health,96);f.hero.speed=0;
  const brawn=destinyStat(f,'hero','brawn');f=score(lose(startDestinyRound(f,0)));assert.equal(destinyStat(f,'hero','brawn'),brawn);
});

test('Molech cannot drain through a blocked score and dead spectres disable damage-dice drain too',()=>{
  let f=score(lose(startDestinyRound(fight(842,{hero:{speed:0,brawn:10,magic:9}}),0)));
  assert.equal(destinyStat(f,'hero','brawn'),10);
  f.opponents[1].health=0;queueDestinyEncounterEvent(f,{kind:'enemy-dice-damage',name:'Enemy dice',dice:1,owner:'opponent',damageDice:true,attacker:0},'end',rolls(3));
  f=resolveDestinyAbilityRoll(f,rolls(),{roster});assert.equal(destinyStat(f,'hero','brawn'),10);
});

test('Molech victory routes depend on surviving spectres without inventing their death',()=>{
  let f=score(win(startDestinyRound(fight(842,{hero:{brawn:200}}),0)));
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'880');assert.equal(f.opponents[1].health,40);
  f=fight(842,{hero:{brawn:200}});f.opponents[1].health=0;f=score(win(startDestinyRound(f,0)));assert.equal(f.encounter.outcomeSection,'681');
});

test('Sparkacus explicitly allows Insulated protection and blocks the four printed abilities',()=>{
  for(const insulated of [false,true]){
    let f=score(win(startDestinyRound(fight(855,{hero:{brawn:20},abilities:{bleed:1,disease:1,venom:1,piercing:1,barbs:1,...(insulated?{insulated:1}:{})}}),0)));
    assert.equal(f.hero.health,insulated?40:36);assert.equal(f.effects.some(e=>['bleed','disease','venom'].includes(e.kind)),false);
    const hp=f.hero.health;f=endDestinyRound(f);assert.equal(f.hero.health,hp);assert.equal(f.opponents[0].health,79);
    f=win(startDestinyRound(f,0));assert.throws(()=>useDestinyAbility(f,'piercing'),/immune/);
  }
});

test('Cave witch Voodoo uses a separate opponent damage die through Armour and supports Lightning retaliation',()=>{
  for(const face of [1,2,3,4,5,6]){
    let f=score(win(startDestinyRound(fight(867,{abilities:{lightning:1}}),0)));
    f=endDestinyRound(f,[],rolls(face));assert.equal(f.turn.pendingAbility.event.owner,'opponent');
    f=resolveDestinyAbilityRoll(clone(f),rolls(),{roster});f=endDestinyRound(f,[],rolls());
    assert.equal(f.hero.health,40-face);assert.equal(f.opponents[0].health,48);
  }
});
