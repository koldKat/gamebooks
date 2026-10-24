import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(527);
await loadFixtureRoster(528);
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDenCharacter, createDenFight } from '../../../public/js/battlesim/engines/grailquest/den-of-dragons.js';
import { createGatewayCharacter, createGatewayFight } from '../../../public/js/battlesim/engines/grailquest/gateway-of-doom.js';
import { createVoyageCharacter, createVoyageFight } from '../../../public/js/battlesim/engines/grailquest/voyage-of-terror.js';
import { createKingdomCharacter, startKingdomFight } from '../../../public/js/battlesim/engines/grailquest/kingdom-of-horror.js';
import { createRealmCharacter, startRealmFight, rollRealmRound } from '../../../public/js/battlesim/engines/grailquest/realm-of-chaos.js';
import { createTombCharacter, startTombFight, settleTombFight } from '../../../public/js/battlesim/engines/grailquest/tomb-of-nightmares.js';
import { createLegionCharacter, startLegionFight, settleLegionFight } from '../../../public/js/battlesim/engines/grailquest/legion-of-the-dead.js';

const engines = [
  [createDenCharacter, (p, id, options) => createDenFight(id, p, options)],
  [createGatewayCharacter, (p, id, options) => createGatewayFight(id, p, options)],
  [createVoyageCharacter, (p, id, options) => createVoyageFight(id, p, options)],
  [createKingdomCharacter, startKingdomFight], [createRealmCharacter, startRealmFight],
  [createTombCharacter, startTombFight], [createLegionCharacter, startLegionFight],
];

test('all Grailquest engines support distinct freeform combatants without changing characters', () => {
  const opponents = [{displayName: 'First custom foe', life: 20, hit: 6, bonus: 2, armour: 0},
    {displayName: 'Second custom foe', life: 30, hit: 4, bonus: 3, armour: 1}];
  for (const [create, start] of engines) {
    const player = {...create(), life: 40, maxLife: 40};
    const before = structuredClone(player);
    const fight = start(player, 0, {opponents});
    assert.equal(fight.spec.custom, true);
    assert.equal(fight.status, 'fighting');
    assert.deepEqual(fight.foes.map(foe => [foe.name, foe.life, foe.hit, foe.bonus, foe.armour]),
      opponents.map(foe => [foe.displayName, foe.life, foe.hit, foe.bonus, foe.armour]));
    assert.deepEqual(player, before);
    const next = start(player, 0, {opponents});
    assert.notEqual(fight.spec.id, next.spec.id, 'Custom fights must not inherit killed-enemy flags');
    assert.throws(() => start(player, 'unknown', {opponents}));
    assert.throws(() => start(player, 0, {opponents: [{...opponents[0], hit: 99}]}));
  }
});

test('repeated custom kills do not grow the permanent story-enemy ledgers', () => {
  const opponents=[{displayName:'Custom foe',life:6,hit:12,bonus:0,armour:0}];
  for(const [create,start,settle] of [[createTombCharacter,startTombFight,settleTombFight],
    [createLegionCharacter,startLegionFight,settleLegionFight]]){
    let player={...create(),life:40,maxLife:40,killed:{'printed:0':true}};
    for(let i=0;i<20;i++){
      const fight=start(player,0,{opponents,killEnemies:true},()=>.9);
      fight.foes[0].life=0;settle(fight);
      assert.equal(fight.status,'win');
      assert.deepEqual(fight.player.killed,{'printed:0':true});
      player=fight.player;
    }
  }
  let player={...createRealmCharacter(),life:40,maxLife:40,ghosts:{printed:{0:true}}};
  for(let i=0;i<20;i++){
    const fight=startRealmFight(player,0,{opponents,killEnemies:true},()=>.9);
    fight.first='player';rollRealmRound(fight,0,()=>.99);
    assert.equal(fight.status,'win');
    assert.deepEqual(fight.player.ghosts,{printed:{0:true}});
    player=fight.player;
  }
});
