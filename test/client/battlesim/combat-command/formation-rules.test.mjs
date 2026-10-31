import test from 'node:test';
import assert from 'node:assert/strict';
import { formationUnits, formationEngagedCount, formationAttackStrength,
  formationCasualties, formationMoraleResult } from '../../../../public/js/battlesim/engines/combat-command/formation-rules.js';

const unit = (key, count = 10, values = {}) => ({ key, name: key, count,
  initialCount: count, ordnance: 2, melee: 7, morale: 10, ...values });
const restored = value => JSON.parse(JSON.stringify(value));

test('a combined volley sums surviving strength before one chart roll', () => {
  const units = [unit('a', 3), unit('b', 4), unit('c', 5)];
  assert.equal(formationAttackStrength(units, units.map(u => ({key:u.key, stat:'ordnance', multiplier:2})), 1), 48);
  units[0].count = 1;
  assert.equal(formationAttackStrength(units, units.map(u => ({key:u.key, stat:'ordnance', multiplier:2})), 1), 40);
});
test('pikes and a doubled cavalry charge combine without doubling the pikes', () => {
  const units = [unit('first', 8), unit('second', 10), unit('cavalry', 10, {melee:5})];
  assert.equal(formationAttackStrength(units, [{key:'first',stat:'melee'},
    {key:'second',stat:'melee'},{key:'cavalry',stat:'melee',multiplier:2}], 1), 226);
});
test('a fresh arrival replaces a killed engaged bandit without bringing dead men back', () => {
  const bandits = unit('bandits', 10, {count:9, melee:5});
  const schedule = {initial:1,increment:1};
  assert.equal(formationEngagedCount(bandits, 1, schedule), 0);
  assert.equal(formationEngagedCount(bandits, 2, schedule), 1);
  const result = formationCasualties([bandits], 3, {targets:['bandits'],round:2,engagements:{bandits:schedule}});
  assert.equal(result.applied, 1);
  assert.equal(result.units[0].count, 8);
  assert.equal(formationEngagedCount(result.units[0], 2, schedule), 0);
  assert.equal(formationEngagedCount(result.units[0], 3, schedule), 1);
});
test('the first reserve arrives in round three and then every other round', () => {
  const bandits = unit('bandits', 8), schedule = {initial:1,increment:1,every:2};
  assert.deepEqual([1,2,3,4,5,6].map(round => formationEngagedCount(bandits, round, schedule)), [1,1,2,2,3,3]);
});
test('a separately scheduled reserve cannot fire or take damage before arrival', () => {
  const reserve = unit('reserve', 7), schedule = {fromRound:2,initial:7};
  assert.equal(formationAttackStrength([reserve],[{key:'reserve',stat:'melee'}],1,{reserve:schedule}), 0);
  const result = formationCasualties([reserve],8,{targets:['reserve'],engagements:{reserve:schedule}});
  assert.equal(result.applied,0);assert.equal(result.units[0].count,7);
  assert.equal(formationEngagedCount(reserve,2,schedule),7);
});
test('an omitted initial count is saved before first casualties so dead engaged men stay dead', () => {
  const bandits=unit('bandits',10),schedule={initial:1,increment:1};
  delete bandits.initialCount;
  const first=formationCasualties([bandits],1,{targets:['bandits'],engagements:{bandits:schedule}});
  assert.equal(first.units[0].initialCount,10);
  const resumed=restored(first.units);
  assert.equal(formationEngagedCount(resumed[0],1,schedule),0);
  assert.equal(formationEngagedCount(resumed[0],2,schedule),1);
  assert.equal(bandits.initialCount,undefined);
});
test('every casualty reduces friendly morale before the next attack, with one check for the attack', () => {
  const input=[unit('pikes',10,{morale:11,moraleLoss:{per:1}})], before=restored(input);
  const result=formationCasualties(input,3,{targets:['pikes']});
  assert.deepEqual(input,before);assert.equal(result.units[0].morale,8);
  assert.deepEqual(result.checks,[{kind:'morale',key:'pikes',morale:8,decrease:3}]);
});
test('ten-casualty morale carries across attacks and JSON reload without reapplying earlier losses', () => {
  let units=[unit('enemy',80,{count:71,morale:9,moraleLoss:{per:10},casualtyRemainder:9})];
  let result=formationCasualties(restored(units),2,{targets:['enemy']});
  assert.equal(result.units[0].morale,8);assert.equal(result.units[0].casualtyRemainder,1);
  result=formationCasualties(restored(result.units),8,{targets:['enemy']});
  assert.equal(result.units[0].morale,8);assert.equal(result.checks.length,0);
  result=formationCasualties(restored(result.units),1,{targets:['enemy']});
  assert.equal(result.units[0].morale,7);assert.equal(result.units[0].casualtyRemainder,0);
});
test('a two-ten-casualty attack reduces morale twice but queues one immediate check', () => {
  const result=formationCasualties([unit('enemy',80,{morale:9,moraleLoss:{per:10},casualtyRemainder:9})],12,{targets:['enemy']});
  assert.equal(result.units[0].morale,7);assert.equal(result.checks.length,1);
});
test('destroyed troops do not consume a morale roll; surviving zero morale troops still fail normally', () => {
  const result=formationCasualties([unit('a',2,{morale:1,moraleLoss:{per:1}})],5,{targets:['a']});
  assert.equal(result.checks.length,0);
  const remaining=formationCasualties([unit('a',3,{morale:1,moraleLoss:{per:1}})],2,{targets:['a']});
  assert.equal(remaining.units[0].morale,0);
  assert.equal(formationMoraleResult(remaining.units,'a',2).passed,false);
});
test('a morale tie holds; a higher result routs and excludes the unit from later strength', () => {
  const input=[unit('a',10,{morale:7})];
  assert.equal(formationMoraleResult(input,'a',7).passed,true);
  const result=formationMoraleResult(restored(input),'a',8);
  assert.equal(result.units[0].retired,'routed');assert.equal(input[0].retired,undefined);
  assert.equal(formationAttackStrength(result.units,[{key:'a',stat:'melee'}],1),0);
});
test('printed pike casualty priority spills only after the first pikes are eliminated', () => {
  const input=[unit('first',2),unit('second',8),unit('archers',10)];
  const result=formationCasualties(input,5,{targets:['first','second'],mode:'ordered'});
  assert.deepEqual(result.units.map(u=>u.count),[0,5,10]);
  assert.throws(()=>formationCasualties(input,5,{targets:['first','second'],mode:'ordered',allocation:{first:1,second:4}}));
});
test('unspecified casualty allocation requires a player choice and validates every target', () => {
  const input=[unit('nelson',1),unit('spears',6)];
  assert.throws(()=>formationCasualties(input,1,{targets:['nelson','spears']}));
  const result=formationCasualties(input,1,{targets:['nelson','spears'],allocation:{spears:1}});
  assert.deepEqual(result.units.map(u=>u.count),[1,5]);
  for(const allocation of [{spears:2},{nelson:2},{other:1},{spears:-1},{spears:0.5}]) {
    assert.throws(()=>formationCasualties(input,1,{targets:['nelson','spears'],allocation}));
  }
});
test('even pike losses require an explicit choice for an odd remainder', () => {
  const input=[unit('first'),unit('second')];
  assert.deepEqual(formationCasualties(input,4,{targets:['first','second'],mode:'even'}).units.map(u=>u.count),[8,8]);
  assert.throws(()=>formationCasualties(input,3,{targets:['first','second'],mode:'even'}));
  assert.deepEqual(formationCasualties(input,3,{targets:['first','second'],mode:'even',allocation:{first:1,second:2}}).units.map(u=>u.count),[9,8]);
  assert.throws(()=>formationCasualties(input,3,{targets:['first','second'],mode:'even',allocation:{first:0,second:3}}));
});
test('any positive musket hit wipes out grenadiers; zero hits leaves them intact', () => {
  const units=[unit('grenadiers',4)];
  assert.equal(formationCasualties(units,1,{targets:['grenadiers'],mode:'wipe-on-hit'}).units[0].count,0);
  assert.equal(formationCasualties(units,0,{targets:['grenadiers'],mode:'wipe-on-hit'}).units[0].count,4);
});
test('unknown printed values remain null and cannot be used as a guessed zero', () => {
  const units=formationUnits([unit('unknown',2,{melee:null,morale:null})]);
  assert.throws(()=>formationAttackStrength(units,[{key:'unknown',stat:'melee'}],1));
  assert.throws(()=>formationMoraleResult(units,'unknown',7));
  assert.equal(formationAttackStrength(units,[{key:'unknown',stat:'ordnance'}],1),4);
});
test('invalid unit and formation data fail without mutating their inputs', () => {
  const units=[unit('a')],before=restored(units);
  assert.throws(()=>formationUnits([unit('a'),unit('a')]));
  assert.throws(()=>formationUnits([unit('a',10,{moraleLoss:{per:0}})]));
  assert.throws(()=>formationUnits([unit('a',10,{moraleLoss:{per:10},casualtyRemainder:10})]));
  assert.throws(()=>formationAttackStrength(units,[{key:'a',stat:'melee'},{key:'a',stat:'melee'}],1));
  assert.throws(()=>formationCasualties(units,-1,{targets:['a']}));
  assert.throws(()=>formationCasualties(units,1,{targets:['missing']}));
  assert.deepEqual(units,before);
});
