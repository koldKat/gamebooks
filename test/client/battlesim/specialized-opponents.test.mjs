import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(644);
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startLaregodFight, laregodRound } from '../../../public/js/battlesim/engines/laregod-house/core.js';
import { newSixActionsCharacter, startSixActionsFight, sixActionsRound } from '../../../public/js/battlesim/engines/six-actions/core.js';
import { newFreewayCharacter, startFreewayFight, freewayRound } from '../../../public/js/battlesim/engines/freeway-fighter/core.js';
import { newValleyCharacter, newCrownCharacter } from '../../../public/js/battlesim/engines/legendary-kingdoms/character.js';
import { startCustomLegendaryFight } from '../../../public/js/battlesim/engines/legendary-kingdoms/opponents.js';
import { PLAYER_DEFAULTS } from '../../../public/js/battlesim/books/700/definition.js';
import { startUnarmedFight, startShootingFight, convertShootingToUnarmed } from '../../../public/js/battlesim/books/700/combat.js';

test('manual Laregod points and current endurance use its original round resolver', () => {
  const fight=startLaregodFight('manual',{opponents:[{displayName:'Manual enemy',points:1,endurance:1,playerPoints:100,playerEndurance:4}]},()=>1);
  const result=laregodRound(fight,{},()=>1);
  assert.equal(result.fight.status,'win');
  assert.equal(result.fight.player.endurance,4);
  assert.equal(fight.enemy.endurance,1);
});

test('custom Six Actions combat retains wounds and ammunition instead of inventing HP', () => {
  const character=newSixActionsCharacter({wounds:1,bombs:3,grenades:2});
  const fight=startSixActionsFight(character,0,{opponents:[{displayName:'Manual group',playerThreshold:1,enemyThreshold:13,enemies:1,killsPerHit:1,modifier:0}]});
  const result=sixActionsRound(fight,{},()=>1);
  assert.equal(result.fight.status,'win');
  assert.equal(result.fight.character.wounds,1);
  assert.equal(result.fight.character.grenades,2);
  assert.equal(result.fight.enemies,undefined);
  assert.ok(!result.fight.section);
});

test('Freeway custom hand, shooting and vehicle fights retain separate damage rules', () => {
  for(const kind of ['hand','shoot','vehicle']){
    const character=newFreewayCharacter(()=>6),before=structuredClone(character);
    const fight=startFreewayFight(character,0,{kind,opponents:[{displayName:'Custom enemy',attack:0,health:1}]});
    const result=freewayRound(fight,{},()=>1);
    assert.equal(result.fight.status,'win');
    assert.equal(result.fight.enemies[0].displayName,'Custom enemy');
    assert.deepEqual(character,before);
    assert.equal(result.fight.config.kind,kind);
    assert.equal(result.fight.section,null);
  }
});

test('both Legendary Kingdoms party systems accept distinct custom opponents', () => {
  for(const create of [newValleyCharacter,newCrownCharacter]){
    const party=[create('jessica')],before=structuredClone(party);
    const fight=startCustomLegendaryFight(party,{opponents:[
      {displayName:'First',attack:1,threshold:4,defence:3,health:5},
      {displayName:'Second',attack:2,threshold:5,defence:4,health:6},
    ]});
    assert.deepEqual(fight.enemies.map(e=>e.name),['First','Second']);
    assert.equal(fight.rules.custom,true);
    assert.equal(fight.rules.win,undefined);
    assert.deepEqual(party,before);
  }
});

test('Money and Gangsters custom melee and shooting keep separate complete stats', () => {
  const player={...PLAYER_DEFAULTS},before=structuredClone(player);
  const melee={displayName:'Manual fighter',aggression:2,skillCode:3,strength:4,dexterity:5,speed:6,damageCode:7,weaponCode:0,endurance:12};
  const unarmed=startUnarmedFight(player,0,{opponents:[melee]});
  assert.equal(unarmed.enemy.endurance,12);
  assert.deepEqual(unarmed.returnRoutes,{});
  const shooting=startShootingFight(player,0,{terrain:2,playerCover:0,weapon:{power:2,range:3,weight:1},
    opponents:[{displayName:'Manual gunfighter',aggression:2,skillCode:3,effectiveFire:4,weaponPower:2,strength:4,dexterity:5,speed:6,cover:2,distance:3}]});
  assert.equal(shooting.terrain,2);
  assert.equal(shooting.opponents[0].displayName,'Manual gunfighter');
  shooting.pending={kind:'conversion'};
  const converted=convertShootingToUnarmed(shooting,[melee]);
  assert.equal(converted.enemy.displayName,'Manual fighter');
  assert.equal(converted.origin,0);
  assert.ok(!converted.returnRoutes.win);
  assert.deepEqual(player,before);
  assert.throws(()=>startUnarmedFight(player,0,{opponents:[{...melee,endurance:0}]}));
  assert.throws(()=>startShootingFight(player,0,{terrain:5,opponents:[melee]}));
});
