import {loadFixtureRoster} from './roster-fixtures.mjs';
await loadFixtureRoster(706);
import test from 'node:test';import assert from 'node:assert/strict';
import {DESERT_RULES} from '../../../public/js/battlesim/books/706/definition.js';
import {defendShip,retakeShip,attackShip} from '../../../public/js/battlesim/books/706/combat.js';
const withRules=fn=>{const before=structuredClone(DESERT_RULES);try{fn();}finally{Object.assign(DESERT_RULES,before);}};

test('naval resource limits and position effects read metadata',()=>withRules(()=>{
 DESERT_RULES.force=10;DESERT_RULES.pots=4;DESERT_RULES.bows=2;
 assert.equal(defendShip({А:{force:10}}).survivors,10);
 assert.throws(()=>defendShip({А:{force:11}}),/Invalid force/);
 DESERT_RULES.force=31;DESERT_RULES.broadside.whip=20;
 const broadside=defendShip({А:{force:26},Ж:{force:5,whip:true}},{whip:true});
 assert.equal(broadside.results.find(r=>r.key==='Ж').enemies,12);
 DESERT_RULES.lookoutBonus=7;
 assert.equal(defendShip({А:{force:30},Й:{force:1,bows:1}}).results.find(r=>r.key==='Й').points,7);
}));

test('retaking and assault settings preserve strict victory and manual equipment decisions',()=>withRules(()=>{
 DESERT_RULES.retake.whipKills=4;
 assert.equal(retakeShip({survivors:5,remainingPirates:4,whipSurvives:true,whipKills:4}).survivors,4);
 DESERT_RULES.attack={pirates:3,forceRatio:2,win:888,retreat:999};DESERT_RULES.death=777;
 assert.equal(attackShip({survivors:6}).destination,999);
 const victory=attackShip({survivors:7});assert.equal(victory.destination,888);assert.equal(victory.survivors,1);
 assert.equal(attackShip({survivors:0}).destination,777);
 assert.equal(retakeShip({survivors:0,remainingPirates:3}).needsManualEquipmentAvailability,undefined);
 assert.equal(retakeShip({survivors:5,remainingPirates:1}).needsManualEquipmentAvailability,true);
}));

test('deployment rejects inherited object-property position names',()=>{
 for(const key of ['constructor','__proto__','toString'])assert.throws(()=>defendShip(Object.fromEntries([[key,{force:31}]])),/Unknown position/);
});
