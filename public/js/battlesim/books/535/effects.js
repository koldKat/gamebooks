// Book-specific spells, items and recovery; UI and persistence callbacks are injected.
export function createEffects(getContext) {
// BEGIN EXTRACTED RULES
function cast(side) {
  const { append, castCryptsEnemySpell, castCryptsPlayerSpell, createCryptsMagicSection, currentPlaythrough, data, el, rollCryptsCharacter, showAlert, store, target, tk } = getContext();

  const d=data(),f=d?.fight;if (!f||!d.magic) return;
  const spell=el('spell').value;
  const result=side==='enemy'?castCryptsEnemySpell(f,target(),spell):castCryptsPlayerSpell(f,d.magic,spell,{
    target:target(),useLife:el('useLife').checked,destination:el('destination').value.trim(),
    cryptStart:Number(el('cryptStart').value),visited:currentPlaythrough()?.path??[],
  });
  if (!result.error) {
    append(d,tk('spell_log',{spell:tk(`spell.${spell}`),side:tk(side),cost:result.cost,result:tk(result.success?'success':'failure')}));
    if (result.manualEffect) append(d,tk('manual_effect'));
    if (result.destination!=null) append(d,tk('destination_log',{section:result.destination}));
    if (result.rerollCharacter&&side==='player') {
      const used=d.magic.used.slice(),inclination=d.magic.inclination;
      Object.assign(f.player,rollCryptsCharacter());
      f.pending=f.outcome=null;f.recorded=f.skillAwarded=false;f.turn=null;
      f.round=f.attacks=f.enemyTurns=f.rest=f.paralysedPlayerRounds=f.playerDamage=f.ratHits=0;
      f.enemyDamage.fill(0);f.openingStrikes=[];
      d.magic=createCryptsMagicSection(f.encounter.section,f.player,f.enemies);
      // Returning to the same section preserves its spell restrictions.
      d.magic.used=used;d.magic.inclination=inclination;
    }
  } else showAlert(tk(`error.${result.error}`));
  store(d);
}
// END EXTRACTED RULES
  return { cast };
}
