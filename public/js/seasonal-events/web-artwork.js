// Corner cobwebs with radial silk, scalloped rings and contrasting pixel spiders.
import { pixelSprite } from './pixel-art.js';

function cornerWeb(spiderColor, spokes, radii) {
  const pixels = Array.from({ length: 48 }, () => Array(48).fill('.'));
  const plot = (x, y, color = 'F') => {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && x < 48 && y >= 0 && y < 48) pixels[y][x] = color;
  };
  function line(x0, y0, x1, y1, color = 'F') {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= Math.ceil(steps); i++) {
      const t = Math.min(1, i / steps);
      plot(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, color);
    }
  }
  const point = (radius, angle) => [radius * Math.cos(angle), radius * Math.sin(angle)];
  const angles = Array.from({ length: spokes }, (_, i) => i * Math.PI / (2 * (spokes - 1)));
  for (const angle of angles) line(0, 0, ...point(47, angle));
  for (const radius of radii) {
    for (let i = 1; i < angles.length; i++) {
      const a = point(radius, angles[i - 1]), b = point(radius, angles[i]);
      const control = point(radius - Math.min(5, radius * .2), (angles[i - 1] + angles[i]) / 2);
      let previous = a;
      for (let step = 1; step <= 20; step++) {
        const t = step / 20, u = 1 - t;
        const next = [u*u*a[0]+2*u*t*control[0]+t*t*b[0], u*u*a[1]+2*u*t*control[1]+t*t*b[1]];
        line(...previous, ...next); previous = next;
      }
    }
  }
  // A short loose thread ends in a separate dark-legged, coloured spider.
  line(29, 12, 29, 25, 'f');
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      line(29 + side * 2, 27 + i, 29 + side * 5, 25 + i * 2, 'O');
      line(29 + side * 5, 25 + i * 2, 29 + side * 6, 26 + i * 2, 'O');
    }
  }
  for (let y = 26; y <= 32; y++) for (let x = 27; x <= 31; x++) {
    if ((y !== 26 && y !== 32) || (x >= 28 && x <= 30)) plot(x, y, spiderColor);
  }
  plot(28, 27, 'r'); plot(30, 27, 'r');
  return pixelSprite(4, pixels.map(row => row.join('')), 1);
}

export const halloweenWebs = [
  cornerWeb('R', 6, [9, 18, 27, 36, 45]),
  cornerWeb('Z', 5, [11, 22, 33, 45]),
];
