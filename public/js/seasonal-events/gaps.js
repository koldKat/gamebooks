// Keep a sparse, varied scatter in roomy gaps, balanced across both sides.
export function seasonalGapPositions(width, height, panels, { random = Math.random } = {}) {
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
  const columns = panels.filter(rect => rect.top <= 0 && rect.bottom >= height)
    .sort((a,b) => a.left-b.left);
  const regions = []; let edge = 0;
  for (const column of columns) {
    if (column.left-edge >= 20) regions.push({left:edge,right:column.left});
    edge = Math.max(edge,column.right);
  }
  if (width-edge >= 20) regions.push({left:edge,right:width});
  const chosen = [];
  const separated = point => chosen.every(other => Math.hypot(point.x - other.x, point.y - other.y)
    >= (point.size+other.size)*.71+24);
  const sizes = [38,76,50,88,44,64,54,82,46,68,58,90,48,72];
  for (const [regionIndex, region] of regions.entries()) {
    const pool = candidates.filter(point => point.x > region.left && point.x < region.right);
    for (let slot = 0; slot < 7; slot++) {
      const index = chosen.length;
      const preferred = sizes[index % sizes.length]+Math.round(random()*4);
      const x = region.left+(region.right-region.left)*(.2+random()*.6);
      const y = height*((slot+.5+(random()-.5)*.25)/7);
      const options = pool.map(point => ({...point,
        size:Math.max(point.minimum,Math.min(preferred,Math.floor(point.maxSize*(point.narrow ? .82+random()*.18 : 1)))),
      })).filter(separated).sort((a,b) => Math.abs(a.y-y)+Math.abs(a.x-x)*.35
        - Math.abs(b.y-y)-Math.abs(b.x-x)*.35);
      if (options[0]) chosen.push({...options[0],region:regionIndex,angle:Math.round(random()*28-14)});
    }
  }
  return chosen;
}
