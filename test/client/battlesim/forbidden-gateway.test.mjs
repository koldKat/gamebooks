import { readRosterDocument } from '../../helpers/roster-db.cjs';
import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(539);
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as rules from '../../../public/js/battlesim/engines/forbidden-gateway.js';
import { resolveShadowsCheck } from '../../../public/js/battlesim/engines/forbidden-gateway-checks.js';

const roll = (...values) => {
  let index = 0;
  return () => {
    assert.ok(index < values.length, 'Unexpected extra die');
    return (values[index++] - 0.5) / 6;
  };
};
const player = () => rules.createShadowsCharacter(roll(6, 6, 6));

test('printed Shadows checks take ratings, damage and routes from loaded metadata',async()=>{
  const rosterUrl=new URL('../../../public/js/battlesim/engines/forbidden-gateway-roster.js?authority',import.meta.url);
  const roster=await import(rosterUrl.href),seed=readRosterDocument(539);
  const support=seed.enemies.find(e=>e.key==='61:0').stats.entry.support,check=support.checks.find(c=>c.section===52);
  Object.assign(check,{rating:2,success:777,successDamage:{stamina:7}});delete check.death;support.rules.death=900;
  await roster.loadRoster(async()=>({ok:true,json:async()=>seed.enemies}));
  const path=new URL('../../../public/js/battlesim/engines/forbidden-gateway-checks.js',import.meta.url);
  const source=readFileSync(path,'utf8').replaceAll("'./forbidden-gateway-roster.js'",JSON.stringify(rosterUrl.href)).replaceAll("'./forbidden-gateway.js'",JSON.stringify(new URL('forbidden-gateway.js',path).href));
  const checks=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  assert.equal(checks.SHADOWS_CHECKS.length,33);assert.equal(checks.resolveShadowsCheck(player(),52,roll(1,2)).success,false);
  const p=player();p.stamina=10;assert.equal(checks.resolveShadowsCheck(p,52,roll(1,1)).destination,777);assert.equal(p.stamina,3);
  p.stamina=1;assert.equal(checks.resolveShadowsCheck(p,52,roll(1,1)).destination,900);
});
test('Shadows script limits, strict identity and disbelief settings preserve saved state',()=>{
  const saved=structuredClone(rules.SHADOWS_RULES);
  try{
    rules.SHADOWS_RULES.scriptStrikes=3;rules.SHADOWS_RULES.changelingId=900;rules.SHADOWS_RULES.disbeliefLoss=2;
    assert.equal(rules.shadowsLocksWeapon(900),true);assert.equal(rules.shadowsLocksWeapon('900'),false);
    const f=rules.startShadowsFight(player(),24);f.strikes=1;f.extension={keep:true};const old=JSON.parse(JSON.stringify(f));rules.shadowsScriptStrike(old,roll(6,6));assert.equal(old.status,'fighting');rules.shadowsScriptStrike(old,roll(6,6));assert.equal(old.status,'continue');assert.deepEqual(old.extension,{keep:true});
    const d=rules.startShadowsFight(player(),34);d.queue=[0];d.enemies[0].disbelief=true;d.enemies[0].mentality=2;d.enemies[0].endurance=9;delete d.enemies[0].stamina;rules.shadowsAttack(d,0,roll(6,6));assert.equal(d.enemies[0].endurance,7);
  }finally{Object.assign(rules.SHADOWS_RULES,saved);}
});

test('initial attributes are 1d6+3 with separate doubled health and no gun', () => {
  const p = rules.createShadowsCharacter(roll(1, 2, 3));
  assert.deepEqual([p.strength, p.mentality, p.dexterity, p.stamina, p.endurance], [4, 5, 6, 8, 10]);
  assert.equal(p.bullets, 0); assert.equal(p.revolver, false);
});

