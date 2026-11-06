import test from 'node:test';
import assert from 'node:assert/strict';
import {damageExpression, rollDamage, rollCheck, rollAttack, rollSave} from '../../../public/js/battlesim/engines/d20/dice.js';
import {mitigateDamage, applyDamage, healDamage, reduceMaximumHp} from '../../../public/js/battlesim/engines/d20/damage.js';
import {startD20Fight, validateD20Fight, d20Action} from '../../../public/js/battlesim/engines/d20/core.js';

test('attack natural results differ from saving throws', () => {
  assert.equal(rollAttack(-100, 100, {dice:[20]}).hit, true);
  assert.equal(rollAttack(100, 1, {dice:[1]}).hit, false);
  assert.equal(rollSave(-10, 14, {dice:[20]}).success, false);
  assert.equal(rollSave(20, 14, {dice:[1]}).success, true);
});

test('advantage and disadvantage cancel rather than stacking dice', () => {
  assert.equal(rollCheck(2, {advantage:true, dice:[3, 18]}).total, 20);
  assert.equal(rollCheck(2, {disadvantage:true, dice:[3, 18]}).total, 5);
  assert.equal(rollCheck(2, {advantage:true, disadvantage:true, dice:[7]}).total, 9);
  assert.throws(() => rollCheck(2, {advantage:true, dice:[7]}));
});

test('critical hits double each damage component dice but not its modifier', () => {
  assert.equal(rollDamage('2d6+3', {critical:true, dice:[1, 2, 3, 4]}).amount, 13);
  assert.equal(rollDamage('3d6', {critical:true, dice:[1, 1, 1, 1, 1, 1]}).amount, 6);
  assert.equal(rollDamage('1d4-3', {dice:[1]}).amount, 0);
  assert.equal(rollDamage('5', {critical:true, dice:[]}).amount, 5);
});

test('damage expressions reject executable, malformed and excessive inputs', () => {
  for (const value of ['1d6;alert(1)', '1d6+1d6', '101d6', '1d1001', '0d6', '1d1', '', NaN]) {
    assert.throws(() => damageExpression(value));
  }
  assert.throws(() => rollDamage('1d6', {dice:[7]}));
  assert.throws(() => rollDamage('1d6', {random:() => 1}));
  assert.throws(() => rollAttack(NaN, 10));
});

test('immunity takes precedence and resistance applies only once', () => {
  assert.equal(mitigateDamage(11, 'poison', {immunities:['poison'], resistances:['poison']}).amount, 0);
  assert.equal(mitigateDamage(11, 'piercing', {resistances:['piercing'], nonmagicalPhysicalResistance:true}).amount, 5);
  assert.equal(mitigateDamage(11, 'radiant', {vulnerabilities:['radiant']}).amount, 22);
});

test('magic and silver bypass only the printed physical resistance', () => {
  const traits = {nonmagicalPhysicalResistance:true, silverBypassesPhysicalResistance:true, resistances:['necrotic']};
  assert.equal(mitigateDamage(9, 'slashing', traits).amount, 4);
  assert.equal(mitigateDamage(9, 'slashing', traits, {silvered:true}).amount, 9);
  assert.equal(mitigateDamage(9, 'slashing', {nonmagicalPhysicalResistance:true}, {silvered:true}).amount, 4);
  assert.equal(mitigateDamage(9, 'slashing', traits, {magical:true}).amount, 9);
  assert.equal(mitigateDamage(9, 'necrotic', traits, {magical:true}).amount, 4);
});

test('a printed resistance to all nonmagical attacks stays broader than physical attacks', () => {
  const traits = {nonmagicalAttackResistance:true};
  assert.equal(mitigateDamage(9, 'radiant', traits).amount, 4);
  assert.equal(mitigateDamage(9, 'radiant', traits, {magical:true}).amount, 9);
  assert.equal(mitigateDamage(9, 'radiant', traits, {attack:false}).amount, 9);
  assert.equal(mitigateDamage(9, 'piercing', {nonmagicalPhysicalResistance:true}, {attack:false}).amount, 9);
});

test('damage and healing respect current maximum HP without changing their inputs', () => {
  const original = {hp:22, maxHp:30};
  assert.deepEqual(applyDamage(original, 30), {hp:0, maxHp:30});
  assert.deepEqual(healDamage(original, 100), {hp:30, maxHp:30});
  const drained = reduceMaximumHp(original, 15);
  assert.deepEqual(drained, {hp:15, maxHp:15, baseMaxHp:30});
  assert.equal(healDamage(drained, 100).hp, 15);
  assert.deepEqual(original, {hp:22, maxHp:30});
  assert.equal(reduceMaximumHp(original, 100).hp, 0);
});

const combatant = (name, extra = {}) => ({name, hp:20, maxHp:20, ac:13,
  abilities:{str:1, dex:2, con:3, int:0, wis:0, cha:0},
  saves:{str:1, dex:2, con:3, int:0, wis:0, cha:0},
  attacks:[{name:'Strike', bonus:4, damage:[{formula:'1d6+2', type:'slashing'}]}], ...extra});
