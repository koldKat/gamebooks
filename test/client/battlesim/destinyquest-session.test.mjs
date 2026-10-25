import test from 'node:test';
import assert from 'node:assert/strict';
import {WINTER_ENCOUNTERS as roster} from './destinyquest-fixtures.mjs';
import {createDestinySession as create, beginDestinySession as begin, applyDestinySessionAction as action}
  from '../../../public/js/battlesim/engines/destinyquest/session.js';

const rolls=(...v)=>()=>{assert.ok(v.length,'Unexpected dice');return v.shift();};
const setup={hero:{speed:20,brawn:20,armour:0,health:20,maxHealth:30},opponents:[{name:'Custom foe',speed:0,brawn:0,armour:0,health:3}]};
const start=(session=create(),config=setup)=>begin(session,config,{roster,outcomeId:'fight-1'});
const act=(s,name,payload={},dice=[])=>action(s,name,payload,{roster,roll:rolls(...dice),timestamp:1234});
const win=s=>{
  s=act(s,'start-round',{target:0});s=act(s,'roll-speed',{},[6,6,1,1]);s=act(s,'resolve-speed');
  s=act(s,'roll-damage',{},[1]);return act(s,'resolve-damage');
};
const lose=s=>{
  s=act(s,'start-round',{target:0});s=act(s,'roll-speed',{},[1,1,6,6]);s=act(s,'resolve-speed');
  s=act(s,'roll-damage',{},[1]);return act(s,'resolve-damage');
};

test('an untouched fight can be explicitly cancelled without changing character or history',()=>{
  const original=start(),before=structuredClone(original),cancelled=act(original,'cancel-fight');
  assert.equal(cancelled.fight,null);assert.equal(cancelled.fightId,undefined);
  assert.deepEqual(cancelled.character,original.character);assert.deepEqual(cancelled.history,[]);assert.deepEqual(original,before);
  assert.equal(begin(cancelled,setup,{outcomeId:'replacement'}).fightId,'replacement');
});

test('a started fight can only be conceded and its defeat must be recorded once',()=>{
  let session=act(start(),'start-round',{target:0});assert.throws(()=>act(session,'cancel-fight'),/untouched/);
  session=act(session,'concede');assert.equal(session.fight.status,'loss');assert.equal(session.character.defeats,0);
  assert.throws(()=>act(session,'concede'),/already finished/);session=act(session,'record-outcome');
  assert.equal(session.character.defeats,1);assert.equal(session.history.length,1);
});

test('existing session and saved fight fields survive reading and JSON resume unchanged',()=>{
  const session=start();session.extra={notes:'keep me'};session.fight.extension={custom:123};
  const before=structuredClone(session),resumed=create(JSON.parse(JSON.stringify(session)));
  assert.deepEqual(resumed,before);assert.deepEqual(session,before);
});

test('custom fights work without a roster and input setup remains unchanged',()=>{
  const original=structuredClone(setup),session=begin(create(),setup,{outcomeId:'custom'});
  assert.equal(session.fight.opponents[0].name,'Custom foe');assert.equal(session.fight.hero.health,20);
  assert.deepEqual(setup,original);assert.equal(session.fightId,'custom');
  assert.throws(()=>begin(create(),setup),/new outcome identifier/);
});

test('presets require the actual cached roster and retain character extensions',()=>{
  const session=create({character:{items:['captains-conch'],customNotebook:{text:'preserve'}}});
  assert.throws(()=>begin(session,{...setup,section:777},{outcomeId:'x'}),/roster/);
  const result=start(session,{...setup,section:777});assert.equal(result.fight.abilities['nail-gun'],1);
  assert.deepEqual(result.character.customNotebook,{text:'preserve'});
});

test('unfinished encounter adapters are rejected without modifying session state',()=>{
  const session=create(),before=structuredClone(session);
  const unfinished=structuredClone(roster);unfinished.find(row=>row.section==='30').adapter.implemented=false;
  assert.throws(()=>begin(session,{...setup,section:30},{roster:unfinished,outcomeId:'unfinished'}),/complete rules adapter/);assert.deepEqual(session,before);
});

test('active fight setup cannot be replaced even before the first roll',()=>{
  const session=start(),before=structuredClone(session);assert.throws(()=>begin(session,setup,{outcomeId:'x'}),/active fight/);
  assert.deepEqual(session,before);
});

test('ordinary custom combat completes through the coordinator and records one outcome',()=>{
  let session=win(start());assert.equal(session.fight.status,'win');assert.equal(session.fight.hero.health,30);
  assert.throws(()=>begin(session,setup,{outcomeId:'x'}),/Record the finished/);
  session=act(session,'record-outcome');assert.equal(session.history.length,1);assert.equal(session.history[0].timestamp,1234);
  assert.deepEqual(session.character.outcomeIds,['fight-1']);assert.equal(session.outcome.recorded,true);
  const again=act(JSON.parse(JSON.stringify(session)),'record-outcome');assert.deepEqual(again,session);
  assert.equal(begin(session,setup,{outcomeId:'fight-2'}).fightId,'fight-2');
  assert.throws(()=>begin(session,setup,{outcomeId:'fight-1'}),/new outcome/);
});

