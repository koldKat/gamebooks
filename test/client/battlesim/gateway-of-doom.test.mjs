import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from './simulator-source.mjs';
import {runInNewContext} from 'node:vm';
import { GATEWAY_ENCOUNTERS, GATEWAY_WANDERING } from '../../../public/js/battlesim/engines/grailquest/gateway-of-doom-roster.js';
import { createGatewayCharacter, initialGatewayStats, createGatewayFight, rollGatewayRound,
  gatewayTargets, launchGatewayMagic, castGatewaySpell, useGatewayHealing, useGatewayAntidote,
  useGatewayAardvark, callGatewayDjinn, resurrectGatewayPlayer, visitGatewaySection,
  exchangeGatewayExperience } from '../../../public/js/battlesim/engines/grailquest/gateway-of-doom.js';
import { gatewayDream, gatewaySleep, resolveGatewayLimerick, callGatewayGnurlbash,
  gatewayWandering, gatewayBribe, rollGatewayWizardRound, leaveGatewayZapper }
  from '../../../public/js/battlesim/engines/grailquest/gateway-of-doom.js';

const high = () => 0.999;
test('the simulator is registered in desktop/mobile loaders and mutually exclusive overlays', () => {
  const loader = readFileSync(new URL('../../../public/js/battlesim/loader.js', import.meta.url), 'utf8');
  const registry = loader.match(/SUPPORTED_BATTLE_SIM_BOOKS = new Set\(\[([\s\S]*?)\]\)/)[1];
  assert.ok([...registry.matchAll(/\d+/g)].some(match => Number(match[0]) === 528));
  const mobile = readFileSync(new URL('../../../public/mobile/js/battlesim-dispatch.js', import.meta.url), 'utf8');
  const mobileRegistry = mobile.match(/SUPPORTED_BATTLE_SIM_BOOKS = new Set\(\[([\s\S]*?)\]\)/)[1];
  assert.ok([...mobileRegistry.matchAll(/\d+/g)].some(match => Number(match[0]) === 528));
  const util = readFileSync(new URL('../../../public/js/core/util.js', import.meta.url), 'utf8');
  const overlays = util.match(/ALL_PANEL_OVERLAY_IDS = (\[[^;]+\])/)[1];
  assert.ok(runInNewContext(overlays).includes('sim528-overlay'));
});
test('actual state XP processing awards new simulator outcomes without render or replay awards', () => {
  const source = readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8');
  const keys = runInNewContext(source.match(/const SIM_HISTORY_KEYS = (\[[^;]+\])/)[1]);
  assert.ok(keys.includes('sim528'));
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
  const state = history => ({playthroughs:[{startedAt:1,path:[],sim528:{history}}]});
  const history = [{outcome:'win',ts:100},{outcome:'loss',ts:101},{outcome:'escaped',ts:102}];
  context.processStateXp(1, 528, state([]), state(history), 0);
  context.processStateXp(1, 528, state(history), state(history), 0);
  assert.deepEqual(awards.filter(row => row.event.startsWith('battlesim_')),
    [{event:'battlesim_win',ref:'sim528:100'},{event:'battlesim_loss',ref:'sim528:101'}]);
});
const low = () => 0;
const player = extra => ({ ...createGatewayCharacter(), life: 100, maxLife: 100, speed: 20, ...extra });
const fight = (section, extra = {}, options = {}) => {
  const f = createGatewayFight(section, player(extra), options, high);
  f.first = 'player';
  return f;
};

test('Gateway initial rolls and resources are source-specific', () => {
  assert.deepEqual(initialGatewayStats(10, high), { rolls: [48,48,48], life:58, speed:24, gold:120 });
  const p = createGatewayCharacter();
  assert.equal(p.bolts,10); assert.equal(p.fireballs,2); assert.equal(p.potions,18); assert.equal(p.salves,5);
  assert.throws(() => initialGatewayStats(11, high), RangeError);
});

test('starting combat clones current wounds and never changes source character or roster', () => {
  const p = player({life:23}), before = JSON.stringify(p), spec = JSON.stringify(GATEWAY_ENCOUNTERS);
  const f = createGatewayFight(13,p,{},high);
  assert.equal(f.player.life,23);
  f.player.life--;
  assert.equal(JSON.stringify(p),before); assert.equal(JSON.stringify(GATEWAY_ENCOUNTERS),spec);
});

test('sequential enemies do not all retaliate, and ordinary groups reroll initiative', () => {
  const f = fight(13,{bonus:0,hit:12});
  rollGatewayRound(f,0,high);
  assert.equal(f.events.filter(e=>e.kind==='enemy').length,1);
  const g = fight(13,{bonus:100});
  rollGatewayRound(g,0,high);
  assert.equal(gatewayTargets(g).length,2);
  assert.equal(g.first,null);
  assert.equal(g.events.filter(e=>e.kind==='enemy').length,0);
});

