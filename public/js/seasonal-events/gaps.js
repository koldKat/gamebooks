// Keep a sparse, varied scatter in roomy gaps, balanced across both sides.
export function seasonalGapPositions(width, height, panels, { random = Math.random, previous = [] } = {}) {
  const clearance = 76;
  const target = Math.min(12, Math.max(3, Math.round(width * height / 210000)));
  const clear = point => point.x >= clearance && point.x <= width - clearance
    && point.y >= clearance && point.y <= height - clearance
    && !panels.some(rect => point.x > rect.left - clearance && point.x < rect.right + clearance
      && point.y > rect.top - clearance && point.y < rect.bottom + clearance);
  const candidates = [];
  for (let y = 72; y < height - 56; y += 64) {
    for (let x = 72; x < width - 56; x += 64) {
      const point = { x: x + (random() - .5) * 40, y: y + (random() - .5) * 40 };
      if (clear(point)) candidates.push(point);
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const chosen = [];
  const separated = point => chosen.every(other => Math.hypot(point.x - other.x, point.y - other.y) >= 155);
  for (const point of previous) if (clear(point) && separated(point) && chosen.length < target) chosen.push(point);
  for (const side of [point => point.x < width / 2, point => point.x >= width / 2]) {
    if (chosen.some(side)) continue;
    const point = candidates.find(candidate => side(candidate) && separated(candidate));
    if (point) { if (chosen.length === target) chosen.pop(); chosen.push(point); }
  }
  for (const point of candidates) {
    if (chosen.length === target) break;
    const leftCount = chosen.filter(point => point.x < width / 2).length;
    const preferLeft = leftCount <= chosen.length - leftCount;
    const balanced = candidates.find(candidate => (candidate.x < width / 2) === preferLeft && separated(candidate));
    if (balanced) chosen.push(balanced);
    else if (separated(point)) chosen.push(point);
  }
  return chosen.map((point, index) => ({ ...point,
    size: point.size ?? [38, 76, 50, 88, 44, 64, 54, 82, 46, 68, 58, 90][index] + Math.round(random() * 4),
    angle: point.angle ?? Math.round(random() * 28 - 14),
  }));
}
