import assert from 'node:assert/strict';
import test from 'node:test';
import {kingfisherAction, kingfisherTurnGroup, kingfisherWeaponAvailable, startKingfisherFight}
  from '../../../public/js/battlesim/engines/kingfisher/core.js';

const rules = {hitMinimum:5, initiativeMinimum:4};

function start(encounter, player = {}) {
  return startKingfisherFight({hp:30, maxHp:30, ...player}, {
    name:'Encounter', firstAttack:'enemy', defeatSection:13, ...encounter,
  }, {}, rules);
}

function attack(fight, dice, weaponIndex = 0) {
  return kingfisherAction(fight, {kind:'attack', dice, weaponIndex, expectedRevision:fight.revision});
}

test('a missed opening attack does not consume the first successful hit bonus', () => {
  const opponent = {name:'Opponent', hp:60, bonus:5, firstSuccessfulHitBonus:8};
  let fight = start({profiles:[opponent]});
  fight = attack(fight, [1,1]);
  fight = attack(fight, [1,1]);
  fight = attack(fight, [2,3]);
  assert.equal(fight.player.hp, 17);
  fight = attack(fight, [1,1]);
  fight = attack(fight, [2,3]);
  assert.equal(fight.player.hp, 7);
});

test('a single-use thrown weapon is spent even when it misses', () => {
  const opponent = {name:'Guard', hp:50, weapons:[
    {name:'Tray of slops', bonus:6, type:'thrown', uses:1},
    {name:'Sword', bonus:4, type:'melee'},
  ]};
  let fight = start({profiles:[opponent]});
  fight = attack(fight, [1,1]);
  assert.equal(kingfisherWeaponAvailable(fight.groups[0].weapons[0]), false);
  assert.equal(kingfisherWeaponAvailable(fight.groups[0].weapons[1]), true);
  fight = attack(fight, [1,1]);
  assert.throws(() => attack(fight, [2,3]), RangeError);
  assert.equal(attack(fight, [2,3], 1).player.hp, 21);
});

test('nonfatal enemy and player thresholds use their own destinations and exclude zero LP', () => {
  const encounter = {profiles:[{name:'Worker', hp:15}], firstAttack:'player',
    enemyStopBelow:10, playerStopBelow:10, winSection:6, enemyKilledSection:47, playerNonfatalLossSection:95};
  let fight = start(encounter);
  fight = attack(fight, [2,3]);
  assert.equal(fight.status, 'fighting', 'Exactly ten is still in the fight');
  fight = attack(fight, [1,1]);
  fight = attack(fight, [2,3]);
  assert.equal(fight.groups[0].currentHp, 5);
  assert.equal(fight.destination, '6');
  assert.equal(start(encounter).groups[0].currentHp, 15);
  assert.equal(attack(start(encounter, {meleeBonus:20}), [2,3]).destination, '47');

  const enemyFirst = {...encounter, firstAttack:'enemy'};
  assert.equal(attack(start(enemyFirst, {hp:15}), [2,3]).status, 'fighting');
  assert.equal(attack(start(enemyFirst, {hp:14}), [2,3]).destination, '95');
  assert.equal(attack(start(enemyFirst, {hp:5}), [2,3]).destination, '13');
});

test('a pre-fight punch subtracts its fixed damage and a training fall only ends that duel', () => {
  const opponent = {name:'Opponent', hp:20, count:2, openingDamage:5};
  let fight = start({profiles:[opponent], firstAttack:'player', enemyStopBelow:11,
    nonfatalEndsCurrentDuel:true, winSection:61});
  assert.equal(fight.groups[0].currentHp, 15);
  fight = attack(fight, [2,3]);
  assert.equal(fight.groups[0].remaining, 1);
  assert.equal(fight.groups[0].currentHp, 20);
  assert.equal(fight.status, 'fighting');
});

test('the heel strike needs an unmodified double six and no fabricated enemy Life Points', () => {
  const encounter = {profiles:[{name:'Achilles', hp:null}], firstAttack:'player', onlyPlayerNaturalScore:12, winSection:79};
  let fight = start(encounter, {meleeBonus:100, playerRollModifier:5});
  fight = attack(fight, [5,6]);
  assert.equal(fight.groups[0].hpUnstated, true);
  assert.equal(fight.events.at(-1).amount, 0);
  fight = attack(fight, [1,1]);
  assert.equal(attack(fight, [6,6]).destination, '79');
});

test('wrestling alternates printed attacks with falls, submission, or a fatal roll', () => {
  const encounter = {profiles:[{name:'Spartan child', hp:null, bonus:3}], unarmedOnly:true,
    playerWrestlingRoll:true, fallsToWin:3, winSection:61};
  let fight = start(encounter);
  for (const roll of [[3,3], [4,4], [4,5]]) {
    fight = attack(fight, [1,1]);
    fight = attack(fight, roll);
  }
  assert.equal(fight.wrestlingFalls, 3);
  assert.equal(fight.destination, '61');
  assert.equal(fight.status, 'win');
  assert.equal(fight.groups[0].remaining, 0);
  assert.equal(attack(attack(start(encounter), [1,1]), [4,6]).destination, '61');
  assert.equal(attack(attack(start(encounter), [1,1]), [1,1]).destination, '13');
});

