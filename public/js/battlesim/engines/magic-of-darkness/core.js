export function strikeDamage(unarmed) {
  return unarmed ? 1 : 2;
}

export function drawNumber(random = Math.random) {
  return Math.floor(random() * 12) + 1;
}
