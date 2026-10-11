import test from 'node:test';
import assert from 'node:assert/strict';
import { createKingdomCharacter, initialKingdomLife, kingdomStrike,
  kingdomFriendlyReaction, kingdomRunning, kingdomCourt, startKingdomFight,
  rerollKingdomInitiative, kingdomTargets, kingdomVisit, kingdomHeal,
  kingdomPlayerAttack, kingdomEnemyAttack, kingdomTryFriendly, kingdomTryBribe,
  kingdomBreakBearGrip, kingdomLeaveFight, kingdomCallGnurlbash, rollKingdomRound, kingdomCollectWitchLoot }
  from '../../../public/js/battlesim/engines/grailquest/kingdom-of-horror.js';
import { KINGDOM_ENCOUNTERS, KINGDOM_DREAMS, KINGDOM_MAGIC_STOCK,
  KINGDOM_EQUIPMENT } from '../../../public/js/battlesim/engines/grailquest/kingdom-of-horror-roster.js';

const rolls = (...values) => {
  let index = 0;
  return () => { assert.ok(index < values.length, 'Unexpected random roll'); return (values[index++] - 1) / 6; };
};
const character = extra => ({ ...createKingdomCharacter(), life: 40, maxLife: 48, ...extra });

test('The bear grip must be escaped before attacks; failures cost exactly six LIFE', () => {
  const f = startKingdomFight(character(), 82, {}, rolls());
  assert.equal(kingdomEnemyAttack(f, rolls()), null);
  assert.equal(kingdomPlayerAttack(f, 0, rolls()), null);
  assert.equal(rollKingdomRound(f, 0, rolls()), null);
  assert.equal(kingdomBreakBearGrip(f, rolls(3, 3)).damage, 6);
  assert.equal(f.player.life, 34);
  assert.equal(kingdomBreakBearGrip(f, rolls(4, 3)).freed, true);
  assert.equal(kingdomEnemyAttack(f, rolls(1, 1)).damage, 0);
});

test('Guard groups receive only one opening strike, not one for every guard', () => {
  const f = startKingdomFight(character(), 119, {}, rolls(3, 3));
  assert.equal(f.foes.length, 6);
  kingdomEnemyAttack(f, rolls(1, 1));
  assert.equal(f.active, 'player');
  assert.equal(kingdomEnemyAttack(f, rolls()), null);
  kingdomPlayerAttack(f, 0, rolls(1, 1));
  assert.equal(f.roundStarted, false);
  kingdomEnemyAttack(f, rolls(1, 1));
  assert.equal(f.active, 'enemy');
});

test('Running and retreat do not invent enemy deaths or book experience', () => {
  const f = startKingdomFight(character(), 17, {}, rolls(6, 6, 1, 1));
  const result = kingdomLeaveFight(f, 'run', rolls(4));
  assert.equal(result.destination, 76);
  assert.equal(f.status, 'avoided');
  assert.equal(f.foes[0].life, 55);
  assert.equal(f.player.experience, 0);
  const fatal = startKingdomFight(character(), 17, {}, rolls(6, 6, 1, 1));
  kingdomLeaveFight(fatal, 'run', rolls(1));
  assert.deepEqual([fatal.status, fatal.player.life], ['loss', 0]);
});

test('Barbarian surrender removes equipment while preserving EJ and magical items', () => {
  const p = character({ armour: 2, potions: 6, salves: 6, rations: 7,
    equipment: ['breastplate'], magic: { fireball: 1 } });
  const f = startKingdomFight(p, 19, {}, rolls(6, 6, 1, 1));
  kingdomLeaveFight(f, 'surrender', rolls());
  assert.deepEqual([f.player.armour, f.player.potions, f.player.salves, f.player.rations], [0, 0, 0, 0]);
  assert.equal(f.player.weapon, 'ej');
  assert.deepEqual(f.player.magic, { fireball: 1 });
  assert.equal(p.potions, 6);
});

test('Gnurlbash is called once, adds a source-stat companion and expires with its selected foe', () => {
  const f = startKingdomFight(character({ gnurlbash: true }), 16, {}, rolls(6, 6, 1, 1));
  assert.equal(kingdomCallGnurlbash(f, 1), true);
  assert.equal(kingdomCallGnurlbash(f, 1), false);
  assert.deepEqual([f.ally.life, f.ally.bonus, f.ally.target], [30, 2, 1]);
  kingdomPlayerAttack(f, 0, rolls(1, 1, 6, 6));
  assert.equal(f.foes[1].life, 12);
  assert.equal(f.player.gnurlbash, false);
});

