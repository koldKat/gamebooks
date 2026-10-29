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
  assert.ok(points.length>=6&&points.length<=12);
  assert.ok(points.some(p=>p.x<960)&&points.some(p=>p.x>960));
  assert.ok(new Set(points.map(p=>p.size)).size>=4);
  for (const point of points) {
    for (const panel of panels) assert.ok(point.x <= panel.left-44 || point.x >= panel.right+44
      || point.y <= panel.top-44 || point.y >= panel.bottom+44);
    for (const other of points) if (other !== point) assert.ok(Math.hypot(point.x-other.x,point.y-other.y)>=155);
  }
});

test('no decoration is squeezed into a narrow or fully occupied viewport', () => {
  assert.deepEqual(seasonalGapPositions(900,700,[{left:0,right:440,top:0,bottom:700},
    {left:480,right:900,top:0,bottom:700}]),[]);
  assert.deepEqual(seasonalGapPositions(390,700,[{left:0,right:390,top:0,bottom:700}]),[]);
});
