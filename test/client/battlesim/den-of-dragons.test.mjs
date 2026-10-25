import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(527);
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from './simulator-source.mjs';
import { runInNewContext } from 'node:vm';
import { createDenCharacter, initialDenLife, denDamage, createDenFight, rollDenRound, resolveDenPoison,
  castDenSpell, launchDenMagic, useDenLollipop, denFriendlyReaction, denDream, healDenPlayer, rerollDenInitiative, useDenItem, denInvisibilityAllowed } from '../../../public/js/battlesim/engines/grailquest/den-of-dragons.js';
import { DEN_ENCOUNTERS, DEN_DREAM_FIGHTS, DEN_RULES } from '../../../public/js/battlesim/engines/grailquest/den-of-dragons-roster.js';

const low = () => 0;
const high = () => 0.999;
const sequence = values => {
  let index = 0;
  return () => { assert.ok(index < values.length, 'Unexpected die roll'); return (values[index++] - 1) / 6; };
};
const player = overrides => ({ ...createDenCharacter(), life: 48, maxLife: 48, ...overrides });
function fight(section, overrides = {}, options = {}) {
  const f = createDenFight(section, player(overrides), options, low);
  if (!f.first) f.first = 'player';
  return f;
}

test('Globule Wand permits four blows before a counterattack in either initiative order', () => {
  for (const first of ['enemy', 'player']) {
    const f = fight(24, {globs: 1});
    f.first = first;
    assert.equal(useDenItem(f, 'globs').success, true);
    assert.equal(f.player.globs, 0);
    for (let i = 0; i < 3; i++) {
      const events = rollDenRound(f, 0, sequence([1,1]));
      assert.equal(events.filter(e => e.kind === 'enemy').length, 0);
    }
    const fourth = rollDenRound(f, 0, first === 'player' ? sequence([1,1,1,1]) : sequence([1,1]));
    assert.equal(fourth.filter(e => e.kind === 'enemy').length, first === 'player' ? 1 : 0);
    assert.equal(f.foes[0].globBlows, 0);
    assert.equal(useDenItem(f, 'globs'), null);
  }
});
test('Globule Wand counts blows rather than rounds with the Repeater spell', () => {
  const f = fight(24, {globs: 1});
  f.first = 'player'; f.repeat = true;
  useDenItem(f, 'globs');
  assert.equal(rollDenRound(f, 0, sequence([1,1,1,1])).filter(e => e.kind === 'enemy').length, 0);
  assert.equal(rollDenRound(f, 0, sequence([1,1,1,1,1,1])).filter(e => e.kind === 'enemy').length, 1);
});
test('Healing Scroll restores current wounds once without exceeding starting LIFE', () => {
  const f = fight(24, {life: 20, healingScroll: true});
  assert.equal(useDenItem(f, 'healingScroll').amount, 28);
  assert.equal(f.player.life, 48);
  assert.equal(f.player.healingScroll, false);
  assert.equal(useDenItem(f, 'healingScroll'), null);
});
test('Death Scroll kills Pip on double one, three or six, but otherwise only the selected enemy', () => {
  for (const value of [1,3,6]) {
    const f = fight(24, {deathScroll: true});
    assert.equal(useDenItem(f, 'deathScroll', 0, sequence([value,value])).success, false);
    assert.equal(f.player.life, 0);
    assert.equal(f.status, 'loss');
    assert.equal(f.player.deathScroll, false);
  }
  const f = fight(98, {deathScroll: true});
  useDenItem(f, 'deathScroll', 3, sequence([2,2]));
  assert.equal(f.foes[3].life, 0);
  assert.equal(f.foes[0].life, 10);
  assert.equal(f.status, 'fighting');
});
test('Hypnotism bypasses a living enemy on five or higher, but never a dragon', () => {
  const f = fight(24, {hypnosisScroll: true});
  assert.equal(useDenItem(f, 'hypnosisScroll', 0, sequence([1,3])).success, false);
  assert.equal(f.foes[0].life, 30);
  assert.equal(useDenItem(f, 'hypnosisScroll', 0, sequence([2,3])).success, true);
  assert.equal(f.foes[0].life, 30);
  assert.equal(f.foes[0].bypassed, true);
  assert.equal(f.status, 'win');
  assert.equal(useDenItem(fight(172, {hypnosisScroll:true}), 'hypnosisScroll'), null);
});
test('Snuff heals by four dice only once in each numbered section, across replacement fights', () => {
  const f = fight(24, {life: 10, snuff: true});
  assert.equal(useDenItem(f, 'snuff', 0, sequence([1,2,3,4])).amount, 10);
  assert.equal(useDenItem(f, 'snuff'), null);
  const repeat = createDenFight(24, f.player, {}, low);
  assert.equal(useDenItem(repeat, 'snuff'), null);
  const next = createDenFight(41, f.player, {}, low);
  assert.equal(useDenItem(next, 'snuff', 0, high).amount, 24);
  assert.deepEqual(next.player.snuffSections, [24,41]);
});
test('Poison Antidote resolves existing rabbit poison without inventing permanent immunity', () => {
  const f = fight(6, {antidoteScroll:true});
  f.poisonPending = true; f.foes[0].consecutiveHits = 3;
  assert.equal(useDenItem(f, 'healingScroll'), null);
  assert.equal(useDenItem(f, 'antidoteScroll').success, true);
  assert.equal(f.poisonPending, false);
  assert.equal(f.foes[0].consecutiveHits, 0);
  assert.equal(f.player.poisonProtected, false);
});
test('Carried items cannot be used in Dreamtime, the Water Weird challenge or a finished fight', () => {
  for (const section of ['dream8',60]) {
    const f = createDenFight(section, player({healingScroll:true}), {}, low);
    assert.equal(useDenItem(f, 'healingScroll'), null);
    assert.equal(f.player.healingScroll, true);
  }
  const f = fight(24, {healingScroll:true}); f.status = 'loss'; f.player.life = 0;
  assert.equal(useDenItem(f, 'healingScroll'), null);
});

