import test from 'node:test';
import assert from 'node:assert/strict';
import {blackSunPlayer, blackSunStart, blackSunRound, blackSunAcknowledge, blackSunUseEffect} from '../../../../public/js/battlesim/engines/black-sun/combat.js';
import {emptyBlackSunState, rememberBlackSunFight} from '../../../../public/js/battlesim/engines/black-sun/state.js';

const page = {base: 1, attack: 1, defense: 1, moon: 'new'};
const start = (effects, rules = {}, player = {}) => blackSunStart(blackSunPlayer(player),
  {attack: 1, defense: 100, opponents: [{resistance: 10}], effects, ...rules});

test('the stimulant adds three attack for exactly three upcoming rounds and cannot be reused', () => {
  const original = start([{id: 'stimulant', maxUses: 1, attackBoost: {amount: 3, rounds: 3}}]);
  let f = blackSunUseEffect(original, 'stimulant');
  for (let n = 0; n < 4; n++) f = blackSunRound(f, page);
  assert.deepEqual(f.log.map(r => r.attackTotal), [11, 11, 11, 8]);
  assert.throws(() => blackSunUseEffect(f, 'stimulant'), RangeError); assert.equal(original.effectUses, undefined);
});

test('healing caps at fit and ordinary noncombat Karma cannot buy extra effects', () => {
  const f = start([{id: 'potion', maxUses: 1, heal: 2}], {}, {vitality: 1});
  const r = blackSunUseEffect(f, 'potion'); assert.equal(r.player.vitality, 0);
  assert.throws(() => blackSunUseEffect(f, 'unknown'), RangeError);
});

test('Keşra gifts spend two Karma each for enhanced attack and healing defense', () => {
  const f = start([], {attack: 100, defense: 100, allowKarmaAttack: true, allowKarmaDefense: true,
    karmaDamage: true, karmaHeal: true}, {karma: 4, vitality: 2});
  const r = blackSunRound(f, page, {autoAttack: true, enhancedAttack: true, autoDefense: true, enhancedDefense: true});
  assert.equal(r.opponents[0].resistance, 8); assert.equal(r.player.vitality, 1); assert.equal(r.player.karma, 0);
  assert.throws(() => blackSunRound(start([], {}, {karma: 10}), page, {enhancedAttack: true}), RangeError);
});

test('Karma burst spends all Karma, pays three for a shield and forces only the current upcoming attack', () => {
  const f = start([{id: 'burst', maxUses: 1, karmaBurst: true}], {opponents: [{resistance: 3, track: ['shield', 'normal', 'normal']}]}, {karma: 4});
  let r = blackSunUseEffect(f, 'burst');
  assert.equal(r.player.karma, 0); assert.equal(r.opponents[0].resistance, 1); assert.equal(r.opponents[0].trueResistanceDamage, 1);
  r = blackSunRound(r, page); assert.equal(r.status, 'win');
  const insufficient = blackSunUseEffect(start([{id: 'burst', karmaBurst: true}],
    {opponents: [{resistance: 2, track: ['shield', 'normal']}]}, {karma: 2}), 'burst');
  assert.equal(insufficient.player.karma, 0); assert.equal(insufficient.opponents[0].resistance, 2);
});

test('assistance cancels the current wound, damages the enemy and permanently reduces its attack', () => {
  let f = start([{id: 'help', maxUses: 1, cancelIncoming: 'required', enemyDamage: 1, enemyAttackDelta: -2}],
    {attack: 20, firstWoundEvent: {id: 'wound', section: 'manual'}});
  f = blackSunRound(f, page); assert.equal(f.player.vitality, 2);
  const r = blackSunUseEffect(f, 'help'); assert.equal(r.player.vitality, 1); assert.equal(r.opponents[0].resistance, 9);
  assert.equal(r.enemyAttackPenalty, 2); assert.equal(r.log[0].playerLoss, 0);
  assert.throws(() => blackSunUseEffect(r, 'help'), RangeError);
});

test('a permitted resurrection preserves enemy damage and rounds and records no premature defeat', () => {
  const state = emptyBlackSunState();
  state.fight = blackSunRound(start([{id: 'resurrect', maxUses: 1, minimumKarma: 4, karmaPerHealedLevel: 1,
    vitalityByMoon: {new: 4, crescent: 3, half: 2, gibbous: 1, full: 0}}],
    {attack: 100, deathEvent: {id: 'death', section: 'F14'}}, {vitality: 4, karma: 4}), page);
  rememberBlackSunFight(state); assert.equal(state.history.length, 0); assert.equal(state.fight.status, 'paused');
  let f = blackSunUseEffect(state.fight, 'resurrect', {moon: 'half'});
  f = blackSunAcknowledge(f); assert.equal(f.status, 'fighting'); assert.equal(f.player.vitality, 2);
  assert.equal(f.player.karma, 1); assert.equal(f.round, 1); assert.equal(f.opponents[0].resistance, 10);
});

