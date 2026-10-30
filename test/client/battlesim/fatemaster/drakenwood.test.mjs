import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../../helpers/roster-db.cjs';
import {getRoster,getPlayerDefaults,loadRoster} from '../../../../public/js/battlesim/books/1476/definition.js';
import {expandFatemasterGroups,prepareFatemasterEncounter,startFatemasterEncounter} from '../../../../public/js/battlesim/engines/fatemaster/catalog.js';
import {assignFatemasterDamage,attackFatemaster,disengageFatemaster,resolveFatemasterCheck,resolveFatemasterEnemy,resolveFatemasterHostileDamage,resolveFatemasterHostileSave,withdrawFatemaster} from '../../../../public/js/battlesim/engines/fatemaster/battle.js';
import {allocateFatemasterSpell,castFatemaster,resolveFatemasterSpell,resolveFatemasterSpellDice,resolveFatemasterSpellSave} from '../../../../public/js/battlesim/engines/fatemaster/spells.js';
import {conscious,playerDefence} from '../../../../public/js/battlesim/engines/fatemaster/rules.js';

const catalog=readRosterDocument(1476);
await loadRoster(async()=>({ok:true,json:async()=>catalog.enemies}));
const roster=getRoster(),defaults=getPlayerDefaults(),entry=s=>structuredClone(roster.find(e=>e.section===String(s)));
const reload=f=>JSON.parse(JSON.stringify(f));
const hero=()=>({...structuredClone(defaults.player),strength:12,agility:12,maxStrength:12,maxAgility:12,power:10,maxPower:10,damage:5,weaponKind:'magic'});
const config=(s,options={})=>prepareFatemasterEncounter(entry(s),{counterBoltDice:2,...options});

test('the database owns all encounters, distinct mixed groups, equipment and source starting-score dice',()=>{
  assert.equal(roster.length,27);assert.equal(roster.reduce((n,e)=>n+e.groups.length,0),28);
  assert.equal(roster.reduce((n,e)=>n+expandFatemasterGroups(e.groups).length,0),43);
  assert.equal(defaults.weapons.length,5);assert.equal(defaults.armour.length,4);assert.equal(defaults.generation.strengthAdd,6);
  assert.ok(roster.every(e=>Array.isArray(e.sourcePages)&&e.sourcePages.length));assert.equal(entry(454).groups.length,2);
});
test('the missed-bolt ambiguity and the separate casting bolt retain distinct explicit inputs',()=>{
  assert.throws(()=>prepareFatemasterEncounter(entry(420)));
  const c=config(420,{counterBoltDice:1});assert.equal(c.rules.counterBoltDice,1);assert.equal(c.rules.castingBoltDice,2);assert.equal(c.rules.stopBelow,6);
  const f=startFatemasterEncounter(hero(),c);assert.equal(f.rules.counterBoltDice,1);
});
test('berserk variants modify only their selected opponent totals and initiative',()=>{
  for(const s of [96,311]){
    const normal=entry(s),before=JSON.stringify(normal),berserk=prepareFatemasterEncounter(normal,{variant:'berserk'});
    assert.equal(berserk.groups[0].each.attackBonus,normal.groups[0].each.attackBonus+2);assert.equal(berserk.rules.initiative,'enemy');assert.equal(JSON.stringify(normal),before);
  }
});
test('mixed invisibility gives the stoat and Goblins different Defence modifiers',()=>{
  const f=startFatemasterEncounter(hero(),config(454),{invisible:true});
  assert.equal(playerDefence(f,f.opponents[0]),3);assert.equal(playerDefence(f,f.opponents[1]),4);
});
test('the two Viper escape options retain their own pending turn counts and the source rules remain unchanged',()=>{
  const c=config(486);assert.throws(()=>withdrawFatemaster(startFatemasterEncounter(hero(),c)));
  const landing=withdrawFatemaster(startFatemasterEncounter(hero(),c),'landing');
  const bank=withdrawFatemaster(startFatemasterEncounter(hero(),c),'bank');
  assert.equal(landing.queue.filter(t=>t.kind==='round-end').length,2);assert.equal(bank.queue.filter(t=>t.kind==='round-end').length,1);
  assert.equal(landing.rules.escape,undefined);assert.throws(()=>withdrawFatemaster(startFatemasterEncounter(hero(),c),'invented'));
});
test('source poison, immunities and automatic-drain exceptions are declarative catalog rules',()=>{
  assert.equal(entry(409).rules.response,'drain');assert.equal(entry(409).rules.openingDamage,6);
  assert.deepEqual(entry(248).rules.poison,{pool:'strength',strict:false});assert.deepEqual(entry(496).rules.poison,{pool:'agility',strict:true});
  assert.equal(entry(318).rules.noMagic,true);assert.equal(entry(318).rules.weaponBreak,true);
  assert.ok(entry(54).rules.failedSpells.includes('slumber'));assert.equal(entry(54).groups[0].each.undead,true);
  assert.equal(entry(230).rules.castDamage,3);assert.equal(entry(432).rules.initiative,'enemy');
});

