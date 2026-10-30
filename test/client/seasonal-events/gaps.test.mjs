import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonalGapPositions } from '../../../public/js/seasonal-events/gaps.js';

test('seasonal icons are sparse, separated and clear of the panels', () => {
  const panels = [
    {left:0,right:280,top:0,bottom:1000},
    {left:600,right:1320,top:0,bottom:1000},
    {left:1640,right:1920,top:0,bottom:1000},
  ];
  const points = seasonalGapPositions(1920,1000,panels);
  assert.equal(points.length,14);
  assert.equal(points.filter(p=>p.region===0).length,7);
  assert.equal(points.filter(p=>p.region===1).length,7);
  assert.ok(points.some(p=>p.x<960)&&points.some(p=>p.x>960));
  assert.ok(new Set(points.map(p=>p.size)).size>=4);
  for (const point of points) {
    const radius=point.size*.71+point.padding;
    for (const panel of panels) assert.ok(point.x <= panel.left-radius || point.x >= panel.right+radius
      || point.y <= panel.top-radius || point.y >= panel.bottom+radius);
    for (const other of points) if (other !== point) assert.ok(Math.hypot(point.x-other.x,point.y-other.y)
      >=(point.size+other.size)*.71+24);
  }
});

test('small icons fit real narrow gaps, but never an occupied viewport', () => {
  const points=seasonalGapPositions(900,700,[{left:0,right:440,top:0,bottom:700},
    {left:480,right:900,top:0,bottom:700}]);
  assert.ok(points.length>0);
  assert.ok(points.every(point=>point.size>=14&&point.size<=22));
  const tiny=seasonalGapPositions(1280,900,[{left:0,right:240,top:0,bottom:900},
    {left:264,right:1016,top:0,bottom:900},{left:1040,right:1280,top:0,bottom:900}]);
  assert.ok(tiny.length>0&&tiny.every(point=>point.size===14),'icons fit 24px feed gutters');
  assert.deepEqual(seasonalGapPositions(390,700,[{left:0,right:390,top:0,bottom:700}]),[]);
});