test('wandering groups retain one initiative and printed values without invented poison', () => {
  const f = fight('level2-9',{bonus:100});
  rollGatewayRound(f,0,high);
  assert.equal(f.first,'player');
  assert.equal(gatewayTargets(f).length,1);
  assert.equal(f.foes[0].maxLife,15); assert.equal(f.foes[0].hit,5); assert.equal(f.foes[0].bonus,2);
  assert.equal(GATEWAY_WANDERING.find(e=>e.section==='level2-8').foes[0].poison,undefined);
});

test('encumbrance skips alternate turns without altering weapon stats', () => {
  const f = fight(32,{weight:11,hit:12,bonus:0});
  rollGatewayRound(f,0,low);
  rollGatewayRound(f,0,low);
  assert.equal(f.playerStrikes,1);
  assert.ok(f.events.some(e=>e.kind==='encumbered'));
  assert.equal(f.player.hit,12);
});

test('POPS consumes two throws, including a miss, rather than two successful hits', () => {
  const f = fight(32);
  f.pops=2;
  rollGatewayRound(f,0,low);
  assert.equal(f.pops,1);
  rollGatewayRound(f,0,high);
  assert.equal(f.events.find(e=>e.kind==='player').damage,6);
  assert.equal(f.pops,0);
});

test('firefinger needs no roll or LIFE charge and Fireball is wasted below six', () => {
  const f = fight(32);
  const before=f.player.life;
  assert.equal(launchGatewayMagic(f,'bolts',0,()=>{throw Error('Unexpected roll');}).damage,10);
  assert.equal(f.player.bolts,9); assert.equal(f.player.life,before);
  assert.equal(launchGatewayMagic(f,'fireballs',0,low).success,false);
  assert.equal(f.player.fireballs,1);
});

test('successful coin and curse effects combine for sword and spell damage', () => {
  const f=fight(32,{coin:true,emerald:true});
  assert.equal(launchGatewayMagic(f,'bolts',0,high).damage,11);
  rollGatewayRound(f,0,high);
  assert.equal(f.events.find(e=>e.kind==='player').damage,14);
});

test('healing distinguishes printed two-die and one-die potions and cannot revive', () => {
  const p=player({life:10,smallPotions:6});
  assert.equal(useGatewayHealing(p,'potions',high).amount,12);
  assert.equal(useGatewayHealing(p,'smallPotions',high).amount,6);
  assert.equal(useGatewayHealing(p,'salves',high).amount,3);
  p.life=0;
  assert.equal(useGatewayHealing(p,'potions',high),null);
});

test('Black Knight armour decreases by successful hits, even blocked ones', () => {
  const f=fight(200,{}, {djinnGone:true,dwarvesGone:true});
  for(let i=0;i<7;i++) f.foes[i].life=0;
  const results=[];
  for(let i=0;i<3;i++){rollGatewayRound(f,7,high); results.push(f.events.find(e=>e.kind==='player').damage);}
  assert.deepEqual(results,[1,7,9]);
});

test('Bota-Botas remain alive at five LIFE and kill after six attempted strikes', () => {
  const f=fight(126);
  assert.equal(gatewayTargets(f).length,5);
  for(let i=0;i<6;i++) rollGatewayRound(f,0,low);
  assert.equal(f.status,'loss'); assert.equal(f.player.life,0);
});

test('first poison plant counts total hits, while spider counts unanswered hits', () => {
  const plant=fight(111,{bonus:0,hit:12});
  for(let i=0;i<3;i++) rollGatewayRound(plant,0,high);
  assert.equal(plant.player.life,0);
  const spider=fight(71,{bonus:0,hit:12});
  for(let i=0;i<3;i++) rollGatewayRound(spider,0,high);
  assert.ok(spider.player.life>0);
  assert.equal(spider.foes[0].unanswered,1);
});

test('baby Manticore fires only once immediately after a parent dies', () => {
  const f=fight(76,{bonus:100});
  rollGatewayRound(f,0,high);
  assert.equal(f.player.life,25);
  assert.equal(f.foes[2].fireballUsed,true);
  f.first='player';
  rollGatewayRound(f,1,high);
  assert.equal(f.events.filter(e=>e.kind==='baby-fireball').length,0);
});

test('magic zapper failure removes magic without fabricating a victory', () => {
  const f=fight(140);
  rollGatewayRound(f,0,low);
  assert.equal(f.status,'escaped'); assert.equal(f.player.magicLost,true); assert.equal(f.player.experience,0);
});

test('ants have real one-point LIFE and Aardvark eats twenty only on six or better', () => {
  const f=fight(90,{aardvark:true});
  assert.equal(f.foes.length,120); assert.equal(gatewayTargets(f).length,120);
  useGatewayAardvark(f,high);
  assert.equal(gatewayTargets(f).length,100);
  useGatewayAardvark(f,low);
  assert.equal(gatewayTargets(f).length,100);
});