test('The optional rear half-LIFE rule never changes original roster or trial placeholders', () => {
  const f = startKingdomFight(character(), 17, { halfEnemyLife: true }, rolls(6, 6, 1, 1));
  assert.equal(f.foes[0].life, 28);
  assert.equal(KINGDOM_ENCOUNTERS.find(row => row.id === 17).enemies[0].life, 55);
  const trial = startKingdomFight(character(), 131, { halfEnemyLife: true }, rolls(6, 6, 1, 1));
  assert.equal(trial.foes[0].life, null);
});

test('Twenty book victories increment permanent LIFE exactly once', () => {
  const f = startKingdomFight(character({ experience: 19 }), 46, {}, rolls());
  f.foes[0].life = 6;
  kingdomPlayerAttack(f, 0, rolls(6, 6));
  assert.deepEqual([f.player.experience, f.player.permanent, f.player.maxLife, f.player.life], [20, 1, 49, 41]);
  assert.equal(kingdomPlayerAttack(f, 0, rolls()), null);
  assert.equal(f.player.permanent, 1);
});

test('The witch loot is claimed once after victory, never during an unresolved fight', () => {
  const f = startKingdomFight(character(), 78, {}, rolls(6, 6, 1, 1));
  assert.equal(kingdomCollectWitchLoot(f), false);
  f.status = 'win';
  assert.equal(kingdomCollectWitchLoot(f), true);
  assert.deepEqual(f.player.magic, { thunderbolt: 1, kangling: 2, dragonfirePills: 2 });
  assert.equal(kingdomCollectWitchLoot(f), false);
});

test('Friendly avoidance does not exhaust speed boots or confusion combat counters', () => {
  const f = startKingdomFight(character({ speedCombats: 3, confusionFights: 3 }), 32, {}, rolls(6, 6, 1, 1));
  kingdomTryFriendly(f, 0, rolls(6, 1, 1, 1));
  assert.equal(f.status, 'win');
  assert.equal(f.player.speedCombats, 3);
  assert.equal(f.player.confusionFights, 3);
});

test('Lucky bonuses may produce fourteen without turning a boosted ten into a natural Vorpal kill', () => {
  assert.equal(kingdomStrike(12, 4, 5, 0, { rollBonus: 2 }).damage, 15);
  const f = startKingdomFight(character({ luckyRolls: 6, weapon: 'vorpalSword', hit: 6, bonus: 0 }), 17, {}, rolls(6, 6, 1, 1));
  f.luckyNext = true;
  kingdomPlayerAttack(f, 0, rolls(5, 5));
  assert.equal(f.foes[0].life, 53);
  assert.equal(f.player.luckyRolls, 5);
  assert.equal(f.player.ejJealousCombats, 1);
});

test('Full invisibility overrides surprise and head invisibility only scares foes below six', () => {
  const full = startKingdomFight(character(), 66, { invisibility: 'invisible' }, rolls());
  assert.equal(full.first, 'player');
  assert.equal(full.surprised, false);
  assert.equal(full.enemyMissEvery, 2);
  const head = startKingdomFight(character(), 16, { invisibility: 'head' }, rolls(6, 6, 1, 1, 1, 1, 3, 3, 2, 2));
  assert.deepEqual(head.foes.map(foe => foe.bypassed), [true, false, true]);
});

test('Killed enemies are tracked as harmless ghosts, but knockouts do not create ghosts', () => {
  const f = startKingdomFight(character(), 46, {}, rolls());
  f.foes[0].life = 6;
  kingdomPlayerAttack(f, 0, rolls(6, 6));
  assert.equal(f.player.ghosts[46][0], true);
  const revisit = startKingdomFight(f.player, 46, {}, rolls());
  assert.equal(revisit.status, 'avoided');
  assert.equal(revisit.player.experience, f.player.experience);
  const knocked = startKingdomFight(character(), 46, {}, rolls());
  knocked.foes[0].life = 10;
  kingdomPlayerAttack(knocked, 0, rolls(3, 3));
  assert.equal(knocked.foes[0].life, 4);
  assert.deepEqual(knocked.player.ghosts, {});
});