const encounter = profiles => ({name:'Encounter', section:'4', profiles});
const begin = () => startD20Fight(combatant('Player'), encounter([combatant('Enemy')]));
const act = (fight, action) => d20Action(fight, {expectedRevision:fight.revision, ...action});

test('a failed or stale action cannot mutate an active fight or its presets', () => {
  const player = combatant('Player'), opponent = encounter([combatant('Enemy')]);
  const fight = startD20Fight(player, opponent), before = structuredClone(fight);
  const next = act(fight, {kind:'attack', actor:'player', target:'enemy0', attackIndex:0, dice:[15], damageDice:[[4]]});
  assert.equal(next.groups[0].hp, 14);
  assert.deepEqual(fight, before);
  assert.equal(opponent.profiles[0].hp, 20);
  assert.equal(player.hp, 20);
  assert.throws(() => d20Action(next, {expectedRevision:0, kind:'round'}));
  assert.throws(() => act(next, {kind:'attack', actor:'enemy0', target:'enemy0', attackIndex:0}));
});

test('group presets expand into independent opponents and victory waits for all of them', () => {
  const fight = startD20Fight(combatant('Player'), encounter([combatant('Enemy', {count:2})]));
  let next = act(fight, {kind:'damage', target:'enemy0', amount:20, type:'force', reason:'Resolved spell'});
  assert.equal(next.status, 'fighting');
  assert.equal(next.groups[1].hp, 20);
  next = act(next, {kind:'damage', target:'enemy1', amount:20, type:'force', reason:'Resolved spell'});
  assert.equal(next.status, 'win');
  assert.throws(() => act(next, {kind:'round'}));
});

test('companions remain valid targets and one fallen player does not end a party encounter', () => {
  let fight = startD20Fight(combatant('Player'), encounter([combatant('Enemy')]), [combatant('Companion')]);
  fight = act(fight, {kind:'damage', target:'player', amount:100, type:'force', reason:'Resolved spell'});
  assert.equal(fight.status, 'fighting');
  assert.throws(() => act(fight, {kind:'attack', actor:'player', target:'enemy0', attackIndex:0}));
  fight = act(fight, {kind:'damage', target:'ally0', amount:100, type:'force', reason:'Resolved spell'});
  assert.equal(fight.status, 'loss');
});

test('hit components apply their own critical dice and defenses', () => {
  const player = combatant('Player', {attacks:[{name:'Mixed damage', bonus:4, damage:[
    {formula:'1d6+2', type:'piercing'}, {formula:'1d6', type:'poison'}]}]});
  const enemy = combatant('Enemy', {defenses:{immunities:['poison'], resistances:['piercing']}});
  const result = act(startD20Fight(player, encounter([enemy])), {kind:'attack', actor:'player', target:'enemy0',
    attackIndex:0, dice:[20], damageDice:[[3, 4], [5, 6]]});
  assert.equal(result.groups[0].hp, 16);
  assert.equal(result.events[0].check.critical, true);
  assert.equal(result.events[0].damage[1].immune, true);
});

test('maximum-HP loss can kill without making the terminal save invalid', () => {
  const result = act(begin(), {kind:'maximumHp', target:'player', amount:30, reason:'Life drain'});
  assert.equal(result.status, 'loss');
  assert.equal(result.player.hp, 0);
  assert.equal(result.player.maxHp, 0);
  assert.equal(result.player.baseMaxHp, 20);
  assert.equal(validateD20Fight(result), result);
});

test('printed ability modifiers and separate saving throw bonuses stay intact', () => {
  const actor = combatant('Printed inconsistency'); actor.abilities.int = -1; actor.saves.int = 3;
  let fight = startD20Fight(actor, encounter([combatant('Enemy')]));
  fight = act(fight, {kind:'check', actor:'player', ability:'int', dc:14, dice:[14]});
  assert.equal(fight.events.at(-1).check.total, 13);
  fight = act(fight, {kind:'save', actor:'player', ability:'int', dc:14, dice:[14]});
  assert.equal(fight.events.at(-1).check.total, 17);
});

test('terminal flags cannot invent victory or defeat in a saved encounter', () => {
  const fight = begin();
  assert.throws(() => validateD20Fight({...fight, status:'win', phase:'complete'}));
  assert.throws(() => validateD20Fight({...fight, status:'loss', phase:'complete'}));
  assert.throws(() => startD20Fight(combatant('Player'), encounter([combatant('Enemy', {count:31})])));
  assert.throws(() => act(fight, {kind:'damage', target:'player', amount:NaN, type:'force', reason:'Invalid'}));
});

