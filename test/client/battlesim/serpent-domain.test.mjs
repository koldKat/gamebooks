import test from 'node:test';
import assert from 'node:assert/strict';
import { newSerpentCharacter, SERPENT_FIGHTS, serpentDefence, startSerpentFight,
  serpentRound, resolveSerpentAction, fleeSerpentFight, cancelSerpentFight,
  serpentSeaCheck, javelinSnakesCheck, burnedHordeCheck }
  from '../../../public/js/battlesim/engines/fabled-lands/serpent-domain.js';

const rolls = (...values) => () => {
  assert.ok(values.length, 'Unexpected roll');
  return values.shift();
};
const character = overrides => ({...newSerpentCharacter(), ...overrides});
const start = (section, overrides = {}, options = {}, roll) =>
  startSerpentFight(SERPENT_FIGHTS.find(f => f.section === section), character(overrides), options, roll);
const attacks = fight => fight.events.filter(e => e.kind === 'attack');

test('base Defence excludes weapons; fight changes never mutate the supplied character', () => {
  const c = character({combat:16, armour:3});
  assert.equal(serpentDefence(c), 19);
  const before = structuredClone(c);
  const f = startSerpentFight(SERPENT_FIGHTS.find(f => f.section === 688), c);
  assert.equal(f.character.baseCombat, 8);
  assert.equal(f.character.combat, 15);
  assert.equal(f.defence, 18);
  assert.deepEqual(c, before);
  assert.equal(cancelSerpentFight(f).destination, null);
});

test('Crazed Vim grants two physical attacks and doubles physical combat damage only', () => {
  const f = serpentRound(start(15, {combat:1, baseCombat:1, crazedVim:true}), {}, rolls(1,1,1,1,6,6));
  assert.equal(attacks(f).filter(e => e.direction === 'player').length, 2);
  assert.equal(attacks(f).at(-1).damage, 26);
  const spirit = serpentRound(start(876, {nahual:1, crazedVim:true}), {}, rolls(1,1,6,6));
  assert.equal(attacks(spirit).length, 2);
  assert.equal(attacks(spirit).at(-1).damage, 11);
});

test('Obfuscation is consumed at entry but waits for damage, not a missed attack', () => {
  const original = start(15, {obfuscation:true}, {obfuscationUse:true});
  assert.equal(original.character.obfuscation, false);
  const missed = serpentRound(original, {}, rolls(1,1,1,1));
  assert.equal(missed.obfuscationReady, true);
  const hit = serpentRound(missed, {}, rolls(1,1,6,6));
  assert.equal(hit.obfuscationReady, false);
  assert.equal(hit.character.stamina, 30);
  assert.equal(original.rounds, 0);
});

test('Clarity uses three player dice or one enemy die for one spiritual attack', () => {
  const player = serpentRound(start(876, {clarity:true, nahual:1}), {clarity:'player'}, rolls(1,2,3,1,1));
  assert.equal(attacks(player)[0].dice, 6);
  assert.equal(player.character.clarity, false);
  const enemy = serpentRound(start(876, {clarity:true, nahual:1}), {clarity:'enemy'}, rolls(1,1,6));
  assert.equal(attacks(enemy)[1].dice, 6);
  assert.throws(() => serpentRound(start(15, {clarity:true}), {clarity:'player'}), RangeError);
});

test('Shima curse expires after the first player throw, including a blessed reroll', () => {
  const f = serpentRound(start(15, {shimasCurse:true, combatBlessing:true}),
    {combatBlessing:true}, rolls(1,1,3,3,1,1));
  assert.equal(attacks(f)[0].total, 15);
  assert.equal(f.character.shimasCurse, false);
  assert.equal(f.character.combatBlessing, false);
});

test('ghoul odour hurts on misses and priests ignore failed fear checks', () => {
  const f = startSerpentFight(SERPENT_FIGHTS.find(f => f.section === 29),
    {...newSerpentCharacter('priest'), combat:1}, {}, rolls(1,1));
  assert.equal(f.combatPenalty, 0);
  const next = serpentRound(f, {}, rolls(1,1,1,1));
  assert.equal(attacks(next).at(-1).damage, 1);
  assert.equal(next.character.stamina, 29);
});

test('Baron protection lasts through a missed player attack and consumes only on a hit', () => {
  const f = start(1128);
  f.negateNextHit = true;
  const missed = serpentRound(f, {}, rolls(1,1,1,1,6));
  assert.equal(missed.negateNextHit, true);
  missed.character.combat = 20;
  const hit = serpentRound(missed, {}, rolls(6,6,1,1,6));
  assert.equal(hit.negateNextHit, false);
  assert.equal(hit.enemies[0].stamina, 42);
});

