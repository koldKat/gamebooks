import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newFabledCharacter} from '../../../public/js/battlesim/engines/fabled-lands/character.js';
import {startFabledFight,fabledRound} from '../../../public/js/battlesim/engines/fabled-lands/core.js';
import {HIDDEN_DEFAULTS,startHiddenFight,hiddenRound} from '../../../public/js/battlesim/engines/fabled-lands/hidden-faces.js';
import {newSerpentCharacter,startSerpentFight,serpentRound} from '../../../public/js/battlesim/engines/fabled-lands/serpent-domain.js';
import {RISING_DEFAULTS,startRisingFight,risingRound} from '../../../public/js/battlesim/engines/fabled-lands/rising-sun.js';

test('combat events retain each custom opponent identity despite duplicate preset names',()=>{
  for(const [create,start,step] of [[()=>newFabledCharacter(),startFabledFight,fabledRound],
    [()=>newFabledCharacter('warrior',HIDDEN_DEFAULTS),startHiddenFight,hiddenRound],
    [newSerpentCharacter,startSerpentFight,serpentRound],
    [()=>newFabledCharacter('warrior',RISING_DEFAULTS),startRisingFight,risingRound]]){
    const character=create(),before=structuredClone(character);
    const enemies=['First custom foe','Second custom foe'].map(displayName=>({
      name:'same-preset',displayName,combat:0,defence:1,stamina:100,
    }));
    let fight=start({section:0,custom:true,enemies},character);
    for(let target=0;target<2;target++){
      fight.target=target;
      const count=fight.events.length;
      fight=step(fight,{},()=>1);
      const events=fight.events.slice(count).filter(event=>event.kind==='attack'&&event.direction==='enemy');
      assert.ok(events.length,'The regression must exercise enemy combat logs');
      assert.equal(events[0].enemyDisplayName,enemies[target].displayName);
      assert.equal(fight.enemies[target].name,'same-preset','Keep stable rule identities');
    }
    assert.deepEqual(character,before);
  }
});