test('undead fortitude uses damage taken and is bypassed by radiant damage or a critical hit', () => {
  const beginZombie = () => startD20Fight(combatant('Player'), encounter([
    combatant('Zombie', {hp:5, features:{undeadFortitude:{dcBase:5}}})]));
  const damage = {kind:'damage', target:'enemy0', amount:5, type:'slashing', reason:'Strike'};
  const saved = act(beginZombie(), {...damage, featureDice:{fortitude:[7]}});
  assert.equal(saved.groups[0].hp, 1);
  assert.equal(saved.events.at(-1).effects[0].dc, 10);
  assert.equal(act(beginZombie(), {...damage, featureDice:{fortitude:[6]}}).status, 'win');
  assert.equal(act(beginZombie(), {...damage, type:'radiant', featureDice:{fortitude:[20]}}).status, 'win');
  assert.equal(act(beginZombie(), {...damage, critical:true, featureDice:{fortitude:[20]}}).status, 'win');
});

test('life drain reduces maximum HP only when the separate saving throw fails', () => {
  const enemy = combatant('Drainer');
  enemy.attacks[0].effects = [{kind:'maximumHpDrain', save:{ability:'con', dc:10}}];
  const beginDrain = () => startD20Fight(combatant('Player'), encounter([enemy]));
  const attack = {kind:'attack', actor:'enemy0', target:'player', attackIndex:0, dice:[15], damageDice:[[3]]};
  const failed = act(beginDrain(), {...attack, effectDice:[{save:[1]}]});
  assert.equal(failed.player.hp, 15); assert.equal(failed.player.maxHp, 15);
  const saved = act(beginDrain(), {...attack, effectDice:[{save:[20]}]});
  assert.equal(saved.player.hp, 15); assert.equal(saved.player.maxHp, 20);
});

test('Strength drain persists and updates only explicitly Strength-based attacks', () => {
  const player = combatant('Player', {abilityScores:{str:15}});
  player.attacks[0].ability = 'str'; player.attacks[0].damage[0].ability = 'str';
  const enemy = combatant('Shadow'); enemy.attacks[0].effects = [{kind:'strengthDrain', formula:'1d4'}];
  const result = act(startD20Fight(player, encounter([enemy])), {kind:'attack', actor:'enemy0', target:'player',
    attackIndex:0, dice:[15], damageDice:[[1]], effectDice:[{damage:[4]}]});
  assert.equal(result.player.abilityScores.str, 11);
  assert.equal(result.player.abilities.str, -1);
  assert.equal(result.player.attacks[0].bonus, 2);
  assert.equal(result.player.attacks[0].damage[0].formula, '1d6+0');
  assert.equal(result.player.abilities.dex, 2);
  assert.equal(player.abilityScores.str, 15);
});

test('Strength zero kills and a missing Strength input cannot partially commit the attack', () => {
  const enemy = combatant('Shadow'); enemy.attacks[0].effects = [{kind:'strengthDrain', formula:'1d4'}];
  const attack = {kind:'attack', actor:'enemy0', target:'player', attackIndex:0, dice:[15], damageDice:[[1]], effectDice:[{damage:[4]}]};
  const missing = startD20Fight(combatant('Player'), encounter([enemy]));
  assert.throws(() => act(missing, attack)); assert.equal(missing.player.hp, 20);
  const result = act(startD20Fight(combatant('Player', {abilityScores:{str:3}}), encounter([enemy])), attack);
  assert.equal(result.status, 'loss'); assert.equal(result.player.abilityScores.str, 0);
});

test('ghoul tag exceptions and condition immunities prevent paralysis', () => {
  const enemy = combatant('Ghoul'); enemy.attacks[0].effects = [{kind:'condition', skipTags:['elf', 'undead'],
    save:{ability:'con', dc:10}, repeatSave:true, condition:{name:'paralyzed', remainingTurns:10}}];
  const attack = {kind:'attack', actor:'enemy0', target:'player', attackIndex:0, dice:[15], damageDice:[[1]], effectDice:[{save:[1]}]};
  for (const extra of [{tags:['elf']}, {tags:['undead']}, {conditionImmunities:['paralyzed']}]) {
    const result = act(startD20Fight(combatant('Player', extra), encounter([enemy])), attack);
    assert.equal(result.player.conditions.length, 0);
  }
  const result = act(startD20Fight(combatant('Player'), encounter([enemy])), attack);
  assert.equal(result.player.conditions[0].repeatSave, true);
  assert.equal(result.player.conditions[0].remainingTurns, 10);
});

test('paralysis blocks actions, fails physical saves, and causes nearby critical hits', () => {
  const player = combatant('Player', {conditions:[{name:'paralyzed', remainingTurns:2}]});
  const fight = startD20Fight(player, encounter([combatant('Enemy')]));
  assert.throws(() => act(fight, {kind:'attack', actor:'player', target:'enemy0', attackIndex:0}));
  const save = act(fight, {kind:'save', actor:'player', ability:'dex', dc:10});
  assert.equal(save.events.at(-1).check.automaticFailure, true);
  const hit = act(fight, {kind:'attack', actor:'enemy0', target:'player', attackIndex:0,
    distance:5, dice:[10, 15], damageDice:[[2, 3]]});
  assert.equal(hit.events.at(-1).check.critical, true); assert.equal(hit.player.hp, 13);
  assert.throws(() => act(fight, {kind:'attack', actor:'enemy0', target:'player', attackIndex:0}));
});