test('printed conflict-table rows include both automatic boundaries', () => {
  const rows = [
    [7,7,8,9,10,11,12,12,12,12,12],
    [6,7,7,8,9,10,11,12,12,12,12],
    [5,6,7,7,8,9,10,11,12,12,12],
    [4,5,6,7,7,8,9,10,11,12,12],
    [3,4,5,6,7,7,8,9,10,11,12],
    [2,3,4,5,6,7,7,8,9,10,11],
    [0,2,3,4,5,6,7,7,8,9,10],
    [0,0,2,3,4,5,6,7,7,8,9],
    [0,0,0,2,3,4,5,6,7,7,8],
    [0,0,0,0,2,3,4,5,6,7,7],
    [0,0,0,0,0,2,3,4,5,6,7],
  ];
  for (let row = 0; row < 11; row++) for (let column = 0; column < 11; column++) {
    assert.equal(rules.shadowsThreshold(column + 2, row + 2), rows[row][column]);
  }
  assert.equal(rules.shadowsConflict(9,7,roll(4,4)).success,true);
  assert.equal(rules.shadowsConflict(12,2,roll(6,6)).success,true);
  assert.equal(rules.shadowsConflict(2,12,roll(1,1)).success,false);
  assert.throws(() => rules.shadowsThreshold(1,10), RangeError);
});

test('rest rounds each missing health pool down without reviving', () => {
  const p = player(); p.stamina = 11; p.endurance = 12;
  assert.deepEqual(rules.recoverShadows(p), { stamina: 3, endurance: 3 });
  assert.deepEqual([p.stamina,p.endurance], [14,15]);
  p.endurance = 0; assert.throws(() => rules.recoverShadows(p), RangeError);
});

test('simultaneous hunters retaliate separately against body and soul', () => {
  const p = player(); p.spiritSpear = true; p.weapon = 'spiritSpear';
  const f = rules.startShadowsFight(p,34);
  const hit = rules.shadowsAttack(f,0,roll(2,2,1));
  assert.deepEqual(hit.damage, {stamina:0,endurance:3});
  assert.equal(f.enemies[0].endurance,7);
  assert.equal(rules.shadowsAttack(f,0,roll(2,2)).actor,0);
  assert.equal(rules.shadowsAttack(f,0,roll(3,3)).actor,1);
  assert.deepEqual([f.player.stamina,f.player.endurance], [16,14]);
  assert.equal(f.round,2); assert.deepEqual(f.queue,[-1,0,1]);
  assert.equal(p.stamina,18);
});

test('slain hunter does not retaliate and double ones double weapon damage', () => {
  const p = player(); p.spiritSpear = true; p.weapon = 'spiritSpear';
  const f = rules.startShadowsFight(p,34);
  const hit = rules.shadowsAttack(f,0,roll(1,1,6));
  assert.equal(hit.damage.endurance,16); assert.deepEqual(f.queue,[1]);
  rules.shadowsAttack(f,1,roll(6,6));
  rules.shadowsAttack(f,1,roll(1,1,6));
  assert.equal(f.status,'win'); assert.equal(f.destination,117);
  assert.equal(rules.shadowsAttack(f,1,roll()),null);
});

test('hunter defeat distinguishes fatal physical and mental damage', () => {
  for (const [key,destination] of [['stamina',57],['endurance',84]]) {
    const f = rules.startShadowsFight(player(),34);
    f.player[key] = 0; rules.settleShadows(f);
    assert.equal(f.status,'loss'); assert.equal(f.destination,destination);
  }
});

test('madman opening can end immediately or give him the first attack', () => {
  const success=rules.startShadowsFight(player(),61);
  rules.resolveShadowsOpening(success,roll(2,2));
  assert.equal(success.status,'win'); assert.equal(success.destination,8);
  const failure=rules.startShadowsFight(player(),61);
  rules.resolveShadowsOpening(failure,roll(6,6));
  assert.deepEqual(failure.queue,[0,-1]);
  rules.shadowsAttack(failure,0,roll(1,1)); assert.equal(failure.player.stamina,10);
});

test('hobgoblin loses endurance on disbelief and mental bombardment is not a weapon critical', () => {
  const f=rules.startShadowsFight(player(),197);
  assert.equal(rules.shadowsAttack(f,0,roll(6,6)).disbelief,true);
  assert.equal(f.enemies[0].endurance,17);
  rules.shadowsAttack(f,0,roll(6,6));
  rules.shadowsAttack(f,0,roll(1,1));
  assert.equal(f.player.stamina,16);
});

