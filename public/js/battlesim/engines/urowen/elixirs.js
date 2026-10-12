export const UROWEN_ELIXIRS = Object.freeze(['balkian','smallBalkian','mysticShield','poison']);

export function drinkUrowenElixir(state,kind) {
  const fight=state.fight;
  if(!UROWEN_ELIXIRS.includes(kind)||!fight||fight.rules.items===false||kind==='poison'&&fight.rules.weapons===false||fight.player.life<=0||
    (kind==='smallBalkian'?fight.status!=='fighting':fight.status!=='prepared'||fight.openingDone)) {
    throw new RangeError('Elixir unavailable');
  }
  const quantity=state.character.elixirs?.[kind]??0;
  if(!Number.isSafeInteger(quantity)||quantity<1)throw new RangeError('No elixir remaining');
  const bonus=kind==='balkian'?'elixirAttackBonus':kind==='smallBalkian'?'nextElixirAttackBonus':kind==='poison'?'poisonCoating':'elixirArmorBonus';
  if(fight[bonus])throw new RangeError('Elixir already active');
  const next=structuredClone(state);
  next.character.elixirs[kind]--;
  next.fight[bonus]=kind==='poison'?true:2;
  return next;
}
