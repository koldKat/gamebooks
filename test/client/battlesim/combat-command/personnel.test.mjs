import test from 'node:test';
import assert from 'node:assert/strict';
import { readRosterDocument } from '../../../helpers/roster-db.cjs';
import { loadRoster,getRoster } from '../../../../public/js/battlesim/books/1474/definition.js';
import { startPersonnelFight, beginPersonnelRound, resolvePersonnelRoll, canEscapePersonnelFight,
  escapePersonnelFight, cancelPersonnelFight } from '../../../../public/js/battlesim/engines/combat-command/personnel-battle.js';

const catalog=readRosterDocument(1474);
await loadRoster(async()=>({ok:true,json:async()=>catalog.enemies}));
const entries = getRoster();
const charts = entries[0].charts;
const source = key => structuredClone(entries.find(e => e.section === String(key)));
const reload = value => JSON.parse(JSON.stringify(value));
const unit = (key, changes = {}) => ({ key, name: key, count: 100, ordnance: 1,
  melee: 2, stealth: 8, morale: 8, chart: 'D', ...changes });
const synthetic = hit => Object.fromEntries([...'ABCDEFG'].map(c => [c, Array.from({length:11}, () => Array(11).fill(hit))]));
const noRoll = () => { throw Error('Unexpected automatic dice'); };
function roll(fight, total = 2) {
  const before = JSON.stringify(fight), next = resolvePersonnelRoll(reload(fight), total, noRoll);
  assert.equal(JSON.stringify(fight), before);
  return next;
}
function round(fight, options = {}, total = 2) {
  const before = JSON.stringify(fight);
  let next = beginPersonnelRound(reload(fight), options);
  assert.equal(JSON.stringify(fight), before);
  for (let i = 0; next.phase === 'roll' && i < 100; i++) next = roll(next, total);
  assert.notEqual(next.phase, 'roll', 'round must reach a boundary');
  return next;
}
function start(key, player = [unit('player')], overrides = {}, tables = charts, setup = {}) {
  const config = { ...source(key), ...overrides };
  return startPersonnelFight(player, config, tables, setup);
}
const custom = (rules = {}, enemies = [unit('enemy')]) => ({ label:'Custom', section:'custom', rules, enemies });

test('the database projection includes all combat profiles and seven complete original charts', () => {
  assert.equal(entries.length, 43);
  assert.equal(entries[0].playerDefaults.friendlyProfiles.length, 21);
  assert.equal(Object.values(charts).flat(2).length, 847);
  assert.ok(Object.values(charts).flat(2).every(Number.isSafeInteger));
  assert.equal(source(19).variants.length, 3);
  assert.deepEqual(source(144), undefined);
  for (const key of ['77','87','89','133','142','144-lead','144-barracks','147']) {
    assert.deepEqual(source(key).enemies, []);
    assert.ok(source(key).rules.fixedAttack);
  }
});

test('ordinary custom combat supports independent friendly attacks and JSON-restored pending rolls', () => {
  const original = startPersonnelFight([unit('lead'), unit('second')], custom({leadLossesOnly:true}), synthetic(3));
  let fight = beginPersonnelRound(original);
  assert.equal(fight.pending.side, 'player');
  fight = roll(fight, 8);
  assert.equal(fight.enemies[0].count, 97);
  assert.equal(fight.pending.key, 'second');
  fight = roll(fight, 9);
  assert.equal(fight.enemies[0].count, 94);
  fight = roll(fight, 7);
  assert.equal(fight.player[0].count, 97);
  assert.equal(fight.player[1].count, 100);
  assert.equal(fight.history.at(-1).attacks.length, 3);
  assert.equal(fight.phase, 'ready');
  assert.equal(original.round, 0);
});

test('lead-only losses never spill a volley onto the supporting unit', () => {
  let fight = startPersonnelFight([unit('lead',{count:1}),unit('second')],
    custom({leadLossesOnly:true,initiative:'enemy'}), synthetic(8));
  fight = round(fight);
  assert.equal(fight.player[0].count, 0);
  assert.equal(fight.player[1].count, 100);
  assert.equal(fight.enemies[0].count, 92);
  fight = round(fight);
  assert.equal(fight.player[1].count, 92);
});

test('robot tactics, melee and direct-attack initiative remain separate source choices', () => {
  for (const variant of source(19).variants) {
    const config = { ...source(19), ...variant };
    let fight = startPersonnelFight(config.playerUnits, config, charts);
    fight = beginPersonnelRound(fight);
    assert.equal(fight.pending.side, variant.initiative === 'enemy' ? 'enemy' : 'player');
    fight = roll(fight, 2);
    const attack = fight.history.at(-1).attacks[0];
    assert.equal(attack.chart, variant.initiative === 'enemy' ? 'B' : variant.playerChart);
    assert.equal(attack.strength, variant.initiative === 'enemy' ? 10 : 24);
  }
});

