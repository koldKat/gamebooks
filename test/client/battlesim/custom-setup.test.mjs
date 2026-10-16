import {test} from 'node:test';
import assert from 'node:assert/strict';
import {savedOpponentSelection} from '../../../public/js/battlesim/custom-setup.js';

test('restoring a later printed fight does not select an older custom draft',()=>{
  for(const fight of [{config:{section:12}},{spec:{section:12}},{spec:{id:12}},
    {encounter:{section:12}},{section:12}]){
    assert.equal(savedOpponentSelection({fight,customOpponentSetup:{section:'0'}},'sim1','encounter'),12);
  }
  assert.equal(savedOpponentSelection({prepared:{encounter:{section:34}},customOpponentSetup:{section:'0'}},'sim1','encounter'),34);
});

test('explicit setup choices and custom-only setups remain authoritative',()=>{
  assert.equal(savedOpponentSelection({setup:{context:'0'},fight:{config:{section:12}}},'sim1','context'),'0');
  assert.equal(savedOpponentSelection({setup:{'sim1-context':24}},'sim1','context'),24);
  assert.equal(savedOpponentSelection({customOpponentSetup:{section:'0'}},'sim1','encounter'),'0');
  assert.equal(savedOpponentSelection(null,'sim1','encounter'),'0');
});
