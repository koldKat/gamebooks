// Build crisp SVG pixel artwork from a supplied palette and grid.
const palette = {
  O: '#27242f', E: '#938493', B: '#403344', b: '#766078',
  R: '#9b3749', r: '#e47761', W: '#e1d8ba',
  H: '#6c4e39', h: '#a58459', P: '#382925', Y: '#d8ad69',
  Z: '#7c9566', z: '#a0ae7c', g: '#4b6048', G: '#434b54',
  T: '#c8bb9c', t: '#8e826a', V: '#c8c5c5', v: '#85818f',
  C: '#642f46', c: '#995267', N: '#15151e',
  F: '#ffffff', f: '#b6bfce', A: '#df862b', a: '#994a24', L: '#f1b14b',
};

export function pixelSprite(kind, rows, pixelSize = 2, colors = palette) {
  let svg = '<g shape-rendering="crispEdges">';
  rows.forEach((row, y) => {
    // Merge horizontal runs while keeping every edge on the sprite's pixel grid.
    for (let x = 0; x < row.length;) {
      const color = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === color) end++;
      if (color !== '.') svg += `<rect x="${x * pixelSize}" y="${y * pixelSize}" width="${(end - x) * pixelSize}" height="${pixelSize}" fill="${colors[color]}"/>`;
      x = end;
    }
  });
  svg += '</g>';
  const maskImage = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' + svg + '</svg>')}")`;
  return { kind, pixelated: true, pixelSize, svg, maskImage };
}