test('The rear half-LIFE option explicitly replaces ghosts without mutating the killed-enemy record', () => {
  const p = character({ ghosts: { 46: { 0: true } } });
  const f = startKingdomFight(p, 46, { halfEnemyLife: true }, rolls());
  assert.equal(f.status, 'fighting');
  assert.equal(f.foes[0].life, 8);
  assert.equal(f.foes[0].bypassed, false);
});

test('Variable pack counts persist on revisits rather than creating new enemies to replace ghosts', () => {
  const f = startKingdomFight(character(), 47, {}, rolls(2, 6, 6, 1, 1));
  assert.equal(f.foes.length, 5);
  const revisit = startKingdomFight(f.player, 47, {}, rolls(6, 6, 1, 1));
  assert.equal(revisit.foes.length, 5);
});

test('Attacks cannot proceed through an initiative tie or out of turn', () => {
  const f = startKingdomFight(character(), 16, {}, rolls(3, 3, 3, 3));
  assert.equal(kingdomPlayerAttack(f, 0, rolls()), null);
  assert.equal(kingdomEnemyAttack(f, rolls()), null);
  rerollKingdomInitiative(f, rolls(6, 6, 1, 1));
  assert.equal(kingdomEnemyAttack(f, rolls()), null);
  assert.equal(kingdomPlayerAttack(f, 0, rolls(2, 2)).damage, 5);
  assert.equal(kingdomPlayerAttack(f, 0, rolls()), null);
});

test('Ordinary group rounds let each active foe respond and skip defeated foes', () => {
  const f = startKingdomFight(character(), 16, {}, rolls(6, 6, 1, 1));
  f.foes[0].life = 6;
  kingdomPlayerAttack(f, 0, rolls(6, 6));
  assert.equal(f.foes[0].life, 0);
  assert.equal(kingdomEnemyAttack(f, rolls(1, 1)).index, 1);
  assert.equal(kingdomEnemyAttack(f, rolls(1, 1)).index, 2);
  assert.equal(f.roundStarted, false);
  assert.equal(f.rounds, 1);
});

test('Wolf gets two attacks and speed boots give two player attacks', () => {
  const f = startKingdomFight(character({ speedCombats: 3 }), 32, {}, rolls(6, 6, 1, 1));
  kingdomPlayerAttack(f, 0, rolls(1, 1));
  assert.equal(f.active, 'player');
  kingdomPlayerAttack(f, 0, rolls(1, 1));
  kingdomEnemyAttack(f, rolls(1, 1));
  assert.equal(f.active, 'enemy');
  kingdomEnemyAttack(f, rolls(1, 1));
  assert.equal(f.roundStarted, false);
});

test('Alf trial subtracts player damage within each round and ends after four rounds', () => {
  const f = startKingdomFight(character(), 131, {}, rolls(6, 6, 1, 1));
  for (let i = 0; i < 4; i++) {
    assert.equal(kingdomPlayerAttack(f, 0, rolls(3, 3)).damage, 6);
    assert.equal(kingdomEnemyAttack(f, rolls(3, 3)).damage, 10);
  }
  assert.deepEqual([f.player.life, f.rounds, f.trialPassed, f.status], [24, 4, true, 'win']);
  assert.equal(f.foes[0].life, null);
  assert.equal(kingdomPlayerAttack(f, 0, rolls()), null);
});

test('Trial failure is nonlethal and cannot become an ordinary victory', () => {
  const f = startKingdomFight(character({ life: 11 }), 146, {}, rolls(6, 6, 1, 1));
  kingdomPlayerAttack(f, 0, rolls(1, 1));
  kingdomEnemyAttack(f, rolls(6, 6));
  assert.deepEqual([f.player.life, f.trialPassed, f.status], [1, false, 'knockout']);
});

test('A captured Borfax ends the fight but a killed Borfax activates Ben', () => {
  const captured = startKingdomFight(character(), 36, {}, rolls(6, 6, 1, 1));
  captured.foes[0].life = 10;
  kingdomPlayerAttack(captured, 0, rolls(2, 2));
  assert.deepEqual([captured.status, captured.benTriggered], ['win', false]);
  const killed = startKingdomFight(character(), 36, {}, rolls(6, 6, 1, 1));
  killed.foes[0].life = 6;
  kingdomPlayerAttack(killed, 0, rolls(6, 6));
  assert.equal(killed.status, 'fighting');
  assert.equal(killed.benTriggered, true);
  assert.deepEqual(kingdomTargets(killed).map(row => row.foe.name), ['Ben the Warrior Dwarf']);
});