test('slime poison costs two on a player hit and antidote permits a free enemy turn', () => {
  const f=fight(200,{}, {djinnGone:true,dwarvesGone:true});
  f.poisoned=f.player.poisoned=true;
  f.player.antidotes=1;
  rollGatewayRound(f,0,high);
  assert.equal(f.player.life,98);
  gatewayTargets(f)[0].foe.successfulHits=1;
  const result=useGatewayAntidote(f,high);
  assert.ok(result.some(e=>e.kind==='enemy'));
  assert.equal(f.player.poisoned,false);
  assert.equal(f.player.antidotes,0);
});

test('Djinn uses its own LIFE and cannot be summoned a fourth time', () => {
  const f=fight(32,{tinglering:true});
  assert.equal(callGatewayDjinn(f),true);
  rollGatewayRound(f,0,high);
  assert.equal(f.player.life,100); assert.ok(f.companion.life<100);
  f.player.djinnCalls=3; f.companion.life=0;
  assert.equal(callGatewayDjinn(f),false);
});

test('resurrection only revives the dead, retaining wounds/rules outside that explicit action', () => {
  const f=fight(32,{resurrection:true});
  assert.equal(resurrectGatewayPlayer(f,high),null);
  f.player.life=0; f.status='loss';
  assert.equal(resurrectGatewayPlayer(f,high).success,true);
  assert.equal(f.player.life,100);
  assert.equal(castGatewaySpell(f,'pow',0,high),null);
  visitGatewaySection(f.player,33); visitGatewaySection(f.player,34); visitGatewaySection(f.player,35);
  assert.equal(f.player.magicLock.length,0);
});

test('experience exchange is explicit, not a silent automatic LIFE increase', () => {
  const p=player({life:22,experience:20});
  assert.equal(exchangeGatewayExperience(p),true);
  assert.equal(p.life,23); assert.equal(p.maxLife,101); assert.equal(p.permanent,1);
  assert.equal(exchangeGatewayExperience(p),false);
});

test('every numeric and dynamic encounter can start without changing its source player', () => {
  for(const spec of [...GATEWAY_ENCOUNTERS,...GATEWAY_WANDERING]) {
    const p=player(), original=JSON.stringify(p);
    const f=createGatewayFight(spec.section,p,{},high);
    assert.ok(f.foes.length>0,String(spec.section));
    assert.equal(JSON.stringify(p),original);
    assert.ok(f.foes.every(foe=>Number.isSafeInteger(foe.life)&&foe.life>=0));
  }
});

test('Medusa raw twelve skips four player turns, and shield can block it', () => {
  const f=fight('level2-7',{bonus:0,hit:12});
  rollGatewayRound(f,0,high);
  assert.equal(f.skipPlayer,4);
  const g=fight('level2-7',{shield:true,bonus:0,hit:12});
  g.enemyBlows=2;
  rollGatewayRound(g,0,high);
  assert.equal(g.skipPlayer,0); assert.equal(g.player.life,100);
});

test('shield does not transfer to a Djinn companion', () => {
  const f=fight(32,{shield:true,armour:20,tinglering:true,bonus:0});
  callGatewayDjinn(f); f.enemyBlows=2;
  rollGatewayRound(f,0,high);
  assert.equal(f.companion.life,92);
  assert.equal(f.player.life,100);
});

test('polish and lamp consume one of six uses only when enabled before combat', () => {
  const p=player({polish:6,lamp:6});
  const f=createGatewayFight(32,p,{polish:true,lamp:true},high);
  assert.equal(f.player.polish,5); assert.equal(f.player.lamp,5); assert.equal(f.magicArmour,3);
  assert.equal(p.polish,6); assert.equal(p.lamp,6);
  const g=createGatewayFight(32,p,{},high);
  assert.equal(g.player.polish,6); assert.equal(g.magicArmour,0);
});

test('weedkiller doubles only the first successful vegetable hit', () => {
  const f=fight('level2-10',{weedkiller:3}, {weedkiller:true});
  rollGatewayRound(f,0,low);
  assert.equal(f.weedkiller,true);
  rollGatewayRound(f,0,high);
  assert.equal(f.events.find(e=>e.kind==='player').damage,26);
  assert.equal(f.weedkiller,false); assert.equal(f.player.weedkiller,2);
});

test('entering the web or freezing water can kill before combat, without a fake win', () => {
  assert.equal(createGatewayFight(85,player(),{},high).status,'loss');
  assert.equal(createGatewayFight(120,player(),{},low).status,'loss');
  assert.equal(createGatewayFight(124,player(),{},low).redirect,101);
});

