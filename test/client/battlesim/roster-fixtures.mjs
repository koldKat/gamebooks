import { readFileSync } from 'node:fs';
export async function loadFixtureRoster(bookId) {
  const seed=JSON.parse(readFileSync(new URL(`../../../data/simulator-rosters/${bookId}.json`,import.meta.url),'utf8'));
  const {loadRoster}=await import(`../../../public/js/battlesim/books/${bookId}/definition.js`);
  await loadRoster(async path=>{
    if(path!==`/api/books/${bookId}/enemies`)throw new Error('Unexpected roster request');
    return {ok:true,json:async()=>seed.enemies};
  });
}