test('Borfax alternates bonuses on successful blows, not attempted blows', () => {
  const f = startKingdomFight(character(), 36, {}, rolls(1, 1, 6, 6));
  assert.equal(kingdomEnemyAttack(f, rolls(3, 2)).damage, 4);
  kingdomPlayerAttack(f, 0, rolls(1, 1));
  assert.equal(kingdomEnemyAttack(f, rolls(1, 1)).damage, 0);
  kingdomPlayerAttack(f, 0, rolls(1, 1));
  assert.equal(kingdomEnemyAttack(f, rolls(3, 2)).damage, 5);
});

test('Scorpion poisons on a successful hit with its fixed damage', () => {
  const f = startKingdomFight(character(), 73, {}, rolls());
  assert.equal(kingdomEnemyAttack(f, rolls(6, 6)).damage, 3);
  assert.equal(f.player.sectionPoison, 2);
  kingdomPlayerAttack(f, 0, rolls(1, 1));
  assert.equal(f.player.life, 37);
});

test('Ghoul poison costs three LIFE per completed round while the fight continues', () => {
  const f = startKingdomFight(character(), 135, {}, rolls(1, 1, 6, 6));
  kingdomEnemyAttack(f, rolls(2, 2));
  kingdomPlayerAttack(f, 0, rolls(1, 1));
  assert.equal(f.player.life, 32);
  assert.equal(f.combatPoison, 3);
});

test('Enemy and player cannot continue attacking after a lethal hit', () => {
  const f = startKingdomFight(character({ life: 6 }), 66, {}, rolls());
  kingdomEnemyAttack(f, rolls(6, 6));
  assert.equal(f.status, 'loss');
  assert.equal(kingdomPlayerAttack(f, 0, rolls()), null);
  assert.equal(kingdomEnemyAttack(f, rolls()), null);
});

test('The constable whistles once instead of hitting and adds actual reinforcements', () => {
  const f = startKingdomFight(character(), 154, {}, rolls(1, 1, 6, 6));
  assert.deepEqual(kingdomEnemyAttack(f, rolls(4)), { kind: 'reinforcements', count: 4 });
  assert.equal(f.foes.length, 5);
  assert.equal(f.player.life, 40);
  kingdomPlayerAttack(f, 0, rolls(1, 1));
  assert.equal(kingdomEnemyAttack(f, rolls(3, 2)).damage, 2);
});

test('Witches consume single spells even on a miss and Scrog has six automatic fire plumes', () => {
  const f = startKingdomFight(character({ life: 200, maxLife: 200 }), 78, {}, rolls(1, 1, 6, 6));
  assert.equal(kingdomEnemyAttack(f, rolls(3, 3)).damage, 100);
  kingdomEnemyAttack(f, rolls(1, 1));
  assert.equal(f.gelDamage, 0);
  assert.equal(kingdomEnemyAttack(f, rolls()).damage, 35);
  assert.deepEqual(f.foes.map(x => x.spellsUsed), [1, 0, 0]);
  assert.equal(f.foes[2].pills, 5);
});

test('Friendly checks are individual and cannot be retried or attempted during combat', () => {
  const f = startKingdomFight(character(), 16, {}, rolls(6, 6, 1, 1));
  assert.equal(kingdomTryFriendly(f, 0, rolls(6, 1, 1, 1)).success, true);
  assert.equal(kingdomTryFriendly(f, 0, rolls()), null);
  kingdomPlayerAttack(f, 1, rolls(1, 1));
  assert.equal(kingdomTryFriendly(f, 2, rolls()), null);
});

test('Bribes cost money even when refused, and only that target can be bribed', () => {
  const f = startKingdomFight(character({ gold: 1000 }), 16, {}, rolls(6, 6, 1, 1));
  assert.equal(kingdomTryBribe(f, 0, rolls(1, 1)).success, false);
  assert.equal(f.player.gold, 500);
  assert.equal(kingdomTryBribe(f, 0, rolls()), null);
  assert.equal(kingdomTryBribe(f, 1, rolls(6, 6)).success, true);
  assert.equal(f.player.gold, 0);
});

test('Arrival supplies EJ but no unearned armour, potions, money or magic', () => {
  const p = createKingdomCharacter();
  assert.deepEqual([p.weapon, p.hit, p.bonus, p.armour], ['ej', 4, 5, 0]);
  assert.deepEqual([p.gold, p.potions, p.salves, p.rations], [0, 0, 0, 0]);
  assert.deepEqual(p.magic, {});
});

