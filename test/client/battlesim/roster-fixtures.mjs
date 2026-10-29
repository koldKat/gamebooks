import { readRosterDocument } from '../../helpers/roster-db.cjs';
import { readFileSync } from 'node:fs';
export async function loadFixtureRoster(bookId) {
  const seed=readRosterDocument(bookId);
  const {loadRoster}=await import(`../../../public/js/battlesim/books/${bookId}/definition.js`);
  await loadRoster(async path=>{
    if(path!==`/api/books/${bookId}/enemies`)throw new Error('Unexpected roster request');
    return {ok:true,json:async()=>seed.enemies};
  });
}
