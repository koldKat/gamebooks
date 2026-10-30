import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonalWebPositions } from '../../../public/js/seasonal-events/web-layout.js';

const columns = [{left:0,right:384,top:0,bottom:900},
  {left:700,right:1348,top:0,bottom:900},{left:1664,right:2048,top:0,bottom:900}];
test('two modest webs join panel sides to opposite screen edges without covering panels', () => {
  for (const n of [0,.1,.3,.5,.75,.99]) {
    const webs=seasonalWebPositions(2048,900,columns,{random:()=>n});
    assert.equal(webs.length,2);assert.notEqual(webs[0].edge,webs[1].edge);assert.notEqual(webs[0].gap,webs[1].gap);
    for(const web of webs){
      assert.ok(web.size>=72&&web.size<=128);
      assert.ok(web.top===0||web.top+web.size===900);
      assert.ok(columns.some(panel=>panel.left===web.anchorX||panel.right===web.anchorX));
      assert.equal(web.flipX===1?web.left:web.left+web.size,web.anchorX);
      for(const panel of columns)assert.ok(web.left>=panel.right||web.left+web.size<=panel.left);
    }
  }
});
test('a single roomy gutter can hold one web at each end, while tight gutters stay clear',()=>{
  assert.equal(seasonalWebPositions(600,900,[{left:0,right:200,top:0,bottom:900},{left:400,right:600,top:0,bottom:900}],{random:()=>0}).length,2);
  assert.deepEqual(seasonalWebPositions(1280,900,[{left:0,right:240,top:0,bottom:900},{left:264,right:1016,top:0,bottom:900},{left:1040,right:1280,top:0,bottom:900}]),[]);
  assert.deepEqual(seasonalWebPositions(1280,900,[]),[]);
});
test('the same page seed restores the same corner anchors after panel changes',()=>{
  const seeded=()=>{let n=42;return()=>((n=(1664525*n+1013904223)>>>0)/4294967296);};
  const first=seasonalWebPositions(2048,900,columns,{random:seeded()});
  const collapsed=seasonalWebPositions(2048,900,columns.slice(1),{random:seeded()});
  assert.notDeepEqual(collapsed,first);
  assert.deepEqual(seasonalWebPositions(2048,900,columns,{random:seeded()}),first);
});