test('Initial LIFE takes the best of three two-dice rolls times four, plus at most ten permanent LIFE', () => {
  const p = initialKingdomLife(25, rolls(1, 1, 6, 5, 2, 2));
  assert.deepEqual(p, { life: 54, maxLife: 54, permanent: 10, rolls: [2, 11, 4] });
  assert.throws(() => initialKingdomLife(-1), RangeError);
});

test('Ordinary damage is the excess over the hit threshold plus weapon damage, less armour', () => {
  assert.deepEqual(kingdomStrike(3, 4, 5), { hit: false, damage: 0 });
  assert.deepEqual(kingdomStrike(4, 4, 5, 2), { hit: true, damage: 3 });
  assert.deepEqual(kingdomStrike(8, 4, 5, 4), { hit: true, damage: 5 });
  assert.deepEqual(kingdomStrike(6, 6, 0, 3), { hit: true, damage: 0 });
});

test('Explicit bare-hand dice damage and fixed scorpion damage retain their different rules', () => {
  assert.equal(kingdomStrike(6, 6, 0, 0, { fullDice: true }).damage, 6);
  assert.equal(kingdomStrike(12, 6, 0, 0, { fixedDamage: 3 }).damage, 3);
  assert.throws(() => kingdomStrike(13), RangeError);
});

test('Friendly Reaction is a strict three-dice total below the enemy single die', () => {
  assert.equal(kingdomFriendlyReaction(rolls(6, 1, 1, 1)).success, true);
  assert.equal(kingdomFriendlyReaction(rolls(3, 1, 1, 1)).success, false);
});

test('Running preserves all six printed results rather than inventing random sections', () => {
  for (let roll = 1; roll <= 6; roll++) {
    assert.deepEqual(kingdomRunning(rolls(roll)), { roll, destination: [14, 87, 29, 76, 99, 38][roll - 1], dead: roll === 1 });
  }
});

test('Court uses the two dice required by its 10-12 results', () => {
  assert.equal(kingdomCourt(rolls(6, 6)).result, 'released');
  assert.equal(kingdomCourt(rolls(4, 4)).result, 'penalty');
  assert.equal(kingdomCourt(rolls(1, 1)).result, 'hanged');
});

test('Fight setup copies current wounds and preserves the original character and options', () => {
  const p = character(), options = { killEnemies: true }, before = structuredClone(p);
  const f = startKingdomFight(p, 16, options, rolls(6, 6, 1, 1));
  f.player.life = 9; f.options.killEnemies = false;
  assert.deepEqual(p, before);
  assert.deepEqual(options, { killEnemies: true });
});

test('Initiative ties block combat until a genuine reroll', () => {
  const f = startKingdomFight(character(), 16, {}, rolls(3, 3, 3, 3));
  assert.equal(f.first, null);
  assert.equal(rerollKingdomInitiative(f, rolls(2, 3, 5, 5)).first, 'enemy');
  assert.equal(rerollKingdomInitiative(f, rolls()), null);
});

test('Forced initiative is source-specific and does not consume random dice', () => {
  assert.equal(startKingdomFight(character(), 46, {}, rolls()).first, 'player');
  assert.equal(startKingdomFight(character(), 66, {}, rolls()).first, 'enemy');
  assert.equal(startKingdomFight(character(), 73, {}, rolls()).first, 'enemy');
});

test('Speed boots prevent surprise but do not undo a guaranteed friendly-trial opening', () => {
  const p = character({ speedCombats: 3 });
  assert.equal(startKingdomFight(p, 66, {}, rolls()).first, 'player');
  assert.equal(startKingdomFight(p, 46, {}, rolls()).first, 'player');
  assert.equal(p.speedCombats, 3);
});

test('Full-dice trials and Dreamtime combat stats do not overwrite saved EJ or armour values', () => {
  const p = character({ armour: 2 });
  const trial = startKingdomFight(p, 131, {}, rolls(6, 6, 1, 1));
  assert.deepEqual([trial.playerHit, trial.playerBonus], [6, 0]);
  assert.deepEqual([trial.player.hit, trial.player.bonus, trial.player.armour], [4, 5, 2]);
  const dream = startKingdomFight(p, 'dream3', {}, rolls());
  assert.deepEqual([dream.playerHit, dream.playerBonus, dream.playerArmour], [6, 0, 0]);
  assert.deepEqual(dream.player, p);
});