test('initiative changes at the printed round and surprised engineers cannot return fire for two rounds', () => {
  let fight = start(74, undefined, {}, synthetic(0));
  for (let n = 1; n <= 4; n++) {
    fight = round(fight);
    assert.equal(fight.history.at(-1).attacks[0].side, n <= 3 ? 'enemy' : 'player');
  }
  fight = start(63, undefined, {}, synthetic(0));
  for (let n = 1; n <= 3; n++) {
    fight = round(fight);
    assert.equal(fight.history.at(-1).attacks.length, n <= 2 ? 1 : 2);
    assert.equal(fight.history.at(-1).attacks[0].chart, n <= 2 ? 'A' : 'B');
  }
});

test('fixed strikes ask their count once and have no fabricated opponent Manpower', () => {
  let fight = start(142, undefined, {}, synthetic(1));
  assert.equal(fight.pending.kind, 'strike-count');
  fight = roll(fight, 3);
  assert.equal(fight.attackLimit, 3);
  for (let n = 1; n <= 3; n++) fight = round(fight);
  assert.equal(fight.status, 'survived');
  assert.equal(fight.player[0].count, 97);
  assert.deepEqual(fight.enemies, []);
  assert.equal(fight.history.flatMap(e => e.checks).filter(c => c.kind === 'strike-count').length, 1);
  assert.equal(fight.history.at(-1).attacks[0].strength, 30);
  let scrambled = start(77, undefined, {}, synthetic(0), {useScrambler:true});
  scrambled = roll(scrambled, 1);
  scrambled = round(scrambled);
  assert.equal(scrambled.history.at(-1).attacks[0].strength, 30);
});

test('hovercraft opening count includes the first returning-fire exchange, unlike island free attacks', () => {
  let fight = roll(start(79, undefined, {}, synthetic(0)), 3);
  for (let n = 1; n <= 3; n++) {
    fight = round(fight);
    assert.equal(fight.history.at(-1).attacks.length, n < 3 ? 1 : 2);
  }
  fight = roll(start(165, undefined, {}, synthetic(0), {raidersEligible:true}), 2);
  assert.equal(canEscapePersonnelFight(fight), false);
  fight = round(fight, {targetKey:'wave-2'});
  assert.equal(fight.enemyReplies, 0);
  assert.throws(() => round(fight,{targetKey:'wave-1'}), /same wave/);
  fight = round(fight, {targetKey:'wave-2'});
  assert.equal(canEscapePersonnelFight(fight), true);
  assert.equal(escapePersonnelFight(fight).status, 'escaped');
  fight = round(fight);
  assert.equal(fight.enemyReplies, 1);
  assert.equal(canEscapePersonnelFight(fight), false);
});

test('searchlight and floater shots reduce firing strength without killing friendly troops', () => {
  let fight = beginPersonnelRound(start(39, [unit('mies-and-jacals',{count:7,ordnance:3})], {}, synthetic(0)), {tactic:'searchlight'});
  fight = roll(fight, 6);
  assert.equal(fight.searchlightDestroyed, true);
  fight = roll(fight, 2);
  assert.equal(fight.history.at(-1).attacks[0].strength, 15);
  fight = roll(fight, 2);
  assert.equal(fight.history.at(-1).attacks[1].chart, 'F');
  assert.equal(fight.player[0].count, 7);
  fight = round(fight);
  assert.equal(fight.history.at(-1).attacks[0].strength, 21);
  assert.throws(() => beginPersonnelRound(start(47),{tactic:'vehicle-shot'}), /how long/);
  fight = beginPersonnelRound(start(47, [unit('party',{count:7,ordnance:3})], {}, synthetic(0)),
    {tactic:'vehicle-shot',exclusionDuration:'continuing'});
  fight = roll(fight, 8);
  assert.equal(fight.enemies[0].count, 6);
  while (fight.phase === 'roll') fight = roll(fight);
  assert.equal(fight.player[0].count, 7);
  fight = round(fight);
  assert.equal(fight.history.at(-1).attacks[0].strength, 15);
});

test('same-turn prison escape happens after player fire and before any return fire', () => {
  let fight = beginPersonnelRound(start(39, [unit('party',{stealth:9})], {}, synthetic(8)),{escapeAfterAttack:true});
  fight = roll(fight, 2);
  assert.equal(fight.pending.kind, 'escape');
  fight = roll(fight, 9);
  assert.equal(fight.status, 'escaped');
  assert.equal(fight.enemyReplies, 0);
});

