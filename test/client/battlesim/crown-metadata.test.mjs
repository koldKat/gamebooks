import { readRosterDocument } from '../../helpers/roster-db.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadFixtureRoster} from './roster-fixtures.mjs';
import * as combat from '../../../public/js/battlesim/books/724/combat.js';
import {NPC_RULES} from '../../../public/js/battlesim/books/724/definition.js';

await loadFixtureRoster(724);
const hero=()=>({...combat.newCharacter('wizard',()=>6),pebbles:4});

test('saved captain fights retain checkpoint behavior without new saved fields',()=>{
  const original=combat.startFight(145,hero());original.enemies[0].stamina=0;original.enemies[1].stamina=0;
  original.enemies[2].stamina=7;
  const saved=JSON.stringify(original);
  let next=combat.round(JSON.parse(saved),2,(sides)=>1);
  while(next.pending.length)next=combat.resolveHit(next,false,()=>1);
  assert.equal(JSON.stringify(original),saved);
  assert.equal(next.destination,391);assert.equal(next.mercyDestination,347);
  assert.deepEqual(NPC_RULES.roomGuards.choices.map(choice=>choice.value),['none','446','553']);
  assert.throws(()=>combat.startFight(453,hero(),{surprise:446}),/Invalid surprise/);
});

test('alternate metadata controls captain groups, gaze, surprise and volley outcomes',async()=>{
  const seed=readRosterDocument(724);
  for(const row of seed.enemies){
    const settings=row.stats.entry.npcRules;
    if(settings?.captain)Object.assign(settings.captain,{frontline:[1,2],enemyIndex:0,stamina:7,destination:900,mercyDestination:901});
    if(settings?.redEyes)Object.assign(settings.redEyes,{initialThreshold:5,minimumThreshold:3,fatalBurns:3});
    if(settings?.roomGuards)Object.assign(settings.roomGuards.choices[1],{value:'custom-door',enemyIndex:1,skillLoss:5});
    if(settings?.frightenedGuards)Object.assign(settings.frightenedGuards,{routes:[{minimum:4,destination:902},{minimum:2,destination:903}],excludeEnemy:1});
  }
  const definitionUrl=new URL('../../../public/js/battlesim/books/724/definition.js?custom-metadata',import.meta.url);
  const definition=await import(definitionUrl.href);await definition.loadRoster(async()=>({ok:true,json:async()=>seed.enemies}));
  const combatUrl=new URL('../../../public/js/battlesim/books/724/combat.js',import.meta.url);
  const source=readFileSync(combatUrl,'utf8').replace(/from '([^']+)'/g,(_,relative)=>'from '+JSON.stringify(relative==='./definition.js'?definitionUrl.href:new URL(relative,combatUrl).href));
  const custom=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  let captain=custom.startFight(145,hero());assert.deepEqual(custom.activeEnemies(captain),[1,2]);
  captain.enemies[1].stamina=captain.enemies[2].stamina=0;
  captain=custom.round(captain,0,()=>1);while(captain.pending.length)captain=custom.resolveHit(captain,false,()=>1);
  assert.equal(captain.destination,900);assert.equal(captain.mercyDestination,901);
  const surprised=custom.startFight(453,hero(),{surprise:'custom-door'});
  assert.equal(surprised.enemies[0].skill,8);assert.equal(surprised.enemies[1].skill,2);assert.equal(surprised.config.playerWinsTies,true);
  assert.throws(()=>custom.startFight(453,hero(),{surprise:'446'}),/Invalid surprise/);
  let gaze=custom.startFight(159,hero());
  for(let enemy=0;enemy<3;enemy++){
    gaze.pending=[{direction:'outgoing',enemy,actor:'player',ally:null,damage:1,multiplier:1}];
    gaze=custom.resolveHit(gaze,false,(()=>{const values=[5,1];return()=>values.shift();})());
    assert.equal(gaze.events.find(event=>event.kind==='gaze').threshold,5);
    assert.equal(gaze.player.stamina,enemy===2?0:23-enemy);
  }
  let volley=custom.startFight(784,hero());
  for(let count=1;count<=4;count++){
    volley=custom.throwPebble(volley,0,()=>1);
    if(count===3)assert.equal(volley.volleyActive,true);
  }
  assert.equal(volley.destination,902);
  let two=custom.startFight(784,hero(),{volleyCount:2});
  two=custom.throwPebble(custom.throwPebble(two,0,()=>1),0,()=>1);assert.equal(two.destination,903);
  const one=custom.throwPebble(custom.startFight(784,hero(),{volleyCount:1}),0,()=>1);
  assert.equal(one.enemies[1].excluded,true);assert.notEqual(one.enemies[0].excluded,true);
});
