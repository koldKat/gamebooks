import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {seasonalThemes} from '../../../public/js/seasonal-events/themes.js';
import {santaCursorSvg} from '../../../public/js/seasonal-events/santa-artwork.js';
import {diyaCursorSvg} from '../../../public/js/seasonal-events/diya-artwork.js';

test('every seasonal theme contains only its mouse companion',()=>{
 assert.deepEqual(Object.keys(seasonalThemes),['halloween','diwali','christmas','new-year']);
 for(const theme of Object.values(seasonalThemes)){
  assert.equal(typeof theme.cursor,'function');assert.deepEqual(Object.keys(theme),['cursor']);
 }
});
test('separating the mouse artwork preserves every existing SVG byte',()=>{
 const sha=value=>createHash('sha256').update(value).digest('hex');
 assert.equal(sha(santaCursorSvg),'2f39f00f425842e03b8ae51baccb3852c508a3c3631ea8566724ecadf4a6a27b');
 assert.equal(sha(diyaCursorSvg),'3081ac33d425cba3f127ec3b132f54819c75b71d8c7f4c8a181b94463435c51b');
});
