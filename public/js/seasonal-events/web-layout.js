// Anchor up to two corner webs between panel edges and the viewport edges.
export function seasonalWebPositions(width, height, panels, { random = Math.random } = {}) {
  const columns = panels.filter(rect => rect.top <= 0 && rect.bottom >= height)
    .sort((a, b) => a.left - b.left);
  if (!columns.length) return [];
  const gaps = [];
  let edge = 0;
  for (const column of columns) {
    if (column.left > edge) gaps.push({ left: edge, right: Math.min(width, column.left) });
    edge = Math.max(edge, column.right);
  }
  if (edge < width) gaps.push({ left: Math.max(0, edge), right: width });
  const corners = [];
  for (const [gap, { left, right }] of gaps.entries()) {
    const size = Math.floor(Math.min(128, right - left - 12, height * .24));
    if (size < 72) continue;
    for (const [x, flipX] of [[left, 1], [right, -1]]) {
      // At least one silk edge must touch a real panel, not just a screen corner.
      if ((flipX === 1 && left <= 0) || (flipX === -1 && right >= width)) continue;
      for (const flipY of [1, -1]) {
        corners.push({ left: flipX === 1 ? x : x - size, top: flipY === 1 ? 0 : height - size,
          size, flipX, flipY, gap, edge: flipY === 1 ? 'top' : 'bottom', anchorX: x });
      }
    }
  }
  if (!corners.length) return [];
  const pick = items => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  const first = pick(corners);
  const opposite = corners.filter(corner => corner.edge !== first.edge);
  const differentGap = opposite.filter(corner => corner.gap !== first.gap);
  const second = pick(differentGap.length ? differentGap : opposite);
  return second ? [first, second] : [first];
}