test('all source encounters and Dreamtime foes are separately represented', () => {
  assert.equal(DEN_ENCOUNTERS.length, 21);
  assert.deepEqual(DEN_DREAM_FIGHTS.map(s => s.section), ['dream2', 'dream8', 'dream10']);
  assert.equal(DEN_ENCOUNTERS.find(s => s.section === 120).life, null);
});
test('the per-book locale registers correctly with the actual translation runtime', async () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = {getItem: () => 'en'};
  try {
    const locale = (await import('../../../public/js/i18n/en/battlesim/battlesim527.js')).default;
    const runtime = await import('../../../public/js/i18n/runtime.js');
    assert.ok(Object.entries(locale).every(([key, value]) => key.startsWith('battlesim527.') && typeof value === 'string'));
    runtime.registerTranslations(locale);
    assert.equal(runtime.t('battlesim527.title'), 'Battle Simulator — The Den of Dragons');
    assert.equal(runtime.t('battlesim527.encounter_label', {enemy:'White Rabbit',section:6}), 'White Rabbit (§6)');
    for (const entry of [...DEN_ENCOUNTERS, ...DEN_DREAM_FIGHTS]) {
      const key = 'battlesim527.enemy_names.' + entry.section;
      assert.equal(runtime.t(key), entry.name);
    }
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});
test('the simulator is registered in desktop/mobile loaders and mutually exclusive overlays', () => {
  const loader = readFileSync(new URL('../../../public/js/battlesim/loader.js', import.meta.url), 'utf8');
  const registry = loader.match(/SUPPORTED_BATTLE_SIM_BOOKS = new Set\(\[([\s\S]*?)\]\)/)[1];
  assert.ok([...registry.matchAll(/\d+/g)].some(match => Number(match[0]) === 527));
  const mobile = readFileSync(new URL('../../../public/mobile/js/battlesim-dispatch.js', import.meta.url), 'utf8');
  const mobileRegistry = mobile.match(/SUPPORTED_BATTLE_SIM_BOOKS = new Set\(\[([\s\S]*?)\]\)/)[1];
  assert.ok([...mobileRegistry.matchAll(/\d+/g)].some(match => Number(match[0]) === 527));
  const util = readFileSync(new URL('../../../public/js/core/util.js', import.meta.url), 'utf8');
  const overlays = util.match(/ALL_PANEL_OVERLAY_IDS = (\[[^;]+\])/)[1];
  assert.ok(runInNewContext(overlays).includes('sim527-overlay'));
});
test('actual state XP processing awards new simulator outcomes without render or replay awards', () => {
  const source = readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8');
  const keys = runInNewContext(source.match(/const SIM_HISTORY_KEYS = (\[[^;]+\])/)[1]);
  assert.ok(keys.includes('sim527'));
  const awards = [], refs = new Set();
  const context = {
    db: {prepare: sql => ({get: () => sql.includes('FROM books') ? {} : {n:100}})},
    awardXp(_user, event, ref) {
      if (refs.has(event + ':' + ref)) return false;
      refs.add(event + ':' + ref); awards.push({event, ref}); return true;
    },
    awardCoins() {}, getXpAmount: () => 50, isCleanRun: () => false,
    _discoveredSet: () => new Set(), _visitedSet: () => new Set(), _mappedSet: () => new Set(),
    _checkGroupWonAll() {}, SIM_HISTORY_KEYS: keys, _xpRefSeq: 0,
  };
  runInNewContext(source.slice(source.indexOf('function processStateXp('), source.indexOf('function migrateXpForUser(')), context);
  const state = history => ({playthroughs:[{startedAt:1,path:[],sim527:{history}}]});
  const history = [{outcome:'win',ts:100},{outcome:'loss',ts:101},{outcome:'escaped',ts:102}];
  context.processStateXp(1, 527, state([]), state(history), 0);
  context.processStateXp(1, 527, state(history), state(history), 0);
  assert.deepEqual(awards.filter(row => row.event.startsWith('battlesim_')),
    [{event:'battlesim_win',ref:'sim527:100'},{event:'battlesim_loss',ref:'sim527:101'}]);
});
test('Rabbit injury also penalises player initiative and combat spell rolls', () => {
  const f = createDenFight(6, player(), {}, sequence([2,2,3,3]));
  assert.deepEqual(f.initiative, {enemy:4,player:4});
  assert.equal(f.first, null);
  assert.deepEqual(rerollDenInitiative(f, sequence([1,1,3,3])), {enemy:2,player:4});
  assert.equal(castDenSpell(f, 'pad', 0, sequence([4,4])).success, false);
  assert.equal(castDenSpell(f, 'pad', 0, sequence([4,5])).success, true);
  assert.equal(f.foes[0].life, 15);
});
test('initial LIFE uses best of three 2d6 times4 plus carried permanent points', () => {
  assert.deepEqual(initialDenLife(3, sequence([1,1,3,4,6,6])), { rolls: [8,28,48], life: 51 });
  assert.throws(() => initialDenLife(11));
});
test('damage subtracts actual hit threshold, not a fixed six', () => {
  assert.equal(denDamage(8,4,5,0), 9);
  assert.equal(denDamage(5,6,5,0), 0);
  assert.equal(denDamage(6,6,0,0), 0);
  assert.equal(denDamage(12,8,3,10), 0);
});
test('starting fights preserves current wounds, resources and original equipment', () => {
  const p = player({ life: 17, armour: 4, bolts: 8 });
  const baseline = structuredClone(p);
  const f = createDenFight(120,p,{},low);
  assert.deepEqual(p,baseline);
  assert.equal(f.player.life,17);
  assert.equal(f.player.armour,4);
  assert.equal(f.player.hit,4);
  assert.equal(f.player.bolts,8);
  assert.equal(f.foes[0].life,null);
});
test('initiative ties remain unresolved without silently favouring the player', () => {
  const f = createDenFight(24,player(),{},low);
  assert.equal(f.first,null);
  assert.equal(rollDenRound(f),null);
  assert.deepEqual(rerollDenInitiative(f, sequence([1,1,2,2])), {enemy:2,player:4});
  assert.equal(f.first, 'player');
  assert.equal(rerollDenInitiative(f, high), null);
});
test('Wolf surprise and armour precede the player attack', () => {
  const f = fight(50);
  const events = rollDenRound(f,0,sequence([6,6,1,1]));
  assert.equal(events[0].kind,'enemy');
  assert.equal(f.player.life,39);
  assert.equal(events[1].damage,0);
});
test('all four Martial Monks strike before the player', () => {
  const f = fight(57,{ armour:20 });
  const events = rollDenRound(f,0,high);
  assert.deepEqual(events.map(e=>e.kind),['enemy','enemy','enemy','enemy','player']);
  assert.equal(f.player.life,48);
});
test('Rock Trolls strike together after the opening player attack', () => {
  const f = fight(98,{bonus:0});
  assert.equal(f.foes.length,6);
  const events = rollDenRound(f,0,low);
  assert.equal(events.filter(e=>e.kind==='enemy').length,6);
});
test('Dwarves receive separate opening strikes and flee after ten defeats', () => {
  const f = fight(131,{ armour:20 });
  assert.equal(f.openingTargets,2);
  const events = rollDenRound(f,0,high);
  assert.equal(events.filter(e=>e.kind==='player').length,2);
  for(const foe of f.foes.slice(0,10))foe.life=0;
  rollDenRound(f,10,low);
  assert.equal(f.status,'win');
});
test('Minotaur uses damage-to-ten without inventing enemy LIFE', () => {
  const f = fight(120);
  rollDenRound(f,0,sequence([6,6,1,1]));
  assert.equal(f.enemyLoss,6);
  rollDenRound(f,0,sequence([6,6]));
  assert.equal(f.status,'win');
  assert.equal(f.player.life,48);
  assert.equal(f.foes[0].life,null);
});
test('Wraith costs ten LIFE on entry and ignores physical damage', () => {
  const f = fight(102);
  assert.equal(f.player.life,38);
  rollDenRound(f,0,sequence([6,6,1,1]));
  assert.equal(f.foes[0].life,25);
  assert.equal(castDenSpell(f,'pad',0,high).success,true);
  assert.equal(f.foes[0].life,15);
});
test('Stone Man magical-weapon protection subtracts four', () => {
  const f = fight(23);
  rollDenRound(f,0,sequence([6,6,1,1]));
  assert.equal(f.foes[0].life,19);
});
test('ordinary weapons cannot harm the Stone Man; spells still work', () => {
  const f = fight(23, { magicalWeapon: false });
  rollDenRound(f, 0, sequence([6,6,1,1]));
  assert.equal(f.foes[0].life, 28);
  assert.equal(castDenSpell(f, 'pad', 0, high).success, true);
  assert.equal(f.foes[0].life, 18);
});
test('magical damage records actual loss without inventing a Minotaur LIFE total', () => {
  const f = fight(120);
  castDenSpell(f, 'pad', 0, high);
  assert.equal(f.enemyLoss, 10);
  assert.equal(f.foes[0].life, null);
  assert.equal(f.status, 'win');
  const bolt = fight(120, { bolts: 1 });
  launchDenMagic(bolt, 'bolts', 0);
  assert.equal(bolt.enemyLoss, 10);
  assert.equal(bolt.foes[0].life, null);
  assert.equal(bolt.status, 'win');
});
test('Fish drowning happens after three unsuccessful rounds, with no equipment change', () => {
  const f = fight(123,{ armour:4 });
  for(let i=0;i<3;i++)rollDenRound(f,0,low);
  assert.equal(f.status,'loss');
  assert.equal(f.player.life,0);
  assert.equal(f.player.armour,4);
});
test('Slither opening evasion and a successful zero-damage hit are fatal', () => {
  const dead=createDenFight(153,player(),{},high);
  assert.equal(dead.status,'loss');
  const f=fight(153);
  f.first='enemy';
  rollDenRound(f,0,sequence([4,4]));
  assert.equal(f.player.life,0);
});
test('Medusa counts successful hits even when armour absorbs all damage', () => {
  const f=fight(136,{ armour:20 });
  for(let i=0;i<2;i++)rollDenRound(f,0,sequence([1,1,4,4]));
  assert.equal(f.status,'loss');
  const invisible=fight(136,{ armour:20,invisible:true });
  for(let i=0;i<2;i++)rollDenRound(invisible,0,sequence([1,1,4,4]));
  assert.equal(invisible.status,'fighting');
  rollDenRound(invisible,0,sequence([1,1,4,4]));
  assert.equal(invisible.status,'loss');
});
test('White Rabbit poison interrupts combat after three consecutive hits', () => {
  const f=fight(6,{ armour:20 });
  f.first = 'player';
  for(let i=0;i<3;i++)rollDenRound(f,0,sequence([1,1,3,3]));
  assert.equal(f.poisonPending,true);
  assert.equal(rollDenRound(f),null);
  assert.equal(resolveDenPoison(f,sequence([3,3])).roll,6);
  assert.equal(f.player.poisonProtected,true);
});
test('Shapes fight in sequence, self-destruct on blending and cannot vanish at knockout threshold', () => {
  const f=fight(157,{life:48});
  const events=rollDenRound(f,0,low);
  assert.equal(events[1].kind,'blend');
  assert.equal(f.player.life,33);
  assert.equal(f.foes[0].life,0);
  assert.equal(f.foes[1].life,4);
  const remaining=fight(168);
  assert.equal(remaining.player.life,33);
  assert.equal(remaining.foes.length,5);
});
test('Dragon fire occurs on every third successful hit, even when armour absorbs damage', () => {
  const f=fight(172,{armour:20});
  for(let i=0;i<3;i++)rollDenRound(f,0,sequence([1,1,3,3]));
  assert.equal(f.foes[0].attacks,3);
  f.player.armour=0;
  for(let i=0;i<3;i++)rollDenRound(f,0,sequence([1,1,3,3]));
  assert.equal(f.events.find(e=>e.kind==='enemy').damage,11);
});
test('missed Dragon attacks do not advance its printed third-hit fire cycle', () => {
  const f = fight(172, {life:100, maxLife:100});
  rollDenRound(f, 0, low);
  for (let i=0;i<3;i++) rollDenRound(f, 0, sequence([1,1,3,3]));
  assert.equal(f.foes[0].attacks, 4);
  assert.equal(f.foes[0].successfulHits, 3);
  assert.equal(f.events.find(e=>e.kind==='enemy').damage, 11);
});
test('Water Weird is one PAD or POW attempt, not an ordinary fight', () => {
  for (const spell of ['pad','pow']) {
    const f = fight(60);
    assert.equal(rollDenRound(f, 0, high), null);
    assert.equal(castDenSpell(f, 'panic', 0, high), null);
    assert.equal(castDenSpell(f, spell, 0, high).success, true);
    assert.equal(f.status, 'win');
    assert.equal(f.foes[0].life, 0);
    assert.equal(f.player.life, 45);
  }
  const lost = fight(60);
  castDenSpell(lost, 'pad', 0, low);
  assert.equal(lost.status, 'loss');
  assert.equal(lost.player.life, 0);
  assert.equal(fight(60, {spellUses:{pad:3,pow:3}}).status, 'loss');
});
test('spell attempts consume LIFE and quota on failure; lethal costs cannot revive', () => {
  const f=fight(24);
  for(let i=0;i<3;i++)assert.equal(castDenSpell(f,'panic',0,low).success,false);
  assert.equal(f.player.life,39);
  assert.equal(castDenSpell(f,'panic',0,high),null);
  const dying=fight(24,{life:7});
  assert.equal(castDenSpell(dying,'pad',0,high).fatal,true);
  assert.equal(dying.status,'loss');
});
test('Firefinger gives ten stored bolts once, without charging again per launch', () => {
  const f=fight(24);
  castDenSpell(f,'firefinger',0,high);
  assert.equal(f.player.bolts,10);
  assert.equal(castDenSpell(f,'firefinger',0,high),null);
  assert.equal(launchDenMagic(f,'bolts',0).damage,10);
  assert.equal(f.player.life,45);
  assert.equal(f.player.bolts,9);
});
test('PANIC protection and unused POW carry to the next ordinary encounter', () => {
  const first = fight(24);
  castDenSpell(first, 'panic', 0, high);
  castDenSpell(first, 'pow', 0, high);
  const next = createDenFight(172, first.player, {}, low);
  next.first = 'player';
  assert.equal(next.magicArmour, 4);
  assert.equal(next.nextBonus, 10);
  rollDenRound(next, 0, sequence([6,6,1,1]));
  assert.equal(next.foes[0].life, 127);
  assert.equal(next.player.pendingWallop, 0);
  assert.equal(first.player.pendingWallop, 10);
});
test('Dreamtime ignores but never consumes carried PANIC or POW', () => {
  const p = player({magicArmour:4,pendingWallop:10});
  const f = createDenFight('dream8', p, {}, high);
  assert.equal(f.magicArmour, 0);
  assert.equal(f.nextBonus, 0);
  rollDenRound(f, 0, high);
  assert.equal(f.player.pendingWallop, 10);
  assert.equal(f.player.magicArmour, 4);
  assert.equal(p.pendingWallop, 10);
});
test('a weapon passing through a Wraith does not deliver the stored POW blow', () => {
  const f = fight(102, {pendingWallop:10});
  rollDenRound(f, 0, sequence([6,6,1,1]));
  assert.equal(f.player.pendingWallop, 10);
  assert.equal(f.nextBonus, 10);
  assert.equal(f.foes[0].life, 25);
});
test('lollipop heals the current deficit and removes the same amount from opponent', () => {
  const f=fight(172,{life:20,lollipop:3});
  assert.equal(useDenLollipop(f),28);
  assert.equal(f.player.life,48);
  assert.equal(f.foes[0].life,122);
  assert.equal(f.player.lollipop,2);
});
test('Friendly Reaction uses player3d6 strictly below enemy1d6', () => {
  assert.deepEqual(denFriendlyReaction(sequence([6,1,1,1])),{enemy:6,player:3,friendly:true});
  assert.equal(denFriendlyReaction(sequence([3,1,1,1])).friendly,false);
});
test('Dreamtime carries wounds but never removes saved equipment or spell resources', () => {
  const p=player({life:30,armour:4,bolts:8});
  const before=structuredClone(p);
  const d=denDream(p,8,low);
  assert.deepEqual(p,before);
  assert.equal(d.fight.player.life,30);
  assert.equal(d.fight.player.armour,4);
  assert.equal(d.fight.spec.playerArmour,5);
  assert.equal(d.fight.foes[0].life,25);
  assert.equal(d.fight.first,'enemy');
  assert.equal(castDenSpell(d.fight,'pad'),null);
});
test('Dreamtime ordinary outcomes preserve printed boundaries and equal-wave ambiguity', () => {
  assert.equal(denDream(player(),3,sequence([6,6,3,4])).status,'survived');
  assert.equal(denDream(player(),3,sequence([6,6,3,3])).status,'loss');
  assert.equal(denDream(player(),4,sequence([3,3,2,2])).loss,4);
  assert.equal(denDream(player(),12,sequence([2,2])).status,'tie');
  assert.equal(denDream(player({life:31}),12,sequence([6,1])).player.life,15);
  assert.equal(denDream(player(),9,sequence([6])).status,'sleep-again');
});
test('healing caps at maximum and never resurrects zero LIFE', () => {
  const p=player({life:40});
  assert.equal(healDenPlayer(p,20),true);
  assert.equal(p.life,48);
  p.life=0;
  assert.equal(healDenPlayer(p,12),false);
  assert.equal(p.life,0);
});

