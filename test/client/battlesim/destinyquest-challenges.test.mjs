import test from 'node:test';
import assert from 'node:assert/strict';
import {WINTER_ENCOUNTERS as roster} from './destinyquest-fixtures.mjs';
import {createDestinySession, beginDestinySession, applyDestinySessionAction} from '../../../public/js/battlesim/engines/destinyquest/session.js';
import {beginDestinyChallenge as begin, applyDestinyChallengeAction as action} from '../../../public/js/battlesim/engines/destinyquest/challenges.js';

const rolls=(...v)=>()=>{assert.ok(v.length,'Unexpected dice');return v.shift();};
const setup=(section,extra={})=>({section,hero:{speed:0,brawn:0,magic:0,armour:0,health:30},abilities:{},...extra});
const start=(section,extra={},options={})=>begin(createDestinySession(),setup(section,extra),{roster,outcomeId:'challenge-1',...options});
const turn=(session,...values)=>action(action(session,'challenge-roll',{roll:rolls(...values)}),'challenge-resolve',{timestamp:123});
const save=s=>JSON.parse(JSON.stringify(s));

test('seven successful acorn tests reach the top and only the last resolves the challenge',()=>{
  let session=start(35,{hero:{speed:3}});
  for(let i=1;i<=7;i++){session=turn(save(session),6,6);assert.equal(session.challenge.turns,i);assert.equal(session.challenge.status,i<7?'active':'finished');}
  assert.equal(session.challenge.destination,'597');assert.equal(session.history.length,1);assert.equal(session.history[0].outcome,'success');
  assert.equal(session.character.defeats,0);assert.deepEqual(session.character.outcomeIds,[]);
  assert.throws(()=>action(session,'challenge-resolve'),/No active/);
});

test('the third missed acorn ends early and does not count as a battle defeat',()=>{
  let session=start(35);session=turn(turn(turn(session,1,1),1,1),1,1);
  assert.equal(session.challenge.turns,3);assert.equal(session.challenge.destination,'159');assert.equal(session.challenge.outcome,'failure');
  assert.equal(session.character.defeats,0);assert.equal(session.history.length,1);
});

test('mixed results retain the cumulative miss count across a saved visit',()=>{
  let session=start(35,{hero:{speed:4}});session=turn(session,1,1);session=turn(save(session),6,6);
  session=turn(save(session),1,1);assert.equal(session.challenge.failures,2);assert.equal(session.challenge.status,'active');
  session=turn(save(session),1,1);assert.equal(session.challenge.destination,'159');
});

test('Ice Hooks shortens the tree climb to five turns without changing speed or spending uses',()=>{
  let session=start(35,{hero:{speed:3},abilities:{'ice-hooks':1}});
  assert.equal(session.challenge.rules.turns,5);assert.equal(session.challenge.attribute,3);
  for(let i=0;i<5;i++)session=turn(session,6,6);assert.equal(session.challenge.destination,'597');
  assert.deepEqual(session.setup.abilities,{'ice-hooks':1});
});

test('Leif adds two to each die total and combines with Ice Hooks',()=>{
  let session=start(35,{hero:{speed:1},abilities:{'ice-hooks':1}},{leif:true});session=turn(session,6,6);
  assert.equal(session.challenge.history[0].total,15);assert.equal(session.challenge.failures,0);assert.equal(session.challenge.rules.turns,5);
});

test('ordinary ice climb succeeds on the exact threshold and fails below it',()=>{
  const success=turn(start(67,{hero:{speed:2}}),6,6);assert.equal(success.challenge.destination,'174');
  const failure=turn(start(67,{hero:{speed:1}}),6,6);assert.equal(failure.challenge.destination,'535');
});

test('the ice climb bonus from Ice Hooks is optional and leaves the inventory intact',()=>{
  const config={hero:{speed:0},abilities:{'ice-hooks':1}};
  assert.equal(turn(start(67,config),4,4).challenge.destination,'174');
  assert.equal(turn(start(67,config,{useOptionalAbilities:false}),4,4).challenge.destination,'535');
  assert.deepEqual(start(67,config,{useOptionalAbilities:false}).setup.abilities,{'ice-hooks':1});
});

test('a disabled equipped Ice Hooks ability cannot provide a challenge bonus',()=>{
  const session=begin(createDestinySession({character:{penalties:['crippled']}}),setup(67,{
    abilities:{'ice-hooks':1},equipment:{feet:{abilities:['ice-hooks']}}}),{roster,outcomeId:'x'});
  assert.equal(session.challenge.rules.threshold,14);assert.equal(session.setup.abilities['ice-hooks'],1);
});

test('rolled challenge dice survive reload and cannot be replaced or cancelled before resolution',()=>{
  const original=start(67,{hero:{speed:2}}),before=structuredClone(original);
  const pending=action(original,'challenge-roll',{roll:rolls(5,6)});assert.deepEqual(original,before);
  assert.throws(()=>action(pending,'challenge-roll',{roll:rolls()}),/Resolve the saved/);
  assert.throws(()=>action(pending,'challenge-cancel'),/rolled dice/);
  assert.equal(action(save(pending),'challenge-resolve').challenge.history[0].total,13);
});

test('only an unrolled challenge may be cancelled and it does not alter past fights',()=>{
  const session=start(67);session.fight={status:'win',history:[{type:'outcome'}]};const before=structuredClone(session.fight);
  const result=action(session,'challenge-cancel');assert.equal(result.challenge,undefined);assert.deepEqual(result.fight,before);
  assert.deepEqual(result.history,[]);assert.equal(result.character.defeats,0);
});

test('an active challenge blocks another challenge and ordinary battle setup',()=>{
  const session=start(67);assert.throws(()=>begin(session,setup(35),{roster,outcomeId:'x'}),/active encounter/);
  assert.throws(()=>beginDestinySession(session,{hero:{speed:0,health:30},opponents:[{health:1}]},{outcomeId:'x'}),/active challenge/);
});

test('challenge actions work through the session coordinator without a fake battle',()=>{
  let session=start(67,{hero:{speed:2}});assert.equal(session.fight,null);
  session=applyDestinySessionAction(session,'challenge-roll',{}, {roll:rolls(6,6)});
  session=applyDestinySessionAction(save(session),'challenge-resolve');assert.equal(session.challenge.destination,'174');assert.equal(session.fight,null);
});

test('challenge limits, dice count and destinations are read from editable metadata',()=>{
  const custom=structuredClone(roster),rules=custom.find(e=>e.challenges?.['35']).challenges['35'].rules;
  Object.assign(rules,{turns:2,dice:1,threshold:3,failureLimit:1,successSection:'900',failureSection:'901'});
  let session=begin(createDestinySession(),setup(35),{roster:custom,outcomeId:'edited'});
  session=turn(turn(session,3),3);assert.equal(session.challenge.destination,'900');
});

test('invalid RNG and unfinished outcomes reject atomically without losing saved state',()=>{
  const session=start(67),before=structuredClone(session);assert.throws(()=>action(session,'challenge-roll',{roll:()=>7}),/1-6/);
  assert.deepEqual(session,before);const previous=createDestinySession({fight:{status:'loss'},fightId:'not-recorded'});
  assert.throws(()=>begin(previous,setup(67),{roster,outcomeId:'x'}),/Record the finished/);
});