test('blowgun fires even on the killing round, but not in the alternate encounter', () => {
  const f = start(668, {combat:30});
  f.enemies[0].stamina = 1;
  const killed = serpentRound(f, {}, rolls(6,6,2,3));
  assert.equal(killed.status, 'win');
  assert.equal(killed.character.stamina, 25);
  const alternate = start(864, {combat:30});
  alternate.enemies[0].stamina = 1;
  assert.equal(serpentRound(alternate, {}, rolls(6,6)).character.stamina, 30);
});

test('Nyar interruptions preserve wounds and round count, and cannot repeat', () => {
  const round = serpentRound(start(1196, {combat:1, baseCombat:1, stamina:100, staminaInitial:100}), {}, rolls(1,1,1,1));
  assert.equal(round.pendingAction, 'nyarTrackers');
  assert.throws(() => serpentRound(round), RangeError);
  const next = resolveSerpentAction(round, {}, rolls(1));
  assert.equal(next.rounds, 1);
  assert.equal(next.character.stamina, round.character.stamina);
  assert.equal(next.combatPenalty, 4);
  assert.equal(next.nyarActionResolved, true);
  assert.equal(serpentRound(next, {}, rolls(1,1,1,1)).pendingAction, null);
});

test('Nyar fatal poison bypasses Guise but disease blessing is consumed for protection', () => {
  const f = start(642, {guise:true});
  f.pendingAction = 'nyarWarrior';
  const fatal = resolveSerpentAction(f, {}, rolls(1));
  assert.equal(fatal.status, 'loss');
  f.character.diseaseBlessing = true;
  const protectedFight = resolveSerpentAction(f, {}, rolls(1));
  assert.equal(protectedFight.status, 'fighting');
  assert.equal(protectedFight.character.diseaseBlessing, false);
  assert.equal(f.character.diseaseBlessing, true);
});

test('standalone Nyar continuation preserves the nut bonus and current wounds without healing twice', () => {
  const f = start(988, {}, {nyarNut:true,enemyDamage:4});
  assert.equal(f.enemies[0].combat, 13);
  assert.equal(f.enemies[0].stamina, 16);
  assert.equal(f.enemies[0].defence, 16);
  assert.throws(() => start(642, {}, {nyarNut:true}), RangeError);
});

test('Grim escape uses penalized base magic, and declining does not offer it again', () => {
  const f = start(779, {stamina:6, magic:30, baseMagic:9}, {mentalPenalty:true, applyEntry:false});
  assert.equal(f.pendingAction, 'grimEscape');
  const escaped = resolveSerpentAction(f, {escape:true}, rolls(4,4));
  assert.equal(escaped.destination, 8);
  const declined = resolveSerpentAction(f);
  assert.equal(declined.pendingAction, null);
  assert.equal(declined.grimEscapeOffered, true);
  assert.equal(declined.character.baseMagic, 9);
});

test('lightning birds ignore metal armour and require a flint knife for victory', () => {
  const f = start(802, {combat:30, armour:4, metalArmour:4});
  assert.equal(f.defence, 16);
  f.enemies[0].stamina = 1;
  const escaped = serpentRound(f, {}, rolls(6,6,1,1,1,1));
  assert.equal(escaped.status, 'fled');
  assert.equal(escaped.destination, 332);
  const knife = start(802, {combat:30}, {flintKnife:true});
  knife.enemies[0].stamina = 1;
  assert.equal(serpentRound(knife, {}, rolls(6,6)).destination, 1015);
});

test('nonfatal defeat, sequential opponents and voluntary escape keep their distinct outcomes', () => {
  const lost = serpentRound(start(1194, {combat:1, baseCombat:1, stamina:1}), {}, rolls(1,1,6,6));
  assert.equal(lost.destination, 577);
  assert.equal(lost.character.stamina, 1);
  const soldiers = start(3, {combat:30});
  soldiers.enemies[0].stamina = 1;
  const next = serpentRound(soldiers, {}, rolls(6,6));
  assert.equal(next.target, 1);
  assert.equal(attacks(next).length, 1);
  assert.equal(fleeSerpentFight(start(831), rolls(2,3)).character.stamina, 25);
  assert.throws(() => fleeSerpentFight(start(513, {frenziedMight:true})), RangeError);
});

test('storm thresholds, crew bonuses and blessing destinations match each printed route', () => {
  assert.equal(serpentSeaCheck(252, character(), {}, rolls(6)).destination, 364);
  assert.equal(serpentSeaCheck(252, character(), {crew:'excellent'}, rolls(6)).destination, 1191);
  assert.equal(serpentSeaCheck(268, character(), {ship:'brigantine'}, rolls(5,6)).destination, 159);
  assert.equal(serpentSeaCheck(499, character(), {}, rolls(6)).destination, 89);
  const c = character({stormsBlessing:true});
  const blessed = serpentSeaCheck(252, c, {safetyFromStorms:true});
  assert.equal(blessed.destination, 592);
  assert.equal(blessed.character.stormsBlessing, false);
  assert.equal(c.stormsBlessing, true);
  assert.throws(() => serpentSeaCheck(965, c, {safetyFromStorms:true}), RangeError);
});