test('renamed NPC metadata controls evasion, blending, petrification and arrows', () => {
  const specs = [153,157,136].map(section => DEN_ENCOUNTERS.find(s => s.section === section));
  specs.push(DEN_DREAM_FIGHTS.find(s => s.section === 'dream10'));
  const originals = specs.map(s => structuredClone(s));
  try {
    Object.assign(specs[0], { section: 900, npcRules: { openingEvasionFatalAt: 13 } });
    assert.equal(createDenFight(900, player(), {}, high).status, 'fighting');
    Object.assign(specs[1], { section: 901, npcRules: { blendDamage: 3 } });
    const shapes = fight(901); rollDenRound(shapes, 0, low);
    assert.equal(shapes.player.life, 45); assert.equal(shapes.events.at(-1).damage, 3);
    Object.assign(specs[2], { section: 902, npcRules: { invisiblePetrifyExtraHits: 2 } });
    const medusa = fight(902, { invisible: true, armour: 20 });
    for (let i = 0; i < 3; i++) rollDenRound(medusa, 0, sequence([1,1,4,4]));
    assert.equal(medusa.status, 'fighting');
    rollDenRound(medusa, 0, sequence([1,1,4,4])); assert.equal(medusa.status, 'loss');
    Object.assign(specs[3], { section: 'dream900', npcRules: { arrowHit: 2, arrowDamage: 3, rangedRounds: 2 } });
    const arrows = fight('dream900');
    assert.equal(rollDenRound(arrows, 0, low)[0].damage, 3);
    assert.equal(arrows.events.some(e => e.kind === 'enemy'), false);
    rollDenRound(arrows, 0, low);
    assert.equal(arrows.events.some(e => e.kind === 'enemy'), true);
    assert.equal(arrows.arrows, 5);
  } finally {
    specs.forEach((spec, i) => { for (const key of Object.keys(spec)) delete spec[key]; Object.assign(spec, originals[i]); });
  }
});

