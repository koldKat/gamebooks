import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import * as base from '../../../public/js/battlesim/engines/demonspawn/fire-wolf.js';
import * as encounters from '../../../public/js/battlesim/engines/demonspawn/crypts-of-terror-encounters.js';
import * as combat from '../../../public/js/battlesim/engines/demonspawn/crypts-of-terror.js';
import * as spells from '../../../public/js/battlesim/engines/demonspawn/fire-wolf-magic.js';
import * as magic from '../../../public/js/battlesim/engines/demonspawn/crypts-of-terror-magic.js';
import strings from '../../../public/js/i18n/en/battlesim/battlesim535.js';

function fixture(section=100) {
  const p={...encounters.rollCryptsCharacter(()=>.4),power:250,maxPower:250,wandCharges:2,weapon:'sword',armour:'none'};
  const f=combat.createCryptsFight(encounters.prepareCryptsEncounter(section,p,{manual:p}));
  const d={player:p,fight:f,magic:magic.createCryptsMagicSection(section,f.player,f.enemies),nextOptions:{},history:[],log:[]};
  d.magic.inclination=true;
  const nodes=new Map();
  const node=key=>{
    if(!nodes.has(key))nodes.set(key,{value:'',checked:false,hidden:false,classList:{remove(){},add(){} }});
    return nodes.get(key);
  };
  node('encounter').value=String(section);node('target').value='0';node('spell').value='armour';node('cryptStart').value='6';
  const context=createContext({...base,...encounters,...combat,...spells,...magic,structuredClone,
    currentBookId:535,pt:{sim535:d,path:[1,100]},saves:0,alerts:[],confirmations:[],
    currentPlaythrough:()=>context.pt,saveState:()=>context.saves++,
    showAlert:message=>context.alerts.push(message),showConfirm:(_message,callback)=>context.confirmations.push(callback),
    escapeHtml:value=>String(value),document:{activeElement:null,getElementById:id=>node(id.replace('sim535-',''))},
    t:(key,params={})=>(strings[key]??key).replace(/\{(\w+)\}/g,(_,name)=>params[name]??`{${name}}`),
    castCryptsPlayerSpell:(f,m,s,o)=>magic.castCryptsPlayerSpell(f,m,s,o,()=>.999),
    castCryptsEnemySpell:(f,target,s)=>magic.castCryptsEnemySpell(f,target,s,()=>.999),
  });
  const source=readFileSync(new URL('../../../public/js/battlesim/battlesim535.js',import.meta.url),'utf8')
    .replace(/^import[\s\S]*?;\n/gm,'').replace(/export /g,'');
  runInContext(source,context);
  return {d,node,context,run:code=>runInContext(code,context)};
}

test('Crypts rerender and reopening do not mutate fights, resources or spell cooldowns',()=>{
  const f=fixture();f.run("cast('player');");
  const before=JSON.stringify(f.d);
  f.run('renderSim535(); renderSim535(); open();');
  assert.equal(JSON.stringify(f.d),before);assert.equal(f.node('cast').disabled,true);
  assert.equal(f.context.saves,1);
});

test('pending death Luck disables edits and attacks but offers Resurrection',()=>{
  const f=fixture();f.d.fight.pending='death-luck';f.d.fight.player.lifePoints=0;
  f.node('spell').value='resurrection';
  const before=JSON.stringify(f.d.fight);f.run('renderSim535();');
  assert.equal(JSON.stringify(f.d.fight),before);
  assert.equal(f.node('lifePoints').disabled,true);assert.equal(f.node('start').disabled,true);
  assert.equal(f.node('player_attack').disabled,true);assert.equal(f.node('enemy_cast').disabled,true);
  assert.equal(f.node('death_luck').hidden,false);assert.equal(Boolean(f.node('cast').disabled),false);
});

test('Resurrection rerolls only the player, preserving wounded enemies and its section cooldown',()=>{
  const f=fixture(34);f.d.fight.pending='death-luck';f.d.fight.player.lifePoints=0;
  f.d.magic.used.push('fireball');
  f.d.fight.enemies[0].lifePoints=100;f.d.fight.enemies[1].lifePoints=200;
  f.node('spell').value='resurrection';f.run("cast('player'); renderSim535();");
  assert.deepEqual(f.d.fight.enemies.map(e=>e.lifePoints),[100,200]);
  assert.equal(f.d.fight.pending,null);assert.equal(f.d.fight.outcome,null);
  assert.ok(f.d.fight.player.lifePoints>0);assert.ok(f.d.magic.used.includes('resurrection'));
  assert.ok(f.d.magic.used.includes('fireball'));
  assert.equal(f.node('cast').disabled,true);
});

test('UI cooldown blocks duplicate payment even when a handler is called directly',()=>{
  const f=fixture();f.run("cast('player'); cast('player');");
  assert.equal(f.d.fight.player.power,225);assert.equal(f.context.alerts.length,1);
  assert.equal(f.context.alerts[0],strings['battlesim535.error.unavailable']);
});

test('switching books or runs cannot mutate the previous simulator',()=>{
  const f=fixture();const before=JSON.stringify(f.d);
  f.context.currentBookId=534;f.run("renderSim535();cast('player');act('player_attack');");
  assert.equal(JSON.stringify(f.d),before);assert.equal(f.context.saves,0);
  f.context.currentBookId=535;f.context.pt={};f.run('renderSim535();');
  assert.equal(f.context.pt.sim535.fight,null);assert.equal(JSON.stringify(f.d),before);
});

test('delayed new-character confirmation cannot replace a different run',()=>{
  const f=fixture();f.d.fight.outcome='win';
  const before=JSON.stringify(f.d);
  f.run('rollCharacter();');assert.equal(f.context.confirmations.length,1);
  f.context.pt={};f.context.confirmations[0]();
  assert.equal(JSON.stringify(f.d),before);assert.equal(f.context.saves,0);
});

test('group victories enter history once, while nonfatal defeats are not XP losses',()=>{
  const f=fixture(34);f.d.fight.outcome='win';f.run('record(data());record(data());');
  assert.equal(f.d.history.length,1);
  const g=fixture(61);g.d.fight.outcome='defeat';g.run('record(data());');
  assert.equal(g.d.history.length,0);
});

test('wizard duel and source-missing weapon controls are visible and guarded',()=>{
  const f=fixture(111);f.d.fight.turn='player';f.node('useLife').checked=true;f.run('renderSim535();');
  assert.equal(f.node('manual').hidden,false);assert.equal(f.node('cast').disabled,true);
  assert.equal(f.node('player_attack').disabled,true);assert.equal(f.node('enemy_attack').disabled,true);
  const g=fixture(119);g.run('renderSim535();');
  assert.match(g.node('foes').innerHTML,/data-weapon="0"/);
  assert.match(g.node('foes').innerHTML,/data-weapon="1"/);
});

test('all weapon, spell, status and error labels exist in this simulator locale',()=>{
  for(const name of Object.keys(base.FIRE_WOLF_WEAPONS))assert.ok(strings[`battlesim535.weapon.${name}`],name);
  for(const name of Object.keys(spells.FIRE_WOLF_SPELLS))assert.ok(strings[`battlesim535.spell.${name}`],name);
  for(const name of ['ready','initiative','player','enemy','death-luck','win','loss','defeat','avoided','warped'])
    assert.ok(strings[`battlesim535.status.${name}`],name);
});