test('boarding uses profession and rank thresholds, not the ordinary naval formula', () => {
  const board = serpentSeaCheck(55, character({rank:10}), {crew:'excellent'}, rolls(2,3));
  assert.equal(board.total, 11);
  assert.equal(board.destination, 1128);
  assert.equal(board.status, 'story');
  const victory = serpentSeaCheck(875, character({rank:8}), {}, rolls(3,3));
  assert.equal(victory.destination, 569);
  assert.equal(victory.status, 'win');
  const naval = serpentSeaCheck(945, character(), {crew:'good'}, rolls(1,2,3));
  assert.equal(naval.total, 15);
  assert.equal(naval.destination, 727);
});

test('shipwreck checks drown on failed Rank rolls and apply injury without Crazed Vim doubling', () => {
  const failed = serpentSeaCheck(303, character(), {}, rolls(4,4));
  assert.equal(failed.character.stamina, 0);
  assert.equal(failed.destination, 99);
  const survived = serpentSeaCheck(364, character({crazedVim:true}), {}, rolls(3,4,2,3));
  assert.equal(survived.character.stamina, 25);
  assert.equal(survived.destination, 559);
  assert.equal(serpentSeaCheck(857, character({guise:true}), {}, rolls(3,4)).destination, 222);
});

test('escape adds empty-hold and excellent-crew bonuses; deliberate tempest uses only two dice', () => {
  const escaped = serpentSeaCheck(409, character(), {emptyCargo:true, crew:'excellent'}, rolls(4,5));
  assert.equal(escaped.destination, 894);
  assert.equal(serpentSeaCheck(970, character(), {}, rolls(5,5)).destination, 352);
  const storm = serpentSeaCheck(965, character(), {ship:'galleon',crew:'excellent'}, rolls(4,4));
  assert.equal(storm.total, 10);
  assert.equal(storm.destination, 640);
});

test('javelin snakes make one attack without an invented enemy health pool', () => {
  const c = character({armour:4,heatArmour:3});
  const hit = javelinSnakesCheck(c, {}, rolls(3,4));
  assert.equal(hit.defence, 17);
  assert.equal(hit.damage, 6);
  assert.equal(hit.destination, 821);
  assert.equal(c.stamina, 30);
  const protectedHit = javelinSnakesCheck(character({obfuscation:true}), {obfuscationUse:true}, rolls(6,6));
  assert.equal(protectedHit.destination, 694);
  assert.equal(protectedHit.character.obfuscation, false);
});

test('mirrored rage copies spiritual equipment and maximum stamina but not the circlet', () => {
  const f = start(457, {nahual:5,spiritualWeapon:3,baseMagic:9,spiritualArmour:2,
    pacharaCirclet:true,staminaInitial:50});
  assert.equal(f.enemies[0].combat, 8);
  assert.equal(f.enemies[0].defence, 16);
  assert.equal(f.enemies[0].stamina, 50);
  assert.equal(f.defence, 18);
});

test('constables interrupt after four rounds without an invented kill', () => {
  let f = start(991, {combat:1,baseCombat:1,guise:true});
  for (let i=0;i<4;i++) f=serpentRound(f, {}, rolls(1,1,1,1));
  assert.equal(f.status, 'win');
  assert.equal(f.destination, 42);
  assert.equal(f.enemies[0].stamina, 15);
});

test('Burned Ones checks use compatible COMBAT equipment and entry injury is not repeated', () => {
  const success = burnedHordeCheck(character({combat:16,spiritualCombatBonus:7,nahual:1}), {}, rolls(1,1,1,1,1));
  assert.equal(success.total, 18);
  assert.equal(success.status, 'continue');
  const win = burnedHordeCheck(character({spiritualCombatBonus:7,nahual:1}), {}, rolls(2,2));
  assert.equal(win.total, 20);
  assert.equal(win.destination, 267);
  const hurt = burnedHordeCheck(character({baseCombat:1}), {applyEntry:true}, rolls(1,1,1,2,3));
  assert.equal(hurt.damage, 12);
  assert.equal(hurt.character.stamina, 18);
  const retry = burnedHordeCheck(hurt.character, {}, rolls(1,1,1,2,3));
  assert.equal(retry.damage, 6);
  assert.equal(retry.character.stamina, 12);
});

test('rat poison bonus does not consume a dose and Namagal takes the first physical attack', () => {
  const f = start(1014, {ratPoison:1}, {ratPoison:true});
  assert.equal(f.attackModifier, 3);
  assert.equal(f.character.ratPoison, 1);
  const namagal = serpentRound(start(966, {guise:true}), {}, rolls(1,1,1,1));
  assert.equal(attacks(namagal)[0].direction, 'enemy');
});