test('dreams carry actual LIFE, ignore equipment and grant no normal combat experience', () => {
  const p=player({life:33,armour:100,bonus:100,coin:true});
  const result=gatewayDream(p,3,{},high);
  assert.equal(result.fight.player.life,33);
  rollGatewayRound(result.fight,0,high);
  assert.equal(result.fight.events.find(e=>e.kind==='player').damage,6);
  rollGatewayRound(result.fight,0,high);
  assert.equal(result.fight.status,'win'); assert.equal(result.fight.player.experience,0);
  assert.equal(p.life,33);
});

test('Rogue must die within three player strikes, not merely be knocked out', () => {
  const f=createGatewayFight('dream3',player(),{},high);
  assert.equal(f.spec.deathRequired,true);
  for(let i=0;i<3;i++) rollGatewayRound(f,0,low);
  assert.equal(f.player.life,0);
});

test('dream crystal, burial and bonds follow printed dice ranges', () => {
  assert.equal(gatewayDream(player({life:30}),5,{},high).player.life,42);
  assert.equal(gatewayDream(player({life:30}),5,{},low).player.life,20);
  const burial=gatewayDream(player(),11,{},low);
  assert.equal(burial.player.life,0); assert.equal(burial.rolls.length,5);
  assert.equal(gatewayDream(player(),11,{},high).rolls.length,1);
  assert.equal(gatewayDream(player(),10,{},high).player.life,0);
});

test('dream limerick is an explicit player decision, never invented by simulator', () => {
  const p=player({life:30});
  assert.equal(gatewayDream(p,6,{},high).status,'limerick');
  resolveGatewayLimerick(p,false);
  assert.equal(p.life,25);
});

test('Gnurlbash can leave Dreamtime but fights only one monster', () => {
  const result=gatewayDream(player(),7,{},high);
  assert.equal(result.player.gnurlbash,true);
  const f=createGatewayFight(13,result.player,{},high); f.first='player';
  assert.equal(callGatewayGnurlbash(f),true);
  f.foes[0].life=6;
  rollGatewayRound(f,0,high);
  assert.equal(f.events.find(e=>e.kind==='player').damage,8);
  assert.equal(f.companion,null); assert.equal(f.player.gnurlbash,false);
});

test('successful sleeping clears resurrection magic lock without curing poison', () => {
  const p=player({life:40,poisoned:true,magicLock:['32']});
  const result=gatewaySleep(p,32,high);
  assert.equal(result.player.life,52); assert.equal(result.player.poisoned,true);
  assert.equal(result.player.magicLock.length,0); assert.equal(p.life,40);
});

test('wandering traps distinguish LIFE damage and travel poison', () => {
  const sequence=values=>{let i=0;return()=>values[i++]??0;};
  const pit=gatewayWandering(player(),3,sequence([0.4,0.4,0.999,0.999]));
  assert.equal(pit.roll,6); assert.equal(pit.damage,12); assert.equal(pit.player.life,88);
  const spike=gatewayWandering(player(),3,sequence([0.999,0.4,0,0]));
  assert.equal(spike.roll,9); assert.equal(spike.player.travelPoison,5);
});

test('bribes require current book-money balance and spend it even when refused', () => {
  const poor=fight(71,{gold:999});
  assert.equal(gatewayBribe(poor,high),null);
  const rich=fight(76,{gold:1500});
  assert.equal(gatewayBribe(rich,low).cost,1500); assert.equal(rich.player.gold,0);
  assert.equal(gatewayBribe(rich,high),null);
  const accepted=fight(71,{gold:1000});
  assert.equal(gatewayBribe(accepted,high).success,true);
  assert.equal(accepted.status,'avoided'); assert.equal(accepted.player.experience,0);
});

test('wizard casts charge his own LIFE and bolts retain their printed poor damage', () => {
  const f=fight(113,{bonus:0,hit:12});
  const events=rollGatewayWizardRound(f,'firefinger',high);
  assert.ok(events.some(e=>e.kind==='wizard-spell'));
  assert.equal(f.foes[0].life,37); assert.equal(f.foes[0].bolts,10);
  rollGatewayWizardRound(f,'bolt',high);
  assert.equal(f.foes[0].life,37); assert.equal(f.foes[0].bolts,9);
  assert.equal(f.player.life,98);
  assert.equal(rollGatewayWizardRound(f,'firefinger',high),null);
  assert.equal(rollGatewayWizardRound(f,'invisibility',high),null);
});

test('leaving Zapper doubles future spell costs without destroying remaining magic', () => {
  const f=fight(140);
  assert.equal(leaveGatewayZapper(f),true);
  assert.equal(f.player.magicCost,2); assert.equal(f.player.magicLost,false);
  const g=createGatewayFight(32,f.player,{},high);
  assert.equal(castGatewaySpell(g,'pow',0,high).cost,6);
});
