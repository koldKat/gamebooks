import test from 'node:test';
import assert from 'node:assert/strict';
import {seasonalThemes} from '../../../public/js/seasonal-events/themes.js';
import {santaCursorSvg} from '../../../public/js/seasonal-events/santa-artwork.js';
import {diyaCursorSvg} from '../../../public/js/seasonal-events/diya-artwork.js';
import {cursorDesigns} from '../../../public/js/seasonal-events/cursor-designs.js';

test('every seasonal theme contains only its mouse companion',()=>{
 assert.deepEqual(Object.keys(seasonalThemes),['halloween','diwali','christmas','new-year']);
 for(const theme of Object.values(seasonalThemes)){
  assert.equal(typeof theme.cursor,'function');assert.deepEqual(Object.keys(theme),['cursor']);
 }
});
test('each event has three distinct companions with three occasional actions each',()=>{
 const ids=new Set();
 for(const designs of Object.values(cursorDesigns)){
  assert.equal(designs.length,3);
  for(const design of designs){assert.ok(!ids.has(design.id));ids.add(design.id);assert.equal(design.actions.length,3);assert.equal(typeof design.create,'function');}
 }
 assert.equal(ids.size,12);
});
test('Santa and the diya use smooth artwork with their existing animation hooks',()=>{
 for(const svg of [santaCursorSvg,diyaCursorSvg]){assert.doesNotMatch(svg,/crispEdges/);assert.match(svg,/<path/);}
 for(const hook of ['eyes','pupils','mouth','ho','bell','gift'])assert.ok(santaCursorSvg.includes('seasonal-santa__'+hook));
 for(const hook of ['fire','flame','embers','smoke'])assert.ok(diyaCursorSvg.includes('seasonal-diya__'+hook));
 assert.match(santaCursorSvg,/<ellipse/);assert.match(diyaCursorSvg,/<ellipse/);
});