test('book metadata controls poison outcomes and strict invisibility eligibility', () => {
  const original = structuredClone(DEN_RULES);
  try {
    assert.equal(denInvisibilityAllowed({ section: 130 }), true);
    assert.equal(denInvisibilityAllowed({ section: 137 }), true);
    assert.equal(denInvisibilityAllowed({ section: '130' }), false);
    DEN_RULES.invisibilitySections = [900];
    const allowed = fight(24); allowed.spec.section = 900;
    assert.equal(castDenSpell(allowed, 'invisibility', 0, high).success, true);
    assert.equal(castDenSpell(fight(98), 'invisibility', 0, high), null);
    DEN_RULES.poisonResults = { fatalMax: 2, protectedMax: 4, enemyDiesAt: 5, escapeLifeDivisor: 3 };
    for (const [dice, outcome] of [[[1,1], 'loss'], [[1,2], 'protected'], [[2,3], 'win'], [[3,3], 'escaped']]) {
      const f = fight(6); f.poisonPending = true;
      resolveDenPoison(f, sequence(dice));
      if (outcome === 'protected') assert.equal(f.player.poisonProtected, true);
      else assert.equal(f.status, outcome);
      if (outcome === 'escaped') assert.equal(f.player.life, 16);
    }
  } finally { Object.assign(DEN_RULES, original); }
});

test('old saved specs preserve poison, wounds and the seven-arrow eighth-round handoff', () => {
  const rabbit = fight(6, { life: 31 }); rabbit.poisonPending = true; rabbit.foes[0].consecutiveHits = 3;
  const saved = JSON.parse(JSON.stringify(rabbit)), before = structuredClone(saved);
  assert.equal(rollDenRound(saved), null); assert.deepEqual(saved, before);
  resolveDenPoison(saved, sequence([5,5]));
  assert.equal(saved.player.life, 15); assert.equal(saved.status, 'escaped');
  const arrows = fight('dream10', { life: 100, maxLife: 100 }); delete arrows.spec.npcRules;
  arrows.rounds = 6; arrows.arrows = 1;
  rollDenRound(arrows, 0, sequence([3,4]));
  assert.equal(arrows.events[0].damage, 10); assert.equal(arrows.arrows, 0);
  assert.equal(arrows.events.some(e => e.kind === 'enemy'), false);
  rollDenRound(arrows, 0, low);
  assert.equal(arrows.rounds, 8); assert.equal(arrows.events.some(e => e.kind === 'enemy'), true);
  assert.equal(arrows.spec.npcRules, undefined);
});
