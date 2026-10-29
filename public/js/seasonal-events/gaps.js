// Find a few roomy positions outside the landing panels and their controls.
export function seasonalGapPositions(width, height, panels) {
  const candidates = [];
  const clearance = 44;
  for (let y = 64; y < height - 64; y += 64) {
    for (let x = 64; x < width - 64; x += 64) {
      if (panels.some(rect => x > rect.left - clearance && x < rect.right + clearance
        && y > rect.top - clearance && y < rect.bottom + clearance)) continue;
      const room = Math.min(x, width - x, y, height - y,
        ...panels.map(rect => Math.hypot(Math.max(rect.left - x, 0, x - rect.right),
          Math.max(rect.top - y, 0, y - rect.bottom))));
      candidates.push({ x, y, room });
    }
  }
  candidates.sort((a, b) => b.room - a.room);
  const chosen = [];
  for (const point of candidates) {
    if (chosen.every(other => Math.hypot(point.x - other.x, point.y - other.y) >= 280)) chosen.push(point);
    if (chosen.length === 3) break;
  }
  return chosen;
}
