// Keep a sparse, varied scatter in roomy gaps, balanced across both sides.
export function seasonalGapPositions(width, height, panels, { random = Math.random } = {}) {
  const target = Math.min(12, Math.max(3, Math.round(width * height / 210000)));
  const candidates = [];
  const xs = [], ys = [];
  for (let x = 24; x < width - 20; x += 40) xs.push(x + (random() - .5) * 24);
  for (let y = 32; y < height - 24; y += 48) ys.push(y + (random() - .5) * 24);
  // Include the actual centers of narrow gutters; a regular grid can miss them.
  for (const [extent, start, end, values] of [[width,'left','right',xs],[height,'top','bottom',ys]]) {
    const edges = [...new Set([0, extent, ...panels.flatMap(rect => [rect[start], rect[end]])])]
      .filter(value => value >= 0 && value <= extent).sort((a,b) => a-b);
    for (let i = 1; i < edges.length; i++) if (edges[i] - edges[i-1] >= 20) values.push((edges[i]+edges[i-1])/2);
  }
  for (const y of ys) {
    for (const x of xs) {
      if (panels.some(rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) continue;
      const room = Math.min(x,width-x,y,height-y,...panels.map(rect =>
        Math.hypot(Math.max(rect.left-x,0,x-rect.right),Math.max(rect.top-y,0,y-rect.bottom))));
      const band = panels.filter(rect => y >= rect.top && y <= rect.bottom);
      const left = Math.max(0,...band.filter(rect => rect.right <= x).map(rect => rect.right));
      const right = Math.min(width,...band.filter(rect => rect.left >= x).map(rect => rect.left));
      const narrow = right-left <= 100;
      const padding = narrow ? (right-left < 36 ? 2 : 4) : 14, minimum = narrow ? 14 : 28;
      const maxSize = Math.min(94,Math.floor((room-padding)*2/1.42));
      if (maxSize >= minimum) candidates.push({x,y,maxSize,minimum,padding,narrow});
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const chosen = [];
  const separated = point => chosen.every(other => Math.hypot(point.x - other.x, point.y - other.y)
    >= (point.narrow && other.narrow ? 110 : 155));
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
    size: Math.max(point.minimum,Math.min([38,76,50,88,44,64,54,82,46,68,58,90][index]
      + Math.round(random()*4),Math.floor(point.maxSize*(point.narrow ? .82+random()*.18 : 1)))),
    angle: point.angle ?? Math.round(random() * 28 - 14),
  }));
}
