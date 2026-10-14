import test from 'node:test';
import assert from 'node:assert/strict';
import { CROWN_NAVAL, startCrownNaval, CROWN_ARMIES, startCrownArmy } from '../../../public/js/battlesim/engines/legendary-kingdoms/crown-strategy.js';
import { legendaryArmyStep, legendaryArmyChooseScheduled } from '../../../public/js/battlesim/engines/legendary-kingdoms/army.js';
import { legendaryNavalAttack, legendaryWarpWood, legendaryTilt, legendarySurrenderCargo }
  from '../../../public/js/battlesim/engines/legendary-kingdoms/naval.js';

const ship = () => ({name:'Player ship',fighting:4,health:20,cargo:['Spices','Grain']});
const army = (garrison,type = 'infantry',strength = 3) => [0,1,2].map(index => [
  {name:'Unit '+index,garrison,type,strength,morale:4},
]);

test('Crown army catalog retains all seven source formations and requires explicit troop data', () => {
  assert.deepEqual(Object.keys(CROWN_ARMIES).map(Number),[145,196,349,532,545,705,1114]);
  for (const section of Object.keys(CROWN_ARMIES).map(Number))
    assert.equal(startCrownArmy(army(CROWN_ARMIES[section].garrison),section).rules.section,section);
  assert.throws(() => startCrownArmy(army('highpoint'),145), /garrison/);
  assert.throws(() => startCrownArmy(army('beverstone','unknown'),145), /troop types/);
});

test('Street battle keeps front and support independent and requires clearing both before a zone is won', () => {
  const original = army('fosterly','infantry',10).map((row,index) => [row[0],
    {...row[0],name:'Support '+index},
  ]);
  let fight = startCrownArmy(original,196);
  const winning = () => {const dice = [1,6,6];return () => dice.shift();};
  fight = legendaryArmyStep(fight,winning());
  assert.equal(fight.zone,0);assert.equal(fight.position,1);
  assert.equal(fight.enemy[0][0],null);
  assert.equal(fight.enemy[0][1].name,'Harbourward netters');
  assert.equal(fight.status,'active');
  fight = legendaryArmyStep(JSON.parse(JSON.stringify(fight)),winning());
  assert.deepEqual(fight.enemy[0],[null,null]);
  assert.equal(fight.zone,1);assert.equal(fight.position,0);
  assert.equal(fight.log[1].position,1);
  fight = legendaryArmyStep(fight,winning());
  fight = legendaryArmyStep(fight,winning());
  assert.equal(fight.status,'won');assert.equal(fight.destination,402);
  assert.equal(fight.routed.enemy.length,6);
  assert.equal(original[0][0].strength,10);
  assert.equal(original[0][1].name,'Support 0');
});

test('Two contested street zones cause defeat instead of promoting support into the wrong fight', () => {
  let fight = startCrownArmy(army('fosterly','infantry',10),196);
  const winning = () => {const dice = [1,6,6];return () => dice.shift();};
  fight = legendaryArmyStep(fight,winning());
  assert.equal(fight.status,'active');
  fight = legendaryArmyStep(fight,() => {throw new Error('No paired troops in contested support line');});
  assert.equal(fight.zone,1);
  fight = legendaryArmyStep(fight,winning());
  assert.equal(fight.status,'lost');assert.equal(fight.destination,354);
  assert.equal(fight.routed.player.length,3);
});

test('Walter waits for a player-chosen front or support target exactly once in each of his two rounds', () => {
  let fight = startCrownArmy(army('brightsands'),545);
  fight = legendaryArmyStep(fight,() => {throw new Error('No dice before choosing Walter target');});
  assert.equal(fight.pendingArmySpell.effect,'enfeeblement');
  fight = legendaryArmyChooseScheduled(JSON.parse(JSON.stringify(fight)),2,1);
  assert.equal(fight.enemy[2][1].strength,2);
  assert.throws(() => legendaryArmyChooseScheduled(fight,0));
  fight = legendaryArmyStep(fight,() => 1);
  assert.equal(fight.zone,1);
  assert.equal(fight.log.at(-1).playerScore,5);
  fight.round = 2;fight.zone = 0;
  fight = legendaryArmyStep(fight);
  assert.equal(fight.pendingArmySpell.effect,'clingingDread');
  fight = legendaryArmyChooseScheduled(fight,0,0);
  assert.equal(fight.enemy[0][0].morale,4);
});