test('every source encounter and berserk variant resolves end to end while reloading every pending action',()=>{
  const path=[1,9,17],beforePath=JSON.stringify(path);let completed=0,choices=0;
  for(const preset of roster)for(const variant of preset.variants??[{key:''}])for(const spells of [false,true]){
    const original=JSON.stringify(preset),c=prepareFatemasterEncounter(preset,{variant:variant.key,counterBoltDice:2});
    let seed=Number(preset.section)*17+(spells?123:0),f=startFatemasterEncounter(hero(),c),actions=0;
    const die=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%6+1;};
    while(f.status==='fighting'&&actions++<1500){
      f=reload(f);choices++;
      const p=f.pending;
      if(p?.kind==='enemy')f=resolveFatemasterEnemy(f,die);
      else if(p?.kind==='damage')f=assignFatemasterDamage(f,p.pool??(f.player.strength>=f.player.agility?'strength':'agility'));
      else if(p?.kind==='check')f=resolveFatemasterCheck(f,die);
      else if(p?.kind==='hostile-save')f=resolveFatemasterHostileSave(f,die);
      else if(p?.kind==='hostile-damage')f=resolveFatemasterHostileDamage(f,die);
      else if(p?.kind==='spell-resolve')f=resolveFatemasterSpell(f);
      else if(p?.kind==='spell-dice')f=resolveFatemasterSpellDice(f,die);
      else if(p?.kind==='spell-save')f=resolveFatemasterSpellSave(f,die);
      else if(p?.kind==='spell-allocation'){
        let budget=p.budget;const chosen=[];
        for(const id of p.eligible){const e=f.opponents.find(e=>e.id===id);if(e.agility<=budget){chosen.push(id);budget-=e.agility;}}
        f=allocateFatemasterSpell(f,chosen);
      }else{
        const target=f.opponents.find(e=>conscious(e)&&e.condition==='active');
        if(!target){f=disengageFatemaster(f);continue;}
        if(spells&&f.player.power>=2&&f.round%2===1){
          const spell=f.opponents.filter(conscious).length>1?'slumber':'bolt';
          f=castFatemaster(f,spell,{power:2,targetId:target.id});
        }else f=attackFatemaster(f,target.id,die);
      }
    }
    assert.notEqual(f.status,'fighting',`${preset.section}/${variant.key}/${spells}`);
    assert.ok(['win','loss','paused','withdrawn'].includes(f.status));assert.equal(f.pending,null);assert.equal(f.queue.length,0);
    assert.ok(f.opponents.every(e=>e.strength>=0&&e.agility>=0));assert.equal(JSON.stringify(preset),original);completed++;
  }
  assert.equal(completed,58);assert.ok(choices>200);assert.equal(JSON.stringify(path),beforePath);
});
