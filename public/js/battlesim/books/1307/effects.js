// Apply Mochila's optional out-of-combat psychic healing without mutating saved inputs.
export function psychicHeal(player, fight) {
  if (fight?.status === 'fighting' || !player.psychicHealing
      || !Number.isSafeInteger(player.powers) || player.powers < 1
      || !Number.isSafeInteger(player.hpInitial) || player.hpInitial < 1 || player.hpInitial > 1000000
      || !Number.isSafeInteger(player.hp) || player.hp < 0 || player.hp >= player.hpInitial) {
    throw new RangeError('Psychic healing unavailable');
  }
  return {...player, powers:player.powers - 1, hp:Math.min(player.hpInitial, player.hp + 2)};
}