test('ranged surrender gates do not happen after a killing attack or after committing to melee', () => {
  let fight = start(125, [unit('player',{morale:2})], {}, synthetic(100));
  fight = round(fight);
  assert.equal(fight.status, 'win');
  assert.equal(fight.history.at(-1).checks.length, 0);
  fight = start(176, undefined, {}, synthetic(0));
  fight = round(fight); fight = round(fight);
  fight = beginPersonnelRound(fight);
  fight = roll(fight); fight = roll(fight);
  assert.equal(fight.pending.kind, 'enemy-morale');
  fight = roll(fight, 9);
  assert.equal(fight.enemies[0].retired, 'surrendered');
  assert.equal(fight.status, 'win');
  fight = start(176, undefined, {}, synthetic(0));
  for (let i=0;i<4;i++) fight = round(fight, {melee:true});
  assert.ok(!fight.history.flatMap(e=>e.checks).some(c=>c.kind==='enemy-morale'));
  assert.equal(fight.history.at(-1).attacks[0].strength, 200);
});

test('withdrawal follows exact windows, cannot repeat failed checks, and melee locks it out', () => {
  let fight = start(47, undefined, {}, synthetic(0));
  fight = round(fight); assert.equal(canEscapePersonnelFight(fight),false);
  fight = round(fight); assert.equal(canEscapePersonnelFight(fight),true);
  fight = escapePersonnelFight(fight);fight = roll(fight,12);
  assert.equal(canEscapePersonnelFight(fight),false);
  fight = round(fight);assert.equal(canEscapePersonnelFight(fight),false);
  fight = round(fight);assert.equal(canEscapePersonnelFight(fight),true);
  fight = start(155, undefined, {}, synthetic(0));
  assert.throws(()=>beginPersonnelRound(fight,{melee:true}), /unavailable/);
  fight=round(fight);fight=round(fight);assert.equal(canEscapePersonnelFight(fight),true);
  fight=round(fight,{melee:true});assert.equal(canEscapePersonnelFight(fight),false);
});

test('rotating waves retain casualties, skip dead waves and retire the third only after its own turn', () => {
  const config=source(157);config.enemies[2].count=39;
  let fight=startPersonnelFight([unit('player')],config,synthetic(1));
  fight=beginPersonnelRound(fight);assert.equal(fight.pending.kind,'disruption');
  fight=roll(fight,9);assert.equal(fight.pending.side,'enemy');
  fight=roll(fight,2);
  assert.deepEqual(fight.history.at(-1).attacks.map(a=>a.side),['enemy']);
  assert.equal(fight.enemies[0].count,30);
  fight=round(fight);
  assert.equal(fight.history.at(-1).attacks[0].target,'wave-2');
  assert.equal(fight.history.at(-1).attacks[0].strength,99);
  assert.equal(fight.enemies[1].count,19);
  fight=beginPersonnelRound(fight);fight=roll(fight);fight=roll(fight);
  assert.equal(fight.pending.kind,'wave-morale');
  fight=roll(fight,12);assert.equal(fight.enemies[2].retired,'fled');
  fight=round(fight);
  assert.equal(fight.history.at(-1).attacks[0].target,'wave-1');
  fight=round(fight);fight=round(fight);
  assert.equal(fight.history.at(-1).attacks[0].target,'wave-1');
  assert.equal(fight.enemies[2].count,38);
});

test('nonlethal loss restores friendly manpower but cancellation never heals an unfinished fight', () => {
  let fight=start(84,[unit('party',{count:1})],{},synthetic(1));
  fight=round(fight);
  assert.equal(fight.status,'loss');assert.equal(fight.player[0].count,1);
  assert.equal(fight.endPlayer[0].count,0);
  fight=start(84,[unit('party',{count:10})],{},synthetic(1));fight=round(fight);
  fight=cancelPersonnelFight(fight);assert.equal(fight.player[0].count,9);
});

test('talk is exactly one unanswered enemy attack and does not navigate the reader', () => {
  let fight=round(start(174,undefined,{},synthetic(1)),{talk:true});
  assert.equal(fight.status,'talked');assert.equal(fight.enemyReplies,1);
  assert.equal(fight.history.at(-1).attacks.length,1);assert.equal(fight.section,'148');
  assert.ok(!Object.hasOwn(fight,'inventory')&&!Object.hasOwn(fight,'mission'));
});