test('resurrection requires death and the printed Fate or Karma route; only full moon or Mind over Body permits choice', () => {
  const divine = {id: 'divine', requiresDead: true, requiresPlayer: {fatePoints: 13},
    restoreFitWithAbility: 'mindOverBody', vitalityByMoon: {new: 4, full: 0}};
  const karma = {id: 'karma', requiresDead: true, excludesPlayer: {fatePoints: 13}, minimumKarma: 4,
    karmaPerHealedLevel: 1, vitalityByMoon: {new: 4, full: 0}, chooseVitalityOnMoon: 'full', chooseVitalityWithAbility: 'mindOverBody'};
  const rules = {attack: 100, deathEvent: {id: 'death', section: 'manual'}};
  const alive = start([divine, karma], rules, {fatePoints: 13, karma: 10, vitality: 4});
  assert.throws(() => blackSunUseEffect(alive, 'divine', {moon: 'new'}), RangeError);
  const dead = blackSunRound(alive, page);
  assert.throws(() => blackSunUseEffect(dead, 'karma', {moon: 'new'}), RangeError);
  assert.equal(blackSunUseEffect(dead, 'divine', {moon: 'new', vitality: 0}).player.vitality, 4);
  const focus = blackSunRound(start([divine], {...rules, mindOverBody: true}, {fatePoints: 13, vitality: 4}), page);
  assert.equal(blackSunUseEffect(focus, 'divine').player.vitality, 0);
  const noFate = blackSunRound(start([divine, karma], rules, {fatePoints: 12, karma: 4, vitality: 4}), page);
  assert.throws(() => blackSunUseEffect(noFate, 'divine', {moon: 'new'}), RangeError);
  const normal = blackSunUseEffect(noFate, 'karma', {moon: 'new', vitality: 1});
  assert.equal(normal.player.vitality, 4); assert.equal(normal.player.karma, 3);
  const chosen = blackSunUseEffect(noFate, 'karma', {moon: 'full', vitality: 1});
  assert.equal(chosen.player.vitality, 1); assert.equal(chosen.player.karma, 0);
  assert.throws(() => blackSunUseEffect(noFate, 'karma', {moon: 'full', vitality: 0}), RangeError);
});

test('only one declared extra-action group can be used per round and dragon death can explicitly dismount', () => {
  let f = start([{id: 'fire', onePerRoundGroup: 'extra', kyrnaLoss: 1, enemyDamage: 1, dismountOnDragonDeath: true},
    {id: 'bomb', onePerRoundGroup: 'extra', enemyDamage: 3}], {}, {kyrnaVitality: 4, mounted: true});
  f = blackSunUseEffect(f, 'fire'); assert.equal(f.player.kyrnaVitality, 5); assert.equal(f.player.mounted, false);
  assert.equal(f.player.vitality, 1); assert.throws(() => blackSunUseEffect(f, 'bomb'), RangeError);
  f = blackSunRound(f, page); f = blackSunUseEffect(f, 'bomb'); assert.equal(f.opponents[0].resistance, 6);
});

test('Kyrna’s shield absorbs exactly the first normal-to-battered wound and remains spent', () => {
  let f = start([{id: 'fire', kyrnaLoss: 1}], {}, {kyrnaVitality: 0, kyrnaArmor: true});
  f = blackSunUseEffect(f, 'fire'); assert.equal(f.player.kyrnaVitality, 1); assert.equal(f.player.kyrnaArmorSpent, undefined);
  f = blackSunUseEffect(f, 'fire'); assert.equal(f.player.kyrnaVitality, 1); assert.equal(f.player.kyrnaArmorSpent, true);
  f = blackSunUseEffect(f, 'fire'); assert.equal(f.player.kyrnaVitality, 2);
});