test('failed actions leave the original session, fight and history untouched',()=>{
  const session=start(),before=structuredClone(session);
  assert.throws(()=>act(session,'roll-damage'),/unavailable/);assert.throws(()=>act(session,'unknown'),/Unknown/);
  assert.throws(()=>act(session,'record-outcome'),/finished fight/);assert.deepEqual(session,before);
});

test('fifth defeat records its penalty once and requires outcome recording before another fight',()=>{
  const initial=create({character:{defeats:4,nextPenaltyAt:5,penalties:[],outcomeIds:[]}});
  const config={hero:{speed:0,brawn:0,armour:0,health:1},opponents:[{name:'Strong foe',speed:20,brawn:20,armour:0,health:30}]};
  let session=lose(start(initial,config));assert.equal(session.fight.status,'loss');
  session=act(session,'record-outcome',{},[3]);assert.equal(session.character.defeats,5);
  assert.deepEqual(session.character.penalties,['head-blow']);assert.equal(session.outcome.penalty,'head-blow');
  assert.deepEqual(act(session,'record-outcome'),session);
});

test('Cure updates the persistent simulator character without changing unrelated fields',()=>{
  const initial=create({character:{defeats:4,nextPenaltyAt:5,notes:'keep'}});
  let session=start(initial,{...setup,abilities:{cure:1}});session=act(session,'start-round',{target:0});
  session=act(session,'ability',{name:'cure'});assert.equal(session.character.defeats,2);assert.equal(session.character.notes,'keep');
  assert.equal(initial.character.defeats,4);
});

test('opening and pending encounter rolls use saved state and the supplied roster',()=>{
  let session=start(create(),{...setup,section:751});session=act(session,'opening-test',{},[4]);
  session=JSON.parse(JSON.stringify(session));session=act(session,'resolve-ability');
  assert.equal(session.fight.encounter.scheduledEndEffects[0].round,6);assert.equal(session.fight.round,0);
});

test('path placement, movement and orb choices run through the same atomic coordinator',()=>{
  let session=start(create(),{...setup,section:600});session=act(session,'begin-path',{placements:{'0-0':'frost'}});
  session=act(session,'advance-path');session=JSON.parse(JSON.stringify(session));
  session=act(session,'path-orb',{socket:'0-0',target:0});assert.equal(session.fight.encounter.pathProgress.held[0],1);
  session=act(session,'end-round');assert.equal(session.fight.phase,'encounter-start');
});

test('saved defeat choices use the chosen tentacle without replacing the speed dice',()=>{
  let session=start(create(),{...setup,section:741});session=act(session,'start-round',{target:0});
  session=act(session,'roll-speed',{},[3,3,1,2]);session=act(JSON.parse(JSON.stringify(session)),'defeat-choice',{target:2});
  assert.equal(session.fight.opponents[2].health,0);assert.deepEqual(session.fight.turn.heroSpeedDice,[3,3]);
});

test('ring loss updates the explicit simulator loadout, including maximum health, before another fight',()=>{
  const config={hero:{speed:0,brawn:0,armour:0,health:5,maxHealth:10},
    opponents:[{name:'Strong foe',speed:20,brawn:20,armour:0,health:30}],
    abilities:{heal:1},equipment:{ring1:{health:2,abilities:['heal']}}};
  let session=start(create({character:{defeats:4,nextPenaltyAt:5}}),config);session=lose(session);
  session=act(session,'record-outcome',{},[4]);assert.equal(session.character.pendingRingDestruction,true);
  assert.throws(()=>begin(session,config,{outcomeId:'next'}),/lost ring/);
  session=act(session,'ring-loss',{slot:'ring1'});assert.equal(session.character.equipment.ring1,null);
  assert.equal(session.setup.hero.health,3);assert.equal(session.setup.hero.maxHealth,8);assert.equal(session.setup.abilities.heal,0);
  session=begin(session,session.setup,{outcomeId:'next'});assert.equal(session.fight.hero.maxHealth,8);
  assert.equal(session.fight.abilities.heal,undefined);assert.equal(session.fight.equipment.ring1,undefined);
});

test('live transport damage persists in the simulator character across a saved visit',()=>{
  let session=start(create(),{...setup,section:542,equipment:{transport:{stability:8,toughness:10}}});
  session=act(session,'start-round',{target:0},[1]);session=act(session,'resolve-ability');
  assert.equal(session.character.equipment.transport.stability,6);assert.equal(session.character.equipment.transport.toughness,8);
  assert.equal(session.setup.equipment.transport.stability,6);
  assert.equal(create(JSON.parse(JSON.stringify(session))).character.equipment.transport.stability,6);
});