test('hit confirmations preserve the rolled attack until its explicit follow-up check', () => {
  let fight=beginPersonnelRound(start(208,undefined,{},synthetic(3)));
  fight=roll(fight,2);assert.equal(fight.player[0].count,97);
  fight=roll(fight,8);assert.equal(fight.pending.kind,'hit-save');
  assert.equal(fight.enemies[0].count,20);
  fight=roll(fight,6);assert.equal(fight.enemies[0].count,20);
  assert.equal(fight.history.at(-1).attacks[1].ignoredHits,3);
  fight=beginPersonnelRound(fight);fight=roll(fight,2);fight=roll(fight,8);fight=roll(fight,7);
  assert.equal(fight.enemies[0].count,17);
});

test('engineers surrender after strictly more than five casualties and check at each later round', () => {
  let fight=start(63,undefined,{},synthetic(3));
  fight=round(fight);
  assert.equal(fight.enemies[0].count,27);
  assert.equal(fight.history.at(-1).checks.length,0);
  fight=beginPersonnelRound(fight);fight=roll(fight);
  assert.equal(fight.pending.kind,'enemy-morale');
  fight=roll(fight,4);assert.equal(fight.status,'fighting');
  fight=beginPersonnelRound(fight);fight=roll(fight);fight=roll(fight);
  assert.equal(fight.pending.kind,'enemy-morale');
  fight=roll(fight,5);assert.equal(fight.status,'win');
  assert.equal(fight.enemies[0].retired,'surrendered');
});

test('a first-round friendly morale failure stops the encounter exactly once', () => {
  let fight=start(129,[unit('player',{morale:5})],{},synthetic(0));
  fight=beginPersonnelRound(fight);fight=roll(fight);fight=roll(fight);
  assert.equal(fight.pending.kind,'player-morale');
  const before=JSON.stringify(fight);assert.throws(()=>roll(fight,13),/Invalid/);
  assert.equal(JSON.stringify(fight),before);
  fight=roll(fight,6);assert.equal(fight.status,'surrendered');
  assert.equal(fight.section,'51');
  assert.throws(()=>resolvePersonnelRoll(fight,2),/No active/);
});

test('charges are finite separate attacks and roll-triggered damage is additive', () => {
  let fight=beginPersonnelRound(start(88,[unit('player',{charges:1})],{},synthetic(1)),{charges:['player']});
  fight=roll(fight,11);
  assert.equal(fight.enemies[0].count,17);
  fight=roll(fight,12);
  assert.equal(fight.player[0].charges,0);
  assert.equal(fight.enemies[0].count,10);
  assert.equal(fight.history.at(-1).attacks[1].strength,30);
  assert.equal(fight.history.at(-1).attacks[1].chart,'A');
  fight=roll(fight,2);
  assert.throws(()=>beginPersonnelRound(fight,{charges:['player']}),/No explosive/);
  let melee=start(176,[unit('player',{charges:1,chargeAttack:{strength:30,chart:'A'}})],{},synthetic(0));
  assert.throws(()=>beginPersonnelRound(melee,{melee:true,charges:['player']}),/close combat/);
});

test('each friendly unit checks its own morale against robot guns and only failed units lose their attack', () => {
  let fight=start(198,[unit('one',{morale:4}),unit('two',{morale:10})],{},synthetic(1));
  fight=beginPersonnelRound(fight);
  assert.equal(fight.pending.key,'one');fight=roll(fight,5);
  assert.equal(fight.pending.key,'two');fight=roll(fight,10);
  assert.equal(fight.pending.side,'enemy');fight=roll(fight,2);
  assert.equal(fight.pending.key,'two');fight=roll(fight,2);
  assert.deepEqual(fight.history.at(-1).attacks.map(a=>a.key),['enemy','two']);
  assert.equal(fight.player[0].count,99);assert.equal(fight.player[1].count,100);
});

test('platform checks are limited to three successes and never erase the printed fixed extra attack', () => {
  let fight=start(201,[unit('player',{ordnance:7})],{},synthetic(0));
  for(let i=0;i<4;i++){
    fight=round(fight,{},8);
    assert.equal(fight.enemies[0].ordnance,8-Math.min(i+1,3));
    assert.equal(fight.history.at(-1).attacks.at(-1).strength,30);
    assert.equal(fight.history.at(-1).attacks.at(-1).chart,'B');
    assert.equal(fight.history.at(-1).checks.length,i<3?1:0);
  }
  assert.equal(fight.platformsDestroyed,3);
  assert.equal(fight.enemyReplies,8);
  fight=round(start(201,[unit('player',{ordnance:6})],{},synthetic(0)),{},12);
  assert.equal(fight.platformsDestroyed,0);
});

