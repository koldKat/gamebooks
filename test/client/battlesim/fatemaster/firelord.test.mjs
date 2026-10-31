import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../../helpers/roster-db.cjs';
import {getRoster,getPlayerDefaults,loadRoster} from '../../../../public/js/battlesim/books/1477/definition.js';
import {prepareFatemasterEncounter,startFatemasterEncounter} from '../../../../public/js/battlesim/engines/fatemaster/catalog.js';
import {assignFatemasterDamage,attackFatemaster,disengageFatemaster,resolveFatemasterCheck,resolveFatemasterEnemy,resolveFatemasterFlameRound,resolveFatemasterHostileDamage,resolveFatemasterHostileSave,resolveFatemasterOpeningHit} from '../../../../public/js/battlesim/engines/fatemaster/battle.js';
import {allocateFatemasterSpell,castFatemaster,resolveFatemasterSpell,resolveFatemasterSpellCheck,resolveFatemasterSpellDice,resolveFatemasterSpellSave} from '../../../../public/js/battlesim/engines/fatemaster/spells.js';
import {conscious} from '../../../../public/js/battlesim/engines/fatemaster/rules.js';
import {rememberFatemasterFight} from '../../../../public/js/battlesim/engines/fatemaster/state.js';

const catalog=readRosterDocument(1477);
await loadRoster(async()=>({ok:true,json:async()=>catalog.enemies}));
const roster=getRoster(),defaults=getPlayerDefaults(),entry=s=>roster.find(e=>e.section===String(s));
const reload=f=>JSON.parse(JSON.stringify(f));
const setup=(preset,variant='')=>prepareFatemasterEncounter(preset,{variant,disarmInterpretation:'raw-hit',furyMode:'once'});

test('the database catalog contains the full source roster and starts with no awarded gear',()=>{
  assert.equal(roster.length,16);
  assert.equal(roster.reduce((sum,e)=>sum+e.groups.reduce((n,g)=>n+g.count,0),0),25);
  assert.equal(defaults.player.damage,1);
  assert.equal(defaults.player.defenceModifier,0);
  assert.equal(defaults.player.weaponAttack,0);
  assert.equal(entry(369).groups[0].each.defenceBonus,0);
  assert.equal(entry(407).groups[0].each.agility,7);
  assert.equal(entry(407).groups[0].each.defenceBonus,1);
  assert.equal(entry(419).groups[0].each.powerDefensiveOnly,true);
  assert.equal(entry(461).groups[0].each.defenceBonus,0);
  assert.equal(setup(entry(461),'armoured').groups[0].each.defenceBonus,3);
  assert.equal(entry(148).rules.stopRemaining,1);
  assert.equal(entry(482).rules.castingFails,true);
  assert.equal(roster.some(e=>['491','499'].includes(e.section)),false);
});

test('ambiguous weapon swap and casting fury need actual player choices',()=>{
  assert.throws(()=>startFatemasterEncounter(defaults.player,entry(403)));
  assert.throws(()=>startFatemasterEncounter(defaults.player,entry(54)));
  assert.throws(()=>startFatemasterEncounter(defaults.player,entry(285)));
  assert.equal(setup(entry(403),'arena').rules.healingDetection,true);
  assert.equal(setup(entry(54)).rules.survivingCastBonusMode,'once');
});

test('all source fights and variants finish or pause with each pending action saved and reloaded',()=>{
  let completed=0,choices=0,seed=1477;
  const die=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%6+1;};
  const path={path:[1,96],inventory:{keep:'original'},otherFight:{keep:true}},beforePath=JSON.stringify(path);
  for(const preset of roster)for(const variant of preset.variants??[{key:''}])for(const spells of [false,true]){
    const original=JSON.stringify(preset),config=setup(preset,variant.key);
    const hero={...structuredClone(defaults.player),strength:12,agility:12,maxStrength:12,maxAgility:12,power:20,maxPower:20,damage:4};
    let fight=startFatemasterEncounter(hero,config),steps=0;
    while(fight.status==='fighting'&&steps++<1500){
      fight=reload(fight);choices++;
      const pending=fight.pending;
      if(pending?.kind==='opening-hit')fight=resolveFatemasterOpeningHit(fight,fight.opponents.find(conscious).id);
      else if(pending?.kind==='flame-round')fight=resolveFatemasterFlameRound(fight,true);
      else if(pending?.kind==='enemy')fight=resolveFatemasterEnemy(fight,die);
      else if(pending?.kind==='damage')fight=assignFatemasterDamage(fight,pending.pool??(fight.player.strength>=fight.player.agility?'strength':'agility'));
      else if(pending?.kind==='check')fight=resolveFatemasterCheck(fight,die);
      else if(pending?.kind==='hostile-save')fight=resolveFatemasterHostileSave(fight,die);
      else if(pending?.kind==='hostile-damage')fight=resolveFatemasterHostileDamage(fight,die);
      else if(pending?.kind==='spell-check')fight=resolveFatemasterSpellCheck(fight,die);
      else if(pending?.kind==='spell-resolve')fight=resolveFatemasterSpell(fight);
      else if(pending?.kind==='spell-dice')fight=resolveFatemasterSpellDice(fight,die);
      else if(pending?.kind==='spell-save')fight=resolveFatemasterSpellSave(fight,die);
      else if(pending?.kind==='spell-allocation'){
        let budget=pending.budget;const selected=[];
        for(const id of pending.eligible){const e=fight.opponents.find(e=>e.id===id);if(e.agility<=budget){selected.push(id);budget-=e.agility;}}
        fight=allocateFatemasterSpell(fight,selected);
      }else{
        assert.equal(pending,null,'unhandled pending action');
        const target=fight.opponents.find(e=>conscious(e)&&e.condition==='active');
        if(!target){fight=disengageFatemaster(fight);continue;}
        if(spells&&fight.player.power>=2&&fight.round%2===1){
          fight=castFatemaster(fight,fight.opponents.filter(conscious).length>1?'slumber':'bolt',{power:2,targetId:target.id});
        }else fight=attackFatemaster(fight,target.id,die);
      }
    }
    assert.notEqual(fight.status,'fighting',preset.section+'/'+variant.key+'/'+spells);
    assert.ok(['win','loss','paused','withdrawn'].includes(fight.status));
    assert.equal(fight.pending,null);
    assert.deepEqual(fight.queue,[]);
    assert.ok(fight.opponents.every(e=>e.strength>=0&&e.agility>=0));
    assert.equal(JSON.stringify(preset),original);
    const state={fight,history:[]};rememberFatemasterFight(state,1);rememberFatemasterFight(state,2);
    assert.equal(state.history.length,fight.status==='paused'?0:1);
    completed++;
  }
  assert.equal(completed,56);
  assert.ok(choices>300);
  assert.equal(JSON.stringify(path),beforePath);
});
