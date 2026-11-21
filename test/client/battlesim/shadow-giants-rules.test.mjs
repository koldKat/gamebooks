import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as combat from '../../../public/js/battlesim/engines/fighting-fantasy/core.js';

const hero = changes => ({...combat.newCharacter({gold:50, provisions:10}, () => 6), ...changes});
const entry = rules => ({section:'test', label:'Encounter',
  enemies:[{name:'Opponent', skill:12, stamina:20}], win:'next', ...rules});
const begin = (rules, changes) => combat.startFight(hero(changes), entry(rules));
const tie = fight => combat.roundFight(fight, [], () => 3);

test('Snapperfish wounds lose Skill even when Luck reduces their Stamina damage', () => {
  const initial = begin({incomingDamage:3, incomingSkillLoss:1}, {skill:1});
  const attack = tie(initial);
  assert.deepEqual(combat.pendingWoundValues(attack), {damage:3, lucky:2, unlucky:4});
  const result = combat.resolveWound(attack, true, () => 1);
  assert.equal(result.character.stamina, 22);
  assert.equal(result.character.skill, 0);
  assert.equal(result.character.luck, 11);
  assert.equal(initial.character.skill, 1);
  assert.ok(result.events.some(event => event.kind === 'skillLoss' && event.n === 1));
});

test('Goose damages Cobrax on tied rounds and clean wins keep their printed destination', () => {
  let fight = begin({allyRoundDamage:1, cleanWin:'57', win:'145',
    enemies:[{name:'Cobrax', skill:12, stamina:2}]});
  fight = tie(fight);
  assert.equal(fight.enemies[0].stamina, 1);
  assert.equal(fight.status, 'active');
  fight = tie(fight);
  assert.equal(fight.enemies[0].stamina, 0);
  assert.equal(fight.status, 'win');
  assert.equal(fight.destination, '57');
});

test('an incoming round makes Cobrax use the bitten route even if Goose lands the last arrow', () => {
  let fight = begin({allyRoundDamage:1, cleanWin:'57', win:'145',
    enemies:[{name:'Cobrax', skill:20, stamina:1}]});
  fight = combat.resolveWound(tie(fight));
  assert.equal(fight.status, 'win');
  assert.equal(fight.destination, '145');
  assert.equal(fight.character.stamina, 22);
});

test('Rune Sword costs apply once after a complete round, never while a wound is pending', () => {
  const rules = {roundStaminaCosts:[{key:'runeSword', damage:1}],
    enemies:[{name:'Opponent', skill:1, stamina:20}]};
  const fight = combat.roundFight(begin(rules, {items:{runeSword:true}}), [], () => 3);
  assert.equal(fight.character.stamina, 24);
  assert.ok(fight.pending);
  assert.equal(combat.resolveWound(fight).character.stamina, 23);
  const ordinary = combat.roundFight(begin(rules), [], () => 3);
  assert.equal(combat.resolveWound(ordinary).character.stamina, 24);
});

test('the selected Rune Sword also drains Stamina in ordinary custom fights', () => {
  const fight = combat.startFight(hero({items:{runeSword:true}}), undefined, {
    opponents:[{name:'Custom opponent', skill:1, stamina:20}],
    items:[{key:'runeSword', slot:'weapon', roundStaminaCost:1}],
  });
  const result = combat.resolveWound(combat.roundFight(fight, [], () => 3));
  assert.equal(result.character.stamina, 23);
});

test('the three-round Gorgon test consumes Luck and chooses the printed outcome', () => {
  for (const [luck, status, destination] of [[12,'win','168'], [1,'loss','318']]) {
    let fight = begin({roundLimitLuck:{rounds:3, lucky:'168', unlucky:'318'}}, {luck});
    fight = tie(fight);
    fight = tie(fight);
    assert.equal(fight.status, 'active');
    fight = tie(fight);
    assert.equal(fight.round, 3);
    assert.equal(fight.status, status);
    assert.equal(fight.destination, destination);
    assert.equal(fight.character.luck, luck - 1);
  }
});

test('death at the end of a round takes precedence over a Gorgon Luck test', () => {
  const fight = tie(begin({roundLimitLuck:{rounds:1, lucky:'168', unlucky:'318'},
    roundStaminaCosts:[{key:'runeSword', damage:1}]},
  {stamina:1, items:{runeSword:true}}));
  assert.equal(fight.status, 'loss');
  assert.equal(fight.character.luck, 12);
  assert.equal(fight.events.some(event => event.kind === 'luck'), false);
});

test('this book restores Luck without changing the legacy potion behavior', () => {
  const initial = hero({luck:2, potion:'fortune'});
  const restored = combat.recover(initial, 'potion', {luckPotionIncreasesInitial:false});
  assert.equal(restored.luckInitial, 12);
  assert.equal(restored.luck, 12);
  assert.equal(restored.potionUses, 0);
  assert.equal(combat.recover(initial, 'potion').luckInitial, 13);
});

test('the war-hammer encounter cannot be started without its required weapon', () => {
  assert.throws(() => begin({requiredItem:'warHammer'}), /Required combat item/);
  assert.equal(begin({requiredItem:'warHammer'}, {items:{warHammer:true}}).status, 'active');
});