test('mandatory moon shots resolve once and critical prompts recur only after a new drop to critical', () => {
  const shot = {id: 'shot', requiresPendingSection: 'shot-section', maxUses: 1,
    playerLossByMoon: {new: 1, crescent: 1, half: 0, gibbous: 0, full: 0}};
  let f = start([shot], {events: [{id: 'shot', section: 'shot-section', round: 1, phase: 'before-round', requiresEffect: 'shot'}]});
  assert.throws(() => blackSunUseEffect(f, 'shot', {moon: 'new'}), RangeError);
  f = blackSunRound(f, page); assert.throws(() => blackSunAcknowledge(f), RangeError);
  const hit = blackSunUseEffect(f, 'shot', {moon: 'new'});
  assert.equal(hit.player.vitality, 2); assert.equal(blackSunAcknowledge(hit).status, 'fighting');
  const miss = blackSunUseEffect(f, 'shot', {moon: 'full'}); assert.equal(miss.player.vitality, 1);
  f = start([{id: 'help', heal: 1}], {attack: 20, criticalEvent: {id: 'critical', section: 'manual', repeatable: true}}, {vitality: 3});
  f = blackSunRound(f, page); assert.equal(f.pending.id, 'critical');
  f = blackSunAcknowledge(f); assert.equal(f.status, 'fighting');
  f.player.dexterity = 100;
  f = blackSunRound(f, page); assert.equal(f.status, 'fighting');
  f = blackSunUseEffect(f, 'help'); f.player.dexterity = 6;
  f = blackSunRound(f, page); assert.equal(f.pending.id, 'critical');
});

test('resistance effects cannot invent missing stats for defensive survival encounters', () => {
  const f = start([{id: 'damage', enemyDamage: 1}], {defenseOnly: true, defense: null, opponents: [{resistance: null}]});
  assert.throws(() => blackSunUseEffect(f, 'damage'), RangeError); assert.equal(f.opponents[0].resistance, null);
});

test('a failed special dodge consumes the round without another attack from either side', () => {
  const f = start([{id: 'failed-dodge', playerLoss: 1, skipRoundActions: true}], {attack: 100, defense: 1});
  const applied = blackSunUseEffect(f, 'failed-dodge');
  const r = blackSunRound(applied, page); assert.equal(r.round, 1); assert.equal(r.player.vitality, 2);
  assert.equal(r.opponents[0].resistance, 10); assert.equal(r.log[0].playerHit, false);
  const next = blackSunRound(r, page); assert.equal(next.player.vitality, 3); assert.equal(next.opponents[0].resistance, 9);
});

test('a special attack modifier lasts for exactly its current round', () => {
  let f = start([{id: 'embrace', attackBoost: {amount: -3, rounds: 1}, defenseBoost: {amount: -3, rounds: 1}}]);
  f = blackSunUseEffect(f, 'embrace'); f = blackSunRound(f, page); f = blackSunRound(f, page);
  assert.deepEqual(f.log.map(r => [r.attackTotal, r.defenseTotal]), [[5, 5], [8, 8]]);
});

test('divine resurrection can remain available on later deaths when the printed route is repeatable', () => {
  let f = start([{id: 'divine', vitalityByMoon: {new: 4}}],
    {attack: 100, deathEvent: {id: 'death', section: 'F14', repeatable: true}}, {vitality: 4});
  for (let i = 0; i < 2; i++) {
    f = blackSunRound(f, page); assert.equal(f.pending.section, 'F14');
    f = blackSunUseEffect(f, 'divine', {moon: 'new'}); f = blackSunAcknowledge(f);
    assert.equal(f.status, 'fighting'); assert.equal(f.player.vitality, 4);
  }
  assert.deepEqual(f.acknowledged, ['death']);
});

test('assistance is offered before a critical-vitality consequence and can prevent it by cancelling that wound', () => {
  let f = start([{id: 'help', cancelIncoming: 'required', enemyDamage: 1}], {attack: 100,
    afterWoundsEvent: {id: 'assistance', losses: 2, text: 'Read your note'}, criticalEvent: {id: 'critical', section: 'F65'}}, {vitality: 2});
  f = blackSunRound(blackSunRound(f, page), page);
  assert.equal(f.pending.id, 'assistance'); assert.equal(f.player.vitality, 4);
  const accepted = blackSunAcknowledge(blackSunUseEffect(f, 'help'));
  assert.equal(accepted.status, 'fighting'); assert.equal(accepted.player.vitality, 3);
  const declined = blackSunAcknowledge(f); assert.equal(declined.pending.section, 'F65');
});

test('Qik Spittle stacks with other attack reductions once, rather than suppressing or repeating them', () => {
  let f = start([{id: 'aid', enemyAttackDelta: -2}], {attack: 10, defense: 1, qikSpittle: true});
  f = blackSunUseEffect(f, 'aid'); f = blackSunRound(f, page); assert.equal(f.enemyAttackPenalty, 4);
  f = blackSunRound(f, page); assert.equal(f.enemyAttackPenalty, 4);
});