test('the first duel is unarmed and the fallen opponent’s weapon is optional after that', () => {
  const encounter = {profiles:[{name:'Brother', hp:5, count:4}], firstAttack:'player',
    firstDuelUnarmed:true, lootedWeaponBonus:4};
  let fight = start(encounter, {weapon:'bow', ammo:3, meleeBonus:100});
  const act = (state, action) => kingfisherAction(state, {...action, expectedRevision:state.revision});
  assert.equal(fight.player.weapon, 'melee');
  assert.throws(() => act(fight, {kind:'takeWeapon'}), RangeError);
  fight = attack(fight, [2,3]);
  assert.equal(fight.events.at(-1).amount, 5);
  assert.equal(fight.groups[0].remaining, 3);
  const armed = act(fight, {kind:'takeWeapon'});
  assert.equal(armed.player.meleeBonus, 4);
  assert.throws(() => act(armed, {kind:'takeWeapon'}), RangeError);
});

test('both named opponents take their printed opening attacks in order', () => {
  const encounter = {opponentsOpenTogether:true, profiles:[
    {name:'Sophocles', hp:50, bonus:4},
    {name:'Plato', hp:35, bonus:2},
  ]};
  let fight = start(encounter);
  assert.equal(kingfisherTurnGroup(fight).name, 'Sophocles');
  fight = attack(fight, [2,3]);
  assert.equal(fight.player.hp, 21);
  assert.equal(fight.phase, 'enemy');
  assert.equal(kingfisherTurnGroup(fight).name, 'Plato');
  fight = attack(fight, [2,3]);
  assert.equal(fight.player.hp, 14);
  assert.equal(fight.phase, 'player');
});

test('each remaining member of a simultaneous group attacks after a player turn', () => {
  const encounter = {firstAttack:'player', simultaneousOpponents:true,
    profiles:[{name:'Field worker', hp:15, bonus:2, count:5}]};
  let fight = start(encounter, {meleeBonus:10});
  fight = attack(fight, [2,3]);
  assert.equal(fight.groups[0].remaining, 4);
  for (let n = 0; n < 4; n++) {
    assert.equal(fight.phase, 'enemy');
    fight = attack(fight, [1,1]);
  }
  assert.equal(fight.phase, 'player');
  assert.deepEqual(fight.enemyTurn, []);
});

test('Greek Fire spends one jar to defeat one ordinary opponent and respects printed exceptions', () => {
  const act = fight => kingfisherAction(fight, {kind:'greekFire', expectedRevision:fight.revision});
  const opponent = {name:'Opponent', hp:80, count:2};
  const fight = act(start({firstAttack:'player', profiles:[opponent]}, {greekFireUses:1}));
  assert.equal(fight.player.greekFireUses, 0);
  assert.equal(fight.groups[0].remaining, 1);
  assert.throws(() => act(fight), RangeError);
  assert.throws(() => act(start({firstAttack:'player', onlyPlayerNaturalScore:12, profiles:[opponent]}, {greekFireUses:1})), RangeError);
});

test('an optional ally can attack once per turn, take enemy damage and spend her own medicine', () => {
  const encounter = {name:'Guard', profiles:[{name:'Guard', hp:50, bonus:2, armour:1}],
    firstAttack:'player', defeatSection:13};
  const withAlly = {...rules, ally:{name:'Maenad', maxHp:40, bonus:4, medicineMax:3}};
  let fight = startKingfisherFight({hp:30,maxHp:30,allyHp:38,allyMedicine:3,potionUses:1}, encounter, {}, withAlly);
  const step = (state, action) => kingfisherAction(state, {expectedRevision:state.revision, ...action});
  const allyAttack = {kind:'allyAttack', dice:[2,3]};

  fight = step(fight, allyAttack);
  assert.equal(fight.groups[0].currentHp, 42);
  assert.throws(() => step(fight, allyAttack), RangeError);
  fight = attack(fight, [1,1]);
  fight = step(fight, {kind:'attack', dice:[2,3], target:'ally'});
  assert.equal(fight.player.hp, 30);
  assert.equal(fight.player.allyHp, 31);
  assert.equal(fight.events.at(-1).target, 'Maenad');
  fight = step(fight, {kind:'allyMedicine', dice:[6,6]});
  assert.equal(fight.player.allyHp, 40);
  assert.equal(fight.player.allyMedicine, 2);
  assert.equal(fight.player.potionUses, 1);
  fight = step(fight, allyAttack);
  assert.equal(fight.groups[0].currentHp, 34);

  const alone = startKingfisherFight({hp:30,maxHp:30}, encounter, {}, withAlly);
  assert.throws(() => step(alone, allyAttack), RangeError);
  const bout = startKingfisherFight({hp:30,maxHp:30,allyHp:40}, {...encounter, unarmedOnly:true}, {}, withAlly);
  assert.throws(() => step(bout, allyAttack), RangeError);
});

test('a printed retreat is available before attacks and leaves the story up to the reader', () => {
  const encounter = {firstAttack:'player', optionalRetreatSection:61, profiles:[{name:'Worker', hp:15}]};
  const fight = start(encounter);
  const retreat = state => kingfisherAction(state, {kind:'retreat', expectedRevision:state.revision});
  assert.equal(retreat(fight).status, 'fled');
  assert.equal(retreat(fight).destination, '61');
  assert.throws(() => retreat(attack(fight, [1,1])), RangeError);
});
