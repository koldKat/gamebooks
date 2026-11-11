import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNodeShapeRenderer} from '../../../public/js/graph/node-shapes.js';

test('custom shapes retain outline color, screen width, dashes and native label bounds', () => {
  const calls = [];
  const ctx = {
    beginPath() {}, roundRect() { calls.push('rounded'); },
    moveTo() { calls.push('octagon'); }, lineTo() {}, closePath() {},
    fill() {}, stroke() { calls.push(['stroke', this.strokeStyle, this.lineWidth]); },
    getTransform: () => ({a:2, b:0}), setLineDash: d => calls.push(['dashes',d]),
  };
  const shape = {
    labelModule: { size:{height:12}, calculateLabelSize() { calls.push('measure-label'); },
      draw() { calls.push('draw-label'); } },
    updateBoundingBox: (x,y) => calls.push(['bounds',x,y]),
  };
  let choice;
  const render = createNodeShapeRenderer(() => shape, () => choice);
  for (choice of ['roundedSquare','octagon','trapezoid']) {
    const drawing = render({ctx,id:1,x:20,y:30,label:'1',state:{selected:false,hover:false},
      style:{size:14,color:'#334155',borderColor:'#f97316',borderWidth:4,borderDashes:[4,3]}});
    assert.deepEqual(drawing.nodeDimensions,{width:28,height:28});
    drawing.drawNode();drawing.drawExternalLabel();
  }
  assert.ok(calls.includes('rounded') && calls.includes('octagon'));
  assert.equal(calls.filter(c=>Array.isArray(c)&&c[0]==='stroke'&&c[1]==='#f97316'&&c[2]===2).length,3);
  assert.equal(calls.filter(c=>c==='draw-label').length,3);
  assert.equal(calls.filter(c=>Array.isArray(c)&&c[0]==='bounds').length,3);
  assert.deepEqual(calls.find(c=>Array.isArray(c)&&c[0]==='dashes')[1],[4,3]);
});
