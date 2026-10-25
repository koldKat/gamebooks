const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync(path.join(__dirname,'../public/js/battlesim/engines/kung-fu.js'))).toString('base64')}`);

const roster = import('./client/battlesim/roster-fixtures.mjs').then(async ({loadFixtureRoster}) => {
  await loadFixtureRoster(772);
  return (await import('../public/js/battlesim/books/772/definition.js')).ROSTER;
});
const foe = async id => (await roster).find(enemy => enemy.id === id);

test('printed corrections clone rather than mutate legacy enemy profiles', async () => {
  const {kungFuEnemy} = await engine;
  const old = {...await foe('steve_train')};
  assert.equal(kungFuEnemy(old).defLeg,27);
  assert.equal(old.defLeg,null);
  assert.equal(kungFuEnemy(await foe('lin_bao_rescue')).defComb,41);
});
test('repelled opening attack alternates with defense and advances the attack cycle only on attacks', async () => {
  const {kungFuAction,advanceKungFuAction} = await engine;
  const d={roundIdx:0};const e=await foe('li_xiao');
  assert.equal(kungFuAction(d,e).move,'combined');
  advanceKungFuAction(d,kungFuAction(d,e),'loss');d.roundIdx++;
  assert.equal(kungFuAction(d,e).type,'defend');
  advanceKungFuAction(d,kungFuAction(d,e),'draw');d.roundIdx++;
  assert.equal(kungFuAction(d,e).move,'combined');
  advanceKungFuAction(d,kungFuAction(d,e),'win');d.roundIdx++;
  assert.equal(kungFuAction(d,e).type,'defend');
});
test('successful opening attack locks continuous attacking', async () => {
  const {kungFuAction,advanceKungFuAction} = await engine;
  const d={roundIdx:0};const e=await foe('li_xiao');
  advanceKungFuAction(d,kungFuAction(d,e),'win');d.roundIdx++;
  assert.equal(kungFuAction(d,e).type,'attack');
});
test('Tun begins combined and alternates attacks without defensive rounds', async () => {
  const {kungFuAction,advanceKungFuAction}=await engine;
  const d={roundIdx:0};const e=await foe('tun_tsin');
  assert.equal(kungFuAction(d,e).move,'combined');
  advanceKungFuAction(d,kungFuAction(d,e),'loss');d.roundIdx++;
  assert.deepEqual(kungFuAction(d,e),{type:'attack',move:'hand'});
});
test('rescue Lin attacks twice then only defends', async () => {
  const {kungFuAction,advanceKungFuAction}=await engine;
  const d={roundIdx:0};const e=await foe('lin_bao_rescue');
  for(let i=0;i<2;i++){assert.equal(kungFuAction(d,e).type,'attack');advanceKungFuAction(d,kungFuAction(d,e),'win');d.roundIdx++;}
  assert.equal(kungFuAction(d,e).type,'defend');
});
test('office guard fight ends after the first lost round',async()=>{
  const {kungFuAction,kungFuDefeated}=await engine;
  assert.equal(kungFuAction({roundIdx:0},await foe('arena_guards')).type,'defend');
  assert.equal(kungFuDefeated({enemyId:'arena_guards',playerResults:['draw','loss']},await foe('arena_guards')),true);
  assert.equal(kungFuDefeated({enemyId:'li_xiao',playerResults:['loss']},await foe('li_xiao')),false);
});
test('additional printed encounters use their specified opening and attack lanes',async()=>{
  const {kungFuAction,advanceKungFuAction}=await engine;
  for(const id of ['kao_lie','arena_rescue_guards']){
    const d={roundIdx:0};const e=await foe(id);
    assert.equal(kungFuAction(d,e).type,'defend');
    advanceKungFuAction(d,kungFuAction(d,e),'draw');d.roundIdx++;
    assert.equal(kungFuAction(d,e).move,id==='kao_lie'?'leg':'combined');
  }
  assert.equal(kungFuAction({roundIdx:0},await foe('park_attackers')).move,'hand');
  assert.equal(kungFuAction({roundIdx:0},await foe('arena_melee_guards')).move,'hand');
});
test('defensive opening keeps alternation even after winning its first attack',async()=>{
  const {kungFuAction,advanceKungFuAction}=await engine;
  const d={roundIdx:0};const e=await foe('dupont_tournament');
  advanceKungFuAction(d,kungFuAction(d,e),'draw');d.roundIdx++;
  advanceKungFuAction(d,kungFuAction(d,e),'win');d.roundIdx++;
  assert.equal(kungFuAction(d,e).type,'defend');
});

test('database patterns preserve both legacy and revised Tun openings and legacy-only passive guards', async () => {
  const {kungFuAction, kungFuLegacyAction, kungFuEnemy} = await engine;
  const tun = await foe('tun_tsin');
  assert.deepEqual(tun.pattern(0), {type:'attack',move:'hand'});
  assert.deepEqual(kungFuAction({roundIdx:0},tun), {type:'attack',move:'combined'});
  const guards = await foe('arena_guards');
  assert.deepEqual(kungFuLegacyAction(guards,5), {type:'defend',move:'passive'});
  assert.deepEqual(kungFuAction({roundIdx:5},guards), {type:'defend',move:'aggressive'});
  const steve = await foe('steve_train');
  assert.equal(kungFuEnemy(steve,false).defLeg,null);
  assert.equal(kungFuEnemy(steve).defLeg,27);
  assert.equal(steve.defLeg,null);
});