test('repeat saves end a condition early or it expires after its printed duration', () => {
  const beginCondition = () => startD20Fight(combatant('Player', {conditions:[{name:'paralyzed', remainingTurns:2,
    save:{ability:'con', dc:14}, repeatSave:true}]}), encounter([combatant('Enemy')]));
  const saved = act(beginCondition(), {kind:'endTurn', actor:'player', dice:[[20]]});
  assert.equal(saved.player.conditions.length, 0);
  let expired = act(beginCondition(), {kind:'endTurn', actor:'player', dice:[[1]]});
  assert.equal(expired.player.conditions[0].remainingTurns, 1);
  expired = act(expired, {kind:'endTurn', actor:'player', dice:[[1]]});
  assert.equal(expired.player.conditions.length, 0);
});

test('restrained and custom confusion apply their own save disadvantages', () => {
  for (const condition of ['restrained', 'confused']) {
    const fight = startD20Fight(combatant('Player', {conditions:[{name:condition}]}), encounter([combatant('Enemy')]));
    const saved = act(fight, {kind:'save', actor:'player', ability:'dex', dc:10, dice:[4, 18]});
    assert.equal(saved.events.at(-1).check.total, 6);
  }
});

test('magic resistance applies to magical saves, while a normal save stays a single roll', () => {
  const fight = startD20Fight(combatant('Player', {magicResistance:true}), encounter([combatant('Enemy')]));
  const magical = act(fight, {kind:'save', actor:'player', ability:'con', dc:15, magical:true, dice:[1, 20]});
  assert.equal(magical.events.at(-1).check.success, true);
  const ordinary = act(fight, {kind:'save', actor:'player', ability:'con', dc:15, dice:[1]});
  assert.equal(ordinary.events.at(-1).check.success, false);
});

test('concentration retains the printed minimum rather than imposing a different book rule', () => {
  let fight = startD20Fight(combatant('Player'), encounter([combatant('Caster', {conditions:[{name:'blurred', concentrationMinimum:0}]})]));
  fight = act(fight, {kind:'damage', target:'enemy0', amount:4, type:'force', reason:'Spell', featureDice:{concentration:[[1]]}});
  assert.equal(fight.groups[0].conditions.length, 1);
  assert.equal(fight.events.at(-1).effects[0].dc, 2);
  fight = act(fight, {kind:'damage', target:'enemy0', amount:10, type:'force', reason:'Spell', featureDice:{concentration:[[1]]}});
  assert.equal(fight.groups[0].conditions.length, 0);
});

test('a save-based ray rolls only one initial save and retains its repeat save', () => {
  const ray = {name:'Paralyzing ray', kind:'save', magical:true, save:{ability:'con', dc:14}, damage:[], effects:[{
    kind:'condition', save:{ability:'con', dc:14}, initialSaveAlreadyResolved:true, repeatSave:true,
    condition:{name:'paralyzed', remainingTurns:2}}]};
  const beginRay = () => startD20Fight(combatant('Player'), encounter([combatant('Ray user', {attacks:[ray]})]));
  const result = d20Action(beginRay(), {expectedRevision:0, kind:'attack', actor:'enemy0', target:'player',
    attackIndex:0, saveDice:[1]}, () => { throw Error('Unexpected second saving throw'); });
  assert.equal(result.player.conditions[0].remainingTurns, 2);
  assert.equal(result.player.conditions[0].repeatSave, true);
  assert.equal(result.player.conditions[0].magical, true);
  const saved = act(beginRay(), {kind:'attack', actor:'enemy0', target:'player', attackIndex:0, saveDice:[20]});
  assert.equal(saved.player.conditions.length, 0);
});

test('a successful half-damage save is applied before resistance and never becomes a critical hit', () => {
  const ray = {name:'Drain ray', kind:'save', save:{ability:'con', dc:14}, halfOnSave:true,
    damage:[{formula:'3d6', type:'necrotic'}]};
  const player = combatant('Player', {defenses:{resistances:['necrotic']}});
  const result = act(startD20Fight(player, encounter([combatant('Ray user', {attacks:[ray]})])), {
    kind:'attack', actor:'enemy0', target:'player', attackIndex:0, saveDice:[20], damageDice:[[3, 3, 3]]});
  assert.equal(result.player.hp, 18);
  assert.equal(result.events.at(-1).check.critical, false);
  assert.equal(result.events.at(-1).save.success, true);
});

test('a successful save can avoid a ray completely without rolling damage', () => {
  const ray = {name:'Destructive ray', kind:'save', save:{ability:'dex', dc:14},
    damage:[{formula:'10d8', type:'force'}]};
  const result = d20Action(startD20Fight(combatant('Player'), encounter([combatant('Ray user', {attacks:[ray]})])), {
    expectedRevision:0, kind:'attack', actor:'enemy0', target:'player', attackIndex:0, saveDice:[20]},
  () => { throw Error('Unnecessary damage roll'); });
  assert.equal(result.player.hp, 20);
});

