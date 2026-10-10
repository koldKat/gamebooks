const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync(path.join(__dirname,'../public/js/battlesim/engines/kung-fu.js'))).toString('base64')}`);

test('printed corrections clone rather than mutate legacy enemy profiles', async () => {
  const {kungFuEnemy} = await engine;
  const old = {id:'steve_train',defLeg:null};
  assert.equal(kungFuEnemy(old).defLeg,27);
  assert.equal(old.defLeg,null);
  assert.equal(kungFuEnemy({id:'lin_bao_rescue',defComb:null}).defComb,41);
});
test('repelled opening attack alternates with defense and advances the attack cycle only on attacks', async () => {
  const {kungFuAction,advanceKungFuAction} = await engine;
  const d={roundIdx:0};const e={id:'li_xiao'};
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
  const d={roundIdx:0};const e={id:'li_xiao'};
  advanceKungFuAction(d,kungFuAction(d,e),'win');d.roundIdx++;
  assert.equal(kungFuAction(d,e).type,'attack');
});
test('Tun begins combined and alternates attacks without defensive rounds', async () => {
  const {kungFuAction,advanceKungFuAction}=await engine;
  const d={roundIdx:0};const e={id:'tun_tsin'};
  assert.equal(kungFuAction(d,e).move,'combined');
  advanceKungFuAction(d,kungFuAction(d,e),'loss');d.roundIdx++;
  assert.deepEqual(kungFuAction(d,e),{type:'attack',move:'hand'});
});
test('rescue Lin attacks twice then only defends', async () => {
  const {kungFuAction,advanceKungFuAction}=await engine;
  const d={roundIdx:0};const e={id:'lin_bao_rescue'};
  for(let i=0;i<2;i++){assert.equal(kungFuAction(d,e).type,'attack');advanceKungFuAction(d,kungFuAction(d,e),'win');d.roundIdx++;}
  assert.equal(kungFuAction(d,e).type,'defend');
});
test('office guard fight ends after the first lost round',async()=>{
  const {kungFuAction,kungFuDefeated}=await engine;
  assert.equal(kungFuAction({roundIdx:0},{id:'arena_guards'}).type,'defend');
  assert.equal(kungFuDefeated({enemyId:'arena_guards',playerResults:['draw','loss']}),true);
  assert.equal(kungFuDefeated({enemyId:'li_xiao',playerResults:['loss']}),false);
});
test('additional printed encounters use their specified opening and attack lanes',async()=>{
  const {kungFuAction,advanceKungFuAction}=await engine;
  for(const id of ['kao_lie','arena_rescue_guards']){
    const d={roundIdx:0};const e={id};
    assert.equal(kungFuAction(d,e).type,'defend');
    advanceKungFuAction(d,kungFuAction(d,e),'draw');d.roundIdx++;
    assert.equal(kungFuAction(d,e).move,id==='kao_lie'?'leg':'combined');
  }
  assert.equal(kungFuAction({roundIdx:0},{id:'park_attackers'}).move,'hand');
  assert.equal(kungFuAction({roundIdx:0},{id:'arena_melee_guards'}).move,'hand');
});
test('defensive opening keeps alternation even after winning its first attack',async()=>{
  const {kungFuAction,advanceKungFuAction}=await engine;
  const d={roundIdx:0};const e={id:'dupont_tournament'};
  advanceKungFuAction(d,kungFuAction(d,e),'draw');d.roundIdx++;
  advanceKungFuAction(d,kungFuAction(d,e),'win');d.roundIdx++;
  assert.equal(kungFuAction(d,e).type,'defend');
});
