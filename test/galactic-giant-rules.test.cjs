const { readRosterDocument } = require('./helpers/roster-db.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { readFileSync: readSimulatorSource } = require('./client/battlesim/simulator-source.mjs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/js/battlesim/engines/galactic-giant.js'), 'utf8');
const rosterSeed = readRosterDocument(877);
const ruleFor = id => rosterSeed.enemies.find(row=>row.key===id).stats.entry;
const engine = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64')).then(api=>({
  ...api, resolveGalacticDuel:(id,...args)=>api.resolveGalacticDuel(ruleFor(id),...args),
}));
const player = (sila = 12, zhivot = 18, esper = 10) => ({ sila, zhivot, esper });
const dice = values => () => { assert.ok(values.length, 'unexpected roll'); return values.shift(); };
async function controller(stats = player()) {
  const { resolveGalacticEncounter } = await engine;
  const definition=await import('../public/js/battlesim/books/877/definition.js');
  await definition.loadRoster(async()=>({ok:true,json:async()=>rosterSeed.enemies}));
  const saved = { encounterId: 'robotrak', player: stats, log: ['old'], history: [{ outcome: 'win', ts: 1 }] };
  const elements = { 'sim877-flee': { checked: false } };
  const code = readSimulatorSource(path.join(__dirname, '../public/js/battlesim/battlesim877.js'), 'utf8')
    .replace(/^import .*;$/gm, '').replaceAll('export function', 'function');
  const context = vm.createContext({ currentPlaythrough: () => ({ sim877: saved }), saveState: () => {},
    document: { getElementById: id => elements[id] }, t: key => key, showAlert: () => {},
    resolveGalacticEncounter, Math: Object.create(Math),
    createRosterLoader:(_id,_dataset,install)=>{install(structuredClone(definition.ROSTER));return async()=>{};} });
  vm.runInContext(code + '\n_renderAll=()=>{};globalThis.subject={data:_data,fight:_fight,roll:_rollSila,roster:ROSTER,resolve:resolveGalacticEncounter};', context);
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
    const result = subject.resolve(encounter,player(strength,life));
    assert.equal(result.key,key); assert.equal(result.cost.zhivot || 0,0); assert.equal(result.section,161);
  }
});
test('first web retains its printed knife, three-life and five-life branches', async () => {
  const { subject } = await controller();
  const encounter = subject.roster.find(row => row.id === 'web1');
  for (const [strength,life,cost] of [[18,18,0],[12,18,3],[5,18,5]]) {
    const result = subject.resolve(encounter,player(strength,life));
    assert.equal(result.cost.zhivot || 0,cost); assert.equal(result.section,74);
  }
});
test('medusa undefined equality boundary produces no invented result', async () => {
  const { subject } = await controller();
  const encounter = subject.roster.find(row => row.id === 'medusa');
  assert.equal(subject.resolve(encounter,player(8,17)).outcome,'manual');
  assert.equal(subject.resolve(encounter,player(7,18)).outcome,'manual');
  assert.equal(subject.resolve(encounter,player(8,18)).section,43);
  assert.equal(subject.resolve(encounter,player(7,17)).section,56);
  assert.equal(subject.resolve(encounter,player(9,17)).section,197);
});
test('spider equality is a continuation, not a victory', async () => {
  const { subject } = await controller();
  assert.equal(subject.resolve(subject.roster.find(row => row.id === 'robotspider'),player(12,18)).outcome,'draw');
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
test('comparison thresholds and destinations are supplied by catalog data rather than enemy IDs',async()=>{
  const {resolveGalacticEncounter}=await engine;
  const spec=structuredClone(ruleFor('robotrak'));spec.id='custom-crab';spec.threshold=1;spec.results.success.section=999;
  assert.equal(resolveGalacticEncounter(spec,player(2)).section,999);
  spec.threshold=100;
  assert.equal(resolveGalacticEncounter(spec,player(2)).outcome,'draw');
});
test('tank equality continues while the large two-headed equality loses',async()=>{
  const {resolveGalacticEncounter}=await engine;
  assert.equal(resolveGalacticEncounter(ruleFor('robottank'),player(18),null,false,dice([1,1])).section,119);
  assert.equal(resolveGalacticEncounter(ruleFor('robottank'),player(19),null,false,dice([1,1])).section,133);
  assert.equal(resolveGalacticEncounter(ruleFor('bigtwoheaded'),player(8,12)).section,106);
  assert.equal(resolveGalacticEncounter(ruleFor('bigtwoheaded'),player(9,12)).section,64);
});
test('the randomized two-headed tie and snake-wall boundaries retain their printed outcomes',async()=>{
  const {resolveGalacticEncounter}=await engine;
  assert.equal(resolveGalacticEncounter(ruleFor('twoheaded'),player(4,8),null,false,dice([1,1])).section,137);
  assert.equal(resolveGalacticEncounter(ruleFor('snakewall1'),player(12,15,10)).section,214);
  assert.equal(resolveGalacticEncounter(ruleFor('snakewall1'),player(12,16,10)).section,34);
});
test('pending duels preserve their existing enemy attributes and unrelated saved fields',async()=>{
  const {resolveGalacticDuel}=await engine;
  const previous={enemyStrength:6,enemyLife:7,rounds:10,legacyMarker:'keep'};
  const copy=JSON.stringify(previous);
  const value=resolveGalacticDuel('goraoktopod',player(6,7),previous,false,()=>3,1);
  assert.equal(value.pending.enemyStrength,6);assert.equal(value.pending.enemyLife,7);
  assert.equal(value.pending.legacyMarker,'keep');assert.equal(JSON.stringify(previous),copy);
});