const casting = () => ({spells:{'0':['Light'], '1':['Shield'], '3':['Bolt']}, slots:{'1':1, '3':2}});
const beginCaster = (count = 1) => startD20Fight(combatant('Player', {spellcasting:casting()}),
  encounter([combatant('Enemy', {count})]));

test('casting spends one prepared slot and blocks other actions until resolution', () => {
  const fight = beginCaster();
  const cast = act(fight, {kind:'cast', actor:'player', spell:'Shield', level:1});
  assert.equal(cast.player.spellSlots['1'], 0);
  assert.equal(cast.player.pendingCast.spell, 'Shield');
  assert.equal(fight.player.spellSlots['1'], 1);
  assert.throws(() => act(cast, {kind:'cast', actor:'player', spell:'Shield', level:1}));
  assert.throws(() => act(cast, {kind:'damage', target:'enemy0', type:'force', amount:20, reason:'Spell'}));
  assert.throws(() => act(cast, {kind:'round'}));
});

test('spell resolution applies all targets atomically and cannot refund an applied spell', () => {
  const cast = act(beginCaster(2), {kind:'cast', actor:'player', spell:'Bolt', level:3});
  const results = ['enemy0', 'enemy1'].map(target => ({kind:'damage', target, type:'lightning', amount:20, magical:true, reason:'Resolved bolt'}));
  const result = act(cast, {kind:'resolveCast', actor:'player', note:'Spell targets resolved', results});
  assert.equal(result.status, 'win'); assert.equal(result.player.pendingCast, undefined);
  assert.equal(result.player.spellSlots['3'], 1);
  assert.throws(() => act(result, {kind:'cancelCast', actor:'player', note:'Refund', results:[]}));
  assert.equal(cast.groups[0].hp, 20);
  assert.throws(() => act(cast, {kind:'resolveCast', actor:'player', note:'Invalid resolution',
    results:[results[0], {...results[1], amount:NaN}]}));
  assert.equal(cast.groups[0].hp, 20); assert.ok(cast.player.pendingCast);
});

test('cancelling an unresolved spell returns only its own slot', () => {
  const cast = act(beginCaster(), {kind:'cast', actor:'player', spell:'Shield', level:1});
  const result = act(cast, {kind:'cancelCast', actor:'player', note:'Changed decision before resolving', results:[]});
  assert.equal(result.player.spellSlots['1'], 1); assert.equal(result.player.spellSlots['3'], 2);
  assert.equal(result.player.pendingCast, undefined);
  assert.throws(() => act(result, {kind:'cancelCast', actor:'player', note:'Second refund', results:[]}));
});

test('prepared levels, cantrips, and saved slots are validated without refilling missing values', () => {
  assert.throws(() => act(beginCaster(), {kind:'cast', actor:'player', spell:'Unknown', level:1}));
  assert.throws(() => act(beginCaster(), {kind:'cast', actor:'player', spell:'Bolt', level:1}));
  assert.throws(() => act(beginCaster(), {kind:'cast', actor:'player', spell:'Light', level:1}));
  let light = act(beginCaster(), {kind:'cast', actor:'player', spell:'Light', level:0});
  light = act(light, {kind:'resolveCast', actor:'player', note:'Utility effect resolved', results:[]});
  assert.deepEqual(light.player.spellSlots, {'1':1, '3':2});
  const bad = beginCaster(); bad.player.spellSlots = {};
  assert.throws(() => validateD20Fight(bad));
});

const webCondition = () => ({name:'restrained', escape:{ability:'str', dc:14},
  web:{ac:10, hp:5, defenses:{immunities:['bludgeoning', 'poison', 'psychic'], vulnerabilities:['fire']}}});

test('web escape uses a Strength check and preserves the web after a failed attempt', () => {
  const fight = startD20Fight(combatant('Player', {conditions:[webCondition()]}), encounter([combatant('Enemy')]));
  const failed = act(fight, {kind:'escape', actor:'player', index:0, dice:[1]});
  assert.equal(failed.player.conditions[0].web.hp, 5);
  const escaped = act(failed, {kind:'escape', actor:'player', index:0, dice:[20]});
  assert.equal(escaped.player.conditions.length, 0);
  assert.equal(escaped.player.hp, 20);
});

test('destroying web applies its own defenses without hurting the trapped combatant', () => {
  let fight = startD20Fight(combatant('Player', {conditions:[webCondition()]}), encounter([combatant('Enemy')]));
  fight = act(fight, {kind:'webDamage', target:'player', index:0, amount:20, type:'bludgeoning'});
  assert.equal(fight.player.conditions[0].web.hp, 5);
  fight = act(fight, {kind:'webDamage', target:'player', index:0, amount:3, type:'fire'});
  assert.equal(fight.player.conditions.length, 0); assert.equal(fight.player.hp, 20);
});