test('changeling copies current health and failed opening forces fists', () => {
  const p=player(); p.stamina=7;
  const f=rules.startShadowsFight(p,257);
  assert.equal(f.enemies[0].stamina,7);
  rules.resolveShadowsOpening(f,roll(6,6)); assert.equal(f.player.weapon,'fists');
  const escape=rules.startShadowsFight(p,257);
  rules.resolveShadowsOpening(escape,roll(1,2),true);
  assert.equal(escape.status,'escaped'); assert.equal(escape.destination,291);
});

test('house mutant forces unarmed combat and preserves room-specific victory', () => {
  for (const [diningRoom,destination] of [[false,276],[true,313]]) {
    const f=rules.startShadowsFight(player(),337,{diningRoom});
    assert.equal(f.player.weapon,'fists');
    f.enemies[0].stamina=0; rules.settleShadows(f);
    assert.equal(f.destination,destination);
  }
});

test('quarry ambush permits only two attacks then returns to the printed grapple', () => {
  const f=rules.startShadowsFight(player(),24);
  rules.shadowsScriptStrike(f,roll(2,2)); rules.shadowsScriptStrike(f,roll(2,2));
  assert.equal(f.enemies[0].stamina,6);
  assert.equal(f.status,'continue'); assert.equal(f.destination,2);
  assert.equal(rules.shadowsScriptStrike(f,roll()),null);
});

test('ambush gunfight spends each shot and may stop while the mutant lives', () => {
  const p=player(); p.revolver=true; p.bullets=2; p.weapon='revolver';
  const f=rules.startShadowsFight(p,106);
  rules.shadowsScriptStrike(f,roll(6,6));
  assert.equal(f.player.bullets,1); assert.equal(f.enemies[0].stamina,10);
  assert.equal(rules.finishShadowsShots(f),true);
  assert.equal(f.destination,95); assert.equal(p.bullets,2);
});

test('gun misses still consume ammunition and empty gun cannot make an attack', () => {
  const p=player(); p.revolver=true; p.weapon='revolver'; p.bullets=1;
  const f=rules.startShadowsFight(p,106);
  rules.shadowsScriptStrike(f,roll(6,6));
  assert.equal(f.player.bullets,0);
  assert.equal(rules.shadowsScriptStrike(f,roll()),null);
});

test('lurker rolls two slime streams and accumulates their printed damage', () => {
  const f=rules.startShadowsFight(player(),15);
  const result=rules.shadowsLurker(f,'slime',roll(1,2,3,4));
  assert.equal(result.damage.stamina,8); assert.equal(f.player.stamina,10);
  assert.equal(f.phase,'held'); assert.equal(result.destination,32);
  const escaped=rules.shadowsLurker(f,'breakFree',roll(1,1));
  assert.equal(escaped.success,true); assert.equal(f.phase,'escape');
  rules.shadowsLurker(f,'escape',roll(6,6)); assert.equal(f.destination,99);
});

test('lurker gun damage is quartered without inventing a rounding rule', () => {
  const p=player(); p.weapon='revolver'; p.revolver=true; p.bullets=2;
  const f=rules.startShadowsFight(p,15);
  rules.shadowsLurker(f,'slime',roll(6,6,6,6));
  const hit=rules.shadowsLurker(f,'gun',roll(2,2,2,3));
  assert.equal(hit.damage.stamina,1.25); assert.equal(f.enemies[0].stamina,18.75);
  assert.equal(f.player.bullets,1); assert.equal(f.phase,'gun');
  rules.shadowsLurker(f,'finishShots',roll()); assert.equal(f.phase,'slime');
});

test('lurker failed escape uses the defender perspective for section159', () => {
  const f=rules.startShadowsFight(player(),15);
  rules.shadowsLurker(f,'slime',roll(2,2,6,6));
  rules.shadowsLurker(f,'breakFree',roll(6,6)); assert.equal(f.phase,'knockdown');
  const result=rules.shadowsLurker(f,'resist',roll(2,2));
  assert.equal(result.success,false); assert.equal(f.status,'loss'); assert.equal(f.destination,170);
});

test('printed madman grapple9 and later fight7 remain distinct contexts', () => {
  const p=player(); p.strength=7;
  assert.equal(resolveShadowsCheck(p,130,roll(4,4)).destination,107);
  assert.equal(rules.SHADOWS_ENCOUNTERS.find(row => row.id===61).enemies[0].strength,7);
});

