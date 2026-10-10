const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/js/battlesim/engines/galactic-giant.js'), 'utf8');
const engine = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const player = (sila = 12, zhivot = 18, esper = 10) => ({ sila, zhivot, esper });
const dice = values => () => { assert.ok(values.length, 'unexpected roll'); return values.shift(); };
async function controller(stats = player()) {
  const { resolveGalacticDuel } = await engine;
  const saved = { encounterId: 'robotrak', player: stats, log: ['old'], history: [{ outcome: 'win', ts: 1 }] };
  const elements = { 'sim877-flee': { checked: false } };
  const code = fs.readFileSync(path.join(__dirname, '../public/js/battlesim/battlesim877.js'), 'utf8')
    .replace(/^import .*;$/gm, '').replaceAll('export function', 'function');
  const context = vm.createContext({ currentPlaythrough: () => ({ sim877: saved }), saveState: () => {},
    document: { getElementById: id => elements[id] }, t: key => key, showAlert: () => {},
    resolveGalacticDuel, Math: Object.create(Math) });
  vm.runInContext(code + '\n_renderAll=()=>{};globalThis.subject={data:_data,fight:_fight,roll:_rollSila,roster:ROSTER};', context);
  return { saved, context, subject: context.subject, elements };
}
test('opening legacy saved state does not change stats, history or settings', async () => {
  const { saved, subject } = await controller();
  const snapshot = JSON.stringify(saved);
  subject.data();
  assert.equal(JSON.stringify(saved), snapshot);
});
test('future initial strength roll includes the printed +6', async () => {
  const { saved, context, subject } = await controller();
  context.Math.random = () => 0;
  subject.roll(); assert.equal(saved.player.sila, 8);
  context.Math.random = () => .999;
  subject.roll(); assert.equal(saved.player.sila, 18);
});
test('crab escape is not death and persists two lost life points', async () => {
  const { saved, subject } = await controller(player(10, 18));
  subject.fight(); assert.equal(saved.player.zhivot, 16); assert.equal(saved.history.at(-1).outcome, 'draw');
});
test('all second-web branches have zero life damage', async () => {
  const { subject } = await controller();
  const encounter = subject.roster.find(row => row.id === 'web2');
  for (const [strength, life, key] of [[18,18,'web2_one'], [12,18,'web2_two'], [5,18,'web2_choice']]) {
    const result = encounter.resolve(player(strength,life));
    assert.equal(result.key,key); assert.equal(result.cost.zhivot || 0,0); assert.equal(result.section,161);
  }
});
test('first web retains its printed knife, three-life and five-life branches', async () => {
  const { subject } = await controller();
  const encounter = subject.roster.find(row => row.id === 'web1');
  for (const [strength,life,cost] of [[18,18,0],[12,18,3],[5,18,5]]) {
    const result = encounter.resolve(player(strength,life));
    assert.equal(result.cost.zhivot || 0,cost); assert.equal(result.section,74);
  }
});
test('medusa undefined equality boundary produces no invented result', async () => {
  const { subject } = await controller();
  const encounter = subject.roster.find(row => row.id === 'medusa');
  assert.equal(encounter.resolve(player(8,17)).outcome,'manual');
  assert.equal(encounter.resolve(player(7,18)).outcome,'manual');
  assert.equal(encounter.resolve(player(8,18)).section,43);
  assert.equal(encounter.resolve(player(7,17)).section,56);
  assert.equal(encounter.resolve(player(9,17)).section,197);
});
test('spider equality is a continuation, not a victory', async () => {
  const { subject } = await controller();
  assert.equal(subject.roster.find(row => row.id === 'robotspider').resolve(player(12,18)).outcome,'draw');
});
test('printed life threshold takes precedence over an apparent win', async () => {
  const { saved, subject } = await controller(player(40,6));
  saved.encounterId='snakewall2'; saved.player.esper=13;
  subject.fight(); assert.equal(saved.player.zhivot,1); assert.equal(saved.history.at(-1).outcome,'loss');
});
test('two-headed advantage above ten is manual and adds no history outcome', async () => {
  const { saved, subject, context } = await controller(player(30,18));
  saved.encounterId='twoheaded'; context.Math.random=()=>0;
  subject.fight(); assert.equal(saved.history.length,1); assert.equal(saved.player.zhivot,18);
});
test('strength-phase victory ends octopus fight before any life dice', async () => {
  const { resolveGalacticDuel } = await engine;
  const result=resolveGalacticDuel('goraoktopod',player(24),null,false,dice([6,1]));
  assert.equal(result.outcome,'win'); assert.equal(result.section,4); assert.equal(result.cost.zhivot,0);
});
test('octopus strength losses are returned for persistent character updates', async () => {
  const { resolveGalacticDuel } = await engine;
  const result=resolveGalacticDuel('goraoktopod',player(),null,false,dice([1,2,1,1]),1);
  assert.equal(result.outcome,'pending'); assert.equal(result.cost.sila,1); assert.equal(result.cost.zhivot,0);
});
test('ties pause without invented defeat and resume the same enemy and round', async () => {
  const { resolveGalacticDuel } = await engine;
  const result=resolveGalacticDuel('invisiblerobot',player(20),null,false,()=>3,2);
  assert.equal(result.outcome,'pending'); assert.equal(result.pending.rounds,2); assert.equal(result.cost.sila,0);
  const resumed=resolveGalacticDuel('invisiblerobot',player(20),result.pending,false,dice([6,1]),1);
  assert.equal(resumed.pending.rounds,3); assert.equal(resumed.pending.enemyStrength,15);
});
test('retreat below ten is an explicit choice, not forced', async () => {
  const { resolveGalacticDuel } = await engine;
  const previous={enemyStrength:8,enemyLife:18,rounds:0};
  assert.equal(resolveGalacticDuel('invisiblerobot',player(9),previous,true,dice([])).section,179);
  assert.equal(resolveGalacticDuel('invisiblerobot',player(9),previous,false,dice([6,1]),1).outcome,'pending');
});
test('existing pending duels cannot reroll strength', async () => {
  const { saved,subject }=await controller(); saved.pendingDuel={state:{rounds:256}};
  subject.roll(); assert.equal(saved.player.sila,12);
});
test('an already dead player cannot fight or gain a history win', async () => {
  const { saved,subject }=await controller(player(30,2)); subject.fight(); assert.equal(saved.history.length,1);
});