test('a named skill escape requires its actual skill bonus', () => {
  const condition = {name:'quicksand', escape:{ability:'str', skill:'athletics', dc:14}};
  const missing = startD20Fight(combatant('Player', {conditions:[condition]}), encounter([combatant('Enemy')]));
  assert.throws(() => act(missing, {kind:'escape', actor:'player', index:0, dice:[10]}));
  const skilled = startD20Fight(combatant('Player', {conditions:[condition], skillBonuses:{athletics:5}}), encounter([combatant('Enemy')]));
  assert.equal(act(skilled, {kind:'escape', actor:'player', index:0, dice:[10]}).player.conditions.length, 0);
});

test('invisibility rolls only while visible and ends when its owner attacks', () => {
  const enemy = combatant('Wisp', {features:{invisibilityRoll:{die:6, minimum:6}, invisibilityEndsOnAttack:true}});
  let fight = startD20Fight(combatant('Player'), encounter([enemy]));
  fight = act(fight, {kind:'startTurn', actor:'enemy0', roll:6});
  assert.equal(fight.groups[0].conditions[0].name, 'invisible');
  const again = d20Action(fight, {kind:'startTurn', actor:'enemy0', expectedRevision:fight.revision},
    () => { throw Error('Already invisible'); });
  assert.equal(again.groups[0].conditions.length, 1);
  fight = act(again, {kind:'attack', actor:'enemy0', target:'player', attackIndex:0, dice:[15, 16], damageDice:[[1]]});
  assert.equal(fight.groups[0].conditions.length, 0);
});

test('martial fury grants one bonus attack and its vulnerability lasts until the next turn', () => {
  const enemy = combatant('Warrior', {features:{martialFury:{firstTurn:true, bonusAttacks:1, selection:{die:6, minimum:5}}}});
  let fight = startD20Fight(combatant('Player'), encounter([enemy]));
  fight = act(fight, {kind:'startTurn', actor:'enemy0'});
  const attack = {kind:'attack', actor:'enemy0', target:'player', attackIndex:0, dice:[15], damageDice:[[1]]};
  fight = act(fight, attack); assert.equal(fight.groups[0].bonusAttacksPending, 1);
  fight = act(fight, attack); assert.equal(fight.groups[0].bonusAttacksPending, 0);
  assert.throws(() => act(fight, attack));
  fight = act(fight, {kind:'attack', actor:'player', target:'enemy0', attackIndex:0, dice:[1, 15], damageDice:[[1]]});
  assert.equal(fight.events.at(-1).check.mode, 'advantage');
  fight = act(fight, {kind:'startTurn', actor:'enemy0'});
  assert.equal(fight.groups[0].martialFuryActive, false);
});

test('weighted ray selection bypasses the melee die when the target is out of reach', () => {
  const enemy = combatant('Ray user', {features:{attackSelection:{die:6, biteMaximum:3, meleeReach:5,
    meleeIndex:0, raysDie:2, rayIndices:[1, 2]}}});
  enemy.attacks.push({...enemy.attacks[0], name:'Ray one'}, {...enemy.attacks[0], name:'Ray two'});
  const fight = startD20Fight(combatant('Player'), encounter([enemy]));
  assert.equal(act(fight, {kind:'selectAttack', actor:'enemy0', target:'player', distance:5, roll:3}).events.at(-1).selection.attackIndex, 0);
  assert.equal(act(fight, {kind:'selectAttack', actor:'enemy0', target:'player', distance:5, roll:4, rayRoll:2}).events.at(-1).selection.attackIndex, 2);
  const ranged = d20Action(fight, {expectedRevision:0, kind:'selectAttack', actor:'enemy0', target:'player', distance:20, rayRoll:1},
    () => { throw Error('Melee selector must be skipped'); });
  assert.equal(ranged.events.at(-1).selection.attackIndex, 1);
});

test('printed ranges are required and long range imposes disadvantage', () => {
  const player = combatant('Player'); player.attacks[0].range = 30; player.attacks[0].longRange = 60;
  const fight = startD20Fight(player, encounter([combatant('Enemy')]));
  assert.throws(() => act(fight, {kind:'attack', actor:'player', target:'enemy0', attackIndex:0}));
  assert.throws(() => act(fight, {kind:'attack', actor:'player', target:'enemy0', attackIndex:0, distance:61}));
  const hit = act(fight, {kind:'attack', actor:'player', target:'enemy0', attackIndex:0, distance:40, dice:[15, 16], damageDice:[[1]]});
  assert.equal(hit.events.at(-1).check.mode, 'disadvantage');
});

test('each printed opening attack resolves once before initiative or the player attack', () => {
  let fight = startD20Fight(combatant('Player'), {...encounter([combatant('Enemy', {count:2})]),
    options:{quicksand:true, enemyOpeningAttack:true}, contextRules:{quicksand:{ability:'str', skill:'athletics', dc:14}}});
  assert.deepEqual(fight.openingAttacks, ['enemy0', 'enemy1']);
  assert.throws(() => act(fight, {kind:'initiative'}));
  assert.throws(() => act(fight, {kind:'attack', actor:'player', target:'enemy0', attackIndex:0}));
  const attack = {kind:'attack', target:'player', attackIndex:0, dice:[15, 16], damageDice:[[1]]};
  fight = act(fight, {...attack, actor:'enemy0'});
  assert.deepEqual(fight.openingAttacks, ['enemy1']);
  assert.throws(() => act(fight, {...attack, actor:'enemy0'}));
  fight = act(fight, {...attack, actor:'enemy1'});
  assert.deepEqual(fight.openingAttacks, []);
  assert.equal(act(fight, {kind:'initiative', dice:[[10], [5], [4]]}).events.at(-1).order.length, 3);
});