test('Vron packs have three plus one die; guard strength uses two dice', () => {
  const pack = startKingdomFight(character(), 47, {}, rolls(6, 6, 6, 1, 1));
  assert.equal(pack.foes.length, 9);
  const guards = startKingdomFight(character(), 119, {}, rolls(6, 6));
  assert.equal(guards.foes.length, 12);
  assert.equal(guards.first, 'enemy');
});

test('Ben remains out of combat unless the Borfax is actually killed', () => {
  const f = startKingdomFight(character(), 36, {}, rolls(6, 6, 1, 1));
  assert.deepEqual(kingdomTargets(f).map(row => row.foe.name), ['Borfax']);
  f.foes[0].life = 5;
  assert.equal(kingdomTargets(f).length, 0);
  f.foes[0].life = 0; f.benTriggered = true;
  assert.deepEqual(kingdomTargets(f).map(row => row.foe.name), ['Ben the Warrior Dwarf']);
});

test('Ghoul LIFE matches current player LIFE, not invented fixed values', () => {
  const f = startKingdomFight(character({ life: 31 }), 135, {}, rolls(6, 6, 1, 1));
  assert.equal(f.foes[0].life, 31);
  assert.equal(f.foes[0].combatPoison, 3);
});

test('Alf has no fabricated LIFE score and is a four-round trial, not a kill target', () => {
  const f = startKingdomFight(character(), 131, {}, rolls(6, 6, 1, 1));
  assert.equal(f.foes[0].life, null);
  assert.deepEqual(kingdomTargets(f), []);
  assert.equal(f.spec.trial, true);
});

test('Mountain confusion and the wrong-answer handicap both remain active', () => {
  const f = startKingdomFight(character({ confusionFights: 3 }), 172, {}, rolls(6, 6, 1, 1));
  assert.deepEqual(f.playerMissRules, [3, 2]);
  assert.equal(f.player.confusionFights, 2);
});

test('Roster preserves detailed armour, speed and variable-stat exceptions', () => {
  const ids = KINGDOM_ENCOUNTERS.map(row => row.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 32);
  assert.equal(KINGDOM_DREAMS.length, 4);
  assert.equal(KINGDOM_ENCOUNTERS.find(row => row.id === 17).enemies[0].armour, 4);
  assert.equal(KINGDOM_ENCOUNTERS.find(row => row.id === 32).enemies[0].attacks, 2);
  assert.equal(KINGDOM_ENCOUNTERS.find(row => row.id === 56).enemies[0].life, 499);
  assert.equal(KINGDOM_ENCOUNTERS.find(row => row.id === 78).enemies[2].pills, 6);
  assert.equal(KINGDOM_ENCOUNTERS.find(row => row.id === 178).enemies[0].armour, 4);
});

test('Merlin inventory follows all 33 equipment entries and exact reserve counts', () => {
  assert.equal(KINGDOM_EQUIPMENT.length, 33);
  assert.equal(KINGDOM_MAGIC_STOCK.length, 26);
  const p = createKingdomCharacter();
  assert.equal(p.magicStock.speedBoots, 2);
  assert.equal(p.magicStock.sleepGlobe, 3);
  assert.equal(p.magicStock.fireball, 2);
  assert.equal(p.magicStock.smarmOil, 2);
});

test('A visited-section poison deduction updates a copy and does not heal or mutate saved state', () => {
  const p = character({ sectionPoison: 2, limpSections: [1, 2, 3] });
  const updated = kingdomVisit(p, 58);
  assert.equal(updated.life, 38);
  assert.deepEqual(updated.limpSections, [2, 3]);
  assert.equal(p.life, 40);
  assert.deepEqual(updated.visited, [58]);
  assert.throws(() => kingdomVisit(p, 182), RangeError);
});

test('Healing respects starting LIFE, consumes one dose and never resurrects', () => {
  const p = character({ life: 47, potions: 1, sectionPoison: 2 });
  const healed = kingdomHeal(p, 'potion', rolls(6, 6));
  assert.equal(healed.player.life, 48);
  assert.equal(healed.player.potions, 0);
  assert.equal(healed.player.sectionPoison, 2);
  assert.equal(p.potions, 1);
  assert.equal(kingdomHeal(character({ life: 0, potions: 1 }), 'potion', rolls()).reason, 'dead');
});
