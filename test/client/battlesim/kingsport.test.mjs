import test from 'node:test';
import assert from 'node:assert/strict';
import { KINGSPORT_ENCOUNTERS, createKingsportCharacter, createKingsportFight, rollKingsportRound, improviseKingsport } from '../../../public/js/battlesim/engines/kingsport.js';
const player = (values = {}) => ({ ...createKingsportCharacter('lucius'), ...values });
const rng = (...dice) => { let i = 0; return () => ((dice[i++] ?? 1) - .5) / 6; };
test('all eleven encounters and source-backed investigator defaults are present', () => {
  assert.equal(KINGSPORT_ENCOUNTERS.length,11);
  assert.equal(new Set(KINGSPORT_ENCOUNTERS.map(e=>e.section)).size,11);
  const p=createKingsportCharacter('jacqueline');assert.deepEqual([p.willpower,p.intellect,p.combat,p.health,p.sanity,p.clues,p.resources],[5,3,2,6,9,1,1]);
  assert.deepEqual([player().willpower,player().intellect,player().combat,player().health,player().sanity],[2,4,1,8,6]);
  assert.equal(p.agile,true);assert.equal(p.cautious,false);
  const lola=createKingsportCharacter('lola');assert.equal(lola.cautious,true);assert.equal(lola.agile,false);
});
test('round 21 changes skills between rounds and copies the player',()=>{
  const p=player({combat:2,willpower:5}),f=createKingsportFight(21,p);
  assert.equal(rollKingsportRound(f,{},rng(5,6)).modifier,2);
  assert.equal(rollKingsportRound(f,{},rng(5,6)).modifier,7);
  assert.equal(f.status,'win');assert.equal(f.destination,36);assert.deepEqual(p,player({combat:2,willpower:5}));
});
test('alternative abilities and alternative weaknesses never stack',()=>{
  const f=createKingsportFight(245,player({combat:3,willpower:3,agile:true,survivor:true,arachnophobia:true,cautious:true}));
  assert.equal(rollKingsportRound(f,{},rng(1,2)).modifier,6);
  assert.equal(rollKingsportRound(f,{},rng(1,2)).modifier,5);
});
test('section 37 forbids invented resource spending',()=>{
  const f=createKingsportFight(37,player({resources:5})),before=structuredClone(f);
  assert.equal(rollKingsportRound(f,{resource:true},()=>{throw Error('rolled');}),null);assert.deepEqual(f,before);
});
test('momentum uses printed one, two and three point bonuses',()=>{
  const f=createKingsportFight(245,player({combat:10,willpower:10}));
  assert.deepEqual(Array.from({length:4},()=>rollKingsportRound(f,{},rng(1,2)).modifier),[20,22,22,23]);
  assert.equal(f.destination,71);
});
test('negative health and sanity penalize the appropriate skills without invented death',()=>{
  const f=createKingsportFight(21,player({combat:4,willpower:5,health:-2,sanity:-3}));
  assert.equal(rollKingsportRound(f,{},rng(1,2)).modifier,2);
  assert.equal(rollKingsportRound(f,{},rng(1,2)).modifier,4);
});
test('Jacqueline doubles fail even with enough points and add Doom',()=>{
  const f=createKingsportFight(21,{...createKingsportCharacter('jacqueline'),combat:30});
  const r=rollKingsportRound(f,{},rng(6,6));assert.equal(r.success,false);assert.equal(r.darkFuture,true);assert.equal(f.player.doom,1);
  assert.equal(rollKingsportRound(f,{},rng(5,6)).success,true);assert.equal(f.player.doom,1);
});
test('Lola pays one resource and checks Crisis once before skill penalties',()=>{
  const f=createKingsportFight(135,player({profile:'lola',resources:2,combat:3,willpower:3,sanity:0}));
  const r=rollKingsportRound(f,{resource:true},rng(5,6,1));assert.equal(r.crisis,1);assert.equal(f.player.sanity,-1);assert.equal(f.player.resources,1);assert.equal(r.modifier,7);
});
test('published Crisis of Identity does not penalize rolls two through six',()=>{
  for(let die=2;die<=6;die++){
    const f=createKingsportFight(135,player({profile:'lola',resources:1,sanity:0}));
    const r=rollKingsportRound(f,{resource:true},rng(5,6,die));
    assert.equal(r.crisis,die);assert.equal(f.player.sanity,0);assert.equal(f.player.resources,0);
  }
});
test('published Calling Card retains the acquired ability across encounters',()=>{
  const f=createKingsportFight(21,player({profile:'lola'}));
  assert.equal(rollKingsportRound(f,{card:'agile'},rng(1,2)).modifier,2);assert.equal(f.player.cardUsed,true);assert.equal(f.player.agile,true);
  const next=createKingsportFight(21,f.player);assert.equal(next.player.agile,true);
  assert.equal(rollKingsportRound(next,{},rng(1,2)).modifier,2);
  const before=structuredClone(f);assert.equal(rollKingsportRound(f,{card:'fighter'},()=>{throw Error('rolled');}),null);assert.deepEqual(f,before);
});
test('Improvisation is free once and subsequent uses pay and check Crisis',()=>{
  const p=player({profile:'lola',resources:1});assert.equal(improviseKingsport(p,'combat','intellect').crisis,null);
  assert.equal(p.resources,1);assert.equal(p.combat,2);assert.equal(p.intellect,3);
  assert.equal(improviseKingsport(p,'combat','intellect',rng(1)).crisis,1);assert.equal(p.resources,0);assert.equal(p.sanity,5);
  const before={...p};assert.equal(improviseKingsport(p,'combat','intellect'),null);assert.deepEqual(p,before);
});
test('section149 retains distinct outcomes for every number of wins',()=>{
  for(let wins=0;wins<=3;wins++){
    const f=createKingsportFight(149,player());for(let i=0;i<3;i++){f.player.combat=i<wins?30:-30;rollKingsportRound(f,{},rng(1,2));}
    assert.equal(f.destination,[168,185,205,221][wins]);assert.equal(f.status,wins>=2?'win':'loss');
  }
});
test('section245 does not invent the missing two-win outcome or award a victory',()=>{
  const f=createKingsportFight(245,player());for(let i=0;i<4;i++){f.player.combat=i<2?30:-30;rollKingsportRound(f,{},rng(1,2));}
  assert.equal(f.status,'unresolved');assert.equal(f.destination,null);assert.equal(f.recorded,false);
});
test('invalid resource, card and random choices leave the fight unchanged',()=>{
  const f=createKingsportFight(21,player()),before=structuredClone(f);
  assert.equal(rollKingsportRound(f,{resource:true}),null);assert.equal(rollKingsportRound(f,{card:'agile'}),null);
  assert.throws(()=>rollKingsportRound(f,{},()=>1));assert.deepEqual(f,before);
  assert.throws(()=>createKingsportFight(999,player()));assert.throws(()=>createKingsportFight(21,player({resources:-1})));
});