test('an ambush opening depends on the player-supplied failed save, not an invented story roll', () => {
  const source = {...encounter([combatant('Enemy')]), options:{enemyOpeningAttackIfFailedDexteritySave:true}};
  assert.deepEqual(startD20Fight(combatant('Player'), source, [], {failedDexteritySave:false}).openingAttacks, []);
  assert.deepEqual(startD20Fight(combatant('Player'), source, [], {failedDexteritySave:true}).openingAttacks, ['enemy0']);
  const ready = {...encounter([combatant('Enemy')]), options:{readyAttack:true}};
  assert.deepEqual(startD20Fight(combatant('Player'), ready).openingAttacks, ['player']);
  assert.deepEqual(startD20Fight(combatant('Player'), ready, [], {readiedAttack:false}).openingAttacks, []);
});

test('a combat boon offers three optional advantaged attacks and resets for another encounter', () => {
  let fight = startD20Fight(combatant('Player'), {...encounter([combatant('Enemy')]), options:{advantagedAttacks:3}});
  for (let i=0; i<3; i++) fight = act(fight, {kind:'attack', actor:'player', target:'enemy0', attackIndex:0,
    useAdvantageCharge:true, dice:[1, 1]});
  assert.equal(fight.player.encounterAdvantageCharges, 0);
  assert.throws(() => act(fight, {kind:'attack', actor:'player', target:'enemy0', attackIndex:0, useAdvantageCharge:true}));
  assert.equal(startD20Fight({...fight.player, encounterAdvantageCharges:3}, encounter([combatant('Enemy')])).player.encounterAdvantageCharges, 0);
});

const arena = () => ({goreRoll:{sides:20, above:12}, goreSave:{ability:'dex', dc:12},
  goreDamage:{amount:1, type:'necrotic'}, nextAttackDisadvantageOnFailedSave:true});

test('arena gore checks once per round and penalizes only the next attack', () => {
  let fight = startD20Fight(combatant('Player'), {...encounter([combatant('Enemy')]), options:{arenaGore:true}, contextRules:{arena:arena()}});
  fight = act(fight, {kind:'arenaGore', actor:'player', roll:13, dice:[1]});
  assert.equal(fight.player.hp, 19); assert.equal(fight.player.nextAttackDisadvantage, true);
  assert.throws(() => act(fight, {kind:'arenaGore', actor:'player', roll:20, dice:[1]}));
  fight = act(fight, {kind:'attack', actor:'player', target:'enemy0', attackIndex:0, dice:[1, 15]});
  assert.equal(fight.events.at(-1).check.mode, 'disadvantage'); assert.equal(fight.player.nextAttackDisadvantage, false);
  fight = act(fight, {kind:'round'});
  fight = act(fight, {kind:'arenaGore', actor:'player', roll:12});
  assert.equal(fight.player.hp, 19);
});

test('incapacitation does not prevent a passive arena hazard from landing', () => {
  const fight = startD20Fight(combatant('Player', {conditions:[{name:'paralyzed'}]}), {
    ...encounter([combatant('Enemy')]), options:{arenaGore:true}, contextRules:{arena:arena()}});
  const result = act(fight, {kind:'arenaGore', actor:'player', roll:20});
  assert.equal(result.player.hp, 19); assert.equal(result.events.at(-1).check.automaticFailure, true);
});

test('bone-floor checks reduce combat movement, spare the owner, and reset next turn', () => {
  const enemy = combatant('Naga', {features:{boneFloor:{check:{ability:'dex', dc:15}, movementLoss:10, immuneToOwnFloor:true}}});
  let fight = startD20Fight(combatant('Player'), encounter([enemy]));
  fight = act(fight, {kind:'boneFloor', actor:'player', dice:[1]});
  fight = act(fight, {kind:'boneFloor', actor:'player', dice:[1]});
  assert.equal(fight.player.movementLostThisTurn, 20);
  assert.throws(() => act(fight, {kind:'boneFloor', actor:'enemy0'}));
  fight = act(fight, {kind:'startTurn', actor:'player'});
  assert.equal(fight.player.movementLostThisTurn, 0);
});

