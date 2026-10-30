import test from 'node:test';
import assert from 'node:assert/strict';
import { setSeasonPreviewUser, setSeasonPreview, seasonPreview, applySeasonPreviewPreference } from '../../../public/js/seasonal-events/preview.js';

test('preview belongs only to the verified admin account and current session', () => {
  const values = new Map([['gamebook_auth_token','session-a']]);
  globalThis.localStorage = { getItem:key=>values.get(key)??null, setItem:(key,value)=>values.set(key,value), removeItem:key=>values.delete(key) };
  globalThis.window = new EventTarget();
  try {
    setSeasonPreviewUser({id:1,isAdmin:true}); setSeasonPreview('diwali');
    assert.equal(seasonPreview(),'diwali');
    setSeasonPreviewUser({id:2,isAdmin:true}); assert.equal(seasonPreview(),null);
    setSeasonPreviewUser({id:1,isAdmin:false}); assert.equal(seasonPreview(),null);
    assert.throws(()=>setSeasonPreview('halloween'),/administrator/);
    setSeasonPreviewUser({id:1,isAdmin:true}); assert.equal(seasonPreview(),'diwali');
    values.set('gamebook_auth_token','session-b'); assert.equal(seasonPreview(),null);
    setSeasonPreviewUser({id:1,isAdmin:true}); setSeasonPreview('off'); assert.equal(seasonPreview(),'off');
    setSeasonPreview(null); assert.equal(seasonPreview(),null);
    setSeasonPreviewUser(null); assert.equal(seasonPreview(),null);
    applySeasonPreviewPreference('diwali'); // Prefs arrived before verified profile.
    setSeasonPreviewUser({id:1,isAdmin:true});assert.equal(seasonPreview(),'diwali');
    applySeasonPreviewPreference('automatic');assert.equal(seasonPreview(),null);
    applySeasonPreviewPreference('halloween');values.set('gamebook_auth_token','session-c');
    setSeasonPreviewUser({id:2,isAdmin:true});assert.equal(seasonPreview(),null,'late prefs from another session ignored');
  } finally { delete globalThis.localStorage; delete globalThis.window; }
});
