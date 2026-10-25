import {loadFixtureRoster} from './roster-fixtures.mjs';
await loadFixtureRoster(690);
import test from 'node:test';
import assert from 'node:assert/strict';
import {CROWN_SETTINGS} from '../../../public/js/battlesim/engines/legendary-kingdoms/crown-roster.js';
import {newCrownCharacter} from '../../../public/js/battlesim/engines/legendary-kingdoms/character.js';
import {startCrownFight} from '../../../public/js/battlesim/engines/legendary-kingdoms/crown.js';
import {planLegendaryEnemy} from '../../../public/js/battlesim/engines/legendary-kingdoms/enemy-actions.js';
import {legendaryEnemyAttack,legendaryChooseVulnerable,legendaryMoveHero} from '../../../public/js/battlesim/engines/legendary-kingdoms/combat.js';
import {applyLegendaryEndRound} from '../../../public/js/battlesim/engines/legendary-kingdoms/effects.js';
const party=()=>['jessica','tiquon','tasha','akihiro'].map(newCrownCharacter);
const withSettings=fn=>{const before=structuredClone(CROWN_SETTINGS);try{fn();}finally{Object.assign(CROWN_SETTINGS,before);}};

test('Crown spell tables and entry wounds come from metadata and remain independently captured',()=>withSettings(()=>{
 const effect=CROWN_SETTINGS.enemyEffects.find(e=>e.section===543&&e.properties.spellPlan);
 effect.properties.spellPlan.entries[0].effects[0].count=2;
 CROWN_SETTINGS.enemyEffects.find(e=>e.section===543&&e.healthLoss).healthLoss=1;
 const fight=startCrownFight(party(),543,{wizardWounded:true});
 assert.equal(fight.enemies[0].health,6);assert.equal(fight.enemies[0].maxHealth,7);
 assert.equal(fight.enemies[0].spellPlan.entries[0].effects[0].count,2);
 fight.enemies[0].spellPlan.entries[0].effects[0].count=99;
 assert.equal(startCrownFight(party(),543).enemies[0].spellPlan.entries[0].effects[0].count,2);
 CROWN_SETTINGS.entryDamage[256].hits=1;
 assert.equal(startCrownFight(party(),256,{entryDamageHero:0}).party[0].health,8);
}));

test('conditional enemies, reactions and pirate routes read loaded rules',()=>withSettings(()=>{
 CROWN_SETTINGS.ogres[0].minimumVisits=3;
 assert.ok(!startCrownFight(party(),738,{ogreVisits:2}).enemies.some(e=>e.name==='Sly Ogre'));
 CROWN_SETTINGS.reactions[182][0].hits=7;
 assert.equal(startCrownFight(party(),182).rules.thresholdReactions[0].hits,7);
 CROWN_SETTINGS.pirates.wins.cog=777;
 assert.equal(startCrownFight(party(),1193,{vesselType:'cog'}).rules.win,777);
 assert.throws(()=>startCrownFight(party(),1193,{vesselType:{toString:()=> 'cog'}}),/Choose the pirate ship/);
}));

test('saved enemy choices keep their captured settings, wounds and extensions',()=>{
 const original=startCrownFight(party(),399);original.phase='enemy';original.enemies[0].health=17;
 original.extension={keep:true};
 const pending=legendaryEnemyAttack(original,()=>1);
 assert.ok(pending.pendingChoice?.chooseVulnerability);
 const saved=JSON.parse(JSON.stringify(pending));
 const chosen=legendaryChooseVulnerable(saved,0,()=>1);
 assert.equal(chosen.enemies[1].forcedAttackThreshold,2);
 assert.equal(chosen.enemies[0].health,17);
 assert.deepEqual(chosen.extension,{keep:true});
 assert.ok(pending.pendingChoice);
});

test('dynamic rescue and trapped recipients remain party indices',()=>withSettings(()=>{
 CROWN_SETTINGS.rescue.damage=6;
 const rescued=startCrownFight(party(),1185,{boyFreed:false});
 assert.deepEqual(rescued.enemies.find(e=>e.name==='Fast Thug').forcedDamage,{hits:6,forcedMember:2});
 CROWN_SETTINGS.trap.damage=3;
 const trapped=startCrownFight(party(),1146,{trappedHero:0});
 assert.deepEqual(trapped.enemies[0].beforeAttackDamage,{hits:3,forcedMember:0,unpreventable:true});
}));

test('net, grapple and pit settings are loaded without depending on Valley metadata',()=>withSettings(()=>{
 CROWN_SETTINGS.netAttack={count:2,threshold:5};
 const pirates=startCrownFight(party(),1193,{vesselType:'cog'});
 assert.deepEqual(planLegendaryEnemy(pirates,7,()=>1),[{enemyIndex:7,count:2,threshold:5,stunOnly:true}]);
 CROWN_SETTINGS.grappleDamage=1;
 const grapple=startCrownFight(party(),621,{grappleRolls:[6,1,1,1],freeHero:0});
 applyLegendaryEndRound(grapple,()=>1);
 assert.equal(grapple.party[0].health,9);assert.equal(grapple.party[1].health,6);
 CROWN_SETTINGS.pit.moveDamage=2;
 const pit=startCrownFight(party(),762,{pitVictim:0,entryDamageAlreadyApplied:true});
 assert.equal(legendaryMoveHero(pit,1,'pool').party[1].health,5);
}));