test('Consume Life targets a living zero-HP opponent and heals only after its failed save', () => {
  const enemy = combatant('Wisp', {hp:5, features:{consumeLife:{range:5, save:{ability:'con', dc:10}, healing:10}}});
  const begin = () => startD20Fight(combatant('Player', {hp:0}), encounter([enemy]), [combatant('Companion')]);
  const success = act(begin(), {kind:'consumeLife', actor:'enemy0', target:'player', distance:5, dice:[20]});
  assert.equal(success.groups[0].hp, 5); assert.equal(success.player.dead, undefined);
  const failure = act(begin(), {kind:'consumeLife', actor:'enemy0', target:'player', distance:5, dice:[1]});
  assert.equal(failure.player.dead, true); assert.equal(failure.groups[0].hp, 15);
  assert.throws(() => act(failure, {kind:'heal', target:'player', amount:5, reason:'Ordinary healing'}));
  assert.throws(() => act(failure, {kind:'consumeLife', actor:'enemy0', target:'player', distance:5}));
  assert.throws(() => act(begin(), {kind:'consumeLife', actor:'enemy0', target:'player', distance:6}));
});

test('an explicit temporary AC effect expires at its owner’s next turn start', () => {
  const player = combatant('Player', {conditions:[{name:'shielded',acBonus:5,expiresAtStart:true}]});
  let fight = startD20Fight(player, encounter([combatant('Enemy')]));
  fight = act(fight, {kind:'attack',actor:'enemy0',target:'player',attackIndex:0,dice:[13]});
  assert.equal(fight.player.hp,20); assert.equal(fight.events.at(-1).check.hit,false);
  fight = act(fight, {kind:'startTurn',actor:'player'});
  assert.equal(fight.player.conditions.length,0);
  fight = act(fight, {kind:'attack',actor:'enemy0',target:'player',attackIndex:0,dice:[13],damageDice:[[1]]});
  assert.equal(fight.player.hp,17);
});

test('disintegration at zero HP prevents ordinary healing during a party encounter', () => {
  const ray={name:'Disintegration',kind:'save',save:{ability:'dex',dc:14},damage:[{formula:'30',type:'force'}],disintegratesAtZero:true};
  const fight=startD20Fight(combatant('Player'),encounter([combatant('Ray user',{attacks:[ray]})]),[combatant('Companion')]);
  const result=act(fight,{kind:'attack',actor:'enemy0',target:'player',attackIndex:0,saveDice:[1]});
  assert.equal(result.status,'fighting');assert.equal(result.player.dead,true);
  assert.throws(()=>act(result,{kind:'heal',target:'player',amount:5,reason:'Healing'}));
});

test('Strength-zero death also prevents healing while another party member survives', () => {
  const enemy=combatant('Drainer');enemy.attacks[0].effects=[{kind:'strengthDrain',formula:'1d4'}];
  const fight=startD20Fight(combatant('Player',{abilityScores:{str:1}}),encounter([enemy]),[combatant('Companion')]);
  const result=act(fight,{kind:'attack',actor:'enemy0',target:'player',attackIndex:0,dice:[15],damageDice:[[1]],effectDice:[{damage:[1]}]});
  assert.equal(result.player.dead,true);assert.equal(result.status,'fighting');
  assert.throws(()=>act(result,{kind:'heal',target:'player',amount:5,reason:'Healing'}));
});

test('web cannot repeat on consecutive turns even after the old web is removed', () => {
  const enemy=combatant('Spider',{features:{webSelection:{die:6,minimum:5,webIndex:0,normalIndex:1,noConsecutiveWeb:true,noWebWhileTargetWebbed:true}}});
  enemy.attacks=[{name:'Web',bonus:4,range:30,longRange:60,damage:[],effects:[{kind:'condition',condition:webCondition()}]},enemy.attacks[0]];
  let fight=startD20Fight(combatant('Player'),encounter([enemy]));
  fight=act(fight,{kind:'startTurn',actor:'enemy0'});
  fight=act(fight,{kind:'attack',actor:'enemy0',target:'player',attackIndex:0,distance:10,dice:[15]});
  assert.throws(()=>act(fight,{kind:'attack',actor:'enemy0',target:'player',attackIndex:0,distance:10}));
  fight=act(fight,{kind:'removeCondition',target:'player',index:0,reason:'Cut free'});
  fight=act(fight,{kind:'startTurn',actor:'enemy0'});
  fight=act(fight,{kind:'selectAttack',actor:'enemy0',target:'player',distance:10,roll:6});
  assert.equal(fight.events.at(-1).selection.attackIndex,1);
  fight=act(fight,{kind:'startTurn',actor:'enemy0'});
  fight=act(fight,{kind:'selectAttack',actor:'enemy0',target:'player',distance:10,roll:6});
  assert.equal(fight.events.at(-1).selection.attackIndex,0);
});

test('unrelated restraint is not treated as an existing spider web', () => {
  const enemy=combatant('Spider',{features:{webSelection:{die:6,minimum:5,webIndex:0,normalIndex:1,noConsecutiveWeb:true,noWebWhileTargetWebbed:true}}});
  enemy.attacks.push({...enemy.attacks[0],name:'Bite'});
  const fight=startD20Fight(combatant('Player',{conditions:[{name:'restrained'}]}),encounter([enemy]));
  const result=act(fight,{kind:'selectAttack',actor:'enemy0',target:'player',distance:10,roll:6});
  assert.equal(result.events.at(-1).selection.attackIndex,0);
});