test('support survives a destroyed front position and terrain chart shifts are local', () => {
  let fight=start(160,[unit('front',{count:1}),unit('support')],{},synthetic(2));
  fight=round(fight);
  assert.equal(fight.status,'loss');assert.equal(fight.player[1].count,100);
  assert.equal(fight.history.at(-1).attacks.at(-1).chart,'B');
  assert.deepEqual(fight.history.at(-1).attacks.filter(a=>a.side==='player').map(a=>a.chart),['D','D']);
  fight=round(start(162,undefined,{},synthetic(0)));
  assert.equal(fight.history.at(-1).attacks[0].chart,'C');
  assert.equal(canEscapePersonnelFight(fight),true);
  assert.equal(escapePersonnelFight(fight).status,'escaped');
  const units=[unit('one'),unit('two'),unit('three')];
  assert.throws(()=>start(198,units),/Too many/);
});

test('friendly casualty morale has an explicit frequency and artillery remains a separate attack', () => {
  const special=unit('heavy',{extraAttack:{strength:30,chart:'A'},
    lossMorale:{lossesOver:5,outcome:'fled',frequency:'once'}});
  let fight=startPersonnelFight([special],custom(),synthetic(3));
  fight=round(fight);assert.equal(fight.history.at(-1).attacks.length,3);
  assert.equal(fight.history.at(-1).checks.length,0);
  fight=round(fight);assert.equal(fight.history.at(-1).checks[0].kind,'loss-morale');
  fight=round(fight);assert.equal(fight.history.at(-1).checks.length,0);
  special.lossMorale.frequency='each-round';
  fight=startPersonnelFight([special],custom(),synthetic(3));
  fight=round(fight);fight=round(fight);fight=beginPersonnelRound(fight);
  fight=roll(fight);fight=roll(fight);fight=roll(fight);
  assert.equal(fight.pending.kind,'loss-morale');fight=roll(fight,9);
  assert.equal(fight.status,'loss');assert.equal(fight.player[0].retired,'fled');
  special.lossMorale.frequency='reader-choice';
  assert.throws(()=>startPersonnelFight([special],custom(),synthetic(0)),/how often/);
});

test('earlier casualties count toward printed thresholds and wave supply modifiers never stack',()=>{
  const police=source(39);police.enemies[0].count=6;
  let fight=startPersonnelFight([unit('player')],police,synthetic(0));
  fight=round(fight);assert.equal(canEscapePersonnelFight(fight),true);
  const engineers=source(63);engineers.enemies[0].count=24;
  fight=startPersonnelFight([unit('player')],engineers,synthetic(0));
  fight=beginPersonnelRound(fight);fight=roll(fight);
  assert.equal(fight.pending.kind,'enemy-morale');
  const config=source(157);
  fight=startPersonnelFight([unit('player')],config,synthetic(0),{suppliesDestroyed:true});
  fight=round(fight);
  assert.equal(fight.history.at(-1).attacks.at(-1).strength,120);
  assert.equal(fight.enemies[0].ordnance,8);
  config.enemies=structuredClone(fight.enemies);
  fight=startPersonnelFight([unit('player')],config,synthetic(0),{suppliesDestroyed:true});
  fight=round(fight);
  assert.equal(fight.history.at(-1).attacks.at(-1).strength,120);
});

test('every database-owned source setup resolves a complete immutable battle without story automation',()=>{
  const before=JSON.stringify(entries);
  let battles=0;
  for(const entry of entries)for(const variant of entry.variants??[{}]){
    const config={...structuredClone(entry),...variant};
    // Explicit current-force test inputs, not replacement source defaults.
    let fight=startPersonnelFight([unit('test-force',{ordnance:10})],config,charts);
    for(let i=0;fight.status==='fighting'&&i<2000;i++){
      if(fight.phase==='ready')fight=beginPersonnelRound(reload(fight),fight.openingRemaining>0?{targetKey:fight.openingTarget??'wave-1'}:{});
      else{
        const pending=fight.pending;
        const total=pending.kind==='attack'?(pending.side==='player'?12:2)
          :['hit-save','enemy-morale','wave-morale'].includes(pending.kind)?12:pending.dice;
        fight=roll(fight,total);
      }
    }
    assert.ok(['win','survived'].includes(fight.status),entry.section+' '+variant.key+' '+fight.status);
    assert.ok(!Object.hasOwn(fight,'mission')&&!Object.hasOwn(fight,'inventory')&&!Object.hasOwn(fight,'army'));
    battles++;
  }
  assert.equal(battles,45);assert.equal(JSON.stringify(entries),before);
});
