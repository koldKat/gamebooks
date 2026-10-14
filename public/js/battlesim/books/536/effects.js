// Book-specific spells, items and recovery; UI and persistence callbacks are injected.
export function createEffects(getContext) {
// BEGIN EXTRACTED RULES
function cast(enemy=false) {
  const { castDemondoomEnemySpell, castDemondoomPlayerSpell, currentPlaythrough, data, el, number, result, target } = getContext();

  const d=data(),fight=d?.fight;if(!fight)return;
  const value=enemy?castDemondoomEnemySpell(fight,el('enemy_spell').value,target()):castDemondoomPlayerSpell(fight,el('spell').value,{
    target:target(),manualCost:number('manual_cost'),destination:el('destination').value.trim(),visited:currentPlaythrough()?.path??[],
  });
  result(d,value);
}
// END EXTRACTED RULES
  return { cast };
}