test('salamander resistance reduces current mentality only on failure', () => {
  const p=player(); const endurance=p.endurance;
  assert.equal(resolveShadowsCheck(p,252,roll(6,6)).destination,281);
  assert.equal(p.mentality,7); assert.equal(p.endurance,endurance);
  assert.equal(resolveShadowsCheck(p,252,roll(1,1)).destination,262);
  assert.equal(p.mentality,7);
});

test('mind-flail deals printed six endurance damage, not weapon double damage', () => {
  const p=player(); resolveShadowsCheck(p,300,roll(1,1));
  assert.equal(p.endurance,12);
});

test('mattock damage follows the passage and distinguishes fatal destination', () => {
  const p=player(); p.stamina=6;
  const result=resolveShadowsCheck(p,250,roll(2,2));
  assert.equal(result.destination,378); assert.equal(p.stamina,0);
  const q=player(); resolveShadowsCheck(q,205,roll(2,2));
  assert.equal(q.stamina,18, 'Section105 applies the damage, not205');
});

test('manual table outcome supports unprinted ratings without fabricating probabilities', () => {
  const p=player(); p.mentality=1;
  assert.throws(() => resolveShadowsCheck(p,281,roll(1,1)),RangeError);
  assert.equal(resolveShadowsCheck(p,281,roll(),false).destination,372);
});

test('scripted shots resume wounded creatures instead of resetting their health', () => {
  const p=player(); p.revolver=true; p.bullets=1; p.weapon='revolver';
  const f=rules.startShadowsFight(p,331,{remainingHealth:3});
  rules.shadowsScriptStrike(f,roll(2,2,2,2));
  assert.equal(f.status,'win'); assert.equal(f.destination,290);
  assert.equal(f.player.bullets,0);
  assert.throws(() => rules.startShadowsFight(p,331,{remainingHealth:13}),RangeError);
});

test('monster against club uses the printed strength7, not character strength', () => {
  const p=player(); p.strength=4;
  assert.equal(resolveShadowsCheck(p,186,roll(4,5)).success,true);
  p.strength=9;
  const result=resolveShadowsCheck(p,278,roll(6,6));
  assert.equal(result.success,false); assert.equal(p.stamina,16);
});

test('salt misses do not deal damage or consume damage dice', () => {
  const f=rules.startShadowsFight(player(),15);
  rules.shadowsLurker(f,'slime',roll(6,6,6,6));
  const result=rules.shadowsLurker(f,'salt',roll(6,6));
  assert.equal(result.destination,4); assert.equal(f.enemies[0].stamina,20);
});


test('legacy saved opening encounters keep their outcomes without adding new rule metadata', () => {
  for (const [id,destination,status] of [[61,8,'win'],[257,291,'escaped']]) {
    const f=JSON.parse(JSON.stringify(rules.startShadowsFight(player(),id)));
    delete f.spec.openingRules;
    f.legacyExtension={retained:true};
    rules.resolveShadowsOpening(f,roll(1,1),true);
    assert.equal(f.status,status);assert.equal(f.destination,destination);
    assert.equal('openingRules' in f.spec,false);
    assert.deepEqual(f.legacyExtension,{retained:true});
  }
});

test('Lurker actions respect captured rules and retain legacy fights without rewriting saved specs', () => {
  const fresh=rules.startShadowsFight(player(),15);
  fresh.spec.lurkerRules.streamCount=1;
  fresh.spec.lurkerRules.streamDamage=3;
  const restored=JSON.parse(JSON.stringify(fresh));
  rules.shadowsLurker(restored,'slime',roll(2,2));
  assert.equal(restored.player.stamina,15);
  assert.equal(restored.phase,'held');
  const legacy=JSON.parse(JSON.stringify(rules.startShadowsFight(player(),15)));
  delete legacy.spec.lurkerRules;
  legacy.player.stamina=13;
  legacy.legacyExtension={retained:true};
  rules.shadowsLurker(legacy,'slime',roll(2,2,6,6));
  assert.equal(legacy.player.stamina,9);
  assert.equal(legacy.phase,'held');
  assert.equal('lurkerRules' in legacy.spec,false);
  assert.deepEqual(legacy.legacyExtension,{retained:true});
});
