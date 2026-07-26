const { Resvg } = require('/tmp/svgcheck/node_modules/@resvg/resvg-js');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const db = new Database(path.join(__dirname, 'database.sqlite'));

function renderGrid(ids, outName, cols=8) {
  const items = ids.map(id => db.prepare('SELECT id, name, svg_data FROM items WHERE id=?').get(id));
  const cell = 90;
  const rows = Math.ceil(items.length/cols);
  let svgs = '';
  items.forEach((it, i) => {
    const x = (i % cols) * cell;
    const y = Math.floor(i/cols) * cell;
    const vbMatch = it.svg_data.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
    const vbW = vbMatch ? parseFloat(vbMatch[1]) : 500;
    const vbH = vbMatch ? parseFloat(vbMatch[2]) : 500;
    const scale = (cell-22) / Math.max(vbW, vbH);
    let inner = it.svg_data.replace(/<\?xml[^>]*>/,'').replace(/<svg[^>]*>/,'').replace(/<\/svg>/,'');
    svgs += `<g fill="#ffffff" transform="translate(${x+11},${y+5}) scale(${scale})">${inner}</g>`;
    svgs += `<text x="${x+4}" y="${y+cell-5}" font-size="11" fill="#0f0">${it.id}</text>`;
  });
  const W = cols*cell, H = rows*cell;
  const full = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#222"/>${svgs}</svg>`;
  const r = new Resvg(full, { background: '#222' });
  fs.writeFileSync('/tmp/svgcheck/' + outName, r.render().asPng());
  console.log('wrote', outName, 'with', items.length, 'items:', items.map(i=>i.id).join(','));
}

const args = process.argv.slice(2);
const outName = args[0];
const ids = args[1].split(',').map(Number);
const cols = args[2] ? Number(args[2]) : 8;
renderGrid(ids, outName, cols);
db.close();