test('Defending cavalry loses strength and charge; missile troops counter Death Ravens in the open field', () => {
  const horse = army('brightsands','cavalry');horse[0][0].firstRoundBonus = 1;
  let siege = legendaryArmyStep(startCrownArmy(horse,545));
  siege = legendaryArmyChooseScheduled(siege,1,1);
  siege = legendaryArmyStep(siege,() => 1);
  assert.equal(siege.log.at(-1).playerScore,3);
  assert.equal(horse[0][0].strength,3);
  let field = legendaryArmyStep(startCrownArmy(army('brightsands','missile'),705));
  field = legendaryArmyChooseScheduled(field,1,1);
  field.enemy[0].shift();
  field = legendaryArmyStep(field,() => 1);
  assert.equal(field.log.at(-1).playerScore,6);
});

test('Pikemen counter cavalry and climbing penalizes flanks but not Longbowmen or the ram', () => {
  let fight = startCrownArmy(army('beverstone','cavalry'),145);
  fight.zone = 1;
  fight = legendaryArmyStep(fight,() => 1);
  assert.equal(fight.log.at(-1).enemyScore,5);
  assert.equal(fight.log.at(-1).playerScore,4);
  const foot = legendaryArmyStep(startCrownArmy(army('beverstone'),349),() => 1);
  const bow = legendaryArmyStep(startCrownArmy(army('beverstone','longbow'),349),() => 1);
  assert.equal(foot.log.at(-1).playerScore,3);
  assert.equal(bow.log.at(-1).playerScore,4);
  const centre = startCrownArmy(army('beverstone'),349);centre.zone = 1;
  assert.equal(legendaryArmyStep(centre,() => 1).log.at(-1).playerScore,4);
  const forbidden = army('beverstone','cavalry');forbidden[1][0].name = 'Mounted Sergeants';
  assert.throws(() => startCrownArmy(forbidden,349), /ram/);
});

test('Bailey caster follows printed round/zone order without changing source army units', () => {
  const original = army('fosterly','infantry',10);
  let fight = legendaryArmyStep(startCrownArmy(original,532),() => 1);
  assert.equal(fight.player[1][0].morale,3);
  assert.equal(fight.log[0].effect,'rout');
  assert.equal(fight.log[1].enemyScore,7);
  fight.round = 2;fight.zone = 0;
  fight = legendaryArmyStep(fight,() => 1);
  assert.equal(fight.player[2][0].strength,9);
  fight.round = 3;fight.zone = 0;
  const previous = fight.player[0][0].morale;
  fight = legendaryArmyStep(fight,() => 1);
  assert.equal(fight.player[0][0].morale,previous-1);
  assert.deepEqual(original,army('fosterly','infantry',10));
});

test('Crown ship roster preserves all five printed encounters and never substitutes fleet rules', () => {
  assert.deepEqual(Object.keys(CROWN_NAVAL).map(Number),[604,628,730,802,1053]);
  for (const section of Object.keys(CROWN_NAVAL).map(Number)) {
    const original = ship();
    const fight = startCrownNaval(original,section);
    assert.equal(fight.phase,'ship');
    assert.equal(fight.rules.section,section);
    assert.equal(fight.enemy.health,CROWN_NAVAL[section].health);
    assert.deepEqual(original,ship());
  }
  assert.throws(() => startCrownNaval(ship(),555));
});

test('Tilt reduces only the next enemy attack by two dice and shares the sea-spell action', () => {
  let fight = legendaryTilt(startCrownNaval(ship(),604));
  assert.throws(() => legendaryWarpWood(fight));
  fight = legendaryNavalAttack(fight,() => 1);
  fight = legendaryNavalAttack(fight,() => 6);
  assert.equal(fight.ship.health,15);
  assert.equal(fight.log.at(-1).dice.length,5);
  assert.equal(fight.spellUsed,false);
  fight = legendaryNavalAttack(legendaryNavalAttack(fight,() => 1),() => 6);
  assert.equal(fight.log.at(-1).dice.length,7);
  assert.equal(fight.ship.health,8);
});

test('Squid forbids both sea spells, and cargo surrender requires cargo and is not a combat victory', () => {
  const squid = startCrownNaval(ship(),730);
  assert.throws(() => legendaryTilt(squid));
  assert.throws(() => legendaryWarpWood(squid));
  const original = ship();
  const pirate = startCrownNaval(original,802);
  const surrender = legendarySurrenderCargo(pirate);
  assert.equal(surrender.status,'surrendered');
  assert.equal(surrender.destination,878);
  assert.deepEqual(surrender.ship.cargo,[]);
  assert.deepEqual(original,ship());
  assert.throws(() => legendarySurrenderCargo(startCrownNaval({...ship(),cargo:[]},802)));
  assert.throws(() => legendarySurrenderCargo(startCrownNaval(ship(),604)));
});
